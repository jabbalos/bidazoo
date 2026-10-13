import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql as dsql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiPaths } from '@bidazoo/contracts';
import {
  MANIFEST_DELETE_REMINDER, MANIFEST_SENSITIVE_NOTICE, broadReadWarning, describeErrorForLog, hashHumanCode, hashLegacyClaimCode,
  issueLegacyClaimCode, legacyMatchHmac, loadLegacyManifest,
} from '@bidazoo/api/identity';
import {
  HAS_DB, TEST_DATABASE_URL, TestBrowser, allKeys, deviceBrowser, freshAddress, linkTokenFor, makeHarness, newPlayer, playerIdOf,
  signInGuardian, sql, uniqueEmail, type Harness,
} from './support/harness';
import { captureLogs, tablesContaining, withBrokenDb } from './support/identity-security';

const PEPPER = 'legacy-pepper-0123456789abcdef0123456789abcdef';
const rid = () => randomBytes(5).toString('hex');
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const PIN = '7391';
const WRONG_PIN = '2468';

interface Transcript {
  bodies: string[];
  /** Every response header except Set-Cookie, as JSON. */
  headers: string[];
  setCookies: string[];
  keys: Set<string>;
}

/** Records every response a browser gets, so the whole flow can be scanned afterwards. */
function track(browser: TestBrowser, log: Transcript): TestBrowser {
  const original = browser.request.bind(browser);
  browser.request = (async (...args: Parameters<TestBrowser['request']>) => {
    const res = await original(...args);
    log.bodies.push(res.raw ?? '');
    log.headers.push(JSON.stringify(Object.fromEntries(Object.entries(res.headers).filter(([k]) => k !== 'set-cookie'))));
    const cookies = res.headers['set-cookie'];
    log.setCookies.push(...(Array.isArray(cookies) ? cookies : cookies ? [String(cookies)] : []));
    allKeys(res.body, log.keys);
    return res;
  }) as TestBrowser['request'];
  return browser;
}

