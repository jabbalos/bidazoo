import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiPaths } from '@bidazoo/contracts';
import { DEFAULT_RATE_LIMITS, type RateLimitConfig } from '@bidazoo/api/rate-limit';
import {
  HAS_DB, PATHS, START_BODY, TestBrowser, countRows, deviceBrowser, makeHarness, newPlayer, playSession, playerIdOf,
  signInGuardian, sql, startSession, type Harness,
} from './support/harness';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** A guardian browser with one child profile, plus that child's id. */
async function guardianWithChild(h: Harness, nickname = 'Mia', ip?: string) {
  const { browser, email } = await signInGuardian(h, { remoteAddress: ip });
  const child = (await browser.request('POST', ApiPaths.familyChildren, { nickname })).body.child as { id: string };
  return { browser, email, child };
}

/** Authorizes a brand-new browser with a device code issued by the guardian. */
async function codeDevice(h: Harness, guardian: TestBrowser, childProfileId?: string, ip?: string) {
  const issued = await guardian.request('POST', ApiPaths.deviceCodes, childProfileId ? { childProfileId } : {});
  if (issued.status !== 201) throw new Error(`code issue failed ${issued.status} ${issued.raw}`);
  const browser = deviceBrowser(h, ip);
  const res = await browser.request('POST', ApiPaths.deviceCodesRedeem, { code: issued.body.code, deviceLabel: 'Classroom iPad' });
  if (res.status !== 200) throw new Error(`code redeem failed ${res.status} ${res.raw}`);
  return { browser, res, code: issued.body.code as string };
}

