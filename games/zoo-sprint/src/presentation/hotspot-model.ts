/**
 * Where the Basecamp hotspots stand and which one the buddy is at. Pure: numbers in, numbers out.
 * Hotspots are the places that open overlays (map board, lodge door, banner); the landmarks
 * (signpost, gate) stay as they were. PRESENTATION ONLY.
 */
import { insideGate, type Landmark, type WorldSpec } from './explore-model';

export type HotspotId = 'map-board' | 'lodge-door' | 'banner';

/** Hotspot positions as fractions of the world width. `lodge-door` on the painted Basecamp is where Click stands. */
export const HOTSPOT_AT = {
  /** Painted Basecamp: the map pavilion (~0.78) and the lantern canopy (~0.55) of the front picture. */
  painted: { 'map-board': 0.78, banner: 0.55 },
  /** The code-drawn fallback. */
  code: { 'map-board': 0.46, banner: 0.2, 'lodge-door': 0.1 },
} as const;

export interface HotspotPlace {
  hotspot: HotspotId;
  x: number;
}

export function hotspotPlaces(world: WorldSpec, painted: boolean): HotspotPlace[] {
  if (painted) {
    return [
      { hotspot: 'lodge-door', x: world.clickX },
      { hotspot: 'banner', x: Math.round(world.width * HOTSPOT_AT.painted.banner) },
      { hotspot: 'map-board', x: Math.round(world.width * HOTSPOT_AT.painted['map-board']) },
    ];
  }
  return (Object.keys(HOTSPOT_AT.code) as HotspotId[]).map((hotspot) => ({ hotspot, x: Math.round(world.width * HOTSPOT_AT.code[hotspot]) }));
}

export function hotspotRadius(world: WorldSpec): number {
  return Math.round(world.unit * 0.16);
}

export type Interaction = { kind: 'landmark'; id: Landmark['id'] } | { kind: 'hotspot'; hotspot: HotspotId } | null;

/**
 * What the buddy is at: the gate always wins while inside its opening (the portal); otherwise the
 * nearest of the near landmark and the near hotspots (only `active` hotspots, those with an overlay).
 */
export function interactionAt(x: number, world: WorldSpec, landmark: Landmark | null, places: readonly HotspotPlace[], active: ReadonlySet<HotspotId>): Interaction {
  if (landmark?.id === 'gate' && insideGate(x, world)) return { kind: 'landmark', id: 'gate' };
  const radius = hotspotRadius(world);
  let best: Interaction = landmark ? { kind: 'landmark', id: landmark.id } : null;
  let bestDist = landmark ? Math.abs(x - landmark.x) : Infinity;
  for (const p of places) {
    if (!active.has(p.hotspot)) continue;
    const d = Math.abs(x - p.x);
    if (d <= radius && d < bestDist) {
      best = { kind: 'hotspot', hotspot: p.hotspot };
      bestDist = d;
    }
  }
  return best;
}
