import type { BasecampScene } from '../scenes/BasecampScene';

/**
 * Basecamp overlay registry (proposal 2.6 item 3; Lane B owns this file after the hour-1 stub).
 * Lanes register their overlays here; BasecampScene owns the hotspots and calls `open`. Nothing
 * else in BasecampScene.ts is edited by Lanes A or C.
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
