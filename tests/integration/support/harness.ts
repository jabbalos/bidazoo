import { randomBytes } from 'node:crypto';
import { buildApp } from '@bidazoo/api/app';
import type { AppContext, Clock } from '@bidazoo/api/context';
import { createDatabase, type Database } from '@bidazoo/api/db';
import {
  DEFAULT_IDENTITY_LIMITS,
  FakeMailer,
  createIdentityRuntime,
  type IdentityConfig,
  type IdentityLimits,
  type IdentityRuntime,
} from '@bidazoo/api/identity';
import type { RateLimitConfig } from '@bidazoo/api/rate-limit';
import type { FastifyInstance } from 'fastify';

export const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
/** Use with describe.skipIf(!HAS_DB). The global setup prints a loud warning when skipped. */
export const HAS_DB = Boolean(TEST_DATABASE_URL);

export class FakeClock implements Clock {
  private current: number;
  constructor(start = Date.UTC(2026, 9, 11, 12, 0, 0)) {
    this.current = start;
  }
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current += ms;
  }
  advanceDays(days: number): void {
    this.advance(days * 86_400_000);
  }
}

export interface Harness {
  app: FastifyInstance;
  database: Database;
  clock: FakeClock;
  ctx: AppContext;
  /** Present only when the harness was built with `identity`. Captures every email the API sends. */
  mailer: FakeMailer;
  identity: IdentityRuntime | undefined;
  /** Every route the app registered (HEAD twins excluded), for route-registration audits. */
  routes: Array<{ method: string; url: string }>;
  close(): Promise<void>;
}

export const TEST_IDENTITY_SECRET = 'test-identity-secret-0123456789abcdef-0123';
export const TEST_BASE_URL = 'http://localhost:5173';

export async function makeHarness(
  options: {
    cookieSecure?: boolean;
    allowedOrigins?: string[];
    /** Omit for NO limiting (every pre-Checkpoint-D test). Rate-limit tests pass explicit limits. */
    rateLimits?: RateLimitConfig;
    trustProxy?: false | string[];
    hstsMaxAgeSeconds?: number;
    /** Omit for the guest-only build (identity OFF). Pass {} for defaults, or override pieces. */
    identity?: { limits?: Partial<IdentityLimits>; config?: Partial<IdentityConfig> };
    /** A Fastify logger config (tests capture log output through `stream`). Default: logging off. */
    logger?: NonNullable<Parameters<typeof buildApp>[0]['logger']>;
  } = {},
): Promise<Harness> {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
  const database = createDatabase(TEST_DATABASE_URL);
  const clock = new FakeClock();
  const secure = options.cookieSecure ?? false;
  const ctx: AppContext = {
    db: database.db,
    clock,
    cookie: { name: secure ? '__Host-bidazoo_guest' : 'bidazoo_guest', secure, maxAgeSeconds: 90 * 86_400 },
    allowedOrigins: options.allowedOrigins ?? [],
  };
  const mailer = new FakeMailer();
  const identity = options.identity
    ? createIdentityRuntime(
        {
          // A fresh secret per harness gives each its own throttle keys: the database is never emptied
          // and the fake clock is fixed, so shared counters would leak between test files and reruns.
          // Pass config.secret to model one deployment across a restart.
          secret: `${TEST_IDENTITY_SECRET}-${randomBytes(8).toString('hex')}`,
          publicBaseUrl: TEST_BASE_URL,
          mailTransport: 'console',
          mailOutboxDir: undefined,
          mailFrom: undefined,
          emailLinkMinutes: 15,
          deviceSessionDays: 90,
          guardianAuthorityHours: 24,
          deviceCodeMinutes: 10,
          claimCodeDays: 7,
          legacyMatchPepper: undefined,
          ...options.identity.config,
          limits: { ...DEFAULT_IDENTITY_LIMITS, ...options.identity.limits },
        },
        { mailer },
      )
    : undefined;
  if (identity) ctx.identity = identity;
  const app = buildApp({
    checks: { database: () => database.ping() },
    ...(options.logger === undefined ? {} : { logger: options.logger }),
    ctx,
    rateLimits: options.rateLimits,
    trustProxy: options.trustProxy,
    hstsMaxAgeSeconds: options.hstsMaxAgeSeconds,
  });
  const routes: Array<{ method: string; url: string }> = [];
  app.addHook('onRoute', (route) => {
    for (const method of [route.method].flat()) if (method !== 'HEAD') routes.push({ method, url: route.url });
  });
  await app.ready();
  return {
    routes,
    app,
    database,
    clock,
    ctx,
    mailer,
    identity,
    close: async () => {
      await app.close();
      await identity?.mail.idle();
      await database.close();
    },
  };
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  headers: Record<string, string | string[] | number | undefined>;
  raw: string;
}

