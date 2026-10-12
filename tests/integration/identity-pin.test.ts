import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiPaths } from '@bidazoo/contracts';
import {
  HAS_DB, PATHS, TestBrowser, TEST_IDENTITY_SECRET, countRows, deviceBrowser, makeHarness, newPlayer, signInGuardian, sql,
  type Harness,
} from './support/harness';

const PIN = '4827';
const WRONG = '1111';

interface Setup {
  guardian: TestBrowser;
  email: string;
  child: { id: string };
  /** A trusted child device with NO profile selected yet (so it must use the switch route). */
  kid: TestBrowser;
}

async function codeDevice(h: Harness, guardian: TestBrowser): Promise<TestBrowser> {
  const code = (await guardian.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
  const kid = deviceBrowser(h);
  const res = await kid.request('POST', ApiPaths.deviceCodesRedeem, { code });
  if (res.status !== 200) throw new Error(`redeem failed ${res.status} ${res.raw}`);
  return kid;
}

async function setup(h: Harness, withPin = true): Promise<Setup> {
  const { browser: guardian, email } = await signInGuardian(h);
  const child = (await guardian.request('POST', ApiPaths.familyChildren, { nickname: 'Mia' })).body.child as { id: string };
  if (withPin) expect((await guardian.request('POST', ApiPaths.familyChildPin(child.id), { pin: PIN })).status).toBe(200);
  return { guardian, email, child, kid: await codeDevice(h, guardian) };
}

const switchTo = (browser: TestBrowser, childProfileId: string, pin?: string) =>
  browser.request('POST', ApiPaths.deviceProfile, pin === undefined ? { childProfileId } : { childProfileId, pin });

const pinState = async (h: Harness, childId: string) =>
  (await sql(h, 'select pin_hash, pin_failures, pin_locked_until from child_profiles where id = $1', [childId]))[0] as {
    pin_hash: string | null; pin_failures: number; pin_locked_until: Date | null;
  };

describe.skipIf(!HAS_DB)('profile PIN: set, reset, remove', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: {} });
  });
  afterAll(async () => {
    await h.close();
  });

  it('stores only a salted scrypt hash: never the PIN, different per profile and per set', async () => {
    const { guardian, child } = await setup(h);
    const other = (await guardian.request('POST', ApiPaths.familyChildren, { nickname: 'Leo' })).body.child;
    await guardian.request('POST', ApiPaths.familyChildPin(other.id), { pin: PIN });
    const a = (await pinState(h, child.id)).pin_hash as string;
    const b = (await pinState(h, other.id)).pin_hash as string;
    expect(a).toMatch(/^scrypt\$v1\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(a).not.toContain(PIN);
    expect(a).not.toBe(b); // same PIN, different profile (and salt)
    await guardian.request('POST', ApiPaths.familyChildPin(child.id), { pin: PIN });
    expect((await pinState(h, child.id)).pin_hash).not.toBe(a); // fresh salt on every set
  });

  it('reports hasPin without ever returning the PIN, a hash or a counter', async () => {
    const { guardian, child } = await setup(h, false);
    const res = await guardian.request('POST', ApiPaths.familyChildPin(child.id), { pin: PIN });
    expect(res.status).toBe(200);
    expect(res.body.child).toEqual({ id: child.id, nickname: 'Mia', hasPin: true, archived: false });
    expect(res.raw).not.toContain(PIN);
    expect(res.raw).not.toMatch(/scrypt|hash|salt|fail|lock/i);
    const family = await guardian.request('GET', ApiPaths.family);
    expect(family.body.children[0].hasPin).toBe(true);
  });

  it('requires guardian authority to set, reset or remove', async () => {
    const { guardian, child, kid } = await setup(h);
    const before = (await pinState(h, child.id)).pin_hash;
    for (const [method, body] of [['POST', { pin: '9999' }], ['DELETE', undefined]] as const) {
      expect((await kid.request(method, ApiPaths.familyChildPin(child.id), body)).status).toBe(403); // trusted, no authority
      expect((await deviceBrowser(h).request(method, ApiPaths.familyChildPin(child.id), body)).status).toBe(401);
      const guest = await newPlayer(h);
      expect((await guest.request(method, ApiPaths.familyChildPin(child.id), body)).status).toBe(401);
    }
    expect((await pinState(h, child.id)).pin_hash).toBe(before);
    h.clock.advance(25 * 3_600_000);
    expect((await guardian.request('POST', ApiPaths.familyChildPin(child.id), { pin: '9999' })).status).toBe(403);
  });

  it("won't touch another family's profile", async () => {
    const a = await setup(h, false);
    const b = await setup(h, false);
    expect((await b.guardian.request('POST', ApiPaths.familyChildPin(a.child.id), { pin: PIN })).status).toBe(404);
    expect((await b.guardian.request('DELETE', ApiPaths.familyChildPin(a.child.id))).status).toBe(404);
    expect((await pinState(h, a.child.id)).pin_hash).toBeNull();
  });

  it('accepts exactly four digits and nothing else', async () => {
    const { guardian, child } = await setup(h, false);
    for (const pin of ['123', '12345', 'abcd', '12 4', '', '１２３４']) {
      expect((await guardian.request('POST', ApiPaths.familyChildPin(child.id), { pin })).status).toBe(400);
    }
    expect((await guardian.request('POST', ApiPaths.familyChildPin(child.id), { pin: 1234 })).status).toBe(400);
    expect((await guardian.request('POST', ApiPaths.familyChildPin(child.id), { pin: PIN, extra: 1 })).status).toBe(400);
    expect((await pinState(h, child.id)).pin_hash).toBeNull();
  });

  it('reset replaces the PIN and clears a lock; remove clears it and is idempotent', async () => {
    const { guardian, child, kid } = await setup(h);
    for (let i = 0; i < 5; i += 1) await switchTo(kid, child.id, WRONG);
    expect((await pinState(h, child.id)).pin_locked_until).not.toBeNull();
    expect((await guardian.request('POST', ApiPaths.familyChildPin(child.id), { pin: '2468' })).status).toBe(200);
    expect(await pinState(h, child.id)).toMatchObject({ pin_failures: 0, pin_locked_until: null });
    expect((await switchTo(kid, child.id, PIN)).status).toBe(403); // the old PIN is gone
    expect((await switchTo(kid, child.id, '2468')).status).toBe(200);
    const removed = await guardian.request('DELETE', ApiPaths.familyChildPin(child.id));
    expect(removed.body.child.hasPin).toBe(false);
    expect((await guardian.request('DELETE', ApiPaths.familyChildPin(child.id))).status).toBe(200);
    expect(await countRows(h, 'audit_events', "action = 'pin.cleared' and subject_id = $1", [child.id])).toBe(1);
  });

  it('writes audit events that never contain the PIN or a hash', async () => {
    const { guardian, child, kid, email } = await setup(h);
    await guardian.request('POST', ApiPaths.familyChildPin(child.id), { pin: '2468' });
    for (let i = 0; i < 5; i += 1) await switchTo(kid, child.id, WRONG);
    await guardian.request('DELETE', ApiPaths.familyChildPin(child.id));
    const rows = await sql(h, "select action, meta from audit_events where subject_id = $1 and action like 'pin.%' order by id", [child.id]);
    expect(rows.map((r) => r.action)).toEqual(['pin.set', 'pin.set', 'pin.locked', 'pin.cleared']);
    expect(rows.map((r) => r.meta.wasSet)).toEqual([false, true, undefined, undefined]);
    const dump = JSON.stringify(rows);
    for (const secret of [PIN, '2468', WRONG, email, (await pinState(h, child.id)).pin_hash ?? 'none']) {
      expect(dump).not.toContain(secret);
    }
  });
});

