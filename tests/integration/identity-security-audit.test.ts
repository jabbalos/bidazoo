import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiPaths } from '@bidazoo/contracts';
import { AUDIT_ACTIONS, issueLegacyClaimCode, loadLegacyManifest, revokeLegacyClaimCodes } from '@bidazoo/api/identity';
import {
  HAS_DB, TestBrowser, countRows, deviceBrowser, freshAddress, linkTokenFor, makeHarness, newPlayer, playerIdOf, signInGuardian, sql,
  uniqueEmail, type Harness,
} from './support/harness';
import { faultyDb, withAuditFault } from './support/identity-security';

/**
 * Commit 8: audit consistency, and rollback atomicity by LOCALIZED fault injection.
 *
 * Fault injection here fails the nth audit_events insert of one transaction (support/identity-security.ts).
 * Audit writes are the last statement(s) of every identity transaction, so everything the action
 * wrote before them is real and must roll back. It touches only the harness handle: no trigger, no
 * schema change. The one trigger-based rollback test that remains is the guest-claim one in
 * identity-guest-claim.test.ts (it proves the unique/FK backstops under a database-side failure);
 * it is left intact and not copied.
 */

const PEPPER = 'legacy-pepper-0123456789abcdef0123456789abcdef';
const rid = () => randomBytes(5).toString('hex');
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const PIN = '4827';
const WRONG = '1111';

type AuditRow = { id: number; at: Date; actor_type: string; actor_id: string | null; action: string; family_id: string | null; subject_type: string | null; subject_id: string | null; meta: Record<string, unknown> };
const auditOf = (h: Harness, familyId: string) =>
  sql<AuditRow>(h, 'select * from audit_events where family_id = $1 order by id', [familyId]);
const actionsOf = async (h: Harness, familyId: string) => (await auditOf(h, familyId)).map((r) => r.action);
const guardianRow = async (h: Harness, email: string) =>
  (await sql<{ id: string; family_id: string }>(h, 'select id, family_id from guardians where email = $1', [email.toLowerCase()]))[0]!;

async function newGuardian(h: Harness) {
  const { browser, email } = await signInGuardian(h);
  const g = await guardianRow(h, email);
  return { browser, email, guardianId: g.id, familyId: g.family_id };
}
const addChild = async (b: TestBrowser, nickname = 'Mia') =>
  (await b.request('POST', ApiPaths.familyChildren, { nickname })).body.child as { id: string };
async function codeDevice(h: Harness, guardian: TestBrowser, childProfileId?: string): Promise<TestBrowser> {
  const code = (await guardian.request('POST', ApiPaths.deviceCodes, childProfileId ? { childProfileId } : {})).body.code as string;
  const kid = deviceBrowser(h);
  const res = await kid.request('POST', ApiPaths.deviceCodesRedeem, { code });
  if (res.status !== 200) throw new Error(`redeem failed ${res.status}`);
  return kid;
}
const switchTo = (b: TestBrowser, childProfileId: string, pin?: string) =>
  b.request('POST', ApiPaths.deviceProfile, pin === undefined ? { childProfileId } : { childProfileId, pin });
const pinState = async (h: Harness, id: string) =>
  (await sql<{ pin_hash: string | null; pin_failures: number; pin_locked_until: Date | null }>(
    h, 'select pin_hash, pin_failures, pin_locked_until from child_profiles where id = $1', [id]))[0]!;