/**
 * A tiny browser stand-in: a cookie jar holding the guest cookie (`cookie`) and the trusted-device
 * cookie (`deviceCookie`). A Set-Cookie that clears a cookie (empty value or Max-Age=0) removes it,
 * as a real browser would.
 */
export class TestBrowser {
  cookie: string | undefined;
  deviceCookie: string | undefined;
  /** Every raw Set-Cookie line seen, for attribute assertions. */
  readonly setCookieLog: string[] = [];
  /** The socket address the API sees for this browser (default: inject's 127.0.0.1). */
  remoteAddress: string | undefined;
  constructor(
    readonly app: FastifyInstance,
    readonly cookieName = 'bidazoo_guest',
    readonly deviceCookieName = 'bidazoo_device',
  ) {}

  async request<T = any>(
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...extraHeaders };
    const jar: string[] = [];
    if (this.cookie) jar.push(`${this.cookieName}=${this.cookie}`);
    if (this.deviceCookie) jar.push(`${this.deviceCookieName}=${this.deviceCookie}`);
    if (jar.length > 0) headers['cookie'] = jar.join('; ');
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await this.app.inject({
      method,
      url,
      headers,
      remoteAddress: this.remoteAddress,
      payload: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers['set-cookie'];
    for (const line of Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []) {
      this.setCookieLog.push(line);
      const cleared = /;\s*max-age=0\b/i.test(line);
      const guest = new RegExp(`^${this.cookieName}=([^;]*)`).exec(line);
      if (guest) this.cookie = cleared || !guest[1] ? undefined : decodeURIComponent(guest[1]);
      const device = new RegExp(`^${this.deviceCookieName}=([^;]*)`).exec(line);
      if (device) this.deviceCookie = cleared || !device[1] ? undefined : decodeURIComponent(device[1]);
    }
    let parsed: unknown = undefined;
    try {
      parsed = res.body ? JSON.parse(res.body) : undefined;
    } catch {
      parsed = undefined;
    }
    return { status: res.statusCode, body: parsed as T, headers: res.headers, raw: res.body };
  }
}

/** The answer to a multiplication prompt such as "7 × 8". Test-side only; the API never sends it. */
export function productOf(prompt: string): number {
  const match = /^(\d+) × (\d+)$/.exec(prompt);
  if (!match) throw new Error(`unexpected prompt ${prompt}`);
  return Number(match[1]) * Number(match[2]);
}

// ---------------------------------------------------------------------------
// Scenario helpers
// ---------------------------------------------------------------------------

export const PATHS = {
  guest: '/api/v1/guest',
  me: '/api/v1/me',
  sessions: '/api/v1/play-sessions',
  session: (id: string) => `/api/v1/play-sessions/${id}`,
  question: (id: string) => `/api/v1/play-sessions/${id}/question`,
  answers: (id: string) => `/api/v1/play-sessions/${id}/answers`,
};

export const START_BODY = { gameId: 'zoo-sprint', mode: 'multiplication' } as const;

/** A fresh browser with its own guest identity. */
export async function newPlayer(h: Harness, remoteAddress?: string): Promise<TestBrowser> {
  const browser = new TestBrowser(h.app, h.ctx.cookie.name, h.ctx.cookie.secure ? '__Host-bidazoo_device' : 'bidazoo_device');
  browser.remoteAddress = remoteAddress;
  const res = await browser.request('POST', PATHS.guest, {});
  if (res.status !== 200) throw new Error(`guest creation failed: ${res.status} ${res.raw}`);
  return browser;
}

export async function startSession(browser: TestBrowser): Promise<string> {
  const res = await browser.request('POST', PATHS.sessions, START_BODY);
  if (res.status !== 201 && res.status !== 200) throw new Error(`start failed: ${res.status} ${res.raw}`);
  return res.body.session.id as string;
}

export interface IssuedQuestion {
  id: string;
  sequence: number;
  prompt: string;
  type: string;
  choices: number[];
}

export async function issue(browser: TestBrowser, sessionId: string): Promise<IssuedQuestion> {
  const res = await browser.request('POST', PATHS.question(sessionId), {});
  if (res.status !== 200) throw new Error(`issue failed: ${res.status} ${res.raw}`);
  return res.body.question as IssuedQuestion;
}

let attemptCounter = 0;
export function freshAttemptId(): string {
  attemptCounter += 1;
  return `attempt-${Date.now().toString(36)}-${attemptCounter}`;
}

export function answer(
  browser: TestBrowser,
  sessionId: string,
  question: IssuedQuestion,
  response: number,
  attemptId = freshAttemptId(),
): Promise<ApiResponse> {
  return browser.request('POST', PATHS.answers(sessionId), {
    attemptId,
    questionId: question.id,
    response,
  });
}

export function correctChoice(question: IssuedQuestion): number {
  return productOf(question.prompt);
}

export function wrongChoice(question: IssuedQuestion): number {
  const right = productOf(question.prompt);
  const wrong = question.choices.find((choice) => choice !== right);
  if (wrong === undefined) throw new Error('no wrong choice offered');
  return wrong;
}

/** Plays a whole 10-question session. `decide` picks the response for each question. */
export async function playSession(
  browser: TestBrowser,
  options: {
    decide?: (question: IssuedQuestion) => number;
    beforeAnswer?: (question: IssuedQuestion) => void;
  } = {},
): Promise<{ sessionId: string; answers: ApiResponse[]; questions: IssuedQuestion[] }> {
  const sessionId = await startSession(browser);
  const answers: ApiResponse[] = [];
  const questions: IssuedQuestion[] = [];
  for (let i = 0; i < 10; i++) {
    const question = await issue(browser, sessionId);
    questions.push(question);
    options.beforeAnswer?.(question);
    const res = await answer(browser, sessionId, question, (options.decide ?? correctChoice)(question));
    if (res.status !== 200) throw new Error(`answer ${i + 1} failed: ${res.status} ${res.raw}`);
    answers.push(res);
  }
  return { sessionId, answers, questions };
}

export async function sql<T extends Record<string, unknown> = Record<string, any>>(
  h: Harness,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await h.database.pool.query(text, params);
  return res.rows as T[];
}

export async function countRows(h: Harness, table: string, where = 'true', params: unknown[] = []): Promise<number> {
  const rows = await sql<{ n: string }>(h, `select count(*)::text as n from ${table} where ${where}`, params);
  return Number(rows[0]?.n ?? 0);
}

export async function playerIdOf(browser: TestBrowser): Promise<string> {
  const res = await browser.request('GET', PATHS.me);
  return res.body.player.id as string;
}

/** Walks any JSON value and returns every object key found, at any depth. */
export function allKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, into);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      into.add(key);
      allKeys(child, into);
    }
  }
  return into;
}

