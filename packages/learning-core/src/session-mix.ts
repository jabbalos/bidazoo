/**
 * Session mix: which questions of a session are generated multiplication and which are imported.
 *
 * Blocks of 10 questions: 6 generated multiplication and 4 imported, repeated for the session
 * length. A last partial block keeps the same 6:4 ratio, rounded (a 15-question expedition is
 * 9 generated and 6 imported). Within a block the order is shuffled from the seed.
 *
 * Which GRADE's imported items a player gets is an owner decision that is still pending, so the
 * grade is an input here and nothing in this file chooses it.
 *
 * Pure: imported items are passed in (this package never reads them). Only ids are returned.
 */
import { createRng } from './rng';

export const MIX_BLOCK_SIZE = 10;
export const MIX_GENERATED_PER_BLOCK = 6;

export type MixSource = 'generated' | 'imported';

/** The structural minimum a candidate imported item must have. */
export interface MixItem {
  id: string;
  /** 0 is kindergarten. */
  grade: number;
  /** Items whose data table the prompt cannot show are never selected. */
  needsTable?: boolean;
}

export type MixSlot = { source: 'generated' } | { source: 'imported'; itemId: string };

export function mixCounts(length: number): { generated: number; imported: number } {
  if (!Number.isInteger(length) || length < 0) throw new RangeError(`Invalid session length ${length}`);
  const fullBlocks = Math.floor(length / MIX_BLOCK_SIZE);
  const rest = length % MIX_BLOCK_SIZE;
  const restGenerated = Math.round((rest * MIX_GENERATED_PER_BLOCK) / MIX_BLOCK_SIZE);
  const generated = fullBlocks * MIX_GENERATED_PER_BLOCK + restGenerated;
  return { generated, imported: length - generated };
}

/** The source of each question position, block by block, shuffled within each block. */
export function planSessionMix(length: number, seed: string): MixSource[] {
  const rng = createRng(`mix:${seed}`);
  const plan: MixSource[] = [];
  for (let start = 0; start < length; start += MIX_BLOCK_SIZE) {
    const size = Math.min(MIX_BLOCK_SIZE, length - start);
    const generated = size === MIX_BLOCK_SIZE ? MIX_GENERATED_PER_BLOCK : mixCounts(size).generated;
    const block: MixSource[] = [
      ...Array.from({ length: generated }, (): MixSource => 'generated'),
      ...Array.from({ length: size - generated }, (): MixSource => 'imported'),
    ];
    plan.push(...rng.shuffle(block));
  }
  return plan;
}

export interface SelectImportedOptions<T extends MixItem> {
  items: readonly T[];
  /** The grade to draw from (0 = kindergarten). An input, never a default. */
  grade: number;
  count: number;
  seed: string;
  /** Item ids already served to this player (this session or earlier); never repeated. */
  excludeIds?: readonly string[];
}

/** Up to `count` distinct items of `grade`, chosen deterministically from the seed. */
export function selectImportedItems<T extends MixItem>(options: SelectImportedOptions<T>): T[] {
  const excluded = new Set(options.excludeIds ?? []);
  const pool = options.items
    .filter((item) => item.grade === options.grade && !item.needsTable && !excluded.has(item.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // stable base order, then seeded shuffle
  return createRng(`pick:${options.seed}`).shuffle(pool).slice(0, Math.max(0, options.count));
}

export interface BuildMixOptions<T extends MixItem> {
  length: number;
  grade: number;
  items: readonly T[];
  seed: string;
  excludeIds?: readonly string[];
}

/**
 * The full plan for one session: one slot per question. If the grade has fewer unseen items than
 * the plan wants, the missing imported slots become generated multiplication, so a session is
 * always the requested length.
 */
export function buildSessionMix<T extends MixItem>(options: BuildMixOptions<T>): MixSlot[] {
  const plan = planSessionMix(options.length, options.seed);
  const wanted = plan.filter((source) => source === 'imported').length;
  const picked = selectImportedItems({
    items: options.items,
    grade: options.grade,
    count: wanted,
    seed: options.seed,
    ...(options.excludeIds ? { excludeIds: options.excludeIds } : {}),
  });
  let next = 0;
  return plan.map((source): MixSlot => {
    if (source === 'imported') {
      const item = picked[next];
      if (item) {
        next += 1;
        return { source: 'imported', itemId: item.id };
      }
    }
    return { source: 'generated' };
  });
}
