import { describe, expect, it } from 'vitest';
import { gradeAnswer } from './grading';

describe('gradeAnswer: 3- and 4-choice number and text questions', () => {
  const cases: { name: string; offered: (number | string)[]; key: number | string; right: number | string; wrong: number | string; unoffered: number | string }[] = [
    { name: '4 number', offered: [12, 15, 18, 21], key: 18, right: 18, wrong: 12, unoffered: 20 },
    { name: '3 number', offered: [7, 9, 11], key: 9, right: 9, wrong: 11, unoffered: 8 },
    { name: '4 text', offered: ['3/4', '1/2', '2/3', '1/4'], key: '2/3', right: '2/3', wrong: '1/4', unoffered: '5/6' },
    { name: '3 text', offered: ['Yes', 'No', 'Maybe'], key: 'No', right: 'No', wrong: 'Maybe', unoffered: 'no' },
  ];
  for (const c of cases) {
    it(`${c.name}: correct, wrong and never-offered`, () => {
      expect(gradeAnswer(c.offered, c.key, c.right)).toEqual({ kind: 'graded', correct: true });
      expect(gradeAnswer(c.offered, c.key, c.wrong)).toEqual({ kind: 'graded', correct: false });
      expect(gradeAnswer(c.offered, c.key, c.unoffered)).toEqual({ kind: 'invalid', reason: 'not_an_offered_choice' });
    });
  }

  it('does not mix types: "56" is not 56', () => {
    expect(gradeAnswer([48, 54, 56], 56, '56').kind).toBe('invalid');
    expect(gradeAnswer(['48', '54', '56'], '56', 56).kind).toBe('invalid');
  });

  it('a text response must match exactly (case and spacing)', () => {
    expect(gradeAnswer(['3,206', '326'], '326', ' 326').kind).toBe('invalid');
  });
});
