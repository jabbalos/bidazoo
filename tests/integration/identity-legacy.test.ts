import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiPaths } from '@bidazoo/contracts';
import {
  ManifestError, issueLegacyClaimCode, legacyMatchFor, loadLegacyManifest, revokeLegacyClaimCodes,
} from '@bidazoo/api/identity';
import {
  HAS_DB, PATHS, TestBrowser, TEST_IDENTITY_SECRET, countRows, deviceBrowser, freshAddress, makeHarness, newPlayer, playSession,
  playerIdOf, signInGuardian, sql, uniqueEmail, type Harness,
} from './support/harness';

const PEPPER = 'legacy-pepper-0123456789abcdef0123456789abcdef';
const rid = () => randomBytes(5).toString('hex');
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

interface FamilySpec {
  legacyFamilyId: string;
  guardianEmail: string;
  kids: Array<{ legacyKidId: string; username?: string; gradeBand?: string }>;
}
const family = (email: string, kidCount = 2): FamilySpec => {
  const id = rid();
  return {
    legacyFamilyId: `hq-fam-${id}`,
    guardianEmail: email,
    kids: Array.from({ length: kidCount }, (_, i) => ({ legacyKidId: `hq-kid-${id}-${i}`, username: `kid${i}_${id}`, gradeBand: String(3 + i) })),
  };
};
const load = (h: Harness, families: unknown[], extra: Record<string, unknown> = {}) =>
  loadLegacyManifest(h.database.db, h.clock, PEPPER, { version: 1, families, ...extra }, { loadedBy: 'test' });
const issue = (h: Harness, legacyFamilyId: string, days = 7) =>
  issueLegacyClaimCode(h.database.db, h.clock, h.identity!.keys, { legacyFamilyId, days });
const claim = (b: TestBrowser) => b.request('POST', ApiPaths.legacyClaim, {});
const claimCode = (b: TestBrowser, code: string) => b.request('POST', ApiPaths.legacyClaimCode, { code });
const legacyRow = async (h: Harness, legacyFamilyId: string) =>
  (await sql(h, 'select * from legacy_families where legacy_family_id = $1', [legacyFamilyId]))[0] as Record<string, any>;

/** Every table the legacy feature may touch, as JSON, for leak scans. */
async function legacyDump(h: Harness): Promise<string> {
  const parts: unknown[] = [];
  for (const t of ['legacy_batches', 'legacy_families', 'legacy_kids', 'legacy_claim_codes', 'audit_events', 'identity_throttles']) {
    parts.push(await sql(h, `select * from ${t}`));
  }
  return JSON.stringify(parts);
}

