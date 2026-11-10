import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '@bidazoo/api/app';
import type { AppContext } from '@bidazoo/api/context';
import { createDatabase, type Database } from '@bidazoo/api/db';
import { EXPEDITION_DESTINATIONS, ExpeditionProgressSchema } from '@bidazoo/contracts';
import type { FastifyInstance } from 'fastify';
import { modules } from '../../apps/api/src/modules';
import {
  STAMP_MIN_BEACONS,
  progressModule,
  recordExpeditionRun,
  unlockedDestinations,
  type ExpeditionRun,
} from '../../apps/api/src/modules/progress';
import { FakeClock, HAS_DB, PATHS, TEST_DATABASE_URL, TestBrowser, playSession, wrongChoice } from './support/harness';

const EXPEDITION = '/api/v1/me/expedition';

describe('unlocked destinations (pure placeholder rule, PENDING owner decision)', () => {
  it('opens only the first destination when nothing is stamped', () => {
    expect(unlockedDestinations(new Set())).toEqual(['great-wall']);
  });

  it('opens each next destination once the one before it has a stamp, in passport order', () => {
    expect(unlockedDestinations(new Set(['great-wall']))).toEqual(['great-wall', 'petra']);
    expect(unlockedDestinations(new Set(['great-wall', 'petra', 'andes']))).toEqual([
      'great-wall',
      'petra',
      'andes',
      'maya',
    ]);
  });

  it('does not skip ahead: a stamp further along opens nothing past the first gap', () => {
    expect(unlockedDestinations(new Set(['petra', 'andes']))).toEqual(['great-wall']);
    expect(unlockedDestinations(new Set(['great-wall', 'andes']))).toEqual(['great-wall', 'petra']);
  });

  it('never lists more than the seven destinations, and ignores unknown ids', () => {
    expect(unlockedDestinations(new Set([...EXPEDITION_DESTINATIONS, 'atlantis']))).toEqual([...EXPEDITION_DESTINATIONS]);
  });
});

