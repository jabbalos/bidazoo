/**
 * Answer validation.
 *
 * Grading never trusts the client about correctness: it compares the submitted value with the
 * server-held answer. A response that was never offered is not "wrong", it is invalid, and the
 * caller should reject it without consuming the question.
 */

export type GradeOutcome =
  | { kind: 'invalid'; reason: 'not_an_offered_choice' }
  | { kind: 'graded'; correct: boolean };

export function gradeAnswer(
  offeredChoices: readonly number[],
  correctAnswer: number,
  response: number,
): GradeOutcome {
  if (!Number.isInteger(response) || !offeredChoices.includes(response)) {
    return { kind: 'invalid', reason: 'not_an_offered_choice' };
  }
  return { kind: 'graded', correct: response === correctAnswer };
}
