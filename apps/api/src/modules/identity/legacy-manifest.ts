import { createHmac } from 'node:crypto';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { legacyBatches, legacyClaimCodes, legacyFamilies, legacyKids } from '@bidazoo/database/schema';
import type { Clock, Db } from '../../context';
import { recordAudit } from './audit';
import { hmacHex, newHumanCode, normalizeHumanCode, type IdentityKeys } from './crypto';
import { normalizeEmail } from './email';

/**
 * Offline Hop Quest -> BidaZoo legacy import boundary.
 *
 * BidaZoo never talks to Hop Quest. An operator exports a small manifest on the Hop Quest side
 * (that exporter is NOT part of this repository), copies the file over, and runs the loader CLI.
 * The manifest is a closed format: every object is strict, so a file that carries anything beyond
 * the fields below (PINs, hashes, cookies, tokens, passwords, coins, mastery, badges, streaks,
 * inventory, answer history, sessions, marketing state, names) is REJECTED whole, never trimmed.
 *
 * Manifest (version 1):
 *   {
 *     "version": 1,
 *     "exportedAt": "2026-10-01T00:00:00Z",          // optional ISO time
 *     "families": [
 *       {
 *         "legacyFamilyId": "hq-fam-123",            // opaque id, 1-64 of A-Z a-z 0-9 . _ : -
 *         "guardianEmail": "parent@example.com",     // TRANSIENT: used only to derive the match key
 *         "kids": [
 *           { "legacyKidId": "hq-kid-1", "username": "mia_k", "gradeBand": "3" }   // last two optional
 *         ]
 *       }
 *     ]
 *   }
 *
 * The guardian email is normalized exactly like BidaZoo guardian sign-in (`normalizeEmail`), keyed
 * with LEGACY_MATCH_PEPPER and discarded. Only the keyed value is stored; the plaintext never
 * reaches the database, an audit row, a log line or an error message (errors name a list position,
 * never a value).
 */

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const MAX_FAMILIES = 5000;
const MAX_KIDS_PER_FAMILY = 20;
const MATCH_DOMAIN = 'bidazoo-legacy-match-v1:';

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

/** The persistent match key: HMAC-SHA-256(pepper, domain + normalized email), lowercase hex. */
export function legacyMatchHmac(pepper: string, normalizedEmail: string): string {
  return createHmac('sha256', pepper).update(`${MATCH_DOMAIN}${normalizedEmail}`).digest('hex');
}

/** The match key for a raw address, or null when it is not a valid address. */
export function legacyMatchFor(pepper: string, rawEmail: string): string | null {
  const email = normalizeEmail(rawEmail);
  return email === null ? null : legacyMatchHmac(pepper, email);
}

export interface ParsedKid {
  legacyKidId: string;
  username: string | null;
  gradeBand: string | null;
}
export interface ParsedFamily {
  legacyFamilyId: string;
  matchHmac: string;
  kids: ParsedKid[];
}
export interface ParsedManifest {
  exportedAt: Date | null;
  families: ParsedFamily[];
}

function strictKeys(value: unknown, where: string, required: string[], optional: string[] = []): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ManifestError(`${where} must be an object`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    // The unexpected KEY is deliberately not echoed: it could itself be sensitive.
    if (!required.includes(key) && !optional.includes(key)) throw new ManifestError(`${where} has a field that is not allowed`);
  }
  for (const key of required) if (!(key in record)) throw new ManifestError(`${where} is missing a required field`);
  return record;
}

function label(value: unknown, where: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ManifestError(`${where} must be a string`);
  const cleaned = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length > max) throw new ManifestError(`${where} is too long`);
  return cleaned;
}

