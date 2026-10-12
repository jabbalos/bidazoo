import { buildApp } from '@bidazoo/api/app';
import type { AppContext, Clock } from '@bidazoo/api/context';
import { createDatabase, type Database } from '@bidazoo/api/db';
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
  close(): Promise<void>;
}

export async function makeHarness(
  options: { cookieSecure?: boolean; allowedOrigins?: string[] } = {},
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
  const app = buildApp({ checks: { database: () => database.ping() }, ctx });
  await app.ready();
  return {
    app,
    database,
    clock,
    ctx,
    close: async () => {
      await app.close();
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

/** A tiny browser stand-in: holds the guest cookie like a cookie jar would. */
export class TestBrowser {
  cookie: string | undefined;
  constructor(
    readonly app: FastifyInstance,
    readonly cookieName = 'bidazoo_guest',
  ) {}

  async request<T = any>(
    method: 'GET' | 'POST',
    url: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...extraHeaders };
    if (this.cookie) headers['cookie'] = `${this.cookieName}=${this.cookie}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await this.app.inject({
      method,
      url,
      headers,
      payload: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers['set-cookie'];
    for (const line of Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []) {
      const match = new RegExp(`^${this.cookieName}=([^;]*)`).exec(line);
      if (match) this.cookie = decodeURIComponent(match[1] ?? '');
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
export async function newPlayer(h: Harness): Promise<TestBrowser> {
  const browser = new TestBrowser(h.app, h.ctx.cookie.name);
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
