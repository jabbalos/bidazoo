import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { childProfiles } from './child-profiles';
import { families, guardians } from './families';

/**
 * A trusted device: one browser the family has authorized. The browser holds a random opaque
 * token in an HttpOnly cookie; only its SHA-256 hash is stored here. Each row can be revoked
 * individually, and a revoked row can never be revived (trigger).
 *
 * Two independent ideas live on the row:
 *  - TRUST: the device belongs to the family until `expires_at` / `revoked_at`.
 *  - GUARDIAN AUTHORITY: set only when a guardian proved their email on this device. It is the
 *    narrow window `authority_expires_at` (shorter than device trust) and is re-proved by a new
 *    emailed link. A child's device never has it.
 *
 * `active_child_profile_id` is the profile this device plays as. Composite foreign keys make it
 * structurally impossible to point at a profile or guardian from another family.
 */
export const deviceSessions = pgTable(
  'device_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    guardianId: uuid('guardian_id'),
    activeChildProfileId: uuid('active_child_profile_id'),
    /** Hex SHA-256 of the cookie token. */
    tokenHash: text('token_hash').notNull(),
    /** How the device was authorized. */
    origin: text('origin').notNull(),
    /** Optional name the guardian or browser gave it ("Kitchen tablet"). Display only. */
    label: varchar('label', { length: 40 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByGuardianId: uuid('revoked_by_guardian_id').references(() => guardians.id, { onDelete: 'set null' }),
    authorityExpiresAt: timestamp('authority_expires_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('device_sessions_token_hash_uq').on(t.tokenHash),
    index('device_sessions_family_idx').on(t.familyId),
    foreignKey({
      name: 'device_sessions_guardian_family_fk',
      columns: [t.guardianId, t.familyId],
      foreignColumns: [guardians.id, guardians.familyId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'device_sessions_child_family_fk',
      columns: [t.activeChildProfileId, t.familyId],
      foreignColumns: [childProfiles.id, childProfiles.familyId],
    }),
    check('device_sessions_origin_ck', sql`${t.origin} in ('email_link', 'device_code')`),
    check('device_sessions_expiry_ck', sql`${t.expiresAt} > ${t.createdAt}`),
    check('device_sessions_authority_ck', sql`${t.authorityExpiresAt} is null or ${t.guardianId} is not null`),
  ],
);

/**
 * One-time codes a guardian generates to authorize another device (a child's tablet). Only the
 * hash of the code is stored. Redeeming one creates a device session with NO guardian authority.
 */
export const deviceAuthCodes = pgTable(
  'device_auth_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Hex SHA-256 of the normalized code. */
    codeHash: text('code_hash').notNull(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    /** Profile the new device starts as. Null means the device starts at the profile picker. */
    childProfileId: uuid('child_profile_id'),
    createdByGuardianId: uuid('created_by_guardian_id')
      .notNull()
      .references(() => guardians.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedByDeviceSessionId: uuid('used_by_device_session_id').references(() => deviceSessions.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('device_auth_codes_hash_uq').on(t.codeHash),
    index('device_auth_codes_family_idx').on(t.familyId),
    foreignKey({
      name: 'device_auth_codes_child_family_fk',
      columns: [t.childProfileId, t.familyId],
      foreignColumns: [childProfiles.id, childProfiles.familyId],
    }).onDelete('cascade'),
    check('device_auth_codes_expiry_ck', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

export type DeviceSession = typeof deviceSessions.$inferSelect;
export type DeviceAuthCode = typeof deviceAuthCodes.$inferSelect;