describe.skipIf(!HAS_DB)('trusted device sessions', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: {} });
  });
  afterAll(async () => {
    await h.close();
  });

  it('GET /device: 401 with no, junk or unknown device cookie; never leaks a token', async () => {
    expect((await deviceBrowser(h).request('GET', ApiPaths.device)).status).toBe(401);
    const junk = deviceBrowser(h);
    junk.deviceCookie = 'not-a-token';
    expect((await junk.request('GET', ApiPaths.device)).status).toBe(401);
    const unknown = deviceBrowser(h);
    unknown.deviceCookie = 'A'.repeat(43);
    expect((await unknown.request('GET', ApiPaths.device)).status).toBe(401);
    const { browser } = await signInGuardian(h);
    const res = await browser.request('GET', ApiPaths.device);
    expect(res.status).toBe(200);
    expect(res.body.guardianAuthority).toBe(true);
    expect(res.body.device.current).toBe(true);
    expect(res.raw).not.toContain(browser.deviceCookie as string);
    expect(res.raw).not.toContain(sha256(browser.deviceCookie as string));
  });

  it('enforces device expiry on the server (90 days)', async () => {
    const { browser } = await signInGuardian(h);
    h.clock.advanceDays(89);
    expect((await browser.request('GET', ApiPaths.device)).status).toBe(200);
    h.clock.advanceDays(2);
    expect((await browser.request('GET', ApiPaths.device)).status).toBe(401);
  });

  describe('device codes', () => {
    it('issues a code once (hash only stored); the redeemed device is family-wide with no guardian authority', async () => {
      const { browser: guardian, child } = await guardianWithChild(h);
      const { browser, res, code } = await codeDevice(h, guardian, child.id);
      expect(res.status).toBe(200);
      expect(res.body.guardianAuthority).toBe(false);
      expect(res.body.authorityExpiresAt).toBeNull();
      expect(res.body.activeChildId).toBe(child.id);
      expect(res.body.device.label).toBe('Classroom iPad');
      expect(browser.deviceCookie).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(res.raw).not.toContain(browser.deviceCookie as string);
      expect(await countRows(h, 'device_auth_codes', 'code_hash = $1', [code])).toBe(0);
      // A child device cannot use guardian routes.
      for (const [method, path] of [['GET', ApiPaths.family], ['GET', ApiPaths.devices], ['POST', ApiPaths.deviceCodes]] as const) {
        expect((await browser.request(method, path, method === 'POST' ? {} : undefined)).status).toBe(403);
      }
    });

    it('is single-use, and unknown, used and expired codes are indistinguishable', async () => {
      const { browser: guardian } = await guardianWithChild(h);
      const first = await codeDevice(h, guardian);
      expect(first.res.status).toBe(200);
      const replay = await deviceBrowser(h).request('POST', ApiPaths.deviceCodesRedeem, { code: first.code });
      const unknown = await deviceBrowser(h).request('POST', ApiPaths.deviceCodesRedeem, { code: 'ABCD-EFGH' });
      expect(replay.status).toBe(400);
      expect(unknown.status).toBe(400);
      expect(unknown.body).toEqual(replay.body);
      const stale = (await guardian.request('POST', ApiPaths.deviceCodes, {})).body.code;
      h.clock.advance(11 * 60_000);
      const expired = await deviceBrowser(h).request('POST', ApiPaths.deviceCodesRedeem, { code: stale });
      expect(expired.status).toBe(400);
      expect(expired.body).toEqual(replay.body);
    });

    it('accepts the code as a person might type it (lowercase, no dash, confusable letters)', async () => {
      const { browser: guardian } = await guardianWithChild(h);
      const code = (await guardian.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
      const typed = code.toLowerCase().replace('-', '');
      expect((await deviceBrowser(h).request('POST', ApiPaths.deviceCodesRedeem, { code: typed })).status).toBe(200);
    });

    it('lets exactly one of several concurrent redemptions win', async () => {
      const { browser: guardian } = await guardianWithChild(h);
      const code = (await guardian.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
      const results = await Promise.all(
        Array.from({ length: 5 }, () => deviceBrowser(h).request('POST', ApiPaths.deviceCodesRedeem, { code })),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 400)).toHaveLength(4);
    });

    it("won't name another family's or an archived profile", async () => {
      const a = await guardianWithChild(h);
      const b = await guardianWithChild(h);
      expect((await a.browser.request('POST', ApiPaths.deviceCodes, { childProfileId: b.child.id })).status).toBe(404);
      await a.browser.request('POST', ApiPaths.familyChildArchive(a.child.id), {});
      expect((await a.browser.request('POST', ApiPaths.deviceCodes, { childProfileId: a.child.id })).status).toBe(404);
    });

    it('rate-limits redemption attempts per client without spending a valid code, and caps open codes', async () => {
      const hl = await makeHarness({ identity: { limits: { deviceCodeIp: { max: 3, windowSeconds: 600 } } } });
      try {
        const { browser: guardian } = await guardianWithChild(hl, 'Mia', '10.90.0.1');
        const code = (await guardian.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
        const attacker = deviceBrowser(hl, '10.90.0.2');
        const codes: number[] = [];
        for (let i = 0; i < 4; i += 1) {
          codes.push((await attacker.request('POST', ApiPaths.deviceCodesRedeem, { code: 'ZZZZ-ZZZZ' })).status);
        }
        expect(codes).toEqual([400, 400, 400, 429]);
        expect((await deviceBrowser(hl, '10.90.0.3').request('POST', ApiPaths.deviceCodesRedeem, { code })).status).toBe(200);
        // A family cannot hold more than ten unused codes.
        const results: number[] = [];
        for (let i = 0; i < 11; i += 1) results.push((await guardian.request('POST', ApiPaths.deviceCodes, {})).status);
        expect(results.filter((s) => s === 201)).toHaveLength(10); // the redeemed code no longer counts as open
        expect(results.at(-1)).toBe(429);
      } finally {
        await hl.close();
      }
    });
  });

  describe('listing and revoking', () => {
    it("lists only the family's live devices, flags the current one, and is guardian-only", async () => {
      const a = await guardianWithChild(h);
      const b = await guardianWithChild(h);
      const second = await codeDevice(h, a.browser, a.child.id);
      const listed = await a.browser.request('GET', ApiPaths.devices);
      expect(listed.status).toBe(200);
      expect(listed.body.devices).toHaveLength(2);
      expect(listed.body.devices.filter((d: any) => d.current)).toHaveLength(1);
      expect(listed.body.devices.find((d: any) => d.label === 'Classroom iPad').activeChildNickname).toBe('Mia');
      expect(listed.raw).not.toContain(second.browser.deviceCookie as string);
      expect((await b.browser.request('GET', ApiPaths.devices)).body.devices).toHaveLength(1);
      expect((await deviceBrowser(h).request('GET', ApiPaths.devices)).status).toBe(401);
      expect((await second.browser.request('GET', ApiPaths.devices)).status).toBe(403);
    });

    it('revokes one device server-side: the browser keeps its cookie but is refused at once', async () => {
      const g = await guardianWithChild(h);
      const kid = await codeDevice(h, g.browser, g.child.id);
      expect((await kid.browser.request('GET', ApiPaths.device)).status).toBe(200);
      const id = (await kid.browser.request('GET', ApiPaths.device)).body.device.id as string;
      const kept = kid.browser.deviceCookie;
      const res = await g.browser.request('POST', ApiPaths.deviceRevoke(id), {});
      expect(res.body).toEqual({ revoked: 1 });
      expect(kid.browser.deviceCookie).toBe(kept);
      expect((await kid.browser.request('GET', ApiPaths.device)).status).toBe(401);
      expect((await kid.browser.request('GET', PATHS.me)).status).toBe(401);
      // Idempotent; the guardian's own device is untouched.
      expect((await g.browser.request('POST', ApiPaths.deviceRevoke(id), {})).body).toEqual({ revoked: 0 });
      expect((await g.browser.request('GET', ApiPaths.device)).status).toBe(200);
    });

    it("treats another family's device, and an unknown id, as not found", async () => {
      const a = await guardianWithChild(h);
      const b = await guardianWithChild(h);
      const id = (await b.browser.request('GET', ApiPaths.device)).body.device.id as string;
      expect((await a.browser.request('POST', ApiPaths.deviceRevoke(id), {})).status).toBe(404);
      expect((await a.browser.request('POST', ApiPaths.deviceRevoke(crypto.randomUUID()), {})).status).toBe(404);
      expect((await b.browser.request('GET', ApiPaths.device)).status).toBe(200);
    });

    it('clears the cookie when a device revokes itself', async () => {
      const g = await guardianWithChild(h);
      const id = (await g.browser.request('GET', ApiPaths.device)).body.device.id as string;
      await g.browser.request('POST', ApiPaths.deviceRevoke(id), {});
      expect(g.browser.deviceCookie).toBeUndefined();
      expect(g.browser.setCookieLog.at(-1)).toMatch(/^bidazoo_device=;/);
      expect((await g.browser.request('GET', ApiPaths.device)).status).toBe(401);
    });

    it('revoke-all keeps the calling device by default and revokes it only on request', async () => {
      const g = await guardianWithChild(h);
      const one = await codeDevice(h, g.browser, g.child.id);
      const two = await codeDevice(h, g.browser, g.child.id);
      const other = await guardianWithChild(h);
      const res = await g.browser.request('POST', ApiPaths.devicesRevokeAll, {});
      expect(res.body).toEqual({ revoked: 2 });
      expect((await one.browser.request('GET', ApiPaths.device)).status).toBe(401);
      expect((await two.browser.request('GET', ApiPaths.device)).status).toBe(401);
      expect((await g.browser.request('GET', ApiPaths.device)).status).toBe(200);
      expect((await other.browser.request('GET', ApiPaths.device)).status).toBe(200); // other family untouched
      const all = await g.browser.request('POST', ApiPaths.devicesRevokeAll, { includeCurrent: true });
      expect(all.body).toEqual({ revoked: 1 });
      expect(g.browser.deviceCookie).toBeUndefined();
    });

    it('a revoked device cannot be revived and guardian authority lapses without revoking the device', async () => {
      const g = await guardianWithChild(h);
      const id = (await g.browser.request('GET', ApiPaths.device)).body.device.id as string;
      await g.browser.request('POST', ApiPaths.devicesRevokeAll, { includeCurrent: true });
      await expect(sql(h, 'update device_sessions set revoked_at = null where id = $1', [id])).rejects.toThrow();
      const g2 = await guardianWithChild(h);
      h.clock.advance(25 * 3_600_000);
      expect((await g2.browser.request('GET', ApiPaths.devices)).status).toBe(403);
      const state = await g2.browser.request('GET', ApiPaths.device);
      expect(state.status).toBe(200);
      expect(state.body.guardianAuthority).toBe(false);
    });

    it('writes secret-free audit events for revocation and codes', async () => {
      const g = await guardianWithChild(h);
      const kid = await codeDevice(h, g.browser, g.child.id);
      const id = (await kid.browser.request('GET', ApiPaths.device)).body.device.id as string;
      await g.browser.request('POST', ApiPaths.deviceRevoke(id), {});
      await g.browser.request('POST', ApiPaths.devicesRevokeAll, {});
      const rows = await sql(h, 'select action, meta from audit_events where family_id = (select family_id from guardians where email = $1)', [g.email]);
      expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(['device.code_issued', 'device.revoked', 'device.revoked_all']));
      const dump = JSON.stringify(rows);
      for (const secret of [g.browser.deviceCookie, kid.browser.deviceCookie, kid.code, g.email]) {
        expect(dump).not.toContain(secret as string);
      }
    });
  });

  describe('profile selection and authentication precedence', () => {
    it('plays as the selected child: the child\'s existing player owns the session', async () => {
      const g = await guardianWithChild(h, 'Mia');
      const kid = await codeDevice(h, g.browser);
      const none = await kid.browser.request('GET', PATHS.me);
      expect(none.status).toBe(409);
      expect(none.body.error.code).toBe('profile_required');
      const picked = await kid.browser.request('POST', ApiPaths.deviceProfile, { childProfileId: g.child.id });
      expect(picked.status).toBe(200);
      expect(picked.body.activeChildId).toBe(g.child.id);
      const row = await sql(h, 'select player_id from child_profiles where id = $1', [g.child.id]);
      expect(await playerIdOf(kid.browser)).toBe(row[0]?.player_id);
      const before = await countRows(h, 'play_sessions', 'player_id = $1', [row[0]?.player_id]);
      await playSession(kid.browser);
      expect(await countRows(h, 'play_sessions', 'player_id = $1', [row[0]?.player_id])).toBe(before + 1);
    });

    it('keeps each child separate when one device switches profiles', async () => {
      const g = await guardianWithChild(h, 'Mia');
      const leo = (await g.browser.request('POST', ApiPaths.familyChildren, { nickname: 'Leo' })).body.child;
      const kid = await codeDevice(h, g.browser, g.child.id);
      const miaPlayer = await playerIdOf(kid.browser);
      await kid.browser.request('POST', ApiPaths.deviceProfile, { childProfileId: leo.id });
      expect(await playerIdOf(kid.browser)).not.toBe(miaPlayer);
    });

    it('rejects a profile of another family, an archived one, and a body that names a player', async () => {
      const a = await guardianWithChild(h);
      const b = await guardianWithChild(h);
      const kid = await codeDevice(h, a.browser);
      expect((await kid.browser.request('POST', ApiPaths.deviceProfile, { childProfileId: b.child.id })).status).toBe(404);
      await a.browser.request('POST', ApiPaths.familyChildArchive(a.child.id), {});
      expect((await kid.browser.request('POST', ApiPaths.deviceProfile, { childProfileId: a.child.id })).status).toBe(404);
      expect((await kid.browser.request('POST', ApiPaths.deviceProfile, { childProfileId: a.child.id, playerId: crypto.randomUUID() })).status).toBe(400);
      expect((await deviceBrowser(h).request('POST', ApiPaths.deviceProfile, { childProfileId: a.child.id })).status).toBe(401);
    });

    it('a stored value that is not a valid PIN hash never matches (fails closed, no crash)', async () => {
      const g = await guardianWithChild(h);
      const kid = await codeDevice(h, g.browser);
      await sql(h, "update child_profiles set pin_hash = 'x', pin_set_at = now() where id = $1", [g.child.id]);
      expect((await kid.browser.request('POST', ApiPaths.deviceProfile, { childProfileId: g.child.id })).status).toBe(403);
      expect((await kid.browser.request('POST', ApiPaths.deviceProfile, { childProfileId: g.child.id, pin: '1234' })).status).toBe(403);
    });

    it('device with a child outranks a guest cookie; archiving the child falls back to the guest', async () => {
      const g = await guardianWithChild(h);
      const kid = await codeDevice(h, g.browser, g.child.id);
      const guestOnly = await newPlayer(h);
      kid.browser.cookie = guestOnly.cookie;
      const childPlayer = (await sql(h, 'select player_id from child_profiles where id = $1', [g.child.id]))[0]?.player_id;
      const guestPlayer = await playerIdOf(guestOnly);
      expect(await playerIdOf(kid.browser)).toBe(childPlayer);
      await g.browser.request('POST', ApiPaths.familyChildArchive(g.child.id), {});
      expect(await playerIdOf(kid.browser)).toBe(guestPlayer);
    });

    it('a device with no child and no guest gets 409 profile_required everywhere, and creates NO guest', async () => {
      const g = await guardianWithChild(h);
      const kid = await codeDevice(h, g.browser);
      const players = await countRows(h, 'players');
      const guests = await countRows(h, 'guest_sessions');
      const calls = [
        await kid.browser.request('GET', PATHS.me),
        await kid.browser.request('POST', PATHS.guest, {}),
        await kid.browser.request('POST', PATHS.sessions, START_BODY),
      ];
      for (const res of calls) {
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('profile_required');
      }
      expect(await countRows(h, 'players')).toBe(players);
      expect(await countRows(h, 'guest_sessions')).toBe(guests);
      expect(kid.browser.cookie).toBeUndefined();
    });

    it('POST /guest on a device with a child returns the child and creates no guest', async () => {
      const g = await guardianWithChild(h);
      const kid = await codeDevice(h, g.browser, g.child.id);
      const players = await countRows(h, 'players');
      const res = await kid.browser.request('POST', PATHS.guest, {});
      expect(res.status).toBe(200);
      expect(kid.browser.cookie).toBeUndefined();
      expect(await countRows(h, 'players')).toBe(players);
    });

    it('a revoked or unknown device falls back to plain guest behaviour', async () => {
      const g = await guardianWithChild(h);
      const kid = await codeDevice(h, g.browser, g.child.id);
      const id = (await kid.browser.request('GET', ApiPaths.device)).body.device.id as string;
      await g.browser.request('POST', ApiPaths.deviceRevoke(id), {});
      expect((await kid.browser.request('GET', PATHS.me)).status).toBe(401); // no guest cookie
      expect((await kid.browser.request('POST', PATHS.guest, {})).status).toBe(200); // POST /guest may create one
      expect(kid.browser.cookie).toBeDefined();
      expect((await kid.browser.request('GET', PATHS.me)).status).toBe(200);
    });
  });
});

