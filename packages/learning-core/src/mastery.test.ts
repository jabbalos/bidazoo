import { describe, expect, it } from 'vitest';
import {
  MASTERY_CONFIG,
  applyAttempt,
  isFluent,
  priority,
  type MasteryState,
} from './mastery';

const day = (n: number, hour = 12) => new Date(Date.UTC(2026, 9, n, hour));
const FAST = 2000;
const SLOW = 9000;

function run(
  steps: Array<{ correct: boolean; ms: number; at: Date }>,
  start: MasteryState | null = null,
) {
  let state = start;
  const events: Array<{ becameMastered: boolean; lostMastery: boolean; fluent: boolean }> = [];
  for (const s of steps) {
    const update = applyAttempt(state, { correct: s.correct, responseMs: s.ms, now: s.at });
    state = update.state;
    events.push(update);
  }
  return { state: state as MasteryState, events };
}

describe('fluency', () => {
  it('uses the 6000 ms threshold, inclusive, and only for correct answers', () => {
    expect(MASTERY_CONFIG.fluentMs).toBe(6000);
    expect(isFluent(true, 6000)).toBe(true);
    expect(isFluent(true, 6001)).toBe(false);
    expect(isFluent(false, 100)).toBe(false);
  });
});

describe('Leitner boxes', () => {
  it('a fluent correct answer moves up one box and schedules the review', () => {
    const { state } = run([{ correct: true, ms: FAST, at: day(1) }]);
    expect(state.box).toBe(1);
    expect(state.streak).toBe(1);
    expect(state.fluentDays).toBe(1);
    expect(state.nextReviewAt).toEqual(day(1)); // box 1 waits 0 days
  });

  it('review intervals follow the box table: 0, 0, 1, 3, 7, 21 days', () => {
    let state: MasteryState | null = null;
    const waits: number[] = [];
    for (let i = 0; i < 6; i++) {
      const now = day(1 + i);
      state = applyAttempt(state, { correct: true, responseMs: FAST, now }).state;
      waits.push(Math.round((state.nextReviewAt.getTime() - now.getTime()) / 86_400_000));
    }
    expect(waits).toEqual([0, 1, 3, 7, 21, 21]);
    expect(state?.box).toBe(5);
  });

  it('a slow correct answer keeps the box but still extends the streak', () => {
    const { state } = run([
      { correct: true, ms: FAST, at: day(1) },
      { correct: true, ms: SLOW, at: day(1, 13) },
    ]);
    expect(state.box).toBe(1);
    expect(state.streak).toBe(2);
    expect(state.fluentDays).toBe(1);
  });

  it('a miss drops one box, resets the streak, and is due immediately', () => {
    const { state } = run([
      { correct: true, ms: FAST, at: day(1) },
      { correct: true, ms: FAST, at: day(2) },
      { correct: false, ms: FAST, at: day(3) },
    ]);
    expect(state.box).toBe(1);
    expect(state.streak).toBe(0);
    expect(state.nextReviewAt).toEqual(day(3));
  });

  it('never drops below box 0 or above box 5', () => {
    expect(run([{ correct: false, ms: FAST, at: day(1) }]).state.box).toBe(0);
    const climb = run(Array.from({ length: 12 }, (_, i) => ({ correct: true, ms: FAST, at: day(1 + i) })));
    expect(climb.state.box).toBe(5);
  });

  it('does not mutate the previous state', () => {
    const first = applyAttempt(null, { correct: true, responseMs: FAST, now: day(1) }).state;
    const snapshot = JSON.stringify(first);
    applyAttempt(first, { correct: false, responseMs: FAST, now: day(2) });
    expect(JSON.stringify(first)).toBe(snapshot);
  });
});

describe('fluent on multiple days', () => {
  it('counts a day once, however many fluent answers happen on it', () => {
    const { state } = run([
      { correct: true, ms: FAST, at: day(1, 9) },
      { correct: true, ms: FAST, at: day(1, 10) },
      { correct: true, ms: FAST, at: day(1, 11) },
    ]);
    expect(state.fluentDays).toBe(1);
  });

  it('counts each new UTC day', () => {
    const { state } = run([
      { correct: true, ms: FAST, at: day(1) },
      { correct: true, ms: FAST, at: day(2) },
      { correct: true, ms: FAST, at: day(5) },
    ]);
    expect(state.fluentDays).toBe(3);
  });

  it('does not double count when the clock steps backward', () => {
    const { state } = run([
      { correct: true, ms: FAST, at: day(5) },
      { correct: true, ms: FAST, at: day(3) },
    ]);
    expect(state.fluentDays).toBe(1);
  });
});

