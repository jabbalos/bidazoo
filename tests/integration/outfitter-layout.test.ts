import { describe, expect, it } from 'vitest';
import { GEAR_CATALOG, GEAR_SLOTS } from '../../apps/api/src/modules/progress/gear-catalog';
import { TAP_FLOOR, outfitterLayout, type Rect } from '../../games/zoo-sprint/src/basecamp/outfitter/outfitter-layout';

/**
 * The outfitter's cards stay tappable on every view the suite plays, in both orientations
 * (owner bug 4, November 10, 2026: on a phone turned on its side the three slot rows squeezed each
 * card to 32 px). Pure layout numbers; the overlay only draws them.
 */
const COUNTS = GEAR_SLOTS.map((slot) => GEAR_CATALOG.filter((i) => i.slot === slot).length);
const VIEWS = [
  [360, 640],
  [640, 360],
  [390, 844],
  [844, 390],
  [820, 1180],
  [1180, 820],
  [1440, 900],
  [320, 480],
  [480, 320],
] as const;

const inside = (a: Rect, b: Rect): boolean => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('outfitter layout', () => {
  for (const [w, h] of VIEWS) {
    it(`${w}x${h}: every card is at least ${TAP_FLOOR} px on both sides, inside the panel, and no two cards overlap`, () => {
      const L = outfitterLayout(w, h, [...COUNTS]);
      const cards = L.blocks.flatMap((b) => b.cards);
      expect(cards).toHaveLength(COUNTS.reduce((a, b) => a + b, 0));
      for (const c of cards) {
        expect(c.w).toBeGreaterThanOrEqual(TAP_FLOOR);
        expect(c.h).toBeGreaterThanOrEqual(TAP_FLOOR);
        expect(inside(c, L.panel)).toBe(true);
        expect(inside(c, L.grid)).toBe(true);
      }
      for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) expect(overlap(cards[i]!, cards[j]!)).toBe(false);
      // the close button and the coin pill keep their floors and never meet the grid
      expect(L.close.w).toBeGreaterThanOrEqual(TAP_FLOOR);
      expect(L.close.h).toBeGreaterThanOrEqual(44);
      expect(L.close.y).toBeGreaterThanOrEqual(L.grid.y + L.grid.h);
      expect(L.coinPill.y + L.coinPill.h).toBeLessThanOrEqual(L.grid.y);
    });
  }

  it('keeps the portrait phone on slot rows and moves the landscape phone to slot columns', () => {
    expect(outfitterLayout(360, 640, [...COUNTS]).arrangement).toBe('rows');
    expect(outfitterLayout(820, 1180, [...COUNTS]).arrangement).toBe('rows');
    expect(outfitterLayout(640, 360, [...COUNTS]).arrangement).toBe('columns');
    expect(outfitterLayout(844, 390, [...COUNTS]).arrangement).toBe('columns');
  });
});
