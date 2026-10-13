import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiPaths } from '@bidazoo/contracts';
import { issueLegacyClaimCode, loadLegacyManifest } from '@bidazoo/api/identity';
import { HAS_DB, makeHarness, signInGuardian, sql, uniqueEmail, type Harness } from './support/harness';

/**
 * Commit 8 schema review: the invariants the application relies on are also enforced by the
 * database, so a bug or a hand-written query cannot create the forbidden state. Each case issues
 * the forbidden statement directly and expects PostgreSQL itself (integrity class 23) to refuse it,
 * naming the constraint where one exists. Reviewed and found sufficient: no migration was added.
 */

const PEPPER = 'legacy-pepper-0123456789abcdef0123456789abcdef';
const rid = () => randomBytes(5).toString('hex');
const hex64 = () => randomBytes(32).toString('hex');

describe.skipIf(!HAS_DB)('identity database invariants', () => {
  let h: Harness;
  let a: { familyId: string; guardianId: string; childId: string; playerId: string; deviceId: string; email: string };
  let b: { familyId: string; guardianId: string; childId: string; playerId: string; deviceId: string; email: string };
  let legacy: { rowId: string; legacyFamilyId: string; kidRowId: string; hmac: string; claimedRowId: string; claimedKidRowId: string; codeHash: string };

  async function party() {
    const { browser, email } = await signInGuardian(h);
    const child = (await browser.request('POST', ApiPaths.familyChildren, { nickname: 'Mia' })).body.child as { id: string };
    const g = (await sql<{ id: string; family_id: string }>(h, 'select id, family_id from guardians where email = $1', [email]))[0]!;
    const c = (await sql<{ player_id: string }>(h, 'select player_id from child_profiles where id = $1', [child.id]))[0]!;
    const d = (await sql<{ id: string }>(h, 'select id from device_sessions where family_id = $1 limit 1', [g.family_id]))[0]!;
    return { familyId: g.family_id, guardianId: g.id, childId: child.id, playerId: c.player_id, deviceId: d.id, email };
  }

  /** Runs a statement that must be refused by the database. Returns the PostgreSQL error. */
  async function refused(text: string, params: unknown[] = []): Promise<{ code: string; constraint?: string; message: string }> {
    try {
      await h.database.pool.query(text, params);
    } catch (err) {
      return err as { code: string; constraint?: string; message: string };
    }
    throw new Error(`the database accepted: ${text}`);
  }
  const integrity = (e: { code: string }) => expect(e.code.startsWith('23'), `SQLSTATE ${e.code}`).toBe(true);

  beforeAll(async () => {
    h = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } } });
    a = await party();
    b = await party();
    const lf = `hq-fam-${rid()}`;
    const kid = `hq-kid-${rid()}`;
    const claimedLf = `hq-fam-${rid()}`;
    const claimedKid = `hq-kid-${rid()}`;
    await loadLegacyManifest(h.database.db, h.clock, PEPPER, {
      version: 1,
      families: [
        { legacyFamilyId: lf, guardianEmail: uniqueEmail('lg'), kids: [{ legacyKidId: kid }] },
        { legacyFamilyId: claimedLf, guardianEmail: a.email, kids: [{ legacyKidId: claimedKid }] },
      ],
    });
    const { browser } = await signInGuardian(h, { email: a.email });
    await browser.request('POST', ApiPaths.legacyClaim, {});
    const row = (await sql<{ id: string; email_match_hmac: string }>(h, 'select id, email_match_hmac from legacy_families where legacy_family_id = $1', [lf]))[0]!;
    const kidRow = (await sql<{ id: string }>(h, 'select id from legacy_kids where legacy_kid_id = $1', [kid]))[0]!;
    const claimed = (await sql<{ id: string }>(h, 'select id from legacy_families where legacy_family_id = $1', [claimedLf]))[0]!;
    const claimedKidRow = (await sql<{ id: string }>(h, 'select id from legacy_kids where legacy_kid_id = $1', [claimedKid]))[0]!;
    await issueLegacyClaimCode(h.database.db, h.clock, h.identity!.keys, { legacyFamilyId: lf, days: 7 });
    const codeHash = (await sql<{ code_hash: string }>(h, 'select code_hash from legacy_claim_codes where legacy_family_row_id = $1', [row.id]))[0]!.code_hash;
    legacy = { rowId: row.id, legacyFamilyId: lf, kidRowId: kidRow.id, hmac: row.email_match_hmac, claimedRowId: claimed.id, claimedKidRowId: claimedKidRow.id, codeHash };
  });
  afterAll(async () => {
    await h.close();
  });

  it('guardians: one row per normalized email, always lowercase', async () => {
    const dup = await refused('insert into guardians (family_id, email, email_verified_at) values ($1, $2, now())', [b.familyId, a.email]);
    expect(dup.constraint).toBe('guardians_email_uq');
    const upper = await refused('insert into guardians (family_id, email, email_verified_at) values ($1, $2, now())', [b.familyId, `UPPER-${rid()}@example.test`]);
    expect(upper.constraint).toBe('guardians_email_ck');
  });

  it('child profiles: one per player, immutable ownership, paired PIN fields, sane counters', async () => {
    expect((await refused('insert into child_profiles (family_id, player_id, nickname) values ($1, $2, $3)', [b.familyId, a.playerId, 'Dup'])).constraint).toBe('child_profiles_player_uq');
    expect((await refused("update child_profiles set pin_hash = 'x' where id = $1", [a.childId])).constraint).toBe('child_profiles_pin_ck');
    expect((await refused('update child_profiles set pin_set_at = now() where id = $1', [a.childId])).constraint).toBe('child_profiles_pin_ck');
    expect((await refused('update child_profiles set pin_failures = -1 where id = $1', [a.childId])).constraint).toBe('child_profiles_pin_failures_ck');
    integrity(await refused('update child_profiles set family_id = $2 where id = $1', [a.childId, b.familyId]));
    integrity(await refused('update child_profiles set player_id = $2 where id = $1', [a.childId, b.playerId]));
  });

  it('device sessions: unique token hash, same-family links only, authority needs a guardian, revoked is final', async () => {
    const hash = hex64();
    const insert = (family: string, guardian: string | null, child: string | null, origin: string, tokenHash: string, authority = false) =>
      h.database.pool.query(
        `insert into device_sessions (family_id, guardian_id, active_child_profile_id, token_hash, origin, expires_at, authority_expires_at)
         values ($1, $2, $3, $4, $5, now() + interval '1 day', ${authority ? "now() + interval '1 hour'" : 'null'})`,
        [family, guardian, child, tokenHash, origin],
      );
    await insert(a.familyId, null, null, 'device_code', hash);
    const text = 'insert into device_sessions (family_id, token_hash, origin, expires_at) values ($1, $2, $3, now() + interval \'1 day\')';
    expect((await refused(text, [a.familyId, hash, 'device_code'])).constraint).toBe('device_sessions_token_hash_uq');
    expect((await refused(text, [a.familyId, hex64(), 'sms'])).constraint).toBe('device_sessions_origin_ck');
    // A profile or guardian of ANOTHER family cannot be attached.
    await expect(insert(a.familyId, null, b.childId, 'device_code', hex64())).rejects.toMatchObject({ constraint: 'device_sessions_child_family_fk' });
    await expect(insert(a.familyId, b.guardianId, null, 'email_link', hex64())).rejects.toMatchObject({ constraint: 'device_sessions_guardian_family_fk' });
    await expect(insert(a.familyId, null, null, 'device_code', hex64(), true)).rejects.toMatchObject({ constraint: 'device_sessions_authority_ck' });
    // Identity columns never change; a revoked session never changes again.
    integrity(await refused('update device_sessions set family_id = $2 where id = $1', [a.deviceId, b.familyId]));
    integrity(await refused("update device_sessions set token_hash = $2 where id = $1", [a.deviceId, hex64()]));
    await sql(h, "insert into device_sessions (family_id, token_hash, origin, expires_at, revoked_at) values ($1, $2, 'device_code', now() + interval '1 day', now())", [a.familyId, hex64()]);
    const dead = (await sql<{ id: string }>(h, 'select id from device_sessions where family_id = $1 and revoked_at is not null limit 1', [a.familyId]))[0]!;
    integrity(await refused('update device_sessions set revoked_at = null where id = $1', [dead.id]));
    integrity(await refused("update device_sessions set expires_at = now() + interval '400 days' where id = $1", [dead.id]));
  });

  it('sign-in links: unique hash, spent exactly once, address cleared on use', async () => {
    const hash = hex64();
    await sql(h, "insert into guardian_login_tokens (token_hash, email, expires_at) values ($1, 'pending@example.test', now() + interval '15 minutes')", [hash]);
    expect((await refused("insert into guardian_login_tokens (token_hash, email, expires_at) values ($1, 'x@example.test', now() + interval '1 minute')", [hash])).constraint).toBe('guardian_login_tokens_hash_uq');
    expect((await refused("insert into guardian_login_tokens (token_hash, email, expires_at) values ($1, null, now() + interval '1 minute')", [hex64()])).constraint).toBe('guardian_login_tokens_email_ck');
    integrity(await refused("update guardian_login_tokens set used_at = now() where token_hash = $1", [hash])); // used but still holding the address
    await sql(h, 'update guardian_login_tokens set used_at = now(), email = null where token_hash = $1', [hash]);
    integrity(await refused('update guardian_login_tokens set used_at = now() + interval \'1 hour\' where token_hash = $1', [hash])); // never twice
  });

  it('device codes and claim codes: unique hash, single use', async () => {
    await sql(h, "insert into device_auth_codes (code_hash, family_id, created_by_guardian_id, expires_at) values ($1, $2, $3, now() + interval '10 minutes')", [hex64(), a.familyId, a.guardianId]);
    const dupHash = (await sql<{ code_hash: string }>(h, 'select code_hash from device_auth_codes where family_id = $1 limit 1', [a.familyId]))[0]!.code_hash;
    expect((await refused("insert into device_auth_codes (code_hash, family_id, created_by_guardian_id, expires_at) values ($1, $2, $3, now() + interval '1 minute')", [dupHash, a.familyId, a.guardianId])).constraint).toBe('device_auth_codes_hash_uq');
    await sql(h, 'update device_auth_codes set used_at = now() where code_hash = $1', [dupHash]);
    integrity(await refused("update device_auth_codes set used_at = null where code_hash = $1", [dupHash]));
    integrity(await refused("update device_auth_codes set used_at = now() + interval '1 hour' where code_hash = $1", [dupHash]));

    expect((await refused("insert into legacy_claim_codes (code_hash, legacy_family_row_id, expires_at) values ($1, $2, now() + interval '1 day')", [legacy.codeHash, legacy.rowId])).constraint).toBe('legacy_claim_codes_hash_uq');
    expect((await refused('update legacy_claim_codes set used_at = now() where code_hash = $1', [legacy.codeHash])).constraint).toBe('legacy_claim_codes_use_ck'); // used with nobody using it
    await sql(h, 'update legacy_claim_codes set used_at = now(), used_by_guardian_id = $2 where code_hash = $1', [legacy.codeHash, b.guardianId]);
    integrity(await refused('update legacy_claim_codes set used_at = null, used_by_guardian_id = null where code_hash = $1', [legacy.codeHash]));
  });

  it('legacy families: one live row per legacy id and per match key, a claim is complete and final', async () => {
    const batch = (await sql<{ id: string }>(h, 'select batch_id as id from legacy_families where id = $1', [legacy.rowId]))[0]!.id;
    const insert = (lf: string, hmac: string) => h.database.pool.query('insert into legacy_families (batch_id, legacy_family_id, email_match_hmac) values ($1, $2, $3)', [batch, lf, hmac]);
    await expect(insert(legacy.legacyFamilyId, hex64())).rejects.toMatchObject({ constraint: 'legacy_families_legacy_id_live_uq' });
    await expect(insert(`hq-fam-${rid()}`, legacy.hmac)).rejects.toMatchObject({ constraint: 'legacy_families_match_live_uq' });
    await expect(insert(`hq-fam-${rid()}`, 'not-a-hmac')).rejects.toMatchObject({ constraint: 'legacy_families_hmac_ck' });
    expect((await refused("update legacy_families set status = 'claimed' where id = $1", [legacy.rowId])).constraint).toBe('legacy_families_claim_ck'); // claimed with no owner
    expect((await refused("update legacy_families set status = 'sold' where id = $1", [legacy.rowId])).constraint).toBe('legacy_families_status_ck');
    // Claimed rows are frozen: no un-claiming, no re-pointing at another family, no new match key.
    integrity(await refused("update legacy_families set status = 'unclaimed', family_id = null, claimed_by_guardian_id = null, claimed_at = null, claim_method = null where id = $1", [legacy.claimedRowId]));
    integrity(await refused('update legacy_families set family_id = $2, claimed_by_guardian_id = $3 where id = $1', [legacy.claimedRowId, b.familyId, b.guardianId]));
    integrity(await refused('update legacy_families set email_match_hmac = $2 where id = $1', [legacy.rowId, hex64()]));
  });

  it('legacy kids: unique id, linked to one profile once, one slot per profile', async () => {
    expect((await refused('insert into legacy_kids (legacy_family_row_id, legacy_kid_id) select legacy_family_row_id, legacy_kid_id from legacy_kids where id = $1', [legacy.kidRowId])).constraint).toBe('legacy_kids_legacy_kid_uq');
    expect((await refused('update legacy_kids set child_profile_id = $2 where id = $1', [legacy.kidRowId, a.childId])).constraint).toBe('legacy_kids_link_ck'); // linked without a linked_at
    await sql(h, 'update legacy_kids set child_profile_id = $2, linked_at = now() where id = $1', [legacy.kidRowId, a.childId]);
    integrity(await refused('update legacy_kids set child_profile_id = $2, linked_at = now() where id = $1', [legacy.kidRowId, b.childId])); // never re-pointed
    expect((await refused('update legacy_kids set child_profile_id = $2, linked_at = now() where id = $1', [legacy.claimedKidRowId, a.childId])).constraint).toBe('legacy_kids_profile_uq');
  });

  it('audit events are append-only and well formed; throttle rows are bounded', async () => {
    const row = (await sql<{ id: string }>(h, 'select id::text as id from audit_events where family_id = $1 limit 1', [a.familyId]))[0]!;
    integrity(await refused("update audit_events set action = 'x' where id = $1::bigint", [row.id]));
    integrity(await refused('delete from audit_events where id = $1::bigint', [row.id]));
    expect((await refused("insert into audit_events (actor_type, action) values ('stranger', 'x.y')")).constraint).toBe('audit_events_actor_ck');
    expect((await refused("insert into audit_events (actor_type, action, meta) values ('system', 'x.y', '[]'::jsonb)")).constraint).toBe('audit_events_meta_ck');
    expect((await refused("insert into identity_throttles (scope, key_hash, window_start, count) values ('s', $1, now(), -1)", [hex64()])).constraint).toBe('identity_throttles_count_ck');
    expect((await refused("insert into identity_throttles (scope, key_hash, window_start, count) values ($1, $2, now(), 1)", ['x'.repeat(49), hex64()])).constraint).toBe('identity_throttles_scope_ck');
  });
});
