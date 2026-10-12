import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_DB, PATHS, TestBrowser, countRows, makeHarness, sql, type Harness } from './support/harness';

describe.skipIf(!HAS_DB)('guest player session (cookie model)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  it('issues an opaque HttpOnly, SameSite=Lax cookie and exposes no token in the body', async () => {
    const browser = new TestBrowser(h.app, h.ctx.cookie.name);
    const res = await browser.request('POST', PATHS.guest, {});
    expect(res.status).toBe(200);
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).not.toMatch(/Secure/i); // plain-HTTP test configuration
    expect(browser.cookie).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.raw).not.toContain(browser.cookie as string);
    expect(Object.keys(res.body).sort()).toEqual(['activeSessionId', 'player', 'totals']);
  });

  it('marks the cookie Secure with the __Host- prefix under HTTPS/production configuration', async () => {
    const secure = await makeHarness({ cookieSecure: true });
    try {
      const res = await secure.app.inject({ method: 'POST', url: PATHS.guest, payload: {} });
      const setCookie = String(res.headers['set-cookie']);
      expect(setCookie).toMatch(/^__Host-bidazoo_guest=/);
      expect(setCookie).toMatch(/Secure/);
      expect(setCookie).toMatch(/HttpOnly/);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      expect(setCookie).toMatch(/Path=\//);
      expect(setCookie).not.toMatch(/Domain=/i);
    } finally {
      await secure.close();
    }
  });

  it('reconnects the same guest after a refresh (same cookie, same player, no new cookie)', async () => {
    const browser = new TestBrowser(h.app, h.ctx.cookie.name);
    const first = await browser.request('POST', PATHS.guest, {});
    const reloaded = new TestBrowser(h.app, h.ctx.cookie.name);
    reloaded.cookie = browser.cookie; // the browser keeps its cookie jar across a reload
    const second = await reloaded.request('POST', PATHS.guest, {});
    expect(second.body.player.id).toBe(first.body.player.id);
    expect(second.headers['set-cookie']).toBeUndefined();
    const me = await reloaded.request('GET', PATHS.me);
    expect(me.status).toBe(200);
    expect(me.body.player.id).toBe(first.body.player.id);
  });

  it('stores only a hash of the token, never the token itself', async () => {
    const browser = new TestBrowser(h.app, h.ctx.cookie.name);
    const res = await browser.request('POST', PATHS.guest, {});
    const rows = await sql<{ token_hash: string }>(
      h,
      'select token_hash from guest_sessions where player_id = $1',
      [res.body.player.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).toBe(createHash('sha256').update(browser.cookie as string).digest('hex'));
    expect(rows[0]?.token_hash).not.toBe(browser.cookie);
  });

  it('rejects missing, malformed, unknown, and bearer-header credentials', async () => {
    const anonymous = new TestBrowser(h.app, h.ctx.cookie.name);
    expect((await anonymous.request('GET', PATHS.me)).status).toBe(401);

    const malformed = new TestBrowser(h.app, h.ctx.cookie.name);
    malformed.cookie = 'not-a-token';
    expect((await malformed.request('GET', PATHS.me)).status).toBe(401);

    const unknown = new TestBrowser(h.app, h.ctx.cookie.name);
    unknown.cookie = 'A'.repeat(43);
    expect((await unknown.request('GET', PATHS.me)).status).toBe(401);

    // A bearer token is not an identity mechanism here, even a real one.
    const real = new TestBrowser(h.app, h.ctx.cookie.name);
    await real.request('POST', PATHS.guest, {});
    const viaHeader = await h.app.inject({
      method: 'GET',
      url: PATHS.me,
      headers: { authorization: `Bearer ${real.cookie}` },
    });
    expect(viaHeader.statusCode).toBe(401);
  });

  it('a garbage cookie on POST /guest yields a brand-new guest, not an error', async () => {
    const browser = new TestBrowser(h.app, h.ctx.cookie.name);
    browser.cookie = 'garbage';
    const res = await browser.request('POST', PATHS.guest, {});
    expect(res.status).toBe(200);
    expect(browser.cookie).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('expires after the cookie lifetime', async () => {
    const browser = new TestBrowser(h.app, h.ctx.cookie.name);
    await browser.request('POST', PATHS.guest, {});
    expect((await browser.request('GET', PATHS.me)).status).toBe(200);
    h.clock.advanceDays(91);
    expect((await browser.request('GET', PATHS.me)).status).toBe(401);
    h.clock.advanceDays(-91);
  });

  it('stores minimal child data: an opaque id and a generated nickname', async () => {
    const before = await countRows(h, 'players');
    const browser = new TestBrowser(h.app, h.ctx.cookie.name);
    const res = await browser.request('POST', PATHS.guest, {});
    expect(await countRows(h, 'players')).toBe(before + 1);
    expect(res.body.player.nickname).toMatch(/^Guest-[0-9a-f]{6}$/);
    const columns = await sql<{ column_name: string }>(
      h,
      "select column_name from information_schema.columns where table_name = 'players' order by 1",
    );
    expect(columns.map((c) => c.column_name)).toEqual(['created_at', 'id', 'nickname']);
  });
});
