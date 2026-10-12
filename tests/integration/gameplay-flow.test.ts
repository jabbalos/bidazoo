import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  HAS_DB,
  PATHS,
  TestBrowser,
  answer,
  correctChoice,
  countRows,
  issue,
  makeHarness,
  newPlayer,
  playerIdOf,
  playSession,
  sql,
  startSession,
  wrongChoice,
  type Harness,
} from './support/harness';

describe.skipIf(!HAS_DB)('gameplay flow (API -> learning-core -> PostgreSQL -> result)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  describe('a full 10-question session', () => {
    it('serves, grades, rewards, persists mastery, and completes', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const { sessionId, answers, questions } = await playSession(player, {
        beforeAnswer: () => h.clock.advance(2_000),
      });

      // Every answer was correct and fluent (2 s on the server clock).
      for (const [index, res] of answers.entries()) {
        expect(res.body.correct).toBe(true);
        expect(res.body.fluent).toBe(true);
        expect(res.body.responseMs).toBe(2_000);
        expect(res.body.session.answered).toBe(index + 1);
        expect(res.body.session.currentQuestion).toBeNull();
      }
      expect(questions.map((q) => q.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(new Set(questions.map((q) => q.prompt.split(' × ').sort().join('x'))).size).toBe(10);

      // Completion + results.
      const last = answers[9]!.body;
      expect(last.session.status).toBe('completed');
      expect(last.rewards).toContainEqual({ kind: 'xp', amount: 25, reason: 'session_completion' });
      expect(last.rewards).toContainEqual({ kind: 'coins', amount: 10, reason: 'session_completion' });
      expect(last.session.results).toMatchObject({
        correct: 10,
        total: 10,
        fluent: 10,
        xpEarned: 125,
        coinsEarned: 30,
        bonus: { xp: 25, coins: 10 },
      });
      expect(last.session.results.answers).toHaveLength(10);
      expect(last.totals).toEqual({ xp: 125, coins: 30 });

      // Database records.
      const [session] = await sql<Record<string, any>>(h, 'select * from play_sessions where id = $1', [sessionId]);
      expect(session).toMatchObject({ status: 'completed', answered_count: 10, correct_count: 10, total_questions: 10 });
      expect(session?.completed_at).not.toBeNull();
      expect(await countRows(h, 'served_questions', 'play_session_id = $1', [sessionId])).toBe(10);
      expect(await countRows(h, 'served_questions', 'play_session_id = $1 and answered_at is null', [sessionId])).toBe(0);
      expect(await countRows(h, 'attempts', 'play_session_id = $1', [sessionId])).toBe(10);

      // Ledger totals equal what the API reports, and every row traces to a source.
      const [xp] = await sql<{ total: string }>(h, 'select sum(amount)::text as total from xp_events where player_id = $1', [playerId]);
      const [coins] = await sql<{ total: string }>(h, 'select sum(amount)::text as total from wallet_transactions where player_id = $1', [playerId]);
      expect([Number(xp?.total), Number(coins?.total)]).toEqual([125, 30]);
      expect(await countRows(h, 'xp_events', "player_id = $1 and source_type = 'attempt'", [playerId])).toBe(10);
      expect(await countRows(h, 'xp_events', "player_id = $1 and source_type = 'play_session'", [playerId])).toBe(1);
      expect(await countRows(h, 'wallet_transactions', "player_id = $1 and currency = 'coins'", [playerId])).toBe(11);

      // Mastery persisted: ten facts, each in box 1 with a streak of one.
      const mastery = await sql<Record<string, any>>(h, 'select * from skill_mastery where player_id = $1 order by skill_key', [playerId]);
      expect(mastery).toHaveLength(10);
      for (const row of mastery) {
        expect(row).toMatchObject({ box: 1, streak: 1, attempts: 1, correct_count: 1, fluent_days: 1 });
      }
      expect(h.clock.now().toISOString().slice(0, 10)).toBe(String(mastery[0]?.last_fluent_day instanceof Date ? mastery[0].last_fluent_day.toISOString().slice(0, 10) : mastery[0]?.last_fluent_day));

      // A fresh session can begin afterwards (the old one is no longer active).
      const next = await player.request('POST', PATHS.sessions, { gameId: 'zoo-sprint', mode: 'multiplication' });
      expect(next.status).toBe(201);
      expect(next.body.session.id).not.toBe(sessionId);
    });
  });

  describe('incorrect answers', () => {
    it('are non-punitive: no rewards, the miss is recorded in mastery, and the session continues', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const sessionId = await startSession(player);
      const q1 = await issue(player, sessionId);
      const miss = await answer(player, sessionId, q1, wrongChoice(q1));

      expect(miss.status).toBe(200);
      expect(miss.body).toMatchObject({ correct: false, fluent: false, rewards: [], totals: { xp: 0, coins: 0 } });
      expect(miss.body.correctAnswer).toBe(correctChoice(q1)); // the correction is revealed after grading
      expect(miss.body.mastery).toMatchObject({ box: 0, streak: 0, mastered: false });
      expect(miss.body.session).toMatchObject({ answered: 1, correct: 0, status: 'active' });
      const [row] = await sql<Record<string, any>>(h, 'select * from skill_mastery where player_id = $1', [playerId]);
      expect(row).toMatchObject({ box: 0, streak: 0, attempts: 1, correct_count: 0, fluent_days: 0 });
      expect(await countRows(h, 'attempts', 'player_id = $1 and correct = false', [playerId])).toBe(1);

      const q2 = await issue(player, sessionId);
      expect(q2.sequence).toBe(2);
    });

    it('a missed fact comes back later in the same session, within the retry limits', async () => {
      const player = await newPlayer(h);
      const sessionId = await startSession(player);
      const first = await issue(player, sessionId);
      await answer(player, sessionId, first, wrongChoice(first));
      let retriedAt: number | null = null;
      for (let i = 2; i <= 10; i++) {
        const q = await issue(player, sessionId);
        if (q.prompt.split(' × ').sort().join('x') === first.prompt.split(' × ').sort().join('x') && retriedAt === null) {
          retriedAt = i;
        }
        await answer(player, sessionId, q, correctChoice(q));
      }
      expect(retriedAt).not.toBeNull();
      expect(retriedAt as number).toBeGreaterThanOrEqual(4); // never immediately
      const reasons = await sql<{ selection_reason: string }>(
        h,
        'select selection_reason from served_questions where play_session_id = $1 order by sequence',
        [sessionId],
      );
      expect(reasons.filter((r) => r.selection_reason === 'retry')).toHaveLength(1);
    });

    it('retries are bounded even if every answer is wrong', async () => {
      const player = await newPlayer(h);
      const { sessionId } = await playSession(player, { decide: wrongChoice });
      const reasons = await sql<{ selection_reason: string; skill_key: string }>(
        h,
        'select selection_reason, skill_key from served_questions where play_session_id = $1 order by sequence',
        [sessionId],
      );
      expect(reasons.filter((r) => r.selection_reason === 'retry').length).toBeLessThanOrEqual(3);
      const perFact = new Map<string, number>();
      for (const r of reasons) perFact.set(r.skill_key, (perFact.get(r.skill_key) ?? 0) + 1);
      expect(Math.max(...perFact.values())).toBeLessThanOrEqual(3); // first ask plus at most 2 retries
      const done = await player.request('GET', PATHS.me);
      expect(done.body.totals).toEqual({ xp: 25, coins: 10 }); // only the completion bonus; no answer rewards
    });
  });

  describe('server-measured response time and fluency', () => {
    async function timedAnswer(delayMs: number, correct = true) {
      const player = await newPlayer(h);
      const sessionId = await startSession(player);
      const q = await issue(player, sessionId);
      h.clock.advance(delayMs);
      const res = await answer(player, sessionId, q, correct ? correctChoice(q) : wrongChoice(q));
      return res.body;
    }

    it('fluent means correct and at most 6000 ms, measured by the server', async () => {
      expect(await timedAnswer(1)).toMatchObject({ responseMs: 1, fluent: true });
      expect(await timedAnswer(6000)).toMatchObject({ responseMs: 6000, fluent: true });
      expect(await timedAnswer(6001)).toMatchObject({ responseMs: 6001, fluent: false, correct: true });
      expect(await timedAnswer(9000)).toMatchObject({ fluent: false, correct: true });
      expect(await timedAnswer(500, false)).toMatchObject({ fluent: false, correct: false });
    });

    it('a slow correct answer does not promote the box; a fluent one does', async () => {
      expect((await timedAnswer(9000)).mastery).toMatchObject({ box: 0, streak: 1, fluentDays: 0 });
      expect((await timedAnswer(1000)).mastery).toMatchObject({ box: 1, streak: 1, fluentDays: 1 });
    });

    it('stores served_at at issue time and answered_at at answer time, both from the server', async () => {
      const player = await newPlayer(h);
      const sessionId = await startSession(player);
      const issuedAt = h.clock.now();
      const q = await issue(player, sessionId);
      h.clock.advance(4_321);
      const res = await answer(player, sessionId, q, correctChoice(q));
      const [row] = await sql<{ served_at: Date; answered_at: Date; response_ms: number }>(
        h,
        `select q.served_at, q.answered_at, a.response_ms from served_questions q join attempts a on a.served_question_id = q.id where q.id = $1`,
        [q.id],
      );
      expect(row?.served_at.getTime()).toBe(issuedAt.getTime());
      expect(row?.answered_at.getTime()).toBe(issuedAt.getTime() + 4_321);
      expect(row?.response_ms).toBe(4_321);
      expect(res.body.responseMs).toBe(4_321);
    });

    it('the client cannot supply a duration (the field does not exist)', async () => {
      const player = await newPlayer(h);
      const sessionId = await startSession(player);
      const q = await issue(player, sessionId);
      h.clock.advance(20_000);
      const res = await player.request('POST', PATHS.answers(sessionId), {
        attemptId: 'client-says-fast-0001',
        questionId: q.id,
        response: correctChoice(q),
        responseMs: 100,
      });
      expect(res.status).toBe(400);
      // The honest request still sees the server's own (slow) measurement.
      const honest = await answer(player, sessionId, q, correctChoice(q));
      expect(honest.body).toMatchObject({ responseMs: 20_000, fluent: false });
    });
  });

  describe('refresh and resume', () => {
    it('restores identity, session, progress, and the unanswered question without resetting the timer', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const sessionId = await startSession(player);
      const q1 = await issue(player, sessionId);
      await answer(player, sessionId, q1, correctChoice(q1));
      const q2 = await issue(player, sessionId);
      const [before] = await sql<{ served_at: Date }>(h, 'select served_at from served_questions where id = $1', [q2.id]);

      // The page is refreshed three seconds later. The browser keeps only its cookie.
      h.clock.advance(3_000);
      const reloaded = new TestBrowser(h.app, h.ctx.cookie.name);
      reloaded.cookie = player.cookie;
      const me = await reloaded.request('POST', PATHS.guest, {});
      expect(me.body.player.id).toBe(playerId);
      expect(me.body.activeSessionId).toBe(sessionId);
      const resumed = await reloaded.request('POST', PATHS.sessions, { gameId: 'zoo-sprint', mode: 'multiplication' });
      expect(resumed.status).toBe(200);
      expect(resumed.body.resumed).toBe(true);
      expect(resumed.body.session.id).toBe(sessionId);
      expect(resumed.body.session).toMatchObject({ answered: 1, correct: 1, status: 'active' });
      expect(resumed.body.session.currentQuestion).toEqual(q2);
      const again = await reloaded.request('POST', PATHS.question(sessionId), {});
      expect(again.body.question).toEqual(q2); // the same question, not a new one

      // No second question was created, and served_at is untouched.
      expect(await countRows(h, 'served_questions', 'play_session_id = $1', [sessionId])).toBe(2);
      const [after] = await sql<{ served_at: Date }>(h, 'select served_at from served_questions where id = $1', [q2.id]);
      expect(after?.served_at.getTime()).toBe(before?.served_at.getTime());

      // Answering two seconds after the refresh is measured from the ORIGINAL issue time.
      h.clock.advance(2_000);
      const res = await answer(reloaded, sessionId, q2, correctChoice(q2));
      expect(res.body.responseMs).toBe(5_000);
    });

    it('between an answer and the next request, resume shows no open question and asks for the next one', async () => {
      const player = await newPlayer(h);
      const sessionId = await startSession(player);
      const q1 = await issue(player, sessionId);
      await answer(player, sessionId, q1, correctChoice(q1));
      const state = await player.request('GET', PATHS.session(sessionId));
      expect(state.body.session.currentQuestion).toBeNull();
      expect(state.body.session.answered).toBe(1);
      const next = await issue(player, sessionId);
      expect(next.sequence).toBe(2);
      // The delay between the answer and the next request is not counted against the child.
      h.clock.advance(60_000);
      const [row] = await sql<{ served_at: Date }>(h, 'select served_at from served_questions where id = $1', [next.id]);
      expect(row?.served_at.getTime()).toBe(h.clock.now().getTime() - 60_000);
    });

    it('a completed session is shown with its results after a refresh', async () => {
      const player = await newPlayer(h);
      const { sessionId } = await playSession(player);
      const state = await player.request('GET', PATHS.session(sessionId));
      expect(state.body.session.status).toBe('completed');
      expect(state.body.session.results).toMatchObject({ correct: 10, total: 10 });
      const me = await player.request('GET', PATHS.me);
      expect(me.body.activeSessionId).toBeNull();
    });
  });

  describe('mastery over several days (Leitner + fluent on multiple days)', () => {
    it('due facts come back first, advance through the boxes, and become mastered only after fluent answers on 2+ days', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);

      // Day 1: ten new facts answered quickly.
      const day1 = await playSession(player, { beforeAnswer: () => h.clock.advance(1_500) });
      const day1Facts = new Set(day1.questions.map((q) => q.prompt.split(' × ').sort().join('x')));
      expect(day1Facts.size).toBe(10);

      let masteredSeenInResults: string[] = [];
      const boxHistory: number[] = [];
      for (let day = 2; day <= 9; day++) {
        h.clock.advanceDays(1);
        const run = await playSession(player, { beforeAnswer: () => h.clock.advance(1_500) });
        const facts = new Set(run.questions.map((q) => q.prompt.split(' × ').sort().join('x')));
        const lastResults = run.answers[9]!.body.session.results;
        masteredSeenInResults = [...masteredSeenInResults, ...lastResults.newlyMastered];
        const [max] = await sql<{ max: number }>(h, 'select max(box) as max from skill_mastery where player_id = $1', [playerId]);
        boxHistory.push(max?.max ?? 0);
        if (day === 2) {
          // Whatever was due is served first: most of day 2 is the facts from day 1.
          const overlap = [...facts].filter((f) => day1Facts.has(f)).length;
          expect(overlap).toBeGreaterThanOrEqual(6);
        }
      }

      // Boxes only ever moved up with consistent fluent practice, and reached the mastery threshold.
      expect(boxHistory[0]).toBeGreaterThanOrEqual(2);
      expect(boxHistory[boxHistory.length - 1]).toBeGreaterThanOrEqual(4);
      const mastered = await sql<Record<string, any>>(
        h,
        'select * from skill_mastery where player_id = $1 and mastered_at is not null',
        [playerId],
      );
      expect(mastered.length).toBeGreaterThan(0);
      for (const row of mastered) {
        // The rule: box >= 4, streak >= 3, fluent on at least two different days.
        expect(row.box).toBeGreaterThanOrEqual(4);
        expect(row.streak).toBeGreaterThanOrEqual(3);
        expect(row.fluent_days).toBeGreaterThanOrEqual(2);
      }
      expect(masteredSeenInResults.length).toBeGreaterThan(0);
    });

    it('a single day of perfect fluent answers never masters a fact', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      for (let run = 0; run < 3; run++) {
        await playSession(player, { beforeAnswer: () => h.clock.advance(1_000) });
      }
      expect(await countRows(h, 'skill_mastery', 'player_id = $1 and mastered_at is not null', [playerId])).toBe(0);
      const rows = await sql<{ fluent_days: number }>(h, 'select fluent_days from skill_mastery where player_id = $1', [playerId]);
      expect(rows.every((row) => row.fluent_days === 1)).toBe(true);
    });

    it('a miss un-masters a mastered fact and sends it back to review immediately', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      // Test fixture: ten facts mastered a while ago whose review is now due. (Reaching this
      // state by play is covered above; here we start from it to test the transition itself.)
      const keys = ['2x2', '2x3', '2x4', '2x5', '2x6', '2x7', '2x8', '2x9', '3x3', '3x4'].map((k) => `mul:${k}`);
      const longAgo = new Date(h.clock.now().getTime() - 40 * 86_400_000);
      const dueYesterday = new Date(h.clock.now().getTime() - 86_400_000);
      for (const key of keys) {
        await sql(
          h,
          `insert into skill_mastery (player_id, skill_key, box, streak, attempts, correct_count, fluent_days, last_fluent_day, last_attempt_at, next_review_at, mastered_at)
           values ($1, $2, 5, 6, 6, 6, 3, '2026-09-01', $3, $4, $3)`,
          [playerId, key, longAgo, dueYesterday],
        );
      }

      const { sessionId } = await playSession(player, { decide: wrongChoice });
      const asked = (
        await sql<{ skill_key: string }>(h, 'select skill_key from served_questions where play_session_id = $1', [sessionId])
      ).map((row) => row.skill_key);
      // Due reviews come first. Retries of misses take up to three of the ten slots.
      const reviewed = keys.filter((key) => asked.includes(key));
      expect(reviewed.length).toBeGreaterThanOrEqual(7);
      const rows = await sql<Record<string, any>>(
        h,
        'select skill_key, box, streak, mastered_at from skill_mastery where player_id = $1 and skill_key = any($2)',
        [playerId, keys],
      );
      expect(rows).toHaveLength(10);
      for (const row of rows) {
        if (asked.includes(row.skill_key)) {
          expect(row.streak).toBe(0);
          expect(row.box).toBeLessThanOrEqual(4); // a miss drops at least one box
          expect(row.mastered_at).toBeNull(); // and un-masters
        } else {
          expect(row).toMatchObject({ box: 5, mastered_at: expect.any(Date) }); // untouched
        }
      }
    });
  });

  describe('health and readiness with the database wired in', () => {
    it('/health and /ready answer', async () => {
      expect((await h.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
      const ready = await h.app.inject({ method: 'GET', url: '/ready' });
      expect(ready.statusCode).toBe(200);
      expect(ready.json()).toEqual({ status: 'ready', checks: { database: 'ok' } });
    });
  });
});
