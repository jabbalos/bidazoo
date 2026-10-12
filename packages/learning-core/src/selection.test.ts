import { describe, expect, it } from 'vitest';
import { applyAttempt, newMasteryState, type MasteryState } from './mastery';
import { allMultiplicationFacts } from './multiplication';
import {
  SELECTION_CONFIG,
  selectNextSkill,
  type SessionHistoryItem,
} from './selection';

const NOW = new Date(Date.UTC(2026, 9, 11, 12));

/** Plays a whole session with a scripted answerer and returns what was asked. */
function playSession(options: {
  seed: string;
  length: number;
  mastery?: Map<string, MasteryState>;
  answer: (skillKey: string, sequence: number) => boolean;
}): SessionHistoryItem[] {
  const history: SessionHistoryItem[] = [];
  for (let sequence = 1; sequence <= options.length; sequence++) {
    const pick = selectNextSkill({
      seed: `${options.seed}:${sequence}`,
      now: NOW,
      mastery: options.mastery ?? new Map(),
      history,
    });
    history.push({ skillKey: pick.skillKey, reason: pick.reason, correct: options.answer(pick.skillKey, sequence) });
  }
  return history;
}

describe('selectNextSkill', () => {
  it('is deterministic for the same inputs', () => {
    const a = playSession({ seed: 's1', length: 10, answer: () => true });
    const b = playSession({ seed: 's1', length: 10, answer: () => true });
    expect(a).toEqual(b);
  });

  it('a first-time player gets 10 distinct new facts when everything is correct', () => {
    const history = playSession({ seed: 'first', length: 10, answer: () => true });
    expect(new Set(history.map((h) => h.skillKey)).size).toBe(10);
    expect(history.every((h) => h.reason === 'new')).toBe(true);
  });

  it('starts new players on easier facts', () => {
    const history = playSession({ seed: 'easy', length: 10, answer: () => true });
    const hard = allMultiplicationFacts().filter((f) => f.product >= 56).map((f) => f.skillKey);
    expect(history.slice(0, 3).some((h) => hard.includes(h.skillKey))).toBe(false);
  });

  it('serves due facts before new ones', () => {
    const missed = applyAttempt(null, { correct: false, responseMs: 1000, now: new Date(NOW.getTime() - 86_400_000) }).state;
    const mastery = new Map([['mul:7x8', missed]]);
    const pick = selectNextSkill({ seed: 'due', now: NOW, mastery, history: [] });
    expect(pick).toEqual({ skillKey: 'mul:7x8', reason: 'due' });
  });

  it('limits brand-new facts per session when seen facts are available', () => {
    const mastery = new Map<string, MasteryState>();
    for (const f of allMultiplicationFacts().slice(0, 20)) {
      mastery.set(f.skillKey, applyAttempt(null, { correct: true, responseMs: 1000, now: new Date(NOW.getTime() - 7 * 86_400_000) }).state);
    }
    const history = playSession({ seed: 'cap', length: 10, mastery, answer: () => true });
    expect(history.filter((h) => h.reason === 'new').length).toBeLessThanOrEqual(SELECTION_CONFIG.maxNewPerSession);
  });

  it('never repeats a fact in a session unless it is a retry of a miss', () => {
    for (let i = 0; i < 25; i++) {
      const history = playSession({ seed: `rep${i}`, length: 10, answer: (_, seq) => seq % 3 !== 0 });
      const seen = new Set<string>();
      for (const h of history) {
        if (h.reason !== 'retry') expect(seen.has(h.skillKey)).toBe(false);
        seen.add(h.skillKey);
      }
    }
  });
});

describe('bounded retry', () => {
  it('re-asks a missed fact after a gap, never immediately', () => {
    const history = playSession({ seed: 'retry', length: 10, answer: (_, seq) => seq !== 1 });
    const firstMiss = history[0]?.skillKey as string;
    const retryIndex = history.findIndex((h, i) => i > 0 && h.skillKey === firstMiss);
    expect(retryIndex).toBeGreaterThanOrEqual(1 + SELECTION_CONFIG.minGapBeforeRetry);
    expect(history[retryIndex]?.reason).toBe('retry');
  });

  it('stops retrying a fact the child keeps missing (per-fact cap)', () => {
    const stubborn = (history: SessionHistoryItem[]) => history.filter((h) => h.reason === 'retry' && h.skillKey === history[0]?.skillKey).length;
    const history = playSession({ seed: 'stubborn', length: 10, answer: (key) => key !== playSessionFirst('stubborn') });
    expect(stubborn(history)).toBeLessThanOrEqual(SELECTION_CONFIG.maxRetriesPerFact);
  });

  it('caps retries per session even if every answer is wrong', () => {
    for (let i = 0; i < 20; i++) {
      const history = playSession({ seed: `allwrong${i}`, length: 10, answer: () => false });
      const retries = history.filter((h) => h.reason === 'retry').length;
      expect(retries).toBeLessThanOrEqual(SELECTION_CONFIG.maxRetriesPerSession);
      expect(new Set(history.map((h) => h.skillKey)).size).toBeGreaterThanOrEqual(10 - SELECTION_CONFIG.maxRetriesPerSession);
    }
  });

  it('does not retry a fact that was later answered correctly', () => {
    const history: SessionHistoryItem[] = [
      { skillKey: 'mul:2x3', reason: 'new', correct: false },
      { skillKey: 'mul:2x4', reason: 'new', correct: true },
      { skillKey: 'mul:2x5', reason: 'new', correct: true },
      { skillKey: 'mul:2x3', reason: 'retry', correct: true },
    ];
    const pick = selectNextSkill({ seed: 'x', now: NOW, mastery: new Map(), history });
    expect(pick.reason).not.toBe('retry');
  });
});

function playSessionFirst(seed: string): string {
  return playSession({ seed, length: 1, answer: () => true })[0]?.skillKey as string;
}

describe('selection uses mastery state', () => {
  it('rests a recently reviewed mastered fact', () => {
    let state: MasteryState = newMasteryState(NOW);
    for (let i = 0; i < 5; i++) {
      state = applyAttempt(state, { correct: true, responseMs: 1000, now: new Date(Date.UTC(2026, 9, 10 + (i > 3 ? 1 : 0), 9 + i)) }).state;
    }
    expect(state.masteredAt).not.toBeNull();
    const mastery = new Map([['mul:2x2', state]]);
    for (let i = 0; i < 10; i++) {
      const pick = selectNextSkill({ seed: `rest${i}`, now: NOW, mastery, history: [] });
      expect(pick.skillKey).not.toBe('mul:2x2');
    }
  });
});
