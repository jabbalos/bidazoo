import type { BasecampScene } from '../scenes/BasecampScene';

/**
 * Basecamp overlay registry (proposal 2.6 item 3; Lane B owns this file after the hour-1 stub).
 * Lanes register their overlays here; BasecampScene owns the hotspots and calls `open`. Nothing
 * else in BasecampScene.ts is edited by Lanes A or C.
 *
 * How an overlay works: `open(scene)` returns a Phaser container drawn in SCREEN coordinates (the
 * scene keeps it on the fixed UI camera and pauses walking). The overlay closes itself by calling
 * `scene.closeOverlay()`; BasecampScene also closes it when the scene shuts down. Several overlays may
 * share a hotspot: the scene opens the first one registered and lists the rest as screen-reader actions.
 */

export type OverlayId = 'map' | 'outfitter' | 'passport' | 'daily';
export type OverlayHotspot = 'map-board' | 'lodge-door' | 'banner';

export interface OverlayDef {
  hotspot: OverlayHotspot;
  open(scene: BasecampScene): Phaser.GameObjects.Container;
}

const overlays = new Map<OverlayId, OverlayDef>();

export function registerOverlay(id: 'map' | 'outfitter' | 'passport' | 'daily', def: { hotspot: 'map-board' | 'lodge-door' | 'banner'; open(scene: BasecampScene): Phaser.GameObjects.Container }): void {
  if (overlays.has(id)) throw new Error(`Basecamp overlay "${id}" is already registered.`);
  overlays.set(id, def);
}

/** For BasecampScene: the overlays a hotspot opens, in registration order. */
export function overlaysAt(hotspot: OverlayHotspot): Array<{ id: OverlayId; def: OverlayDef }> {
  return [...overlays].filter(([, def]) => def.hotspot === hotspot).map(([id, def]) => ({ id, def }));
}

/** The kid-facing prompt on the chip when the buddy stands at a hotspot. PENDING owner approval (rule 14). */
export const HOTSPOT_PROMPTS: Readonly<Record<OverlayHotspot, string>> = Object.freeze({
  'map-board': 'Open the map',
  'lodge-door': 'Visit the lodge',
  banner: 'Look at the banner',
});

/** Test support: empties the registry. Not used by the game. */
export function resetOverlaysForTests(): void {
  overlays.clear();
}
