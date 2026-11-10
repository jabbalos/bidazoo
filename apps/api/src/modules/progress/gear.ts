import { eq, sql } from 'drizzle-orm';
import { walletTransactions } from '@bidazoo/database/schema';
import type { Gear, UpdateGearRequest } from '@bidazoo/contracts';
import type { Db, Executor, Tx } from '../../context';
import { ApiError, errors } from '../../http/errors';
import { getTotals } from '../rewards/ledger';
import { GEAR_SLOTS, gearItem, publicCatalog } from './gear-catalog';
import { playerProgress, type GearState } from './tables';

/** The wallet source type of a gear purchase (migration 0007 allows it, and only as a debit). */
export const GEAR_PURCHASE_SOURCE = 'gear_purchase';

/** Ledger reason of the purchase of one item. One purchase per (player, item): a unique key. */
export function gearPurchaseReason(itemId: string): string {
  return `gear:${itemId}`;
}

function slotOrder(id: string): number {
  const item = gearItem(id);
  return item ? GEAR_SLOTS.indexOf(item.slot) : GEAR_SLOTS.length;
}

/** Only ids still in the catalog, without duplicates, in slot order. */
function clean(ids: readonly unknown[]): string[] {
  const known = ids.filter((id): id is string => typeof id === 'string' && gearItem(id) !== undefined);
  return [...new Set(known)].sort((a, b) => slotOrder(a) - slotOrder(b));
}

function toGear(state: GearState | undefined, coins: number): Gear {
  const owned = clean(state?.owned ?? []);
  const ownedSet = new Set(owned);
  return {
    owned,
    equipped: clean(state?.equipped ?? []).filter((id) => ownedSet.has(id)),
    coins: Math.max(0, coins),
    catalog: publicCatalog(),
  };
}

/** GET /api/v1/me/gear. Read-only: a player with no progress row gets the empty state. */
export async function getGear(executor: Executor, playerId: string): Promise<Gear> {
  const [row] = await executor
    .select({ gear: playerProgress.gear })
    .from(playerProgress)
    .where(eq(playerProgress.playerId, playerId));
  const totals = await getTotals(executor, playerId);
  return toGear(row?.gear, totals.coins);
}

/** Thrown when a purchase costs more than the player's coins (the server's own ledger total). */
export function notEnoughCoins(): ApiError {
  return new ApiError(409, 'invalid_request', 'Not enough coins.');
}

/**
 * Locks (creating if needed) the player's progress row. Every gear change goes through this lock,
 * so two purchases at once cannot both spend the same coins.
 */
async function lockProgress(tx: Tx, playerId: string): Promise<GearState> {
  await tx.insert(playerProgress).values({ playerId }).onConflictDoNothing();
  const [row] = await tx
    .select({ gear: playerProgress.gear })
    .from(playerProgress)
    .where(eq(playerProgress.playerId, playerId))
    .for('update');
  if (!row) throw new Error('player_progress row missing after insert');
  return row.gear;
}

/**
 * PUT /api/v1/me/gear: optionally buy one item, then set what is worn. One transaction: if the
 * equipped list is invalid, the purchase is not made either.
 *
 *  - `buy`: must be a catalog item (400). Already owned: nothing is charged. Otherwise the catalog
 *    price is checked against the coin ledger total (409 "Not enough coins.") and one negative
 *    ledger row is appended; its unique key makes the debit exactly-once per (player, item).
 *  - `equipped`: catalog items (400), no duplicates and at most one per slot (400), owned (403).
 */
export async function updateGear(db: Db, playerId: string, body: UpdateGearRequest): Promise<Gear> {
  return db.transaction(async (tx) => {
    const state = await lockProgress(tx, playerId);
    const owned = new Set(clean(state.owned));

    if (body.buy !== undefined) {
      const item = gearItem(body.buy);
      if (!item) throw new ApiError(400, 'invalid_request');
      if (!owned.has(item.id)) {
        const { coins } = await getTotals(tx, playerId);
        if (coins < item.price) throw notEnoughCoins();
        if (item.price > 0) {
          const reason = gearPurchaseReason(item.id);
          await tx.insert(walletTransactions).values({
            playerId,
            currency: 'coins',
            amount: -item.price,
            reason,
            sourceType: GEAR_PURCHASE_SOURCE,
            sourceId: playerId,
            playSessionId: null,
            idempotencyKey: `${GEAR_PURCHASE_SOURCE}:${playerId}:${reason}:coins`,
          });
        }
        owned.add(item.id);
      }
    }

    const slots = new Set<string>();
    for (const id of body.equipped) {
      const item = gearItem(id);
      if (!item) throw new ApiError(400, 'invalid_request');
      if (slots.has(item.slot)) throw new ApiError(400, 'invalid_request');
      slots.add(item.slot);
      if (!owned.has(id)) throw errors.forbidden();
    }

    const next: GearState = { owned: clean([...owned]), equipped: clean(body.equipped) };
    await tx
      .update(playerProgress)
      .set({ gear: next, updatedAt: sql`now()` })
      .where(eq(playerProgress.playerId, playerId));
    const totals = await getTotals(tx, playerId);
    return toGear(next, totals.coins);
  });
}
