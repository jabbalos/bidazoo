import { describe, expect, it } from 'vitest';
import { gradeAnswer } from './grading';

describe('gradeAnswer', () => {
  const offered = [48, 54, 56, 63];

  it('grades the correct offered choice as correct', () => {
    expect(gradeAnswer(offered, 56, 56)).toEqual({ kind: 'graded', correct: true });
  });

  it('grades a wrong offered choice as incorrect', () => {
    expect(gradeAnswer(offered, 56, 54)).toEqual({ kind: 'graded', correct: false });
  });

  it('treats a value that was never offered as invalid, even if it is the right product', () => {
    expect(gradeAnswer([48, 54, 63, 64], 56, 56)).toEqual({ kind: 'invalid', reason: 'not_an_offered_choice' });
    expect(gradeAnswer(offered, 56, 57)).toEqual({ kind: 'invalid', reason: 'not_an_offered_choice' });
  });

  it('rejects non-integers', () => {
    expect(gradeAnswer(offered, 56, 56.5).kind).toBe('invalid');
    expect(gradeAnswer(offered, 56, Number.NaN).kind).toBe('invalid');
  });
});
