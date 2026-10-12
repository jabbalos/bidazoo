import type { ChoiceId, PublicChoice } from '@bidazoo/contracts';
import type { Rng } from './rng';

export interface BuiltChoices {
  choices: PublicChoice[];
  correctChoiceId: ChoiceId;
}

export interface BuildChoicesInput {
  rng: Rng;
  correct: string;
  /** Candidate wrong answers. May contain duplicates or the correct answer; both are filtered out. */
  distractorCandidates: readonly string[];
  /** Total number of choices, including the correct one. Minimum 2. */
  count: number;
}

const normalize = (value: string): string => value.trim().toLowerCase();

/**
 * Builds a shuffled multiple-choice set.
 *
 * Guarantees: the correct answer appears exactly once; no distractor equals
 * the correct answer (compared case/whitespace-insensitively); distractors are unique.
 * Choice ids are assigned AFTER shuffling and are purely positional ("c1", "c2", ...),
 * so an id never reveals which choice is correct.
 */
export function buildChoices(input: BuildChoicesInput): BuiltChoices {
  const { rng, correct, distractorCandidates, count } = input;
  if (!Number.isInteger(count) || count < 2) {
    throw new RangeError('count must be an integer >= 2');
  }

  const seen = new Set<string>([normalize(correct)]);
  const distractors: string[] = [];
  for (const candidate of distractorCandidates) {
    const key = normalize(candidate);
    if (!seen.has(key)) {
      seen.add(key);
      distractors.push(candidate);
    }
  }

  const needed = count - 1;
  if (distractors.length < needed) {
    throw new Error(
      `Not enough unique distractors: need ${needed}, have ${distractors.length}`,
    );
  }

  const labels = rng.shuffle([correct, ...rng.shuffle(distractors).slice(0, needed)]);
  const choices = labels.map((label, index) => ({ id: `c${index + 1}`, label }));
  const correctIndex = labels.indexOf(correct);
  const correctChoice = choices[correctIndex];
  if (!correctChoice) {
    throw new Error('Invariant violated: correct choice missing after shuffle');
  }
  return { choices, correctChoiceId: correctChoice.id };
}
