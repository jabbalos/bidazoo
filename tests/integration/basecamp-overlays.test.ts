import { beforeEach, describe, expect, it } from 'vitest';
import { mapBoardLayout, TAP_FLOOR } from '../../games/zoo-sprint/src/basecamp/map-layout';
import { overlaysAt, registerOverlay, resetOverlaysForTests } from '../../games/zoo-sprint/src/basecamp/overlays';
import { stepPlayer, paintedWorldSpec, worldSpec, nearLandmark } from '../../games/zoo-sprint/src/presentation/explore-model';
import { hotspotPlaces, hotspotRadius, interactionAt, type HotspotId } from '../../games/zoo-sprint/src/presentation/hotspot-model';

/**
 * The Basecamp overlay registry (proposal 2.6 item 3), the hotspot rules and the map board layout.
 * The scene that draws them is covered by tests/e2e/expedition.spec.ts; here the rules are pure.
 * The overlay `open` functions are stand-ins (a registry test needs no Phaser).
 */
const def = (hotspot: 'map-board' | 'lodge-door' | 'banner') => ({ hotspot, open: () => ({}) as never });

describe('overlay registry', () => {
  beforeEach(() => resetOverlaysForTests());

  it('lists the overlays of a hotspot in registration order', () => {
    registerOverlay('passport', def('banner'));
    registerOverlay('map', def('map-board'));
    registerOverlay('daily', def('banner'));
    expect(overlaysAt('banner').map((o) => o.id)).toEqual(['passport', 'daily']);
    expect(overlaysAt('map-board').map((o) => o.id)).toEqual(['map']);
    expect(overlaysAt('lodge-door')).toEqual([]);
  });

  it('refuses to register an id twice', () => {
    registerOverlay('map', def('map-board'));
    expect(() => registerOverlay('map', def('map-board'))).toThrow(/already registered/);
  });
});

describe('hotspots', () => {
  const painted = paintedWorldSpec(800, 600, { width: 1414, groundY: 540, gateX: 1305, signpostX: 973, clickX: 508, minX: 42, maxX: 1371 });
  const places = hotspotPlaces(painted, true);
  const all = new Set<HotspotId>(['map-board', 'lodge-door', 'banner']);
  const at = (h: HotspotId): number => places.find((p) => p.hotspot === h)!.x;

  it('stands the lodge door where Click stands and puts the others inside the walking limits', () => {
    expect(at('lodge-door')).toBe(painted.clickX);
    for (const p of places) {
      expect(p.x).toBeGreaterThanOrEqual(painted.minX);
      expect(p.x).toBeLessThanOrEqual(painted.maxX);
    }
  });

  it('is at a hotspot only when its overlay exists', () => {
    const x = at('map-board');
    expect(interactionAt(x, painted, null, places, all)).toEqual({ kind: 'hotspot', hotspot: 'map-board' });
    expect(interactionAt(x, painted, null, places, new Set())).toBeNull();
    expect(interactionAt(x + hotspotRadius(painted) + 1, painted, null, places, all)).toBeNull();
  });

  it('keeps the gate and the portal first: standing inside the gate opening is never a hotspot', () => {
    const gate = painted.landmarks.find((l) => l.id === 'gate')!;
    expect(interactionAt(gate.x, painted, nearLandmark(gate.x, painted.landmarks), places, all)).toEqual({ kind: 'landmark', id: 'gate' });
  });

  it('keeps the signpost when it is the nearer one, so the existing landmark is not hidden', () => {
    const sign = painted.landmarks.find((l) => l.id === 'signpost')!;
    expect(interactionAt(sign.x, painted, nearLandmark(sign.x, painted.landmarks), places, all)).toEqual({ kind: 'landmark', id: 'signpost' });
  });

  it('can walk to every hotspot from the start, and the first one on the way is not the gate', () => {
    let p = { x: painted.startX, vx: 0, facing: 1 as 1 | -1 };
    const seen: string[] = [];
    for (let frame = 0; frame < 60 * 60; frame++) {
      p = stepPlayer(p, 1, 16, painted);
      const it = interactionAt(p.x, painted, nearLandmark(p.x, painted.landmarks), places, all);
      const label = it ? (it.kind === 'landmark' ? it.id : it.hotspot) : null;
      if (label && seen[seen.length - 1] !== label) seen.push(label);
    }
    expect(seen).toContain('map-board');
    expect(seen).toContain('banner');
    expect(seen[seen.length - 1]).toBe('gate');
  });

  it('also places all three hotspots on the code-drawn world', () => {
    const w = worldSpec(800, 600);
    const code = hotspotPlaces(w, false);
    expect(code.map((c) => c.hotspot).sort()).toEqual(['banner', 'lodge-door', 'map-board']);
    for (const c of code) expect(c.x).toBeGreaterThan(w.minX);
  });
});

describe('map board layout', () => {
  const views: Array<[number, number]> = [[320, 480], [360, 640], [390, 844], [768, 1024], [1024, 768], [1280, 720], [1920, 1080]];

  it('fits seven tiles inside the panel on every view, none under the 48 px tap floor, none overlapping', () => {
    for (const [w, h] of views) {
      const L = mapBoardLayout(w, h, 7);
      expect(L.tiles).toHaveLength(7);
      for (const t of L.tiles) {
        expect(t.w, `${w}x${h}`).toBeGreaterThanOrEqual(TAP_FLOOR);
        expect(t.h, `${w}x${h}`).toBeGreaterThanOrEqual(TAP_FLOOR);
        expect(t.x).toBeGreaterThanOrEqual(L.panel.x);
        expect(t.x + t.w).toBeLessThanOrEqual(L.panel.x + L.panel.w);
        expect(t.y + t.h, `${w}x${h}`).toBeLessThanOrEqual(L.panel.y + L.panel.h);
      }
      for (const [i, a] of L.tiles.entries()) {
        for (const b of L.tiles.slice(i + 1)) {
          const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(apart, `${w}x${h} tiles ${i}`).toBe(true);
        }
      }
      expect(L.close.w).toBeGreaterThanOrEqual(TAP_FLOOR);
      expect(L.close.h).toBeGreaterThanOrEqual(TAP_FLOOR);
      expect(L.close.x + L.close.w).toBeLessThanOrEqual(L.panel.x + L.panel.w);
    }
  });

  it('uses two columns on a tall view and four on a wide one', () => {
    expect(mapBoardLayout(390, 844, 7).cols).toBe(2);
    expect(mapBoardLayout(1280, 720, 7).cols).toBe(4);
  });
});
