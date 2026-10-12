import { describe, expect, it } from 'vitest';
import { buildChoices } from './choices';
import { createRng } from './rng';

describe('buildChoices', () => {
  const candidates = ['3', '5', '6', '7', '9', '10'];

  it('includes the correct answer exactly once', () => {
    const { choices } = buildChoices({
      rng: createRng('a'),
      correct: '8',
      distractorCandidates: candidates,
      count: 4,
    });
    expect(choices).toHaveLength(4);
    expect(choices.filter((c) => c.label === '8')).toHaveLength(1);
  });

  it('never lets a distractor duplicate the correct answer, even when offered as a candidate', () => {
    for (let i = 0; i < 50; i++) {
      const { choices } = buildChoices({
        rng: createRng(`dup-${i}`),
        correct: '8',
        distractorCandidates: ['8', ' 8 ', ...candidates],
        count: 4,
      });
      const labels = choices.map((c) => c.label.trim());
      expect(labels.filter((l) => l === '8')).toHaveLength(1);
    }
  });

  it('never produces duplicate distractors', () => {
    const { choices } = buildChoices({
      rng: createRng('uniq'),
      correct: 'x',
      distractorCandidates: ['a', 'A', 'a', 'b', 'b ', 'c'],
      count: 4,
    });
    const normalized = choices.map((c) => c.label.trim().toLowerCase());
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it('reports a correctChoiceId that points at the correct label', () => {
    const built = buildChoices({
      rng: createRng('id'),
      correct: '8',
      distractorCandidates: candidates,
      count: 4,
    });
    const match = built.choices.find((c) => c.id === built.correctChoiceId);
    expect(match?.label).toBe('8');
  });

  it('uses positional ids, so an id never encodes correctness', () => {
    const { choices } = buildChoices({
      rng: createRng('pos'),
      correct: '8',
      distractorCandidates: candidates,
      count: 4,
    });
    expect(choices.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('is deterministic for a given seed', () => {
    const make = () =>
      buildChoices({
        rng: createRng('same'),
        correct: '8',
        distractorCandidates: candidates,
        count: 4,
      });
    expect(make()).toEqual(make());
  });

  it('throws when there are not enough unique distractors', () => {
    expect(() =>
      buildChoices({
        rng: createRng('few'),
        correct: '8',
        distractorCandidates: ['8', '3', '3'],
        count: 4,
      }),
    ).toThrow(/Not enough unique distractors/);
  });

  it('rejects counts below 2', () => {
    expect(() =>
      buildChoices({ rng: createRng('c'), correct: '1', distractorCandidates: ['2'], count: 1 }),
    ).toThrow(RangeError);
  });
});
