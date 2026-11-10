import type { Gear, UpdateGearRequest } from '@bidazoo/contracts';
import type { BidaZooPlatform } from '@bidazoo/game-sdk';

/**
 * The game's view of GET/PUT /api/v1/me/gear (Lane C item C3).
 *
 * A game talks to the server only through the platform (docs/GAME-SDK.md). The platform methods
 * `getGear` and `updateGear` are a cross-lane change request (game-sdk interface + apps/play
 * http platform); until they exist, `gearPlatform` returns null and the outfitter says it is
 * closed. Nothing here decides a price, a balance or ownership: every value is the server's.
 */
export interface GearPlatform {
  getGear(): Promise<Gear>;
  updateGear(request: UpdateGearRequest): Promise<Gear>;
}

export function gearPlatform(platform: BidaZooPlatform): GearPlatform | null {
  const p = platform as BidaZooPlatform & Partial<GearPlatform>;
  if (typeof p.getGear !== 'function' || typeof p.updateGear !== 'function') return null;
  return { getGear: () => p.getGear!(), updateGear: (request) => p.updateGear!(request) };
}

/** The last gear state the server returned, for the walker and the busts. A copy, never authoritative. */
let current: Gear | null = null;
const listeners = new Set<(gear: Gear) => void>();

export function currentGear(): Gear | null {
  return current;
}

/** What the buddy wears now (empty until the server has answered once). */
export function equippedGear(): readonly string[] {
  return current?.equipped ?? [];
}

export function setCurrentGear(gear: Gear): void {
  current = gear;
  for (const listener of listeners) listener(gear);
}

/** Subscribe to gear changes; returns the unsubscribe function. */
export function onGearChange(listener: (gear: Gear) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Loads the player's gear once (Basecamp start). Never rejects: no gear is shown on any failure, so
 * a missing route or a network error never stops a child from playing.
 */
export async function loadGear(platform: BidaZooPlatform): Promise<Gear | null> {
  const api = gearPlatform(platform);
  if (!api) return null;
  try {
    const gear = await api.getGear();
    setCurrentGear(gear);
    return gear;
  } catch {
    return null;
  }
}

/** The PUT body for a tap on an item card: buy it, wear it, or take it off. Pure. */
export function requestForTap(gear: Gear, itemId: string): UpdateGearRequest | null {
  const item = gear.catalog.find((i) => i.id === itemId);
  if (!item) return null;
  const slotOf = (id: string): string | undefined => gear.catalog.find((i) => i.id === id)?.slot;
  if (gear.equipped.includes(itemId)) return { equipped: gear.equipped.filter((id) => id !== itemId) };
  const equipped = [...gear.equipped.filter((id) => slotOf(id) !== item.slot), itemId];
  return gear.owned.includes(itemId) ? { equipped } : { buy: itemId, equipped };
}