describe.skipIf(!HAS_DB)('legacy manifest import', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } } });
  });
  afterAll(async () => {
    await h.close();
  });

  it('normalizes emails exactly like guardian sign-in, and stores only a keyed HMAC', async () => {
    const email = uniqueEmail('norm');
    const f = family(`  ${email.toUpperCase()} `);
    await load(h, [f]);
    const row = await legacyRow(h, f.legacyFamilyId);
    expect(row.email_match_hmac).toMatch(/^[0-9a-f]{64}$/);
    expect(row.email_match_hmac).toBe(legacyMatchFor(PEPPER, email));
    expect(legacyMatchFor(PEPPER, ` ${email.toUpperCase()}\t`)).toBe(row.email_match_hmac);
    // Not a plain hash of the address, and it depends on the pepper.
    expect(row.email_match_hmac).not.toBe(sha256(email));
    expect(legacyMatchFor(`${PEPPER}-other`, email)).not.toBe(row.email_match_hmac);
    expect(legacyMatchFor(PEPPER, 'not an email')).toBeNull();
  });

  it('never retains the plaintext email (or its local part) anywhere in the legacy tables or audit', async () => {
    const email = uniqueEmail('plain');
    const f = family(email);
    const summary = await load(h, [f]);
    const dump = await legacyDump(h);
    expect(dump).not.toContain(email);
    expect(dump).not.toContain(email.split('@')[0] as string);
    const audit = await sql(h, "select * from audit_events where action = 'legacy.batch_loaded' and subject_id = $1", [summary.batchId]);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actor_type).toBe('operator');
    expect(JSON.stringify(audit)).not.toContain(legacyMatchFor(PEPPER, email) as string);
  });

  it('persists exactly the approved fields, and no column that could hold credentials or progress', async () => {
    const cols = await sql<{ table_name: string; column_name: string }>(
      h,
      "select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name like 'legacy_%' order by 1, 2",
    );
    const forbidden = new Set(['pin', 'salt', 'password', 'passwd', 'cookie', 'token', 'session', 'coin', 'coins', 'xp', 'mastery', 'streak',
      'badge', 'badges', 'inventory', 'answer', 'answers', 'marketing', 'parent', 'name', 'fullname']);
    const tokens = cols.flatMap((c) => c.column_name.split('_'));
    expect(tokens.filter((t) => forbidden.has(t))).toEqual([]);
    expect(cols.map((c) => c.column_name).filter((n) => n.includes('email'))).toEqual(['email_match_hmac']);
    const byTable = (t: string) => cols.filter((c) => c.table_name === t).map((c) => c.column_name);
    expect(byTable('legacy_kids')).toEqual(
      expect.arrayContaining(['id', 'legacy_family_row_id', 'legacy_kid_id', 'legacy_username', 'grade_band', 'child_profile_id', 'linked_at']),
    );
    expect(byTable('legacy_kids')).toHaveLength(7);
    expect(byTable('legacy_families')).toHaveLength(10);
  });

  it('reloading the same export is idempotent and never disturbs a claimed family', async () => {
    const f = family(uniqueEmail('idem'));
    const first = await load(h, [f]);
    expect(first).toMatchObject({ insertedFamilies: 1, insertedKids: 2, unchangedFamilies: 0 });
    const again = await load(h, [f]);
    expect(again).toMatchObject({ insertedFamilies: 0, insertedKids: 0, unchangedFamilies: 1 });
    expect(await countRows(h, 'legacy_families', 'legacy_family_id = $1', [f.legacyFamilyId])).toBe(1);
    expect(await countRows(h, 'legacy_kids', 'legacy_kid_id like $1', [`${f.kids[0]?.legacyKidId.slice(0, -2)}%`])).toBe(2);

    const { browser } = await signInGuardian(h, { email: f.guardianEmail });
    expect((await claim(browser)).status).toBe(201);
    const claimed = await legacyRow(h, f.legacyFamilyId);
    const more = await load(h, [{ ...f, kids: [...f.kids, { legacyKidId: `${f.kids[0]?.legacyKidId}-late` }] }]);
    expect(more).toMatchObject({ insertedFamilies: 0, insertedKids: 1, unchangedFamilies: 1 });
    expect(await legacyRow(h, f.legacyFamilyId)).toEqual(claimed);
  });

  it('rejects duplicates inside a manifest and writes nothing', async () => {
    const batches = () => countRows(h, 'legacy_batches');
    const before = await batches();
    const a = family(uniqueEmail('dup'));
    const dupFamily = { ...family(uniqueEmail('dup2')), legacyFamilyId: a.legacyFamilyId };
    const dupKid = { ...family(uniqueEmail('dup3')), kids: [{ legacyKidId: a.kids[0]!.legacyKidId }] };
    const dupEmail = family(a.guardianEmail.toUpperCase());
    for (const bad of [dupFamily, dupKid, dupEmail]) {
      await expect(load(h, [a, bad])).rejects.toBeInstanceOf(ManifestError);
    }
    expect(await batches()).toBe(before);
    expect(await countRows(h, 'legacy_families', 'legacy_family_id = $1', [a.legacyFamilyId])).toBe(0);
  });

  it('rejects a malformed manifest atomically, with error text that never echoes values', async () => {
    const good = family(uniqueEmail('good'));
    const secretEmail = uniqueEmail('secret');
    const cases: unknown[] = [
      [good, { ...family(secretEmail), guardianEmail: 'nope' }],
      [good, { ...family(secretEmail), legacyFamilyId: 'has space' }],
      [good, { ...family(secretEmail), kids: [{ legacyKidId: '' }] }],
      [good, { ...family(secretEmail), kids: 'x' }],
      [good, { ...family(secretEmail), kids: Array.from({ length: 21 }, (_, i) => ({ legacyKidId: `k${rid()}${i}` })) }],
      [good, { ...family(secretEmail), kids: [{ legacyKidId: `k${rid()}`, username: 'x'.repeat(41) }] }],
      [good, 'not an object'],
    ];
    for (const families of cases) {
      const err = await load(h, families as unknown[]).then(() => null, (e: unknown) => e);
      expect(err).toBeInstanceOf(ManifestError);
      expect((err as Error).message).not.toContain(secretEmail);
      expect((err as Error).message).not.toContain('has space');
      expect(await countRows(h, 'legacy_families', 'legacy_family_id = $1', [good.legacyFamilyId])).toBe(0);
    }
    for (const root of [{ version: 2, families: [] }, { families: [] }, { version: 1 }, { version: 1, families: [], exportedAt: 'soon' }]) {
      await expect(loadLegacyManifest(h.database.db, h.clock, PEPPER, root)).rejects.toBeInstanceOf(ManifestError);
    }
  });

  it('rejects any field that could carry credentials or progress, whole file, naming no field', async () => {
    const forbidden = ['pin', 'pinHash', 'pinSalt', 'passwordHash', 'cookie', 'sessionToken', 'coins', 'xp', 'mastery', 'badges',
      'streak', 'inventory', 'answers', 'marketingOptIn', 'parentName', 'email'];
    for (const key of forbidden) {
      for (const place of ['root', 'family', 'kid'] as const) {
        const f = family(uniqueEmail('forb'), 1);
        const manifest: any = { version: 1, families: [f] };
        if (place === 'root') manifest[key] = 'x';
        if (place === 'family') (f as any)[key] = 'x';
        if (place === 'kid') (f.kids[0] as any)[key] = 'x';
        const err = await loadLegacyManifest(h.database.db, h.clock, PEPPER, manifest).then(() => null, (e: unknown) => e);
        expect(err).toBeInstanceOf(ManifestError);
        expect((err as Error).message).not.toContain(key);
        expect(await countRows(h, 'legacy_families', 'legacy_family_id = $1', [f.legacyFamilyId])).toBe(0);
      }
    }
  });

  it('rolls the whole load back when a later family conflicts with stored data', async () => {
    const existing = family(uniqueEmail('exist'));
    await load(h, [existing]);
    const fresh = family(uniqueEmail('fresh'));
    // Same legacy family, different guardian email: cannot silently re-key an existing row.
    const rekeyed = { ...existing, guardianEmail: uniqueEmail('changed') };
    await expect(load(h, [fresh, rekeyed])).rejects.toBeInstanceOf(ManifestError);
    expect(await countRows(h, 'legacy_families', 'legacy_family_id = $1', [fresh.legacyFamilyId])).toBe(0);
    // A new family claiming an email already used by a different legacy family.
    const clash = family(existing.guardianEmail);
    await expect(load(h, [fresh, clash])).rejects.toBeInstanceOf(ManifestError);
    expect(await countRows(h, 'legacy_families', 'legacy_family_id = $1', [fresh.legacyFamilyId])).toBe(0);
    // A kid id owned by another legacy family.
    const steal = { ...family(uniqueEmail('steal')), kids: [{ legacyKidId: existing.kids[0]!.legacyKidId }] };
    await expect(load(h, [steal])).rejects.toBeInstanceOf(ManifestError);
    expect(await countRows(h, 'legacy_families', 'legacy_family_id = $1', [steal.legacyFamilyId])).toBe(0);
  });
});