describe.skipIf(!HAS_DB)('guest-only compatibility (identity not configured)', () => {
  it('ignores a device cookie entirely and behaves exactly like the guest-only build', async () => {
    const h = await makeHarness();
    try {
      expect(h.identity).toBeUndefined();
      const guest = await newPlayer(h);
      guest.deviceCookie = 'A'.repeat(43);
      const me = await guest.request('GET', PATHS.me);
      expect(me.status).toBe(200);
      await playSession(guest);
      for (const path of [ApiPaths.device, ApiPaths.devices, ApiPaths.family, ApiPaths.deviceCodes]) {
        expect((await guest.request(path === ApiPaths.deviceCodes ? 'POST' : 'GET', path, path === ApiPaths.deviceCodes ? {} : undefined)).status).toBe(404);
      }
      const fresh = new TestBrowser(h.app, h.ctx.cookie.name);
      expect((await fresh.request('GET', PATHS.me)).status).toBe(401);
      expect((await fresh.request('POST', PATHS.guest, {})).status).toBe(200);
    } finally {
      await h.close();
    }
  });
});

describe.skipIf(!HAS_DB)('rate-limit identity keys (Checkpoint D interaction)', () => {
  const BIG = { max: 100_000, windowSeconds: 60 };
  const limits = (overrides: Partial<RateLimitConfig> = {}): RateLimitConfig => ({
    ...DEFAULT_RATE_LIMITS,
    guestCreateBurst: BIG,
    guestCreateHourly: { ...BIG, windowSeconds: 3600 },
    globalGuestCreate: { max: 0, windowSeconds: 3600 },
    sessionStart: BIG,
    answer: BIG,
    apiPerIp: BIG,
    cacheSize: 1000,
    ...overrides,
  });
  const SAME_IP = '10.91.0.1';

  it('limits trusted-device traffic per device, so a classroom behind one IP is not one bucket', async () => {
    const h = await makeHarness({ identity: {}, rateLimits: limits({ sessionStart: { max: 2, windowSeconds: 60 } }) });
    try {
      const g = await guardianWithChild(h, 'Mia', SAME_IP);
      const a = await codeDevice(h, g.browser, g.child.id, SAME_IP);
      const second = (await g.browser.request('POST', ApiPaths.familyChildren, { nickname: 'Leo' })).body.child;
      const b = await codeDevice(h, g.browser, second.id, SAME_IP);
      const start = (browser: TestBrowser) => browser.request('POST', PATHS.sessions, START_BODY).then((r) => r.status);
      expect([await start(a.browser), await start(a.browser), await start(a.browser)]).toEqual([201, 200, 429]);
      // Same IP, different device: its own allowance.
      expect([await start(b.browser), await start(b.browser), await start(b.browser)]).toEqual([201, 200, 429]);
    } finally {
      await h.close();
    }
  });

  it('keys guests exactly as before: per guest cookie', async () => {
    const h = await makeHarness({ identity: {}, rateLimits: limits({ sessionStart: { max: 2, windowSeconds: 60 } }) });
    try {
      const a = await newPlayer(h, SAME_IP);
      const b = await newPlayer(h, SAME_IP);
      expect([await startSession(a), await startSession(a)].length).toBe(2);
      expect((await a.request('POST', PATHS.sessions, START_BODY)).status).toBe(429);
      expect((await b.request('POST', PATHS.sessions, START_BODY)).status).toBe(201);
    } finally {
      await h.close();
    }
  });

  it('does not weaken the per-IP backstop: rotating device cookies on one IP still hits it', async () => {
    const h = await makeHarness({ identity: {}, rateLimits: limits({ apiPerIp: { max: 5, windowSeconds: 60 } }) });
    try {
      const flood = deviceBrowser(h, '10.92.0.1');
      const statuses: number[] = [];
      for (let i = 0; i < 8; i += 1) {
        flood.deviceCookie = `${String(i).padStart(2, '0')}${'x'.repeat(41)}`;
        statuses.push((await flood.request('GET', ApiPaths.device)).status);
      }
      expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(statuses.slice(5)).toEqual([429, 429, 429]);
      expect((await deviceBrowser(h, '10.92.0.2').request('GET', ApiPaths.device)).status).toBe(401);
    } finally {
      await h.close();
    }
  });

  it('a malformed device cookie does not create its own bucket (falls back to the guest key)', async () => {
    const h = await makeHarness({ identity: {}, rateLimits: limits({ sessionStart: { max: 1, windowSeconds: 60 } }) });
    try {
      const guest = await newPlayer(h, SAME_IP);
      expect((await guest.request('POST', PATHS.sessions, START_BODY)).status).toBe(201);
      for (let i = 0; i < 3; i += 1) {
        guest.deviceCookie = `junk-${i}`;
        expect((await guest.request('POST', PATHS.sessions, START_BODY)).status).toBe(429);
      }
    } finally {
      await h.close();
    }
  });
});
