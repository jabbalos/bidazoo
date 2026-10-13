import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ApiPaths } from '@bidazoo/contracts';
import { issueLegacyClaimCode, loadLegacyManifest, revokeLegacyClaimCodes, type IdentityLimits } from '@bidazoo/api/identity';
import {
  HAS_DB, TEST_IDENTITY_SECRET, TestBrowser, deviceBrowser, freshAddress, linkTokenFor, makeHarness, signInGuardian, sql, uniqueEmail,
  type Harness,
} from './support/harness';

/**
 * Restart durability. A "restart" here is a brand-new API process (new Fastify app, new runtime,
 * new database pool, nothing in memory) over the same database with the same IDENTITY_SECRET.
 * Every control that must survive one is shown to survive one.
 */

const PEPPER = 'legacy-pepper-0123456789abcdef0123456789abcdef';
const rid = () => randomBytes(5).toString('hex');
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const PIN = '4827';
const window = (max: number) => ({ max, windowSeconds: 3600 });

/** A fresh process. `elapsedMs` replays the app clock so time-based state lines up with the earlier process. */
async function boot(secret: string, limits: Partial<IdentityLimits> = {}, elapsedMs = 0): Promise<Harness> {
  const h = await makeHarness({ identity: { config: { secret, legacyMatchPepper: PEPPER }, limits } });
  h.clock.advance(elapsedMs);
  return h;
}
const browserAt = (h: Harness, ip: string, deviceCookie?: string): TestBrowser => {
  const b = new TestBrowser(h.app, h.ctx.cookie.name, 'bidazoo_device');
  b.remoteAddress = ip;
  b.deviceCookie = deviceCookie;
  return b;
};
const retryAfter = (r: { headers: Record<string, unknown> }) => Number(r.headers['retry-after']);

