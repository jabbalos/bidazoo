import { and, eq, sql } from 'drizzle-orm';
import { walletTransactions, xpEvents } from '@bidazoo/database/schema';
import type { Totals } from '@bidazoo/contracts';
import type { Executor } from '../../context';
import type { Grant } from './policy';

export type SourceType = 'attempt' | 'play_session';

export interface GrantSource {
  playerId: string;
  playSessionId: string;
  sourceType: SourceType;
  sourceId: string;
}

function keyFor(source: GrantSource, grant: Grant): string {
  return `${source.sourceType}:${source.sourceId}:${grant.reason}:${grant.kind}`;
}

/**
 * Appends ledger rows for a gameplay event and returns the grants that were ACTUALLY inserted.
 *
 * Exactly-once comes from the database: the idempotency key and the (source, reason) pair are
 * unique, so replaying the same event inserts nothing (ON CONFLICT DO NOTHING) and reports no
 * new rewards. Callers must run this inside the answer transaction.
 */
export async function appendGrants(
  tx: Executor,
  source: GrantSource,
  grants: readonly Grant[],
): Promise<Grant[]> {
  const inserted: Grant[] = [];
  for (const grant of grants) {
    const common = {
      playerId: source.playerId,
      playSessionId: source.playSessionId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      amount: grant.amount,
      reason: grant.reason,
      idempotencyKey: keyFor(source, grant),
    };
    const rows =
      grant.kind === 'xp'
        ? await tx.insert(xpEvents).values(common).onConflictDoNothing().returning({ id: xpEvents.id })
        : await tx
            .insert(walletTransactions)
            .values({ ...common, currency: 'coins' })
            .onConflictDoNothing()
            .returning({ id: walletTransactions.id });
    if (rows.length > 0) inserted.push(grant);
  }
  return inserted;
}

/** Lifetime balances: the SUM of the ledgers. There is no mutable counter anywhere. */
export async function getTotals(executor: Executor, playerId: string): Promise<Totals> {
  const [xp] = await executor
    .select({ total: sql<string>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .where(eq(xpEvents.playerId, playerId));
  const [coins] = await executor
    .select({ total: sql<string>`coalesce(sum(${walletTransactions.amount}), 0)` })
    .from(walletTransactions)
    .where(and(eq(walletTransactions.playerId, playerId), eq(walletTransactions.currency, 'coins')));
  return { xp: Number(xp?.total ?? 0), coins: Number(coins?.total ?? 0) };
}

/** Totals earned within one play session. */
export async function getSessionTotals(
  executor: Executor,
  playSessionId: string,
  reason?: string,
): Promise<Totals> {
  const xpWhere = reason
    ? and(eq(xpEvents.playSessionId, playSessionId), eq(xpEvents.reason, reason))
    : eq(xpEvents.playSessionId, playSessionId);
  const coinWhere = reason
    ? and(eq(walletTransactions.playSessionId, playSessionId), eq(walletTransactions.reason, reason))
    : eq(walletTransactions.playSessionId, playSessionId);
  const [xp] = await executor
    .select({ total: sql<string>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .where(xpWhere);
  const [coins] = await executor
    .select({ total: sql<string>`coalesce(sum(${walletTransactions.amount}), 0)` })
    .from(walletTransactions)
    .where(coinWhere);
  return { xp: Number(xp?.total ?? 0), coins: Number(coins?.total ?? 0) };
}

/** Grants already committed for one source event, for replaying an earlier response. */
export async function grantsForSource(
  executor: Executor,
  sourceType: SourceType,
  sourceId: string,
): Promise<Grant[]> {
  const xp = await executor
    .select({ amount: xpEvents.amount, reason: xpEvents.reason })
    .from(xpEvents)
    .where(and(eq(xpEvents.sourceType, sourceType), eq(xpEvents.sourceId, sourceId)));
  const coins = await executor
    .select({ amount: walletTransactions.amount, reason: walletTransactions.reason })
    .from(walletTransactions)
    .where(and(eq(walletTransactions.sourceType, sourceType), eq(walletTransactions.sourceId, sourceId)));
  return [
    ...xp.map((row) => ({ kind: 'xp' as const, amount: row.amount, reason: row.reason })),
    ...coins.map((row) => ({ kind: 'coins' as const, amount: row.amount, reason: row.reason })),
  ];
}
