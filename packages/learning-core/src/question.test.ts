import { describe, expect, it } from 'vitest';
import { allMultiplicationFacts } from './multiplication';
import { CHOICE_COUNT, generateQuestion } from './question';

describe('generateQuestion', () => {
  it('is deterministic for the same skill and seed', () => {
    expect(generateQuestion('mul:7x8', 'seed-1')).toEqual(generateQuestion('mul:7x8', 'seed-1'));
  });

  it('varies with the seed', () => {
    const seen = new Set(
      Array.from({ length: 40 }, (_, i) => JSON.stringify(generateQuestion('mul:7x8', `s${i}`))),
    );
    expect(seen.size).toBeGreaterThan(5);
  });

  // Property-style: every fact, many seeds.
  it('always yields 4 distinct positive integer choices containing the answer exactly once', () => {
    for (const fact of allMultiplicationFacts()) {
      for (let i = 0; i < 60; i++) {
        const q = generateQuestion(fact.skillKey, `seed-${i}`);
        expect(q.choices).toHaveLength(CHOICE_COUNT);
        expect(new Set(q.choices).size).toBe(CHOICE_COUNT);
        expect(q.choices.filter((c) => c === fact.product)).toHaveLength(1);
        expect(q.correctAnswer).toBe(fact.product);
        for (const c of q.choices) {
          expect(Number.isInteger(c)).toBe(true);
          expect(c).toBeGreaterThan(0);
        }
      }
    }
  });

  it('prompts show the fact in either order, and the order varies', () => {
    const prompts = new Set<string>();
    for (let i = 0; i < 60; i++) prompts.add(generateQuestion('mul:7x8', `p${i}`).prompt);
    expect(prompts).toEqual(new Set(['7 × 8', '8 × 7']));
    expect(generateQuestion('mul:6x6', 'x').prompt).toBe('6 × 6');
  });

  it('spreads the answer across all four positions', () => {
    const positions = new Set<number>();
    for (let i = 0; i < 80; i++) {
      const q = generateQuestion('mul:6x7', `pos${i}`);
      positions.add(q.choices.indexOf(q.correctAnswer));
    }
    expect(positions.size).toBe(4);
  });

  it('can keep the answer out of a given slot', () => {
    for (let slot = 0; slot < 4; slot++) {
      for (let i = 0; i < 50; i++) {
        const q = generateQuestion('mul:6x7', `avoid${i}`, { avoidAnswerIndex: slot });
        expect(q.choices.indexOf(q.correctAnswer)).not.toBe(slot);
        expect(new Set(q.choices).size).toBe(4);
      }
    }
  });

  it('includes realistic distractors (a neighboring multiple) for a mid-size fact', () => {
    const union = new Set<number>();
    for (let i = 0; i < 40; i++) generateQuestion('mul:7x8', `d${i}`).choices.forEach((c) => union.add(c));
    for (const near of [48, 63, 64, 15]) expect(union.has(near)).toBe(true);
  });

  it('throws on an unknown skill', () => {
    expect(() => generateQuestion('mul:1x1', 's')).toThrow();
  });
});
