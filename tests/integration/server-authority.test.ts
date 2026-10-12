import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  HAS_DB,
  PATHS,
  START_BODY,
  TestBrowser,
  allKeys,
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
  wrongChoice,
  type Harness,
} from './support/harness';

describe.skipIf(!HAS_DB)('server authority', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  const ledgerRows = async (playerId: string) =>
    (await countRows(h, 'xp_events', 'player_id = $1', [playerId])) +
    (await countRows(h, 'wallet_transactions', 'player_id = $1', [playerId]));

  // -------------------------------------------------------------------------
  describe('question authority', () => {
    it('a random or nonexistent question id cannot be graded', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const sessionId = await startSession(player);
      await issue(player, sessionId);

      const res = await player.request('POST', PATHS.answers(sessionId), {
        attemptId: freshAttemptId(),
        questionId: '11111111-1111-4111-8111-111111111111',
        response: 4,
      });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
      expect(await countRows(h, 'attempts', 'player_id = $1', [playerId])).toBe(0);
      expect(await ledgerRows(playerId)).toBe(0);
      expect(await countRows(h, 'skill_mastery', 'player_id = $1', [playerId])).toBe(0);
    });

    it('a question that was never issued (not served) cannot be graded', async () => {
      const player = await newPlayer(h);
      const sessionId = await startSession(player); // session exists, but no question issued yet
      const res = await player.request('POST', PATHS.answers(sessionId), {
        attemptId: freshAttemptId(),
        questionId: '22222222-2222-4222-8222-222222222222',
        response: 4,
      });
      expect(res.status).toBe(404);
    });

    it('requires a guest identity', async () => {
      const stranger = new TestBrowser(h.app, h.ctx.cookie.name);
      const res = await stranger.request('POST', PATHS.answers('33333333-3333-4333-8333-333333333333'), {
        attemptId: freshAttemptId(),
        questionId: '33333333-3333-4333-8333-333333333333',
        response: 4,
      });
      expect(res.status).toBe(401);
      expect((await stranger.request('POST', PATHS.sessions, START_BODY)).status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  describe('ownership', () => {
    it("player A cannot answer player B's question, in either session", async () => {
      const a = await newPlayer(h);
      const b = await newPlayer(h);
      const aId = await playerIdOf(a);
      const bId = await playerIdOf(b);
      const aSession = await startSession(a);
      const bSession = await startSession(b);
      const aQuestion = await issue(a, aSession);
      await issue(b, bSession);

      // B submits A's question to A's session (not B's), and to B's own session.
      const toTheirSession = await answer(b, aSession, aQuestion, correctChoice(aQuestion));
      const toOwnSession = await answer(b, bSession, aQuestion, correctChoice(aQuestion));
      expect(toTheirSession.status).toBe(404);
      expect(toOwnSession.status).toBe(404);
      // Same answer as "does not exist": the API does not reveal that A's session exists.
      expect(toTheirSession.body).toEqual(toOwnSession.body);

      expect(await countRows(h, 'attempts', 'player_id in ($1, $2)', [aId, bId])).toBe(0);
      expect(await ledgerRows(aId)).toBe(0);
      expect(await ledgerRows(bId)).toBe(0);
      const [row] = await sql<{ answered_at: unknown }>(h, 'select answered_at from served_questions where id = $1', [aQuestion.id]);
      expect(row?.answered_at).toBeNull();

      // B cannot read A's session either.
      expect((await b.request('GET', PATHS.session(aSession))).status).toBe(404);
      expect((await b.request('POST', PATHS.question(aSession), {})).status).toBe(404);

      // A can still answer their own question normally.
      expect((await answer(a, aSession, aQuestion, correctChoice(aQuestion))).status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  describe('one grade per question', () => {
    it('a served question cannot receive a second final grade', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const sessionId = await startSession(player);
      const question = await issue(player, sessionId);

      const first = await answer(player, sessionId, question, correctChoice(question));
      expect(first.status).toBe(200);
      const ledgerAfterFirst = await ledgerRows(playerId);

      // Different attempt id, even a "better" answer: refused, nothing awarded.
      const second = await answer(player, sessionId, question, wrongChoice(question));
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('question_already_answered');
      expect(await countRows(h, 'attempts', 'served_question_id = $1', [question.id])).toBe(1);
      expect(await ledgerRows(playerId)).toBe(ledgerAfterFirst);
    });

    it('rejects an alternate idempotency key for an already-answered question without rewards', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const sessionId = await startSession(player);
      const question = await issue(player, sessionId);
      await answer(player, sessionId, question, correctChoice(question), 'first-key-0001');
      const before = await ledgerRows(playerId);
      for (const key of ['second-key-0002', 'third-key-0003', 'fourth-key-0004']) {
        const res = await answer(player, sessionId, question, correctChoice(question), key);
        expect(res.status).toBe(409);
      }
      expect(await ledgerRows(playerId)).toBe(before);
      expect(await countRows(h, 'attempts', 'player_id = $1', [playerId])).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('currency, XP and mastery authority', () => {
    it('no request type accepts xp, coins, mastery, correctness, or timing: extra fields are rejected', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const sessionId = await startSession(player);
      const question = await issue(player, sessionId);

      const forbidden: Record<string, unknown>[] = [
        { xp: 999999 },
        { coins: 999999 },
        { currency: 'coins', amount: 5000 },
        { inventory: ['everything'] },
        { mastery: { box: 5, mastered: true } },
        { box: 5 },
        { correct: true },
        { fluent: true },
        { responseMs: 1 },
        { elapsedMs: 1 },
        { correctAnswer: 56 },
      ];
      for (const extra of forbidden) {
        const res = await player.request('POST', PATHS.answers(sessionId), {
          attemptId: freshAttemptId(),
          questionId: question.id,
          response: wrongChoice(question),
          ...extra,
        });
        expect(res.status, JSON.stringify(extra)).toBe(400);
        expect(res.body.error.code).toBe('invalid_request');
      }
      for (const extra of forbidden) {
        expect((await player.request('POST', PATHS.sessions, { ...START_BODY, ...extra })).status).toBe(400);
        expect((await player.request('POST', PATHS.guest, extra)).status).toBe(400);
        expect((await player.request('POST', PATHS.question(sessionId), extra)).status).toBe(400);
      }

      // Nothing changed.
      expect(await countRows(h, 'attempts', 'player_id = $1', [playerId])).toBe(0);
      expect(await ledgerRows(playerId)).toBe(0);
      expect(await countRows(h, 'skill_mastery', 'player_id = $1', [playerId])).toBe(0);
      const me = await player.request('GET', PATHS.me);
      expect(me.body.totals).toEqual({ xp: 0, coins: 0 });
    });

    it('query strings and headers cannot set state either', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const sessionId = await startSession(player);
      const question = await issue(player, sessionId);
      const res = await player.request(
        'POST',
        `${PATHS.answers(sessionId)}?xp=5000&coins=5000&correct=true&responseMs=1`,
        { attemptId: freshAttemptId(), questionId: question.id, response: wrongChoice(question) },
        { 'x-coins': '5000', 'x-xp': '5000' },
      );
      expect(res.status).toBe(200);
      expect(res.body.correct).toBe(false);
      expect(res.body.rewards).toEqual([]);
      expect(await ledgerRows(playerId)).toBe(0);
    });

    it('there is no endpoint that writes progress: write verbs on progress-like paths do not exist', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const paths = [
        '/api/v1/me',
        '/api/v1/wallet',
        '/api/v1/xp',
        '/api/v1/coins',
        '/api/v1/mastery',
        '/api/v1/progress',
        '/api/v1/inventory',
        '/api/v1/players',
        `/api/v1/players/${playerId}`,
      ];
      for (const path of paths) {
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
          const res = await h.app.inject({
            method,
            url: path,
            headers: { cookie: `${h.ctx.cookie.name}=${player.cookie}`, 'content-type': 'application/json' },
            payload: JSON.stringify({ xp: 1_000_000, coins: 1_000_000 }),
          });
          expect([404, 405], `${method} ${path}`).toContain(res.statusCode);
        }
      }
      expect((await player.request('GET', PATHS.me)).body.totals).toEqual({ xp: 0, coins: 0 });
    });

    it('rejects values that are not strict integers or are not offered', async () => {
      const player = await newPlayer(h);
      const sessionId = await startSession(player);
      const question = await issue(player, sessionId);
      const base = { attemptId: freshAttemptId(), questionId: question.id };
      // Strings are not coerced into numbers.
      expect((await player.request('POST', PATHS.answers(sessionId), { ...base, response: String(correctChoice(question)) })).status).toBe(400);
      expect((await player.request('POST', PATHS.answers(sessionId), { ...base, response: 56.5 })).status).toBe(400);
      expect((await player.request('POST', PATHS.answers(sessionId), { ...base, response: -4 })).status).toBe(400);
      expect((await player.request('POST', PATHS.answers(sessionId), { ...base, response: null })).status).toBe(400);
      expect((await player.request('POST', PATHS.answers(sessionId), { ...base, attemptId: 'bad id!' })).status).toBe(400);
      expect((await player.request('POST', PATHS.answers(sessionId), { ...base, questionId: 'not-a-uuid', response: 4 })).status).toBe(400);

      // A number that is valid but was never offered is rejected WITHOUT consuming the question.
      const notOffered = [...Array(200).keys()].find((n) => !question.choices.includes(n)) as number;
      const rejected = await player.request('POST', PATHS.answers(sessionId), { ...base, response: notOffered });
      expect(rejected.status).toBe(422);
      expect(rejected.body.error.code).toBe('invalid_response');
      expect(await countRows(h, 'attempts', 'served_question_id = $1', [question.id])).toBe(0);
      expect((await answer(player, sessionId, question, correctChoice(question))).status).toBe(200);
    });

    it('validation errors never echo what the client sent', async () => {
      const player = await newPlayer(h);
      const sessionId = await startSession(player);
      const marker = 'SECRET-MARKER-12345';
      const res = await player.request('POST', PATHS.answers(sessionId), {
        attemptId: marker,
        questionId: marker,
        response: marker,
        [marker]: marker,
      });
      expect(res.status).toBe(400);
      expect(res.raw).not.toContain(marker);
      expect(res.body).toEqual({ error: { code: 'invalid_request', message: 'The request was not valid.' } });
    });

    it('rejects oversized bodies and non-JSON bodies', async () => {
      const player = await newPlayer(h);
      const sessionId = await startSession(player);
      const big = await h.app.inject({
        method: 'POST',
        url: PATHS.answers(sessionId),
        headers: { cookie: `${h.ctx.cookie.name}=${player.cookie}`, 'content-type': 'application/json' },
        payload: JSON.stringify({ attemptId: 'x'.repeat(40_000) }),
      });
      expect(big.statusCode).toBe(413);
      const text = await h.app.inject({
        method: 'POST',
        url: PATHS.answers(sessionId),
        headers: { cookie: `${h.ctx.cookie.name}=${player.cookie}`, 'content-type': 'text/plain' },
        payload: 'attemptId=1',
      });
      expect([400, 415]).toContain(text.statusCode); // never accepted as a request body
    });
  });

  // -------------------------------------------------------------------------
  describe('answer secrecy', () => {
    const FORBIDDEN_KEYS = [
      'correctAnswer',
      'correctChoiceId',
      'answerKey',
      'gradingData',
      'privateGradingData',
      'private_grading_data',
      'answer',
      'isCorrect',
      'solution',
      'product',
    ];

    it('no pre-answer response contains the correct answer or any private grading key', async () => {
      const player = await newPlayer(h);
      const guest = await player.request('POST', PATHS.guest, {});
      const started = await player.request('POST', PATHS.sessions, START_BODY);
      const sessionId = started.body.session.id as string;
      const issued = await player.request('POST', PATHS.question(sessionId), {});
      const issuedAgain = await player.request('POST', PATHS.question(sessionId), {}); // restore
      const fetched = await player.request('GET', PATHS.session(sessionId));
      const me = await player.request('GET', PATHS.me);
      const resumed = await player.request('POST', PATHS.sessions, START_BODY);

      for (const res of [guest, started, issued, issuedAgain, fetched, me, resumed]) {
        const keys = allKeys(res.body);
        for (const forbidden of FORBIDDEN_KEYS) {
          expect(keys.has(forbidden), `${forbidden} in ${res.raw}`).toBe(false);
        }
        expect(res.raw).not.toMatch(/grading/i);
      }

      // The public question has exactly the documented keys.
      expect(Object.keys(issued.body.question).sort()).toEqual(['choices', 'id', 'prompt', 'sequence', 'type']);
      expect(issued.body.question.type).toBe('multipleChoice');
      expect(issued.body.question.choices).toHaveLength(4);
      // And the database copy of what was sent holds no key either.
      const [row] = await sql<{ public_payload: Record<string, unknown> }>(
        h,
        'select public_payload from served_questions where id = $1',
        [issued.body.question.id],
      );
      expect(Object.keys(row?.public_payload ?? {}).sort()).toEqual(['choices', 'id', 'prompt', 'sequence', 'type']);
    });

    it('the correct answer appears only in the result of grading the question', async () => {
      const player = await newPlayer(h);
      const sessionId = await startSession(player);
      const question = await issue(player, sessionId);
      const res = await answer(player, sessionId, question, wrongChoice(question));
      expect(res.body.correctAnswer).toBe(correctChoice(question));
      // The next question, once issued, still carries no key.
      const next = await player.request('POST', PATHS.question(sessionId), {});
      expect(allKeys(next.body).has('correctAnswer')).toBe(false);
    });

    it('keeps the answer position unpredictable (not always the same slot)', async () => {
      const player = await newPlayer(h);
      const slots = new Set<number>();
      for (let run = 0; run < 3; run++) {
        const { questions } = await playSession(player);
        for (const q of questions) slots.add(q.choices.indexOf(correctChoice(q)));
        h.clock.advanceDays(1);
      }
      expect(slots.size).toBeGreaterThanOrEqual(3);
    });
  });

  // -------------------------------------------------------------------------
  describe('origin check (CSRF defense in depth)', () => {
    it('refuses a state-changing request from a foreign origin, allows same-origin and no origin', async () => {
      const player = await newPlayer(h);
      const foreign = await player.request('POST', PATHS.sessions, START_BODY, { origin: 'https://evil.example' });
      expect(foreign.status).toBe(403);
      expect(foreign.body.error.code).toBe('forbidden_origin');

      const sameOrigin = await player.request('POST', PATHS.sessions, START_BODY, {
        origin: 'http://localhost:5173',
        host: 'localhost:5173',
      });
      expect(sameOrigin.status).toBeLessThan(300);

      expect((await player.request('POST', PATHS.sessions, START_BODY)).status).toBeLessThan(300);
      // Reads are not state-changing.
      expect((await player.request('GET', PATHS.me, undefined, { origin: 'https://evil.example' })).status).toBe(200);
    });

    it('honors an explicit allow-list', async () => {
      const allowing = await makeHarness({ allowedOrigins: ['https://play.example.com'] });
      try {
        const res = await allowing.app.inject({
          method: 'POST',
          url: PATHS.guest,
          headers: { origin: 'https://play.example.com', 'content-type': 'application/json' },
          payload: '{}',
        });
        expect(res.statusCode).toBe(200);
      } finally {
        await allowing.close();
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('session completion', () => {
    it('a completed session cannot continue minting rewards', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const { sessionId, questions } = await playSession(player);

      const done = await player.request('GET', PATHS.session(sessionId));
      expect(done.body.session.status).toBe('completed');
      const ledgerBefore = await ledgerRows(playerId);
      const totalsBefore = (await player.request('GET', PATHS.me)).body.totals;

      // No more questions...
      const more = await player.request('POST', PATHS.question(sessionId), {});
      expect(more.status).toBe(409);
      expect(more.body.error.code).toBe('session_not_active');
      // ...and answers to old questions with new keys mint nothing.
      for (const q of questions) {
        const res = await answer(player, sessionId, q, correctChoice(q));
        expect(res.status).toBe(409);
      }
      // A made-up question id on the completed session is simply not found.
      const fake = await player.request('POST', PATHS.answers(sessionId), {
        attemptId: freshAttemptId(),
        questionId: '44444444-4444-4444-8444-444444444444',
        response: 4,
      });
      expect([404, 409]).toContain(fake.status);

      expect(await ledgerRows(playerId)).toBe(ledgerBefore);
      expect((await player.request('GET', PATHS.me)).body.totals).toEqual(totalsBefore);
      expect(await countRows(h, 'attempts', 'player_id = $1', [playerId])).toBe(10);
    });

    it('an expired session cannot be answered or continued', async () => {
      const player = await newPlayer(h);
      const playerId = await playerIdOf(player);
      const sessionId = await startSession(player);
      const question = await issue(player, sessionId);

      h.clock.advance(3 * 60 * 60 * 1000); // past the 2-hour lifetime
      const late = await answer(player, sessionId, question, correctChoice(question));
      expect(late.status).toBe(409);
      expect(late.body.error.code).toBe('session_not_active');
      expect((await player.request('POST', PATHS.question(sessionId), {})).status).toBe(409);
      expect(await ledgerRows(playerId)).toBe(0);
      const [row] = await sql<{ status: string }>(h, 'select status from play_sessions where id = $1', [sessionId]);
      expect(row?.status).toBe('expired');

      // The player can start a fresh session afterwards.
      const fresh = await player.request('POST', PATHS.sessions, START_BODY);
      expect(fresh.status).toBe(201);
      expect(fresh.body.session.id).not.toBe(sessionId);
    });
  });
});
