import { describe, expect, it } from 'vitest';
import { buildSessionMix, mixCounts, planSessionMix, selectImportedItems, type MixItem } from './session-mix';

function items(grade: number, n: number, extra: Partial<MixItem> = {}): MixItem[] {
  return Array.from({ length: n }, (_, i) => ({ id: `G${grade}-${String(i).padStart(3, '0')}`, grade, ...extra }));
}
const count = (plan: readonly string[], s: string) => plan.filter((x) => x === s).length;

describe('mixCounts', () => {
  it('blocks of 10 are 6 generated and 4 imported', () => {
    expect(mixCounts(10)).toEqual({ generated: 6, imported: 4 });
    expect(mixCounts(20)).toEqual({ generated: 12, imported: 8 });
  });
  it('a 15-question expedition is 9 and 6', () => {
    expect(mixCounts(15)).toEqual({ generated: 9, imported: 6 });
  });
  it('always adds up to the length', () => {
    for (let n = 0; n <= 40; n++) {
      const c = mixCounts(n);
      expect(c.generated + c.imported).toBe(n);
    }
  });
  it('rejects a bad length', () => {
    expect(() => mixCounts(-1)).toThrow();
    expect(() => mixCounts(2.5)).toThrow();
  });
});

describe('planSessionMix', () => {
  it('every full block of 10 has exactly 6 generated and 4 imported', () => {
    const plan = planSessionMix(30, 'seed-a');
    expect(plan).toHaveLength(30);
    for (let b = 0; b < 3; b++) {
      const block = plan.slice(b * 10, b * 10 + 10);
      expect(count(block, 'generated')).toBe(6);
      expect(count(block, 'imported')).toBe(4);
    }
  });
  it('a 15-question plan has 9 generated and 6 imported', () => {
    const plan = planSessionMix(15, 'seed-b');
    expect(count(plan, 'generated')).toBe(9);
    expect(count(plan, 'imported')).toBe(6);
  });
  it('is deterministic per seed and varies across seeds', () => {
    expect(planSessionMix(20, 'x')).toEqual(planSessionMix(20, 'x'));
    const orders = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((s) => planSessionMix(20, s).join()));
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe('selectImportedItems', () => {
  const pool = [...items(3, 12), ...items(4, 12), ...items(3, 3, { needsTable: true }).map((i) => ({ ...i, id: `T-${i.id}` }))];

  it('takes only the requested grade, distinct, without table items', () => {
    const picked = selectImportedItems({ items: pool, grade: 3, count: 8, seed: 's' });
    expect(picked).toHaveLength(8);
    expect(new Set(picked.map((p) => p.id)).size).toBe(8);
    for (const p of picked) {
      expect(p.grade).toBe(3);
      expect(p.needsTable).not.toBe(true);
    }
  });
  it('grade 0 (kindergarten) is a valid input', () => {
    expect(selectImportedItems({ items: items(0, 5), grade: 0, count: 3, seed: 's' })).toHaveLength(3);
  });
  it('never returns excluded ids and returns fewer when the grade runs out', () => {
    const exclude = items(3, 12).slice(0, 10).map((i) => i.id);
    const picked = selectImportedItems({ items: pool, grade: 3, count: 8, seed: 's', excludeIds: exclude });
    expect(picked).toHaveLength(2);
    for (const p of picked) expect(exclude).not.toContain(p.id);
  });
  it('is deterministic per seed regardless of input order', () => {
    const a = selectImportedItems({ items: pool, grade: 4, count: 5, seed: 'same' });
    const b = selectImportedItems({ items: [...pool].reverse(), grade: 4, count: 5, seed: 'same' });
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
  });
});

describe('buildSessionMix', () => {
  it('fills imported slots from the chosen grade, 6 and 4 per block', () => {
    const mix = buildSessionMix({ length: 10, grade: 5, items: [...items(5, 10), ...items(2, 10)], seed: 'm' });
    expect(mix.filter((s) => s.source === 'generated')).toHaveLength(6);
    const imported = mix.flatMap((s) => (s.source === 'imported' ? [s.itemId] : []));
    expect(imported).toHaveLength(4);
    expect(new Set(imported).size).toBe(4);
    for (const id of imported) expect(id.startsWith('G5-')).toBe(true);
  });
  it('no imported item repeats across blocks', () => {
    const mix = buildSessionMix({ length: 30, grade: 5, items: items(5, 40), seed: 'm2' });
    const ids = mix.flatMap((s) => (s.source === 'imported' ? [s.itemId] : []));
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
  });
  it('falls back to generated when the grade has too few items, keeping the length', () => {
    const mix = buildSessionMix({ length: 10, grade: 5, items: items(5, 1), seed: 'm3' });
    expect(mix).toHaveLength(10);
    expect(mix.filter((s) => s.source === 'imported')).toHaveLength(1);
    expect(mix.filter((s) => s.source === 'generated')).toHaveLength(9);
  });
  it('a grade with no items gives an all-generated session', () => {
    const mix = buildSessionMix({ length: 15, grade: 8, items: items(5, 20), seed: 'm4' });
    expect(mix.every((s) => s.source === 'generated')).toBe(true);
  });
  it('slots carry no answers: only a source and an item id', () => {
    const mix = buildSessionMix({ length: 10, grade: 5, items: items(5, 10), seed: 'm5' });
    for (const s of mix) expect(Object.keys(s).sort()).toEqual(s.source === 'imported' ? ['itemId', 'source'] : ['source']);
  });
});