// ---------------------------------------------------------------------------
// Identity helpers (Checkpoint E)
// ---------------------------------------------------------------------------

let identityCounter = 0;
export function uniqueEmail(tag = 'g'): string {
  identityCounter += 1;
  return `${tag}-${Date.now().toString(36)}-${identityCounter}@example.test`;
}

let addressCounter = 0;
/** A distinct private address per call, so identity tests do not share per-client throttles by accident. */
export function freshAddress(): string {
  addressCounter += 1;
  return `10.${200 + (Math.floor(addressCounter / 65536) % 50)}.${Math.floor(addressCounter / 256) % 256}.${(addressCounter % 254) + 1}`;
}

export function deviceBrowser(h: Harness, remoteAddress?: string): TestBrowser {
  const browser = new TestBrowser(
    h.app,
    h.ctx.cookie.name,
    h.ctx.cookie.secure ? '__Host-bidazoo_device' : 'bidazoo_device',
  );
  browser.remoteAddress = remoteAddress ?? freshAddress();
  return browser;
}

/** The sign-in token in the newest email to `to`. */
export function linkTokenFor(h: Harness, to: string): string {
  // Mail goes to the normalized address, whatever spelling the test used.
  const message = h.mailer.lastTo(to.normalize('NFKC').trim().toLowerCase());
  const match = message ? /#t=([A-Za-z0-9_-]{43})/.exec(message.text) : null;
  if (!match?.[1]) throw new Error(`no sign-in link mailed to ${to}`);
  return match[1];
}

/** Full guardian sign-in on a (new or given) browser: request the link, read the mail, redeem it. */
export async function signInGuardian(
  h: Harness,
  options: { email?: string; browser?: TestBrowser; remoteAddress?: string } = {},
): Promise<{ browser: TestBrowser; email: string }> {
  const email = options.email ?? uniqueEmail();
  const browser = options.browser ?? deviceBrowser(h, options.remoteAddress);
  const req = await browser.request('POST', '/api/v1/guardian/email-links', { email });
  if (req.status !== 202) throw new Error(`link request failed: ${req.status} ${req.raw}`);
  await h.identity?.mail.idle();
  const res = await browser.request('POST', '/api/v1/guardian/email-links/consume', { token: linkTokenFor(h, email) });
  if (res.status !== 200) throw new Error(`link redemption failed: ${res.status} ${res.raw}`);
  return { browser, email };
}
