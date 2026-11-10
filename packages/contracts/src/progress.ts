/**
 * World Expedition progress contracts (proposal 2.6 item 4; Lane C owns this file).
 *
 * Responses for the `/api/v1/me/*` progress routes (paths in ./paths: `meExpedition`, `meGear`,
 * `meDaily`). Same rules as index.ts: every object is strict, and stamps, gear and coins are facts
 * the server decided. Hour-1 shapes; Lane C may add to them.
 */
import { Type, type Static } from 'typebox';
import { strict, Uuid } from './common';

const DestinationId = Type.String({ minLength: 1, maxLength: 64 });

/** A destination id, as used in the stamps and unlocks below (for example `great-wall`). */
export const DestinationIdSchema = DestinationId;

/**
 * The seven destinations in passport order (docs/visual/12-destination-worlds.md; ids as in the
 * world folders of docs/visual/13-phaser-asset-spec.md). The server unlocks them in this order.
 * PENDING owner decision: the order and the unlock rule (see the progress module).
 */
export const EXPEDITION_DESTINATIONS = [
  'great-wall',
  'petra',
  'andes',
  'maya',
  'taj',
  'nile',
  'philippine-highlands',
] as const;
export type ExpeditionDestination = (typeof EXPEDITION_DESTINATIONS)[number];

/** One destination's passport stamp: earned when the server's replay lit at least 3 of 5 beacons. */
export const StampSchema = Type.Object(
  {
    destination: DestinationId,
    count: Type.Integer({ minimum: 0 }),
    bestStreak: Type.Integer({ minimum: 0 }),
    artifacts: Type.Array(Type.String()),
  },
  strict,
);
export type Stamp = Static<typeof StampSchema>;

/** GET /api/v1/me/expedition: stamps and unlocked destinations. */
export const ExpeditionProgressSchema = Type.Object(
  {
    stamps: Type.Array(StampSchema),
    unlocked: Type.Array(DestinationId),
  },
  strict,
);
export type ExpeditionProgress = Static<typeof ExpeditionProgressSchema>;

const GearItemId = Type.String({ minLength: 1, maxLength: 64 });

/**
 * One item of the server-side gear catalog. `price` is in coins and is the SERVER's price: a client
 * never sends a price, it only names the item it wants (PUT body `buy`). Names and prices are
 * PENDING owner placeholders.
 */
export const GearItemSchema = Type.Object(
  {
    id: GearItemId,
    slot: Type.String({ minLength: 1, maxLength: 32 }),
    name: Type.String(),
    price: Type.Integer({ minimum: 0 }),
  },
  strict,
);
export type GearItem = Static<typeof GearItemSchema>;

/**
 * GET/PUT /api/v1/me/gear: item ids from the server-side catalog. Purchases debit coins server-side.
 * `coins` is the player's spendable balance (the sum of the coin ledger, after purchases) and
 * `catalog` is everything the outfitter sells, in slot order.
 */
export const GearSchema = Type.Object(
  {
    owned: Type.Array(GearItemId),
    equipped: Type.Array(GearItemId),
    coins: Type.Integer({ minimum: 0 }),
    catalog: Type.Array(GearItemSchema),
  },
  strict,
);
export type Gear = Static<typeof GearSchema>;

/**
 * PUT /api/v1/me/gear. `buy` (optional) names ONE catalog item to purchase; the server debits its
 * own price from its own coin totals, and buying an item already owned charges nothing. `equipped`
 * is the full list to wear afterwards: owned items only, at most one per slot. There is no field
 * for a price, coins or ownership, so a body such as { "coins": 999 } is rejected.
 */
export const UpdateGearRequestSchema = Type.Object(
  {
    buy: Type.Optional(GearItemId),
    equipped: Type.Array(GearItemId, { maxItems: 8 }),
  },
  strict,
);
export type UpdateGearRequest = Static<typeof UpdateGearRequestSchema>;

/** GET /api/v1/me/daily: today's route (UTC day) and whether it is done. */
export const DailySchema = Type.Object(
  {
    date: Type.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }),
    routeId: Type.String(),
    done: Type.Boolean(),
  },
  strict,
);
export type Daily = Static<typeof DailySchema>;

/** POST /api/v1/me/expedition/runs: records which destination an active session is playing. */
export const StartExpeditionRunRequestSchema = Type.Object(
  { sessionId: Uuid, destination: DestinationId },
  strict,
);
export type StartExpeditionRunRequest = Static<typeof StartExpeditionRunRequestSchema>;

export const StartExpeditionRunResponseSchema = Type.Object(
  { sessionId: Uuid, destination: DestinationId },
  strict,
);
export type StartExpeditionRunResponse = Static<typeof StartExpeditionRunResponseSchema>;
