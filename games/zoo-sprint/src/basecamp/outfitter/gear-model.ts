import type { CharacterId } from '../../roster';

/**
 * Where outfitter gear sits on the painted buddy (Lane C item C3). Pure data and functions: no
 * Phaser, no DOM, no network. Presentation only: gear never changes questions, grading, XP or coins.
 *
 * Art references (owner-confirmed, REPORT.md "Art references"): the painted side-view walkers
 * `assets/world-expedition/walk-painted/<id>_walk_side.webp` and the painted busts
 * `assets/world-expedition/characters-painted/<id>/<id>_idle.webp`, and docs/CHARACTER-BIBLE.md.
 *
 * Coordinates are fractions of the picture: for the walker, of the opaque body box (x to the right
 * as the art faces, y down from the top of the body); for the bust, of the whole bust picture.
 *
 * Character Bible LOCKED rules win: every starter lists the LOCKED features gear must never cover,
 * and a slot is drawn only where its anchor clears all of them (tests check it). Where no such spot
 * exists the slot is simply not drawn on that character (see SKIPPED below). Click is the host and
 * never wears gear; there is no new starter.
 */

export type GearView = 'walk' | 'bust';
export type GearSlotId = 'hat' | 'scarf' | 'stick';

/** A rectangle in picture fractions: left, top, right, bottom. */
export interface FracRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LockedFeature {
  /** Which Character Bible LOCKED rule this protects. */
  feature: string;
  rect: FracRect;
}

export interface ViewAnchors {
  locked: readonly LockedFeature[];
  slots: Partial<Record<GearSlotId, FracRect>>;
}

const r = (x0: number, y0: number, x1: number, y1: number): FracRect => ({ x0, y0, x1, y1 });

export const GEAR_ANCHORS: Readonly<Record<CharacterId, Readonly<Record<GearView, ViewAnchors>>>> = {
  dino: {
    walk: {
      locked: [
        { feature: 'orange dorsal spikes (head)', rect: r(0.2, 0, 0.74, 0.17) },
        { feature: 'orange dorsal spikes (back and tail)', rect: r(0, 0.1, 0.42, 0.76) },
        { feature: 'exactly one explorer backpack', rect: r(0.26, 0.43, 0.59, 0.71) },
      ],
      slots: { scarf: r(0.6, 0.42, 0.82, 0.51), stick: r(0.88, 0.42, 0.96, 1) },
    },
    bust: {
      locked: [
        { feature: 'orange dorsal spikes (head)', rect: r(0.26, 0, 0.66, 0.19) },
        { feature: 'orange dorsal spikes (side)', rect: r(0.08, 0.12, 0.32, 0.72) },
        { feature: 'exactly one explorer backpack', rect: r(0, 0.65, 0.33, 1) },
      ],
      slots: { scarf: r(0.38, 0.7, 0.8, 0.8) },
    },
  },
  koala: {
    walk: {
      locked: [
        { feature: 'glasses (scholar)', rect: r(0.42, 0.21, 0.92, 0.39) },
        { feature: 'book (scholar, book-oriented)', rect: r(0.4, 0.55, 0.83, 0.81) },
      ],
      slots: { hat: r(0.27, 0, 0.9, 0.2), scarf: r(0.45, 0.43, 0.78, 0.52), stick: r(0.85, 0.5, 0.93, 1) },
    },
    bust: {
      locked: [{ feature: 'glasses (scholar)', rect: r(0.25, 0.32, 0.85, 0.57) }],
      slots: { hat: r(0.2, 0, 0.82, 0.3), scarf: r(0.36, 0.64, 0.66, 0.76) },
    },
  },
  tarsier: {
    walk: {
      locked: [
        { feature: 'goggles', rect: r(0.54, 0, 0.93, 0.17) },
        { feature: 'large expressive eyes', rect: r(0.7, 0.17, 0.99, 0.39) },
      ],
      slots: { scarf: r(0.5, 0.42, 0.82, 0.5), stick: r(0.86, 0.52, 0.94, 1) },
    },
    bust: {
      locked: [
        { feature: 'goggles', rect: r(0.23, 0.02, 0.81, 0.25) },
        { feature: 'large expressive eyes', rect: r(0.25, 0.29, 0.73, 0.51) },
      ],
      slots: { scarf: r(0.32, 0.6, 0.68, 0.7) },
    },
  },
  eagle: {
    walk: {
      locked: [
        { feature: 'white head', rect: r(0.37, 0, 0.97, 0.35) },
        { feature: 'green varsity jacket with the letter "A"', rect: r(0.4, 0.3, 0.92, 0.73) },
        { feature: 'brown wings', rect: r(0, 0.37, 0.69, 0.86) },
      ],
      slots: { stick: r(0.93, 0.45, 0.995, 1) },
    },
    bust: {
      locked: [
        { feature: 'white head', rect: r(0.19, 0.02, 0.87, 0.73) },
        { feature: 'green varsity jacket with the letter "A"', rect: r(0, 0.54, 1, 1) },
      ],
      slots: {},
    },
  },
  bronco: {
    walk: {
      locked: [{ feature: 'maroon bandana', rect: r(0.51, 0.37, 0.87, 0.67) }],
      slots: { hat: r(0.48, 0, 0.98, 0.18), stick: r(0.92, 0.52, 0.995, 1) },
    },
    bust: {
      locked: [{ feature: 'maroon bandana', rect: r(0.24, 0.69, 0.86, 0.98) }],
      slots: { hat: r(0.2, 0, 0.95, 0.3) },
    },
  },
};