describe.skipIf(!HAS_DB)('profile PIN: switching on a trusted device', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: {} });
  });
  afterAll(async () => {
    await h.close();
  });

  it('a profile WITHOUT a PIN switches with no PIN, exactly as before, and leaves PIN state untouched', async () => {
    const { child, kid } = await setup(h, false);
    const res = await switchTo(kid, child.id);
    expect(res.status).toBe(200);
    expect(res.body.activeChildId).toBe(child.id);
    expect((await switchTo(kid, child.id, WRONG)).status).toBe(200); // a stray pin field is simply not needed
    expect(await pinState(h, child.id)).toMatchObject({ pin_hash: null, pin_failures: 0, pin_locked_until: null });
    const me = await kid.request('GET', PATHS.me);
    expect(me.status).toBe(200);
  });

  it('a PIN-protected profile needs the correct PIN; missing, wrong and right behave as specified', async () => {
    const { child, kid } = await setup(h);
    const missing = await switchTo(kid, child.id);
    const wrong = await switchTo(kid, child.id, WRONG);
    expect(missing.status).toBe(403);
    expect(wrong.status).toBe(403);
    expect(missing.body.error.code).toBe('pin_incorrect');
    expect(wrong.body).toEqual(missing.body);
    expect((await kid.request('GET', PATHS.me)).status).toBe(409); // still no profile selected
    const ok = await switchTo(kid, child.id, PIN);
    expect(ok.status).toBe(200);
    expect(ok.body.activeChildId).toBe(child.id);
    expect((await kid.request('GET', PATHS.me)).status).toBe(200);
  });

  it('a missing PIN is not a guess: it does not count toward the lock', async () => {
    const { child, kid } = await setup(h);
    for (let i = 0; i < 8; i += 1) await switchTo(kid, child.id);
    expect(await pinState(h, child.id)).toMatchObject({ pin_failures: 0, pin_locked_until: null });
  });

  it('PIN-protected profiles also need the PIN on a guardian-authorized device', async () => {
    const { guardian, child } = await setup(h);
    expect((await switchTo(guardian, child.id)).status).toBe(403);
    expect((await switchTo(guardian, child.id, PIN)).status).toBe(200);
  });

  it("family boundary: another family's child is a generic 404 before any PIN work", async () => {
    const mine = await setup(h, false);
    const foreign = await setup(h); // has a PIN
    const a = await switchTo(mine.kid, foreign.child.id, PIN);
    const b = await switchTo(mine.kid, foreign.child.id, WRONG);
    const c = await switchTo(mine.kid, crypto.randomUUID(), WRONG);
    for (const res of [a, b, c]) expect(res.status).toBe(404);
    expect(a.body).toEqual(c.body);
    expect(b.body).toEqual(c.body);
    expect(a.raw).not.toMatch(/pin|family|lock/i);
    // The foreign profile was never reached: no failure counted, no lock, and nothing switched.
    expect(await pinState(h, foreign.child.id)).toMatchObject({ pin_failures: 0, pin_locked_until: null });
    expect((await mine.kid.request('GET', ApiPaths.device)).body.activeChildId).toBeNull();
  });

  it('an archived profile cannot be switched to, with or without its PIN', async () => {
    const { guardian, child, kid } = await setup(h);
    await guardian.request('POST', ApiPaths.familyChildArchive(child.id), {});
    expect((await switchTo(kid, child.id, PIN)).status).toBe(404);
    expect((await switchTo(kid, child.id, WRONG)).status).toBe(404);
    expect(await pinState(h, child.id)).toMatchObject({ pin_failures: 0 });
  });

  it('a missing, unknown, revoked or expired device cannot verify a PIN or switch, and burns no counter', async () => {
    const { guardian, child, kid } = await setup(h);
    expect((await switchTo(deviceBrowser(h), child.id, PIN)).status).toBe(401);
    const unknown = deviceBrowser(h);
    unknown.deviceCookie = 'A'.repeat(43);
    expect((await switchTo(unknown, child.id, WRONG)).status).toBe(401);
    const id = (await kid.request('GET', ApiPaths.device)).body.device.id as string;
    await guardian.request('POST', ApiPaths.deviceRevoke(id), {});
    expect((await switchTo(kid, child.id, PIN)).status).toBe(401);
    expect((await switchTo(kid, child.id, WRONG)).status).toBe(401);
    expect(await pinState(h, child.id)).toMatchObject({ pin_failures: 0, pin_locked_until: null });

    const other = await codeDevice(h, guardian);
    h.clock.advanceDays(91);
    expect((await switchTo(other, child.id, PIN)).status).toBe(401);
  });

  it('a hash copied from another profile does not verify (it is bound to its own profile)', async () => {
    const { guardian, child, kid } = await setup(h);
    const twin = (await guardian.request('POST', ApiPaths.familyChildren, { nickname: 'Twin' })).body.child;
    await sql(h, 'update child_profiles set pin_hash = (select pin_hash from child_profiles where id = $1), pin_set_at = now() where id = $2', [child.id, twin.id]);
    expect((await switchTo(kid, twin.id, PIN)).status).toBe(403);
    expect((await switchTo(kid, child.id, PIN)).status).toBe(200);
  });

  it('the PIN is accepted nowhere else: sign-in, device codes, claims and sessions reject it', async () => {
    const { child } = await setup(h);
    const none = deviceBrowser(h);
    expect((await none.request('POST', ApiPaths.guardianEmailLinks, { email: 'x@example.test', pin: PIN })).status).toBe(400);
    expect((await none.request('POST', ApiPaths.guardianEmailLinkConsume, { token: 'A'.repeat(43), pin: PIN })).status).toBe(400);
    expect((await none.request('POST', ApiPaths.deviceCodesRedeem, { code: 'ABCD-EFGH', pin: PIN })).status).toBe(400);
    expect((await none.request('POST', ApiPaths.familyChildrenFromGuest, { nickname: 'Mia', pin: PIN })).status).toBe(400);
    expect((await none.request('POST', PATHS.guest, { pin: PIN, childProfileId: child.id })).status).toBe(400);
    // And with no trusted device, the switch route itself offers no way in.
    expect((await switchTo(none, child.id, PIN)).status).toBe(401);
  });
});

