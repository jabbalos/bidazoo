import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { players } from './players';
import { playSessions } from './play-sessions';

/**
 * Append-only reward ledgers. Balances are the SUM of rows; there is no mutable counter to
 * overwrite. A trigger forbids UPDATE and DELETE (see the custom migration).
 *
 * Why two tables: coins are spendable currency (later purchases will add negative rows);
 * XP is progression and can only ever increase. Keeping them apart lets the database say
 * "XP amounts are positive" and keeps spending logic away from progression.
 *
 * Exactly-once rewards are enforced by unique constraints, not by application checks:
 *  - idempotency_key is globally unique and derived from the source event.
 *  - (source_type, source_id, reason) allows one reward of each kind per gameplay event.
 */
export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    currency: text('currency').notNull(),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    playSessionId: uuid('play_session_id').references(() => playSessions.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('wallet_transactions_idempotency_uq').on(t.idempotencyKey),
    unique('wallet_transactions_source_uq').on(t.sourceType, t.sourceId, t.reason, t.currency),
    index('wallet_transactions_player_idx').on(t.playerId, t.createdAt),
    index('wallet_transactions_session_idx').on(t.playSessionId),
    check('wallet_transactions_currency_ck', sql`${t.currency} in ('coins')`),
    check('wallet_transactions_amount_ck', sql`${t.amount} <> 0`),
    check('wallet_transactions_source_ck', sql`${t.sourceType} in ('attempt', 'play_session')`),
  ],
);

export const xpEvents = pgTable(
  'xp_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    playSessionId: uuid('play_session_id').references(() => playSessions.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('xp_events_idempotency_uq').on(t.idempotencyKey),
    unique('xp_events_source_uq').on(t.sourceType, t.sourceId, t.reason),
    index('xp_events_player_idx').on(t.playerId, t.createdAt),
    index('xp_events_session_idx').on(t.playSessionId),
    check('xp_events_amount_ck', sql`${t.amount} > 0`),
    check('xp_events_source_ck', sql`${t.sourceType} in ('attempt', 'play_session')`),
  ],
);

export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type XpEvent = typeof xpEvents.$inferSelect;
