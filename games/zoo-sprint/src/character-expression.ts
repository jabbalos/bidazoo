import type { ExpressionState } from './character-definitions';

/**
 * Which expression the on-screen starter shows for a moment in a run. PRESENTATION ONLY.
 *
 * Every function here reads an outcome the server has already decided and returns a picture name.
 * Nothing in this module grades, scores, awards, stores or sends anything, and no function takes a
 * character: all five starters react identically. The host (Click) is not part of gameplay.
 *
 *   waiting / loading / error  -> idle
 *   submitting an answer       -> thinking
 *   a right answer             -> happy
 *   a wrong answer             -> tryAgain   (encouraging, never shaming)
 *   a finished run             -> cheer
 *   a finished run that mastered something new -> discover
 *
 * This file is Phaser-free so the mapping can be tested directly.
 */

/** The steps of a run, as the run screen names them. */
export type RunPhaseName = 'loading' | 'question' | 'submitting' | 'feedback' | 'error';

/** The calm resting expression. Everything temporary returns here. */
export const STABLE_EXPRESSION: ExpressionState = 'idle';

/** The only thing read from a graded answer. */
export interface AnswerOutcome {
  readonly correct: boolean;
}

/** The only thing read from a finished run. */
export interface RunOutcome {
  readonly newlyMastered: readonly unknown[];
}

/** The expression for a step of the run that has no graded answer to show. */
export function expressionForPhase(phase: RunPhaseName): ExpressionState {
  return phase === 'submitting' ? 'thinking' : STABLE_EXPRESSION;
}

/** The expression for a graded answer. */
export function expressionForAnswer(result: AnswerOutcome): ExpressionState {
  return result.correct ? 'happy' : 'tryAgain';
}

/**
 * The expression for a finished run. A newly mastered fact takes precedence over the plain
 * celebration; a run with no results block ("All done!") is still a celebration.
 */
export function expressionForResults(results: RunOutcome | null | undefined): ExpressionState {
  return results && results.newlyMastered.length > 0 ? 'discover' : 'cheer';
}

/** Presentation-only context for the run screen: which question is open and the current right-answer streak. */
export interface RunMoment {
  /** 1-based number of the open question (the server's `sequence`). */
  readonly sequence?: number;
  /** Consecutive right answers shown so far, counted by the screen from graded results. */
  readonly streak?: number;
}

/** A streak this long earns the high-energy cheer instead of the plain happy. */
export const CHEER_STREAK = 3;

/**
 * The expression for the run screen right now, derived entirely from what it is already showing.
 * Because it is derived, rebuilding the screen (a resize, the next question) can never lose or
 * invent an expression.
 *
 *   loading / error               -> idle        (waiting)
 *   the first question opens      -> discover    (a new expedition begins)
 *   a question is open            -> thinking    (presenting the question)
 *   submitting                    -> thinking
 *   right answer                  -> happy, or cheer on a streak of CHEER_STREAK or more
 *   wrong answer                  -> tryAgain
 */
export function expressionForRun(phase: RunPhaseName, answer: AnswerOutcome | null, moment: RunMoment = {}): ExpressionState {
  if (phase === 'feedback' && answer) {
    if (answer.correct && (moment.streak ?? 0) >= CHEER_STREAK) return 'cheer';
    return expressionForAnswer(answer);
  }
  if (phase === 'question') return moment.sequence === 1 ? 'discover' : 'thinking';
  return expressionForPhase(phase);
}
