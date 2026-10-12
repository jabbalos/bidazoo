import { DEFAULT_RATE_LIMITS, type RateLimitConfig } from '@bidazoo/api/rate-limit';
import { afterEach, describe, expect, it } from 'vitest';
import {
  HAS_DB,
  PATHS,
  START_BODY,
  TestBrowser,
  answer,
  correctChoice,
  countRows,
  issue,
  makeHarness,
  newPlayer,
  playSession,
  playerIdOf,
  startSession,
  type Harness,
} from './support/harness';
import { expectSecurityHeaders } from './support/security';

const BIG = { max: 100_000, windowSeconds: 60 };
/** Every rule effectively off, so a test exercises exactly the rule it names. */
const limits = (overrides: Partial<RateLimitConfig> = {}): RateLimitConfig => ({
  enabled: true,
  guestCreateBurst: BIG,
  guestCreateHourly: { ...BIG, windowSeconds: 3600 },
  globalGuestCreate: { max: 0, windowSeconds: 3600 },
  sessionStart: BIG,
  answer: BIG,
  apiPerIp: BIG,
  cacheSize: 1000,
  ...overrides,
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe.skipIf(!HAS_DB)('rate limiting and abuse protection (Checkpoint D)', () => {
  const open: Harness[] = [];
  const harness = async (options: Parameters<typeof makeHarness>[0]) => {
    const h = await makeHarness(options);
    open.push(h);
    return h;
  };
  afterEach(async () => {
    await Promise.all(open.splice(0).map((h) => h.close()));
  });

  /** One new browser asks for a guest identity from `ip`. */
  const arrive = async (h: Harness, ip?: string, headers: Record<string, string> = {}) => {
    const browser = new TestBrowser(h.app, h.ctx.cookie.name);
    browser.remoteAddress = ip;
    const res = await browser.request('POST', PATHS.guest, {}, headers);
    return { browser, res };
  };
  const playersCount = (h: Harness) => countRows(h, 'players');
  // The shared test database is never emptied, so assertions use differences, not totals.

  const expectRateLimited = (res: { status: number; body: any; headers: Record<string, unknown> }, maxRetry: number) => {
    expect(res.status).toBe(429);
    // The stable contract: the same error envelope as every other failure.
    expect(res.body).toEqual({ error: { code: 'rate_limited', message: 'Too many requests. Please wait a moment and try again.' } });
    const retry = Number(res.headers['retry-after']);
    expect(Number.isInteger(retry)).toBe(true);
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(maxRetry);
    expectSecurityHeaders(res.headers, '429');
  };

  describe('guest creation, per IP', () => {
    it('allows up to the limit, then answers 429 with Retry-After and creates nothing', async () => {
      const h = await harness({ rateLimits: limits({ guestCreateBurst: { max: 3, windowSeconds: 60 } }) });
      const baseline = await playersCount(h);
      for (let i = 0; i < 3; i++) expect((await arrive(h)).res.status).toBe(200);
      const before = { players: await playersCount(h), sessions: await countRows(h, 'guest_sessions') };
      expect(before.players).toBe(baseline + 3);

      const blocked = await arrive(h);
      expectRateLimited(blocked.res, 60);
      expect(blocked.res.headers['set-cookie']).toBeUndefined(); // no identity issued
      expect(blocked.res.raw).not.toMatch(/player|nickname/i);
      // Zero application-state mutation.
      expect(await playersCount(h)).toBe(before.players);
      expect(await countRows(h, 'guest_sessions')).toBe(before.sessions);
    });

    it('never counts a refresh by an existing guest, however often they refresh', async () => {
      const h = await harness({ rateLimits: limits({ guestCreateBurst: { max: 2, windowSeconds: 60 } }) });
      const first = await arrive(h);
      expect(first.res.status).toBe(200);
      for (let i = 0; i < 25; i++) {
        const refresh = await first.browser.request('POST', PATHS.guest, {});
        expect(refresh.status).toBe(200);
        expect(refresh.body.player.id).toBe(first.res.body.player.id);
      }
      expect((await arrive(h)).res.status).toBe(200); // second creation: still within the limit of 2
      expect((await arrive(h)).res.status).toBe(429); // third is over
    });

    it('resets after the window', async () => {
      const h = await harness({ rateLimits: limits({ guestCreateBurst: { max: 1, windowSeconds: 1 } }) });
      const baseline = await playersCount(h);
      expect((await arrive(h)).res.status).toBe(200);
      expectRateLimited((await arrive(h)).res, 1);
      await sleep(1_150);
      expect((await arrive(h)).res.status).toBe(200);
      expect(await playersCount(h)).toBe(baseline + 2);
    });

    it('also enforces the hourly tier', async () => {
      const h = await harness({ rateLimits: limits({ guestCreateHourly: { max: 2, windowSeconds: 3600 } }) });
      expect((await arrive(h)).res.status).toBe(200);
      expect((await arrive(h)).res.status).toBe(200);
      expectRateLimited((await arrive(h)).res, 3600);
    });

    it('is per IP: one noisy address does not block another', async () => {
      const h = await harness({ rateLimits: limits({ guestCreateBurst: { max: 2, windowSeconds: 60 } }) });
      for (let i = 0; i < 2; i++) expect((await arrive(h, '198.51.100.10')).res.status).toBe(200);
      expect((await arrive(h, '198.51.100.10')).res.status).toBe(429);
      expect((await arrive(h, '198.51.100.11')).res.status).toBe(200);
    });
  });

  describe('service-wide emergency ceiling', () => {
    it('opens a 503 breaker for NEW guests only, and one address cannot consume it alone', async () => {
      const h = await harness({
        rateLimits: limits({
          guestCreateBurst: { max: 2, windowSeconds: 60 },
          globalGuestCreate: { max: 3, windowSeconds: 3600 },
        }),
      });
      // One attacker address hammers: only its 2 admitted creations count toward the ceiling.
      const attacker = '203.0.113.66';
      const results = [];
      for (let i = 0; i < 8; i++) results.push((await arrive(h, attacker)).res.status);
      expect(results.filter((s) => s === 200)).toHaveLength(2);
      expect(results.filter((s) => s === 429)).toHaveLength(6);

      // A legitimate user elsewhere still gets in (ceiling used: 2 of 3).
      const legit = await arrive(h, '198.51.100.20');
      expect(legit.res.status).toBe(200);

      // Now the ceiling is full: the next brand-new guest from a fresh address gets the breaker.
      const players = await playersCount(h);
      const paused = await arrive(h, '198.51.100.21');
      expect(paused.res.status).toBe(503);
      expect(paused.res.body).toEqual({
        error: { code: 'service_busy', message: 'BidaZoo is busy right now. Please try again in a little while.' },
      });
      const retry = Number(paused.res.headers['retry-after']);
      expect(retry).toBeGreaterThanOrEqual(1);
      expect(retry).toBeLessThanOrEqual(3600);
      expectSecurityHeaders(paused.res.headers, '503');
      expect(await playersCount(h)).toBe(players);

      // Existing guests are completely unaffected: refresh, profile, and play all still work.
      const refresh = await legit.browser.request('POST', PATHS.guest, {});
      expect(refresh.status).toBe(200);
      expect(refresh.body.player.id).toBe(legit.res.body.player.id);
      expect((await legit.browser.request('GET', PATHS.me)).status).toBe(200);
      expect(await startSession(legit.browser)).toBeTruthy();
    });

    it('is disabled by setting the maximum to 0', async () => {
      const h = await harness({ rateLimits: limits({ globalGuestCreate: { max: 0, windowSeconds: 3600 } }) });
      for (let i = 0; i < 12; i++) expect((await arrive(h, `198.51.100.${i + 1}`)).res.status).toBe(200);
    });
  });

  describe('play sessions and answers, per guest', () => {
    it('limits session starts per guest, isolates guests, and creates no session when throttled', async () => {
      const h = await harness({ rateLimits: limits({ sessionStart: { max: 2, windowSeconds: 60 } }) });
      const a = await newPlayer(h);
      await playSession(a); // start #1 (and a full game)
      await playSession(a); // start #2 (a second, new session)
      const sessionsBefore = await countRows(h, 'play_sessions');
      const aId = await playerIdOf(a);
      expect(await countRows(h, 'play_sessions', 'player_id = $1', [aId])).toBe(2);

      const throttled = await a.request('POST', PATHS.sessions, START_BODY);
      expectRateLimited(throttled, 60);
      expect(await countRows(h, 'play_sessions')).toBe(sessionsBefore); // nothing created anywhere
      expect(await countRows(h, 'play_sessions', 'player_id = $1', [aId])).toBe(2); // no third session

      // Another guest, even from the same IP, is untouched.
      const b = await newPlayer(h);
      expect((await b.request('POST', PATHS.sessions, START_BODY)).status).toBe(201);
    });

    it('limits answers per guest; a throttled answer changes nothing and can be retried safely later', async () => {
      const h = await harness({ rateLimits: limits({ answer: { max: 1, windowSeconds: 1 } }) });
      const player = await newPlayer(h);
      const sessionId = await startSession(player);

      const q1 = await issue(player, sessionId);
      const first = await answer(player, sessionId, q1, correctChoice(q1), 'attempt-one');
      expect(first.status).toBe(200);
      const totalsAfterFirst = (await player.request('GET', PATHS.me)).body.totals;
      const attemptsAfterFirst = await countRows(h, 'attempts');
      const ledgerAfterFirst = {
        xp: await countRows(h, 'xp_events'),
        coins: await countRows(h, 'wallet_transactions'),
      };

      const q2 = await issue(player, sessionId);
      const throttled = await answer(player, sessionId, q2, correctChoice(q2), 'attempt-two');
      expectRateLimited(throttled, 1);
      // Nothing moved: no attempt, no reward, no XP/coins, and q2 is still open.
      expect(await countRows(h, 'attempts')).toBe(attemptsAfterFirst);
      expect(await countRows(h, 'xp_events')).toBe(ledgerAfterFirst.xp);
      expect(await countRows(h, 'wallet_transactions')).toBe(ledgerAfterFirst.coins);
      expect((await player.request('GET', PATHS.me)).body.totals).toEqual(totalsAfterFirst);
      expect(await countRows(h, 'served_questions', 'id = $1 and answered_at is null', [q2.id])).toBe(1);

      // After the window, the SAME attempt id goes through exactly once.
      await sleep(1_150);
      const retried = await answer(player, sessionId, q2, correctChoice(q2), 'attempt-two');
      expect(retried.status).toBe(200);
      expect(retried.body.correct).toBe(true);
      expect(await countRows(h, 'attempts')).toBe(attemptsAfterFirst + 1);
    });

    it('keeps idempotent answer retries correct (same attempt id twice = one award)', async () => {
      const h = await harness({ rateLimits: limits({ answer: { max: 5, windowSeconds: 60 } }) });
      const player = await newPlayer(h);
      const sessionId = await startSession(player);
      const q = await issue(player, sessionId);
      const one = await answer(player, sessionId, q, correctChoice(q), 'attempt-dup');
      const two = await answer(player, sessionId, q, correctChoice(q), 'attempt-dup');
      expect(one.status).toBe(200);
      expect(two.status).toBe(200);
      expect(two.body.rewards).toEqual(one.body.rewards);
      expect(two.body.totals).toEqual(one.body.totals);
      expect(await countRows(h, 'attempts', 'served_question_id = $1', [q.id])).toBe(1);
      expect(await countRows(h, 'xp_events', "source_type = 'attempt' and player_id = $1", [await playerIdOf(player)])).toBe(1);
    });

    it('answer limits are isolated between guests', async () => {
      const h = await harness({ rateLimits: limits({ answer: { max: 1, windowSeconds: 60 } }) });
      const a = await newPlayer(h);
      const b = await newPlayer(h);
      const sa = await startSession(a);
      const sb = await startSession(b);
      const qa = await issue(a, sa);
      const qb = await issue(b, sb);
      expect((await answer(a, sa, qa, correctChoice(qa))).status).toBe(200);
      const qa2 = await issue(a, sa);
      expect((await answer(a, sa, qa2, correctChoice(qa2))).status).toBe(429); // a is out
      expect((await answer(b, sb, qb, correctChoice(qb))).status).toBe(200); // b is not
    });
  });

  describe('the default limits and real play', () => {
    it('never throttle a normal game, consecutive games, refreshes, or retries', async () => {
      const h = await harness({ rateLimits: DEFAULT_RATE_LIMITS });
      const player = await newPlayer(h);
      for (let game = 0; game < 4; game++) {
        const { answers } = await playSession(player);
        expect(answers).toHaveLength(10);
        // Reconnect behavior between games: refresh, profile, and a session resume.
        for (let i = 0; i < 3; i++) {
          expect((await player.request('POST', PATHS.guest, {})).status).toBe(200);
          expect((await player.request('GET', PATHS.me)).status).toBe(200);
        }
      }
      // Retrying a submission (network hiccup) with the same attempt id is fine too.
      const sessionId = await startSession(player);
      const q = await issue(player, sessionId);
      for (let i = 0; i < 4; i++) {
        expect((await answer(player, sessionId, q, correctChoice(q), 'attempt-retry')).status).toBe(200);
      }
    });

    it('let a classroom of children share one IP address', async () => {
      const h = await harness({ rateLimits: DEFAULT_RATE_LIMITS });
      const baseline = await playersCount(h);
      const sharedIp = '198.51.100.77';
      const statuses: number[] = [];
      for (let child = 0; child < 28; child++) {
        const browser = await newPlayer(h, sharedIp);
        const sessionId = await startSession(browser);
        for (let i = 0; i < 3; i++) {
          const q = await issue(browser, sessionId);
          statuses.push((await answer(browser, sessionId, q, correctChoice(q))).status);
        }
      }
      expect(statuses).toHaveLength(84);
      expect(statuses.every((s) => s === 200)).toBe(true);
      expect(await playersCount(h)).toBe(baseline + 28);
    });
  });

  describe('API-wide per-IP backstop', () => {
    it('stops floods, including ones that rotate forged guest cookies, and spares /health', async () => {
      const h = await harness({ rateLimits: limits({ apiPerIp: { max: 5, windowSeconds: 60 } }) });
      const flood = new TestBrowser(h.app, h.ctx.cookie.name);
      const statuses: number[] = [];
      for (let i = 0; i < 8; i++) {
        flood.cookie = `forged-${i}`;
        statuses.push((await flood.request('GET', PATHS.me)).status);
      }
      expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(statuses.slice(5)).toEqual([429, 429, 429]);
      const blocked = await flood.request('GET', PATHS.me);
      expectRateLimited(blocked, 60);
      expect((await h.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
      // A different address is not affected.
      const other = new TestBrowser(h.app, h.ctx.cookie.name);
      other.remoteAddress = '198.51.100.99';
      expect((await other.request('GET', PATHS.me)).status).toBe(401);
    });
  });

  describe('proxy trust and the client address', () => {
    const create = (h: Harness, xff: string, ip?: string) => arrive(h, ip, { 'x-forwarded-for': xff });
    const burst2 = limits({ guestCreateBurst: { max: 2, windowSeconds: 60 } });

    it('by default ignores X-Forwarded-For completely: spoofing it evades nothing', async () => {
      const h = await harness({ rateLimits: burst2 });
      expect((await create(h, '1.1.1.1')).res.status).toBe(200);
      expect((await create(h, '2.2.2.2')).res.status).toBe(200);
      expect((await create(h, '3.3.3.3')).res.status).toBe(429);
      expect((await create(h, '4.4.4.4')).res.status).toBe(429);
    });

    it('with an address list, trusts forwarding only from those proxies and the right-most untrusted entry wins', async () => {
      const h = await harness({ rateLimits: burst2, trustProxy: ['loopback'] });
      // From a loopback proxy: the header is honored, so two clients are two buckets.
      expect((await create(h, '198.51.100.1')).res.status).toBe(200);
      expect((await create(h, '198.51.100.1')).res.status).toBe(200);
      expect((await create(h, '198.51.100.1')).res.status).toBe(429);
      expect((await create(h, '198.51.100.2')).res.status).toBe(200);
      // Forging extra entries on the LEFT does not create a new identity.
      expect((await create(h, '9.9.9.9, 198.51.100.1')).res.status).toBe(429);
      expect((await create(h, '8.8.8.8, 198.51.100.2')).res.status).toBe(200); // second request for .2
      expect((await create(h, '7.7.7.7, 198.51.100.2')).res.status).toBe(429); // third: same client
      // From an untrusted address: the header is ignored and the socket address is used.
      expect((await create(h, '5.5.5.5', '203.0.113.50')).res.status).toBe(200);
      expect((await create(h, '6.6.6.6', '203.0.113.50')).res.status).toBe(200);
      expect((await create(h, '7.7.7.7', '203.0.113.50')).res.status).toBe(429);
    });
  });

  describe('security headers on gameplay responses', () => {
    it('are present on success and on every error status the limiter and API produce', async () => {
      const h = await harness({
        rateLimits: limits({ guestCreateBurst: { max: 1, windowSeconds: 60 } }),
        hstsMaxAgeSeconds: 31_536_000,
      });
      const { browser, res: created } = await arrive(h);
      expect(created.status).toBe(200);
      expectSecurityHeaders(created.headers, '200 guest');
      expect(created.headers['strict-transport-security']).toBe('max-age=31536000');

      const sessionRes = await browser.request('POST', PATHS.sessions, START_BODY);
      expect(sessionRes.status).toBe(201);
      expectSecurityHeaders(sessionRes.headers, '201 session');

      const invalid = await browser.request('POST', PATHS.sessions, { gameId: 'zoo-sprint', mode: 'multiplication', coins: 999 });
      expect(invalid.status).toBe(400);
      expectSecurityHeaders(invalid.headers, '400 validation');

      const anon = await new TestBrowser(h.app, h.ctx.cookie.name).request('GET', PATHS.me);
      expect(anon.status).toBe(401);
      expectSecurityHeaders(anon.headers, '401');

      const missing = await browser.request('GET', PATHS.session('00000000-0000-4000-8000-000000000000'));
      expect(missing.status).toBe(404);
      expectSecurityHeaders(missing.headers, '404');

      expectSecurityHeaders((await arrive(h)).res.headers, '429 guest');
    });
  });
});