describe.skipIf(!HAS_DB)('legacy claim by verified email', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } } });
  });
  afterAll(async () => {
    await h.close();
  });

  it('only a signed-in guardian with current authority can ask: no device, no authority, guest, or unconsumed link all fail', async () => {
    const f = family(uniqueEmail('auth'));
    await load(h, [f]);
    const none = deviceBrowser(h);
    expect((await claim(none)).status).toBe(401);
    expect((await none.request('GET', ApiPaths.legacyOffer)).status).toBe(401);
    expect((await claim(await newPlayer(h))).status).toBe(401);

    // An emailed link that was requested but never opened proves nothing: no guardian, no device.
    const pending = deviceBrowser(h);
    await pending.request('POST', ApiPaths.guardianEmailLinks, { email: f.guardianEmail });
    expect((await claim(pending)).status).toBe(401);
    expect(await countRows(h, 'guardians', 'email = $1', [f.guardianEmail.toLowerCase()])).toBe(0);

    // A trusted device that is not a guardian-authorized one (a child device) is refused too.
    const { browser: other } = await signInGuardian(h);
    const code = (await other.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
    const kid = deviceBrowser(h);
    await kid.request('POST', ApiPaths.deviceCodesRedeem, { code });
    expect((await claim(kid)).status).toBe(403);
    expect((await legacyRow(h, f.legacyFamilyId)).status).toBe('unclaimed');
  });

  it('the matching verified guardian is offered, claims, and gets placeholder kids (no profiles, no players)', async () => {
    const f = family(`  ${uniqueEmail('ok').toUpperCase()}`);
    await load(h, [f]);
    const { browser } = await signInGuardian(h, { email: f.guardianEmail });
    const offer = await browser.request('GET', ApiPaths.legacyOffer);
    expect(offer.body.offer.childCount).toBe(2);
    expect(offer.body.offer.kids.every((k: any) => k.childProfileId === null)).toBe(true);
    expect(offer.body.offer.kids.map((k: any) => k.username).sort()).toEqual(f.kids.map((k) => k.username).sort());
    expect(Object.keys(offer.body.offer.kids[0]).sort()).toEqual(['childProfileId', 'gradeBand', 'id', 'username']);

    const res = await claim(browser);
    expect(res.status).toBe(201);
    expect(res.body.kids).toHaveLength(2);
    const row = await legacyRow(h, f.legacyFamilyId);
    expect(row).toMatchObject({ status: 'claimed', claim_method: 'verified-email-match' });
    expect(row.family_id).not.toBeNull();
    // Placeholders only: the claim made no child profile and no player for the family.
    expect(await countRows(h, 'child_profiles', 'family_id = $1', [row.family_id])).toBe(0);
    expect((await browser.request('GET', ApiPaths.family)).body.children).toEqual([]);
  });

  it('a different verified guardian cannot claim, and learns nothing: the answer equals "no match"', async () => {
    const f = family(uniqueEmail('target'));
    await load(h, [f]);
    const { browser: stranger } = await signInGuardian(h);
    const nobody = await claim(stranger);
    expect(nobody.status).toBe(404);
    expect((await stranger.request('GET', ApiPaths.legacyOffer)).body).toEqual({ offer: null });
    expect((await legacyRow(h, f.legacyFamilyId)).status).toBe('unclaimed');
    // A loaded-but-unmatched address gives exactly the same body as an address with no record at all.
    const { browser: nothingLoaded } = await signInGuardian(h);
    expect((await claim(nothingLoaded)).body).toEqual(nobody.body);
  });

  it('a replay by the owning family is idempotent: same kids, one audit event', async () => {
    const f = family(uniqueEmail('replay'));
    await load(h, [f]);
    const { browser } = await signInGuardian(h, { email: f.guardianEmail });
    const first = await claim(browser);
    const again = await claim(browser);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    const row = await legacyRow(h, f.legacyFamilyId);
    expect(await countRows(h, 'audit_events', "action = 'legacy.family_claimed' and subject_id = $1", [row.id])).toBe(1);
    // Signing in again on another device of the same family also sees the same, claimed, family.
    const { browser: second } = await signInGuardian(h, { email: f.guardianEmail });
    expect((await claim(second)).status).toBe(200);
  });

  it("a second family cannot claim an already-claimed legacy family, by email or by code, and sees only a generic answer", async () => {
    const f = family(uniqueEmail('owned'));
    await load(h, [f]);
    const code = (await issue(h, f.legacyFamilyId)).code; // issued while still unclaimed
    const { browser: owner } = await signInGuardian(h, { email: f.guardianEmail });
    expect((await claim(owner)).status).toBe(201);
    const { browser: rival } = await signInGuardian(h);
    const viaCode = await claimCode(rival, code);
    expect(viaCode.status).toBe(400);
    expect(viaCode.body.error.code).toBe('link_invalid');
    expect((await claim(rival)).status).toBe(404);
    const text = viaCode.raw + JSON.stringify(viaCode.headers);
    expect(text).not.toContain(f.legacyFamilyId);
    expect(text).not.toContain(f.guardianEmail);
    expect((await legacyRow(h, f.legacyFamilyId)).family_id).not.toBeNull();
    expect(await countRows(h, 'legacy_families', 'legacy_family_id = $1 and family_id is not null', [f.legacyFamilyId])).toBe(1);
  });

  it('concurrent claims serialize: the same family twice gives 201 + 200; two families racing give exactly one winner', async () => {
    const f = family(uniqueEmail('race'));
    await load(h, [f]);
    const { browser } = await signInGuardian(h, { email: f.guardianEmail });
    const twin = deviceBrowser(h);
    twin.deviceCookie = browser.deviceCookie;
    const both = await Promise.all([claim(browser), claim(twin)]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 201]);
    const row = await legacyRow(h, f.legacyFamilyId);
    expect(await countRows(h, 'audit_events', "action = 'legacy.family_claimed' and subject_id = $1", [row.id])).toBe(1);

    const g = family(uniqueEmail('race2'));
    await load(h, [g]);
    const code = (await issue(h, g.legacyFamilyId)).code;
    const { browser: byEmail } = await signInGuardian(h, { email: g.guardianEmail });
    const { browser: byCode } = await signInGuardian(h);
    const results = await Promise.all([claim(byEmail), claimCode(byCode, code)]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status !== 201)).toHaveLength(1);
    expect(await countRows(h, 'legacy_families', 'legacy_family_id = $1 and status = $2', [g.legacyFamilyId, 'claimed'])).toBe(1);
    // The loser did not burn the code if it was not the winner of the claim.
    const codeRow = (await sql(h, 'select used_at from legacy_claim_codes where legacy_family_row_id = (select id from legacy_families where legacy_family_id = $1)', [g.legacyFamilyId]))[0];
    expect((codeRow?.used_at !== null)).toBe(results[1]?.status === 201);
  });

  it('a second guardian is never matched from old data: only the loaded address ever matches', async () => {
    const f = family(uniqueEmail('first'));
    await load(h, [f]);
    const { browser: second } = await signInGuardian(h, { email: uniqueEmail('spouse') });
    expect((await claim(second)).status).toBe(404);
    expect((await second.request('GET', ApiPaths.legacyOffer)).body.offer).toBeNull();
  });
});