/**
 * Slots that are NOT drawn on a starter in a view, and why (for REPORT.md and the owner). The stick
 * is a held item, so it is never drawn on a bust (no hands in the picture).
 */
export const SKIPPED: Readonly<Record<CharacterId, Partial<Record<GearSlotId, string>>>> = {
  dino: { hat: 'the head top is the LOCKED orange dorsal crest' },
  koala: {},
  tarsier: { hat: 'the head top carries the LOCKED goggles' },
  eagle: {
    hat: 'a hat would cover the LOCKED white head',
    scarf: 'a scarf would cover the LOCKED green varsity jacket collar',
  },
  bronco: { scarf: 'a scarf would cover the LOCKED maroon bandana' },
};

export function overlaps(a: FracRect, b: FracRect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** How each catalog item looks when drawn in code. Unknown ids (a newer catalog) are not drawn. */
export interface GearLook {
  slot: GearSlotId;
  main: number;
  accent: number;
  /** A stripe pattern (scarves), a band (hats) or a topper (sticks). */
  detail: 'plain' | 'stripes' | 'weave' | 'band' | 'brim' | 'pompom' | 'lantern' | 'compass';
}

export const GEAR_LOOKS: Readonly<Record<string, GearLook>> = {
  'hat-sun': { slot: 'hat', main: 0xf2d27a, accent: 0xdc5a08, detail: 'brim' },
  'hat-ranger': { slot: 'hat', main: 0x6b7a3a, accent: 0x3e4720, detail: 'band' },
  'hat-beanie': { slot: 'hat', main: 0x2478c8, accent: 0xfdf3d6, detail: 'pompom' },
  'hat-explorer': { slot: 'hat', main: 0xe6d3ab, accent: 0x8a5a2b, detail: 'band' },
  'scarf-red': { slot: 'scarf', main: 0xd8432e, accent: 0x9c2a1b, detail: 'plain' },
  'scarf-striped': { slot: 'scarf', main: 0x16b3a6, accent: 0xfdf3d6, detail: 'stripes' },
  'scarf-woven': { slot: 'scarf', main: 0xe0a936, accent: 0x1f6f4a, detail: 'weave' },
  'scarf-silk': { slot: 'scarf', main: 0x7b5bc4, accent: 0xffd27a, detail: 'plain' },
  'stick-bamboo': { slot: 'stick', main: 0x9cbf4a, accent: 0x5f7f22, detail: 'plain' },
  'stick-oak': { slot: 'stick', main: 0x8a5a2b, accent: 0x5e3a1a, detail: 'plain' },
  'stick-lantern': { slot: 'stick', main: 0x5e3a1a, accent: 0xffa63a, detail: 'lantern' },
  'stick-compass': { slot: 'stick', main: 0xb27b3f, accent: 0xe0a936, detail: 'compass' },
};

export interface GearPlacement {
  itemId: string;
  slot: GearSlotId;
  look: GearLook;
  rect: FracRect;
}

/**
 * What to draw for `equipped` on a starter in a view: one placement per drawable slot, in the
 * order hat, scarf, stick (back to front). Click (the host) and unknown items get nothing.
 */
export function gearPlacements(cast: string, view: GearView, equipped: readonly string[]): GearPlacement[] {
  const anchors = (GEAR_ANCHORS as Record<string, Record<GearView, ViewAnchors> | undefined>)[cast]?.[view];
  if (!anchors) return [];
  const bySlot = new Map<GearSlotId, GearPlacement>();
  for (const itemId of equipped) {
    const look = GEAR_LOOKS[itemId];
    const rect = look ? anchors.slots[look.slot] : undefined;
    if (!look || !rect || bySlot.has(look.slot)) continue;
    bySlot.set(look.slot, { itemId, slot: look.slot, look, rect });
  }
  return (['hat', 'scarf', 'stick'] as const).flatMap((slot) => {
    const placement = bySlot.get(slot);
    return placement ? [placement] : [];
  });
}
