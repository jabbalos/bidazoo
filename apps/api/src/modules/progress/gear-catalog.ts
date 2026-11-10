import type { GearItem } from '@bidazoo/contracts';

/**
 * The server-side gear catalog (item C3): 3 slots x 4 items, priced in coins.
 *
 * This is the ONLY source of gear prices. A purchase debits the price below from the player's coin
 * ledger; a client never sends a price.
 *
 * PENDING owner decisions (placeholders, listed under "Copy (PENDING)" in REPORT.md):
 *  - every item name and every price;
 *  - the third slot. The plan says "pack", but a pack breaks Character Bible LOCKED rules (Dino has
 *    exactly one backpack, Koala has no backpack), so the placeholder third slot is a held trail
 *    stick (orchestrator decision, November 9, 2026).
 *
 * Ids are stable keys stored in player_progress.gear: rename an item by changing its name, never
 * its id.
 */
export const GEAR_SLOTS = ['hat', 'scarf', 'stick'] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];

export interface CatalogItem extends GearItem {
  slot: GearSlot;
}

export const GEAR_CATALOG: readonly CatalogItem[] = Object.freeze([
  { id: 'hat-sun', slot: 'hat', name: 'Sun Hat', price: 20 },
  { id: 'hat-ranger', slot: 'hat', name: 'Ranger Hat', price: 40 },
  { id: 'hat-beanie', slot: 'hat', name: 'Wool Beanie', price: 60 },
  { id: 'hat-explorer', slot: 'hat', name: 'Explorer Helmet', price: 90 },
  { id: 'scarf-red', slot: 'scarf', name: 'Red Scarf', price: 15 },
  { id: 'scarf-striped', slot: 'scarf', name: 'Striped Scarf', price: 30 },
  { id: 'scarf-woven', slot: 'scarf', name: 'Woven Scarf', price: 50 },
  { id: 'scarf-silk', slot: 'scarf', name: 'Silk Scarf', price: 80 },
  { id: 'stick-bamboo', slot: 'stick', name: 'Bamboo Stick', price: 25 },
  { id: 'stick-oak', slot: 'stick', name: 'Oak Trail Stick', price: 45 },
  { id: 'stick-lantern', slot: 'stick', name: 'Lantern Stick', price: 70 },
  { id: 'stick-compass', slot: 'stick', name: 'Compass Stick', price: 100 },
].map((item) => Object.freeze({ ...item, slot: item.slot as GearSlot })));

const BY_ID = new Map(GEAR_CATALOG.map((item) => [item.id, item]));

export function gearItem(id: string): CatalogItem | undefined {
  return BY_ID.get(id);
}

/** The catalog as the API returns it (plain copies, slot order). */
export function publicCatalog(): GearItem[] {
  return GEAR_CATALOG.map(({ id, slot, name, price }) => ({ id, slot, name, price }));
}
