import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
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
import { servedQuestions } from './served-questions';

/**
 * The one final grade of a served question. Rows are immutable (a trigger forbids UPDATE and
 * DELETE; see the custom migration).
 *
 * Database-level guarantees, independent of application code:
 *  - unique(served_question_id): a question can receive only ONE final grade.
 *  - unique(player_id, idempotency_key): the same client attempt id cannot be recorded twice.
 *  - composite foreign keys: the question belongs to the session, and the session belongs to
 *    the player, so an attempt cannot join a question to someone else's session.
 */
export const attempts = pgTable(
  'attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    servedQuestionId: uuid('served_question_id').notNull(),
    playSessionId: uuid('play_session_id').notNull(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    submittedResponse: integer('submitted_response').notNull(),
    correct: boolean('correct').notNull(),
    /** correct AND response_ms within the fluency window. */
    fluent: boolean('fluent').notNull(),
    /** answered_at minus served_at, both server timestamps. */
    responseMs: integer('response_ms').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('attempts_served_question_uq').on(t.servedQuestionId),
    unique('attempts_player_idempotency_uq').on(t.playerId, t.idempotencyKey),
    foreignKey({
      name: 'attempts_question_session_fk',
      columns: [t.servedQuestionId, t.playSessionId],
      foreignColumns: [servedQuestions.id, servedQuestions.playSessionId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'attempts_session_player_fk',
      columns: [t.playSessionId, t.playerId],
      foreignColumns: [playSessions.id, playSessions.playerId],
    }).onDelete('cascade'),
    index('attempts_session_idx').on(t.playSessionId),
    check('attempts_response_ms_ck', sql`${t.responseMs} >= 0`),
    check('attempts_fluent_ck', sql`not ${t.fluent} or ${t.correct}`),
  ],
);

export type Attempt = typeof attempts.$inferSelect;
