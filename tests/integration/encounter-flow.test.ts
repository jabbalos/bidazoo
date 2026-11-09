import { describe, expect, it } from 'vitest';
import type { AnswerResult, PlaySession, PublicQuestion, SessionResults } from '@bidazoo/game-sdk';
import { replayExpedition, type EncounterState } from '@bidazoo/learning-core';
import {
  CHARGE_SEGMENTS,
  carriedCharge,
  initialState,
  runEncounter,
  specialMovesFor,
  type EncounterView,
  type GradedStep,
} from '../../games/zoo-sprint/src/encounter/encounter-flow';
import type { SessionClient } from '../../games/zoo-sprint/src/session-client';

/**
 * The encounter turn loop (items A2, A4, A5) against a scripted session client and a scripted view.
 * The session client is Lane A's own interface; this stand-in keeps its rules: one outstanding
 * question at a time, the server's grade decides, and a retried answer is graded once.
 */

const SESSION_ID = '00000000-0000-4000-8000-0000000000aa';

class ScriptedSession implements SessionClient {
  /** The grade the "server" gives each answer, in order (true = correct). */
  private readonly grades: boolean[];
  session: PlaySession;
  calls = { next: 0, submit: 0, refresh: 0 };
  /** Errors thrown by the next submitAnswer calls, in order. */
  submitErrors: unknown[] = [];
  /** After this many graded answers the server reports the session completed. */
  completeAfter = Number.POSITIVE_INFINITY;
  private outstanding: PublicQuestion | null = null;
  private served = 0;
  private graded = 0;
  readonly submitted: (number | string)[] = [];

  constructor(sequence: string) {
    this.grades = [...sequence].map((c) => c === 'T');
    this.session = {
      id: SESSION_ID,
      gameId: 'zoo-sprint',
      mode: 'multiplication',
      status: 'active',
      total: 15,
      answered: 0,
      correct: 0,
      startedAt: '2026-11-09T12:00:00.000Z',
      completedAt: null,
      currentQuestion: null,
      results: null,
    } as unknown as PlaySession;
  }

  async startSession(): Promise<PlaySession> {
    return this.session;
  }

  async nextQuestion(): Promise<PublicQuestion> {
    this.calls.next += 1;
    if (this.session.status !== 'active') throw new Error('The session is completed; there is no next question.');
    if (!this.outstanding) {
      this.served += 1;
      this.outstanding = { id: `q${this.served}`, sequence: this.served, prompt: `${this.served} x 2`, choices: [this.served * 2, 1, 3, 5] } as unknown as PublicQuestion;
    }
    return this.outstanding;
  }

  async submitAnswer(choice: number | string): Promise<AnswerResult> {
    this.calls.submit += 1;
    const error = this.submitErrors.shift();
    if (error) throw error;
    const question = this.outstanding;
    if (!question) throw new Error('no outstanding question');
    this.submitted.push(choice);
    const correct = this.grades[this.graded] ?? false;
    this.graded += 1;
    this.outstanding = null;
    if (this.graded >= this.completeAfter) this.session = { ...this.session, status: 'completed' } as PlaySession;
    return {
      questionId: question.id,
      correct,
      fluent: correct,
      responseMs: 1500,
      correctAnswer: (question.choices as number[])[0] as number,
      rewards: [],
      mastery: {} as AnswerResult['mastery'],
      totals: { xp: this.graded, coins: 0 },
      session: this.session,
      replayed: false,
    };
  }

  async results(): Promise<SessionResults | null> {
    return null;
  }

  /** PlaySessionClient's resync. */
  async refresh(): Promise<PlaySession> {
    this.calls.refresh += 1;
    this.outstanding = null;
    return this.session;
  }
}

/** A view that taps the first tile at once and records what it was shown. */
function view(): EncounterView & { steps: GradedStep[]; asked: EncounterState[]; failures: unknown[]; end: EncounterState | null } {
  const v = {
    steps: [] as GradedStep[],
    asked: [] as EncounterState[],
    failures: [] as unknown[],
    end: null as EncounterState | null,
    loading() {},
    submitting() {},
    async ask(question: PublicQuestion, state: EncounterState) {
      v.asked.push(state);
      return (question.choices as number[])[0] as number;
    },
    async graded(step: GradedStep) {
      v.steps.push(step);
    },
    async failed(error: unknown) {
      v.failures.push(error);
    },
    async ended(state: EncounterState) {
      v.end = state;
    },
  };
  return v;
}

const NODE = { questions: 2, kind: 'node' as const };
const BOSS = { questions: 5, kind: 'boss' as const };

