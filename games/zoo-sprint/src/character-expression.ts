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

/**
 * The expression for the run screen right now, derived entirely from what it is already showing.
 * Because it is derived, rebuilding the screen (a resize, the next question) can never lose or
 * invent an expression.
 */
export function expressionForRun(phase: RunPhaseName, answer: AnswerOutcome | null): ExpressionState {
  if (phase === 'feedback' && answer) return expressionForAnswer(answer);
  return expressionForPhase(phase);
}
