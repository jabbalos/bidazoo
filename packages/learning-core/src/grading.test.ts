import { describe, expect, it } from 'vitest';
import { gradeResponse } from './grading';
import type { ServerQuestion } from './question';

const question: ServerQuestion = {
  questionId: 'q-1',
  skillId: 'add-within-10',
  prompt: '3 + 5 = ?',
  choices: [
    { id: 'c1', label: '7' },
    { id: 'c2', label: '8' },
    { id: 'c3', label: '9' },
  ],
  correctChoiceId: 'c2',
};

describe('gradeResponse (validation + grading)', () => {
  it('grades the correct choice as correct', () => {
    expect(gradeResponse(question, { questionId: 'q-1', choiceId: 'c2' })).toEqual({
      kind: 'graded',
      correct: true,
      correctChoiceId: 'c2',
    });
  });

  it('grades a wrong (but valid) choice as incorrect', () => {
    expect(gradeResponse(question, { questionId: 'q-1', choiceId: 'c1' })).toEqual({
      kind: 'graded',
      correct: false,
      correctChoiceId: 'c2',
    });
  });

  it('treats a response for a different question as invalid, not wrong', () => {
    expect(gradeResponse(question, { questionId: 'q-2', choiceId: 'c2' })).toEqual({
      kind: 'invalid',
      reason: 'question_mismatch',
    });
  });

  it('treats an unknown choice id as invalid, not wrong', () => {
    expect(gradeResponse(question, { questionId: 'q-1', choiceId: 'c99' })).toEqual({
      kind: 'invalid',
      reason: 'unknown_choice',
    });
  });
});
