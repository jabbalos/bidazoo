/**
 * Multiplication fact families.
 *
 * Adapted from Fact Crew's "fact family" idea: the unit of learning is the unordered pair of
 * factors, because 7 x 8 and 8 x 7 are the same fact (a "turnaround"). One pair is one skill,
 * so practice on either order counts toward the same mastery record.
 *
 * The factor range is intentionally limited for the first vertical slice.
 */

export const FACTOR_MIN = 2;
export const FACTOR_MAX = 9;

/** An unordered pair of factors, stored with a <= b. */
export interface MultiplicationFact {
  a: number;
  b: number;
}

/** A fact together with everything derivable from it. */
export interface FactFamily extends MultiplicationFact {
  skillKey: string;
  product: number;
  /** Rough difficulty; larger products are harder. Used only to order brand-new facts. */
  difficulty: number;
}

const KEY_PATTERN = /^mul:(\d+)x(\d+)$/;

/** Stable identifier for a fact. Always smaller factor first, so turnarounds share a key. */
export function skillKeyFor(x: number, y: number): string {
  const a = Math.min(x, y);
  const b = Math.max(x, y);
  return `mul:${a}x${b}`;
}

function inRange(n: number): boolean {
  return Number.isInteger(n) && n >= FACTOR_MIN && n <= FACTOR_MAX;
}

/** Parses a skill key; returns null for anything that is not a fact in the supported range. */
export function parseSkillKey(skillKey: string): FactFamily | null {
  const match = KEY_PATTERN.exec(skillKey);
  if (!match) return null;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (!inRange(a) || !inRange(b) || a > b) return null;
  return { a, b, skillKey, product: a * b, difficulty: a * b };
}

/** Every fact in the supported range, in a stable order (36 facts for 2..9). */
export function allMultiplicationFacts(): FactFamily[] {
  const out: FactFamily[] = [];
  for (let a = FACTOR_MIN; a <= FACTOR_MAX; a++) {
    for (let b = a; b <= FACTOR_MAX; b++) {
      out.push({ a, b, skillKey: skillKeyFor(a, b), product: a * b, difficulty: a * b });
    }
  }
  return out;
}

/** Display text such as "7 × 8". Either order of the same fact has the same skill key. */
export function factLabel(fact: MultiplicationFact, swapped = false): string {
  return swapped ? `${fact.b} × ${fact.a}` : `${fact.a} × ${fact.b}`;
}

/** Display text for a skill key, in canonical order. Returns the key itself if unknown. */
export function labelForSkillKey(skillKey: string): string {
  const fact = parseSkillKey(skillKey);
  return fact ? factLabel(fact) : skillKey;
}
