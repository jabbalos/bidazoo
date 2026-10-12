/**
 * Choosing the next fact for a session: due and weak facts first, a few new ones at a time,
 * and a bounded retry for facts missed earlier in the same session.
 *
 * Adapted from Fact Crew's Mastery Quest. Retries are capped (per fact and per session) so a
 * struggling child never falls into a loop of the same question.
 */
import { createRng } from './rng';
import { allMultiplicationFacts } from './multiplication';
import { priority, type MasteryState } from './mastery';

export const SELECTION_CONFIG = {
  /** At most this many brand-new facts in one session, while seen facts remain available. */
  maxNewPerSession: 4,
  /** A missed fact may be asked again at most this many times in the session. */
  maxRetriesPerFact: 2,
  /** ...and the whole session may contain at most this many retries. */
  maxRetriesPerSession: 3,
  /** A retry never comes immediately: at least this many other questions in between. */
  minGapBeforeRetry: 2,
} as const;

export type SelectionReason = 'new' | 'due' | 'review' | 'retry';

/** One question already issued and graded earlier in this session. */
export interface SessionHistoryItem {
  skillKey: string;
  correct: boolean;
  reason: SelectionReason;
}

export interface SelectionInput {
  /** Seed unique to this question slot (session seed plus sequence). */
  seed: string;
  now: Date;
  /** Mastery rows for this player, by skill key. Missing means never seen. */
  mastery: ReadonlyMap<string, MasteryState>;
  /** Graded questions of this session, oldest first. */
  history: readonly SessionHistoryItem[];
  config?: typeof SELECTION_CONFIG;
}

export interface Selection {
  skillKey: string;
  reason: SelectionReason;
}

function pickRetry(
  history: readonly SessionHistoryItem[],
  config: typeof SELECTION_CONFIG,
): string | null {
  const retriesUsed = new Map<string, number>();
  const lastIndex = new Map<string, number>();
  let sessionRetries = 0;
  history.forEach((item, index) => {
    if (item.reason === 'retry') {
      retriesUsed.set(item.skillKey, (retriesUsed.get(item.skillKey) ?? 0) + 1);
      sessionRetries += 1;
    }
    lastIndex.set(item.skillKey, index);
  });
  if (sessionRetries >= config.maxRetriesPerSession) return null;

  // Oldest unresolved miss first.
  for (const [skillKey, index] of [...lastIndex.entries()].sort((x, y) => x[1] - y[1])) {
    const last = history[index] as SessionHistoryItem;
    if (last.correct) continue;
    if ((retriesUsed.get(skillKey) ?? 0) >= config.maxRetriesPerFact) continue;
    const otherQuestionsSince = history.length - 1 - index;
    if (otherQuestionsSince < config.minGapBeforeRetry) continue;
    return skillKey;
  }
  return null;
}

export function selectNextSkill(input: SelectionInput): Selection {
  const config = input.config ?? SELECTION_CONFIG;
  const retry = pickRetry(input.history, config);
  if (retry) return { skillKey: retry, reason: 'retry' };

  const rng = createRng(input.seed);
  const askedThisSession = new Set(input.history.map((item) => item.skillKey));
  const newSoFar = input.history.filter((item) => item.reason === 'new').length;

  const candidates = allMultiplicationFacts()
    .filter((fact) => !askedThisSession.has(fact.skillKey))
    .map((fact) => {
      const state = input.mastery.get(fact.skillKey) ?? null;
      const isNew = !state || state.attempts === 0;
      // Easier unseen facts first; the jitter keeps sessions from being identical.
      const score = isNew
        ? 50 - fact.difficulty / 6 + rng.next() * 6
        : priority(state, input.now) + rng.next() * 4;
      const due = !isNew && input.now.getTime() >= (state as MasteryState).nextReviewAt.getTime();
      return { skillKey: fact.skillKey, isNew, due, score };
    })
    .sort((x, y) => y.score - x.score || x.skillKey.localeCompare(y.skillKey));

  const seenAvailable = candidates.some((candidate) => !candidate.isNew);
  const eligible =
    newSoFar >= config.maxNewPerSession && seenAvailable
      ? candidates.filter((candidate) => !candidate.isNew)
      : candidates;

  const best = eligible[0];
  if (!best) {
    // Every fact has been asked already (cannot happen in a 10-question session over 36 facts).
    throw new RangeError('No eligible skill left to select');
  }
  return { skillKey: best.skillKey, reason: best.isNew ? 'new' : best.due ? 'due' : 'review' };
}