describe.skipIf(!HAS_DB)('durable throttles survive a restart', () => {
  const secretFor = () => `${TEST_IDENTITY_SECRET}-restart-${rid()}`;

  it('login_ip: per-client sign-in link requests', async () => {
    const secret = secretFor();
    const limits = { loginIp: window(1) };
    const ip = freshAddress();
    const h1 = await boot(secret, limits);
    try {
      expect((await browserAt(h1, ip).request('POST', ApiPaths.guardianEmailLinks, { email: uniqueEmail() })).status).toBe(202);
      expect((await browserAt(h1, ip).request('POST', ApiPaths.guardianEmailLinks, { email: uniqueEmail() })).status).toBe(429);
    } finally {
      await h1.close();
    }
    const h2 = await boot(secret, limits);
    try {
      const blocked = await browserAt(h2, ip).request('POST', ApiPaths.guardianEmailLinks, { email: uniqueEmail() });
      expect(blocked.status).toBe(429);
      expect(retryAfter(blocked)).toBeGreaterThan(0);
      expect((await browserAt(h2, freshAddress()).request('POST', ApiPaths.guardianEmailLinks, { email: uniqueEmail() })).status).toBe(202);
    } finally {
      await h2.close();
    }
  });

  it('login_global: service-wide sign-in link requests', async () => {
    const secret = secretFor();
    const limits = { loginGlobal: window(1) };
    const h1 = await boot(secret, limits);
    try {
      expect((await browserAt(h1, freshAddress()).request('POST', ApiPaths.guardianEmailLinks, { email: uniqueEmail() })).status).toBe(202);
      expect((await browserAt(h1, freshAddress()).request('POST', ApiPaths.guardianEmailLinks, { email: uniqueEmail() })).status).toBe(503);
    } finally {
      await h1.close();
    }
    const h2 = await boot(secret, limits);
    try {
      const blocked = await browserAt(h2, freshAddress()).request('POST', ApiPaths.guardianEmailLinks, { email: uniqueEmail() });
      expect(blocked.status).toBe(503);
      expect(retryAfter(blocked)).toBeGreaterThan(0);
    } finally {
      await h2.close();
    }
  });

  it('login_email: per-address requests stay silent (no mail) across a restart', async () => {
    const secret = secretFor();
    const limits = { loginEmail: window(1) };
    const email = uniqueEmail('mail');
    const h1 = await boot(secret, limits);
    try {
      await browserAt(h1, freshAddress()).request('POST', ApiPaths.guardianEmailLinks, { email });
      await h1.identity!.mail.idle();
      expect(h1.mailer.outbox.filter((m) => m.to === email)).toHaveLength(1);
    } finally {
      await h1.close();
    }
    const h2 = await boot(secret, limits);
    try {
      expect((await browserAt(h2, freshAddress()).request('POST', ApiPaths.guardianEmailLinks, { email })).status).toBe(202);
      await h2.identity!.mail.idle();
      expect(h2.mailer.outbox.filter((m) => m.to === email)).toHaveLength(0);
    } finally {
      await h2.close();
    }
  });

  it('consume_ip: sign-in link redemption attempts', async () => {
    const secret = secretFor();
    const limits = { linkConsumeIp: window(1) };
    const ip = freshAddress();
    const bogus = () => randomBytes(32).toString('base64url');
    const h1 = await boot(secret, limits);
    try {
      expect((await browserAt(h1, ip).request('POST', ApiPaths.guardianEmailLinkConsume, { token: bogus() })).status).toBe(400);
      expect((await browserAt(h1, ip).request('POST', ApiPaths.guardianEmailLinkConsume, { token: bogus() })).status).toBe(429);
    } finally {
      await h1.close();
    }
    const h2 = await boot(secret, limits);
    try {
      expect((await browserAt(h2, ip).request('POST', ApiPaths.guardianEmailLinkConsume, { token: bogus() })).status).toBe(429);
      expect((await browserAt(h2, freshAddress()).request('POST', ApiPaths.guardianEmailLinkConsume, { token: bogus() })).status).toBe(400);
    } finally {
      await h2.close();
    }
  });

  it('device_code_ip and device_code_global: device-code redemption attempts', async () => {
    const secret = secretFor();
    const limits = { deviceCodeIp: window(1), deviceCodeGlobal: window(3) };
    const ip = freshAddress();
    const redeem = (h: Harness, from: string) => browserAt(h, from).request('POST', ApiPaths.deviceCodesRedeem, { code: 'ABCD-EFGH-JKMN' });
    const h1 = await boot(secret, limits);
    try {
      expect((await redeem(h1, ip)).status).toBe(400);
      expect((await redeem(h1, ip)).status).toBe(429); // per client; refused before the global counter, which stays at 1
    } finally {
      await h1.close();
    }
    const h2 = await boot(secret, limits);
    try {
      expect((await redeem(h2, ip)).status).toBe(429);
      expect((await redeem(h2, freshAddress())).status).toBe(400); // another client: global count 2 of 3
      expect((await redeem(h2, freshAddress())).status).toBe(400); // global count 3 of 3: the carried-over 1 still counts
      expect((await redeem(h2, freshAddress())).status).toBe(503); // so the next one, from anywhere, is refused
    } finally {
      await h2.close();
    }
  });

  it('claim_code_ip: legacy claim-code attempts, and a throttled attempt spends no code', async () => {
    const secret = secretFor();
    const limits = { claimCodeIp: window(2) };
    const ip = freshAddress();
    const lf = `hq-fam-${rid()}`;
    const h1 = await boot(secret, limits);
    let code = '';
    let cookie: string | undefined;
    try {
      await loadLegacyManifest(h1.database.db, h1.clock, PEPPER, { version: 1, families: [{ legacyFamilyId: lf, guardianEmail: uniqueEmail('cl'), kids: [] }] });
      code = (await issueLegacyClaimCode(h1.database.db, h1.clock, h1.identity!.keys, { legacyFamilyId: lf, days: 7 })).code;
      const { browser } = await signInGuardian(h1);
      cookie = browser.deviceCookie;
      const attempt = (c: string) => browserAt(h1, ip, cookie).request('POST', ApiPaths.legacyClaimCode, { code: c });
      expect((await attempt('ABCD-EFGH-JKMN')).status).toBe(400);
      expect((await attempt('ABCD-EFGH-JKMP')).status).toBe(400);
      expect((await attempt(code)).status).toBe(429);
    } finally {
      await h1.close();
    }
    const h2 = await boot(secret, limits);
    try {
      expect((await browserAt(h2, ip, cookie).request('POST', ApiPaths.legacyClaimCode, { code })).status).toBe(429);
      expect((await sql(h2, "select 1 from legacy_claim_codes c join legacy_families f on f.id = c.legacy_family_row_id where f.legacy_family_id = $1 and c.used_at is null", [lf]))).toHaveLength(1);
      expect((await browserAt(h2, freshAddress(), cookie).request('POST', ApiPaths.legacyClaimCode, { code })).status).toBe(201);
    } finally {
      await h2.close();
    }
  });

  it('pin_device (supplemental) and the profile PIN lock (authoritative)', async () => {
    const secret = secretFor();
    const limits = { pinDevice: window(3), pinMaxFailures: 2 };
    const h1 = await boot(secret, limits);
    let kidCookie: string | undefined;
    let childId = '';
    let other = '';
    try {
      const { browser: guardian } = await signInGuardian(h1);
      childId = (await guardian.request('POST', ApiPaths.familyChildren, { nickname: 'Mia' })).body.child.id as string;
      other = (await guardian.request('POST', ApiPaths.familyChildren, { nickname: 'Zed' })).body.child.id as string;
      await guardian.request('POST', ApiPaths.familyChildPin(childId), { pin: PIN });
      await guardian.request('POST', ApiPaths.familyChildPin(other), { pin: PIN });
      const code = (await guardian.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
      const kid = deviceBrowser(h1);
      await kid.request('POST', ApiPaths.deviceCodesRedeem, { code });
      kidCookie = kid.deviceCookie;
      const wrong = (id: string) => kid.request('POST', ApiPaths.deviceProfile, { childProfileId: id, pin: '1111' });
      expect((await wrong(childId)).status).toBe(403);
      expect((await wrong(childId)).status).toBe(403); // second failure locks the profile
      expect((await wrong(other)).status).toBe(403); // third device attempt: the device allowance is now spent
      expect((await wrong(other)).status).toBe(429);
    } finally {
      await h1.close();
    }
    const h2 = await boot(secret, limits);
    try {
      const kid = browserAt(h2, freshAddress(), kidCookie);
      // The device allowance survives (429), and the locked profile stays locked even for the right PIN
      // from a device whose allowance is not the problem.
      expect((await kid.request('POST', ApiPaths.deviceProfile, { childProfileId: childId, pin: PIN })).status).toBe(429);
      const row = (await sql<{ pin_failures: number; pin_locked_until: Date | null }>(h2, 'select pin_failures, pin_locked_until from child_profiles where id = $1', [childId]))[0]!;
      expect(row.pin_failures).toBe(2);
      expect(row.pin_locked_until).not.toBeNull();
      // A second device (fresh allowance) still cannot open the locked profile, even with the right PIN.
      const { browser: guardian2 } = await signInGuardian(h2, { email: (await sql<{ email: string }>(h2, 'select g.email from guardians g join child_profiles c on c.family_id = g.family_id where c.id = $1', [childId]))[0]!.email });
      const code = (await guardian2.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
      const second = deviceBrowser(h2);
      await second.request('POST', ApiPaths.deviceCodesRedeem, { code });
      expect((await second.request('POST', ApiPaths.deviceProfile, { childProfileId: childId, pin: PIN })).status).toBe(403);
      expect((await second.request('POST', ApiPaths.deviceProfile, { childProfileId: other, pin: PIN })).status).toBe(200);
    } finally {
      await h2.close();
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe.skipIf(!HAS_DB)('credential and authority state survives a restart', () => {
  it('never revives a used, expired or revoked credential, a revoked device, or expired authority', async () => {
    const secret = `${TEST_IDENTITY_SECRET}-state-${rid()}`;
    const mint = async (h: Harness, email: string) => {
      await browserAt(h, freshAddress()).request('POST', ApiPaths.guardianEmailLinks, { email });
      await h.identity!.mail.idle();
      return linkTokenFor(h, email);
    };
    const manifest = (lf: string, email: string, kids = 1) => loadLegacyManifest(h1.database.db, h1.clock, PEPPER, {
      version: 1, families: [{ legacyFamilyId: lf, guardianEmail: email, kids: Array.from({ length: kids }, () => ({ legacyKidId: `hq-kid-${rid()}` })) }],
    });
    const h1 = await boot(secret);
    const email = uniqueEmail('state');
    const emailB = uniqueEmail('stateb');
    const emailC = uniqueEmail('statec');
    const lfEmail = `hq-fam-${rid()}`;
    const fam = { used: `hq-fam-${rid()}`, revoked: `hq-fam-${rid()}`, open: `hq-fam-${rid()}`, expiring: `hq-fam-${rid()}` };
    let usedLink = '', expiredLink = '', openLink = '', usedCode = '', expiredCode = '', openCode = '';
    let claimUsed = '', claimRevoked = '', claimOpen = '', claimExpiring = '';
    let guardianCookie = '', kidCookie = '';
    let elapsed = 0;
    try {
      const { browser: guardian } = await signInGuardian(h1, { email });
      guardianCookie = guardian.deviceCookie as string;
      // Links: one used, one that will have expired, one still open.
      usedLink = await mint(h1, emailB);
      expect((await browserAt(h1, freshAddress()).request('POST', ApiPaths.guardianEmailLinkConsume, { token: usedLink })).status).toBe(200);
      expiredLink = await mint(h1, emailC);
      // Device codes: one used (and its device then revoked), one that will expire, one open.
      usedCode = (await guardian.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
      expiredCode = (await guardian.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
      const kid = deviceBrowser(h1);
      expect((await kid.request('POST', ApiPaths.deviceCodesRedeem, { code: usedCode })).status).toBe(200);
      kidCookie = kid.deviceCookie as string;
      const kidId = (await sql<{ id: string }>(h1, 'select id from device_sessions where token_hash = $1', [sha256(kidCookie)]))[0]!.id;
      expect((await guardian.request('POST', ApiPaths.deviceRevoke(kidId), {})).status).toBe(200);
      // Legacy: one claimed by email, codes used / revoked / (later) expired / open.
      await manifest(lfEmail, email);
      expect((await guardian.request('POST', ApiPaths.legacyClaim, {})).status).toBe(201);
      for (const lf of Object.values(fam)) await manifest(lf, uniqueEmail('old'));
      claimUsed = (await issueLegacyClaimCode(h1.database.db, h1.clock, h1.identity!.keys, { legacyFamilyId: fam.used, days: 7 })).code;
      claimRevoked = (await issueLegacyClaimCode(h1.database.db, h1.clock, h1.identity!.keys, { legacyFamilyId: fam.revoked, days: 7 })).code;
      claimOpen = (await issueLegacyClaimCode(h1.database.db, h1.clock, h1.identity!.keys, { legacyFamilyId: fam.open, days: 7 })).code;
      claimExpiring = (await issueLegacyClaimCode(h1.database.db, h1.clock, h1.identity!.keys, { legacyFamilyId: fam.expiring, days: 1 })).code;
      await revokeLegacyClaimCodes(h1.database.db, h1.clock, fam.revoked);
      const { browser: claimer } = await signInGuardian(h1);
      expect((await claimer.request('POST', ApiPaths.legacyClaimCode, { code: claimUsed })).status).toBe(201);
      // Time passes: the first links and codes die; then fresh ones are minted.
      h1.clock.advance(16 * 60_000);
      elapsed += 16 * 60_000;
      openLink = await mint(h1, emailC);
      openCode = (await guardian.request('POST', ApiPaths.deviceCodes, {})).body.code as string;
    } finally {
      await h1.close();
    }

    // ---- restart 1: same minutes later ----
    const h2 = await boot(secret, {}, elapsed);
    try {
      const anon = () => browserAt(h2, freshAddress());
      const consume = (token: string) => anon().request('POST', ApiPaths.guardianEmailLinkConsume, { token });
      const redeem = (code: string) => anon().request('POST', ApiPaths.deviceCodesRedeem, { code });
      expect((await consume(usedLink)).status).toBe(400); // used before the restart: still dead
      expect((await consume(expiredLink)).status).toBe(400); // expired: still dead
      expect((await redeem(usedCode)).status).toBe(400);
      expect((await redeem(expiredCode)).status).toBe(400);
      expect((await browserAt(h2, freshAddress(), kidCookie).request('GET', ApiPaths.device)).status).toBe(401); // revoked: still revoked
      const guardian = browserAt(h2, freshAddress(), guardianCookie);
      expect((await guardian.request('GET', ApiPaths.family)).status).toBe(200); // a live device and its authority carry over
      // Legacy state is exactly as left.
      expect((await guardian.request('POST', ApiPaths.legacyClaim, {})).status).toBe(200); // replay by the owner, not a new claim
      const stranger = (await signInGuardian(h2)).browser;
      expect((await stranger.request('POST', ApiPaths.legacyClaim, {})).status).toBe(404);
      expect((await stranger.request('POST', ApiPaths.legacyClaimCode, { code: claimUsed })).status).toBe(400);
      expect((await stranger.request('POST', ApiPaths.legacyClaimCode, { code: claimRevoked })).status).toBe(400);
      // Credentials that were open stay open, exactly once.
      expect((await consume(openLink)).status).toBe(200);
      expect((await consume(openLink)).status).toBe(400);
      expect((await redeem(openCode)).status).toBe(200);
      expect((await redeem(openCode)).status).toBe(400);
      expect((await stranger.request('POST', ApiPaths.legacyClaimCode, { code: claimOpen })).status).toBe(201);
      expect((await stranger.request('POST', ApiPaths.legacyClaimCode, { code: claimOpen })).status).toBe(400);
    } finally {
      await h2.close();
    }

    // ---- restart 2: a day later ----
    const dayMs = 86_400_000 + 60_000;
    const h3 = await boot(secret, {}, elapsed + dayMs);
    try {
      const guardian = browserAt(h3, freshAddress(), guardianCookie);
      expect((await guardian.request('GET', ApiPaths.family)).status).toBe(403); // authority expired, and stays expired
      expect((await guardian.request('GET', ApiPaths.device)).status).toBe(200); // the device itself is still trusted
      expect((await browserAt(h3, freshAddress(), kidCookie).request('GET', ApiPaths.device)).status).toBe(401);
      const fresh = (await signInGuardian(h3)).browser;
      expect((await fresh.request('POST', ApiPaths.legacyClaimCode, { code: claimExpiring })).status).toBe(400); // a day-old one-day code
      expect((await guardian.request('POST', ApiPaths.legacyClaim, {})).status).toBe(403);
      // A new sign-in restores authority; the claim is still the family's.
      const again = await signInGuardian(h3, { email });
      expect((await again.browser.request('POST', ApiPaths.legacyClaim, {})).status).toBe(200);
    } finally {
      await h3.close();
    }
  });
});
