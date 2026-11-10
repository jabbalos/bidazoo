/**
 * Level curve (item C4). Pure: total XP in, level out. No clock, no I/O.
 *
 * The level is never stored. XP is the sum of the server's xp ledger, so the level is always
 * derived from it, and a client can only ever display it.
 *
 * Curve (placeholder numbers, PENDING owner tuning): reaching level L needs
 * `LEVEL_CURVE.xpStep * (L - 1) * L / 2` total XP, so each level costs `xpStep` more than the one
 * before it (level 2 at 100, level 3 at 300, level 4 at 600, level 5 at 1000 with the default step).
 * At the current rewards (10 XP per correct answer, 25 for finishing) a full session is worth
 * roughly 100 to 125 XP. The level stops at `maxLevel`.
 */
export const LEVEL_CURVE = {
  xpStep: 100,
  maxLevel: 50,
} as const;

export interface LevelProgress {
  /** 1 to `maxLevel`. */
  level: number;
  /** Total XP at which `level` began. */
  levelStartXp: number;
  /** Total XP at which the next level begins; null at the maximum level. */
  nextLevelXp: number | null;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP still needed for the next level; 0 at the maximum level. */
  xpToNextLevel: number;
  /** True at the maximum level. */
  maxed: boolean;
}

export interface LevelUp {
  fromLevel: number;
  toLevel: number;
  /** Levels gained (at least 1). */
  gained: number;
}

function assertXp(xp: number): void {
  if (!Number.isFinite(xp) || !Number.isInteger(xp) || xp < 0) {
    throw new RangeError('xp must be a non-negative integer');
  }
}

/** Total XP at which a level begins. Level 1 begins at 0. */
export function xpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > LEVEL_CURVE.maxLevel) {
    throw new RangeError(`level must be an integer from 1 to ${LEVEL_CURVE.maxLevel}`);
  }
  return (LEVEL_CURVE.xpStep * (level - 1) * level) / 2;
}

/** The level for a total XP, 1 to `maxLevel`. */
export function levelForXp(xp: number): number {
  assertXp(xp);
  let level = 1;
  while (level < LEVEL_CURVE.maxLevel && xp >= xpForLevel(level + 1)) level += 1;
  return level;
}

/** Everything a progress bar needs for a total XP. */
export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const levelStartXp = xpForLevel(level);
  const maxed = level === LEVEL_CURVE.maxLevel;
  const nextLevelXp = maxed ? null : xpForLevel(level + 1);
  return {
    level,
    levelStartXp,
    nextLevelXp,
    xpIntoLevel: xp - levelStartXp,
    xpToNextLevel: nextLevelXp === null ? 0 : nextLevelXp - xp,
    maxed,
  };
}

/**
 * The level-up caused by moving from `xpBefore` to `xpAfter`, or null when the level did not change.
 * A session can cross more than one level, so `gained` can be above 1.
 */
export function levelUpBetween(xpBefore: number, xpAfter: number): LevelUp | null {
  if (xpAfter < xpBefore) throw new RangeError('xp never goes down');
  const fromLevel = levelForXp(xpBefore);
  const toLevel = levelForXp(xpAfter);
  return toLevel > fromLevel ? { fromLevel, toLevel, gained: toLevel - fromLevel } : null;
}