// ---------------------------------------------------------------------------------------------
describe.skipIf(!HAS_DB)('audit consistency', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } } });
  });
  afterAll(async () => {
    await h.close();
  });

  it('names every action <subject>.<verb>, and only known actions are ever recorded', async () => {
    for (const action of AUDIT_ACTIONS) expect(action).toMatch(/^[a-z]+\.[a-z_]+$/);
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
    const seen = await sql<{ action: string }>(h, 'select distinct action from audit_events');
    expect(seen.map((r) => r.action).filter((a) => !(AUDIT_ACTIONS as readonly string[]).includes(a))).toEqual([]);
  });

  it('records one attributable event per state change, none for reads or no-ops, and none twice on replay', async () => {
    const { browser: guardian, guardianId, familyId } = await newGuardian(h);
    let seen = (await actionsOf(h, familyId)).length;
    const since = async () => {
      const all = await actionsOf(h, familyId);
      const fresh = all.slice(seen);
      seen = all.length;
      return fresh;
    };
    expect(await actionsOf(h, familyId)).toEqual(['guardian.created', 'guardian.verified', 'device.authorized']);

    // Ordinary reads and a plain profile switch are not security events.
    const child = await addChild(guardian);
    expect(await since()).toEqual(['child.created']);
    for (const path of [ApiPaths.family, ApiPaths.device, ApiPaths.devices, ApiPaths.legacyOffer]) await guardian.request('GET', path);
    expect((await switchTo(guardian, child.id)).status).toBe(200);
    expect(await since()).toEqual([]);

    // PIN set / reset (wasSet flips), then wrong guesses lock the profile once.
    await guardian.request('POST', ApiPaths.familyChildPin(child.id), { pin: PIN });
    await guardian.request('POST', ApiPaths.familyChildPin(child.id), { pin: '9136' });
    expect(await since()).toEqual(['pin.set', 'pin.set']);
    const kid = await codeDevice(h, guardian);
    expect(await since()).toEqual(['device.code_issued', 'device.authorized']);
    for (let i = 0; i < 8; i += 1) await switchTo(kid, child.id, WRONG);
    expect(await since()).toEqual(['pin.locked']);

    // Idempotent repeats write nothing.
    await guardian.request('DELETE', ApiPaths.familyChildPin(child.id));
    await guardian.request('DELETE', ApiPaths.familyChildPin(child.id));
    expect(await since()).toEqual(['pin.cleared']);
    for (let i = 0; i < 2; i += 1) await guardian.request('POST', ApiPaths.familyChildArchive(child.id), {});
    for (let i = 0; i < 2; i += 1) await guardian.request('POST', ApiPaths.familyChildRestore(child.id), {});
    expect(await since()).toEqual(['child.archived', 'child.restored']);
    const kidDevice = (await sql<{ id: string }>(h, "select id from device_sessions where family_id = $1 and origin = 'device_code'", [familyId]))[0]!;
    for (let i = 0; i < 2; i += 1) expect((await guardian.request('POST', ApiPaths.deviceRevoke(kidDevice.id), {})).status).toBe(200);
    expect(await since()).toEqual(['device.revoked']);
    await codeDevice(h, guardian);
    since();
    seen = (await actionsOf(h, familyId)).length;
    // Revoke-all is the one action recorded per call (an explicit panic button), with the count it achieved.
    for (let i = 0; i < 2; i += 1) await guardian.request('POST', ApiPaths.devicesRevokeAll, {});
    expect(await since()).toEqual(['device.revoked_all', 'device.revoked_all']);
    const revokeAll = (await auditOf(h, familyId)).filter((r) => r.action === 'device.revoked_all');
    expect(revokeAll.map((r) => r.meta['count'])).toEqual([1, 0]);

    // Attribution, safe references, allowlisted meta, and a server-clock timestamp.
    const rows = await auditOf(h, familyId);
    for (const row of rows) {
      expect(row.family_id).toBe(familyId);
      expect(row.at.toISOString()).toBe(h.clock.now().toISOString());
      if (row.action === 'pin.locked') {
        expect(row.actor_type).toBe('device');
        expect(row.actor_id).toBeNull();
      } else {
        expect(row.actor_type).toBe('guardian');
        expect(row.actor_id).toBe(guardianId);
      }
      expect(Object.keys(row.meta).every((k) => ['method', 'origin', 'reason', 'count', 'childCount', 'kidCount', 'includeCurrent', 'replaced', 'wasSet'].includes(k))).toBe(true);
    }
    expect(rows.filter((r) => r.action === 'pin.set').map((r) => r.meta['wasSet'])).toEqual([false, true]);
  });

  it('records a guest claim once and nothing for a replay or a refused claim', async () => {
    const g = await newGuardian(h);
    const browser = await newPlayer(h, freshAddress());
    await playerIdOf(browser);
    await signInGuardian(h, { browser, email: g.email });
    const before = (await actionsOf(h, g.familyId)).length;
    expect((await browser.request('POST', ApiPaths.familyChildrenFromGuest, { nickname: 'Mia' })).status).toBe(201);
    expect((await browser.request('POST', ApiPaths.familyChildrenFromGuest, { nickname: 'Mia' })).status).toBe(401); // cookie spent
    const added = (await actionsOf(h, g.familyId)).slice(before).filter((a) => a === 'guest.claimed');
    expect(added).toEqual(['guest.claimed']);
  });

  it('failed and refused requests write no audit event for anyone', async () => {
    const a = await newGuardian(h);
    const b = await newGuardian(h);
    const aChild = await addChild(a.browser);
    const bChild = await addChild(b.browser);
    const bDevice = (await sql<{ id: string }>(h, 'select id from device_sessions where family_id = $1', [b.familyId]))[0]!;
    await a.browser.request('POST', ApiPaths.familyChildPin(aChild.id), { pin: PIN });
    const kid = await codeDevice(h, a.browser);
    const aBefore = (await auditOf(h, a.familyId)).length;
    const bBefore = (await auditOf(h, b.familyId)).length;

    const refused = [
      a.browser.request('POST', ApiPaths.familyChildPin(bChild.id), { pin: PIN }),
      a.browser.request('DELETE', ApiPaths.familyChildPin(bChild.id)),
      a.browser.request('POST', ApiPaths.familyChildArchive(bChild.id), {}),
      a.browser.request('POST', ApiPaths.familyChildRestore(bChild.id), {}),
      a.browser.request('POST', ApiPaths.deviceRevoke(bDevice.id), {}),
      a.browser.request('POST', ApiPaths.deviceCodes, { childProfileId: bChild.id }),
      a.browser.request('POST', ApiPaths.deviceProfile, { childProfileId: bChild.id }),
      kid.request('POST', ApiPaths.deviceProfile, { childProfileId: bChild.id }),
      switchTo(kid, aChild.id), // PIN required, none given
      switchTo(kid, aChild.id, WRONG), // wrong, but below the lock threshold
      kid.request('POST', ApiPaths.familyChildren, { nickname: 'x' }), // child device lacks authority
      kid.request('POST', ApiPaths.devicesRevokeAll, {}),
      a.browser.request('POST', ApiPaths.legacyClaim, {}), // no legacy family for this address
      a.browser.request('POST', ApiPaths.legacyClaimCode, { code: 'ABCD-EFGH-JKMN' }),
      a.browser.request('POST', ApiPaths.familyChildrenFromGuest, { nickname: 'Mia' }), // no guest cookie
      deviceBrowser(h).request('POST', ApiPaths.deviceCodesRedeem, { code: 'ABCD-EFGH-JKMN' }),
      deviceBrowser(h).request('POST', ApiPaths.guardianEmailLinkConsume, { token: randomBytes(32).toString('base64url') }),
    ];
    const statuses = (await Promise.all(refused)).map((r) => r.status);
    expect(statuses.every((s) => s >= 400)).toBe(true);
    expect((await auditOf(h, a.familyId)).length).toBe(aBefore);
    expect((await auditOf(h, b.familyId)).length).toBe(bBefore);
  });

  it('records legacy actions once each, attributed, and never with a secret or an address', async () => {
    const email = uniqueEmail('aud');
    const lf = `hq-fam-${rid()}`;
    const kidIds = [`hq-kid-${rid()}-0`, `hq-kid-${rid()}-1`];
    const label = `lbl-${rid()}`;
    const batch = await loadLegacyManifest(h.database.db, h.clock, PEPPER, {
      version: 1,
      families: [{ legacyFamilyId: lf, guardianEmail: email, kids: kidIds.map((legacyKidId) => ({ legacyKidId })) }],
    }, { loadedBy: label });
    const batchAudit = await sql<AuditRow>(h, "select * from audit_events where action = 'legacy.batch_loaded' and subject_id = $1", [batch.batchId]);
    expect(batchAudit).toHaveLength(1);
    expect(batchAudit[0]).toMatchObject({ actor_type: 'operator', actor_id: null, family_id: null, meta: { count: 1, kidCount: 2 } });

    const { browser, email: signedIn } = await signInGuardian(h, { email });
    const g = await guardianRow(h, signedIn);
    expect((await browser.request('POST', ApiPaths.legacyClaim, {})).status).toBe(201);
    expect((await browser.request('POST', ApiPaths.legacyClaim, {})).status).toBe(200);
    const kids = (await browser.request('GET', ApiPaths.legacyOffer)).body.offer.kids as Array<{ id: string }>;
    expect((await browser.request('POST', ApiPaths.legacyKidLink(kids[0]!.id), { nickname: 'Mia' })).status).toBe(201);
    expect((await browser.request('POST', ApiPaths.legacyKidLink(kids[0]!.id), { nickname: 'Mia' })).status).toBe(200);
    const mine = await auditOf(h, g.family_id);
    expect(mine.map((r) => r.action).filter((a) => a.startsWith('legacy.'))).toEqual(['legacy.family_claimed', 'legacy.kid_linked']);
    for (const row of mine.filter((r) => r.action.startsWith('legacy.'))) {
      expect(row.actor_type).toBe('guardian');
      expect(row.actor_id).toBe(g.id);
    }

    // Operator codes: issue and revoke are operator events with no family; redeem is the guardian's.
    const other = `hq-fam-${rid()}`;
    await loadLegacyManifest(h.database.db, h.clock, PEPPER, {
      version: 1, families: [{ legacyFamilyId: other, guardianEmail: uniqueEmail('old'), kids: [{ legacyKidId: `hq-kid-${rid()}` }] }],
    });
    const revokedCode = await issueLegacyClaimCode(h.database.db, h.clock, h.identity!.keys, { legacyFamilyId: other, days: 7 });
    expect(await revokeLegacyClaimCodes(h.database.db, h.clock, other)).toBe(1);
    expect(await revokeLegacyClaimCodes(h.database.db, h.clock, other)).toBe(0); // repeat: no event
    const good = await issueLegacyClaimCode(h.database.db, h.clock, h.identity!.keys, { legacyFamilyId: other, days: 7 });
    const newcomer = await newGuardian(h);
    expect((await newcomer.browser.request('POST', ApiPaths.legacyClaimCode, { code: revokedCode.code })).status).toBe(400);
    expect((await newcomer.browser.request('POST', ApiPaths.legacyClaimCode, { code: good.code })).status).toBe(201);
    expect((await newcomer.browser.request('POST', ApiPaths.legacyClaimCode, { code: good.code })).status).toBe(400);
    const theirs = (await auditOf(h, newcomer.familyId)).filter((r) => r.action.startsWith('legacy.'));
    expect(theirs.map((r) => r.action)).toEqual(['legacy.claim_code_redeemed', 'legacy.family_claimed']);
    const otherRow = (await sql<{ id: string }>(h, 'select id from legacy_families where legacy_family_id = $1', [other]))[0]!;
    const opEvents = await sql<AuditRow>(h, "select * from audit_events where actor_type = 'operator' and subject_id = $1 order by id", [otherRow.id]);
    expect(opEvents.map((r) => r.action)).toEqual(['legacy.claim_code_revoked']);
    expect(opEvents[0]!.meta).toEqual({ count: 1 });

    const everything = JSON.stringify([...mine, ...theirs, ...opEvents, ...batchAudit]);
    for (const secret of [email, good.code, revokedCode.code, PEPPER, h.identity!.config.secret, sha256(good.code)]) {
      expect(everything).not.toContain(secret);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe.skipIf(!HAS_DB)('rollback atomicity (localized fault at the audit write)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } } });
  });
  afterAll(async () => {
    await h.close();
  });

  const orphanFamilies = () => countRows(h, 'families f', 'not exists (select 1 from guardians g where g.family_id = f.id)');

  it('guardian sign-in on a new address: nothing is created and the link is not burned', async () => {
    const email = uniqueEmail('rb');
    const browser = deviceBrowser(h);
    await browser.request('POST', ApiPaths.guardianEmailLinks, { email });
    await h.identity!.mail.idle();
    const token = linkTokenFor(h, email);
    const orphans = await orphanFamilies();

    const res = await withAuditFault(h, 3, () => browser.request('POST', ApiPaths.guardianEmailLinkConsume, { token }));
    expect(res.status).toBe(500);
    expect(browser.deviceCookie).toBeUndefined();
    expect(await countRows(h, 'guardians', 'email = $1', [email])).toBe(0);
    expect(await orphanFamilies()).toBe(orphans);
    const link = (await sql(h, 'select used_at, email from guardian_login_tokens where token_hash = $1', [sha256(token)]))[0]!;
    expect(link).toMatchObject({ used_at: null, email });

    // The same link still works afterwards, once.
    expect((await browser.request('POST', ApiPaths.guardianEmailLinkConsume, { token })).status).toBe(200);
    const g = await guardianRow(h, email);
    expect(await actionsOf(h, g.family_id)).toEqual(['guardian.created', 'guardian.verified', 'device.authorized']);
  });

  it('guardian sign-in on a browser that already has a device: the old device is not retired', async () => {
    const { browser, email } = await signInGuardian(h);
    const oldCookie = browser.deviceCookie;
    await browser.request('POST', ApiPaths.guardianEmailLinks, { email });
    await h.identity!.mail.idle();
    const token = linkTokenFor(h, email);
    const res = await withAuditFault(h, 2, () => browser.request('POST', ApiPaths.guardianEmailLinkConsume, { token }));
    expect(res.status).toBe(500);
    expect(browser.deviceCookie).toBe(oldCookie);
    expect((await browser.request('GET', ApiPaths.device)).status).toBe(200);
    expect(await countRows(h, 'guardian_login_tokens', 'token_hash = $1 and used_at is null', [sha256(token)])).toBe(1);
    expect((await browser.request('POST', ApiPaths.guardianEmailLinkConsume, { token })).status).toBe(200);
    expect(browser.deviceCookie).not.toBe(oldCookie);
  });

  it('device authorization by code: no device is created and the code is not burned', async () => {
    const g = await newGuardian(h);
    const code = (await g.browser.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
    const devices = () => countRows(h, 'device_sessions', 'family_id = $1', [g.familyId]);
    const before = await devices();
    const kid = deviceBrowser(h);
    const res = await withAuditFault(h, 1, () => kid.request('POST', ApiPaths.deviceCodesRedeem, { code }));
    expect(res.status).toBe(500);
    expect(kid.deviceCookie).toBeUndefined();
    expect(await devices()).toBe(before);
    expect(await countRows(h, 'device_auth_codes', 'family_id = $1 and used_at is null', [g.familyId])).toBe(1);
    expect((await kid.request('POST', ApiPaths.deviceCodesRedeem, { code })).status).toBe(200);
  });

  it('device code issue, revoke and revoke-all leave nothing behind when they fail', async () => {
    const g = await newGuardian(h);
    const kid = await codeDevice(h, g.browser);
    const kidDevice = (await sql<{ id: string }>(h, "select id from device_sessions where family_id = $1 and origin = 'device_code'", [g.familyId]))[0]!;
    const codes = () => countRows(h, 'device_auth_codes', 'family_id = $1', [g.familyId]);
    const codesBefore = await codes();
    expect((await withAuditFault(h, 1, () => g.browser.request('POST', ApiPaths.deviceCodes, {}))).status).toBe(500);
    expect(await codes()).toBe(codesBefore);

    expect((await withAuditFault(h, 1, () => g.browser.request('POST', ApiPaths.deviceRevoke(kidDevice.id), {}))).status).toBe(500);
    expect((await kid.request('GET', ApiPaths.device)).status).toBe(200);
    expect((await withAuditFault(h, 1, () => g.browser.request('POST', ApiPaths.devicesRevokeAll, { includeCurrent: true }))).status).toBe(500);
    expect((await kid.request('GET', ApiPaths.device)).status).toBe(200);
    expect((await g.browser.request('GET', ApiPaths.device)).status).toBe(200);
    expect(await countRows(h, 'device_sessions', 'family_id = $1 and revoked_at is not null', [g.familyId])).toBe(0);

    expect((await g.browser.request('POST', ApiPaths.devicesRevokeAll, {})).status).toBe(200);
    expect((await kid.request('GET', ApiPaths.device)).status).toBe(401);
  });

  it('child create, archive and restore: no partial profile, no half-flipped state', async () => {
    const g = await newGuardian(h);
    const nick = `rb${rid()}`;
    const profiles = () => countRows(h, 'child_profiles', 'family_id = $1', [g.familyId]);
    expect((await withAuditFault(h, 1, () => g.browser.request('POST', ApiPaths.familyChildren, { nickname: nick }))).status).toBe(500);
    expect(await profiles()).toBe(0);
    expect(await countRows(h, 'players', 'nickname = $1', [nick])).toBe(0);

    const child = await addChild(g.browser, nick);
    expect((await withAuditFault(h, 1, () => g.browser.request('POST', ApiPaths.familyChildArchive(child.id), {}))).status).toBe(500);
    expect(await countRows(h, 'child_profiles', 'id = $1 and archived_at is null', [child.id])).toBe(1);
    await g.browser.request('POST', ApiPaths.familyChildArchive(child.id), {});
    expect((await withAuditFault(h, 1, () => g.browser.request('POST', ApiPaths.familyChildRestore(child.id), {}))).status).toBe(500);
    expect(await countRows(h, 'child_profiles', 'id = $1 and archived_at is not null', [child.id])).toBe(1);
  });

  it('PIN set, clear and lock: a failure leaves the previous PIN state exactly as it was', async () => {
    const g = await newGuardian(h);
    const child = await addChild(g.browser);
    expect((await withAuditFault(h, 1, () => g.browser.request('POST', ApiPaths.familyChildPin(child.id), { pin: PIN }))).status).toBe(500);
    expect((await pinState(h, child.id)).pin_hash).toBeNull();

    await g.browser.request('POST', ApiPaths.familyChildPin(child.id), { pin: PIN });
    const set = await pinState(h, child.id);
    expect((await withAuditFault(h, 1, () => g.browser.request('POST', ApiPaths.familyChildPin(child.id), { pin: '9136' }))).status).toBe(500);
    expect((await withAuditFault(h, 1, () => g.browser.request('DELETE', ApiPaths.familyChildPin(child.id)))).status).toBe(500);
    expect(await pinState(h, child.id)).toEqual(set);

    const kid = await codeDevice(h, g.browser);
    for (let i = 0; i < 4; i += 1) expect((await switchTo(kid, child.id, WRONG)).status).toBe(403);
    // The fifth wrong guess would lock; if recording that lock fails, the count does not move either.
    expect((await withAuditFault(h, 1, () => switchTo(kid, child.id, WRONG))).status).toBe(500);
    expect(await pinState(h, child.id)).toMatchObject({ pin_failures: 4, pin_locked_until: null });
    expect((await switchTo(kid, child.id, WRONG)).status).toBe(403);
    expect((await pinState(h, child.id)).pin_locked_until).not.toBeNull();
  });

  it('guest claim: no profile, the guest session stays live, the device keeps its profile', async () => {
    const g = await newGuardian(h);
    const browser = await newPlayer(h, freshAddress());
    const playerId = await playerIdOf(browser);
    await signInGuardian(h, { browser, email: g.email });
    const res = await withAuditFault(h, 1, () => browser.request('POST', ApiPaths.familyChildrenFromGuest, { nickname: 'Mia' }));
    expect(res.status).toBe(500);
    expect(await countRows(h, 'child_profiles', 'player_id = $1', [playerId])).toBe(0);
    expect(await countRows(h, 'guest_sessions', 'player_id = $1 and revoked_at is null', [playerId])).toBe(1);
    expect(browser.cookie).toBeDefined(); // the failed claim did not clear the guest cookie
    expect((await browser.request('GET', ApiPaths.device)).body.activeChildId).toBeNull();
    expect((await browser.request('POST', ApiPaths.familyChildrenFromGuest, { nickname: 'Mia' })).status).toBe(201);
  });

  it('legacy family claim, kid link and claim-code redemption: all or nothing, credentials not burned', async () => {
    const email = uniqueEmail('lg');
    const lf = `hq-fam-${rid()}`;
    const kidId = `hq-kid-${rid()}`;
    await loadLegacyManifest(h.database.db, h.clock, PEPPER, { version: 1, families: [{ legacyFamilyId: lf, guardianEmail: email, kids: [{ legacyKidId: kidId }] }] });
    const { browser } = await signInGuardian(h, { email });
    const status = async () => (await sql<{ status: string }>(h, 'select status from legacy_families where legacy_family_id = $1', [lf]))[0]!.status;

    expect((await withAuditFault(h, 1, () => browser.request('POST', ApiPaths.legacyClaim, {}))).status).toBe(500);
    expect(await status()).toBe('unclaimed');
    expect((await browser.request('POST', ApiPaths.legacyClaim, {})).status).toBe(201);

    const kid = (await sql<{ id: string }>(h, 'select id from legacy_kids where legacy_kid_id = $1', [kidId]))[0]!;
    const nick = `lk${rid()}`;
    expect((await withAuditFault(h, 1, () => browser.request('POST', ApiPaths.legacyKidLink(kid.id), { nickname: nick }))).status).toBe(500);
    expect(await countRows(h, 'legacy_kids', 'id = $1 and child_profile_id is null and linked_at is null', [kid.id])).toBe(1);
    expect(await countRows(h, 'players', 'nickname = $1', [nick])).toBe(0);
    expect((await browser.request('POST', ApiPaths.legacyKidLink(kid.id), { nickname: nick })).status).toBe(201);

    // Operator code: the redeeming transaction writes two audit rows; fail the second.
    const other = `hq-fam-${rid()}`;
    await loadLegacyManifest(h.database.db, h.clock, PEPPER, { version: 1, families: [{ legacyFamilyId: other, guardianEmail: uniqueEmail('old'), kids: [{ legacyKidId: `hq-kid-${rid()}` }] }] });
    const { code } = await issueLegacyClaimCode(h.database.db, h.clock, h.identity!.keys, { legacyFamilyId: other, days: 7 });
    const newcomer = await newGuardian(h);
    const row = async () => (await sql<{ status: string; used: Date | null }>(h,
      'select f.status, (select used_at from legacy_claim_codes c where c.legacy_family_row_id = f.id) as used from legacy_families f where legacy_family_id = $1', [other]))[0]!;
    expect((await withAuditFault(h, 2, () => newcomer.browser.request('POST', ApiPaths.legacyClaimCode, { code }))).status).toBe(500);
    expect(await row()).toMatchObject({ status: 'unclaimed', used: null });
    expect(await actionsOf(h, newcomer.familyId)).not.toContain('legacy.family_claimed');
    expect((await newcomer.browser.request('POST', ApiPaths.legacyClaimCode, { code })).status).toBe(201);
  });

  it('operator tooling (manifest load, code issue, code revoke) is atomic too', async () => {
    const label = `rb-${rid()}`;
    const lf = `hq-fam-${rid()}`;
    const manifest = { version: 1, families: [{ legacyFamilyId: lf, guardianEmail: uniqueEmail('op'), kids: [{ legacyKidId: `hq-kid-${rid()}` }] }] };
    await expect(loadLegacyManifest(faultyDb(h.database.db, 1), h.clock, PEPPER, manifest, { loadedBy: label })).rejects.toThrow();
    expect(await countRows(h, 'legacy_batches', 'loaded_by = $1', [label])).toBe(0);
    expect(await countRows(h, 'legacy_families', 'legacy_family_id = $1', [lf])).toBe(0);
    await loadLegacyManifest(h.database.db, h.clock, PEPPER, manifest, { loadedBy: label });

    const codes = () => countRows(h, 'legacy_claim_codes c', 'exists (select 1 from legacy_families f where f.id = c.legacy_family_row_id and f.legacy_family_id = $1)', [lf]);
    await expect(issueLegacyClaimCode(faultyDb(h.database.db, 1), h.clock, h.identity!.keys, { legacyFamilyId: lf, days: 7 })).rejects.toThrow();
    expect(await codes()).toBe(0);
    await issueLegacyClaimCode(h.database.db, h.clock, h.identity!.keys, { legacyFamilyId: lf, days: 7 });
    await expect(revokeLegacyClaimCodes(faultyDb(h.database.db, 1), h.clock, lf)).rejects.toThrow();
    expect(await countRows(h, 'legacy_claim_codes c', 'revoked_at is not null and exists (select 1 from legacy_families f where f.id = c.legacy_family_row_id and f.legacy_family_id = $1)', [lf])).toBe(0);
  });
});
