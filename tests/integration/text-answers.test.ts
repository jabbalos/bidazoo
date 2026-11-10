import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '../../apps/api/src/http/errors';
import { getSession, gradeSubmitted, issueQuestion, submitAnswer } from '../../apps/api/src/modules/sessions/service';
import { publicQuestionOf, readPrivateGrading, type QuestionRow } from '../../apps/api/src/modules/sessions/views';
import {
  HAS_DB,
  PATHS,
  answer,
  correctChoice,
  countRows,
  freshAttemptId,
  issue,
  makeHarness,
  newPlayer,
  playerIdOf,
  sql,
  startSession,
  type Harness,
} from './support/harness';

// The request type is still number on this branch (Lane D widens it), so text responses go in
// through the service, with a cast. Over HTTP the route's schema still rejects them with 400.
type Body = Parameters<typeof submitAnswer>[3];
const textBody = (questionId: string, response: string, attemptId = freshAttemptId()): Body =>
  ({ attemptId, questionId, response }) as unknown as Body;

describe('gradeSubmitted (pure)', () => {
  it('grades number questions like gradeAnswer', () => {
    expect(gradeSubmitted([6, 7, 8], 7, 7)).toEqual({ kind: 'graded', correct: true });
    expect(gradeSubmitted([6, 7, 8], 7, 8)).toEqual({ kind: 'graded', correct: false });
    expect(gradeSubmitted([6, 7, 8], 7, 9)).toEqual({ kind: 'invalid' });
  });
  it('grades text questions by exact offered string', () => {
    expect(gradeSubmitted(['cat', 'dog'], 'cat', 'cat')).toEqual({ kind: 'graded', correct: true });
    expect(gradeSubmitted(['cat', 'dog'], 'cat', 'dog')).toEqual({ kind: 'graded', correct: false });
    expect(gradeSubmitted(['cat', 'dog'], 'cat', 'Cat')).toEqual({ kind: 'invalid' });
    expect(gradeSubmitted(['cat', 'dog'], 'cat', 'bird')).toEqual({ kind: 'invalid' });
  });
  it('rejects a response whose type does not match the question kind', () => {
    expect(gradeSubmitted([6, 7, 8], 7, '7')).toEqual({ kind: 'wrong_type' });
    expect(gradeSubmitted(['7', '8'], '7', 7)).toEqual({ kind: 'wrong_type' });
  });
});

describe('views: private grading and public question accept strings', () => {
  const row = (over: Partial<QuestionRow>): QuestionRow =>
    ({
      id: randomUUID(),
      sequence: 1,
      publicPayload: { prompt: 'Pick the animal', choices: ['cat', 'dog'], kind: 'text' },
      privateGradingData: { skillKey: 'text:animals', correctAnswer: 'cat' },
      ...over,
    }) as QuestionRow;

  it('readPrivateGrading accepts a string answer key and a number one', () => {
    expect(readPrivateGrading(row({})).correctAnswer).toBe('cat');
    expect(readPrivateGrading(row({ privateGradingData: { skillKey: 'k', correctAnswer: 56 } })).correctAnswer).toBe(56);
  });
  it('readPrivateGrading still refuses malformed keys', () => {
    const bad = [null, {}, { skillKey: 'k' }, { skillKey: 'k', correctAnswer: '' }, { skillKey: 'k', correctAnswer: 1.5 }, { skillKey: 'k', correctAnswer: {} }];
    for (const privateGradingData of bad) {
      expect(() => readPrivateGrading(row({ privateGradingData }))).toThrow();
    }
  });
  it('publicQuestionOf keeps kind and string choices and never carries the answer key', () => {
    const q = publicQuestionOf(row({})) as unknown as Record<string, unknown>;
    expect(q['kind']).toBe('text');
    expect(q['choices']).toEqual(['cat', 'dog']);
    expect(Object.keys(q).sort()).toEqual(['choices', 'id', 'kind', 'prompt', 'sequence', 'type']);
  });
  it('publicQuestionOf leaves number questions without a kind exactly as before', () => {
    const q = publicQuestionOf(row({ publicPayload: { prompt: '7 x 8', choices: [54, 56] } })) as unknown as Record<string, unknown>;
    expect(q['choices']).toEqual([54, 56]);
    expect('kind' in q).toBe(false);
  });
});