describe.skipIf(!HAS_DB)('profile PIN: durable lockout', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: {} });
  });
  afterAll(async () => {
    await h.close();
  });

  it('locks after five wrong PINs; even the correct PIN is refused while locked, and the lock is not extended', async () => {
    const { child, kid } = await setup(h);
    for (let i = 0; i < 4; i += 1) expect((await switchTo(kid, child.id, WRONG)).status).toBe(403);
    expect(await pinState(h, child.id)).toMatchObject({ pin_failures: 4, pin_locked_until: null });
    expect((await switchTo(kid, child.id, WRONG)).status).toBe(403);
    const locked = await pinState(h, child.id);
    expect(locked.pin_failures).toBe(5);
    expect(locked.pin_locked_until?.getTime()).toBe(h.clock.now().getTime() + 15 * 60_000);

    h.clock.advance(60_000);
    const right = await switchTo(kid, child.id, PIN);
    const wrong = await switchTo(kid, child.id, WRONG);
    expect(right.status).toBe(403);
    expect(right.body).toEqual(wrong.body); // locked looks like wrong: nothing about the lock leaks
    expect(right.headers['retry-after']).toBeUndefined();
    expect(right.raw).not.toMatch(/lock|attempt|minute|retry/i);
    expect(await pinState(h, child.id)).toEqual(locked); // neither counter nor lock moved
    expect(await countRows(h, 'audit_events', "action = 'pin.locked' and subject_id = $1", [child.id])).toBe(1);
  });

  it('after the lock expires the counter stays at the threshold: one wrong PIN re-locks at once (strict by design)', async () => {
    const { child, kid } = await setup(h);
    for (let i = 0; i < 5; i += 1) await switchTo(kid, child.id, WRONG);
    h.clock.advance(15 * 60_000 + 1000);
    expect((await pinState(h, child.id)).pin_failures).toBe(5);
    expect((await switchTo(kid, child.id, WRONG)).status).toBe(403);
    const again = await pinState(h, child.id);
    expect(again.pin_failures).toBe(5);
    expect(again.pin_locked_until?.getTime()).toBe(h.clock.now().getTime() + 15 * 60_000);
    expect((await switchTo(kid, child.id, PIN)).status).toBe(403); // locked again
    expect(await countRows(h, 'audit_events', "action = 'pin.locked' and subject_id = $1", [child.id])).toBe(2);
  });

  it('a correct PIN after the lock expires succeeds and resets the counter', async () => {
    const { child, kid } = await setup(h);
    for (let i = 0; i < 5; i += 1) await switchTo(kid, child.id, WRONG);
    h.clock.advance(15 * 60_000 + 1000);
    expect((await switchTo(kid, child.id, PIN)).status).toBe(200);
    expect(await pinState(h, child.id)).toMatchObject({ pin_failures: 0, pin_locked_until: null });
    for (let i = 0; i < 4; i += 1) await switchTo(kid, child.id, WRONG);
    expect((await pinState(h, child.id)).pin_locked_until).toBeNull(); // a fresh budget of five
  });

  it('a correct PIN before the threshold resets the counter', async () => {
    const { child, kid } = await setup(h);
    for (let i = 0; i < 3; i += 1) await switchTo(kid, child.id, WRONG);
    expect((await switchTo(kid, child.id, PIN)).status).toBe(200);
    expect((await pinState(h, child.id)).pin_failures).toBe(0);
  });

  it('counts parallel guesses one at a time: a burst cannot beat the limit', async () => {
    const { child, kid } = await setup(h);
    const results = await Promise.all(Array.from({ length: 12 }, () => switchTo(kid, child.id, WRONG)));
    expect(results.every((r) => r.status === 403)).toBe(true);
    expect(await pinState(h, child.id)).toMatchObject({ pin_failures: 5 });
    expect((await switchTo(kid, child.id, PIN)).status).toBe(403);
    expect(await countRows(h, 'audit_events', "action = 'pin.locked' and subject_id = $1", [child.id])).toBe(1);
  });

  it('a lock outlives an API restart (state is in the database)', async () => {
    const secret = `${TEST_IDENTITY_SECRET}-restart-${Date.now().toString(36)}`;
    const h1 = await makeHarness({ identity: { config: { secret } } });
    let child: { id: string };
    let kid: TestBrowser;
    try {
      ({ child, kid } = await setup(h1));
      for (let i = 0; i < 5; i += 1) await switchTo(kid, child.id, WRONG);
      expect((await pinState(h1, child.id)).pin_locked_until).not.toBeNull();
    } finally {
      await h1.close();
    }
    const h2 = await makeHarness({ identity: { config: { secret } } });
    try {
      const kid2 = new TestBrowser(h2.app, h2.ctx.cookie.name);
      kid2.deviceCookie = kid.deviceCookie;
      expect((await switchTo(kid2, child.id, PIN)).status).toBe(403);
      expect((await pinState(h2, child.id)).pin_failures).toBe(5);
      h2.clock.advance(16 * 60_000);
      expect((await switchTo(kid2, child.id, PIN)).status).toBe(200);
    } finally {
      await h2.close();
    }
  });

  it("one profile's lock does not affect its siblings", async () => {
    const { guardian, child, kid } = await setup(h);
    const sibling = (await guardian.request('POST', ApiPaths.familyChildren, { nickname: 'Leo' })).body.child;
    for (let i = 0; i < 5; i += 1) await switchTo(kid, child.id, WRONG);
    expect((await switchTo(kid, sibling.id)).status).toBe(200);
  });

  it('the per-device hourly cap is supplemental: 429 per device, without touching the profile counter', async () => {
    const hl = await makeHarness({ identity: { limits: { pinDevice: { max: 3, windowSeconds: 3600 } } } });
    try {
      const s = await setup(hl);
      const other = await codeDevice(hl, s.guardian);
      for (let i = 0; i < 3; i += 1) expect((await switchTo(s.kid, s.child.id, WRONG)).status).toBe(403);
      const capped = await switchTo(s.kid, s.child.id, PIN);
      expect(capped.status).toBe(429);
      expect(Number(capped.headers['retry-after'])).toBeGreaterThan(0);
      expect((await pinState(hl, s.child.id)).pin_failures).toBe(3);
      // Another device has its own allowance (the profile lock remains the shared control).
      expect((await switchTo(other, s.child.id, PIN)).status).toBe(200);
    } finally {
      await hl.close();
    }
  });
});

describe.skipIf(!HAS_DB)('profile PIN: identity not configured', () => {
  it('has no PIN routes and no device switching', async () => {
    const h = await makeHarness();
    try {
      const b = deviceBrowser(h);
      const id = crypto.randomUUID();
      expect((await b.request('POST', ApiPaths.familyChildPin(id), { pin: PIN })).status).toBe(404);
      expect((await b.request('DELETE', ApiPaths.familyChildPin(id))).status).toBe(404);
      expect((await b.request('POST', ApiPaths.deviceProfile, { childProfileId: id, pin: PIN })).status).toBe(404);
    } finally {
      await h.close();
    }
  });
});
