import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiPaths } from '@bidazoo/contracts';
import { HAS_DB, TestBrowser, countRows, makeHarness, sql, type Harness } from './support/harness';

let counter = 0;
const uniqueEmail = (tag = 'g') => `${tag}-${Date.now().toString(36)}-${(counter += 1)}@example.test`;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** The token in the most recent link mailed to `to`. */
function tokenFor(h: Harness, to: string): string {
  const message = h.mailer.lastTo(to);
  if (!message) throw new Error(`no mail to ${to}`);
  const match = /#t=([A-Za-z0-9_-]{43})/.exec(message.text);
  if (!match?.[1]) throw new Error('no link in mail');
  return match[1];
}

const browserFor = (h: Harness) => new TestBrowser(h.app, h.ctx.cookie.name, h.ctx.cookie.secure ? '__Host-bidazoo_device' : 'bidazoo_device');

async function requestLink(h: Harness, email: string, ip?: string) {
  const b = browserFor(h);
  b.remoteAddress = ip;
  const res = await b.request('POST', ApiPaths.guardianEmailLinks, { email });
  await h.identity?.mail.idle();
  return res;
}

describe.skipIf(!HAS_DB)('guardian email-link sign-in', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: {} });
  });
  afterAll(async () => {
    await h.close();
  });

  it('answers 202 with the same body for a known and an unknown address', async () => {
    const known = uniqueEmail('known');
    const first = await requestLink(h, known);
    const c = browserFor(h);
    await c.request('POST', ApiPaths.guardianEmailLinkConsume, { token: tokenFor(h, known) });
    const again = await requestLink(h, known);
    const unknown = await requestLink(h, uniqueEmail('unknown'));
    expect(first.status).toBe(202);
    expect(again.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(again.raw).toBe(unknown.raw);
    expect(again.raw).not.toMatch(/exist|known|account|found/i);
  });

  it('emails a fragment link built from PUBLIC_BASE_URL, never the Host header', async () => {
    const email = uniqueEmail();
    const b = browserFor(h);
    await b.request('POST', ApiPaths.guardianEmailLinks, { email }, { host: 'evil.example' });
    await h.identity?.mail.idle();
    const text = h.mailer.lastTo(email)?.text ?? '';
    expect(text).toContain('http://localhost:5173/account.html#t=');
    expect(text).not.toContain('evil.example');
  });

  it('stores only a hash of the token, and no account exists before the link is used', async () => {
    const email = uniqueEmail();
    await requestLink(h, email);
    const token = tokenFor(h, email);
    const rows = await sql(h, 'select token_hash, email from guardian_login_tokens where token_hash = $1', [sha256(token)]);
    expect(rows).toHaveLength(1);
    expect(await sql(h, 'select 1 from guardian_login_tokens where token_hash = $1', [token])).toHaveLength(0);
    expect(await countRows(h, 'guardians', 'email = $1', [email])).toBe(0);
  });

  it('consumes a link once: creates the family and guardian, sets a device cookie, never returns a token', async () => {
    const email = uniqueEmail();
    await requestLink(h, email);
    const token = tokenFor(h, email);
    const b = browserFor(h);
    const res = await b.request('POST', ApiPaths.guardianEmailLinkConsume, { token, deviceLabel: 'Kitchen tablet' });
    expect(res.status).toBe(200);
    expect(res.body.guardianAuthority).toBe(true);
    expect(res.body.device.label).toBe('Kitchen tablet');
    expect(res.body.children).toEqual([]);
    expect(b.deviceCookie).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.raw).not.toContain(b.deviceCookie as string);
    expect(res.raw).not.toContain(token);
    const cookie = b.setCookieLog.find((l) => l.startsWith('bidazoo_device='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(await countRows(h, 'guardians', 'email = $1', [email])).toBe(1);
    // The stored device token is a hash; the pending email on the used link is cleared.
    const stored = await sql(h, 'select 1 from device_sessions where token_hash = $1', [sha256(b.deviceCookie as string)]);
    expect(stored).toHaveLength(1);
    const link = await sql(h, 'select used_at, email from guardian_login_tokens where token_hash = $1', [sha256(token)]);
    expect(link[0]?.used_at).not.toBeNull();
    expect(link[0]?.email).toBeNull();
  });

  it('rejects replay, unknown and malformed tokens identically', async () => {
    const email = uniqueEmail();
    await requestLink(h, email);
    const token = tokenFor(h, email);
    const ok = await browserFor(h).request('POST', ApiPaths.guardianEmailLinkConsume, { token });
    expect(ok.status).toBe(200);
    const replay = await browserFor(h).request('POST', ApiPaths.guardianEmailLinkConsume, { token });
    const unknown = await browserFor(h).request('POST', ApiPaths.guardianEmailLinkConsume, { token: 'A'.repeat(43) });
    expect(replay.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(replay.body.error.code).toBe('link_invalid');
    expect(unknown.body).toEqual(replay.body);
  });

  it('rejects an expired link and creates no guardian', async () => {
    const email = uniqueEmail();
    await requestLink(h, email);
    const token = tokenFor(h, email);
    h.clock.advance(16 * 60_000);
    const res = await browserFor(h).request('POST', ApiPaths.guardianEmailLinkConsume, { token });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('link_invalid');
    expect(await countRows(h, 'guardians', 'email = $1', [email])).toBe(0);
  });

  it('lets exactly one of several concurrent redemptions win', async () => {
    const email = uniqueEmail();
    await requestLink(h, email);
    const token = tokenFor(h, email);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => browserFor(h).request('POST', ApiPaths.guardianEmailLinkConsume, { token })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(5);
    expect(await countRows(h, 'guardians', 'email = $1', [email])).toBe(1);
  });

  it('gives two links for the same new address one family and one guardian', async () => {
    const email = uniqueEmail();
    await requestLink(h, email);
    const a = tokenFor(h, email);
    await requestLink(h, email);
    const b = tokenFor(h, email);
    expect(a).not.toBe(b);
    const [r1, r2] = await Promise.all([
      browserFor(h).request('POST', ApiPaths.guardianEmailLinkConsume, { token: a }),
      browserFor(h).request('POST', ApiPaths.guardianEmailLinkConsume, { token: b }),
    ]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(await countRows(h, 'guardians', 'email = $1', [email])).toBe(1);
    const fam = await sql(h, 'select family_id from device_sessions where guardian_id = (select id from guardians where email = $1)', [email]);
    expect(new Set(fam.map((r) => r.family_id)).size).toBe(1);
  });

  it('issues a fresh device token when a browser that already has one signs in again, retiring the old one', async () => {
    const email = uniqueEmail();
    const b = browserFor(h);
    await requestLink(h, email);
    await b.request('POST', ApiPaths.guardianEmailLinkConsume, { token: tokenFor(h, email) });
    const first = b.deviceCookie as string;
    await requestLink(h, email);
    await b.request('POST', ApiPaths.guardianEmailLinkConsume, { token: tokenFor(h, email) });
    expect(b.deviceCookie).not.toBe(first);
    const old = await sql(h, 'select revoked_at from device_sessions where token_hash = $1', [sha256(first)]);
    expect(old[0]?.revoked_at).not.toBeNull();
  });

  it('keeps a mail failure invisible to the caller', async () => {
    const email = uniqueEmail();
    h.mailer.failNext();
    const res = await requestLink(h, email);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
    expect(h.mailer.lastTo(email)).toBeUndefined();
  });

  it('rejects a malformed address with 400 and sends nothing', async () => {
    const before = h.mailer.outbox.length;
    const res = await requestLink(h, 'not an email');
    expect(res.status).toBe(400);
    expect(h.mailer.outbox.length).toBe(before);
  });
});

describe.skipIf(!HAS_DB)('guardian sign-in: durable abuse limits', () => {
  it('silently accepts per-address overflow without sending mail, and the counter survives a restart', async () => {
    const secret = `restart-secret-${Date.now().toString(36)}-0123456789abcdef0123456789`;
    const h1 = await makeHarness({ identity: { config: { secret }, limits: { loginEmail: { max: 2, windowSeconds: 3600 } } } });
    const email = uniqueEmail('flood');
    try {
      for (let i = 0; i < 2; i += 1) expect((await requestLink(h1, email)).status).toBe(202);
      expect(h1.mailer.outbox.filter((m) => m.to === email)).toHaveLength(2);
    } finally {
      await h1.close();
    }
    const h2 = await makeHarness({ identity: { config: { secret }, limits: { loginEmail: { max: 2, windowSeconds: 3600 } } } });
    try {
      const over = await requestLink(h2, email);
      expect(over.status).toBe(202);
      expect(over.body).toEqual({ accepted: true });
      expect(h2.mailer.outbox.filter((m) => m.to === email)).toHaveLength(0);
      expect(await countRows(h2, 'guardian_login_tokens', 'email = $1 and used_at is null', [email])).toBe(2);
    } finally {
      await h2.close();
    }
  });

  it('answers 429 with Retry-After for per-client overflow, and recovers after the window', async () => {
    const h = await makeHarness({ identity: { limits: { loginIp: { max: 2, windowSeconds: 600 } } } });
    try {
      const ip = '10.77.0.1';
      expect((await requestLink(h, uniqueEmail(), ip)).status).toBe(202);
      expect((await requestLink(h, uniqueEmail(), ip)).status).toBe(202);
      const blocked = await requestLink(h, uniqueEmail(), ip);
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect((await requestLink(h, uniqueEmail(), '10.77.0.2')).status).toBe(202);
      h.clock.advance(601_000);
      expect((await requestLink(h, uniqueEmail(), ip)).status).toBe(202);
    } finally {
      await h.close();
    }
  });

  it('answers 503 when the whole service is over its sign-in budget', async () => {
    const h = await makeHarness({ identity: { limits: { loginGlobal: { max: 1, windowSeconds: 3600 } } } });
    try {
      const first = await requestLink(h, uniqueEmail(), '10.78.0.1');
      const second = await requestLink(h, uniqueEmail(), '10.78.0.2');
      expect(first.status).toBe(202);
      expect(second.status).toBe(503);
      expect(second.body.error.code).toBe('service_busy');
    } finally {
      await h.close();
    }
  });

  it('throttles link redemption per client without spending a valid link', async () => {
    const h = await makeHarness({ identity: { limits: { linkConsumeIp: { max: 3, windowSeconds: 900 } } } });
    try {
      const ip = '10.79.0.1';
      const email = uniqueEmail();
      await requestLink(h, email, '10.79.0.9');
      const token = tokenFor(h, email);
      const attacker = browserFor(h);
      attacker.remoteAddress = ip;
      const codes: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        codes.push((await attacker.request('POST', ApiPaths.guardianEmailLinkConsume, { token: 'B'.repeat(43) })).status);
      }
      expect(codes).toEqual([400, 400, 400, 429]);
      // The throttled client is blocked, but the real link is untouched and works from elsewhere.
      const owner = browserFor(h);
      owner.remoteAddress = '10.79.0.2';
      expect((await owner.request('POST', ApiPaths.guardianEmailLinkConsume, { token })).status).toBe(200);
    } finally {
      await h.close();
    }
  });

  it('keeps no raw email or address in the throttle table', async () => {
    const h = await makeHarness({ identity: {} });
    try {
      const email = uniqueEmail('privacy');
      await requestLink(h, email, '10.80.0.1');
      const rows = await sql(h, 'select key_hash as s from identity_throttles');
      const dump = JSON.stringify(rows);
      expect(dump).not.toContain(email);
      expect(dump).not.toContain('10.80.0.1');
    } finally {
      await h.close();
    }
  });
});

describe.skipIf(!HAS_DB)('guardian sign-in: configuration', () => {
  it('registers no identity route when identity is off (guest-only build)', async () => {
    const h = await makeHarness();
    try {
      const b = browserFor(h);
      expect((await b.request('POST', ApiPaths.guardianEmailLinks, { email: uniqueEmail() })).status).toBe(404);
      expect((await b.request('POST', ApiPaths.guardianEmailLinkConsume, { token: 'A'.repeat(43) })).status).toBe(404);
    } finally {
      await h.close();
    }
  });

  it('uses the __Host- device cookie name and the Secure flag in secure configuration', async () => {
    const h = await makeHarness({ cookieSecure: true, identity: {} });
    try {
      const email = uniqueEmail();
      await requestLink(h, email);
      const b = browserFor(h);
      const res = await b.request('POST', ApiPaths.guardianEmailLinkConsume, { token: tokenFor(h, email) });
      expect(res.status).toBe(200);
      const line = b.setCookieLog.find((l) => l.startsWith('__Host-bidazoo_device='))!;
      expect(line).toMatch(/Secure/i);
      expect(line).toMatch(/HttpOnly/i);
      expect(line).toMatch(/Path=\//);
      expect(line).not.toMatch(/Domain=/i);
    } finally {
      await h.close();
    }
  });
});