describe.skipIf(!HAS_DB)('secret and PII redaction across a full identity flow', () => {
  const logs = captureLogs();
  const log: Transcript = { bodies: [], headers: [], setCookies: [], keys: new Set() };
  let h: Harness;
  const raw: Record<string, string> = {};
  const hashes: Array<{ name: string; value: string; home: string }> = [];
  let guardianEmail = '';
  let legacyEmail = '';
  const ips: string[] = [];

  beforeAll(async () => {
    h = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } }, logger: logs.logger });
    const keys = h.identity!.keys;
    const addr = () => { const a = freshAddress(); ips.push(a); return a; };

    // Guardian signs in on a browser that already played as a guest.
    const guest = track(await newPlayer(h, addr()), log);
    await playerIdOf(guest);
    raw['guest cookie'] = guest.cookie as string;
    const signed = await signInGuardian(h, { browser: guest });
    guardianEmail = signed.email;
    raw['login token'] = linkTokenFor(h, guardianEmail);
    raw['guardian device cookie'] = guest.deviceCookie as string;

    // Family, PIN, a second device by code, profile switches (wrong and right PIN).
    const child = (await guest.request('POST', ApiPaths.familyChildren, { nickname: 'Mia' })).body.child as { id: string };
    await guest.request('POST', ApiPaths.familyChildrenFromGuest, { nickname: 'Zed' });
    await guest.request('POST', ApiPaths.familyChildPin(child.id), { pin: PIN });
    const issued = await guest.request('POST', ApiPaths.deviceCodes, {});
    raw['device code'] = issued.body.code as string;
    // The ONE place a raw code is meant to appear: the guardian's own issue response, shown once.
    expect(Object.keys(issued.body).sort()).toEqual(['code', 'expiresAt']);
    log.bodies.pop();
    const kid = track(deviceBrowser(h, addr()), log);
    await kid.request('POST', ApiPaths.deviceCodesRedeem, { code: raw['device code'] });
    raw['kid device cookie'] = kid.deviceCookie as string;
    await kid.request('POST', ApiPaths.deviceProfile, { childProfileId: child.id, pin: WRONG_PIN });
    await kid.request('POST', ApiPaths.deviceProfile, { childProfileId: child.id, pin: PIN });
    await kid.request('GET', ApiPaths.device);
    await guest.request('GET', ApiPaths.devices);
    await guest.request('GET', ApiPaths.family);

    // Legacy: one family claimed by verified email (same address as the guardian), one by operator
    // code (a DIFFERENT old address that must then exist nowhere in the database).
    legacyEmail = uniqueEmail('oldparent');
    const byEmail = `hq-fam-${rid()}`;
    const byCode = `hq-fam-${rid()}`;
    await loadLegacyManifest(h.database.db, h.clock, PEPPER, {
      version: 1,
      families: [
        { legacyFamilyId: byEmail, guardianEmail: guardianEmail, kids: [{ legacyKidId: `hq-kid-${rid()}`, username: 'a' }] },
        { legacyFamilyId: byCode, guardianEmail: legacyEmail, kids: [{ legacyKidId: `hq-kid-${rid()}`, username: 'b' }] },
      ],
    }, { loadedBy: 'test' });
    hashes.push({ name: 'legacy match (verified email)', value: legacyMatchHmac(PEPPER, guardianEmail), home: 'legacy_families' });
    hashes.push({ name: 'legacy match (old email)', value: legacyMatchHmac(PEPPER, legacyEmail.toLowerCase()), home: 'legacy_families' });
    const { code } = await issueLegacyClaimCode(h.database.db, h.clock, keys, { legacyFamilyId: byCode, days: 7 });
    raw['claim code'] = code;
    await guest.request('GET', ApiPaths.legacyOffer);
    await guest.request('POST', ApiPaths.legacyClaim, {});
    await guest.request('POST', ApiPaths.legacyClaimCode, { code });
    const kids = (await guest.request('GET', ApiPaths.legacyOffer)).body.offer.kids as Array<{ id: string }>;
    await guest.request('POST', ApiPaths.legacyKidLink(kids[0]!.id), { nickname: 'Old' });

    // Failures of every kind, so error bodies and throttle rows are exercised too.
    await guest.request('POST', ApiPaths.legacyClaimCode, { code: 'ABCD-EFGH-JKMN' });
    await deviceBrowser(h, addr()).request('POST', ApiPaths.deviceCodesRedeem, { code: raw['device code'] });
    await deviceBrowser(h, addr()).request('POST', ApiPaths.guardianEmailLinkConsume, { token: raw['login token'] });
    const stranger = track(deviceBrowser(h, addr()), log);
    await stranger.request('POST', ApiPaths.guardianEmailLinks, { email: uniqueEmail('stranger') });

    // Revocation, last.
    const kidDevice = (await sql<{ id: string }>(h, "select id from device_sessions where origin = 'device_code' and token_hash = $1", [sha256(raw['kid device cookie']!)]))[0]!;
    await guest.request('POST', ApiPaths.deviceRevoke(kidDevice.id), {});
    await guest.request('POST', ApiPaths.devicesRevokeAll, {});

    hashes.push(
      { name: 'login token hash', value: sha256(raw['login token']!), home: 'guardian_login_tokens' },
      { name: 'guardian device hash', value: sha256(raw['guardian device cookie']!), home: 'device_sessions' },
      { name: 'kid device hash', value: sha256(raw['kid device cookie']!), home: 'device_sessions' },
      { name: 'guest session hash', value: sha256(raw['guest cookie']!), home: 'guest_sessions' },
      { name: 'device code hash', value: hashHumanCode(keys, raw['device code']!), home: 'device_auth_codes' },
      { name: 'claim code hash', value: hashLegacyClaimCode(keys, raw['claim code']!), home: 'legacy_claim_codes' },
    );
    const pin = (await sql<{ pin_hash: string }>(h, 'select pin_hash from child_profiles where id = $1', [child.id]))[0]!.pin_hash;
    hashes.push({ name: 'PIN hash', value: pin, home: 'child_profiles' }, { name: 'PIN salt', value: pin.split('$')[5]!, home: 'child_profiles' });
    raw['IDENTITY_SECRET'] = h.identity!.config.secret;
    raw['LEGACY_MATCH_PEPPER'] = PEPPER;
  });
  afterAll(async () => {
    await h.close();
  });

  const everySecret = () => [
    ...Object.entries(raw).map(([name, value]) => ({ name, value })),
    ...Object.entries(raw).filter(([n]) => n === 'device code' || n === 'claim code').map(([n, v]) => ({ name: `${n} (normalized)`, value: v.replaceAll('-', '') })),
    ...hashes.map(({ name, value }) => ({ name, value })),
    { name: 'raw PIN (quoted)', value: `"${PIN}"` },
    { name: 'raw wrong PIN (quoted)', value: `"${WRONG_PIN}"` },
  ];

  it('no secret, hash or address appears in any API response body or header', () => {
    const wire = [...log.bodies, ...log.headers].join('\n');
    for (const { name, value } of everySecret()) expect(wire.includes(value), `${name} leaked into a response`).toBe(false);
    expect(wire).not.toContain(legacyEmail);
    expect(wire).not.toContain(legacyEmail.split('@')[0]!);
  });

  it('exposes no field that could carry a credential, and sets only the two known cookies', () => {
    expect([...log.keys].filter((k) => /hash|secret|pepper|salt|token|hmac|prehash/i.test(k))).toEqual([]);
    const names = new Set(log.setCookies.map((c) => c.split('=')[0]));
    expect([...names].sort()).toEqual(['bidazoo_device', 'bidazoo_guest']);
    for (const line of log.setCookies) expect(line).toMatch(/;\s*HttpOnly/i);
  });

  it('writes none of it to the application log either', () => {
    const text = logs.text();
    expect(text.length).toBeGreaterThan(0); // the capture is live
    for (const { name, value } of everySecret()) expect(text.includes(value), `${name} leaked into the log`).toBe(false);
    expect(text).not.toContain(legacyEmail);
    expect(text).not.toContain(guardianEmail);
    expect(text).not.toMatch(/set-cookie|authorization/i);
  });

  it('keeps raw secrets out of every identity table, and each hash only in its own table', async () => {
    for (const [name, value] of Object.entries(raw)) expect(await tablesContaining(h, value), `${name} stored raw`).toEqual([]);
    expect(await tablesContaining(h, raw['device code']!.replaceAll('-', ''))).toEqual([]);
    expect(await tablesContaining(h, raw['claim code']!.replaceAll('-', ''))).toEqual([]);
    for (const { name, value, home } of hashes) expect(await tablesContaining(h, value), `${name} stored outside ${home}`).toEqual([home]);
    for (const quoted of [`"${PIN}"`, `"${WRONG_PIN}"`]) expect(await tablesContaining(h, quoted)).toEqual([]);
  });

  it('keeps the old HopQuest address out of the database entirely, and the active address out of audit and throttles', async () => {
    expect(await tablesContaining(h, legacyEmail)).toEqual([]);
    expect(await tablesContaining(h, legacyEmail.split('@')[0]!)).toEqual([]);
    const where = await tablesContaining(h, guardianEmail);
    expect(where).toContain('guardians');
    expect(where.filter((t) => !['guardians', 'guardian_login_tokens'].includes(t))).toEqual([]);
    // Used links keep no address; no throttle row or audit row holds an address or a client IP.
    expect(await sql(h, 'select 1 from guardian_login_tokens where token_hash = $1 and email is not null', [sha256(raw['login token']!)])).toHaveLength(0);
    for (const ip of ips) expect(await tablesContaining(h, ip), `client address ${ip} stored`).toEqual([]);
    const meta = await sql<{ meta: unknown }>(h, "select meta from audit_events where action like 'legacy.%' or action like 'pin.%'");
    expect(JSON.stringify(meta)).not.toMatch(/@|[0-9a-f]{32}/);
  });
});

