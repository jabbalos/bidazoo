import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiPaths } from '@bidazoo/contracts';
import { hashHumanCode, hashLegacyClaimCode, issueLegacyClaimCode, loadLegacyManifest, revokeLegacyClaimCodes } from '@bidazoo/api/identity';
import {
  HAS_DB, PATHS, TestBrowser, countRows, deviceBrowser, freshAddress, linkTokenFor, makeHarness, newPlayer, signInGuardian, sql,
  uniqueEmail, type Harness,
} from './support/harness';

const PEPPER = 'legacy-pepper-0123456789abcdef0123456789abcdef';
const rid = () => randomBytes(5).toString('hex');
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const PIN = '4827';
const status = (r: { status: number }) => r.status;
const shape = (r: { status: number; body: unknown; headers: Record<string, unknown> }) =>
  JSON.stringify({ status: r.status, body: r.body, retryAfter: r.headers['retry-after'] ?? null });

async function codeDevice(h: Harness, guardian: TestBrowser, childProfileId?: string): Promise<TestBrowser> {
  const code = (await guardian.request('POST', ApiPaths.deviceCodes, childProfileId ? { childProfileId } : {})).body.code as string;
  const kid = deviceBrowser(h);
  const res = await kid.request('POST', ApiPaths.deviceCodesRedeem, { code });
  if (res.status !== 200) throw new Error(`redeem failed ${res.status}`);
  return kid;
}
const addChild = async (b: TestBrowser, nickname = 'Mia') =>
  (await b.request('POST', ApiPaths.familyChildren, { nickname })).body.child as { id: string };
const deviceIdOf = async (h: Harness, cookie: string) =>
  (await sql<{ id: string }>(h, 'select id from device_sessions where token_hash = $1', [sha256(cookie)]))[0]!.id;

// ---------------------------------------------------------------------------------------------
// Route registration audit: every identity route has a declared authority level, and each level is enforced.
// ---------------------------------------------------------------------------------------------
type Level = 'public' | 'device' | 'guardian';
interface RouteSpec { method: 'GET' | 'POST' | 'DELETE'; template: string; level: Level; body?: unknown }
const TOKEN43 = 'A'.repeat(43);
const MATRIX: RouteSpec[] = [
  { method: 'POST', template: ApiPaths.guardianEmailLinks, level: 'public', body: { email: 'matrix@example.test' } },
  { method: 'POST', template: ApiPaths.guardianEmailLinkConsume, level: 'public', body: { token: TOKEN43 } },
  { method: 'POST', template: ApiPaths.deviceCodesRedeem, level: 'public', body: { code: 'ABCD-EFGH-JKMN' } },
  { method: 'GET', template: ApiPaths.device, level: 'device' },
  { method: 'POST', template: ApiPaths.deviceProfile, level: 'device', body: { childProfileId: '00000000-0000-4000-8000-000000000001' } },
  { method: 'GET', template: ApiPaths.family, level: 'guardian' },
  { method: 'POST', template: ApiPaths.familyChildren, level: 'guardian', body: { nickname: 'Kid' } },
  { method: 'POST', template: ApiPaths.familyChildrenFromGuest, level: 'guardian', body: { nickname: 'Kid' } },
  { method: 'POST', template: ApiPaths.familyChildPin(':childId'), level: 'guardian', body: { pin: '1234' } },
  { method: 'DELETE', template: ApiPaths.familyChildPin(':childId'), level: 'guardian' },
  { method: 'POST', template: ApiPaths.familyChildArchive(':childId'), level: 'guardian', body: {} },
  { method: 'POST', template: ApiPaths.familyChildRestore(':childId'), level: 'guardian', body: {} },
  { method: 'GET', template: ApiPaths.devices, level: 'guardian' },
  { method: 'POST', template: ApiPaths.deviceRevoke(':deviceId'), level: 'guardian', body: {} },
  { method: 'POST', template: ApiPaths.devicesRevokeAll, level: 'guardian', body: {} },
  { method: 'POST', template: ApiPaths.deviceCodes, level: 'guardian', body: {} },
  { method: 'GET', template: ApiPaths.legacyOffer, level: 'guardian' },
  { method: 'POST', template: ApiPaths.legacyClaim, level: 'guardian', body: {} },
  { method: 'POST', template: ApiPaths.legacyClaimCode, level: 'guardian', body: { code: 'ABCD-EFGH-JKMN' } },
  { method: 'POST', template: ApiPaths.legacyKidLink(':legacyKidId'), level: 'guardian', body: { nickname: 'Kid' } },
];
const IDENTITY_URL = /^\/api\/v1\/(guardian|family|device|devices|device-codes|legacy)(\/|$)/;
const concrete = (template: string) => template.replace(/:(childId|deviceId|legacyKidId)/g, () => randomUUID());
const hit = (b: TestBrowser, spec: RouteSpec) => b.request(spec.method, concrete(spec.template), spec.body);
const denied = (s: number) => s === 401 || s === 403 || s === 404;

