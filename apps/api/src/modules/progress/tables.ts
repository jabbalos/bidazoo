import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { playSessions, players } from '@bidazoo/database/schema';

/**
 * Drizzle definitions of the World Expedition progress tables. The SQL is the migration
 * database/migrations/0005_world_expedition_progress.sql; these definitions mirror it exactly.
 *
 * They live in this module (not database/schema) only because Lane C may not edit the shared schema
 * index on day 1. Moving them to database/schema/progress.ts is a cross-lane change request.
 */

export interface GearState {
  owned: string[];
  equipped: string[];
}

/** One row per player: gear and daily streak. Level and XP are derived from the rewards ledger. */
export const playerProgress = pgTable(
  'player_progress',
  {
    playerId: uuid('player_id')
      .primaryKey()
      .references(() => players.id, { onDelete: 'cascade' }),
    gear: jsonb('gear').$type<GearState>().notNull().default({ owned: [], equipped: [] }),
    streakDays: integer('streak_days').notNull().default(0),
    lastPlayDate: date('last_play_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'player_progress_gear_ck',
      sql`jsonb_typeof(${t.gear}) = 'object' and jsonb_typeof(${t.gear} -> 'owned') = 'array' and jsonb_typeof(${t.gear} -> 'equipped') = 'array'`,
    ),
    check('player_progress_streak_ck', sql`${t.streakDays} >= 0`),
  ],
);

/** One row per (player, destination): stamps earned there and artifacts found. Server-written only. */
export const destinationStamps = pgTable(
  'destination_stamps',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    destination: text('destination').notNull(),
    count: integer('count').notNull().default(0),
    bestStreak: integer('best_streak').notNull().default(0),
    artifacts: jsonb('artifacts').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'destination_stamps_pk', columns: [t.playerId, t.destination] }),
    check('destination_stamps_destination_ck', sql`${t.destination} ~ '^[a-z0-9][a-z0-9-]{0,63}$'`),
    check('destination_stamps_count_ck', sql`${t.count} >= 0`),
    check('destination_stamps_best_streak_ck', sql`${t.bestStreak} >= 0`),
    check('destination_stamps_artifacts_ck', sql`jsonb_typeof(${t.artifacts}) = 'array'`),
  ],
);

/**
 * Append-only facts about one expedition run (a trigger forbids UPDATE and DELETE). At most one
 * event of each kind per session: the unique key makes anything awarded at completion exactly-once.
 */
export const expeditionEvents = pgTable(
  'expedition_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playSessionId: uuid('play_session_id').notNull(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('expedition_events_session_kind_uq').on(t.playSessionId, t.kind),
    foreignKey({
      name: 'expedition_events_session_player_fk',
      columns: [t.playSessionId, t.playerId],
      foreignColumns: [playSessions.id, playSessions.playerId],
    }).onDelete('cascade'),
    index('expedition_events_player_idx').on(t.playerId, t.createdAt),
    check('expedition_events_kind_ck', sql`${t.kind} ~ '^[a-z][a-z_]{0,31}$'`),
    check('expedition_events_payload_ck', sql`jsonb_typeof(${t.payload}) = 'object'`),
  ],
);

export type DestinationStampRow = typeof destinationStamps.$inferSelect;
