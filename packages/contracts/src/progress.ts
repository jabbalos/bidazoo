/**
 * World Expedition progress contracts (proposal 2.6 item 4; Lane C owns this file).
 *
 * Responses for the `/api/v1/me/*` progress routes (paths in ./paths: `meExpedition`, `meGear`,
 * `meDaily`). Same rules as index.ts: every object is strict, and stamps, gear and coins are facts
 * the server decided. Hour-1 shapes; Lane C may add to them.
 */
import { Type, type Static } from 'typebox';
import { strict } from './common';

const DestinationId = Type.String({ minLength: 1, maxLength: 64 });

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

/** GET/PUT /api/v1/me/gear: item ids from the server-side catalog. Purchases debit coins server-side. */
export const GearSchema = Type.Object(
  {
    owned: Type.Array(Type.String()),
    equipped: Type.Array(Type.String()),
  },
  strict,
);
export type Gear = Static<typeof GearSchema>;

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
