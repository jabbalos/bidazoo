import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { players } from './players';

/**
 * Canonical mastery state, one row per player and skill. Written only by the answer
 * transaction, using learning-core. The browser can display it but never submits it.
 */
export const skillMastery = pgTable(
  'skill_mastery',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    skillKey: text('skill_key').notNull(),
    /** Leitner box, 0..5. */
    box: smallint('box').notNull().default(0),
    streak: integer('streak').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    /** Distinct UTC days with a fluent correct answer. */
    fluentDays: integer('fluent_days').notNull().default(0),
    lastFluentDay: date('last_fluent_day', { mode: 'string' }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }).notNull(),
    masteredAt: timestamp('mastered_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.playerId, t.skillKey] }),
    index('skill_mastery_review_idx').on(t.playerId, t.nextReviewAt),
    check('skill_mastery_box_ck', sql`${t.box} between 0 and 5`),
    check(
      'skill_mastery_counts_ck',
      sql`${t.streak} >= 0 and ${t.attempts} >= 0 and ${t.correctCount} between 0 and ${t.attempts} and ${t.fluentDays} >= 0`,
    ),
  ],
);

export type SkillMasteryRow = typeof skillMastery.$inferSelect;