// ---------------------------------------------------------------------------------------------
describe.skipIf(!HAS_DB)('unexpected database errors never put parameters in the log', () => {
  it('logs the class of failure only, while a control shows the raw error would have leaked', async () => {
    const secret = `SECRET-PARAM-${rid()}`;
    const logs = captureLogs();
    const h = await makeHarness({ identity: {}, logger: logs.logger });
    try {
      // Control: the raw error really does carry the bound value.
      const rawError = await h.ctx.db.execute(dsql`select ${secret}::int`).catch((e: unknown) => e);
      expect(JSON.stringify(rawError, Object.getOwnPropertyNames(rawError as object)) + String((rawError as Error).message)).toContain(secret);
      const described = JSON.stringify(describeErrorForLog(rawError));
      expect(described).not.toContain(secret);
      expect(described).toContain('databaseError');
      expect(describeErrorForLog(new Error('plain'))).toHaveProperty('err');

      // End to end: a failing transaction behind a real route returns the generic 500 and logs no value.
      const token = randomBytes(32).toString('base64url');
      const res = await withBrokenDb(h, secret, () =>
        deviceBrowser(h).request('POST', ApiPaths.guardianEmailLinkConsume, { token }));
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('internal_error');
      expect(res.raw).not.toContain(secret);
      const text = logs.text();
      expect(text).toContain('unhandled error');
      expect(text).toContain('databaseError');
      expect(text).not.toContain(secret);
      expect(text).not.toContain(token);
      expect(text).not.toContain(sha256(token));
      expect(text).not.toContain('Failed query');
    } finally {
      await h.close();
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe.skipIf(!HAS_DB)('legacy manifest handling (operator CLI)', () => {
  const apiDir = fileURLToPath(new URL('../../apps/api', import.meta.url));
  const cliSource = readFileSync(join(apiDir, 'src/cli/legacy-load.ts'), 'utf8');
  let dir: string;
  let h: Harness;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'bidazoo-manifest-'));
    h = await makeHarness({ identity: { config: { legacyMatchPepper: PEPPER } } });
  });
  afterAll(async () => {
    rmSync(dir, { recursive: true, force: true });
    await h.close();
  });

  const runLoad = (file: string) =>
    spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/legacy-load.ts', '--file', file, '--label', 'cli-test'], {
      cwd: apiDir,
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL as string, LEGACY_MATCH_PEPPER: PEPPER },
      encoding: 'utf8',
      timeout: 60_000,
    });

  it('imports once, prints counts only, keeps the file, and leaves only the keyed value in the database', async () => {
    const email = uniqueEmail('cli');
    const lf = `hq-fam-${rid()}`;
    const file = join(dir, 'manifest.json');
    writeFileSync(file, JSON.stringify({ version: 1, families: [{ legacyFamilyId: lf, guardianEmail: email, kids: [{ legacyKidId: `hq-kid-${rid()}` }, { legacyKidId: `hq-kid-${rid()}` }] }] }), { mode: 0o600 });
    chmodSync(file, 0o600);
    const before = sha256(readFileSync(file, 'utf8'));

    const run = runLoad(file);
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ families: 1, kids: 2, insertedFamilies: 1, insertedKids: 2 });
    for (const text of [run.stdout, run.stderr]) {
      expect(text).not.toContain(email);
      expect(text).not.toContain(email.split('@')[0]!);
      expect(text).not.toContain(PEPPER);
    }
    expect(run.stderr).toContain(MANIFEST_SENSITIVE_NOTICE);
    expect(run.stderr).toContain(MANIFEST_DELETE_REMINDER);
    if (process.platform !== 'win32') expect(run.stderr).not.toMatch(/readable by other users/);

    // Never deleted or changed by the tool.
    expect(existsSync(file)).toBe(true);
    expect(sha256(readFileSync(file, 'utf8'))).toBe(before);

    // The database holds only the keyed match value.
    const row = (await sql<{ email_match_hmac: string }>(h, 'select email_match_hmac from legacy_families where legacy_family_id = $1', [lf]))[0]!;
    expect(row.email_match_hmac).toBe(legacyMatchHmac(PEPPER, email.toLowerCase()));
    expect(await tablesContaining(h, email)).toEqual([]);
    expect(await tablesContaining(h, email.split('@')[0]!)).toEqual([]);
  });

  it('warns when the file is readable by other users (POSIX), and reloading is idempotent', () => {
    if (process.platform === 'win32') return;
    const file = join(dir, 'wide.json');
    writeFileSync(file, JSON.stringify({ version: 1, families: [{ legacyFamilyId: `hq-fam-${rid()}`, guardianEmail: uniqueEmail('wide'), kids: [] }] }));
    chmodSync(file, 0o644);
    const run = runLoad(file);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stderr).toMatch(/readable by other users/);
    const again = runLoad(file);
    expect(again.status).toBe(0);
    expect(JSON.parse(again.stdout)).toMatchObject({ insertedFamilies: 0, unchangedFamilies: 1 });
  });

  it('rejects a bad manifest or bad JSON without echoing any value from it, and writes nothing', async () => {
    const email = uniqueEmail('bad');
    const lf = `hq-fam-${rid()}`;
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ version: 1, families: [{ legacyFamilyId: lf, guardianEmail: email, pin: '1234', kids: [] }] }));
    const rejected = runLoad(bad);
    expect(rejected.status).toBe(1);
    expect(rejected.stdout).toBe('');
    expect(rejected.stderr).toContain('rejected:');
    const broken = join(dir, 'broken.json');
    writeFileSync(broken, `{"families":[{"guardianEmail":"${email}"`);
    const unreadable = runLoad(broken);
    expect(unreadable.status).toBe(2);
    for (const run of [rejected, unreadable]) {
      expect(run.stderr).not.toContain(email);
      expect(run.stderr).not.toContain('1234');
      expect(run.stderr).not.toContain(lf);
    }
    expect(await tablesContaining(h, email)).toEqual([]);
    expect(await sql(h, 'select 1 from legacy_families where legacy_family_id = $1', [lf])).toHaveLength(0);
  });

  it('only warns about permissions it can judge, and never fails the load over it', () => {
    expect(broadReadWarning('x', 'linux', () => ({ mode: 0o100600 }))).toBeNull();
    expect(broadReadWarning('x', 'linux', () => ({ mode: 0o100644 }))).toMatch(/readable by other users/);
    expect(broadReadWarning('x', 'darwin', () => ({ mode: 0o100640 }))).toMatch(/readable by other users/);
    expect(broadReadWarning('x', 'win32', () => ({ mode: 0o100666 }))).toBeNull();
    expect(broadReadWarning('x', 'linux', () => { throw new Error('nope'); })).toBeNull();
  });

  it('has no code path that copies, stores or deletes the manifest', () => {
    expect(cliSource).not.toMatch(/writeFile|copyFile|createWriteStream|appendFile|unlink|rmSync|renameSync|mkdir/);
    expect(cliSource).toMatch(/SENSITIVE TEMPORARY INPUT/);
    expect(cliSource).not.toMatch(/console\.(log|error)\([^)]*(email|guardianEmail)/i);
  });
});