describe.skipIf(!HAS_DB)('text answers (real PostgreSQL)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  /** A session whose first question is a text question, inserted directly (issuing them is Lane D's). */
  async function textSession() {
    const player = await newPlayer(h);
    const playerId = await playerIdOf(player);
    const sessionId = await startSession(player);
    const questionId = randomUUID();
    await sql(
      h,
      `insert into served_questions (id, play_session_id, sequence, skill_key, selection_reason, public_payload, private_grading_data, served_at)
       values ($1, $2, 1, 'text:animals', 'new', $3, $4, $5)`,
      [
        questionId,
        sessionId,
        JSON.stringify({ id: questionId, sequence: 1, prompt: 'Pick the animal', type: 'multipleChoice', kind: 'text', choices: ['cat', 'chair', 'cloud'] }),
        JSON.stringify({ skillKey: 'text:animals', correctAnswer: 'cat' }),
        h.clock.now(),
      ],
    );
    return { player, playerId, sessionId, questionId };
  }

  it('attempts.submitted_response is a text column (migration 0006)', async () => {
    const [col] = await sql<{ data_type: string }>(
      h,
      "select data_type from information_schema.columns where table_name = 'attempts' and column_name = 'submitted_response'",
    );
    expect(col?.data_type).toBe('text');
  });

  it('a number answer over HTTP is stored as its string and grades as before', async () => {
    const player = await newPlayer(h);
    const sessionId = await startSession(player);
    const question = await issue(player, sessionId);
    const res = await answer(player, sessionId, question, correctChoice(question));
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
    expect(res.body.correctAnswer).toBe(correctChoice(question));
    const [row] = await sql<{ submitted_response: string }>(h, 'select submitted_response from attempts where served_question_id = $1', [question.id]);
    expect(row?.submitted_response).toBe(String(correctChoice(question)));
  });

  it('a retry of a number answer replays, and a different response on the same key is a 409', async () => {
    const player = await newPlayer(h);
    const sessionId = await startSession(player);
    const question = await issue(player, sessionId);
    const attemptId = freshAttemptId();
    const first = await answer(player, sessionId, question, correctChoice(question), attemptId);
    const second = await answer(player, sessionId, question, correctChoice(question), attemptId);
    expect(first.body.replayed).toBe(false);
    expect(second.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    const different = await answer(player, sessionId, question, correctChoice(question) + 1, attemptId);
    expect(different.status).toBe(409);
  });

  it('shows a text question with string choices and kind, and no answer key', async () => {
    const t = await textSession();
    const { question } = await issueQuestion(h.ctx, t.playerId, t.sessionId);
    const wire = question as unknown as Record<string, unknown>;
    expect(wire['kind']).toBe('text');
    expect(wire['choices']).toEqual(['cat', 'chair', 'cloud']);
    expect(JSON.stringify(await getSession(h.ctx, t.playerId, t.sessionId))).not.toContain('correctAnswer');
  });

  it('grades a correct text answer and stores the word', async () => {
    const t = await textSession();
    const result = await submitAnswer(h.ctx, t.playerId, t.sessionId, textBody(t.questionId, 'cat'));
    expect(result.correct).toBe(true);
    expect(result.correctAnswer as unknown).toBe('cat');
    expect(result.rewards.some((r) => r.kind === 'xp')).toBe(true);
    const [row] = await sql<{ submitted_response: string; correct: boolean }>(h, 'select submitted_response, correct from attempts where served_question_id = $1', [t.questionId]);
    expect(row).toEqual({ submitted_response: 'cat', correct: true });
  });

  it('grades a wrong offered text answer as wrong, with no rewards for it', async () => {
    const t = await textSession();
    const result = await submitAnswer(h.ctx, t.playerId, t.sessionId, textBody(t.questionId, 'chair'));
    expect(result.correct).toBe(false);
    expect(result.rewards).toEqual([]);
  });

  it('refuses a text answer that was never offered (422) without consuming the question', async () => {
    const t = await textSession();
    await expect(submitAnswer(h.ctx, t.playerId, t.sessionId, textBody(t.questionId, 'dragon'))).rejects.toMatchObject({ status: 422, code: 'invalid_response' });
    expect(await countRows(h, 'attempts', 'play_session_id = $1', [t.sessionId])).toBe(0);
    expect((await submitAnswer(h.ctx, t.playerId, t.sessionId, textBody(t.questionId, 'cat'))).correct).toBe(true);
  });

  it('refuses a number answer to a text question with 400 and consumes nothing', async () => {
    const t = await textSession();
    const body = { attemptId: freshAttemptId(), questionId: t.questionId, response: 7 } as Body;
    const err = await submitAnswer(h.ctx, t.playerId, t.sessionId, body).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'invalid_request' });
    expect(await countRows(h, 'attempts', 'play_session_id = $1', [t.sessionId])).toBe(0);
    expect(await countRows(h, 'xp_events', 'player_id = $1', [t.playerId])).toBe(0);
  });

  it('refuses a string answer to a number question with 400 (service) and 400 (HTTP)', async () => {
    const player = await newPlayer(h);
    const playerId = await playerIdOf(player);
    const sessionId = await startSession(player);
    const question = await issue(player, sessionId);
    const asString = String(correctChoice(question));
    const err = await submitAnswer(h.ctx, playerId, sessionId, textBody(question.id, asString)).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 400, code: 'invalid_request' });
    const http = await player.request('POST', PATHS.answers(sessionId), { attemptId: freshAttemptId(), questionId: question.id, response: asString });
    expect(http.status).toBe(400);
    expect(await countRows(h, 'attempts', 'play_session_id = $1', [sessionId])).toBe(0);
    expect((await answer(player, sessionId, question, correctChoice(question))).status).toBe(200);
  });

  it('text answers are idempotent: same retry replays, a different word on the same key is a 409', async () => {
    const t = await textSession();
    const attemptId = freshAttemptId();
    const first = await submitAnswer(h.ctx, t.playerId, t.sessionId, textBody(t.questionId, 'cat', attemptId));
    const again = await submitAnswer(h.ctx, t.playerId, t.sessionId, textBody(t.questionId, 'cat', attemptId));
    expect(first.replayed).toBe(false);
    expect(again.replayed).toBe(true);
    expect(again.correctAnswer as unknown).toBe('cat');
    await expect(submitAnswer(h.ctx, t.playerId, t.sessionId, textBody(t.questionId, 'chair', attemptId))).rejects.toMatchObject({ status: 409, code: 'idempotency_key_conflict' });
    expect(await countRows(h, 'attempts', 'play_session_id = $1', [t.sessionId])).toBe(1);
  });
});