describe.skipIf(!HAS_DB)('identity route registration and authority levels', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } } });
  });
  afterAll(async () => {
    await h.close();
  });

  it('declares an authority level for exactly the routes that are registered', () => {
    const registered = h.routes.filter((r) => IDENTITY_URL.test(r.url)).map((r) => `${r.method} ${r.url}`).sort();
    expect(registered.length).toBeGreaterThan(15);
    expect(registered).toEqual(MATRIX.map((m) => `${m.method} ${m.template}`).sort());
  });

  it('anonymous callers: only the public routes answer; everything else is 401', async () => {
    for (const spec of MATRIX) {
      const s = (await hit(deviceBrowser(h), spec)).status;
      if (spec.level === 'public') expect(denied(s), `${spec.method} ${spec.template}`).toBe(false);
      else expect(s, `${spec.method} ${spec.template}`).toBe(401);
    }
  });

  it('a guest cookie alone is not a device: device and guardian routes stay 401', async () => {
    const guest = await newPlayer(h, freshAddress());
    for (const spec of MATRIX.filter((m) => m.level !== 'public')) {
      expect((await hit(guest, spec)).status, `${spec.method} ${spec.template}`).toBe(401);
    }
  });

  it('a child device (no guardian authority) gets device routes but is 403 on every guardian route', async () => {
    const { browser: guardian } = await signInGuardian(h);
    const kid = await codeDevice(h, guardian);
    for (const spec of MATRIX) {
      const s = (await hit(kid, spec)).status;
      if (spec.level === 'guardian') expect(s, `${spec.method} ${spec.template}`).toBe(403);
      else expect(s === 401 || s === 403, `${spec.method} ${spec.template}`).toBe(false);
    }
  });

  it('a guardian device is never refused authority on any route', async () => {
    const { browser: guardian } = await signInGuardian(h);
    // (from-guest additionally needs a guest cookie, so it is 401 here for that reason alone.)
    for (const spec of MATRIX.filter((m) => m.template !== ApiPaths.devicesRevokeAll && m.template !== ApiPaths.familyChildrenFromGuest)) {
      const s = (await hit(guardian, spec)).status;
      expect(s === 401 || s === 403, `${spec.method} ${spec.template}`).toBe(false);
    }
    expect((await guardian.request('POST', ApiPaths.familyChildrenFromGuest, { nickname: 'Kid' })).status).toBe(401);
  });

  it('a revoked device fails immediately on every device and guardian route', async () => {
    const { browser: first, email } = await signInGuardian(h);
    const { browser: second } = await signInGuardian(h, { email });
    const firstId = await deviceIdOf(h, first.deviceCookie as string);
    expect((await second.request('POST', ApiPaths.deviceRevoke(firstId), {})).body).toEqual({ revoked: 1 });
    for (const spec of MATRIX.filter((m) => m.level !== 'public')) {
      expect((await hit(first, spec)).status, `${spec.method} ${spec.template}`).toBe(401);
    }
  });

  it('expired authority fails at once on guardian routes while device trust continues; an expired device is 401 everywhere', async () => {
    const t = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } } });
    try {
      const { browser: guardian } = await signInGuardian(t);
      const kid = await codeDevice(t, guardian);
      t.clock.advance(24 * 3_600_000); // exactly the authority window
      for (const spec of MATRIX.filter((m) => m.level === 'guardian')) {
        expect((await hit(guardian, spec)).status, `${spec.method} ${spec.template}`).toBe(403);
      }
      expect((await guardian.request('GET', ApiPaths.device)).status).toBe(200);
      expect((await kid.request('GET', ApiPaths.device)).status).toBe(200);
      t.clock.advanceDays(90);
      for (const spec of MATRIX.filter((m) => m.level !== 'public')) {
        expect((await hit(guardian, spec)).status, `${spec.method} ${spec.template}`).toBe(401);
      }
      expect((await kid.request('GET', ApiPaths.device)).status).toBe(401);
    } finally {
      await t.close();
    }
  });

  it('with identity disabled every identity route is a 404, even with forged cookies', async () => {
    const off = await makeHarness();
    try {
      const forged = new TestBrowser(off.app, off.ctx.cookie.name, 'bidazoo_device');
      forged.deviceCookie = randomBytes(32).toString('base64url');
      for (const spec of MATRIX) expect((await hit(forged, spec)).status, `${spec.method} ${spec.template}`).toBe(404);
      // The guest build is unchanged: a forged device cookie neither authenticates nor blocks a guest.
      const guest = await forged.request('POST', PATHS.guest, {});
      expect(guest.status).toBe(200);
      expect((await forged.request('GET', PATHS.me)).status).toBe(200);
    } finally {
      await off.close();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Failure-response consistency: a foreign object looks exactly like one that does not exist.
// ---------------------------------------------------------------------------------------------
describe.skipIf(!HAS_DB)('enumeration and cross-family denial', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } } });
  });
  afterAll(async () => {
    await h.close();
  });

  async function family() {
    const { browser, email } = await signInGuardian(h);
    const withPin = await addChild(browser, 'Pin');
    const noPin = await addChild(browser, 'Free');
    await browser.request('POST', ApiPaths.familyChildPin(withPin.id), { pin: PIN });
    const archived = await addChild(browser, 'Old');
    await browser.request('POST', ApiPaths.familyChildArchive(archived.id), {});
    const familyId = (await sql<{ family_id: string }>(h, 'select family_id from guardians where email = $1', [email]))[0]!.family_id;
    const deviceId = await deviceIdOf(h, browser.deviceCookie as string);
    return { browser, email, withPin, noPin, archived, familyId, deviceId };
  }

  /** Every state row of a family, with xmin so even a no-op update would show. */
  async function snapshot(familyId: string) {
    const parts: unknown[] = [];
    for (const [table, where] of [
      ['child_profiles', 'family_id = $1'], ['device_sessions', 'family_id = $1'], ['device_auth_codes', 'family_id = $1'],
      ['guardians', 'family_id = $1'], ['audit_events', 'family_id = $1'],
      ['legacy_families', 'family_id = $1'],
      ['players', 'id in (select player_id from child_profiles where family_id = $1)'],
    ] as const) {
      parts.push([table, await sql(h, `select xmin::text as xmin, * from ${table} where ${where} order by 2`, [familyId])]);
    }
    return JSON.stringify(parts);
  }

  it("another family's ids answer exactly like unknown ones, and change nothing", async () => {
    const a = await family();
    const b = await family();
    const kid = await codeDevice(h, a.browser);
    const bBefore = await snapshot(b.familyId);
    const aBefore = await snapshot(a.familyId);

    const probes: Array<[string, (id: { child: string; device: string }) => Promise<{ status: number; body: unknown; headers: Record<string, unknown> }>]> = [
      ['set PIN', (x) => a.browser.request('POST', ApiPaths.familyChildPin(x.child), { pin: '1357' })],
      ['clear PIN', (x) => a.browser.request('DELETE', ApiPaths.familyChildPin(x.child))],
      ['archive', (x) => a.browser.request('POST', ApiPaths.familyChildArchive(x.child), {})],
      ['restore', (x) => a.browser.request('POST', ApiPaths.familyChildRestore(x.child), {})],
      ['revoke device', (x) => a.browser.request('POST', ApiPaths.deviceRevoke(x.device), {})],
      ['issue code for profile', (x) => a.browser.request('POST', ApiPaths.deviceCodes, { childProfileId: x.child })],
      ['switch profile (guardian device)', (x) => a.browser.request('POST', ApiPaths.deviceProfile, { childProfileId: x.child })],
      ['switch profile with a PIN', (x) => kid.request('POST', ApiPaths.deviceProfile, { childProfileId: x.child, pin: PIN })],
    ];
    // Foreign profiles: one WITH a PIN and one without must be indistinguishable from each other and from a random id.
    for (const [name, probe] of probes) {
      const unknown = shape(await probe({ child: randomUUID(), device: randomUUID() }));
      for (const foreign of [b.withPin.id, b.noPin.id, b.archived.id]) {
        expect(shape(await probe({ child: foreign, device: b.deviceId })), name).toBe(unknown);
      }
    }
    expect(JSON.parse(shape(await probes[0]![1]({ child: b.withPin.id, device: b.deviceId }))).status).toBe(404);

    // Own archived profile is also just "not found" for switching and for naming in a code.
    const own = shape(await a.browser.request('POST', ApiPaths.deviceProfile, { childProfileId: randomUUID() }));
    expect(shape(await a.browser.request('POST', ApiPaths.deviceProfile, { childProfileId: a.archived.id }))).toBe(own);
    expect(shape(await a.browser.request('POST', ApiPaths.deviceCodes, { childProfileId: a.archived.id }))).toBe(
      shape(await a.browser.request('POST', ApiPaths.deviceCodes, { childProfileId: randomUUID() })),
    );

    // Nothing of B's changed, and nothing of A's changed either (the refused calls wrote nothing).
    expect(await snapshot(b.familyId)).toBe(bBefore);
    expect(await snapshot(a.familyId)).toBe(aBefore);
  });

  it('claiming a legacy kid or family never reveals who owns it or whether it exists', async () => {
    const a = await family();
    const b = await family();
    const lfB = `hq-fam-${rid()}`;
    const kidB = `hq-kid-${rid()}`;
    await loadLegacyManifest(h.database.db, h.clock, PEPPER, { version: 1, families: [{ legacyFamilyId: lfB, guardianEmail: b.email, kids: [{ legacyKidId: kidB }] }] });
    expect((await b.browser.request('POST', ApiPaths.legacyClaim, {})).status).toBe(201);
    const kidRow = (await sql<{ id: string }>(h, 'select id from legacy_kids where legacy_kid_id = $1', [kidB]))[0]!;
    const bBefore = await snapshot(b.familyId);

    // Kid link: another family's slot = unknown slot.
    expect(shape(await a.browser.request('POST', ApiPaths.legacyKidLink(kidRow.id), { nickname: 'X' }))).toBe(
      shape(await a.browser.request('POST', ApiPaths.legacyKidLink(randomUUID()), { nickname: 'X' })),
    );
    // Email claim: no match, and "already claimed by someone else" (b's address now claimed; a different family can't even match it).
    const loner = await signInGuardian(h);
    const noMatch = shape(await loner.browser.request('POST', ApiPaths.legacyClaim, {}));
    const lfC = `hq-fam-${rid()}`;
    const taken = await signInGuardian(h);
    await loadLegacyManifest(h.database.db, h.clock, PEPPER, { version: 1, families: [{ legacyFamilyId: lfC, guardianEmail: taken.email, kids: [] }] });
    await sql(h, "update legacy_families set status = 'withdrawn' where legacy_family_id = $1", [lfC]);
    expect(shape(await taken.browser.request('POST', ApiPaths.legacyClaim, {}))).toBe(noMatch); // withdrawn = no match
    expect(JSON.parse(noMatch).status).toBe(404);
    // Offer: nothing for a guardian with no match, whoever else matched.
    expect((await loner.browser.request('GET', ApiPaths.legacyOffer)).body).toEqual({ offer: null });
    expect((await a.browser.request('GET', ApiPaths.legacyOffer)).body).toEqual({ offer: null });
    expect(await snapshot(b.familyId)).toBe(bBefore);
  });

  it('every kind of dead code or link gets the same answer', async () => {
    const t = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } } });
    try {
      const { browser: guardian } = await signInGuardian(t);
      // Sign-in links: unknown, used, expired.
      const email = uniqueEmail('dead');
      const request = (b: TestBrowser, e: string) => b.request('POST', ApiPaths.guardianEmailLinks, { email: e });
      const first = deviceBrowser(t);
      await request(first, email);
      await t.identity!.mail.idle();
      const used = linkTokenFor(t, email);
      expect((await first.request('POST', ApiPaths.guardianEmailLinkConsume, { token: used })).status).toBe(200);
      await request(deviceBrowser(t), email);
      await t.identity!.mail.idle();
      const stale = linkTokenFor(t, email);
      t.clock.advance(15 * 60_000);
      const consume = (token: string) => deviceBrowser(t).request('POST', ApiPaths.guardianEmailLinkConsume, { token });
      const linkAnswers = [await consume(randomBytes(32).toString('base64url')), await consume(used), await consume(stale)].map(shape);
      expect(new Set(linkAnswers).size).toBe(1);
      expect(JSON.parse(linkAnswers[0]!).status).toBe(400);

      // Device codes: unknown, used, expired.
      const fresh = (await guardian.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
      const spent = (await guardian.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
      expect((await deviceBrowser(t).request('POST', ApiPaths.deviceCodesRedeem, { code: spent })).status).toBe(200);
      t.clock.advance(10 * 60_000);
      const redeem = (code: string) => deviceBrowser(t).request('POST', ApiPaths.deviceCodesRedeem, { code });
      const codeAnswers = [await redeem('ABCD-EFGH-JKMN'), await redeem(spent), await redeem(fresh)].map(shape);
      expect(new Set(codeAnswers).size).toBe(1);
      expect(JSON.parse(codeAnswers[0]!).status).toBe(400);
      expect(codeAnswers[0]).toBe(linkAnswers[0]); // and a dead link and a dead code read the same

      // Legacy claim codes: unknown, used by another family, revoked, expired, for a claimed family.
      const mk = async (days = 7) => {
        const lf = `hq-fam-${rid()}`;
        await loadLegacyManifest(t.database.db, t.clock, PEPPER, { version: 1, families: [{ legacyFamilyId: lf, guardianEmail: uniqueEmail('lc'), kids: [] }] });
        return { lf, ...(await issueLegacyClaimCode(t.database.db, t.clock, t.identity!.keys, { legacyFamilyId: lf, days })) };
      };
      const { browser: g2 } = await signInGuardian(t);
      const used2 = await mk();
      expect((await g2.request('POST', ApiPaths.legacyClaimCode, { code: used2.code })).status).toBe(201);
      const revoked = await mk();
      await revokeLegacyClaimCodes(t.database.db, t.clock, revoked.lf);
      const expired = await mk(1);
      t.clock.advanceDays(2);
      const { browser: g3 } = await signInGuardian(t);
      const claim = (code: string) => g3.request('POST', ApiPaths.legacyClaimCode, { code });
      const claimAnswers = [await claim('ABCD-EFGH-JKMN'), await claim(used2.code), await claim(revoked.code), await claim(expired.code)].map(shape);
      expect(new Set(claimAnswers).size).toBe(1);
      expect(JSON.parse(claimAnswers[0]!).status).toBe(400);
      expect(claimAnswers[0]).toBe(linkAnswers[0]);
    } finally {
      await t.close();
    }
  });

  it('asking for a sign-in link answers the same for a known and an unknown address', async () => {
    const { email } = await signInGuardian(h);
    const known = await deviceBrowser(h).request('POST', ApiPaths.guardianEmailLinks, { email });
    const unknown = await deviceBrowser(h).request('POST', ApiPaths.guardianEmailLinks, { email: uniqueEmail('nobody') });
    expect(shape(known)).toBe(shape(unknown));
    expect(known.status).toBe(202);
  });

  it('a profile that was archived under a device never becomes its active profile', async () => {
    const { browser: guardian } = await signInGuardian(h);
    const child = await addChild(guardian);
    const named = await codeDevice(h, guardian, child.id);
    expect((await named.request('GET', ApiPaths.device)).body.activeChildId).toBe(child.id);
    await guardian.request('POST', ApiPaths.familyChildArchive(child.id), {});
    const state = (await named.request('GET', ApiPaths.device)).body;
    expect(state.activeChildId).toBeNull();
    expect((await named.request('POST', PATHS.guest, {})).status).toBe(409); // profile_required, no guest created
    expect((await named.request('POST', ApiPaths.deviceProfile, { childProfileId: child.id })).status).toBe(404);

    // A code that named the profile before it was archived starts the new device with no profile.
    const second = await addChild(guardian, 'Two');
    const code = (await guardian.request('POST', ApiPaths.deviceCodes, { childProfileId: second.id })).body.code as string;
    await guardian.request('POST', ApiPaths.familyChildArchive(second.id), {});
    const late = deviceBrowser(h);
    const res = await late.request('POST', ApiPaths.deviceCodesRedeem, { code });
    expect(res.status).toBe(200);
    expect(res.body.activeChildId).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Credential lifecycle: randomness, hash at rest, expiry boundaries, single use, concurrency.
// ---------------------------------------------------------------------------------------------
describe.skipIf(!HAS_DB)('credential lifecycle', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } } });
  });
  afterAll(async () => {
    await h.close();
  });

  it('mints long random credentials and stores only hashes (keyed for codes)', async () => {
    const tokens: string[] = [];
    const cookies: string[] = [];
    const codes: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const { browser, email } = await signInGuardian(h);
      tokens.push(linkTokenFor(h, email));
      cookies.push(browser.deviceCookie as string);
      codes.push((await browser.request('POST', ApiPaths.deviceCodes, {})).body.code as string);
    }
    for (const value of [...tokens, ...cookies]) expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/); // 256 bits
    for (const code of codes) expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/); // 40 bits, single-use, 10 minutes
    for (const list of [tokens, cookies, codes]) expect(new Set(list).size).toBe(list.length);

    const keys = h.identity!.keys;
    for (const code of codes) {
      expect(await countRows(h, 'device_auth_codes', 'code_hash = $1', [hashHumanCode(keys, code)])).toBe(1);
      expect(await countRows(h, 'device_auth_codes', 'code_hash = any($1)', [[code, code.replace('-', ''), sha256(code), sha256(code.replace('-', ''))]])).toBe(0);
    }
    for (const token of tokens) expect(await countRows(h, 'guardian_login_tokens', 'token_hash = $1', [sha256(token)])).toBe(1);
    for (const cookie of cookies) expect(await countRows(h, 'device_sessions', 'token_hash = $1', [sha256(cookie)])).toBe(1);

    const lf = `hq-fam-${rid()}`;
    await loadLegacyManifest(h.database.db, h.clock, PEPPER, { version: 1, families: [{ legacyFamilyId: lf, guardianEmail: uniqueEmail('hash'), kids: [] }] });
    const { code } = await issueLegacyClaimCode(h.database.db, h.clock, keys, { legacyFamilyId: lf, days: 7 });
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/); // 60 bits
    const stored = (await sql<{ code_hash: string }>(h, 'select code_hash from legacy_claim_codes where legacy_family_row_id = (select id from legacy_families where legacy_family_id = $1)', [lf]))[0]!.code_hash;
    expect(stored).toBe(hashLegacyClaimCode(keys, code));
    expect([code, code.replaceAll('-', ''), sha256(code), sha256(code.replaceAll('-', '')), hashHumanCode(keys, code)]).not.toContain(stored);
  });

  it('expires each credential exactly at its documented moment', async () => {
    const t = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } } });
    try {
      const { browser: guardian, email } = await signInGuardian(t);
      // Link: valid one millisecond before 15 minutes, dead at 15 minutes.
      const link = async () => {
        await deviceBrowser(t).request('POST', ApiPaths.guardianEmailLinks, { email });
        await t.identity!.mail.idle();
        return linkTokenFor(t, email);
      };
      const edge = await link();
      t.clock.advance(15 * 60_000 - 1);
      expect((await deviceBrowser(t).request('POST', ApiPaths.guardianEmailLinkConsume, { token: edge })).status).toBe(200);
      const late = await link();
      t.clock.advance(15 * 60_000);
      expect((await deviceBrowser(t).request('POST', ApiPaths.guardianEmailLinkConsume, { token: late })).status).toBe(400);

      // Device code: 10 minutes.
      const code1 = (await guardian.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
      t.clock.advance(10 * 60_000 - 1);
      expect((await deviceBrowser(t).request('POST', ApiPaths.deviceCodesRedeem, { code: code1 })).status).toBe(200);
      const code2 = (await guardian.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
      t.clock.advance(10 * 60_000);
      expect((await deviceBrowser(t).request('POST', ApiPaths.deviceCodesRedeem, { code: code2 })).status).toBe(400);

      // Operator claim code: its issued days.
      const lf = `hq-fam-${rid()}`;
      await loadLegacyManifest(t.database.db, t.clock, PEPPER, { version: 1, families: [{ legacyFamilyId: lf, guardianEmail: uniqueEmail('exp'), kids: [] }] });
      const { code: claim } = await issueLegacyClaimCode(t.database.db, t.clock, t.identity!.keys, { legacyFamilyId: lf, days: 3 });
      t.clock.advanceDays(3);
      const { browser: g } = await signInGuardian(t); // authority is fresh; only the code is dead
      expect((await g.request('POST', ApiPaths.legacyClaimCode, { code: claim })).status).toBe(400);

      // Device session: 90 days.
      const { browser: d } = await signInGuardian(t);
      t.clock.advance(90 * 86_400_000 - 1);
      expect((await d.request('GET', ApiPaths.device)).status).toBe(200);
      t.clock.advance(1);
      expect((await d.request('GET', ApiPaths.device)).status).toBe(401);
    } finally {
      await t.close();
    }
  });

  it('caps open device codes even when issued simultaneously', async () => {
    const { browser } = await signInGuardian(h);
    const results = await Promise.all(Array.from({ length: 16 }, () => browser.request('POST', ApiPaths.deviceCodes, {})));
    expect(results.filter((r) => r.status === 201)).toHaveLength(10);
    expect(results.filter((r) => r.status === 429)).toHaveLength(6);
  });

  it('counts simultaneous sign-in link requests for one address one at a time: the cap holds and nothing leaks', async () => {
    const t = await makeHarness({ identity: { limits: { loginEmail: { max: 3, windowSeconds: 3600 } } } });
    try {
      const email = uniqueEmail('burst');
      const results = await Promise.all(Array.from({ length: 12 }, () => deviceBrowser(t).request('POST', ApiPaths.guardianEmailLinks, { email })));
      expect(new Set(results.map(shape)).size).toBe(1);
      await t.identity!.mail.idle();
      expect(t.mailer.outbox.filter((m) => m.to === email)).toHaveLength(3);
    } finally {
      await t.close();
    }
  });

  it('two guardians racing for one claim code: one wins, the family is claimed once', async () => {
    const lf = `hq-fam-${rid()}`;
    await loadLegacyManifest(h.database.db, h.clock, PEPPER, { version: 1, families: [{ legacyFamilyId: lf, guardianEmail: uniqueEmail('race'), kids: [{ legacyKidId: `hq-kid-${rid()}` }] }] });
    const { code } = await issueLegacyClaimCode(h.database.db, h.clock, h.identity!.keys, { legacyFamilyId: lf, days: 7 });
    const guardians = await Promise.all([signInGuardian(h), signInGuardian(h), signInGuardian(h)]);
    const results = await Promise.all(guardians.map((g) => g.browser.request('POST', ApiPaths.legacyClaimCode, { code })));
    expect(results.map(status).sort()).toEqual([201, 400, 400]);
    const row = (await sql<{ id: string; family_id: string }>(h, 'select id, family_id from legacy_families where legacy_family_id = $1', [lf]))[0]!;
    const winner = guardians[results.findIndex((r) => r.status === 201)]!;
    const winnerFamily = (await sql<{ family_id: string }>(h, 'select family_id from guardians where email = $1', [winner.email]))[0]!.family_id;
    expect(row.family_id).toBe(winnerFamily);
    expect(await countRows(h, 'audit_events', "action = 'legacy.family_claimed' and subject_id = $1", [row.id])).toBe(1);
    expect(await countRows(h, 'legacy_claim_codes', 'legacy_family_row_id = $1 and used_at is not null', [row.id])).toBe(1);
  });

  it("a claim that loses a race does not burn the loser's own code", async () => {
    const lf = `hq-fam-${rid()}`;
    await loadLegacyManifest(h.database.db, h.clock, PEPPER, { version: 1, families: [{ legacyFamilyId: lf, guardianEmail: uniqueEmail('two'), kids: [] }] });
    const a = await issueLegacyClaimCode(h.database.db, h.clock, h.identity!.keys, { legacyFamilyId: lf, days: 7 });
    const b = await issueLegacyClaimCode(h.database.db, h.clock, h.identity!.keys, { legacyFamilyId: lf, days: 7 });
    const [ga, gb] = await Promise.all([signInGuardian(h), signInGuardian(h)]);
    const results = await Promise.all([
      ga.browser.request('POST', ApiPaths.legacyClaimCode, { code: a.code }),
      gb.browser.request('POST', ApiPaths.legacyClaimCode, { code: b.code }),
    ]);
    expect(results.map(status).sort()).toEqual([201, 400]);
    const used = await sql<{ used_at: Date | null }>(h, 'select used_at from legacy_claim_codes where legacy_family_row_id = (select id from legacy_families where legacy_family_id = $1)', [lf]);
    expect(used.filter((r) => r.used_at !== null)).toHaveLength(1); // the loser's code is still unspent
  });

  it('two links for one address redeemed together both work (neither is burned by the race)', async () => {
    const email = uniqueEmail('twin');
    const mint = async () => {
      await deviceBrowser(h).request('POST', ApiPaths.guardianEmailLinks, { email });
      await h.identity!.mail.idle();
      return linkTokenFor(h, email);
    };
    const a = await mint();
    const b = await mint();
    const results = await Promise.all([a, b].map((token) => deviceBrowser(h).request('POST', ApiPaths.guardianEmailLinkConsume, { token })));
    expect(results.map(status)).toEqual([200, 200]);
    expect(await countRows(h, 'guardians', 'email = $1', [email])).toBe(1);
  });
});
