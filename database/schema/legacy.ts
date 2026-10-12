import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { childProfiles } from './child-profiles';
import { families, guardians } from './families';

/**
 * Legacy (Hop Quest) claim plumbing, per the approved identity migration assessment.
 *
 * This is the ONLY legacy data BidaZoo ever holds, and it arrives through an offline manifest
 * loader, never through a runtime connection. Deliberately absent: parent emails (only a peppered
 * HMAC match key is stored), names, PIN hashes or salts, cookies, tokens, passwords, progress,
 * coins, mastery, badges, streaks, inventory, answer history, sessions, marketing contacts.
 */

/** One row per manifest load, so a stale export can be replaced by a newer one. */
export const legacyBatches = pgTable(
  'legacy_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceSystem: text('source_system').notNull().default('hopquest'),
    exportedAt: timestamp('exported_at', { withTimezone: true }),
    loadedAt: timestamp('loaded_at', { withTimezone: true }).notNull().defaultNow(),
    /** Free-text operator label passed to the loader. Display only. */
    loadedBy: varchar('loaded_by', { length: 40 }),
    familyCount: integer('family_count').notNull(),
    kidCount: integer('kid_count').notNull(),
  },
  (t) => [
    check('legacy_batches_source_ck', sql`${t.sourceSystem} in ('hopquest')`),
    check('legacy_batches_counts_ck', sql`${t.familyCount} >= 0 and ${t.kidCount} >= 0`),
  ],
);

/**
 * A legacy family waiting to be claimed by exactly one BidaZoo family. `email_match_hmac` is
 * HMAC-SHA-256(LEGACY_MATCH_PEPPER, "bidazoo-legacy-match-v1:" + normalized email) as lowercase
 * hex. It is looked up only AFTER a guardian proved control of their email.
 *
 * The claim is one atomic update (`WHERE status = 'unclaimed'`); the partial unique indexes make a
 * duplicate legacy family or a duplicate match key impossible while a row is live, and a trigger
 * allows only unclaimed -> claimed | withdrawn.
 */
export const legacyFamilies = pgTable(
  'legacy_families',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => legacyBatches.id, { onDelete: 'restrict' }),
    legacyFamilyId: text('legacy_family_id').notNull(),
    emailMatchHmac: text('email_match_hmac').notNull(),
    status: text('status').notNull().default('unclaimed'),
    familyId: uuid('family_id').references(() => families.id, { onDelete: 'restrict' }),
    claimedByGuardianId: uuid('claimed_by_guardian_id').references(() => guardians.id, { onDelete: 'restrict' }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimMethod: text('claim_method'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('legacy_families_legacy_id_live_uq')
      .on(t.legacyFamilyId)
      .where(sql`${t.status} <> 'withdrawn'`),
    uniqueIndex('legacy_families_match_live_uq')
      .on(t.emailMatchHmac)
      .where(sql`${t.status} <> 'withdrawn'`),
    index('legacy_families_family_idx').on(t.familyId),
    check('legacy_families_status_ck', sql`${t.status} in ('unclaimed', 'claimed', 'withdrawn')`),
    check('legacy_families_hmac_ck', sql`${t.emailMatchHmac} ~ '^[0-9a-f]{64}$'`),
    check('legacy_families_method_ck', sql`${t.claimMethod} is null or ${t.claimMethod} in ('verified-email-match', 'operator-code')`),
    check(
      'legacy_families_claim_ck',
      sql`(${t.status} = 'claimed' and ${t.familyId} is not null and ${t.claimedByGuardianId} is not null and ${t.claimedAt} is not null and ${t.claimMethod} is not null)
        or (${t.status} <> 'claimed' and ${t.familyId} is null and ${t.claimedByGuardianId} is null and ${t.claimedAt} is null and ${t.claimMethod} is null)`,
    ),
  ],
);

/**
 * One slot per legacy child, filled in by the guardian after the family claim. The username is a
 * display label only, never a credential. `grade_band` is a label only (nothing in gameplay
 * reads it). Linking creates a FRESH player: no legacy progress crosses over.
 */
export const legacyKids = pgTable(
  'legacy_kids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legacyFamilyRowId: uuid('legacy_family_row_id')
      .notNull()
      .references(() => legacyFamilies.id, { onDelete: 'restrict' }),
    legacyKidId: text('legacy_kid_id').notNull(),
    legacyUsername: varchar('legacy_username', { length: 40 }),
    gradeBand: varchar('grade_band', { length: 16 }),
    childProfileId: uuid('child_profile_id').references(() => childProfiles.id, { onDelete: 'restrict' }),
    linkedAt: timestamp('linked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('legacy_kids_legacy_kid_uq').on(t.legacyKidId),
    // A child profile can stand in for at most one legacy kid.
    uniqueIndex('legacy_kids_profile_uq')
      .on(t.childProfileId)
      .where(sql`${t.childProfileId} is not null`),
    index('legacy_kids_family_idx').on(t.legacyFamilyRowId),
    check('legacy_kids_link_ck', sql`(${t.childProfileId} is null) = (${t.linkedAt} is null)`),
  ],
);

/**
 * Operator-issued fallback for a legacy parent whose current email differs. Single use, bound to
 * one legacy family row, hash stored, expires. Issued by a CLI on the Studio PC after the
 * operator confirms the person out of band; there is no HTTP route that issues one.
 */
export const legacyClaimCodes = pgTable(
  'legacy_claim_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codeHash: text('code_hash').notNull(),
    legacyFamilyRowId: uuid('legacy_family_row_id')
      .notNull()
      .references(() => legacyFamilies.id, { onDelete: 'restrict' }),
    issuedBy: varchar('issued_by', { length: 40 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedByGuardianId: uuid('used_by_guardian_id').references(() => guardians.id, { onDelete: 'restrict' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('legacy_claim_codes_hash_uq').on(t.codeHash),
    index('legacy_claim_codes_family_idx').on(t.legacyFamilyRowId),
    check('legacy_claim_codes_expiry_ck', sql`${t.expiresAt} > ${t.createdAt}`),
    check('legacy_claim_codes_use_ck', sql`(${t.usedAt} is null) = (${t.usedByGuardianId} is null)`),
  ],
);

export type LegacyBatch = typeof legacyBatches.$inferSelect;
export type LegacyFamily = typeof legacyFamilies.$inferSelect;
export type LegacyKid = typeof legacyKids.$inferSelect;
export type LegacyClaimCode = typeof legacyClaimCodes.$inferSelect;