describe.skipIf(!HAS_DB)('legacy kid linking (explicit, fresh players)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } } });
  });
  afterAll(async () => {
    await h.close();
  });

  async function claimed() {
    const f = family(uniqueEmail('link'));
    await load(h, [f]);
    const { browser } = await signInGuardian(h, { email: f.guardianEmail });
    const res = await claim(browser);
    return { f, browser, kids: res.body.kids as Array<{ id: string; username: string }> };
  }
  const link = (b: TestBrowser, kidId: string, nickname = 'Mia') =>
    b.request('POST', ApiPaths.legacyKidLink(kidId), { nickname });

  it('links a kid to a NEW child profile on a FRESH player with no history, once', async () => {
    const { browser, kids } = await claimed();
    const res = await link(browser, kids[0]!.id, 'Mia');
    expect(res.status).toBe(201);
    expect(res.body.child).toMatchObject({ nickname: 'Mia', hasPin: false, archived: false });
    const prof = (await sql(h, 'select player_id from child_profiles where id = $1', [res.body.child.id]))[0]!;
    for (const t of ['attempts', 'skill_mastery', 'wallet_transactions', 'xp_events', 'play_sessions']) {
      expect(await countRows(h, t, 'player_id = $1', [prof.player_id])).toBe(0);
    }
    expect(await countRows(h, 'guest_sessions', 'player_id = $1', [prof.player_id])).toBe(0);
    const kid = (await sql(h, 'select child_profile_id, linked_at from legacy_kids where id = $1', [kids[0]!.id]))[0]!;
    expect(kid.child_profile_id).toBe(res.body.child.id);
    // Replay: same profile, nothing new.
    const again = await link(browser, kids[0]!.id, 'Other Name');
    expect(again.status).toBe(200);
    expect(again.body.child).toEqual(res.body.child);
    expect(await countRows(h, 'child_profiles', 'player_id = $1', [prof.player_id])).toBe(1);
    // The other kid stays an unlinked placeholder.
    const offer = await browser.request('GET', ApiPaths.legacyOffer);
    expect(offer.body.offer.kids.filter((k: any) => k.childProfileId === null)).toHaveLength(1);
    // The new profile is playable as an ordinary BidaZoo child.
    const code = (await browser.request('POST', ApiPaths.deviceCodes, { childProfileId: res.body.child.id })).body.code as string;
    const kidDevice = deviceBrowser(h);
    await kidDevice.request('POST', ApiPaths.deviceCodesRedeem, { code });
    expect(await playerIdOf(kidDevice)).toBe(prof.player_id);
  });

  it("refuses another family's slot, an unclaimed family's slot, an unknown slot, and a body with a player id", async () => {
    const { kids } = await claimed();
    const { browser: rival } = await signInGuardian(h);
    expect((await link(rival, kids[0]!.id)).status).toBe(404);
    expect((await link(rival, crypto.randomUUID())).status).toBe(404);
    const unclaimed = family(uniqueEmail('open'));
    await load(h, [unclaimed]);
    const openKid = (await sql(h, 'select id from legacy_kids where legacy_kid_id = $1', [unclaimed.kids[0]!.legacyKidId]))[0]!.id as string;
    const { browser: wouldBe } = await signInGuardian(h, { email: unclaimed.guardianEmail });
    expect((await link(wouldBe, openKid)).status).toBe(404); // must claim the family first
    const { browser, kids: mine } = await claimed();
    const bad = await browser.request('POST', ApiPaths.legacyKidLink(mine[0]!.id), { nickname: 'Mia', playerId: crypto.randomUUID() });
    expect(bad.status).toBe(400);
    expect(await countRows(h, 'legacy_kids', 'id = $1 and child_profile_id is not null', [mine[0]!.id])).toBe(0);
  });

  it('two simultaneous links of one slot create one profile', async () => {
    const { browser, kids } = await claimed();
    const twin = deviceBrowser(h);
    twin.deviceCookie = browser.deviceCookie;
    const results = await Promise.all([link(browser, kids[0]!.id), link(twin, kids[0]!.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(results[0]!.body.child.id).toBe(results[1]!.body.child.id);
  });
});

describe.skipIf(!HAS_DB)('legacy claim by operator code', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } } });
  });
  afterAll(async () => {
    await h.close();
  });

  it('a valid code lets a guardian with a DIFFERENT email claim exactly that legacy family, once', async () => {
    const f = family(uniqueEmail('old'));
    const other = family(uniqueEmail('other'));
    await load(h, [f, other]);
    const { code } = await issue(h, f.legacyFamilyId);
    const { browser } = await signInGuardian(h); // a different, new email
    expect((await claim(browser)).status).toBe(404); // the email does not match...
    const res = await claimCode(browser, code);
    expect(res.status).toBe(201);
    expect(res.body.kids).toHaveLength(2);
    expect(await legacyRow(h, f.legacyFamilyId)).toMatchObject({ status: 'claimed', claim_method: 'operator-code' });
    expect((await legacyRow(h, other.legacyFamilyId)).status).toBe('unclaimed'); // scoped to one family
    expect(await countRows(h, 'audit_events', "action in ('legacy.claim_code_redeemed','legacy.family_claimed') and family_id = (select family_id from legacy_families where legacy_family_id = $1)", [f.legacyFamilyId])).toBe(2);
  });

  it('is stored hashed under a keyed hash, and appears raw nowhere (database, audit, throttles, responses)', async () => {
    const f = family(uniqueEmail('hash'));
    await load(h, [f]);
    const { code } = await issue(h, f.legacyFamilyId);
    const stored = (await sql(h, 'select code_hash from legacy_claim_codes where legacy_family_row_id = (select id from legacy_families where legacy_family_id = $1)', [f.legacyFamilyId]))[0]!.code_hash as string;
    const plain = code.replace(/-/g, '');
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    for (const wrong of [code, plain, sha256(code), sha256(plain), sha256(code.toUpperCase())]) expect(stored).not.toBe(wrong);
    const { browser } = await signInGuardian(h);
    const res = await claimCode(browser, code);
    expect(res.status).toBe(201);
    const dump = await legacyDump(h);
    expect(dump).not.toContain(code);
    expect(dump).not.toContain(plain);
    expect(res.raw + JSON.stringify(res.headers)).not.toContain(code);
  });

  it('accepts the code as typed (lowercase, no dashes)', async () => {
    const f = family(uniqueEmail('typed'));
    await load(h, [f]);
    const { code } = await issue(h, f.legacyFamilyId);
    const { browser } = await signInGuardian(h);
    expect((await claimCode(browser, code.toLowerCase().replace(/-/g, ''))).status).toBe(201);
  });

  it('expired, replayed, revoked, unknown and malformed codes all fail with the same generic answer', async () => {
    const a = family(uniqueEmail('exp'));
    const b = family(uniqueEmail('used'));
    const c = family(uniqueEmail('rev'));
    await load(h, [a, b, c]);
    const expired = (await issue(h, a.legacyFamilyId, 1)).code;
    const used = (await issue(h, b.legacyFamilyId)).code;
    const revoked = (await issue(h, c.legacyFamilyId)).code;
    expect(await revokeLegacyClaimCodes(h.database.db, h.clock, c.legacyFamilyId)).toBe(1);
    expect(await revokeLegacyClaimCodes(h.database.db, h.clock, c.legacyFamilyId)).toBe(0);
    const { browser: owner } = await signInGuardian(h);
    expect((await claimCode(owner, used)).status).toBe(201);
    h.clock.advance(2 * 86_400_000); // past the 1-day code, inside the 7-day ones
    const { browser } = await signInGuardian(h);
    const answers = [
      await claimCode(browser, expired),
      await claimCode(browser, used),
      await claimCode(browser, revoked),
      await claimCode(browser, 'ABCD-EFGH-JKMN'),
    ];
    for (const res of answers) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('link_invalid');
    }
    expect(new Set(answers.map((r) => JSON.stringify(r.body))).size).toBe(1);
    for (const bad of ['short', '', '!!!!-????-****', 'A'.repeat(49)]) expect((await claimCode(browser, bad)).status).toBe(400);
    for (const f of [a, c]) expect((await legacyRow(h, f.legacyFamilyId)).status).toBe('unclaimed');
  });

  it('cannot issue for a claimed or unknown family, and the CLI helpers reject bad input', async () => {
    const f = family(uniqueEmail('issue'));
    await load(h, [f]);
    const { browser } = await signInGuardian(h, { email: f.guardianEmail });
    await claim(browser);
    await expect(issue(h, f.legacyFamilyId)).rejects.toBeInstanceOf(ManifestError);
    await expect(issue(h, 'no-such-family')).rejects.toBeInstanceOf(ManifestError);
    await expect(issue(h, 'bad id!')).rejects.toBeInstanceOf(ManifestError);
    const g = family(uniqueEmail('days'));
    await load(h, [g]);
    await expect(issue(h, g.legacyFamilyId, 0)).rejects.toBeInstanceOf(ManifestError);
    await expect(issue(h, g.legacyFamilyId, 31)).rejects.toBeInstanceOf(ManifestError);
  });

  it('is only a claim authorization: not a device code, not a login, no HTTP issuing route', async () => {
    const f = family(uniqueEmail('scope'));
    await load(h, [f]);
    const { code } = await issue(h, f.legacyFamilyId);
    const anon = deviceBrowser(h);
    expect((await claimCode(anon, code)).status).toBe(401); // no signed-in guardian, no effect
    expect((await anon.request('POST', ApiPaths.deviceCodesRedeem, { code })).status).toBe(400);
    expect((await anon.request('POST', ApiPaths.guardianEmailLinkConsume, { token: code })).status).toBe(400);
    expect(anon.deviceCookie).toBeUndefined();
    expect((await legacyRow(h, f.legacyFamilyId)).status).toBe('unclaimed');
    // A child device (no authority) cannot use it either.
    const { browser: guardian } = await signInGuardian(h);
    const dc = (await guardian.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
    const kid = deviceBrowser(h);
    await kid.request('POST', ApiPaths.deviceCodesRedeem, { code: dc });
    expect((await claimCode(kid, code)).status).toBe(403);
    // Nothing the API exposes can create a claim code.
    for (const path of ['/api/v1/legacy/claim-codes', '/api/v1/legacy/codes', '/api/v1/legacy/issue']) {
      expect((await guardian.request('POST', path, {})).status).toBe(404);
    }
  });

  it('attempt limits are durable: they survive an API restart, and a throttled attempt spends no code', async () => {
    const secret = `${TEST_IDENTITY_SECRET}-legacy-${rid()}`;
    const ip = freshAddress();
    const config = { secret, legacyMatchPepper: PEPPER };
    const limits = { claimCodeIp: { max: 3, windowSeconds: 3600 } };
    const f = family(uniqueEmail('limit'));
    const h1 = await makeHarness({ identity: { config, limits } });
    let valid = '';
    let deviceCookie: string | undefined;
    try {
      await load(h1, [f]);
      valid = (await issue(h1, f.legacyFamilyId)).code;
      const { browser } = await signInGuardian(h1);
      browser.remoteAddress = ip;
      deviceCookie = browser.deviceCookie;
      for (let i = 0; i < 3; i += 1) expect((await claimCode(browser, 'ABCD-EFGH-JKMN')).status).toBe(400);
      expect((await claimCode(browser, valid)).status).toBe(429);
    } finally {
      await h1.close();
    }
    const h2 = await makeHarness({ identity: { config, limits } });
    try {
      const again = new TestBrowser(h2.app, h2.ctx.cookie.name);
      again.deviceCookie = deviceCookie;
      again.remoteAddress = ip;
      const blocked = await claimCode(again, valid);
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect((await legacyRow(h2, f.legacyFamilyId)).status).toBe('unclaimed');
      expect((await sql(h2, 'select used_at from legacy_claim_codes where legacy_family_row_id = $1', [(await legacyRow(h2, f.legacyFamilyId)).id]))[0]!.used_at).toBeNull();
      // Another address is unaffected, and the window eventually reopens.
      const elsewhere = new TestBrowser(h2.app, h2.ctx.cookie.name);
      elsewhere.deviceCookie = deviceCookie;
      elsewhere.remoteAddress = freshAddress();
      expect((await claimCode(elsewhere, valid)).status).toBe(201);
    } finally {
      await h2.close();
    }
  });
});

