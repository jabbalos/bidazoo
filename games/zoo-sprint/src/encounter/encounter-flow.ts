import type { AnswerResult, PlaySession, PublicQuestion } from '@bidazoo/game-sdk';
import { applyAnswer, createEncounter, type EncounterState } from '@bidazoo/learning-core';
import type { SessionClient } from '../session-client';

/**
 * The encounter's turn loop, without Phaser (proposal 2.6 items 1 and 6; Lane A, items A2, A4, A5).
 *
 * Every question comes from the server and every grade is the server's (`AnswerResult.correct`).
 * Hearts, strikes, the charge meter and special moves are the encounter model's
 * (`@bidazoo/learning-core`) applied to those grades: the client derives them for display and never
 * sends them anywhere. The timer is display only and is not an input here.
 *
 * The overlay (EncounterOverlay.ts) implements {@link EncounterView}; tests drive the loop with a
 * scripted view.
 */

/** Same value as the model's `CHARGE_FULL` (not exported from learning-core's index): segments in the charge meter. */
export const CHARGE_SEGMENTS = 3;

/** Seconds the question timer bar takes to run down. Display only: when it runs out nothing happens. */
export const TIMER_DISPLAY_MS = 20_000;

/** Special moves per encounter: one for a node, two for the boss (proposal Lane A: "two special moves allowed"). */
export function specialMovesFor(kind: 'node' | 'boss'): number {
  return kind === 'boss' ? 2 : 1;
}

export interface EncounterOutcomeCounts {
  won: boolean;
  correct: number;
  asked: number;
  bestStreak: number;
  heartsLeft: number;
}

/** One graded answer, as the overlay shows it. */
export interface GradedStep {
  result: AnswerResult;
  chosen: number | string;
  before: EncounterState;
  after: EncounterState;
  /** This answer fired a special move (a double strike). */
  specialMove: boolean;
  /** A last-stand answer (the boss is already lost): graded by the server, but it changes nothing in the encounter. */
  lastStand: boolean;
}

/** What the overlay does at each point of the loop. Each promise resolves when the child (or the animation) is done. */
export interface EncounterView {
  /** Fetching the next question. */
  loading(state: EncounterState): void;
  /** Shows a question; resolves with the tapped choice. */
  ask(question: PublicQuestion, state: EncounterState): Promise<number | string>;
  /** The tapped answer is on its way to the server. */
  submitting(state: EncounterState): void;
  /** Shows the server's grade and what it did to the encounter. */
  graded(step: GradedStep): Promise<void>;
  /** A request failed; resolves when the child taps Try again (the same request is then repeated). */
  failed(error: unknown, state: EncounterState): Promise<void>;
  /** The boss's hearts reached 0 with questions left: the last stand begins (resolves when the moment is shown). */
  lastStand(state: EncounterState): Promise<void>;
  /** The encounter is over (won, lost, or cut short because the session ended). */
  ended(state: EncounterState): Promise<void>;
}

/**
 * Owner decision (November 9, 2026): when the boss's hearts reach 0, the boss stays lost and its
 * remaining questions are still asked as a "last stand", so the session's questions are all answered
 * and it completes. The server grades them as usual (XP as it decides); they change nothing in the
 * encounter (`applyAnswer` ignores answers after the end), and the server's replay ignores them for
 * beacons and the stamp. Only the boss has a last stand.
 */
export function lastStandQuestions(state: EncounterState): number {
  return state.kind === 'boss' && state.phase === 'lost' && state.hearts <= 0 ? Math.max(0, state.questions - state.asked) : 0;
}

/**
 * The charge meter carries from one encounter into the next, as in the server's replay
 * (`replayExpedition`). The 2.6 signature has no charge input, so it is kept per session client:
 * a destination run uses one client for all six encounters. A new client starts at 0.
 */
const carried = new WeakMap<SessionClient, number>();

export function carriedCharge(session: SessionClient): number {
  return carried.get(session) ?? 0;
}

/** The session the client last heard from the server, when the implementation exposes it (PlaySessionClient does). */
function knownSession(session: SessionClient): PlaySession | null {
  const value = (session as { session?: unknown }).session;
  return value && typeof value === 'object' ? (value as PlaySession) : null;
}