/** Validates a manifest and derives the match keys. Throws ManifestError; never returns a partial result. */
export function parseLegacyManifest(input: unknown, pepper: string): ParsedManifest {
  const root = strictKeys(input, 'manifest', ['version', 'families'], ['exportedAt']);
  if (root['version'] !== 1) throw new ManifestError('manifest version must be 1');
  let exportedAt: Date | null = null;
  if (root['exportedAt'] !== undefined) {
    const t = typeof root['exportedAt'] === 'string' ? new Date(root['exportedAt']) : null;
    if (!t || Number.isNaN(t.getTime())) throw new ManifestError('manifest exportedAt must be an ISO time');
    exportedAt = t;
  }
  const rows = root['families'];
  if (!Array.isArray(rows)) throw new ManifestError('manifest families must be a list');
  if (rows.length > MAX_FAMILIES) throw new ManifestError(`manifest has more than ${MAX_FAMILIES} families`);

  const families: ParsedFamily[] = [];
  const seenFamilies = new Set<string>();
  const seenKids = new Set<string>();
  const seenMatches = new Set<string>();
  rows.forEach((row, i) => {
    const where = `families[${i}]`;
    const f = strictKeys(row, where, ['legacyFamilyId', 'guardianEmail', 'kids']);
    const legacyFamilyId = f['legacyFamilyId'];
    if (typeof legacyFamilyId !== 'string' || !ID_PATTERN.test(legacyFamilyId)) throw new ManifestError(`${where}.legacyFamilyId is not a valid id`);
    if (seenFamilies.has(legacyFamilyId)) throw new ManifestError(`${where}.legacyFamilyId is a duplicate within the manifest`);
    seenFamilies.add(legacyFamilyId);
    const matchHmac = typeof f['guardianEmail'] === 'string' ? legacyMatchFor(pepper, f['guardianEmail']) : null;
    if (matchHmac === null) throw new ManifestError(`${where}.guardianEmail is not a valid email address`);
    if (seenMatches.has(matchHmac)) throw new ManifestError(`${where} shares a guardian email with another family in the manifest`);
    seenMatches.add(matchHmac);
    const kidRows = f['kids'];
    if (!Array.isArray(kidRows)) throw new ManifestError(`${where}.kids must be a list`);
    if (kidRows.length > MAX_KIDS_PER_FAMILY) throw new ManifestError(`${where}.kids has more than ${MAX_KIDS_PER_FAMILY} entries`);
    const kids = kidRows.map((kid, j): ParsedKid => {
      const kw = `${where}.kids[${j}]`;
      const k = strictKeys(kid, kw, ['legacyKidId'], ['username', 'gradeBand']);
      const legacyKidId = k['legacyKidId'];
      if (typeof legacyKidId !== 'string' || !ID_PATTERN.test(legacyKidId)) throw new ManifestError(`${kw}.legacyKidId is not a valid id`);
      if (seenKids.has(legacyKidId)) throw new ManifestError(`${kw}.legacyKidId is a duplicate within the manifest`);
      seenKids.add(legacyKidId);
      return { legacyKidId, username: label(k['username'], `${kw}.username`, 40), gradeBand: label(k['gradeBand'], `${kw}.gradeBand`, 16) };
    });
    families.push({ legacyFamilyId, matchHmac, kids });
  });
  return { exportedAt, families };
}

export interface LoadSummary {
  batchId: string;
  families: number;
  kids: number;
  insertedFamilies: number;
  insertedKids: number;
  /** Already present with the same match key (unclaimed or claimed). Left exactly as they were. */
  unchangedFamilies: number;
}

/**
 * Loads a manifest in ONE transaction: any problem (malformed manifest, a legacy family whose match
 * key differs from the one already stored, a match key or kid id owned by a different legacy
 * family) rolls the whole load back and nothing is written.
 *
 * Re-loading the same export is safe: an existing family with the same match key is left untouched
 * (a claimed one is never modified), and only kids not yet present are added.
 */
export async function loadLegacyManifest(
  db: Db,
  clock: Clock,
  pepper: string,
  input: unknown,
  options: { loadedBy?: string } = {},
): Promise<LoadSummary> {
  const manifest = parseLegacyManifest(input, pepper);
  const now = clock.now();
  const kidCount = manifest.families.reduce((n, f) => n + f.kids.length, 0);
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(legacyBatches)
      .values({
        exportedAt: manifest.exportedAt,
        loadedAt: now,
        loadedBy: label(options.loadedBy, 'loadedBy', 40),
        familyCount: manifest.families.length,
        kidCount,
      })
      .returning({ id: legacyBatches.id });
    if (!batch) throw new Error('batch insert returned no row');

    let insertedFamilies = 0;
    let insertedKids = 0;
    let unchangedFamilies = 0;
    for (const [i, family] of manifest.families.entries()) {
      const [existing] = await tx
        .select()
        .from(legacyFamilies)
        .where(and(eq(legacyFamilies.legacyFamilyId, family.legacyFamilyId), ne(legacyFamilies.status, 'withdrawn')));
      let rowId: string;
      if (existing) {
        if (existing.emailMatchHmac !== family.matchHmac) {
          throw new ManifestError(`families[${i}] is already loaded with a different guardian email; use an operator claim code instead`);
        }
        rowId = existing.id;
        unchangedFamilies += 1;
      } else {
        const [taken] = await tx
          .select({ id: legacyFamilies.id })
          .from(legacyFamilies)
          .where(and(eq(legacyFamilies.emailMatchHmac, family.matchHmac), ne(legacyFamilies.status, 'withdrawn')));
        if (taken) throw new ManifestError(`families[${i}] shares a guardian email with a different legacy family already loaded`);
        const [row] = await tx
          .insert(legacyFamilies)
          .values({ batchId: batch.id, legacyFamilyId: family.legacyFamilyId, emailMatchHmac: family.matchHmac, createdAt: now })
          .returning({ id: legacyFamilies.id });
        if (!row) throw new Error('legacy family insert returned no row');
        rowId = row.id;
        insertedFamilies += 1;
      }
      for (const kid of family.kids) {
        const [present] = await tx
          .select({ rowId: legacyKids.legacyFamilyRowId })
          .from(legacyKids)
          .where(eq(legacyKids.legacyKidId, kid.legacyKidId));
        if (present) {
          if (present.rowId !== rowId) throw new ManifestError(`families[${i}] contains a kid id that belongs to a different legacy family`);
          continue;
        }
        await tx.insert(legacyKids).values({
          legacyFamilyRowId: rowId,
          legacyKidId: kid.legacyKidId,
          legacyUsername: kid.username,
          gradeBand: kid.gradeBand,
        });
        insertedKids += 1;
      }
    }
    await recordAudit(tx, clock, {
      actorType: 'operator', action: 'legacy.batch_loaded', subjectType: 'legacy_batch', subjectId: batch.id,
      meta: { count: manifest.families.length, kidCount },
    });
    return { batchId: batch.id, families: manifest.families.length, kids: kidCount, insertedFamilies, insertedKids, unchangedFamilies };
  });
}

