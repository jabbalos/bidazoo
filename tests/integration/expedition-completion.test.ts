/**
 * Items C2 and C4 (results part): POST /api/v1/me/expedition/runs, the session-completion hook and
 * the level data in the results, on the real-PostgreSQL harness.
 *
 * MOCKED: `replayExpedition` from learning-core. It is Lane A's item and is only a stub on this
 * branch, so each test sets what the replay returns. Everything else (routes, transaction, ledger,
 * stamps) is real.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const replay = vi.hoisted(() => vi.fn());
vi.mock('@bidazoo/learning-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bidazoo/learning-core')>()),
  replayExpedition: replay,
}));

import { buildApp } from '@bidazoo/api/app';
import type { AppContext } from '@bidazoo/api/context';
import { createDatabase, type Database } from '@bidazoo/api/db';
import { SessionResultsSchema } from '@bidazoo/contracts';
import type { FastifyInstance } from 'fastify';
import { modules } from '../../apps/api/src/modules';
import { progressModule } from '../../apps/api/src/modules/progress';
import {
  FakeClock,
  HAS_DB,
  PATHS,
  TEST_DATABASE_URL,
  TestBrowser,
  answer,
  correctChoice,
  issue,
  startSession,
} from './support/harness';

const RUNS = '/api/v1/me/expedition/runs';
const EXPEDITION = '/api/v1/me/expedition';

describe.skipIf(!HAS_DB)('expedition runs, completion hook and level results (real PostgreSQL)', () => {
  let database: Database;
  let app: FastifyInstance;
  let ctx: AppContext;

  beforeAll(async () => {
    database = createDatabase(TEST_DATABASE_URL as string);
    ctx = {
      db: database.db,
      clock: new FakeClock(),
      cookie: { name: 'bidazoo_guest', secure: false, maxAgeSeconds: 90 * 86_400 },
      allowedOrigins: [],
    };
    app = buildApp({ checks: { database: () => database.ping() }, ctx });
    if (!modules.some((m) => m.name === 'progress')) void app.register(progressModule, { ctx });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await database.close();
  });
  beforeEach(() => {
    replay.mockReset();
    replay.mockReturnValue({ beaconsLit: 0, bossWon: false });
  });

  const query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> =>
    (await database.pool.query(text, params)).rows as T[];

  async function newGuest(): Promise<{ browser: TestBrowser; playerId: string }> {
    const browser = new TestBrowser(app, ctx.cookie.name);
    const res = await browser.request('POST', PATHS.guest, {});
    if (res.status !== 200) throw new Error(`guest creation failed: ${res.status} ${res.raw}`);
    return { browser, playerId: res.body.player.id as string };
  }

  /** Answers the 10 questions of an already-started session, all correct. Returns the last response. */
  async function finish(browser: TestBrowser, sessionId: string) {
    let last: Awaited<ReturnType<typeof answer>> | undefined;
    for (let i = 0; i < 10; i++) {
      const question = await issue(browser, sessionId);
      last = await answer(browser, sessionId, question, correctChoice(question));
      expect(last.status).toBe(200);
    }
    if (!last) throw new Error('no answers');
    return last;
  }

  async function startExpedition(browser: TestBrowser, destination = 'great-wall') {
    const sessionId = await startSession(browser);
    const res = await browser.request('POST', RUNS, { sessionId, destination });
    expect(res.status).toBe(201);
    return sessionId;
  }

  const stamps = async (browser: TestBrowser) => (await browser.request('GET', EXPEDITION)).body.stamps;

  describe('POST /api/v1/me/expedition/runs', () => {
    it("records the destination for the caller's active session, and a repeat is idempotent", async () => {
      const { browser, playerId } = await newGuest();
      const sessionId = await startSession(browser);
      const first = await browser.request('POST', RUNS, { sessionId, destination: 'great-wall' });
      expect(first.status).toBe(201);
      expect(first.body).toEqual({ sessionId, destination: 'great-wall' });
      const again = await browser.request('POST', RUNS, { sessionId, destination: 'great-wall' });
      expect(again.status).toBe(200);
      expect(again.body).toEqual({ sessionId, destination: 'great-wall' });
      const rows = await query('select kind, payload from expedition_events where play_session_id = $1 and player_id = $2', [
        sessionId,
        playerId,
      ]);
      expect(rows).toEqual([{ kind: 'start', payload: { destination: 'great-wall' } }]);
    });

    it('a different destination for the same session is a 409 and changes nothing', async () => {
      const { browser, playerId } = await newGuest();
      await query(`insert into destination_stamps (player_id, destination, count) values ($1, 'great-wall', 1)`, [playerId]);
      const sessionId = await startSession(browser);
      expect((await browser.request('POST', RUNS, { sessionId, destination: 'great-wall' })).status).toBe(201);
      const res = await browser.request('POST', RUNS, { sessionId, destination: 'petra' });
      expect(res.status).toBe(409);
      const [row] = await query<{ payload: { destination: string } }>(
        `select payload from expedition_events where play_session_id = $1 and kind = 'start'`,
        [sessionId],
      );
      expect(row?.payload.destination).toBe('great-wall');
    });

    it("another player's session is rejected (404) and nothing is written", async () => {
      const a = await newGuest();
      const b = await newGuest();
      const sessionA = await startSession(a.browser);
      const res = await b.browser.request('POST', RUNS, { sessionId: sessionA, destination: 'great-wall' });
      expect(res.status).toBe(404);
      const [row] = await query<{ n: string }>('select count(*)::text as n from expedition_events where play_session_id = $1', [
        sessionA,
      ]);
      expect(row?.n).toBe('0');
    });

    it('a locked or unknown destination is rejected (403) and nothing is written', async () => {
      const { browser } = await newGuest();
      const sessionId = await startSession(browser);
      for (const destination of ['petra', 'andes', 'atlantis']) {
        const res = await browser.request('POST', RUNS, { sessionId, destination });
        expect(res.status, destination).toBe(403);
      }
      const [row] = await query<{ n: string }>('select count(*)::text as n from expedition_events where play_session_id = $1', [
        sessionId,
      ]);
      expect(row?.n).toBe('0');
    });

    it('petra opens after a great-wall stamp', async () => {
      const { browser, playerId } = await newGuest();
      await query(`insert into destination_stamps (player_id, destination, count) values ($1, 'great-wall', 1)`, [playerId]);
      const sessionId = await startSession(browser);
      expect((await browser.request('POST', RUNS, { sessionId, destination: 'petra' })).status).toBe(201);
    });

    it('a session that is not active is a 409, a missing player is a 401, a malformed body is a 400', async () => {
      const { browser } = await newGuest();
      const sessionId = await startSession(browser);
      await finish(browser, sessionId);
      expect((await browser.request('POST', RUNS, { sessionId, destination: 'great-wall' })).status).toBe(409);
      const anon = new TestBrowser(app, ctx.cookie.name);
      expect((await anon.request('POST', RUNS, { sessionId, destination: 'great-wall' })).status).toBe(401);
      const open = await startSession(browser);
      expect((await browser.request('POST', RUNS, { sessionId: open })).status).toBe(400);
      expect((await browser.request('POST', RUNS, { sessionId: 'nope', destination: 'great-wall' })).status).toBe(400);
    });
  });

  describe('session completion', () => {
    it('3 beacons lit: the stamp is earned and the results say so', async () => {
      const { browser } = await newGuest();
      replay.mockReturnValue({ beaconsLit: 3, bossWon: false });
      const sessionId = await startExpedition(browser);
      const last = await finish(browser, sessionId);
      const results = last.body.session.results;
      expect(results.beaconsLit).toBe(3);
      expect(results.stampEarned).toBe(true);
      expect(await stamps(browser)).toEqual([{ destination: 'great-wall', count: 1, bestStreak: 10, artifacts: [] }]);
      // The replay got the stored answers, in order.
      expect(replay).toHaveBeenCalledTimes(1);
      expect(replay.mock.calls[0]?.[0]).toEqual(Array.from({ length: 10 }, () => ({ correct: true })));
      // Reading the finished session again shows the same facts.
      const reread = await browser.request('GET', PATHS.session(sessionId));
      expect(reread.body.session.results.beaconsLit).toBe(3);
      expect(reread.body.session.results.stampEarned).toBe(true);
    });

    it('2 beacons lit: no stamp, but the results still carry beaconsLit and stampEarned false', async () => {
      const { browser } = await newGuest();
      replay.mockReturnValue({ beaconsLit: 2, bossWon: false });
      const sessionId = await startExpedition(browser);
      const results = (await finish(browser, sessionId)).body.session.results;
      expect(results.beaconsLit).toBe(2);
      expect(results.stampEarned).toBe(false);
      expect(await stamps(browser)).toEqual([]);
    });

    it('5 beacons lit with a won boss stamps too', async () => {
      const { browser } = await newGuest();
      replay.mockReturnValue({ beaconsLit: 5, bossWon: true });
      const results = (await finish(browser, await startExpedition(browser))).body.session.results;
      expect(results.beaconsLit).toBe(5);
      expect(results.stampEarned).toBe(true);
    });

    it('no start event: no stamp, no replay, and the beacon fields are absent', async () => {
      const { browser, playerId } = await newGuest();
      replay.mockReturnValue({ beaconsLit: 5, bossWon: true });
      const sessionId = await startSession(browser);
      const results = (await finish(browser, sessionId)).body.session.results;
      expect(replay).not.toHaveBeenCalled();
      expect('beaconsLit' in results).toBe(false);
      expect('stampEarned' in results).toBe(false);
      expect(await stamps(browser)).toEqual([]);
      const [row] = await query<{ n: string }>('select count(*)::text as n from expedition_events where player_id = $1', [playerId]);
      expect(row?.n).toBe('0');
    });

    it('is exactly-once: a replayed last answer and a re-read never add a second stamp', async () => {
      const { browser } = await newGuest();
      replay.mockReturnValue({ beaconsLit: 4, bossWon: false });
      const sessionId = await startSession(browser);
      expect((await browser.request('POST', RUNS, { sessionId, destination: 'great-wall' })).status).toBe(201);
      let lastBody: Record<string, unknown> = {};
      let lastAttempt: { questionId: string; attemptId: string; response: number } | undefined;
      for (let i = 0; i < 10; i++) {
        const question = await issue(browser, sessionId);
        const attemptId = `once-${i}-${sessionId}`;
        const res = await answer(browser, sessionId, question, correctChoice(question), attemptId);
        lastBody = res.body;
        lastAttempt = { questionId: question.id, attemptId, response: correctChoice(question) };
      }
      expect(lastBody['replayed']).toBe(false);
      const repeat = await browser.request('POST', PATHS.answers(sessionId), lastAttempt);
      expect(repeat.status).toBe(200);
      expect(repeat.body.replayed).toBe(true);
      expect(repeat.body.session.results.stampEarned).toBe(true);
      expect(repeat.body.session.results.beaconsLit).toBe(4);
      await browser.request('GET', PATHS.session(sessionId));
      expect(replay).toHaveBeenCalledTimes(1);
      expect(await stamps(browser)).toEqual([{ destination: 'great-wall', count: 1, bestStreak: 10, artifacts: [] }]);
      const [row] = await query<{ n: string }>(`select count(*)::text as n from expedition_events where play_session_id = $1`, [
        sessionId,
      ]);
      expect(row?.n).toBe('2'); // start + expedition_run
    });
  });

  describe('level data in the results (C4)', () => {
    it('every completed session carries a level and levelUp in the strict contract shape', async () => {
      const { browser } = await newGuest();
      const sessionId = await startSession(browser);
      const results = (await finish(browser, sessionId)).body.session.results;
      const allowed = Object.keys(SessionResultsSchema.properties);
      for (const key of Object.keys(results)) expect(allowed).toContain(key);
      // 10 correct (10 XP each) + 25 completion = 125 XP: level 2 (100 XP), crossing from level 1.
      expect(results.xpEarned).toBe(125);
      expect(results.level).toBe(2);
      expect(results.levelUp).toEqual({ fromLevel: 1, toLevel: 2, gained: 1 });
    });

    it('a second session in the same level has levelUp null, and re-reading the first still shows its level-up', async () => {
      const { browser } = await newGuest();
      const first = await startSession(browser);
      await finish(browser, first);
      const second = await startSession(browser);
      const results = (await finish(browser, second)).body.session.results;
      expect(results.level).toBe(2); // 250 XP is still below level 3 at 300
      expect(results.levelUp).toBeNull();
      const reread = (await browser.request('GET', PATHS.session(first))).body.session.results;
      expect(reread.level).toBe(2);
      expect(reread.levelUp).toEqual({ fromLevel: 1, toLevel: 2, gained: 1 });
    });
  });
});
