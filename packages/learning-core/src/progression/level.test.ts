import { describe, expect, it } from 'vitest';
import { LEVEL_CURVE, levelForXp, levelProgress, levelUpBetween, xpForLevel } from './level';

describe('level curve', () => {
  it('starts at level 1 with 0 XP', () => {
    expect(levelForXp(0)).toBe(1);
    expect(xpForLevel(1)).toBe(0);
  });

  it('has the documented thresholds', () => {
    expect([2, 3, 4, 5].map(xpForLevel)).toEqual([100, 300, 600, 1000]);
  });

  it('changes level exactly at a threshold', () => {
    for (let level = 2; level <= LEVEL_CURVE.maxLevel; level += 1) {
      const at = xpForLevel(level);
      expect(levelForXp(at - 1)).toBe(level - 1);
      expect(levelForXp(at)).toBe(level);
    }
  });

  it('never goes down as XP grows and never passes the maximum', () => {
    let last = 1;
    for (let xp = 0; xp <= 200000; xp += 37) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(last);
      expect(level).toBeLessThanOrEqual(LEVEL_CURVE.maxLevel);
      last = level;
    }
    expect(levelForXp(10_000_000)).toBe(LEVEL_CURVE.maxLevel);
  });

  it('each level costs more than the one before', () => {
    for (let level = 2; level < LEVEL_CURVE.maxLevel; level += 1) {
      expect(xpForLevel(level + 1) - xpForLevel(level)).toBeGreaterThan(xpForLevel(level) - xpForLevel(level - 1));
    }
  });

  it('rejects invalid input', () => {
    expect(() => levelForXp(-1)).toThrow(RangeError);
    expect(() => levelForXp(1.5)).toThrow(RangeError);
    expect(() => levelForXp(Number.NaN)).toThrow(RangeError);
    expect(() => xpForLevel(0)).toThrow(RangeError);
    expect(() => xpForLevel(LEVEL_CURVE.maxLevel + 1)).toThrow(RangeError);
  });
});

describe('levelProgress', () => {
  it('reports the position inside a level', () => {
    expect(levelProgress(0)).toEqual({
      level: 1, levelStartXp: 0, nextLevelXp: 100, xpIntoLevel: 0, xpToNextLevel: 100, maxed: false,
    });
    expect(levelProgress(350)).toEqual({
      level: 3, levelStartXp: 300, nextLevelXp: 600, xpIntoLevel: 50, xpToNextLevel: 250, maxed: false,
    });
  });

  it('has no next level at the maximum', () => {
    const p = levelProgress(xpForLevel(LEVEL_CURVE.maxLevel) + 5);
    expect(p.maxed).toBe(true);
    expect(p.nextLevelXp).toBeNull();
    expect(p.xpToNextLevel).toBe(0);
    expect(p.xpIntoLevel).toBe(5);
  });
});

describe('levelUpBetween', () => {
  it('is null when the level does not change', () => {
    expect(levelUpBetween(10, 99)).toBeNull();
    expect(levelUpBetween(50, 50)).toBeNull();
  });

  it('reports a single level-up', () => {
    expect(levelUpBetween(90, 125)).toEqual({ fromLevel: 1, toLevel: 2, gained: 1 });
  });

  it('reports several levels crossed at once', () => {
    expect(levelUpBetween(0, 600)).toEqual({ fromLevel: 1, toLevel: 4, gained: 3 });
  });

  it('refuses XP that goes down', () => {
    expect(() => levelUpBetween(100, 50)).toThrow(RangeError);
  });
});
