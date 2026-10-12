/**
 * Deterministic, seedable pseudo-random numbers.
 *
 * Why: seeded generation makes questions reproducible in tests and lets the
 * server regenerate/verify a question from its seed. This is NOT cryptographic
 * randomness; never use it for tokens, secrets, or anything security-sensitive.
 */

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** Returns a new shuffled array; does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[];
}

/** xmur3 string hash -> 32-bit seed. */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32 generator seeded from a string. */
export function createRng(seed: string): Rng {
  let state = hashSeed(seed);

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Invalid integer range [${min}, ${max}]`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      const a = out[i] as T;
      const b = out[j] as T;
      out[i] = b;
      out[j] = a;
    }
    return out;
  };

  return { next, int, shuffle };
}
