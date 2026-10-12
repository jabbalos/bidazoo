import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * A player is identified by an opaque id plus a nickname. Nothing else.
 *
 * Child-data minimization: no real name, email, birth date, address, or school.
 * Anything that needs real-world identity belongs to a separate, future identity
 * module and must be justified on its own.
 *
 * Checkpoint A ships only this table, to prove the schema -> migration -> database
 * pipeline works. The rest of the planned datastore (play_sessions, questions_served,
 * attempts, skill_mastery, wallet_transactions, inventory_unlocks, achievements)
 * arrives with the checkpoints that need it.
 */
export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  nickname: varchar('nickname', { length: 32 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