describe.skipIf(!HAS_DB)('legacy preservation and privacy', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } } });
  });
  afterAll(async () => {
    await h.close();
  });

  async function playerSnapshot(playerId: string): Promise<string> {
    const parts: unknown[] = [];
    for (const table of ['players', 'attempts', 'skill_mastery', 'wallet_transactions', 'xp_events', 'play_sessions', 'guest_sessions']) {
      const key = table === 'players' ? 'id' : 'player_id';
      parts.push([table, await sql(h, `select xmin::text as xmin, * from ${table} where ${key} = $1 order by 2, 3`, [playerId])]);
    }
    return JSON.stringify(parts);
  }

  it("leaves an existing BidaZoo player, its history and its family untouched through load, claim, code and link", async () => {
    const email = uniqueEmail('keep');
    const guest = await newPlayer(h, freshAddress());
    await playSession(guest);
    const playerId = await playerIdOf(guest);
    const { email: _e } = await signInGuardian(h, { email, browser: guest });
    const kept = await guest.request('POST', ApiPaths.familyChildrenFromGuest, { nickname: 'Existing' });
    expect(kept.status).toBe(201);
    const before = await playerSnapshot(playerId);
    const profiles = await sql(h, 'select id, xmin::text as xmin from child_profiles where player_id = $1', [playerId]);
    const attempts = await countRows(h, 'attempts', 'player_id = $1', [playerId]);

    const f = family(email, 3);
    await load(h, [f]);
    expect((await claim(guest)).status).toBe(201);
    const other = family(uniqueEmail('byc'));
    await load(h, [other]);
    expect((await claimCode(guest, (await issue(h, other.legacyFamilyId)).code)).status).toBe(201);
    const kids = (await guest.request('GET', ApiPaths.legacyOffer)).body.offer.kids as Array<{ id: string }>;
    expect(kids).toHaveLength(5);
    const linked = await guest.request('POST', ApiPaths.legacyKidLink(kids[0]!.id), { nickname: 'Legacy One' });
    expect(linked.status).toBe(201);

    expect(await playerSnapshot(playerId)).toBe(before);
    expect(await countRows(h, 'attempts', 'player_id = $1', [playerId])).toBe(attempts);
    expect(await sql(h, 'select id, xmin::text as xmin from child_profiles where player_id = $1', [playerId])).toEqual(profiles);
    // The linked legacy child is a different, fresh player; the existing player is not re-pointed.
    const fresh = (await sql(h, 'select player_id from child_profiles where id = $1', [linked.body.child.id]))[0]!.player_id;
    expect(fresh).not.toBe(playerId);
  });

  it('claim and kid-list steps create no players and no profiles (only an explicit link does)', async () => {
    const f = family(uniqueEmail('noplayers'), 4);
    await load(h, [f]);
    const { browser, email } = await signInGuardian(h, { email: f.guardianEmail });
    const familyId = (await sql(h, 'select family_id from guardians where email = $1', [email.toLowerCase()]))[0]!.family_id as string;
    const marker = `Mk${rid()}`;
    await claim(browser);
    await browser.request('GET', ApiPaths.legacyOffer);
    expect(await countRows(h, 'child_profiles', 'family_id = $1', [familyId])).toBe(0);
    expect(await countRows(h, 'players', 'nickname = $1', [marker])).toBe(0);
    const kids = (await browser.request('GET', ApiPaths.legacyOffer)).body.offer.kids as Array<{ id: string }>;
    await browser.request('POST', ApiPaths.legacyKidLink(kids[0]!.id), { nickname: marker });
    expect(await countRows(h, 'players', 'nickname = $1', [marker])).toBe(1); // one link, one player; the other 3 kids made none
    expect(await countRows(h, 'child_profiles', 'family_id = $1', [familyId])).toBe(1);
  });

  it('leaks no email, key, code or hash in any response, header or audit row, and nothing extra across families', async () => {
    const f = family(uniqueEmail('privacy'));
    await load(h, [f]);
    const key = legacyMatchFor(PEPPER, f.guardianEmail) as string;
    const code = (await issue(h, f.legacyFamilyId)).code;
    const { browser: owner } = await signInGuardian(h, { email: f.guardianEmail });
    const outputs = [
      await owner.request('GET', ApiPaths.legacyOffer),
      await claim(owner),
      await claim(owner),
    ];
    const { browser: rival } = await signInGuardian(h);
    const rivalOutputs = [await claim(rival), await claimCode(rival, code), await rival.request('GET', ApiPaths.legacyOffer)];
    const kid = (await owner.request('GET', ApiPaths.legacyOffer)).body.offer.kids[0].id as string;
    rivalOutputs.push(await rival.request('POST', ApiPaths.legacyKidLink(kid), { nickname: 'x' }));
    const secrets = [f.guardianEmail, f.guardianEmail.split('@')[0]!, key, code, code.replace(/-/g, ''), f.legacyFamilyId, sha256(code)];
    for (const res of [...outputs, ...rivalOutputs]) {
      const text = res.raw + JSON.stringify(res.headers);
      for (const s of secrets) expect(text).not.toContain(s);
    }
    for (const res of rivalOutputs) {
      expect(res.raw).not.toMatch(/claimed|owner|family|legacy|hop/i);
    }
    const dump = await legacyDump(h);
    for (const s of [f.guardianEmail, code, code.replace(/-/g, '')]) expect(dump).not.toContain(s);
    const audits = await sql(h, "select meta from audit_events where action like 'legacy.%' and (family_id is null or family_id is not null)");
    for (const a of audits) expect(JSON.stringify(a)).not.toContain(key);
  });
});

