import { describe, expect, it } from 'vitest';
import {
  EYE_LINE_Y_FRACTION,
  HEAD_FILL,
  RUNTIME_ART,
  computeExpressionPlacement,
  getRuntimeExpression,
} from '../../games/zoo-sprint/src/character-assets';
import { EXPRESSION_STATES, type CastId } from '../../games/zoo-sprint/src/character-definitions';

/**
 * Checkpoint F3, Lane A: the placement rule keeps Dino's head the same size and in the same place
 * in every expression, using M4's own metadata (eye line, head core, head_scale) and no
 * hand-tuned per-expression offsets.
 */
const SIZES = [60, 96, 124, 150, 190, 260, 360, 520];

function place(state: (typeof EXPRESSION_STATES)[number], size: number) {
  const placement = computeExpressionPlacement('dino', state, size);
  const expression = getRuntimeExpression('dino', state);
  if (!placement || !expression) throw new Error(`no Dino placement for ${state}`);
  return { placement, expression };
}

/** Image top-left, relative to the bust center, in display pixels. */
function topLeft(state: (typeof EXPRESSION_STATES)[number], size: number): { left: number; top: number } {
  const { placement } = place(state, size);
  return { left: placement.x - placement.originX * placement.displayWidth, top: placement.y - placement.originY * placement.displayHeight };
}

describe('Dino placement (F3)', () => {
  it('has no placement for characters without runtime art', () => {
    for (const id of ['koala', 'tarsier', 'eagle', 'bronco', 'click'] as CastId[]) {
      expect(computeExpressionPlacement(id, 'idle', 120)).toBeUndefined();
    }
  });

  it('uses one scale for all six expressions, so no expression resizes the head', () => {
    for (const size of SIZES) {
      const scales = EXPRESSION_STATES.map((state) => place(state, size).placement.scale);
      expect(new Set(scales).size).toBe(1);
      expect(scales[0]).toBeCloseTo(((RUNTIME_ART.dino?.headScale ?? 0) * size * HEAD_FILL) / 100, 10);
    }
  });

  it('keeps the original aspect ratio of every PNG (no stretching)', () => {
    for (const state of EXPRESSION_STATES) {
      const { placement, expression } = place(state, 150);
      expect(placement.displayWidth / placement.displayHeight).toBeCloseTo(expression.width / expression.height, 10);
    }
  });

  it('puts the eye line on the same row in every expression (the M4 vertical anchor)', () => {
    for (const size of SIZES) {
      const rows = EXPRESSION_STATES.map((state) => {
        const { placement, expression } = place(state, size);
        return topLeft(state, size).top + expression.eyeLineY * placement.scale;
      });
      for (const row of rows) expect(row).toBeCloseTo(EYE_LINE_Y_FRACTION * size, 8);
    }
  });

  it('puts the head-core center on the same column in every expression (no sideways slide)', () => {
    for (const size of SIZES) {
      for (const state of EXPRESSION_STATES) {
        const { placement, expression } = place(state, size);
        const [x0, , x1] = expression.coreBox;
        expect(topLeft(state, size).left + ((x0 + x1) / 2) * placement.scale).toBeCloseTo(0, 8);
      }
    }
  });

  it('keeps the drawn head width within 12% across expressions (the art itself varies that much)', () => {
    const widths = EXPRESSION_STATES.map((state) => {
      const { placement, expression } = place(state, 150);
      return (expression.coreBox[2] - expression.coreBox[0]) * placement.scale;
    });
    expect(Math.max(...widths) / Math.min(...widths)).toBeLessThan(1.12);
  });

  it('keeps every expression fully inside its bust box with a margin, so nothing clips', () => {
    for (const size of SIZES) {
      const margin = size * 0.03;
      for (const state of EXPRESSION_STATES) {
        const { placement } = place(state, size);
        const { left, top } = topLeft(state, size);
        expect(left, `${state}@${size} left`).toBeGreaterThanOrEqual(-size / 2 + margin);
        expect(top, `${state}@${size} top`).toBeGreaterThanOrEqual(-size / 2 + margin);
        expect(left + placement.displayWidth, `${state}@${size} right`).toBeLessThanOrEqual(size / 2 - margin);
        expect(top + placement.displayHeight, `${state}@${size} bottom`).toBeLessThanOrEqual(size / 2 - margin);
      }
    }
  });

  it('is pure: the same inputs give the same frozen result', () => {
    const a = computeExpressionPlacement('dino', 'cheer', 150);
    const b = computeExpressionPlacement('dino', 'cheer', 150);
    expect(a).toEqual(b);
    expect(Object.isFrozen(a)).toBe(true);
  });
});
