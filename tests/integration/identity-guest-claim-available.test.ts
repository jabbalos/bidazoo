import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiPaths } from '@bidazoo/contracts';
import {
  HAS_DB, TestBrowser, countRows, deviceBrowser, freshAddress, makeHarness, newPlayer, playSession, playerIdOf,
  signInGuardian, sql, type Harness,
} from './support/harness';

const available = (browser: TestBrowser) => browser.request('GET', ApiPaths.familyGuestClaim);
const claim = (browser: TestBrowser, nickname = 'Mia') => browser.request('POST', ApiPaths.familyChildrenFromGuest, { nickname });

/** A browser that holds a live guest player AND a guardian-authorized device. */
async function guestWithGuardian(h: Harness, options: { play?: boolean } = {}) {
  const browser = await newPlayer(h, freshAddress());
  if (options.play !== false) await playSession(browser);
  const playerId = await playerIdOf(browser);
  const guestCookie = browser.cookie as string;
  const { email } = await signInGuardian(h, { browser });
  return { browser, playerId, guestCookie, email };
}

/** Everything a read-only check must leave alone (xmin proves a row was not even rewritten). */
async function stateSnapshot(h: Harness): Promise<string> {
  const parts: unknown[] = [];
  for (const table of ['players', 'guest_sessions', 'child_profiles', 'device_sessions', 'attempts', 'skill_mastery', 'wallet_transactions', 'xp_events', 'play_sessions', 'audit_events']) {
    parts.push([table, await sql(h, `select xmin::text as xmin, * from ${table} order by xmin::text, ctid`)]);
  }
  return JSON.stringify(parts);
}

