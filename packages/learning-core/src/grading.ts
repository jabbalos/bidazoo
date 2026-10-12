import type { ChoiceId, PlayerResponse } from '@bidazoo/contracts';
import type { ServerQuestion } from './question';

export type GradeOutcome =
  | { kind: 'invalid'; reason: 'question_mismatch' | 'unknown_choice' }
  | { kind: 'graded'; correct: boolean; correctChoiceId: ChoiceId };

/**
 * Grades a player's response against the server-held question.
 *
 * Pure: it decides correctness only. Persisting the attempt, updating mastery,
 * and issuing rewards are the API's job (and must be idempotent there).
 * A response that does not fit the question is `invalid`, never "wrong", so
 * malformed or forged input cannot be confused with an honest incorrect answer.
 */
export function gradeResponse(question: ServerQuestion, response: PlayerResponse): GradeOutcome {
  if (response.questionId !== question.questionId) {
    return { kind: 'invalid', reason: 'question_mismatch' };
  }
  if (!question.choices.some((c) => c.id === response.choiceId)) {
    return { kind: 'invalid', reason: 'unknown_choice' };
  }
  return {
    kind: 'graded',
    correct: response.choiceId === question.correctChoiceId,
    correctChoiceId: question.correctChoiceId,
  };
}
