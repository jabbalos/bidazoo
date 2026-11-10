/**
 * Answer validation.
 *
 * Grading never trusts the client about correctness: it compares the submitted value with the
 * server-held answer. A response that was never offered is not "wrong", it is invalid, and the
 * caller should reject it without consuming the question.
 *
 * Works for `number` questions (integer choices) and `text` questions (string choices). The
 * response must have the same type as the offered choices: the string "56" never matches the
 * number 56. No formula changes: correct = response equals the server's key.
 */

export type GradeOutcome =
  | { kind: 'invalid'; reason: 'not_an_offered_choice' }
  | { kind: 'graded'; correct: boolean };

export function gradeAnswer<T extends number | string>(
  offeredChoices: readonly T[],
  correctAnswer: T,
  response: number | string,
): GradeOutcome {
  if (typeof response === 'number' && !Number.isInteger(response)) {
    return { kind: 'invalid', reason: 'not_an_offered_choice' };
  }
  if (!(offeredChoices as readonly (number | string)[]).includes(response)) {
    return { kind: 'invalid', reason: 'not_an_offered_choice' };
  }
  return { kind: 'graded', correct: response === correctAnswer };
}
