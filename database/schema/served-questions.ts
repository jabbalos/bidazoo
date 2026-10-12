import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { playSessions } from './play-sessions';

/**
 * A question exists here BEFORE it can be graded. The browser may only answer a question the
 * server issued to the player's own active session.
 *
 * `public_payload` is exactly what the client received. `private_grading_data` holds the answer
 * key and never leaves the server. `served_at` is set once, when the question is first issued,
 * and is never reset by a refresh: it is the start of the authoritative response timer.
 */
export const servedQuestions = pgTable(
  'served_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playSessionId: uuid('play_session_id')
      .notNull()
      .references(() => playSessions.id, { onDelete: 'cascade' }),
    sequence: smallint('sequence').notNull(),
    skillKey: text('skill_key').notNull(),
    /** Why the selector chose this fact: new, due, review, or retry. */
    selectionReason: text('selection_reason').notNull(),
    publicPayload: jsonb('public_payload').notNull(),
    privateGradingData: jsonb('private_grading_data').notNull(),
    servedAt: timestamp('served_at', { withTimezone: true }).notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
  },
  (t) => [
    unique('served_questions_session_sequence_uq').on(t.playSessionId, t.sequence),
    unique('served_questions_id_session_uq').on(t.id, t.playSessionId),
    // At most one outstanding (unanswered) question per session, enforced by the database.
    uniqueIndex('served_questions_one_open_uq')
      .on(t.playSessionId)
      .where(sql`${t.answeredAt} is null`),
    index('served_questions_skill_idx').on(t.skillKey),
    check('served_questions_sequence_ck', sql`${t.sequence} > 0`),
    check(
      'served_questions_reason_ck',
      sql`${t.selectionReason} in ('new', 'due', 'review', 'retry')`,
    ),
    check(
      'served_questions_time_ck',
      sql`${t.answeredAt} is null or ${t.answeredAt} >= ${t.servedAt}`,
    ),
  ],
);

export type ServedQuestion = typeof servedQuestions.$inferSelect;
