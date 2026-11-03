import { describe, expect, it } from 'vitest';
import {
  EYE_LINE_Y_FRACTION,
  HEAD_FILL,
  HEAD_UNITS,
  RUNTIME_ART,
  computeExpressionPlacement,
  getRuntimeExpression,
} from '../../games/zoo-sprint/src/character-assets';
import { CAST_SCALE_FACTORS, EXPRESSION_STATES, type CastId, type ExpressionState } from '../../games/zoo-sprint/src/character-definitions';

/**
 * Checkpoints F3 + F4: the placement rule keeps every cast member's head the same size and in the
 * same place in every expression, using M4's own metadata (eye line, head core, head_scale) and no
 * hand-tuned per-expression offsets. Dino was proven first (F3); F4 runs the same rule over the
 * whole cast, so the numbers below are the same assertions, once per character.
 *
 * Cast-relative scale (Eagle 1.000 ... Tarsier 0.57) is a rule for turnaround and proportion
 * guides. It is deliberately NOT applied here: a bust is always drawn at the size the scene asks
 * for, and "do not normalize apparent height" is checked in character-runtime-assets.test.ts.
 */
const SIZES = [60, 96, 124, 150, 190, 260, 360, 520];
const CAST: readonly CastId[] = ['dino', 'koala', 'tarsier', 'eagle', 'bronco', 'click'];

/** Every expression must leave this fraction of the bust box free on each side (the F3 Dino rule). */
const STANDARD_MARGIN = 0.03;

/**
 * The canonical M4 PNGs that fill their bust box more tightly than the standard margin. They still
 * sit inside the box (margin >= 0, nothing clips), and their transparent borders keep the visible
 * art off the edge. Tarsier TRY AGAIN is a wide 294 x 194 bust (arm and hand included). Adding to
 * this table needs a reason: it is a record of art that is tighter than the standard, not a way to
 * make a test pass.
 */
const TIGHT_FIT: Readonly<Partial<Record<CastId, Readonly<Partial<Record<ExpressionState, number>>>>>> = {
  tarsier: { tryAgain: 0 },
};

/**
 * How much wider the widest head core is than the narrowest, per character, in the M4 art itself.
 * This is a regression guard, not a target: it pins what the canonical art already does (for
 * example Tarsier's head-only IDLE and TRY AGAIN crops include the wide ears, so their cores are
 * about 1.8x the bust crops'). The head SIZE does not change, because every expression of one
 * character is drawn at one scale.
 */
const MAX_CORE_WIDTH_SPREAD: Readonly<Record<CastId, number>> = {
  dino: 1.12,
  koala: 1.18,
  tarsier: 1.84,
  eagle: 1.11,
  bronco: 1.18,
  click: 1.36,
};

function place(id: CastId, state: ExpressionState, size: number) {
  const placement = computeExpressionPlacement(id, state, size);
  const expression = getRuntimeExpression(id, state);
  if (!placement || !expression) throw new Error(`no ${id} placement for ${state}`);
  return { placement, expression };
}

/** Image top-left, relative to the bust center, in display pixels. */
function topLeft(id: CastId, state: ExpressionState, size: number): { left: number; top: number } {
  const { placement } = place(id, state, size);
  return { left: placement.x - placement.originX * placement.displayWidth, top: placement.y - placement.originY * placement.displayHeight };
}

describe('placement covers the whole cast (F4)', () => {
  it('has a placement for exactly the 36 cast x expression pairs, and none for anything else', () => {
    let count = 0;
    for (const id of CAST) for (const state of EXPRESSION_STATES) if (computeExpressionPlacement(id, state, 120)) count += 1;
    expect(count).toBe(36);
    expect(computeExpressionPlacement('nobody' as CastId, 'idle', 120)).toBeUndefined();
  });
});

