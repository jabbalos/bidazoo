import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiPaths } from '@bidazoo/contracts';
import {
  HAS_DB, PATHS, TestBrowser, countRows, deviceBrowser, freshAddress, makeHarness, newPlayer, playSession, playerIdOf,
  signInGuardian, sql, type Harness,
} from './support/harness';

/** Every table keyed by player_id, plus the rows that hang off a session. xmin proves a row was never even updated. */
async function learningSnapshot(h: Harness, playerId: string): Promise<string> {
  const parts: unknown[] = [];
  for (const table of ['players', 'attempts', 'skill_mastery', 'wallet_transactions', 'xp_events', 'play_sessions']) {
    const key = table === 'players' ? 'id' : 'player_id';
    parts.push([table, await sql(h, `select xmin::text as xmin, * from ${table} where ${key} = $1 order by 2, 3`, [playerId])]);
  }
  parts.push(['served_questions', await sql(h, 'select xmin::text as xmin, * from served_questions where play_session_id in (select id from play_sessions where player_id = $1) order by 2, 3', [playerId])]);
  return JSON.stringify(parts);
}

/** A browser that has played as a guest AND holds a guardian-authorized device (the claim scenario). */
async function guestWithGuardian(h: Harness, options: { play?: boolean } = {}) {
  const browser = await newPlayer(h, freshAddress());
  if (options.play !== false) await playSession(browser);
  const playerId = await playerIdOf(browser);
  const guestCookie = browser.cookie as string;
  const { email } = await signInGuardian(h, { browser });
  return { browser, playerId, guestCookie, email };
}

const claim = (browser: TestBrowser, body: unknown = { nickname: 'Mia' }) =>
  browser.request('POST', ApiPaths.familyChildrenFromGuest, body);

