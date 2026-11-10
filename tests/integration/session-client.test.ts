import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AnswerResult,
  BidaZooPlatform,
  PlaySession,
  PublicQuestion,
  StartPlaySessionRequest,
  SubmitAnswerRequest,
} from '@bidazoo/game-sdk';

// ui.ts draws with Phaser, which cannot load in Node. The session client uses only its attempt-id
// generator from it; this stand-in keeps the same contract (a fresh id on every call).
const ids = vi.hoisted(() => ({ next: 0 }));
vi.mock('../../games/zoo-sprint/src/ui', () => ({
  makeAttemptId: () => `attempt${String(++ids.next).padStart(4, '0')}`,
}));

import { PlaySessionClient, createSessionClient } from '../../games/zoo-sprint/src/session-client';

const SESSION_ID = '00000000-0000-4000-8000-000000000001';
const NOW = '2026-11-08T12:00:00.000Z';

/**
 * A small in-memory server with the platform's rules: one outstanding question at a time, answers
 * graded from a key the client never sees (the first choice is right), attempt ids are idempotency
 * keys, and the session completes with results after `total` answers.
 */
class FakeServer implements BidaZooPlatform {
  readonly calls: { method: string; args: unknown[] }[] = [];
  session: PlaySession;
  failNextSubmit = false;
  private issued = 0;
  private readonly key = new Map<string, number>();
  private readonly attempts = new Map<string, AnswerResult>();
  private readonly answers: { sequence: number; prompt: string; correct: boolean; fluent: boolean }[] = [];

  constructor(total: number) {
    this.session = {
      id: SESSION_ID,
      gameId: 'zoo-sprint',
      mode: 'multiplication',
      status: 'active',
      total,
      answered: 0,
      correct: 0,
      startedAt: NOW,
      expiresAt: NOW,
      completedAt: null,
      currentQuestion: null,
      results: null,
    };
  }

  private log(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }

  count(method: string): number {
    return this.calls.filter((c) => c.method === method).length;
  }

  async ensureGuest(): Promise<never> {
    throw new Error('not used');
  }

  async startSession(request: StartPlaySessionRequest) {
    this.log('startSession', request);
    return { session: structuredClone(this.session), resumed: this.session.answered > 0 || this.session.currentQuestion !== null };
  }

  async getSession(sessionId: string) {
    this.log('getSession', sessionId);
    return structuredClone(this.session);
  }

  /** Issues a question the way the server does (the outstanding one if there is one). */
  issue(): PublicQuestion {
    if (this.session.currentQuestion) return this.session.currentQuestion;
    this.issued += 1;
    const a = this.issued + 1;
    const question: PublicQuestion = {
      id: `00000000-0000-4000-8000-${String(100 + this.issued).padStart(12, '0')}`,
      sequence: this.issued,
      prompt: `${a} × 3`,
      type: 'multipleChoice',
      choices: [a * 3, a * 3 + 1, a * 3 + 2, a * 3 + 3],
    };
    this.key.set(question.id, a * 3);
    this.session.currentQuestion = question;
    return question;
  }

  async nextQuestion(sessionId: string) {
    this.log('nextQuestion', sessionId);
    const question = this.issue();
    return { question: structuredClone(question), session: structuredClone(this.session) };
  }

