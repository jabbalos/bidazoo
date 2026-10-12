/**
 * Mastery: Leitner boxes with a fluency requirement.
 *
 * Adapted from Fact Crew's mastery rules. In plain terms:
 *  - Every fact sits in a box from 0 to 5. A fluent correct answer moves it up one box.
 *    A correct but slow answer keeps it where it is. A miss moves it down one box and makes it
 *    due again right away.
 *  - Each box waits a number of days before the fact is due for review: 0, 0, 1, 3, 7, 21.
 *  - A fact is MASTERED only when it is in box 4 or higher, has 3 or more correct answers in a
 *    row, and was answered correctly AND fluently on at least 2 different days. One lucky
 *    session can never master a fact. A miss un-masters it.
 *
 * Difference from Fact Crew: "fluent" is decided from a response time the SERVER measured, and
 * the days are UTC calendar days. Everything here is pure; time is passed in.
 */

export const MASTERY_CONFIG = {
  /** Days to wait before review, by box. */
  boxDays: [0, 0, 1, 3, 7, 21] as readonly number[],
  /** A correct answer at or under this many milliseconds counts as fluent. Includes network latency. */
  fluentMs: 6000,
  masteredBox: 4,
  masteredStreak: 3,
  masteredFluentDays: 2,
  maxBox: 5,
} as const;

export type MasteryConfig = typeof MASTERY_CONFIG;

const DAY_MS = 86_400_000;

export interface MasteryState {
  box: number;
  /** Consecutive correct answers. */
  streak: number;
  attempts: number;
  correctCount: number;
  /** Number of distinct UTC days on which the fact was answered correctly and fluently. */
  fluentDays: number;
  /** UTC day (YYYY-MM-DD) of the most recent fluent answer. */
  lastFluentDay: string | null;
  lastAttemptAt: Date | null;
  nextReviewAt: Date;
  masteredAt: Date | null;
}

export interface AttemptObservation {
  correct: boolean;
  /** Server-measured. */
  responseMs: number;
  now: Date;
}

export interface MasteryUpdate {
  state: MasteryState;
  fluent: boolean;
  becameMastered: boolean;
  lostMastery: boolean;
}

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isFluent(correct: boolean, responseMs: number, config: MasteryConfig = MASTERY_CONFIG): boolean {
  return correct && responseMs <= config.fluentMs;
}

export function newMasteryState(now: Date): MasteryState {
  return {
    box: 0,
    streak: 0,
    attempts: 0,
    correctCount: 0,
    fluentDays: 0,
    lastFluentDay: null,
    lastAttemptAt: null,
    nextReviewAt: now,
    masteredAt: null,
  };
}

export function isMastered(state: MasteryState, config: MasteryConfig = MASTERY_CONFIG): boolean {
  return (
    state.box >= config.masteredBox &&
    state.streak >= config.masteredStreak &&
    state.fluentDays >= config.masteredFluentDays
  );
}

/** Returns a NEW state; the previous one is untouched. */
export function applyAttempt(
  previous: MasteryState | null,
  observation: AttemptObservation,
  config: MasteryConfig = MASTERY_CONFIG,
): MasteryUpdate {
  const { correct, responseMs, now } = observation;
  const before = previous ?? newMasteryState(now);
  const wasMastered = before.masteredAt !== null;
  const fluent = isFluent(correct, responseMs, config);

  let box = before.box;
  let streak = before.streak;
  let fluentDays = before.fluentDays;
  let lastFluentDay = before.lastFluentDay;
  let nextReviewAt: Date;

  if (correct) {
    streak += 1;
    if (fluent) {
      box = Math.min(config.maxBox, box + 1);
      const today = utcDay(now);
      // Days only move forward; a clock that steps back must not double count a day.
      if (lastFluentDay === null || today > lastFluentDay) {
        fluentDays += 1;
        lastFluentDay = today;
      }
    }
    nextReviewAt = new Date(now.getTime() + (config.boxDays[box] ?? 0) * DAY_MS);
  } else {
    streak = 0;
    box = Math.max(0, box - 1);
    nextReviewAt = now;
  }

  const state: MasteryState = {
    box,
    streak,
    attempts: before.attempts + 1,
    correctCount: before.correctCount + (correct ? 1 : 0),
    fluentDays,
    lastFluentDay,
    lastAttemptAt: now,
    nextReviewAt,
    masteredAt: null,
  };
  const mastered = isMastered(state, config);
  state.masteredAt = mastered ? (wasMastered ? before.masteredAt : now) : null;

  return {
    state,
    fluent,
    becameMastered: mastered && !wasMastered,
    lostMastery: !mastered && wasMastered,
  };
}

/**
 * How much a fact needs practice right now: higher means sooner. Due and weak facts first.
 * Brand-new facts score below anything that is due, so reviews are never starved by novelty.
 */
export function priority(state: MasteryState | null | undefined, now: Date): number {
  if (!state || state.attempts === 0) return 50;
  const due = now.getTime() >= state.nextReviewAt.getTime();
  const overdueDays = Math.max(0, now.getTime() - state.nextReviewAt.getTime()) / DAY_MS;
  const missedLastTime = state.streak === 0 ? 15 : 0;
  let score = (due ? 60 : 0) + Math.min(30, overdueDays * 5) + missedLastTime + (5 - state.box) * 6;
  if (state.masteredAt !== null && !due) score -= 80;
  return score;
}
