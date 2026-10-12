import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  HAS_DB,
  answer,
  correctChoice,
  issue,
  makeHarness,
  newPlayer,
  playerIdOf,
  sql,
  startSession,
  type Harness,
} from './support/harness';

/**
 * The database itself enforces the important invariants, independent of application code.
 * These tests go around the API and try to break them with raw SQL.
 */
describe.skipIf(!HAS_DB)('database-level guarantees', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  async function answeredQuestion() {
    const player = await newPlayer(h);
    const playerId = await playerIdOf(player);
    const sessionId = await startSession(player);
    const question = await issue(player, sessionId);
    await answer(player, sessionId, question, correctChoice(question));
    const [attempt] = await sql<{ id: string }>(h, 'select id from attempts where served_question_id = $1', [question.id]);
    return { player, playerId, sessionId, question, attemptId: attempt?.id as string };
  }

  const insertAttempt = (v: { question: string; session: string; player: string; key: string }) =>
    sql(
      h,
      `insert into attempts (served_question_id, play_session_id, player_id, idempotency_key, submitted_response, correct, fluent, response_ms)
       values ($1, $2, $3, $4, 1, false, false, 10)`,
      [v.question, v.session, v.player, v.key],
    );

  it('a served question can have only ONE attempt row, whatever the idempotency key', async () => {
    const a = await answeredQuestion();
    await expect(
      insertAttempt({ question: a.question.id, session: a.sessionId, player: a.playerId, key: 'another-key-0001' }),
    ).rejects.toThrow(/attempts_served_question_uq/);
  });

  it('the same (player, idempotency key) cannot be recorded twice', async () => {
    const a = await answeredQuestion();
    const [row] = await sql<{ idempotency_key: string }>(h, 'select idempotency_key from attempts where id = $1', [a.attemptId]);
    const next = await issue(a.player, a.sessionId);
    await expect(
      insertAttempt({ question: next.id, session: a.sessionId, player: a.playerId, key: row?.idempotency_key as string }),
    ).rejects.toThrow(/attempts_player_idempotency_uq/);
  });

  it('an attempt cannot attach a question to a session it does not belong to, or to another player', async () => {
    const a = await answeredQuestion();
    const other = await newPlayer(h);
    const otherId = await playerIdOf(other);
    const otherSession = await startSession(other);
    const otherQuestion = await issue(other, otherSession);
    // Question from A's session claimed under B's session.
    await expect(
      insertAttempt({ question: otherQuestion.id, session: a.sessionId, player: a.playerId, key: 'mismatch-0001' }),
    ).rejects.toThrow(/attempts_question_session_fk/);
    // B's question and session, but claimed by A.
    await expect(
      insertAttempt({ question: otherQuestion.id, session: otherSession, player: a.playerId, key: 'mismatch-0002' }),
    ).rejects.toThrow(/attempts_session_player_fk/);
    expect(otherId).not.toBe(a.playerId);
  });

  it('attempts are immutable: UPDATE and DELETE are refused', async () => {
    const a = await answeredQuestion();
    await expect(sql(h, 'update attempts set correct = not correct where id = $1', [a.attemptId])).rejects.toThrow(/append-only/);
    await expect(sql(h, 'delete from attempts where id = $1', [a.attemptId])).rejects.toThrow(/append-only/);
  });

  it('ledger rows are append-only and unique per source event', async () => {
    const a = await answeredQuestion();
    const [xp] = await sql<{ id: string; source_id: string; reason: string; idempotency_key: string }>(
      h,
      'select id, source_id, reason, idempotency_key from xp_events where player_id = $1',
      [a.playerId],
    );
    const [coin] = await sql<{ id: string }>(h, 'select id from wallet_transactions where player_id = $1', [a.playerId]);
    await expect(sql(h, 'update xp_events set amount = 1000000 where id = $1', [xp?.id])).rejects.toThrow(/append-only/);
    await expect(sql(h, 'delete from xp_events where id = $1', [xp?.id])).rejects.toThrow(/append-only/);
    await expect(sql(h, 'update wallet_transactions set amount = 1000000 where id = $1', [coin?.id])).rejects.toThrow(/append-only/);
    await expect(sql(h, 'delete from wallet_transactions where id = $1', [coin?.id])).rejects.toThrow(/append-only/);

    // The same gameplay event cannot be rewarded twice, even with a different idempotency key.
    await expect(
      sql(
        h,
        `insert into xp_events (player_id, amount, reason, source_type, source_id, idempotency_key)
         values ($1, 10, $2, 'attempt', $3, 'a-different-key')`,
        [a.playerId, xp?.reason, xp?.source_id],
      ),
    ).rejects.toThrow(/xp_events_source_uq/);
    // ...and not with the same key either.
    await expect(
      sql(
        h,
        `insert into xp_events (player_id, amount, reason, source_type, source_id, idempotency_key)
         values ($1, 10, 'bonus', 'attempt', $2, $3)`,
        [a.playerId, randomUUID(), xp?.idempotency_key],
      ),
    ).rejects.toThrow(/xp_events_idempotency_uq/);
    // XP can only grow; coins can never be a zero-amount row.
    await expect(
      sql(
        h,
        `insert into xp_events (player_id, amount, reason, source_type, source_id, idempotency_key)
         values ($1, -5, 'x', 'attempt', $2, 'negative-xp')`,
        [a.playerId, randomUUID()],
      ),
    ).rejects.toThrow(/xp_events_amount_ck/);
    await expect(
      sql(
        h,
        `insert into wallet_transactions (player_id, currency, amount, reason, source_type, source_id, idempotency_key)
         values ($1, 'gems', 5, 'x', 'attempt', $2, 'wrong-currency')`,
        [a.playerId, randomUUID()],
      ),
    ).rejects.toThrow(/wallet_transactions_currency_ck/);
  });

  it('a served question is frozen: served_at and the answer key cannot be rewritten, and it can be answered once', async () => {
    const player = await newPlayer(h);
    const sessionId = await startSession(player);
    const question = await issue(player, sessionId);
    await expect(
      sql(h, "update served_questions set served_at = served_at + interval '1 hour' where id = $1", [question.id]),
    ).rejects.toThrow(/frozen/);
    await expect(
      sql(h, `update served_questions set private_grading_data = '{"skillKey":"mul:2x2","correctAnswer":0}' where id = $1`, [question.id]),
    ).rejects.toThrow(/frozen/);
    await answer(player, sessionId, question, correctChoice(question));
    await expect(
      sql(h, "update served_questions set answered_at = answered_at + interval '1 second' where id = $1", [question.id]),
    ).rejects.toThrow(/only be marked answered once/);
    await expect(sql(h, 'update served_questions set answered_at = null where id = $1', [question.id])).rejects.toThrow(/answered once/);
  });

  it('a session can never have two outstanding questions or two active sessions per game', async () => {
    const player = await newPlayer(h);
    const playerId = await playerIdOf(player);
    const sessionId = await startSession(player);
    const question = await issue(player, sessionId);
    await expect(
      sql(
        h,
        `insert into served_questions (play_session_id, sequence, skill_key, selection_reason, public_payload, private_grading_data, served_at)
         values ($1, 2, 'mul:2x3', 'new', '{}', '{}', now())`,
        [sessionId],
      ),
    ).rejects.toThrow(/served_questions_one_open_uq/);
    await expect(
      sql(
        h,
        `insert into play_sessions (player_id, game_id, mode, seed, total_questions, expires_at)
         values ($1, 'zoo-sprint', 'multiplication', 's', 10, now() + interval '1 hour')`,
        [playerId],
      ),
    ).rejects.toThrow(/play_sessions_one_active_uq/);
    expect(question.sequence).toBe(1);
  });

  it('a session row cannot claim more progress than its length, or be completed without a time', async () => {
    const player = await newPlayer(h);
    const sessionId = await startSession(player);
    await expect(sql(h, 'update play_sessions set answered_count = 11 where id = $1', [sessionId])).rejects.toThrow(/play_sessions_progress_ck/);
    await expect(sql(h, "update play_sessions set status = 'completed' where id = $1", [sessionId])).rejects.toThrow(/play_sessions_completed_ck/);
  });

  it('mastery rows are bounded (box 0..5) and keyed per player and skill', async () => {
    const a = await answeredQuestion();
    await expect(sql(h, 'update skill_mastery set box = 9 where player_id = $1', [a.playerId])).rejects.toThrow(/skill_mastery_box_ck/);
  });
});