  async submitAnswer(sessionId: string, request: SubmitAnswerRequest): Promise<AnswerResult> {
    this.log('submitAnswer', sessionId, request);
    if (this.failNextSubmit) {
      this.failNextSubmit = false;
      throw new Error('network down');
    }
    const replay = this.attempts.get(request.attemptId);
    if (replay) return { ...structuredClone(replay), replayed: true };
    const question = this.session.currentQuestion;
    if (!question || question.id !== request.questionId) throw new Error('question_already_answered');
    const correctAnswer = this.key.get(question.id) as number;
    const correct = request.response === correctAnswer;
    this.answers.push({ sequence: question.sequence, prompt: question.prompt, correct, fluent: false });
    this.session.answered += 1;
    if (correct) this.session.correct += 1;
    this.session.currentQuestion = null;
    if (this.session.answered === this.session.total) {
      this.session.status = 'completed';
      this.session.completedAt = NOW;
      this.session.results = {
        correct: this.session.correct,
        total: this.session.total,
        fluent: 0,
        xpEarned: this.session.correct * 10,
        coinsEarned: this.session.correct,
        bonus: { xp: 0, coins: 0 },
        newlyMastered: [],
        answers: structuredClone(this.answers),
      };
    }
    const result: AnswerResult = {
      questionId: question.id,
      correct,
      fluent: false,
      responseMs: 1500,
      correctAnswer,
      rewards: correct ? [{ kind: 'xp', amount: 10, reason: 'correct' }] : [],
      mastery: { label: question.prompt, box: 0, streak: 0, fluentDays: 0, mastered: false, nextReviewAt: NOW },
      totals: { xp: this.session.correct * 10, coins: this.session.correct },
      session: structuredClone(this.session),
      replayed: false,
    };
    this.attempts.set(request.attemptId, result);
    return result;
  }
}

const START = { gameId: 'zoo-sprint', mode: 'multiplication' } as const;

function submitted(server: FakeServer): SubmitAnswerRequest[] {
  return server.calls.filter((c) => c.method === 'submitAnswer').map((c) => c.args[1] as SubmitAnswerRequest);
}

