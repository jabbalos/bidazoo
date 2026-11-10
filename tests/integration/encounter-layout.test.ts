import { describe, expect, it } from 'vitest';
import { MIN_TILE, encounterLayout, layoutTiles, type EncounterLayout, type TileSpec } from '../../games/zoo-sprint/src/encounter/encounter-layout';

/** Encounter overlay layout rules (A2; tile shapes for A9) over real viewports. */

type R = { x: number; y: number; w: number; h: number };

const VIEWPORTS: [number, number][] = [
  [360, 640], // smallest phone target (docs/visual/10)
  [375, 667],
  [390, 844],
  [430, 932],
  [768, 1024], // iPad portrait
  [1024, 768], // iPad landscape
  [844, 390], // phone on its side
  [1280, 720],
  [1440, 900],
  [1920, 1080],
];

const SPECS: TileSpec[] = [{ count: 4 }, { count: 3 }, { count: 4, kind: 'text' }, { count: 3, kind: 'text' }, { count: 4, kind: 'number' }];

const inside = (r: R, w: number, h: number): boolean => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5;
const within = (r: R, o: R): boolean => r.x >= o.x - 0.5 && r.y >= o.y - 0.5 && r.x + r.w <= o.x + o.w + 0.5 && r.y + r.h <= o.y + o.h + 0.5;
const overlap = (a: R, b: R): boolean => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

function all(): { w: number; h: number; spec: TileSpec; kind: 'node' | 'boss'; L: EncounterLayout }[] {
  const out = [];
  for (const [w, h] of VIEWPORTS) for (const spec of SPECS) for (const kind of ['node', 'boss'] as const) out.push({ w, h, spec, kind, L: encounterLayout(w, h, spec, kind) });
  return out;
}

describe('encounter layout', () => {
  it('every piece is on screen (no horizontal overflow, no scrolling)', () => {
    for (const { w, h, spec, kind, L } of all()) {
      const label = `${w}x${h} ${spec.count} ${spec.kind ?? 'number'} ${kind}`;
      for (const [name, r] of Object.entries({ bar: L.bar, timer: L.timer, stage: L.stage, card: L.card, feedback: L.feedback, meter: L.meter, banner: L.banner })) {
        expect(inside(r, w, h), `${label}: ${name}`).toBe(true);
      }
      for (const t of L.tiles) expect(inside(t, w, h), `${label}: tile`).toBe(true);
    }
  });

  it('one tile per choice, each at least 44 px each way, none overlapping each other or the card', () => {
    for (const { w, h, spec, kind, L } of all()) {
      const label = `${w}x${h} ${spec.count} ${spec.kind ?? 'number'} ${kind}`;
      expect(L.tiles, label).toHaveLength(spec.count);
      for (const t of L.tiles) {
        expect(t.w, label).toBeGreaterThanOrEqual(MIN_TILE);
        expect(t.h, label).toBeGreaterThanOrEqual(MIN_TILE);
        expect(overlap(t, L.card), label).toBe(false);
        expect(overlap(t, L.feedback), label).toBe(false);
        expect(overlap(t, L.stage), label).toBe(false);
      }
      for (let i = 0; i < L.tiles.length; i++) for (let j = i + 1; j < L.tiles.length; j++) expect(overlap(L.tiles[i] as R, L.tiles[j] as R), label).toBe(false);
    }
  });

  it('the face-off holds the buddy (left), the challenger (right) and the meter under the buddy', () => {
    for (const { w, h, spec, kind, L } of all()) {
      const label = `${w}x${h} ${spec.count} ${kind}`;
      expect(within(L.buddyBox, L.stage), label).toBe(true);
      expect(within(L.challengerBox, L.stage), label).toBe(true);
      expect(within(L.meter, L.stage), label).toBe(true);
      expect(L.buddyBox.x + L.buddyBox.w / 2, label).toBeLessThan(L.challengerBox.x + L.challengerBox.w / 2);
      expect(L.meter.y, label).toBeGreaterThanOrEqual(L.buddyBox.y + L.buddyBox.h);
      expect(L.buddyBox.h, label).toBeGreaterThanOrEqual(40);
      expect(overlap(L.stage, L.card), label).toBe(false);
      expect(overlap(L.bar, L.stage), label).toBe(false);
      expect(within(L.hearts, L.bar) && within(L.pips, L.bar), label).toBe(true);
      expect(overlap(L.hearts, L.pips), label).toBe(false);
    }
  });

  it('the boss challenger gets a wider share of the face-off than a node challenger', () => {
    for (const [w, h] of VIEWPORTS) {
      expect(encounterLayout(w, h, { count: 4 }, 'boss').challengerBox.w).toBeGreaterThan(encounterLayout(w, h, { count: 4 }, 'node').challengerBox.w);
    }
  });

  it('tile shapes: four in a 2 x 2 grid, three numbers in one row when they fit, text one per row', () => {
    const area = { x: 0, y: 0, w: 400, h: 200 };
    const four = layoutTiles({ count: 4 }, area, 10);
    expect(new Set(four.map((t) => t.y)).size).toBe(2);
    expect(new Set(four.map((t) => t.x)).size).toBe(2);
    const three = layoutTiles({ count: 3 }, area, 10);
    expect(new Set(three.map((t) => t.y)).size).toBe(1);
    const narrow = layoutTiles({ count: 3 }, { x: 0, y: 0, w: 220, h: 200 }, 10);
    expect(new Set(narrow.map((t) => t.y)).size).toBe(3);
    const text = layoutTiles({ count: 3, kind: 'text' }, area, 10);
    expect(text.every((t) => t.w === area.w)).toBe(true);
    expect(new Set(text.map((t) => t.y)).size).toBe(3);
  });
});
