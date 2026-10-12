import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng (deterministic seeded generation)', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng('seed-1');
    const b = createRng('seed-1');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng('seed-1');
    const b = createRng('seed-2');
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('keeps next() within [0, 1)', () => {
    const rng = createRng('range');
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('keeps int() within inclusive bounds and can hit both ends', () => {
    const rng = createRng('ints');
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('rejects invalid int ranges', () => {
    const rng = createRng('bad');
    expect(() => rng.int(5, 1)).toThrow(RangeError);
    expect(() => rng.int(1.5, 3)).toThrow(RangeError);
  });

  it('shuffle returns a permutation and does not mutate its input', () => {
    const rng = createRng('shuffle');
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...input];
    const out = rng.shuffle(input);
    expect(input).toEqual(copy);
    expect([...out].sort((x, y) => x - y)).toEqual(copy);
  });

  it('shuffle is deterministic for a given seed', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(createRng('s').shuffle(items)).toEqual(createRng('s').shuffle(items));
  });
});
