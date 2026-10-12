import { describe, expect, it } from 'vitest';
import { toPublicQuestion, type ServerQuestion } from './question';

const serverQuestion: ServerQuestion = {
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

describe('toPublicQuestion (answer security)', () => {
  it('exposes exactly the allowlisted fields', () => {
    expect(Object.keys(toPublicQuestion(serverQuestion)).sort()).toEqual([
      'choices',
      'prompt',
      'questionId',
      'skillId',
    ]);
  });

  it('does not leak the answer key anywhere in the serialized payload', () => {
    const json = JSON.stringify(toPublicQuestion(serverQuestion));
    expect(json).not.toContain('correctChoiceId');
    expect(json).not.toContain('correct');
    expect(json).not.toContain('answer');
  });

  it('does not leak extra fields added to the server object later', () => {
    const withSecret = { ...serverQuestion, internalNote: 'secret', answer: '8' };
    const json = JSON.stringify(toPublicQuestion(withSecret));
    expect(json).not.toContain('internalNote');
    expect(json).not.toContain('secret');
  });

  it('exposes only id and label on each choice', () => {
    const pub = toPublicQuestion(serverQuestion);
    for (const choice of pub.choices) {
      expect(Object.keys(choice).sort()).toEqual(['id', 'label']);
    }
  });
});