describe.skipIf(!HAS_DB)('legacy: switched off', () => {
  it('with no LEGACY_MATCH_PEPPER the routes answer generically and claim nothing', async () => {
    const h = await makeHarness({ identity: {} });
    try {
      const { browser } = await signInGuardian(h);
      expect((await browser.request('GET', ApiPaths.legacyOffer)).body).toEqual({ offer: null });
      expect((await claim(browser)).status).toBe(404);
      expect((await claimCode(browser, 'ABCD-EFGH-JKMN')).status).toBe(400);
      expect((await browser.request('POST', ApiPaths.legacyKidLink(crypto.randomUUID()), { nickname: 'x' })).status).toBe(404);
    } finally {
      await h.close();
    }
  });

  it('with identity off there are no legacy routes at all', async () => {
    const h = await makeHarness();
    try {
      const b = deviceBrowser(h);
      expect((await b.request('GET', ApiPaths.legacyOffer)).status).toBe(404);
      expect((await b.request('POST', ApiPaths.legacyClaim, {})).status).toBe(404);
      expect((await b.request('POST', ApiPaths.legacyClaimCode, { code: 'ABCD-EFGH-JKMN' })).status).toBe(404);
      expect((await b.request('POST', ApiPaths.legacyKidLink(crypto.randomUUID()), { nickname: 'x' })).status).toBe(404);
      const guest = await newPlayer(h);
      await playSession(guest);
      expect((await guest.request('GET', PATHS.me)).status).toBe(200);
    } finally {
      await h.close();
    }
  });
});
