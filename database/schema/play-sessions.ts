import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { players } from './players';

/**
 * One run of a game (Checkpoint B: 10 multiplication questions).
 *
 * The session is the unit that serializes answers: the answer transaction locks this row, so
 * two simultaneous answers for the same session are processed one after the other.
 */
export const playSessions = pgTable(
  'play_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    gameId: text('game_id').notNull(),
    mode: text('mode').notNull(),
    status: text('status').notNull().default('active'),
    /** Random per-session seed. Question generation is deterministic from (seed, sequence). */
    seed: text('seed').notNull(),
    totalQuestions: smallint('total_questions').notNull(),
    answeredCount: smallint('answered_count').notNull().default(0),
    correctCount: smallint('correct_count').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    // Lets child tables prove "this session belongs to this player" with a composite foreign key.
    unique('play_sessions_id_player_uq').on(t.id, t.playerId),
    // At most one active session per player and game: a refresh resumes it instead of forking.
    uniqueIndex('play_sessions_one_active_uq')
      .on(t.playerId, t.gameId)
      .where(sql`${t.status} = 'active'`),
    index('play_sessions_player_idx').on(t.playerId, t.startedAt),
    check('play_sessions_status_ck', sql`${t.status} in ('active', 'completed', 'expired')`),
    check('play_sessions_total_ck', sql`${t.totalQuestions} > 0`),
    check(
      'play_sessions_progress_ck',
      sql`${t.answeredCount} between 0 and ${t.totalQuestions} and ${t.correctCount} between 0 and ${t.answeredCount}`,
    ),
    check(
      'play_sessions_completed_ck',
      sql`(${t.status} = 'completed') = (${t.completedAt} is not null)`,
    ),
  ],
);

export type PlaySession = typeof playSessions.$inferSelect;