describe.skipIf(!HAS_DB)('guest-to-child claim', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: {} });
  });
  afterAll(async () => {
    await h.close();
  });

  describe('preservation and the cookie/auth transition', () => {
    it('keeps the same player and every learning row untouched, and continues as that child', async () => {
      const g = await guestWithGuardian(h);
      const before = await learningSnapshot(h, g.playerId);
      expect(await countRows(h, 'attempts', 'player_id = $1', [g.playerId])).toBe(10);
      expect(await countRows(h, 'xp_events', 'player_id = $1', [g.playerId])).toBeGreaterThan(0);
      expect(await countRows(h, 'skill_mastery', 'player_id = $1', [g.playerId])).toBeGreaterThan(0);
      const players = await countRows(h, 'players');

      const res = await claim(g.browser, { nickname: 'Mia' });
      expect(res.status).toBe(201);
      expect(res.body.child).toMatchObject({ nickname: 'Mia', hasPin: false, archived: false });

      // Same player, nothing rewritten (not even a no-op update), no second player.
      expect(await learningSnapshot(h, g.playerId)).toBe(before);
      expect(await countRows(h, 'players')).toBe(players);
      const profile = await sql(h, 'select player_id, family_id from child_profiles where id = $1', [res.body.child.id]);
      expect(profile[0]?.player_id).toBe(g.playerId);

      // The guest credential is spent; the trusted device stays and now plays as the child.
      expect(g.browser.cookie).toBeUndefined();
      expect(g.browser.setCookieLog.at(-1)).toMatch(/^bidazoo_guest=;/);
      expect(g.browser.deviceCookie).toBeDefined();
      const revoked = await sql(h, 'select revoked_at from guest_sessions where player_id = $1', [g.playerId]);
      expect(revoked.every((r) => r.revoked_at !== null)).toBe(true);
      const state = await g.browser.request('GET', ApiPaths.device);
      expect(state.body.activeChildId).toBe(res.body.child.id);
      expect(await playerIdOf(g.browser)).toBe(g.playerId);

      // Later play resolves through the device to the SAME player and adds to the SAME history.
      await playSession(g.browser);
      expect(await countRows(h, 'attempts', 'player_id = $1', [g.playerId])).toBe(20);
      expect(await countRows(h, 'players')).toBe(players);
    });

    it('the old guest cookie value no longer works as a guest by itself', async () => {
      const g = await guestWithGuardian(h);
      await claim(g.browser);
      const stale = new TestBrowser(h.app, h.ctx.cookie.name);
      stale.cookie = g.guestCookie;
      expect((await stale.request('GET', PATHS.me)).status).toBe(401);
    });

    it('works for a brand-new guest with no history', async () => {
      const g = await guestWithGuardian(h, { play: false });
      const res = await claim(g.browser, { nickname: 'Zed' });
      expect(res.status).toBe(201);
      expect(await playerIdOf(g.browser)).toBe(g.playerId);
    });
  });

  describe('authority', () => {
    it('a guest-only browser (no device) cannot claim', async () => {
      const guest = await newPlayer(h, freshAddress());
      expect((await claim(guest)).status).toBe(401);
    });

    it('a trusted device WITHOUT guardian authority cannot claim, even holding a guest cookie', async () => {
      const guardian = await signInGuardian(h);
      const code = (await guardian.browser.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
      const kid = await newPlayer(h, freshAddress());
      const playerId = await playerIdOf(kid);
      expect((await kid.request('POST', ApiPaths.deviceCodesRedeem, { code })).status).toBe(200);
      expect((await claim(kid)).status).toBe(403);
      expect(await countRows(h, 'child_profiles', 'player_id = $1', [playerId])).toBe(0);
    });

    it('guardian authority without a guest cookie cannot claim', async () => {
      const { browser } = await signInGuardian(h);
      const res = await claim(browser);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthenticated');
    });

    it('expired guardian authority cannot claim; signing in again restores it', async () => {
      const g = await guestWithGuardian(h, { play: false });
      h.clock.advance(25 * 3_600_000);
      expect((await claim(g.browser)).status).toBe(403);
      await signInGuardian(h, { email: g.email, browser: g.browser });
      // The guest session (90-day) is still live, so the claim now succeeds.
      expect((await claim(g.browser)).status).toBe(201);
    });

    it('rejects a body that names a player, guest, token, family or guardian', async () => {
      const g = await guestWithGuardian(h, { play: false });
      const id = crypto.randomUUID();
      for (const extra of [{ playerId: id }, { guestId: id }, { token: 'A'.repeat(43) }, { familyId: id }, { guardianId: id }]) {
        expect((await claim(g.browser, { nickname: 'Mia', ...extra })).status).toBe(400);
      }
      expect((await claim(g.browser, {})).status).toBe(400);
      expect(await countRows(h, 'child_profiles', 'player_id = $1', [g.playerId])).toBe(0);
    });

    it("takes the player only from the guest cookie: another guest's id in the body changes nothing", async () => {
      const victim = await newPlayer(h, freshAddress());
      const victimId = await playerIdOf(victim);
      const g = await guestWithGuardian(h, { play: false });
      await claim(g.browser, { nickname: 'Mia' });
      expect(await countRows(h, 'child_profiles', 'player_id = $1', [victimId])).toBe(0);
      expect(await countRows(h, 'child_profiles', 'player_id = $1', [g.playerId])).toBe(1);
    });
  });

  describe('stale and malformed guest credentials', () => {
    it('a revoked guest session claims nothing', async () => {
      const g = await guestWithGuardian(h, { play: false });
      await sql(h, 'update guest_sessions set revoked_at = now() where player_id = $1', [g.playerId]);
      expect((await claim(g.browser)).status).toBe(401);
      expect(await countRows(h, 'child_profiles', 'player_id = $1', [g.playerId])).toBe(0);
    });

    it('an expired guest session claims nothing', async () => {
      const g = await guestWithGuardian(h, { play: false });
      await sql(h, "update guest_sessions set expires_at = '2000-01-01' where player_id = $1", [g.playerId]);
      expect((await claim(g.browser)).status).toBe(401);
      expect(await countRows(h, 'child_profiles', 'player_id = $1', [g.playerId])).toBe(0);
    });

    it('malformed and unknown guest cookies claim nothing', async () => {
      const g = await guestWithGuardian(h, { play: false });
      for (const value of ['junk', '', 'A'.repeat(43), `${'A'.repeat(42)}%`]) {
        g.browser.cookie = value;
        expect((await claim(g.browser)).status).toBe(401);
      }
      expect(await countRows(h, 'child_profiles', 'player_id = $1', [g.playerId])).toBe(0);
    });
  });

  describe('idempotency and double claim', () => {
    it('a replay by the same family returns the same profile: no duplicate profile, player or audit event', async () => {
      const g = await guestWithGuardian(h);
      const first = await claim(g.browser, { nickname: 'Mia' });
      expect(first.status).toBe(201);
      const players = await countRows(h, 'players');
      const audits = () => countRows(h, 'audit_events', "action = 'guest.claimed' and subject_id = $1", [first.body.child.id]);
      expect(await audits()).toBe(1);

      // The retry arrives with the original (now revoked) cookie, as when the first response was lost.
      g.browser.cookie = g.guestCookie;
      const again = await claim(g.browser, { nickname: 'Different Name' });
      expect(again.status).toBe(200);
      expect(again.body.child).toEqual(first.body.child);
      expect(g.browser.cookie).toBeUndefined();
      expect(await countRows(h, 'child_profiles', 'player_id = $1', [g.playerId])).toBe(1);
      expect(await countRows(h, 'players')).toBe(players);
      expect(await audits()).toBe(1);
    });

    it('another family cannot claim an already-claimed player: 409 already_claimed, nothing about the owner', async () => {
      const g = await guestWithGuardian(h);
      const owner = await claim(g.browser, { nickname: 'Mia' });
      const other = await signInGuardian(h);
      other.browser.cookie = g.guestCookie; // the same credential, presented by someone else
      const res = await claim(other.browser, { nickname: 'Stolen' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('already_claimed');
      const text = res.raw + JSON.stringify(res.headers);
      expect(text).not.toContain(owner.body.child.id);
      expect(text).not.toContain(g.email);
      expect(await countRows(h, 'child_profiles', 'player_id = $1', [g.playerId])).toBe(1);
      expect((await other.browser.request('GET', ApiPaths.family)).body.children).toEqual([]);
    });

    it('a live guest session on an already-claimed player is still refused for other families', async () => {
      const g = await guestWithGuardian(h, { play: false });
      await claim(g.browser);
      // Simulate an inconsistent leftover live session for the claimed player.
      const leftover = new TestBrowser(h.app, h.ctx.cookie.name);
      leftover.cookie = randomBytes(32).toString('base64url');
      await sql(h, "insert into guest_sessions (player_id, token_hash, expires_at) values ($1, $2, now() + interval '30 days')", [
        g.playerId, createHash('sha256').update(leftover.cookie).digest('hex'),
      ]);
      const other = await signInGuardian(h);
      other.browser.cookie = leftover.cookie;
      expect((await claim(other.browser)).status).toBe(409);
    });

    it('two simultaneous claims by the same family create one profile', async () => {
      const g = await guestWithGuardian(h, { play: false });
      const twin = deviceBrowser(h);
      twin.deviceCookie = g.browser.deviceCookie;
      twin.cookie = g.guestCookie;
      const results = await Promise.all([claim(g.browser), claim(twin)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
      expect(await countRows(h, 'child_profiles', 'player_id = $1', [g.playerId])).toBe(1);
      expect(await countRows(h, 'audit_events', "action = 'guest.claimed' and subject_id = $1", [results.find((r) => r.status === 201)?.body.child.id])).toBe(1);
    });

    it('two families racing for one player: exactly one wins, the other gets 409', async () => {
      const g = await guestWithGuardian(h, { play: false });
      const rival = await signInGuardian(h);
      rival.browser.cookie = g.guestCookie;
      const results = await Promise.all([claim(g.browser, { nickname: 'A' }), claim(rival.browser, { nickname: 'B' })]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await countRows(h, 'child_profiles', 'player_id = $1', [g.playerId])).toBe(1);
    });

    it('the claim is atomic: a failure late in the transaction leaves no profile and revokes nothing', async () => {
      const g = await guestWithGuardian(h, { play: false });
      const before = await learningSnapshot(h, g.playerId);
      const trigger = `claim_fail_${Date.now().toString(36)}`;
      await sql(h, `create function ${trigger}() returns trigger as $$ begin
        if new.action = 'guest.claimed' and new.actor_id = '${(await sql(h, 'select id from guardians where email = $1', [g.email]))[0]?.id}' then raise exception 'simulated failure'; end if; return new; end $$ language plpgsql`);
      await sql(h, `create trigger ${trigger} before insert on audit_events for each row execute function ${trigger}()`);
      try {
        const res = await claim(g.browser);
        expect(res.status).toBe(500);
      } finally {
        await sql(h, `drop trigger ${trigger} on audit_events`);
        await sql(h, `drop function ${trigger}()`);
      }
      expect(await countRows(h, 'child_profiles', 'player_id = $1', [g.playerId])).toBe(0);
      expect(await countRows(h, 'guest_sessions', 'player_id = $1 and revoked_at is not null', [g.playerId])).toBe(0);
      expect((await g.browser.request('GET', ApiPaths.device)).body.activeChildId).toBeNull();
      expect(await learningSnapshot(h, g.playerId)).toBe(before);
      // The guest is still intact and the claim can simply be retried.
      expect(await playerIdOf(g.browser)).toBe(g.playerId);
      expect((await claim(g.browser)).status).toBe(201);
    });
  });

  describe('secrets', () => {
    it('keeps tokens, hashes and emails out of the response and the audit event', async () => {
      const g = await guestWithGuardian(h);
      const device = g.browser.deviceCookie as string;
      const res = await claim(g.browser);
      expect(res.status).toBe(201);
      const sha = (v: string) => createHash('sha256').update(v).digest('hex');
      const audit = await sql(h, "select * from audit_events where action = 'guest.claimed' and subject_id = $1", [res.body.child.id]);
      expect(audit).toHaveLength(1);
      const dump = res.raw + JSON.stringify(audit) + JSON.stringify(res.headers['set-cookie']);
      for (const secret of [g.guestCookie, device, sha(g.guestCookie), sha(device), g.email]) {
        expect(dump).not.toContain(secret);
      }
      expect(Object.keys(res.body.child).sort()).toEqual(['archived', 'hasPin', 'id', 'nickname']);
    });
  });
});

describe.skipIf(!HAS_DB)('guest claim: identity not configured', () => {
  it('has no claim route and leaves the guest flow exactly as before', async () => {
    const h = await makeHarness();
    try {
      const guest = await newPlayer(h);
      const before = await playerIdOf(guest);
      expect((await guest.request('POST', ApiPaths.familyChildrenFromGuest, { nickname: 'Mia' })).status).toBe(404);
      await playSession(guest);
      expect(await playerIdOf(guest)).toBe(before);
      expect(guest.cookie).toBeDefined();
    } finally {
      await h.close();
    }
  });
});
