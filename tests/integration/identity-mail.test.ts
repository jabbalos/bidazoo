import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@bidazoo/api/config';
import {
  MailDeliveryError, MailDispatcher, SmtpMailer, classifyMailError, guardianLoginEmail, loadIdentityConfig,
  type MailFailure, type Mailer, type SmtpSettings, type SmtpTransportLike,
} from '@bidazoo/api/identity';
import { HAS_DB, TEST_BASE_URL, deviceBrowser, freshAddress, makeHarness, uniqueEmail, type Harness } from './support/harness';
import { captureLogs } from './support/identity-security';
import { decodeQuotedPrintable, startFakeSmtp, type FakeSmtp } from './support/fake-smtp';

const SECRET = 'identity-secret-for-mail-tests-0123456789';
const PEPPER = 'legacy-pepper-for-mail-tests-0123456789';
const SMTP_PASSWORD = 'smtp-PASSWORD-hunter2-zz91';
const API_KEY_LIKE = 'key-AKIA-provider-api-key-5513';

const goodSmtp: Record<string, string> = {
  IDENTITY_SECRET: SECRET,
  LEGACY_MATCH_PEPPER: PEPPER,
  PUBLIC_BASE_URL: 'https://play.example.com',
  MAIL_TRANSPORT: 'smtp',
  MAIL_FROM: 'no-reply@notify.example.com',
  MAIL_FROM_NAME: 'BidaZoo',
  MAIL_SMTP_HOST: 'smtp.relay.example.net',
  MAIL_SMTP_PORT: '587',
  MAIL_SMTP_SECURITY: 'starttls',
  MAIL_SMTP_USER: 'relay-user',
  MAIL_SMTP_PASSWORD: SMTP_PASSWORD,
};
const prod = (over: Record<string, string | undefined> = {}) => loadIdentityConfig({ ...goodSmtp, ...over }, 'production');
const settings = (port: number, over: Partial<SmtpSettings> = {}): SmtpSettings => ({
  host: '127.0.0.1', port, security: 'none', user: undefined, password: undefined,
  fromAddress: 'no-reply@notify.example.com', fromName: 'BidaZoo', timeoutSeconds: 5, ...over,
});

// ---------------------------------------------------------------------------------------------
describe('sign-in email content', () => {
  const link = 'https://play.example.com/account.html#t=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdE';
  const mail = guardianLoginEmail({ to: 'p@example.com', link, minutes: 15 });

  it('says a link was requested, is guardian-focused, and tells a stranger to ignore it', () => {
    expect(mail.subject).toBe('Your BidaZoo sign-in link');
    expect(mail.text).toContain('A sign-in link was requested for BidaZoo');
    expect(mail.text).toContain('parents and guardians');
    expect(mail.text).toContain("If you didn't request this, you can ignore this email.");
    expect(mail.text).toContain('expires in 15 minutes');
  });

  it('never calls it a password reset and never implies an account exists', () => {
    for (const body of [mail.text, mail.html as string]) {
      expect(body).not.toMatch(/password|reset|your account|welcome back|verify your/i);
    }
  });

  it('has exactly one link (twice in HTML: button and fallback), a plain-text twin, and no tracking or marketing', () => {
    expect(mail.text.split(link)).toHaveLength(2);
    const html = mail.html as string;
    expect(html).toContain('Sign in to BidaZoo');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).not.toMatch(/<img|<script|<iframe|<link|pixel|unsubscribe|track|utm_|newsletter|sale|discount/i);
    expect(html).toContain('lang="en"');
  });

  it('carries no identifier: the only variable parts are the link and the minutes', () => {
    const other = guardianLoginEmail({ to: 'someone-else@example.com', link, minutes: 15 });
    expect({ ...other, to: '' }).toEqual({ ...mail, to: '' });
    expect(mail.text + (mail.html as string)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
    expect(mail.text).not.toContain('p@example.com');
  });

  it('escapes HTML in the link', () => {
    const evil = guardianLoginEmail({ to: 'p@example.com', link: 'https://x.test/a"><script>alert(1)</script>', minutes: 15 });
    expect(evil.html).not.toContain('<script>');
    expect(evil.html).toContain('&lt;script&gt;');
  });
});