describe('session client (proposal 2.6 item 2)', () => {
  let server: FakeServer;
  beforeEach(() => {
    server = new FakeServer(3);
    ids.next = 0;
  });

  it('createSessionClient returns the shared implementation', () => {
    expect(createSessionClient(server)).toBeInstanceOf(PlaySessionClient);
  });

  it('startSession sends only the server fields and keeps the destination on the client', async () => {
    const client = new PlaySessionClient(server);
    const session = await client.startSession({ ...START, destination: 'great-wall' });
    expect(session.id).toBe(SESSION_ID);
    expect(server.calls).toEqual([{ method: 'startSession', args: [START] }]);
    expect(client.session?.id).toBe(SESSION_ID);
    expect(client.destination).toBe('great-wall');
  });

  it('nextQuestion fetches once and then returns the outstanding question without another call', async () => {
    const client = new PlaySessionClient(server);
    await client.startSession(START);
    const first = await client.nextQuestion();
    const again = await client.nextQuestion();
    expect(again).toEqual(first);
    expect(server.count('nextQuestion')).toBe(1);
    expect(client.session?.currentQuestion?.id).toBe(first.id);
  });

  it('a resumed session with an outstanding question needs no question fetch', async () => {
    server.issue();
    const client = new PlaySessionClient(server);
    const session = await client.startSession(START);
    expect(session.currentQuestion).not.toBeNull();
    expect((await client.nextQuestion()).id).toBe(session.currentQuestion?.id);
    expect(server.count('nextQuestion')).toBe(0);
  });

  it('submitAnswer sends the chosen value for the outstanding question and returns the server result', async () => {
    const client = new PlaySessionClient(server);
    await client.startSession(START);
    const question = await client.nextQuestion();
    const result = await client.submitAnswer(question.choices[0] as number);
    expect(result.correct).toBe(true);
    const [sent] = submitted(server);
    expect(sent).toMatchObject({ questionId: question.id, response: question.choices[0] });
    expect(client.session?.answered).toBe(1);
    expect(client.session?.currentQuestion).toBeNull();
  });

  it('a wrong choice is graded wrong by the server, not the client', async () => {
    const client = new PlaySessionClient(server);
    await client.startSession(START);
    const question = await client.nextQuestion();
    const result = await client.submitAnswer(question.choices[2] as number);
    expect(result.correct).toBe(false);
    expect(result.correctAnswer).toBe(question.choices[0]);
  });

  it('retrying a failed submit reuses the attempt id, and each question gets its own', async () => {
    const client = new PlaySessionClient(server);
    await client.startSession(START);
    const q1 = await client.nextQuestion();
    server.failNextSubmit = true;
    await expect(client.submitAnswer(q1.choices[0] as number)).rejects.toThrow('network down');
    await client.submitAnswer(q1.choices[0] as number);
    const q2 = await client.nextQuestion();
    expect(q2.id).not.toBe(q1.id);
    await client.submitAnswer(q2.choices[1] as number);
    const ids = submitted(server).map((r) => r.attemptId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it('refuses to answer with no outstanding question, or before a session exists', async () => {
    const client = new PlaySessionClient(server);
    await expect(client.submitAnswer(6)).rejects.toThrow(/startSession/);
    await expect(client.nextQuestion()).rejects.toThrow(/startSession/);
    await client.startSession(START);
    await expect(client.submitAnswer(6)).rejects.toThrow(/nextQuestion/);
    expect(server.count('submitAnswer')).toBe(0);
  });

  // Owner-approved change (November 9, 2026): text answers are graded by the server since D3, so the client
  // now sends the chosen text value exactly as chosen (the earlier version of this test pinned a refusal).
  it('sends a text answer as the chosen value, with the same request shape as a number', async () => {
    const client = new PlaySessionClient(server);
    await client.startSession(START);
    const question = await client.nextQuestion();
    await client.submitAnswer('seven');
    expect(server.count('submitAnswer')).toBe(1);
    const [sessionId, request] = server.calls.find((c) => c.method === 'submitAnswer')!.args as [string, SubmitAnswerRequest];
    expect(sessionId).toBe(SESSION_ID);
    expect(Object.keys(request).sort()).toEqual(['attemptId', 'questionId', 'response']);
    expect(request.questionId).toBe(question.id);
    expect(request.response).toBe('seven');
  });

  it('results() is null while the run is active and the server results once it is completed', async () => {
    const client = new PlaySessionClient(server);
    expect(await client.results()).toBeNull();
    await client.startSession(START);
    expect(await client.results()).toBeNull();
    const picks = [0, 1, 0];
    for (const pick of picks) {
      const question = await client.nextQuestion();
      await client.submitAnswer(question.choices[pick] as number);
    }
    const calls = server.calls.length;
    const results = await client.results();
    expect(server.calls.length).toBe(calls); // the final answer already carried the results
    expect(results).toMatchObject({ correct: 2, total: 3 });
    expect(results?.answers.map((a) => a.correct)).toEqual([true, false, true]);
    await expect(client.nextQuestion()).rejects.toThrow(/completed/);
  });

  it('results() asks the server when the run may have been completed elsewhere', async () => {
    const client = new PlaySessionClient(server);
    await client.startSession(START);
    // Another tab finishes the run.
    const other = new PlaySessionClient(server);
    await other.startSession(START);
    for (let i = 0; i < 3; i += 1) {
      const question = await other.nextQuestion();
      await other.submitAnswer(question.choices[0] as number);
    }
    expect(await client.results()).toMatchObject({ correct: 3, total: 3 });
    expect(client.session?.status).toBe('completed');
  });

  it('refresh() adopts the server session after an answer crossed with another tab', async () => {
    const client = new PlaySessionClient(server);
    await client.startSession(START);
    const question = await client.nextQuestion();
    // Another tab answers the same question first.
    const other = new PlaySessionClient(server);
    await other.startSession(START);
    await other.submitAnswer((await other.nextQuestion()).choices[0] as number);
    await expect(client.submitAnswer(question.choices[0] as number)).rejects.toThrow('question_already_answered');
    const fresh = await client.refresh();
    expect(fresh.answered).toBe(1);
    const next = await client.nextQuestion();
    expect(next.id).not.toBe(question.id);
  });
});
