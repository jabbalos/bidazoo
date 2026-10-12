import { and, asc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import {
  childProfiles, guardians, legacyClaimCodes, legacyFamilies, legacyKids, players,
} from '@bidazoo/database/schema';
import type { ChildProfile, LegacyClaimResponse, LegacyKid, LegacyOfferResponse } from '@bidazoo/contracts';
import type { FastifyRequest } from 'fastify';
import type { AppContext, Executor } from '../../context';
import { errors } from '../../http/errors';
import { recordAudit } from './audit';
import { toChildProfile } from './family';
import type { GuardianContext } from './guardian-auth';
import { hashLegacyClaimCode, legacyMatchHmac } from './legacy-manifest';
import type { IdentityRuntime } from './runtime';
import { clientSubject, enforce } from './throttle';

/**
 * Legacy (Hop Quest) family claim, API side.
 *
 * What a claim does: it attaches ONE pre-loaded legacy family record to the claiming guardian's
 * BidaZoo family. That is all. It creates no player, no child profile, no attempt, no mastery, no
 * XP, no coin, no ledger row: nothing from the old app's progress exists on this side to import.
 * The old children remain unlinked PLACEHOLDER slots until a guardian explicitly links each one
 * (`linkLegacyKid`), and linking creates a FRESH player. A legacy child is never attached to an
 * existing BidaZoo player.
 *
 * Two ways to claim, both needing current guardian authority on a trusted device:
 *  1. verified-email match: the guardian's own VERIFIED BidaZoo address, run through the same
 *     keyed function as the loader, equals the stored match key. Guardian rows only exist after
 *     the address was proved with a one-time link, so an unproved address can never match.
 *  2. operator claim code: a single-use, expiring code for exactly one legacy family, for a
 *     parent whose current email differs from the old one.
 *
 * A second guardian is never matched from old email data: they join through the BidaZoo family.
 *
 * Privacy: "no match", "claimed by someone else", "legacy claiming is off" and (for codes)
 * "unknown / used / expired / revoked" each collapse into one generic answer.
 */

function legacyEnabled(runtime: IdentityRuntime): string | null {
  return runtime.config.legacyMatchPepper ?? null;
}

function toLegacyKid(row: typeof legacyKids.$inferSelect): LegacyKid {
  return { id: row.id, username: row.legacyUsername, gradeBand: row.gradeBand, childProfileId: row.childProfileId };
}

async function kidsOf(executor: Executor, familyRowIds: string[]): Promise<LegacyKid[]> {
  if (familyRowIds.length === 0) return [];
  const rows = await executor
    .select()
    .from(legacyKids)
    .where(inArray(legacyKids.legacyFamilyRowId, familyRowIds))
    .orderBy(asc(legacyKids.legacyKidId));
  return rows.map(toLegacyKid);
}

async function guardianMatchKey(executor: Executor, pepper: string, guardianId: string): Promise<string> {
  const [row] = await executor.select({ email: guardians.email }).from(guardians).where(eq(guardians.id, guardianId));
  if (!row) throw errors.forbidden();
  // guardians.email is already normalized (lowercase, trimmed): the same form the loader hashes.
  return legacyMatchHmac(pepper, row.email);
}

/**
 * What this guardian could claim or resume: the unclaimed legacy family matching their verified
 * email, plus any legacy families their family already claimed (so linking can resume). `null`
 * when there is nothing, which is also the answer when legacy claiming is off.
 */
export async function legacyOffer(ctx: AppContext, runtime: IdentityRuntime, guardian: GuardianContext): Promise<LegacyOfferResponse> {
  const pepper = legacyEnabled(runtime);
  if (!pepper) return { offer: null };
  const key = await guardianMatchKey(ctx.db, pepper, guardian.guardianId);
  const rows = await ctx.db
    .select({ id: legacyFamilies.id })
    .from(legacyFamilies)
    .where(
      or(
        and(eq(legacyFamilies.emailMatchHmac, key), eq(legacyFamilies.status, 'unclaimed')),
        and(eq(legacyFamilies.familyId, guardian.familyId), eq(legacyFamilies.status, 'claimed')),
      ),
    );
  const kids = await kidsOf(ctx.db, rows.map((r) => r.id));
  return { offer: rows.length === 0 ? null : { childCount: kids.length, kids } };
}

export interface LegacyClaimResult {
  kids: LegacyClaimResponse['kids'];
  created: boolean;
}

/** Claims a legacy family, atomically, only while it is still unclaimed. Returns false if it was not. */
async function markClaimed(
  tx: Executor,
  ctx: AppContext,
  guardian: GuardianContext,
  legacyRowId: string,
  method: 'verified-email-match' | 'operator-code',
): Promise<boolean> {
  const claimed = await tx
    .update(legacyFamilies)
    .set({
      status: 'claimed',
      familyId: guardian.familyId,
      claimedByGuardianId: guardian.guardianId,
      claimedAt: ctx.clock.now(),
      claimMethod: method,
    })
    .where(and(eq(legacyFamilies.id, legacyRowId), eq(legacyFamilies.status, 'unclaimed')))
    .returning({ id: legacyFamilies.id });
  return claimed.length === 1;
}

/**
 * Claim by verified-email match. One transaction; the row is locked, then flipped with
 * `WHERE status = 'unclaimed'`, so two concurrent claims cannot both win. Replay by the owning
 * family returns the same result. No match, a family claimed by someone else, and "legacy off" are
 * all the same 404.
 */
export async function claimByEmail(ctx: AppContext, runtime: IdentityRuntime, guardian: GuardianContext): Promise<LegacyClaimResult> {
  const pepper = legacyEnabled(runtime);
  if (!pepper) throw errors.notFound();
  return ctx.db.transaction(async (tx) => {
    const key = await guardianMatchKey(tx, pepper, guardian.guardianId);
    const [row] = await tx
      .select()
      .from(legacyFamilies)
      .where(and(eq(legacyFamilies.emailMatchHmac, key), ne(legacyFamilies.status, 'withdrawn')))
      .for('update');
    if (!row) throw errors.notFound();
    if (row.status === 'claimed') {
      if (row.familyId !== guardian.familyId) throw errors.notFound();
      return { kids: await kidsOf(tx, [row.id]), created: false };
    }
    if (!(await markClaimed(tx, ctx, guardian, row.id, 'verified-email-match'))) throw errors.notFound();
    const kids = await kidsOf(tx, [row.id]);
    await recordAudit(tx, ctx.clock, {
      actorType: 'guardian', actorId: guardian.guardianId, action: 'legacy.family_claimed', familyId: guardian.familyId,
      subjectType: 'legacy_family', subjectId: row.id, meta: { method: 'verified-email-match', kidCount: kids.length },
    });
    return { kids, created: true };
  });
}

/**
 * Claim by operator code. Attempts are counted per client address in the database first (so the
 * limit survives restarts). The code row is locked; unknown, used, expired, revoked and
 * "its family is no longer claimable" are one 400. On success the code is spent and the legacy
 * family claimed in the same transaction. A code is single use: replay fails.
 */
export async function claimByCode(
  ctx: AppContext,
  runtime: IdentityRuntime,
  guardian: GuardianContext,
  request: FastifyRequest,
  rawCode: string,
): Promise<LegacyClaimResult> {
  await enforce(ctx, runtime, 'claim_code_ip', runtime.config.limits.claimCodeIp, clientSubject(request));
  if (!legacyEnabled(runtime)) throw errors.linkInvalid();
  const now = ctx.clock.now();
  const result = await ctx.db.transaction(async (tx) => {
    const [code] = await tx
      .select()
      .from(legacyClaimCodes)
      .where(eq(legacyClaimCodes.codeHash, hashLegacyClaimCode(runtime.keys, rawCode)))
      .for('update');
    if (!code || code.usedAt !== null || code.revokedAt !== null || code.expiresAt <= now) return null;
    const [row] = await tx.select().from(legacyFamilies).where(eq(legacyFamilies.id, code.legacyFamilyRowId)).for('update');
    if (!row || row.status !== 'unclaimed') return null;
    if (!(await markClaimed(tx, ctx, guardian, row.id, 'operator-code'))) return null;
    await tx.update(legacyClaimCodes).set({ usedAt: now, usedByGuardianId: guardian.guardianId }).where(eq(legacyClaimCodes.id, code.id));
    const kids = await kidsOf(tx, [row.id]);
    await recordAudit(tx, ctx.clock, {
      actorType: 'guardian', actorId: guardian.guardianId, action: 'legacy.claim_code_redeemed', familyId: guardian.familyId,
      subjectType: 'legacy_claim_code', subjectId: code.id,
    });
    await recordAudit(tx, ctx.clock, {
      actorType: 'guardian', actorId: guardian.guardianId, action: 'legacy.family_claimed', familyId: guardian.familyId,
      subjectType: 'legacy_family', subjectId: row.id, meta: { method: 'operator-code', kidCount: kids.length },
    });
    return { kids, created: true };
  });
  if (!result) throw errors.linkInvalid();
  return result;
}

/**
 * Explicitly links one legacy kid slot to a NEW child profile on a FRESH player (no progress
 * crosses over). The slot must belong to a legacy family this guardian's family claimed. A slot
 * of anyone else's, or an unknown one, is a 404. Linking twice returns the same profile.
 */
export async function linkLegacyKid(
  ctx: AppContext,
  runtime: IdentityRuntime,
  guardian: GuardianContext,
  legacyKidId: string,
  nickname: string,
): Promise<{ child: ChildProfile; created: boolean }> {
  if (!legacyEnabled(runtime)) throw errors.notFound();
  const now = ctx.clock.now();
  return ctx.db.transaction(async (tx) => {
    const [kid] = await tx.select().from(legacyKids).where(eq(legacyKids.id, legacyKidId)).for('update');
    if (!kid) throw errors.notFound();
    const [family] = await tx
      .select({ id: legacyFamilies.id })
      .from(legacyFamilies)
      .where(and(eq(legacyFamilies.id, kid.legacyFamilyRowId), eq(legacyFamilies.familyId, guardian.familyId), eq(legacyFamilies.status, 'claimed')));
    if (!family) throw errors.notFound();

    if (kid.childProfileId !== null) {
      const [existing] = await tx.select().from(childProfiles).where(eq(childProfiles.id, kid.childProfileId));
      if (!existing) throw errors.notFound();
      return { child: toChildProfile(existing), created: false };
    }
    const [player] = await tx.insert(players).values({ nickname: nickname, createdAt: now }).returning({ id: players.id });
    if (!player) throw new Error('player insert returned no row');
    const [child] = await tx
      .insert(childProfiles)
      .values({ familyId: guardian.familyId, playerId: player.id, nickname, createdByGuardianId: guardian.guardianId, createdAt: now })
      .returning();
    if (!child) throw new Error('child insert returned no row');
    await tx.update(legacyKids).set({ childProfileId: child.id, linkedAt: now }).where(and(eq(legacyKids.id, kid.id), isNull(legacyKids.childProfileId)));
    await recordAudit(tx, ctx.clock, {
      actorType: 'guardian', actorId: guardian.guardianId, action: 'legacy.kid_linked', familyId: guardian.familyId,
      subjectType: 'legacy_kid', subjectId: kid.id,
    });
    return { child: toChildProfile(child), created: true };
  });
}
