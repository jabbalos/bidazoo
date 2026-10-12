/**
 * Question generation: seeded, deterministic, multiple choice.
 *
 * Distractor strategies are adapted from Fact Crew: the answers a child actually gives when
 * they slip (a neighboring multiple, adding instead of multiplying, reversed digits, off by a
 * ten). Candidates are filtered so the correct answer appears exactly once and no two choices
 * match.
 *
 * Everything here is pure. The same (skillKey, seed) always produces the same question.
 */
import { createRng, type Rng } from './rng';
import { factLabel, parseSkillKey, type FactFamily } from './multiplication';

export const CHOICE_COUNT = 4;

export interface GeneratedQuestion {
  skillKey: string;
  prompt: string;
  /** Exactly CHOICE_COUNT distinct positive integers in display order. */
  choices: number[];
  /** PRIVATE. The caller must keep this server-side and never send it before grading. */
  correctAnswer: number;
}

export interface GenerateOptions {
  /**
   * Index the correct answer should NOT occupy (the previous question's slot), so that tapping
   * one position every time never pays off.
   */
  avoidAnswerIndex?: number;
}

function reverseDigits(n: number): number {
  return Number(String(n).split('').reverse().join(''));
}

/** Plausible wrong answers for a fact, most "human" first. May contain duplicates or the answer. */
export function distractorCandidates(fact: FactFamily): number[] {
  const { a, b, product } = fact;
  const candidates = [
    a * (b + 1),
    a * (b - 1),
    (a + 1) * b,
    (a - 1) * b,
    a + b,
    product + 10,
    product - 10,
    product + 1,
    product - 1,
  ];
  if (product >= 10) candidates.push(reverseDigits(product));
  return candidates;
}

function usableDistractors(fact: FactFamily): number[] {
  const seen = new Set<number>();
  for (const n of distractorCandidates(fact)) {
    if (Number.isInteger(n) && n > 0 && n !== fact.product) seen.add(n);
  }
  return [...seen];
}

function pickDistractors(fact: FactFamily, rng: Rng, count: number): number[] {
  const chosen = rng.shuffle(usableDistractors(fact)).slice(0, count);
  // Fill if the strategies produced too few distinct values (small facts like 2 x 2).
  for (let step = 1; chosen.length < count; step++) {
    for (const n of [fact.product + step, fact.product - step]) {
      if (chosen.length < count && n > 0 && n !== fact.product && !chosen.includes(n)) chosen.push(n);
    }
  }
  return chosen;
}

/** Generates the question for a skill. Throws on an unknown skill key (a programming error). */
export function generateQuestion(
  skillKey: string,
  seed: string,
  options: GenerateOptions = {},
): GeneratedQuestion {
  const fact = parseSkillKey(skillKey);
  if (!fact) throw new RangeError(`Unknown multiplication skill: ${skillKey}`);

  const rng = createRng(`${seed}|${skillKey}`);
  const swapped = fact.a !== fact.b && rng.next() < 0.5;
  const distractors = pickDistractors(fact, rng, CHOICE_COUNT - 1);

  let choices = rng.shuffle([fact.product, ...distractors]);
  const avoid = options.avoidAnswerIndex;
  if (avoid !== undefined && avoid >= 0 && avoid < CHOICE_COUNT && choices[avoid] === fact.product) {
    const swapWith = (avoid + 1 + rng.int(0, CHOICE_COUNT - 2)) % CHOICE_COUNT;
    choices = choices.slice();
    const current = choices[avoid] as number;
    choices[avoid] = choices[swapWith] as number;
    choices[swapWith] = current;
  }

  return {
    skillKey,
    prompt: factLabel(fact, swapped),
    choices,
    correctAnswer: fact.product,
  };
}