// ---------------------------------------------------------------------------------------------
describe('mail configuration', () => {
  it('production accepts a complete SMTP configuration', () => {
    const c = prod();
    expect(c?.mailTransport).toBe('smtp');
    expect(c?.smtp).toMatchObject({ host: 'smtp.relay.example.net', port: 587, security: 'starttls', fromAddress: 'no-reply@notify.example.com', fromName: 'BidaZoo', timeoutSeconds: 10 });
    expect(c?.mailFrom).toBe('no-reply@notify.example.com');
  });

  it('production never falls back: unset, console, file and none all stop startup', () => {
    expect(() => prod({ MAIL_TRANSPORT: undefined })).toThrow(/MAIL_TRANSPORT=smtp/);
    expect(() => prod({ MAIL_TRANSPORT: 'console' })).toThrow(/refused in production/);
    expect(() => prod({ MAIL_TRANSPORT: 'file', MAIL_OUTBOX_DIR: '/tmp/x' })).toThrow(/refused in production/);
    expect(() => prod({ MAIL_TRANSPORT: 'none' })).toThrow(/no mail transport/);
    expect(() => prod({ MAIL_TRANSPORT: 'sendgrid' })).toThrow(/MAIL_TRANSPORT must be one of/);
  });

  it('missing or malformed SMTP settings are rejected', () => {
    for (const [over, pattern] of [
      [{ MAIL_SMTP_HOST: undefined }, /MAIL_SMTP_HOST is required/],
      [{ MAIL_SMTP_HOST: 'bad host!' }, /MAIL_SMTP_HOST must be a hostname/],
      [{ MAIL_SMTP_PORT: 'abc' }, /MAIL_SMTP_PORT/],
      [{ MAIL_SMTP_PORT: '70000' }, /MAIL_SMTP_PORT/],
      [{ MAIL_SMTP_SECURITY: 'ssl3' }, /MAIL_SMTP_SECURITY must be one of/],
      [{ MAIL_SMTP_SECURITY: 'none' }, /refused in production/],
      [{ MAIL_SMTP_USER: undefined }, /set together/],
      [{ MAIL_SMTP_PASSWORD: undefined }, /set together/],
      [{ MAIL_SMTP_USER: undefined, MAIL_SMTP_PASSWORD: undefined }, /required in production/],
      [{ MAIL_SMTP_TIMEOUT_SECONDS: '0' }, /MAIL_SMTP_TIMEOUT_SECONDS/],
      [{ MAIL_SMTP_TIMEOUT_SECONDS: '600' }, /MAIL_SMTP_TIMEOUT_SECONDS/],
      [{ MAIL_FROM: undefined }, /MAIL_FROM is required/],
      [{ MAIL_FROM: 'BidaZoo <no-reply@notify.example.com>' }, /plain email address/],
      [{ MAIL_FROM: 'no-reply@' }, /plain email address/],
      [{ MAIL_FROM_NAME: 'Bida\r\nBcc: x@y.z' }, /MAIL_FROM_NAME/],
      [{ MAIL_FROM_NAME: '<b>x</b>' }, /MAIL_FROM_NAME/],
    ] as Array<[Record<string, string | undefined>, RegExp]>) {
      expect(() => prod(over), JSON.stringify(Object.keys(over))).toThrow(pattern);
    }
  });

  it('refuses the jonabalos.com sending identity, including subdomains', () => {
    for (const from of ['no-reply@jonabalos.com', 'hello@mail.jonabalos.com', 'NO-REPLY@JONABALOS.COM']) {
      expect(() => prod({ MAIL_FROM: from })).toThrow(/jonabalos\.com sending identity/);
    }
    expect(prod({ MAIL_FROM: 'no-reply@notify.bidazoo.com' })?.smtp?.fromAddress).toBe('no-reply@notify.bidazoo.com');
  });

  it('credentials never travel without TLS, and development may use a local catcher', () => {
    expect(() => loadIdentityConfig({ ...goodSmtp, MAIL_SMTP_SECURITY: 'none' }, 'development')).toThrow(/never sent over a connection without TLS/);
    const dev = loadIdentityConfig({ ...goodSmtp, MAIL_SMTP_SECURITY: 'none', MAIL_SMTP_USER: undefined, MAIL_SMTP_PASSWORD: undefined, MAIL_SMTP_HOST: 'localhost', MAIL_SMTP_PORT: '1025', PUBLIC_BASE_URL: 'http://localhost:5173' }, 'development');
    expect(dev?.smtp).toMatchObject({ security: 'none', port: 1025, user: undefined });
    // tls defaults to 465, starttls to 587.
    expect(prod({ MAIL_SMTP_SECURITY: 'tls', MAIL_SMTP_PORT: undefined })?.smtp?.port).toBe(465);
    expect(prod({ MAIL_SMTP_PORT: undefined })?.smtp?.port).toBe(587);
  });

  it('the public origin must be a clean https hostname in production', () => {
    for (const [value, pattern] of [
      ['http://play.example.com', /https/],
      ['https://user:pw@play.example.com', /credentials/],
      ['https://play.example.com/', /origin only/],
      ['https://play.example.com/app', /origin only/],
      ['https://play.example.com?x=1', /origin only/],
      ['https://localhost', /public https hostname/],
      ['https://app.localhost', /public https hostname/],
      ['https://127.0.0.1', /public https hostname/],
      ['https://10.0.0.5', /public https hostname/],
      ['https://[::1]', /public https hostname/],
      ['https://intranet', /public https hostname/],
      ['', /PUBLIC_BASE_URL is required/],
      ['not a url', /origin like/],
    ] as Array<[string, RegExp]>) {
      expect(() => prod({ PUBLIC_BASE_URL: value }), value).toThrow(pattern);
    }
    expect(prod({ PUBLIC_BASE_URL: 'https://play.bidazoo.com' })?.publicBaseUrl).toBe('https://play.bidazoo.com');
  });

  it('identity disabled needs no mail configuration at all, and ignores stray mail variables', () => {
    expect(loadIdentityConfig({}, 'production')).toBeUndefined();
    expect(loadIdentityConfig({ MAIL_TRANSPORT: 'smtp', MAIL_SMTP_PASSWORD: 'x' }, 'production')).toBeUndefined();
    expect(loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@h/db' }).identity).toBeUndefined();
  });

  it('is validated at startup: loadConfig stops before serving a single request', () => {
    const env = { NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@h/db', ...goodSmtp };
    expect(loadConfig(env).identity?.mailTransport).toBe('smtp');
    expect(() => loadConfig({ ...env, MAIL_SMTP_HOST: undefined })).toThrow(/MAIL_SMTP_HOST/);
    expect(() => loadConfig({ ...env, MAIL_TRANSPORT: 'console' })).toThrow(/refused in production/);
  });

  it('configuration errors never echo a secret value', () => {
    const bad: Array<Record<string, string | undefined>> = [
      { MAIL_SMTP_HOST: 'bad host!' }, { MAIL_SMTP_SECURITY: 'none' }, { MAIL_FROM: undefined }, { MAIL_SMTP_PORT: 'zz' },
      { MAIL_SMTP_USER: 'u\r\nx' }, { MAIL_TRANSPORT: 'console' }, { PUBLIC_BASE_URL: 'https://user:pw@play.example.com' },
      { IDENTITY_SECRET: 'short' }, { LEGACY_MATCH_PEPPER: 'short' },
    ];
    for (const over of bad) {
      try {
        prod(over);
      } catch (err) {
        const text = String((err as Error).message);
        for (const secret of [SMTP_PASSWORD, SECRET, PEPPER, 'relay-user', 'pw@']) expect(text).not.toContain(secret);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('SMTP adapter with a fake transport', () => {
  const message = { to: 'parent@example.com', subject: 'S', text: 'T https://play.example.com/account.html#t=TOKENTOKEN', html: '<p>H</p>' };

  it('hands the library a safe, complete message and asks it to ignore files and URLs', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const transport: SmtpTransportLike = { sendMail: async (o) => { calls.push(o); return {}; }, close: () => undefined };
    await new SmtpMailer(settings(1), { transport }).send(message);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      from: { name: 'BidaZoo', address: 'no-reply@notify.example.com' }, to: 'parent@example.com', subject: 'S',
      text: message.text, html: '<p>H</p>', disableFileAccess: true, disableUrlAccess: true,
    });
    expect(calls[0]?.['headers']).toEqual({ 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' });
  });

  it.each([
    [{ code: 'ECONNECTION' }, 'connection', undefined],
    [{ code: 'ECONNREFUSED' }, 'connection', undefined],
    [{ code: 'ENOTFOUND' }, 'connection', undefined],
    [{ code: 'ESOCKET' }, 'connection', undefined],
    [{ code: 'EAUTH', responseCode: 535 }, 'auth', '5xx'],
    [{ responseCode: 534 }, 'auth', '5xx'],
    [{ code: 'ETIMEDOUT' }, 'timeout', undefined],
    [{ code: 'ETLS' }, 'tls', undefined],
    [{ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }, 'tls', undefined],
    [{ code: 'EENVELOPE', responseCode: 550 }, 'rejected', '5xx'],
    [{ code: 'EMESSAGE', responseCode: 554 }, 'rejected', '5xx'],
    [{ code: 'EMESSAGE', responseCode: 451 }, 'rejected', '4xx'],
    [{ responseCode: 421 }, 'temporary', '4xx'],
    [{}, 'unknown', undefined],
    [new Error('anything'), 'unknown', undefined],
    [null, 'unknown', undefined],
  ] as Array<[unknown, string, string | undefined]>)('classifies %j as %s', (err, category, statusClass) => {
    const out = classifyMailError(err);
    expect(out.category).toBe(category);
    expect(out.statusClass).toBe(statusClass);
  });

  it('turns every provider error into a bare category: nothing sensitive survives in message, stack, fields or cause', async () => {
    const hostile = Object.assign(new Error(`535 5.7.8 bad credentials user=relay-user pass=${SMTP_PASSWORD} key=${API_KEY_LIKE} to=parent@example.com Authorization: Bearer ${API_KEY_LIKE} body=${message.text}`), {
      code: 'EAUTH', responseCode: 535, response: `535 ${SMTP_PASSWORD}`, command: `AUTH PLAIN ${API_KEY_LIKE}`,
      cause: new Error(SMTP_PASSWORD),
    });
    const transport: SmtpTransportLike = { sendMail: async () => { throw hostile; }, close: () => undefined };
    const err = await new SmtpMailer(settings(1), { transport }).send(message).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailDeliveryError);
    const e = err as MailDeliveryError;
    expect([e.category, e.statusClass]).toEqual(['auth', '5xx']);
    const everything = [e.message, e.stack, JSON.stringify(e), String((e as { cause?: unknown }).cause), Object.keys(e).join(',')].join('|');
    for (const secret of [SMTP_PASSWORD, API_KEY_LIKE, 'relay-user', 'parent@example.com', 'TOKENTOKEN', 'Bearer']) expect(everything).not.toContain(secret);
  });

  it('gives up at the deadline (one attempt, connection closed) when the transport hangs', async () => {
    let calls = 0;
    let closed = 0;
    const transport: SmtpTransportLike = { sendMail: () => { calls += 1; return new Promise(() => undefined); }, close: () => { closed += 1; } };
    const started = Date.now();
    const err = await new SmtpMailer(settings(1, { timeoutSeconds: 1 }), { transport }).send(message).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'MailDeliveryError', category: 'timeout' });
    expect(Date.now() - started).toBeLessThan(3000);
    expect([calls, closed]).toEqual([1, 1]);
  });

  it('does not retry on failure', async () => {
    let calls = 0;
    const transport: SmtpTransportLike = { sendMail: async () => { calls += 1; throw Object.assign(new Error('x'), { code: 'ECONNECTION' }); }, close: () => undefined };
    await new SmtpMailer(settings(1), { transport }).send(message).catch(() => undefined);
    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('SMTP adapter against a local fake server (no internet)', () => {
  let server: FakeSmtp | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });
  const message = { to: 'parent@example.com', subject: 'Your BidaZoo sign-in link', text: 'Open https://play.example.com/account.html#t=TOKENTOKENTOKENTOKENTOKENTOKENTOKENTOKEN123 now', html: '<p>hi</p>' };

  it('delivers a multipart message from the configured sender with the right headers', async () => {
    server = await startFakeSmtp('accept');
    await new SmtpMailer(settings(server.port, { user: undefined })).send(message);
    expect(server.messages()).toHaveLength(1);
    const wire = server.messages()[0] as string;
    expect(wire).toMatch(/^From: "?BidaZoo"? <no-reply@notify\.example\.com>/im);
    expect(wire).toMatch(/^To: parent@example\.com/im);
    expect(wire).toMatch(/^Subject: Your BidaZoo sign-in link/im);
    expect(wire).toMatch(/^Auto-Submitted: auto-generated/im);
    expect(wire).toMatch(/multipart\/alternative/i);
    expect(wire).toMatch(/text\/plain/i);
    expect(wire).toMatch(/text\/html/i);
    expect(decodeQuotedPrintable(wire)).toContain('#t=TOKENTOKENTOKENTOKENTOKENTOKENTOKENTOKEN123');
    expect(wire).not.toMatch(/<img|X-Tracking|List-Unsubscribe/i);
  });

  it('connection refused fails as "connection" quickly, with nothing leaked', async () => {
    const closed = await startFakeSmtp('accept');
    const port = closed.port;
    await closed.close();
    const err = await new SmtpMailer(settings(port)).send(message).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'MailDeliveryError', category: 'connection' });
    expect(JSON.stringify(err) + String((err as Error).stack)).not.toContain('127.0.0.1');
  });

  it('an authentication failure is "auth", and the server\'s reply text never escapes', async () => {
    server = await startFakeSmtp('auth-fail', 'REPLY-SECRET-4410');
    const err = await new SmtpMailer(settings(server.port, { user: 'relay-user', password: SMTP_PASSWORD })).send(message).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'MailDeliveryError', category: 'auth', statusClass: '5xx' });
    const text = [(err as Error).message, (err as Error).stack, JSON.stringify(err)].join('|');
    for (const secret of ['REPLY-SECRET-4410', SMTP_PASSWORD, 'relay-user']) expect(text).not.toContain(secret);
    expect(server.messages()).toHaveLength(0);
  });

  it('a provider refusal after DATA is "rejected" with a status class only', async () => {
    server = await startFakeSmtp('data-reject', 'REFUSAL-SECRET-8821');
    const err = await new SmtpMailer(settings(server.port)).send(message).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'MailDeliveryError', category: 'rejected', statusClass: '5xx' });
    expect([(err as Error).message, (err as Error).stack].join('|')).not.toContain('REFUSAL-SECRET-8821');
  });

  it('a provider that never answers is cut off at the deadline as "timeout"', async () => {
    server = await startFakeSmtp('silent');
    const started = Date.now();
    const err = await new SmtpMailer(settings(server.port, { timeoutSeconds: 1 })).send(message).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'MailDeliveryError', category: 'timeout' });
    expect(Date.now() - started).toBeLessThan(4000);
    expect(server.connections()).toBe(1); // one attempt, no retry
  });

  it('STARTTLS required but not offered: the send fails closed and the credentials are never transmitted', async () => {
    server = await startFakeSmtp('accept');
    const err = await new SmtpMailer(settings(server.port, { security: 'starttls', user: 'relay-user', password: SMTP_PASSWORD })).send(message).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailDeliveryError);
    expect((err as MailDeliveryError).category).not.toBe('unknown');
    const sent = server.raw();
    expect(sent).not.toContain(SMTP_PASSWORD);
    expect(sent).not.toContain(Buffer.from(`\0relay-user\0${SMTP_PASSWORD}`).toString('base64'));
    expect(sent).not.toMatch(/^AUTH /im);
    expect(server.messages()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('dispatcher', () => {
  it('reports one safe failure per failed send, never throws into the caller, and never retries', async () => {
    let sends = 0;
    const failing: Mailer = { name: 'smtp', send: async () => { sends += 1; throw new MailDeliveryError('connection'); } };
    const seen: MailFailure[] = [];
    const d = new MailDispatcher(failing, (f) => { seen.push(f); throw new Error('a broken logger'); });
    d.enqueue({ to: 'a@example.com', subject: 's', text: 't' });
    await d.idle();
    expect(sends).toBe(1);
    expect(seen).toEqual([{ operation: 'guardian_login_link', transport: 'smtp', category: 'connection' }]);
  });

  it('an unexpected error becomes category "unknown" with no detail at all', async () => {
    const seen: MailFailure[] = [];
    const d = new MailDispatcher({ name: 'x', send: async () => { throw new Error(`boom ${SMTP_PASSWORD} a@example.com`); } }, (f) => seen.push(f));
    d.enqueue({ to: 'a@example.com', subject: 's', text: 't' });
    await d.idle();
    expect(seen).toEqual([{ operation: 'guardian_login_link', transport: 'x', category: 'unknown' }]);
    expect(JSON.stringify(seen)).not.toContain(SMTP_PASSWORD);
  });

  it('caps messages in flight, so a stuck provider cannot pile up work', async () => {
    const release: Array<() => void> = [];
    const hanging: Mailer = { name: 'smtp', send: () => new Promise<void>((resolve) => release.push(resolve)) };
    const seen: MailFailure[] = [];
    const d = new MailDispatcher(hanging, (f) => seen.push(f));
    for (let i = 0; i < 55; i += 1) d.enqueue({ to: 'a@example.com', subject: 's', text: 't' });
    expect(release).toHaveLength(50);
    expect(seen).toHaveLength(5);
    expect(seen.every((f) => f.category === 'overloaded')).toBe(true);
    release.forEach((r) => r());
    await d.idle();
  });
});

// ---------------------------------------------------------------------------------------------
describe.skipIf(!HAS_DB)('guardian sign-in through the API with real SMTP delivery', () => {
  let ok: FakeSmtp;
  let bad: FakeSmtp;
  let hOk: Harness;
  let hBad: Harness;
  let hAuth: Harness;
  let authServer: FakeSmtp;
  const logsBad = captureLogs();
  const logsAuth = captureLogs();

  beforeAll(async () => {
    ok = await startFakeSmtp('accept');
    bad = await startFakeSmtp('data-reject', 'PROVIDER-REPLY-SECRET-3390');
    authServer = await startFakeSmtp('auth-fail', 'AUTH-REPLY-SECRET-6612');
    hOk = await makeHarness({ identity: {}, identityMailer: new SmtpMailer(settings(ok.port)) });
    hBad = await makeHarness({ identity: {}, logger: logsBad.logger, identityMailer: new SmtpMailer(settings(bad.port)) });
    hAuth = await makeHarness({ identity: {}, logger: logsAuth.logger, identityMailer: new SmtpMailer(settings(authServer.port, { user: 'relay-user', password: SMTP_PASSWORD })) });
  });
  afterAll(async () => {
    await Promise.all([hOk?.close(), hBad?.close(), hAuth?.close()]);
    await Promise.all([ok?.close(), bad?.close(), authServer?.close()]);
  });

  const requestLink = (h: Harness, email: string, headers: Record<string, string> = {}) =>
    deviceBrowser(h, freshAddress()).request('POST', '/api/v1/guardian/email-links', { email }, headers);
  const tokenFrom = (wire: string) => /#t=([A-Za-z0-9_-]{43})/.exec(decodeQuotedPrintable(wire))?.[1] as string;

  it('delivers the sign-in link that really redeems', async () => {
    const email = uniqueEmail();
    expect((await requestLink(hOk, email)).status).toBe(202);
    await hOk.identity?.mail.idle();
    const wire = ok.messages().at(-1) as string;
    expect(decodeQuotedPrintable(wire)).toContain(`${TEST_BASE_URL}/account.html#t=`);
    const redeem = await deviceBrowser(hOk, freshAddress()).request('POST', '/api/v1/guardian/email-links/consume', { token: tokenFrom(wire) });
    expect(redeem.status).toBe(200);
  });

  it('builds the link from the configured origin only, whatever Host or forwarding headers say', async () => {
    const email = uniqueEmail();
    await requestLink(hOk, email, { host: 'evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https', forwarded: 'host=evil.example' });
    await hOk.identity?.mail.idle();
    const body = decodeQuotedPrintable(ok.messages().at(-1) as string);
    expect(body).toContain(`${TEST_BASE_URL}/account.html#t=`);
    expect(body).not.toMatch(/evil\.example/);
  });

  it('answers identically whether delivery works or fails: no enumeration, no provider detail', async () => {
    const strip = (r: Awaited<ReturnType<typeof requestLink>>) => ({ status: r.status, body: r.raw, setCookie: r.headers['set-cookie'], type: r.headers['content-type'] });
    const a = strip(await requestLink(hOk, uniqueEmail()));
    const b = strip(await requestLink(hBad, uniqueEmail()));
    const c = strip(await requestLink(hAuth, uniqueEmail()));
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(a).toMatchObject({ status: 202, body: '{"accepted":true}' });
    await Promise.all([hBad.identity?.mail.idle(), hAuth.identity?.mail.idle()]);
  });

  it('logs a failure as safe structured fields only, and nothing sensitive reaches the log', async () => {
    const email = uniqueEmail();
    await requestLink(hBad, email);
    await hBad.identity?.mail.idle();
    await requestLink(hAuth, uniqueEmail());
    await hAuth.identity?.mail.idle();

    expect(hBad.mailFailures.at(-1)).toEqual({ operation: 'guardian_login_link', transport: 'smtp', category: 'rejected', statusClass: '5xx' });
    expect(hAuth.mailFailures.at(-1)).toEqual({ operation: 'guardian_login_link', transport: 'smtp', category: 'auth', statusClass: '5xx' });

    const token = tokenFrom(bad.messages().at(-1) as string); // the secret the provider saw
    expect(token).toHaveLength(43);
    const link = `${TEST_BASE_URL}/account.html#t=${token}`;
    for (const logs of [logsBad.text(), logsAuth.text()]) {
      expect(logs).toContain('mail send failed');
      for (const secret of [
        token, link, `#t=`, email, SMTP_PASSWORD, 'relay-user', 'PROVIDER-REPLY-SECRET-3390', 'AUTH-REPLY-SECRET-6612',
        hBad.identity?.config.secret as string, hAuth.identity?.config.secret as string, PEPPER, API_KEY_LIKE, 'Authorization', 'set-cookie=',
      ]) expect(logs).not.toContain(secret);
    }
  });

  it('a failed delivery stores nothing extra: no message body or second email copy in the database', async () => {
    const email = uniqueEmail();
    await requestLink(hBad, email);
    await hBad.identity?.mail.idle();
    const { sql } = await import('./support/harness');
    const tables = await sql(hBad, "select table_name from information_schema.columns where column_name in ('body','html','subject','message') and table_schema = 'public'");
    expect(tables).toEqual([]);
    // The pending address lives only on the single-use login token row, as before.
    const rows = await sql(hBad, 'select count(*)::int as n from guardian_login_tokens where email = $1', [email]);
    expect(rows[0]?.n).toBe(1);
  });
});
