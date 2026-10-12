import { describe, expect, it } from 'vitest';
import {
  allMultiplicationFacts,
  factLabel,
  labelForSkillKey,
  parseSkillKey,
  skillKeyFor,
} from './multiplication';

describe('multiplication fact families', () => {
  it('has 36 unique facts for factors 2..9 (turnarounds share one fact)', () => {
    const facts = allMultiplicationFacts();
    expect(facts).toHaveLength(36);
    expect(new Set(facts.map((f) => f.skillKey)).size).toBe(36);
    for (const f of facts) {
      expect(f.a).toBeLessThanOrEqual(f.b);
      expect(f.product).toBe(f.a * f.b);
    }
  });

  it('gives both orders of a pair the same skill key', () => {
    expect(skillKeyFor(7, 8)).toBe('mul:7x8');
    expect(skillKeyFor(8, 7)).toBe('mul:7x8');
  });

  it('round-trips every key and rejects anything out of range or malformed', () => {
    for (const f of allMultiplicationFacts()) expect(parseSkillKey(f.skillKey)).toEqual(f);
    for (const bad of ['', 'mul:1x5', 'mul:8x7', 'mul:2x10', 'add:2x3', 'mul:2x3; drop', 'mul:ax3']) {
      expect(parseSkillKey(bad)).toBeNull();
    }
  });

  it('labels facts for display', () => {
    expect(factLabel({ a: 7, b: 8 })).toBe('7 × 8');
    expect(factLabel({ a: 7, b: 8 }, true)).toBe('8 × 7');
    expect(labelForSkillKey('mul:7x8')).toBe('7 × 8');
    expect(labelForSkillKey('nonsense')).toBe('nonsense');
  });
});