// ---------------------------------------------------------------------------
// Operator claim codes
// ---------------------------------------------------------------------------

/** Stored form of a claim code: a keyed hash in its OWN namespace, so it can never equal a device-code hash. */
export function hashLegacyClaimCode(keys: IdentityKeys, input: string): string {
  return hmacHex(keys.code, `legacy-claim:v1:${normalizeHumanCode(input)}`);
}

/**
 * Issues a one-time claim code for ONE legacy family (operator CLI only; there is no HTTP route).
 * Returns the raw code once. It authorizes that family's claim by a signed-in guardian and
 * nothing else: it is not a login, session or recovery credential.
 */
export async function issueLegacyClaimCode(
  db: Db,
  clock: Clock,
  keys: IdentityKeys,
  input: { legacyFamilyId: string; days: number; issuedBy?: string },
): Promise<{ code: string; expiresAt: Date }> {
  if (!ID_PATTERN.test(input.legacyFamilyId)) throw new ManifestError('legacy family id is not valid');
  if (!Number.isFinite(input.days) || input.days < 1 || input.days > 30) throw new ManifestError('days must be between 1 and 30');
  const now = clock.now();
  const expiresAt = new Date(now.getTime() + input.days * 86_400_000);
  const code = newHumanCode(60);
  await db.transaction(async (tx) => {
    const [family] = await tx
      .select({ id: legacyFamilies.id, status: legacyFamilies.status })
      .from(legacyFamilies)
      .where(and(eq(legacyFamilies.legacyFamilyId, input.legacyFamilyId), ne(legacyFamilies.status, 'withdrawn')))
      .for('share');
    if (!family) throw new ManifestError('no such legacy family');
    if (family.status !== 'unclaimed') throw new ManifestError('that legacy family is already claimed');
    const [row] = await tx
      .insert(legacyClaimCodes)
      .values({
        codeHash: hashLegacyClaimCode(keys, code),
        legacyFamilyRowId: family.id,
        issuedBy: label(input.issuedBy, 'issuedBy', 40),
        createdAt: now,
        expiresAt,
      })
      .returning({ id: legacyClaimCodes.id });
    if (!row) throw new Error('claim code insert returned no row');
    await recordAudit(tx, clock, { actorType: 'operator', action: 'legacy.claim_code_issued', subjectType: 'legacy_claim_code', subjectId: row.id });
  });
  return { code, expiresAt };
}

/** Revokes every unused, unrevoked code of one legacy family. Returns how many were revoked. */
export async function revokeLegacyClaimCodes(db: Db, clock: Clock, legacyFamilyId: string): Promise<number> {
  const now = clock.now();
  return db.transaction(async (tx) => {
    const [family] = await tx
      .select({ id: legacyFamilies.id })
      .from(legacyFamilies)
      .where(and(eq(legacyFamilies.legacyFamilyId, legacyFamilyId), ne(legacyFamilies.status, 'withdrawn')));
    if (!family) throw new ManifestError('no such legacy family');
    const revoked = await tx
      .update(legacyClaimCodes)
      .set({ revokedAt: now })
      .where(and(eq(legacyClaimCodes.legacyFamilyRowId, family.id), isNull(legacyClaimCodes.usedAt), isNull(legacyClaimCodes.revokedAt)))
      .returning({ id: legacyClaimCodes.id });
    if (revoked.length > 0) {
      await recordAudit(tx, clock, {
        actorType: 'operator', action: 'legacy.claim_code_revoked', subjectType: 'legacy_family', subjectId: family.id,
        meta: { count: revoked.length },
      });
    }
    return revoked.length;
  });
}
