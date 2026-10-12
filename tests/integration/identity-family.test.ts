import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiPaths } from '@bidazoo/contracts';
import {
  HAS_DB, PATHS, countRows, deviceBrowser, makeHarness, newPlayer, playSession, signInGuardian, sql, uniqueEmail,
  type Harness,
} from './support/harness';

describe.skipIf(!HAS_DB)('family and child profiles', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness({ identity: {} });
  });
  afterAll(async () => {
    await h.close();
  });

  it('requires a signed-in guardian device: 401 without one, even with a guest cookie', async () => {
    const guest = await newPlayer(h);
    for (const [method, path, body] of [
      ['GET', ApiPaths.family, undefined],
      ['POST', ApiPaths.familyChildren, { nickname: 'Mia' }],
    ] as const) {
      expect((await deviceBrowser(h).request(method, path, body)).status).toBe(401);
      expect((await guest.request(method, path, body)).status).toBe(401);
    }
  });

  it('creates a child with a fresh player and no history, with no email, and lists it', async () => {
    const { browser, email } = await signInGuardian(h);
    const res = await browser.request('POST', ApiPaths.familyChildren, { nickname: 'Mia' });
    expect(res.status).toBe(201);
    expect(res.body.child).toMatchObject({ nickname: 'Mia', hasPin: false, archived: false });
    expect(Object.keys(res.body.child).sort()).toEqual(['archived', 'hasPin', 'id', 'nickname']);
    const rows = await sql(h, 'select player_id from child_profiles where id = $1', [res.body.child.id]);
    expect(await countRows(h, 'attempts', 'player_id = $1', [rows[0]?.player_id])).toBe(0);
    const family = await browser.request('GET', ApiPaths.family);
    expect(family.status).toBe(200);
    expect(family.body.guardianEmail).toBe(email);
    expect(family.body.children).toHaveLength(1);
    // The guardian's address never appears on a child.
    expect(JSON.stringify(family.body.children)).not.toContain(email);
  });

  it('rejects unknown fields, including a player id', async () => {
    const { browser } = await signInGuardian(h);
    const res = await browser.request('POST', ApiPaths.familyChildren, { nickname: 'Mia', playerId: crypto.randomUUID() });
    expect(res.status).toBe(400);
  });

  it('archives and restores idempotently without touching history', async () => {
    const { browser } = await signInGuardian(h);
    const child = (await browser.request('POST', ApiPaths.familyChildren, { nickname: 'Leo' })).body.child;
    const before = await countRows(h, 'audit_events', "action like 'child.%' and subject_id = $1", [child.id]);
    const a1 = await browser.request('POST', ApiPaths.familyChildArchive(child.id), {});
    const a2 = await browser.request('POST', ApiPaths.familyChildArchive(child.id), {});
    expect(a1.body.child.archived).toBe(true);
    expect(a2.body.child.archived).toBe(true);
    expect((await browser.request('GET', ApiPaths.family)).body.children[0].archived).toBe(true);
    const r = await browser.request('POST', ApiPaths.familyChildRestore(child.id), {});
    expect(r.body.child.archived).toBe(false);
    // Created + one archive + one restore; the repeated archive wrote nothing.
    expect(await countRows(h, 'audit_events', "action like 'child.%' and subject_id = $1", [child.id])).toBe(before + 2);
    const row = await sql(h, 'select player_id from child_profiles where id = $1', [child.id]);
    expect(await countRows(h, 'players', 'id = $1', [row[0]?.player_id])).toBe(1);
  });

  it("treats another family's profile as not found", async () => {
    const a = await signInGuardian(h);
    const b = await signInGuardian(h);
    const child = (await a.browser.request('POST', ApiPaths.familyChildren, { nickname: 'Ava' })).body.child;
    expect((await b.browser.request('POST', ApiPaths.familyChildArchive(child.id), {})).status).toBe(404);
    expect((await b.browser.request('POST', ApiPaths.familyChildRestore(child.id), {})).status).toBe(404);
    expect((await b.browser.request('POST', ApiPaths.familyChildArchive(crypto.randomUUID()), {})).status).toBe(404);
    expect((await b.browser.request('GET', ApiPaths.family)).body.children).toEqual([]);
    expect((await a.browser.request('GET', ApiPaths.family)).body.children[0].archived).toBe(false);
  });

  it('expires guardian authority after the window: 403 until the guardian signs in again', async () => {
    const { browser, email } = await signInGuardian(h);
    h.clock.advance(25 * 3_600_000);
    expect((await browser.request('GET', ApiPaths.family)).status).toBe(403);
    await signInGuardian(h, { email, browser });
    expect((await browser.request('GET', ApiPaths.family)).status).toBe(200);
  });

  it('keeps a guest cookie out of family routes and leaves guest play untouched', async () => {
    const guest = await newPlayer(h);
    await playSession(guest);
    expect((await guest.request('GET', PATHS.me)).status).toBe(200);
    expect((await guest.request('GET', ApiPaths.family)).status).toBe(401);
  });

  it('reuses one family for repeated sign-ins and keeps separate families separate', async () => {
    const email = uniqueEmail();
    const one = await signInGuardian(h, { email });
    await one.browser.request('POST', ApiPaths.familyChildren, { nickname: 'Zed' });
    const two = await signInGuardian(h, { email });
    expect((await two.browser.request('GET', ApiPaths.family)).body.children).toHaveLength(1);
    const other = await signInGuardian(h);
    expect((await other.browser.request('GET', ApiPaths.family)).body.children).toHaveLength(0);
  });

  it('writes audit events without secrets', async () => {
    const { browser, email } = await signInGuardian(h);
    const child = (await browser.request('POST', ApiPaths.familyChildren, { nickname: 'Nia' })).body.child;
    const rows = await sql(
      h,
      'select * from audit_events where family_id = (select family_id from guardians where email = $1)',
      [email],
    );
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(['guardian.created', 'guardian.verified', 'device.authorized', 'child.created']));
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(email);
    expect(dump).not.toContain(browser.deviceCookie as string);
  });
});