/** True when the server says this session takes no more answers (completed or abandoned). */
function sessionOver(session: SessionClient): boolean {
  const known = knownSession(session);
  return known !== null && known.status !== 'active';
}

function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

/** Re-reads the session when the client can (PlaySessionClient.refresh). False when it cannot or the read failed. */
async function resync(session: SessionClient): Promise<boolean> {
  const refresh = (session as { refresh?: unknown }).refresh;
  if (typeof refresh !== 'function') return false;
  try {
    await (refresh as () => Promise<unknown>).call(session);
    return true;
  } catch {
    return false;
  }
}

/** The caller's counts. Last-stand answers are counted in `asked` and `correct` (they are answered questions); the boss stays lost. */
export function outcomeOf(state: EncounterState, lastStand: { asked: number; correct: number } = { asked: 0, correct: 0 }): EncounterOutcomeCounts {
  return {
    won: state.phase === 'won',
    correct: state.correct + lastStand.correct,
    asked: state.asked + lastStand.asked,
    bestStreak: state.bestStreak,
    heartsLeft: state.hearts,
  };
}

export function initialState(session: SessionClient, opts: { questions: number; kind: 'node' | 'boss' }): EncounterState {
  return { ...createEncounter({ questions: opts.questions, kind: opts.kind, specialMoves: specialMovesFor(opts.kind) }), charge: carriedCharge(session) };
}

/**
 * Runs one encounter to its end. Resolves with the counts for the caller (Lane B). Never rejects
 * for a failed request: the view shows the failure and the child retries; a retried answer reuses
 * its attempt id inside the session client, so the server grades it once.
 */
export async function runEncounter(
  session: SessionClient,
  opts: { questions: number; kind: 'node' | 'boss' },
  view: EncounterView,
): Promise<EncounterOutcomeCounts> {
  let state = initialState(session, opts);

  /**
   * Runs a request until it succeeds. 'over' when the session ended underneath the encounter;
   * 'answered' when the server already holds an answer for this question from another attempt
   * (another tab): the client re-reads the session and the loop asks the server's current question.
   */
  const request = async <T>(call: () => Promise<T>): Promise<T | 'over' | 'answered'> => {
    for (;;) {
      if (sessionOver(session)) return 'over';
      try {
        return await call();
      } catch (error) {
        const code = errorCode(error);
        if (code === 'session_not_active' || code === 'question_already_answered') {
          if (await resync(session)) return sessionOver(session) || code === 'session_not_active' ? 'over' : 'answered';
        }
        if (sessionOver(session)) return 'over';
        await view.failed(error, state);
      }
    }
  };

  /** One question: fetch, ask, submit. 'over' when the session ended; 'again' when the server's current question must be asked instead. */
  const turn = async (): Promise<{ chosen: number | string; result: AnswerResult } | 'over' | 'again'> => {
    view.loading(state);
    const question = await request(() => session.nextQuestion());
    if (question === 'over') return 'over';
    if (question === 'answered') return 'again';
    const chosen = await view.ask(question, state);
    view.submitting(state);
    const result = await request(() => session.submitAnswer(chosen));
    if (result === 'over') return 'over';
    if (result === 'answered') return 'again';
    return { chosen, result };
  };

  let ended = false;
  while (state.phase === 'question') {
    const t = await turn();
    if (t === 'over') {
      ended = true;
      break;
    }
    if (t === 'again') continue;
    const before = state;
    state = applyAnswer(state, { correct: t.result.correct });
    await view.graded({ result: t.result, chosen: t.chosen, before, after: state, specialMove: state.specialMovesLeft < before.specialMovesLeft, lastStand: false });
  }

  const stand = { asked: 0, correct: 0 };
  let left = ended ? 0 : lastStandQuestions(state);
  if (left > 0) await view.lastStand(state);
  while (left > 0) {
    const t = await turn();
    if (t === 'over') break;
    if (t === 'again') continue;
    stand.asked += 1;
    if (t.result.correct) stand.correct += 1;
    left -= 1;
    await view.graded({ result: t.result, chosen: t.chosen, before: state, after: state, specialMove: false, lastStand: true });
  }

  carried.set(session, state.charge);
  await view.ended(state);
  return outcomeOf(state, stand);
}
