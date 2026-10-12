import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  HAS_DB,
  PATHS,
  START_BODY,
  answer,
  correctChoice,
  countRows,
  freshAttemptId,
  issue,
  makeHarness,
  newPlayer,
  playerIdOf,
  playSession,
  sql,
  startSession,
  type Harness,
} from './support/harness';

describe.skipIf(!HAS_DB)('idempotency and concurrency', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  const ledger = async (playerId: string) => ({
    xp: await countRows(h, 'xp_events', 'player_id = $1', [playerId]),
    coins: await countRows(h, 'wallet_transactions', 'player_id = $1', [playerId]),
  });

  describe('sequential retries', () => {
    it('submitting the same attempt twice cannot generate duplicate rewards', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const sessionId = await startSession(player);
      const question = await issue(player, sessionId);
      const attemptId = freshAttemptId();

      const first = await answer(player, sessionId, question, correctChoice(question), attemptId);
      const afterFirst = await ledger(playerId);
      const totalsAfterFirst = (await player.request('GET', PATHS.me)).body.totals;
      expect(first.status).toBe(200);
      expect(first.body.replayed).toBe(false);
      expect(first.body.rewards).toEqual([
        { kind: 'xp', amount: 10, reason: 'correct_answer' },
        { kind: 'coins', amount: 2, reason: 'correct_answer' },
      ]);

      for (let i = 0; i < 5; i++) {
        const again = await answer(player, sessionId, question, correctChoice(question), attemptId);
        expect(again.status).toBe(200);
        expect(again.body.replayed).toBe(true);
        // The committed outcome is returned, with the same rewards, and nothing new is awarded.
        expect(again.body.correct).toBe(first.body.correct);
        expect(again.body.responseMs).toBe(first.body.responseMs);
        expect(again.body.rewards).toEqual(first.body.rewards);
        expect(again.body.totals).toEqual(totalsAfterFirst);
      }
      expect(await ledger(playerId)).toEqual(afterFirst);
      expect(await countRows(h, 'attempts', 'player_id = $1', [playerId])).toBe(1);
      const [mastery] = await sql<{ attempts: number }>(h, 'select attempts from skill_mastery where player_id = $1', [playerId]);
      expect(mastery?.attempts).toBe(1); // one mastery transition, not six
    });

    it('reusing an attempt id for a different question or response is a conflict, not a replay', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const sessionId = await startSession(player);
      const q1 = await issue(player, sessionId);
      const attemptId = freshAttemptId();
      await answer(player, sessionId, q1, correctChoice(q1), attemptId);
      const q2 = await issue(player, sessionId);

      const differentQuestion = await answer(player, sessionId, q2, correctChoice(q2), attemptId);
      expect(differentQuestion.status).toBe(409);
      expect(differentQuestion.body.error.code).toBe('idempotency_key_conflict');
      const differentResponse = await answer(
        player,
        sessionId,
        q1,
        q1.choices.find((c) => c !== correctChoice(q1)) as number,
        attemptId,
      );
      expect(differentResponse.status).toBe(409);
      expect(await countRows(h, 'attempts', 'player_id = $1', [playerId])).toBe(1);
      // The unanswered question is untouched and still answerable.
      expect((await answer(player, sessionId, q2, correctChoice(q2))).status).toBe(200);
    });

    it('a retry of the FINAL answer after the session completed replays it and awards nothing', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const sessionId = await startSession(player);
      let lastAttemptId = '';
      let lastQuestion;
      let lastResult;
      for (let i = 0; i < 10; i++) {
        lastQuestion = await issue(player, sessionId);
        lastAttemptId = freshAttemptId();
        lastResult = await answer(player, sessionId, lastQuestion, correctChoice(lastQuestion), lastAttemptId);
      }
      expect(lastResult?.body.session.status).toBe('completed');
      const before = await ledger(playerId);
      const totals = (await player.request('GET', PATHS.me)).body.totals;

      const retry = await answer(player, sessionId, lastQuestion!, correctChoice(lastQuestion!), lastAttemptId);
      expect(retry.status).toBe(200);
      expect(retry.body.replayed).toBe(true);
      expect(retry.body.session.status).toBe('completed');
      // Includes the completion bonus the original response reported.
      expect(retry.body.rewards).toEqual(lastResult?.body.rewards);
      expect(await ledger(playerId)).toEqual(before);
      expect((await player.request('GET', PATHS.me)).body.totals).toEqual(totals);
    });
  });

  describe('simultaneous requests (database transaction)', () => {
    it('two answer POSTs with the same attempt id commit once: one attempt, one mastery transition, one reward set', async () => {
      // Repeat to give a race a real chance to show itself.
      for (let round = 0; round < 12; round++) {
        const player = await newPlayer(h);
        const playerId = await playerIdOf(player);
        const sessionId = await startSession(player);
        const question = await issue(player, sessionId);
        const attemptId = freshAttemptId();

        const results = await Promise.all([
          answer(player, sessionId, question, correctChoice(question), attemptId),
          answer(player, sessionId, question, correctChoice(question), attemptId),
        ]);

        expect(results.map((r) => r.status)).toEqual([200, 200]);
        expect(results.filter((r) => r.body.replayed === false)).toHaveLength(1);
        expect(results.filter((r) => r.body.replayed === true)).toHaveLength(1);
        // Both callers see the same committed outcome.
        expect(results[0]?.body.rewards).toEqual(results[1]?.body.rewards);
        expect(results[0]?.body.totals).toEqual({ xp: 10, coins: 2 });

        expect(await countRows(h, 'attempts', 'player_id = $1', [playerId])).toBe(1);
        expect(await ledger(playerId)).toEqual({ xp: 1, coins: 1 });
        const mastery = await sql<{ attempts: number; box: number; streak: number }>(
          h,
          'select attempts, box, streak from skill_mastery where player_id = $1',
          [playerId],
        );
        expect(mastery).toHaveLength(1);
        expect(mastery[0]?.attempts).toBe(1);
        const [session] = await sql<{ answered_count: number; correct_count: number }>(
          h,
          'select answered_count, correct_count from play_sessions where id = $1',
          [sessionId],
        );
        expect(session).toEqual({ answered_count: 1, correct_count: 1 });
      }
    });

    it('many simultaneous duplicates (a frantic double tap) still commit once', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const sessionId = await startSession(player);
      const question = await issue(player, sessionId);
      const attemptId = freshAttemptId();

      const results = await Promise.all(
        Array.from({ length: 12 }, () => answer(player, sessionId, question, correctChoice(question), attemptId)),
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(results.filter((r) => !r.body.replayed)).toHaveLength(1);
      expect(await countRows(h, 'attempts', 'player_id = $1', [playerId])).toBe(1);
      expect(await ledger(playerId)).toEqual({ xp: 1, coins: 1 });
    });

    it('simultaneous answers with DIFFERENT attempt ids for one question: one wins, the rest conflict, one reward set', async () => {
      for (let round = 0; round < 8; round++) {
        const player = await newPlayer(h);
        const playerId = await playerIdOf(player);
        const sessionId = await startSession(player);
        const question = await issue(player, sessionId);

        const results = await Promise.all(
          Array.from({ length: 5 }, () => answer(player, sessionId, question, correctChoice(question))),
        );
        const statuses = results.map((r) => r.status).sort();
        expect(statuses).toEqual([200, 409, 409, 409, 409]);
        expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'question_already_answered')).toBe(true);
        expect(await countRows(h, 'attempts', 'player_id = $1', [playerId])).toBe(1);
        expect(await ledger(playerId)).toEqual({ xp: 1, coins: 1 });
        const [mastery] = await sql<{ attempts: number }>(h, 'select attempts from skill_mastery where player_id = $1', [playerId]);
        expect(mastery?.attempts).toBe(1);
      }
    });

    it('simultaneous answers cannot overshoot the session length', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const sessionId = await startSession(player);
      // Answer 9, then race five duplicates of the 10th (different keys) plus a request for an 11th.
      for (let i = 0; i < 9; i++) {
        const q = await issue(player, sessionId);
        await answer(player, sessionId, q, correctChoice(q));
      }
      const last = await issue(player, sessionId);
      const results = await Promise.all([
        ...Array.from({ length: 4 }, () => answer(player, sessionId, last, correctChoice(last))),
        player.request('POST', PATHS.question(sessionId), {}),
      ]);
      expect(results.filter((r) => r.status === 200 && r.body.correct !== undefined)).toHaveLength(1);
      expect(await countRows(h, 'attempts', 'player_id = $1', [playerId])).toBe(10);
      const [session] = await sql<{ status: string; answered_count: number }>(
        h,
        'select status, answered_count from play_sessions where id = $1',
        [sessionId],
      );
      expect(session).toEqual({ status: 'completed', answered_count: 10 });
      // 10 correct answers + exactly one completion bonus.
      expect(await ledger(playerId)).toEqual({ xp: 11, coins: 11 });
      expect((await player.request('GET', PATHS.me)).body.totals).toEqual({ xp: 125, coins: 30 });
    });

    it('simultaneous start requests create exactly one active session', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const results = await Promise.all(
        Array.from({ length: 6 }, () => player.request('POST', PATHS.sessions, START_BODY)),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 200)).toHaveLength(5);
      expect(new Set(results.map((r) => r.body.session.id)).size).toBe(1);
      expect(await countRows(h, 'play_sessions', "player_id = $1 and status = 'active'", [playerId])).toBe(1);
    });

    it('simultaneous question requests issue exactly one question', async () => {
      const player = await newPlayer(h);
      const sessionId = await startSession(player);
      const results = await Promise.all(
        Array.from({ length: 8 }, () => player.request('POST', PATHS.question(sessionId), {})),
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(new Set(results.map((r) => r.body.question.id)).size).toBe(1);
      expect(await countRows(h, 'served_questions', 'play_session_id = $1', [sessionId])).toBe(1);
    });

    it('independent players answering at the same time do not interfere', async () => {
      const players = await Promise.all(Array.from({ length: 6 }, () => newPlayer(h)));
      const runs = await Promise.all(players.map((p) => playSession(p)));
      for (const [index, player] of players.entries()) {
        const totals = (await player.request('GET', PATHS.me)).body.totals;
        expect(totals).toEqual({ xp: 125, coins: 30 });
        expect(runs[index]?.answers.every((a) => a.status === 200)).toBe(true);
      }
    });
  });
});