for (const id of CAST) {
  describe(`${id} placement (F3/F4)`, () => {
    it('uses one scale for all six expressions, so no expression resizes the head', () => {
      for (const size of SIZES) {
        const scales = EXPRESSION_STATES.map((state) => place(id, state, size).placement.scale);
        expect(new Set(scales).size).toBe(1);
        expect(scales[0]).toBeCloseTo(((RUNTIME_ART[id]?.headScale ?? 0) * size * HEAD_FILL) / HEAD_UNITS, 10);
      }
    });

    it('keeps the original aspect ratio of every PNG (no stretching)', () => {
      for (const state of EXPRESSION_STATES) {
        const { placement, expression } = place(id, state, 150);
        expect(placement.displayWidth / placement.displayHeight).toBeCloseTo(expression.width / expression.height, 10);
      }
    });

    it('puts the eye line on the same row in every expression (the M4 vertical anchor)', () => {
      for (const size of SIZES) {
        for (const state of EXPRESSION_STATES) {
          const { placement, expression } = place(id, state, size);
          expect(topLeft(id, state, size).top + expression.eyeLineY * placement.scale).toBeCloseTo(EYE_LINE_Y_FRACTION * size, 8);
        }
      }
    });

    it('puts the head-core center on the same column in every expression (no sideways slide)', () => {
      for (const size of SIZES) {
        for (const state of EXPRESSION_STATES) {
          const { placement, expression } = place(id, state, size);
          const [x0, , x1] = expression.coreBox;
          expect(topLeft(id, state, size).left + ((x0 + x1) / 2) * placement.scale).toBeCloseTo(0, 8);
        }
      }
    });

    it('keeps the drawn head-core width within the spread the canonical art already has', () => {
      const widths = EXPRESSION_STATES.map((state) => {
        const { placement, expression } = place(id, state, 150);
        return (expression.coreBox[2] - expression.coreBox[0]) * placement.scale;
      });
      const spread = Math.max(...widths) / Math.min(...widths);
      expect(spread).toBeLessThan(MAX_CORE_WIDTH_SPREAD[id] + 1e-9);
      // ...and the guard is tight: it must not be loosened far past what the art needs.
      expect(spread).toBeGreaterThan(MAX_CORE_WIDTH_SPREAD[id] - 0.06);
    });

    it('keeps every expression fully inside its bust box with a margin, so nothing clips', () => {
      for (const size of SIZES) {
        for (const state of EXPRESSION_STATES) {
          const margin = size * (TIGHT_FIT[id]?.[state] ?? STANDARD_MARGIN);
          const { placement } = place(id, state, size);
          const { left, top } = topLeft(id, state, size);
          expect(left, `${id} ${state}@${size} left`).toBeGreaterThanOrEqual(-size / 2 + margin - 1e-9);
          expect(top, `${id} ${state}@${size} top`).toBeGreaterThanOrEqual(-size / 2 + margin - 1e-9);
          expect(left + placement.displayWidth, `${id} ${state}@${size} right`).toBeLessThanOrEqual(size / 2 - margin + 1e-9);
          expect(top + placement.displayHeight, `${id} ${state}@${size} bottom`).toBeLessThanOrEqual(size / 2 - margin + 1e-9);
        }
      }
    });

    it('only the documented tight fits are below the standard margin, and each is still needed', () => {
      for (const [state, margin] of Object.entries(TIGHT_FIT[id] ?? {})) {
        const { placement } = place(id, state as ExpressionState, 1000);
        const { left, top } = topLeft(id, state as ExpressionState, 1000);
        const slack = Math.min(left + 500, 500 - (left + placement.displayWidth), top + 500, 500 - (top + placement.displayHeight)) / 1000;
        expect(slack, `${id} ${state} exception is needed`).toBeLessThan(STANDARD_MARGIN);
        expect(slack, `${id} ${state} stays inside the box`).toBeGreaterThanOrEqual(margin - 1e-9);
      }
    });

    it('is pure: the same inputs give the same frozen result', () => {
      const a = computeExpressionPlacement(id, 'cheer', 150);
      const b = computeExpressionPlacement(id, 'cheer', 150);
      expect(a).toEqual(b);
      expect(Object.isFrozen(a)).toBe(true);
    });
  });
}

describe('cast-relative factors are not applied to busts (F4)', () => {
  it('the factors exist and are exact, but placement scale depends only on headScale, bust size and the fixed fill', () => {
    expect(CAST_SCALE_FACTORS).toEqual({ eagle: 1.0, click: 0.92, bronco: 0.92, dino: 0.85, koala: 0.76, tarsier: 0.57 });
    for (const id of CAST) {
      const scale = place(id, 'idle', 200).placement.scale;
      expect(scale).toBeCloseTo(((RUNTIME_ART[id]?.headScale ?? 0) * 200 * HEAD_FILL) / HEAD_UNITS, 10);
    }
  });
});