describe.skipIf(!HAS_DB)('GET /api/v1/me/expedition and the progress tables (real PostgreSQL)', () => {
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
    // Until the progress module is in the API's module list (a cross-lane change), register it here.
    if (!modules.some((m) => m.name === 'progress')) void app.register(progressModule, { ctx });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await database.close();
  });

  const query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> =>
    (await database.pool.query(text, params)).rows as T[];

  async function newGuest(): Promise<{ browser: TestBrowser; playerId: string }> {
    const browser = new TestBrowser(app, ctx.cookie.name);
    const res = await browser.request('POST', PATHS.guest, {});
    if (res.status !== 200) throw new Error(`guest creation failed: ${res.status} ${res.raw}`);
    return { browser, playerId: res.body.player.id as string };
  }

  async function completedSession(browser: TestBrowser): Promise<string> {
    return (await playSession(browser)).sessionId;
  }

  function record(run: ExpeditionRun) {
    return database.db.transaction((tx) => recordExpeditionRun(tx, run));
  }

  function run(playerId: string, playSessionId: string, over: Partial<ExpeditionRun> = {}): ExpeditionRun {
    return { playerId, playSessionId, destination: 'great-wall', beaconsLit: 3, bossWon: false, bestStreak: 4, ...over };
  }

  it('requires a player: no cookie is a 401', async () => {
    const res = await new TestBrowser(app, ctx.cookie.name).request('GET', EXPEDITION);
    expect(res.status).toBe(401);
  });

  it('a new guest has no stamps and only the first destination open, in the strict contract shape', async () => {
    const { browser } = await newGuest();
    const res = await browser.request('GET', EXPEDITION);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ stamps: [], unlocked: ['great-wall'] });
    expect(Object.keys(res.body).sort()).toEqual(Object.keys(ExpeditionProgressSchema.properties).sort());
  });

  it('reading progress writes nothing', async () => {
    const { browser, playerId } = await newGuest();
    await browser.request('GET', EXPEDITION);
    await browser.request('GET', EXPEDITION);
    for (const table of ['player_progress', 'destination_stamps', 'expedition_events']) {
      const [row] = await query<{ n: string }>(`select count(*)::text as n from ${table} where player_id = $1`, [playerId]);
      expect(row?.n, table).toBe('0');
    }
  });

  it('a run with at least 3 beacons lit stamps the destination and opens the next one', async () => {
    const { browser, playerId } = await newGuest();
    const sessionId = await completedSession(browser);
    expect(STAMP_MIN_BEACONS).toBe(3);
    expect(await record(run(playerId, sessionId, { beaconsLit: 3, bestStreak: 6 }))).toEqual({ stampEarned: true });

    const res = await browser.request('GET', EXPEDITION);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      stamps: [{ destination: 'great-wall', count: 1, bestStreak: 6, artifacts: [] }],
      unlocked: ['great-wall', 'petra'],
    });
  });

  it('a run with fewer than 3 beacons lit is recorded but earns no stamp', async () => {
    const { browser, playerId } = await newGuest();
    const sessionId = (await playSession(browser, { decide: wrongChoice })).sessionId;
    expect(await record(run(playerId, sessionId, { beaconsLit: 2 }))).toEqual({ stampEarned: false });

    expect((await browser.request('GET', EXPEDITION)).body).toEqual({ stamps: [], unlocked: ['great-wall'] });
    const events = await query<{ kind: string; payload: Record<string, unknown> }>(
      'select kind, payload from expedition_events where play_session_id = $1',
      [sessionId],
    );
    expect(events).toEqual([
      { kind: 'expedition_run', payload: { destination: 'great-wall', beaconsLit: 2, bossWon: false, stampEarned: false } },
    ]);
  });

  it('a session stamps at most once, even when completion is recorded twice or concurrently', async () => {
    const { browser, playerId } = await newGuest();
    const sessionId = await completedSession(browser);
    const outcomes = await Promise.all([record(run(playerId, sessionId)), record(run(playerId, sessionId))]);
    expect(outcomes).toEqual([{ stampEarned: true }, { stampEarned: true }]);
    // A later replay with different numbers cannot change what the first one decided.
    expect(await record(run(playerId, sessionId, { beaconsLit: 0 }))).toEqual({ stampEarned: true });

    const res = await browser.request('GET', EXPEDITION);
    expect(res.body.stamps).toEqual([{ destination: 'great-wall', count: 1, bestStreak: 4, artifacts: [] }]);
    const [row] = await query<{ n: string }>('select count(*)::text as n from expedition_events where play_session_id = $1', [
      sessionId,
    ]);
    expect(row?.n).toBe('1');
  });

  it('stamps from separate sessions add up, keep the best streak, and list in passport order', async () => {
    const { browser, playerId } = await newGuest();
    expect(await record(run(playerId, await completedSession(browser), { bestStreak: 5 }))).toEqual({ stampEarned: true });
    expect(await record(run(playerId, await completedSession(browser), { bestStreak: 2, beaconsLit: 5 }))).toEqual({
      stampEarned: true,
    });
    expect(await record(run(playerId, await completedSession(browser), { destination: 'petra', bestStreak: 3 }))).toEqual({
      stampEarned: true,
    });

    const res = await browser.request('GET', EXPEDITION);
    expect(res.body).toEqual({
      stamps: [
        { destination: 'great-wall', count: 2, bestStreak: 5, artifacts: [] },
        { destination: 'petra', count: 1, bestStreak: 3, artifacts: [] },
      ],
      unlocked: ['great-wall', 'petra', 'andes'],
    });
  });

  it("one player's stamps are invisible to another, and a run cannot use another player's session", async () => {
    const a = await newGuest();
    const b = await newGuest();
    const sessionA = await completedSession(a.browser);
    expect(await record(run(a.playerId, sessionA))).toEqual({ stampEarned: true });
    expect((await b.browser.request('GET', EXPEDITION)).body).toEqual({ stamps: [], unlocked: ['great-wall'] });

    const sessionB = await completedSession(b.browser);
    await expect(record(run(a.playerId, sessionB))).rejects.toThrow();
    expect((await a.browser.request('GET', EXPEDITION)).body.stamps[0].count).toBe(1);
  });

  it('rejects an unknown destination or an invalid beacon count before writing anything', async () => {
    const { browser, playerId } = await newGuest();
    const sessionId = await completedSession(browser);
    await expect(record(run(playerId, sessionId, { destination: 'atlantis' }))).rejects.toThrow();
    await expect(record(run(playerId, sessionId, { beaconsLit: -1 }))).rejects.toThrow();
    await expect(record(run(playerId, sessionId, { beaconsLit: 2.5 }))).rejects.toThrow();
    const [row] = await query<{ n: string }>('select count(*)::text as n from expedition_events where player_id = $1', [playerId]);
    expect(row?.n).toBe('0');
  });

  it('the client cannot write progress: the route is GET only and ignores query input', async () => {
    const { browser } = await newGuest();
    for (const method of ['POST', 'DELETE'] as const) {
      const res = await browser.request(method, EXPEDITION, method === 'POST' ? { stamps: [{ destination: 'petra' }] } : undefined);
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    const res = await browser.request('GET', `${EXPEDITION}?unlocked=petra`);
    expect(res.body).toEqual({ stamps: [], unlocked: ['great-wall'] });
  });

  describe('database guards from migration 0005', () => {
    it('player_progress starts with empty gear and a zero streak, and rejects malformed gear or a negative streak', async () => {
      const { playerId } = await newGuest();
      await query('insert into player_progress (player_id) values ($1)', [playerId]);
      const [row] = await query<{ gear: unknown; streak_days: number; last_play_date: unknown }>(
        'select gear, streak_days, last_play_date from player_progress where player_id = $1',
        [playerId],
      );
      expect(row).toEqual({ gear: { owned: [], equipped: [] }, streak_days: 0, last_play_date: null });
      await expect(
        query(`update player_progress set gear = '{"owned":"hat"}'::jsonb where player_id = $1`, [playerId]),
      ).rejects.toThrow(/player_progress_gear_ck/);
      await expect(query('update player_progress set streak_days = -1 where player_id = $1', [playerId])).rejects.toThrow(
        /player_progress_streak_ck/,
      );
    });

    it('destination_stamps rejects a malformed destination, negative counts and non-array artifacts', async () => {
      const { playerId } = await newGuest();
      await expect(
        query("insert into destination_stamps (player_id, destination) values ($1, 'Great Wall')", [playerId]),
      ).rejects.toThrow(/destination_stamps_destination_ck/);
      await expect(
        query("insert into destination_stamps (player_id, destination, count) values ($1, 'petra', -1)", [playerId]),
      ).rejects.toThrow(/destination_stamps_count_ck/);
      await expect(
        query(`insert into destination_stamps (player_id, destination, artifacts) values ($1, 'petra', '{}'::jsonb)`, [playerId]),
      ).rejects.toThrow(/destination_stamps_artifacts_ck/);
    });

    it('expedition_events is append-only and allows one event of each kind per session', async () => {
      const { browser, playerId } = await newGuest();
      const sessionId = await completedSession(browser);
      expect(await record(run(playerId, sessionId))).toEqual({ stampEarned: true });
      await expect(
        query(`update expedition_events set payload = '{"stampEarned":false}'::jsonb where play_session_id = $1`, [sessionId]),
      ).rejects.toThrow(/append-only/);
      await expect(query('delete from expedition_events where play_session_id = $1', [sessionId])).rejects.toThrow(/append-only/);
      await expect(
        query("insert into expedition_events (play_session_id, player_id, kind) values ($1, $2, 'expedition_run')", [
          sessionId,
          playerId,
        ]),
      ).rejects.toThrow(/expedition_events_session_kind_uq/);
    });

    it("expedition_events cannot join a player to someone else's session", async () => {
      const a = await newGuest();
      const b = await newGuest();
      const sessionB = await completedSession(b.browser);
      await expect(
        query("insert into expedition_events (play_session_id, player_id, kind) values ($1, $2, 'expedition_run')", [
          sessionB,
          a.playerId,
        ]),
      ).rejects.toThrow(/expedition_events_session_player_fk/);
    });
  });
});
