import { describe, expect, it } from 'vitest';
import { importedSkillKey, isImportedSkillKey, labelForSkillKey, parseImportedSkillKey, parseSkillKey } from './index';

describe('imported skill keys', () => {
  it('round-trips grade and skill tag, including commas, colons and grade 0', () => {
    for (const [grade, skill] of [[3, 'Place value to 100,000'], [0, 'Number recognition to 20'], [8, 'Ratio: unit rates']] as const) {
      const key = importedSkillKey(grade, skill);
      expect(key).toBe(`imp:${grade}:${skill}`);
      expect(parseImportedSkillKey(key)).toEqual({ grade, skill });
    }
  });
  it('the label names the skill; multiplication labels are unchanged', () => {
    expect(labelForSkillKey('imp:3:Place value to 100,000')).toBe('Place value to 100,000');
    expect(labelForSkillKey('mul:7x8')).toBe('7 × 8');
    expect(labelForSkillKey('nonsense')).toBe('nonsense');
  });
  it('imported keys are never multiplication facts and vice versa', () => {
    expect(parseSkillKey('imp:3:x')).toBeNull();
    expect(isImportedSkillKey('mul:7x8')).toBe(false);
    expect(parseImportedSkillKey('imp::x')).toBeNull();
    expect(parseImportedSkillKey('imp:3:')).toBeNull();
  });
  it('rejects bad input', () => {
    expect(() => importedSkillKey(-1, 'x')).toThrow();
    expect(() => importedSkillKey(3, '  ')).toThrow();
  });
});