describe('encounter flow: one encounter', () => {
  it('a node won with two correct answers: two strikes, hearts kept, the outcome counts match', async () => {
    const session = new ScriptedSession('TT');
    const v = view();
    const outcome = await runEncounter(session, NODE, v);
    expect(outcome).toEqual({ won: true, correct: 2, asked: 2, bestStreak: 2, heartsLeft: 3 });
    expect(v.end).toMatchObject({ phase: 'won', strikes: 2, hearts: 3, charge: 2 });
    expect(session.calls).toMatchObject({ next: 2, submit: 2 });
  });

  it('a wrong answer costs a heart and empties the charge meter; a node with one strike of two is lost', async () => {
    const session = new ScriptedSession('TF');
    const v = view();
    const outcome = await runEncounter(session, NODE, v);
    expect(outcome).toEqual({ won: false, correct: 1, asked: 2, bestStreak: 1, heartsLeft: 2 });
    expect(v.steps[1]?.after).toMatchObject({ hearts: 2, charge: 0, streak: 0 });
  });

  it('every step shows the server grade and the state before and after it', async () => {
    const session = new ScriptedSession('FT');
    const v = view();
    await runEncounter(session, NODE, v);
    expect(v.steps.map((s) => s.result.correct)).toEqual([false, true]);
    expect(v.steps[0]?.before).toMatchObject({ asked: 0, hearts: 3 });
    expect(v.steps[0]?.after).toMatchObject({ asked: 1, hearts: 2 });
    expect(v.steps[1]?.before).toEqual(v.steps[0]?.after);
    expect(v.asked.map((s) => s.asked)).toEqual([0, 1]);
  });

  it('the boss allows two special moves and a node one', () => {
    expect(specialMovesFor('boss')).toBe(2);
    expect(specialMovesFor('node')).toBe(1);
    expect(initialState(new ScriptedSession(''), BOSS)).toMatchObject({ kind: 'boss', questions: 5, specialMovesLeft: 2, hearts: 3, charge: 0 });
  });

  it('hearts at 0 end the boss at once: three misses, three questions asked, lost', async () => {
    const session = new ScriptedSession('FFFTT');
    const v = view();
    const outcome = await runEncounter(session, BOSS, v);
    expect(outcome).toEqual({ won: false, correct: 0, asked: 3, bestStreak: 0, heartsLeft: 0 });
    expect(session.calls.next).toBe(3);
    expect(v.end?.phase).toBe('lost');
  });

  it('the boss: three in a row charge the meter, the next correct answer is a special move (double strike)', async () => {
    const session = new ScriptedSession('TTTTT');
    const v = view();
    const outcome = await runEncounter(session, BOSS, v);
    expect(outcome.won).toBe(true);
    expect(v.steps.map((s) => s.specialMove)).toEqual([false, false, false, true, false]);
    expect(v.steps[2]?.after.charge).toBe(CHARGE_SEGMENTS);
    expect(v.steps[3]?.after).toMatchObject({ strikes: 5, charge: 0, specialMovesLeft: 1 });
  });
});

describe('encounter flow: across encounters', () => {
  it('the charge meter carries into the next encounter on the same session client, as in the server replay', async () => {
    const session = new ScriptedSession('TTTT');
    await runEncounter(session, NODE, view());
    expect(carriedCharge(session)).toBe(2);
    const second = view();
    await runEncounter(session, NODE, second);
    // charge 2 + the first correct answer = 3 (full); the second correct answer fires the special move
    expect(second.asked[0]?.charge).toBe(2);
    expect(second.steps.map((s) => s.specialMove)).toEqual([false, true]);
    expect(second.end).toMatchObject({ strikes: 3, specialMovesLeft: 0 });
    // a new session client starts empty
    expect(carriedCharge(new ScriptedSession(''))).toBe(0);
  });

  it('five nodes and the boss over one client light exactly the beacons the server replay computes', async () => {
    const sequences = ['TTTTTTTTTTTTTTT', 'TFTTFTTTFFTTTTT', 'FFFFFFFFFFFFFFF', 'TTFTTFTTFTTFTTF', 'FTFTFTFTFTFFFTT', 'TTTTTTTTTTFFFTT'];
    for (const sequence of sequences) {
      const session = new ScriptedSession(sequence);
      let beacons = 0;
      for (let node = 0; node < 5; node++) if ((await runEncounter(session, NODE, view())).won) beacons += 1;
      const boss = await runEncounter(session, BOSS, view());
      const server = replayExpedition([...sequence].slice(0, session.submitted.length).map((c) => ({ correct: c === 'T' })));
      expect({ beaconsLit: beacons, bossWon: boss.won }, sequence).toEqual(server);
    }
  });
});

describe('encounter flow: failures and the session ending', () => {
  it('a failed answer request is shown, then retried with the same choice and graded once', async () => {
    const session = new ScriptedSession('TT');
    const offline = Object.assign(new Error('offline'), { status: 0, code: 'network', isNetwork: true });
    session.submitErrors = [offline];
    const v = view();
    const outcome = await runEncounter(session, NODE, v);
    expect(v.failures).toEqual([offline]);
    expect(session.calls.submit).toBe(3);
    expect(session.submitted).toHaveLength(2);
    expect(outcome).toMatchObject({ won: true, asked: 2 });
  });

  it('an answer the server already holds from another tab: the client resyncs and asks the current question, nothing is counted twice', async () => {
    const session = new ScriptedSession('TT');
    session.submitErrors = [Object.assign(new Error('answered'), { status: 409, code: 'question_already_answered' })];
    const v = view();
    const outcome = await runEncounter(session, NODE, v);
    expect(session.calls.refresh).toBe(1);
    expect(v.failures).toEqual([]);
    expect(outcome).toMatchObject({ asked: 2, correct: 2 });
  });

  it('when the session completes underneath, the encounter ends with what was answered (never won early)', async () => {
    const session = new ScriptedSession('TTTTTT');
    session.completeAfter = 1;
    const v = view();
    const outcome = await runEncounter(session, NODE, v);
    expect(outcome).toEqual({ won: false, correct: 1, asked: 1, bestStreak: 1, heartsLeft: 3 });
    expect(v.end?.phase).toBe('question');
    expect(session.calls.next).toBe(1);
  });

  it('the timer is not part of the loop: an answer that takes long changes nothing', async () => {
    const session = new ScriptedSession('TT');
    const slow = view();
    slow.ask = async (question: PublicQuestion, state: EncounterState) => {
      slow.asked.push(state);
      await new Promise((resolve) => setTimeout(resolve, 30));
      return (question.choices as number[])[0] as number;
    };
    expect(await runEncounter(session, NODE, slow)).toEqual({ won: true, correct: 2, asked: 2, bestStreak: 2, heartsLeft: 3 });
  });
});