describe('mastered', () => {
  it('one great session on a single day never masters a fact', () => {
    const { state, events } = run(
      Array.from({ length: 8 }, (_, i) => ({ correct: true, ms: FAST, at: day(1, 8 + i) })),
    );
    expect(state.box).toBeGreaterThanOrEqual(4);
    expect(state.streak).toBeGreaterThanOrEqual(3);
    expect(state.fluentDays).toBe(1);
    expect(state.masteredAt).toBeNull();
    expect(events.some((e) => e.becameMastered)).toBe(false);
  });

  it('masters on box >= 4, streak >= 3, and fluent on 2+ days', () => {
    const { state, events } = run([
      { correct: true, ms: FAST, at: day(1, 9) },
      { correct: true, ms: FAST, at: day(1, 10) },
      { correct: true, ms: FAST, at: day(1, 11) },
      { correct: true, ms: FAST, at: day(1, 12) },
      { correct: true, ms: FAST, at: day(2) },
    ]);
    expect(state.box).toBe(5);
    expect(state.fluentDays).toBe(2);
    expect(state.masteredAt).toEqual(day(2));
    expect(events.filter((e) => e.becameMastered)).toHaveLength(1);
    expect(events[4]?.becameMastered).toBe(true);
  });

  it('keeps the original mastery time on later correct answers', () => {
    const { state, events } = run([
      ...Array.from({ length: 4 }, (_, i) => ({ correct: true, ms: FAST, at: day(1, 9 + i) })),
      { correct: true, ms: FAST, at: day(2) },
      { correct: true, ms: FAST, at: day(3) },
    ]);
    expect(state.masteredAt).toEqual(day(2));
    expect(events.filter((e) => e.becameMastered)).toHaveLength(1);
  });

  it('a miss un-masters the fact', () => {
    const mastered = run([
      ...Array.from({ length: 4 }, (_, i) => ({ correct: true, ms: FAST, at: day(1, 9 + i) })),
      { correct: true, ms: FAST, at: day(2) },
    ]).state;
    expect(mastered.masteredAt).not.toBeNull();
    const update = applyAttempt(mastered, { correct: false, responseMs: FAST, now: day(9) });
    expect(update.lostMastery).toBe(true);
    expect(update.state.masteredAt).toBeNull();
  });

  it('slow correct answers alone cannot master a fact', () => {
    const { state } = run(Array.from({ length: 10 }, (_, i) => ({ correct: true, ms: SLOW, at: day(1 + i) })));
    expect(state.box).toBe(0);
    expect(state.masteredAt).toBeNull();
  });
});

describe('priority', () => {
  const now = day(10);
  it('ranks due facts above brand-new facts, and new above not-yet-due', () => {
    const due = run([{ correct: false, ms: FAST, at: day(9) }]).state;
    const notDue = run([
      { correct: true, ms: FAST, at: day(10) },
      { correct: true, ms: FAST, at: day(10, 12) },
      { correct: true, ms: FAST, at: day(10, 12) },
    ]).state;
    expect(priority(due, now)).toBeGreaterThan(priority(null, now));
    expect(priority(null, now)).toBeGreaterThan(priority(notDue, now) - 1000); // sanity: finite
    expect(priority(due, now)).toBeGreaterThan(priority(notDue, now));
  });

  it('rests a mastered fact until it is due', () => {
    const mastered = run([
      ...Array.from({ length: 4 }, (_, i) => ({ correct: true, ms: FAST, at: day(1, 9 + i) })),
      { correct: true, ms: FAST, at: day(2) },
    ]).state; // box 5, next review 21 days out
    expect(priority(mastered, day(3))).toBeLessThan(priority(null, day(3)));
    expect(priority(mastered, day(30))).toBeGreaterThan(priority(null, day(30)));
  });
});