describe.skipIf(!HAS_DB)('guest-claim availability (read-only)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: {} });
  });
  afterAll(async () => {
    await h.close();
  });

  describe('who may ask', () => {
    it('needs a trusted device with guardian authority, and nothing else', async () => {
      const guest = await newPlayer(h, freshAddress());
      expect((await available(guest)).status).toBe(401); // a guest alone

      const g = await guestWithGuardian(h, { play: false });
      const code = (await g.browser.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
      const kid = await newPlayer(h, freshAddress());
      expect((await kid.request('POST', ApiPaths.deviceCodesRedeem, { code })).status).toBe(200);
      expect((await available(kid)).status).toBe(403); // a trusted child device without authority

      h.clock.advance(25 * 3_600_000);
      expect((await available(g.browser)).status).toBe(403); // authority lapsed
      await signInGuardian(h, { email: g.email, browser: g.browser });
      expect((await available(g.browser)).body).toEqual({ available: true });
    });

    it('a revoked device is refused', async () => {
      const g = await guestWithGuardian(h, { play: false });
      expect((await g.browser.request('POST', ApiPaths.devicesRevokeAll, { includeCurrent: true })).status).toBe(200);
      expect((await available(g.browser)).status).toBe(401);
    });
  });

  describe('when the answer is yes', () => {
    it('a live guest with no active child: yes', async () => {
      const g = await guestWithGuardian(h);
      const res = await available(g.browser);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: true });
    });

    it('a live guest while ANOTHER child is the active profile: still yes', async () => {
      const g = await guestWithGuardian(h);
      const ava = (await g.browser.request('POST', ApiPaths.familyChildren, { nickname: 'Ava' })).body.child;
      expect((await g.browser.request('POST', ApiPaths.deviceProfile, { childProfileId: ava.id })).status).toBe(200);
      // This is the case /me cannot see: the device answers as Ava's player while the guest cookie lives on.
      expect((await g.browser.request('GET', ApiPaths.me)).body.player.id).not.toBe(g.playerId);
      expect((await available(g.browser)).body).toEqual({ available: true });
    });

    it('claiming with another child active keeps the player and learning data, then the answer is no', async () => {
      const g = await guestWithGuardian(h);
      const ava = (await g.browser.request('POST', ApiPaths.familyChildren, { nickname: 'Ava' })).body.child;
      await g.browser.request('POST', ApiPaths.deviceProfile, { childProfileId: ava.id });
      const learning = async () => JSON.stringify(await Promise.all(['players', 'attempts', 'skill_mastery', 'wallet_transactions', 'xp_events', 'play_sessions'].map((t) =>
        sql(h, `select xmin::text as xmin, * from ${t} where ${t === 'players' ? 'id' : 'player_id'} = $1 order by 2, 3`, [g.playerId]))));
      const before = await learning();
      const players = await countRows(h, 'players');

      const res = await claim(g.browser, 'Zed');
      expect(res.status).toBe(201);
      expect(await learning()).toBe(before);
      expect(await countRows(h, 'players')).toBe(players);
      expect((await sql(h, 'select player_id from child_profiles where id = $1', [res.body.child.id]))[0]?.player_id).toBe(g.playerId);
      // The backend selected the claimed child; the check now says no (the cookie was spent).
      expect((await g.browser.request('GET', ApiPaths.device)).body.activeChildId).toBe(res.body.child.id);
      expect((await available(g.browser)).body).toEqual({ available: false });
    });
  });

  describe('when the answer is a plain no', () => {
    it('no guest cookie', async () => {
      const { browser } = await signInGuardian(h);
      expect((await available(browser)).body).toEqual({ available: false });
    });

    it('an expired guest session', async () => {
      const g = await guestWithGuardian(h, { play: false });
      await sql(h, "update guest_sessions set expires_at = '2000-01-01' where player_id = $1", [g.playerId]);
      expect((await available(g.browser)).body).toEqual({ available: false });
    });

    it('a revoked guest session', async () => {
      const g = await guestWithGuardian(h, { play: false });
      await sql(h, 'update guest_sessions set revoked_at = now() where player_id = $1', [g.playerId]);
      expect((await available(g.browser)).body).toEqual({ available: false });
    });

    it('malformed, empty and unknown guest cookies', async () => {
      const g = await guestWithGuardian(h, { play: false });
      for (const value of ['junk', '', 'A'.repeat(43), `${'A'.repeat(42)}%`, randomBytes(32).toString('base64url')]) {
        g.browser.cookie = value;
        const res = await available(g.browser);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ available: false });
      }
    });

    it('already claimed by this family: not offered as a new pending claim, even if the old cookie returns', async () => {
      const g = await guestWithGuardian(h, { play: false });
      expect((await claim(g.browser)).status).toBe(201);
      expect((await available(g.browser)).body).toEqual({ available: false });
      g.browser.cookie = g.guestCookie; // the retry-after-lost-response situation
      expect((await available(g.browser)).body).toEqual({ available: false });
      expect((await claim(g.browser)).status).toBe(200); // the claim's own idempotent replay is unchanged
    });

    it('already claimed by another family: the same plain no, and nothing about the owner', async () => {
      const g = await guestWithGuardian(h, { play: false });
      const owner = await claim(g.browser);
      const other = await signInGuardian(h);
      other.browser.cookie = g.guestCookie;
      const res = await available(other.browser);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: false });
      expect(res.raw + JSON.stringify(res.headers)).not.toMatch(new RegExp(`${owner.body.child.id}|${g.email}|${g.playerId}`));

      // Even a leftover LIVE session on a claimed player is just "no", never a reason.
      const leftover = randomBytes(32).toString('base64url');
      await sql(h, "insert into guest_sessions (player_id, token_hash, expires_at) values ($1, $2, now() + interval '30 days')", [
        g.playerId, createHash('sha256').update(leftover).digest('hex'),
      ]);
      other.browser.cookie = leftover;
      expect((await available(other.browser)).body).toEqual({ available: false });
    });
  });

  describe('privacy and side effects', () => {
    it('answers with exactly one boolean key, sets no cookie, and carries no identifiers', async () => {
      const g = await guestWithGuardian(h);
      const res = await available(g.browser);
      expect(Object.keys(res.body)).toEqual(['available']);
      expect(res.headers['set-cookie']).toBeUndefined();
      const text = res.raw + JSON.stringify(res.headers);
      for (const secret of [g.playerId, g.guestCookie, g.email, createHash('sha256').update(g.guestCookie).digest('hex')]) expect(text).not.toContain(secret);
    });

    it('checking changes nothing: no player, profile, session, device, learning, ledger or audit row, and the clock is untouched', async () => {
      const g = await guestWithGuardian(h);
      const ava = (await g.browser.request('POST', ApiPaths.familyChildren, { nickname: 'Ava' })).body.child;
      await g.browser.request('POST', ApiPaths.deviceProfile, { childProfileId: ava.id });
      const before = await stateSnapshot(h);
      for (let i = 0; i < 3; i += 1) {
        expect((await available(g.browser)).body).toEqual({ available: true });
        g.browser.cookie = g.guestCookie;
      }
      // The negative answers are read-only too.
      g.browser.cookie = 'junk';
      expect((await available(g.browser)).body).toEqual({ available: false });
      expect(await stateSnapshot(h)).toBe(before);
    });
  });
});

describe.skipIf(!HAS_DB)('guest-claim availability: identity not configured', () => {
  it('has no such route (404) and the guest flow is unchanged', async () => {
    const h = await makeHarness();
    try {
      const guest = await newPlayer(h);
      const playerId = await playerIdOf(guest);
      expect((await guest.request('GET', ApiPaths.familyGuestClaim)).status).toBe(404);
      expect((await deviceBrowser(h).request('GET', ApiPaths.familyGuestClaim)).status).toBe(404);
      await playSession(guest);
      expect(await playerIdOf(guest)).toBe(playerId);
      expect(guest.cookie).toBeDefined();
    } finally {
      await h.close();
    }
  });
});
