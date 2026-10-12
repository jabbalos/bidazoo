import { sql } from 'drizzle-orm';
import { check, index, pgTable, smallint, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { families, guardians } from './families';
import { players } from './players';

/**
 * A child profile: a family's handle on exactly ONE existing `players` row.
 *
 * It only attaches ownership and recovery to a player. It never copies, moves or rewrites
 * anything the player owns (attempts, mastery, XP and coin ledgers stay keyed by `players.id`).
 * The player link is RESTRICT, so a claimed player can never be deleted by deleting identity
 * rows, and a trigger makes `player_id` and `family_id` immutable once set.
 *
 * No email lives here. The optional PIN is a local profile-switch lock on an already trusted
 * device. It is never a credential by itself (there is no endpoint that accepts a PIN alone).
 * `pin_hash` is a self-describing scrypt string that includes its own random salt.
 */
export const childProfiles = pgTable(
  'child_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'restrict' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    nickname: varchar('nickname', { length: 32 }).notNull(),
    pinHash: text('pin_hash'),
    pinSetAt: timestamp('pin_set_at', { withTimezone: true }),
    pinFailures: smallint('pin_failures').notNull().default(0),
    pinLockedUntil: timestamp('pin_locked_until', { withTimezone: true }),
    createdByGuardianId: uuid('created_by_guardian_id').references(() => guardians.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Archived profiles cannot authenticate; the player and its history are untouched. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    // One profile per player: this is what makes a guest claim safe against a double claim.
    unique('child_profiles_player_uq').on(t.playerId),
    // Target of composite foreign keys that prove "this child belongs to this family".
    unique('child_profiles_id_family_uq').on(t.id, t.familyId),
    index('child_profiles_family_idx').on(t.familyId),
    check('child_profiles_nickname_ck', sql`length(btrim(${t.nickname})) between 1 and 32 and ${t.nickname} = btrim(${t.nickname})`),
    check('child_profiles_pin_ck', sql`(${t.pinHash} is null) = (${t.pinSetAt} is null)`),
    check('child_profiles_pin_failures_ck', sql`${t.pinFailures} >= 0`),
  ],
);

export type ChildProfile = typeof childProfiles.$inferSelect;
