import type { ChoiceId, PublicChoice, PublicQuestion, QuestionId } from '@bidazoo/contracts';

/**
 * The full question INCLUDING the answer key.
 *
 * SERVER-ONLY. This type must never be serialized to a client. Convert with
 * `toPublicQuestion` first; that is the only sanctioned path out of the server.
 */
export interface ServerQuestion {
  questionId: QuestionId;
  skillId: string;
  prompt: string;
  choices: readonly PublicChoice[];
  correctChoiceId: ChoiceId;
}

/**
 * Projects a ServerQuestion to what a client may see before answering.
 *
 * Builds the result field-by-field (an allowlist) rather than deleting keys from
 * a copy, so a field added to ServerQuestion later can never leak by accident.
 */
export function toPublicQuestion(question: ServerQuestion): PublicQuestion {
  return {
    questionId: question.questionId,
    skillId: question.skillId,
    prompt: question.prompt,
    choices: question.choices.map((c) => ({ id: c.id, label: c.label })),
  };
}
