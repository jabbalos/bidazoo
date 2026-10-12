import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Checkpoint E: family identity (additive; nothing here touches players, attempts, ledgers or
 * mastery).
 *
 * A family is only a grouping row. The guardian is the only kind of account that holds an email,
 * and the only kind that can authenticate over the internet.
 */
export const families = pgTable('families', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A guardian account. A row exists only AFTER the email address was proved by a one-time link,
 * so `email_verified_at` is NOT NULL: there is no unverified guardian to grant authority to.
 *
 * `email` is the normalized form (NFKC, trimmed, lower-cased; no provider-specific folding). The
 * check constraint is a backstop for the lower-casing; normalization itself lives in the API.
 */
export const guardians = pgTable(
  'guardians',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'restrict' }),
    email: text('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('guardians_email_uq').on(t.email),
    // Target of composite foreign keys that prove "this guardian belongs to this family".
    unique('guardians_id_family_uq').on(t.id, t.familyId),
    index('guardians_family_idx').on(t.familyId),
    check('guardians_email_ck', sql`${t.email} = lower(${t.email}) and length(${t.email}) between 3 and 254`),
  ],
);

/**
 * One-time emailed sign-in links. Only the SHA-256 hash of the random token is stored, never the
 * token. The pending email is kept only until the link is used (then it is cleared) or the row
 * is swept after expiry. A trigger makes a used link permanently unusable and its hash immutable.
 */
export const guardianLoginTokens = pgTable(
  'guardian_login_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Hex SHA-256 of the emailed token. */
    tokenHash: text('token_hash').notNull(),
    purpose: text('purpose').notNull().default('sign_in'),
    /** Normalized address the link was sent to. NULL once the link has been used. */
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('guardian_login_tokens_hash_uq').on(t.tokenHash),
    index('guardian_login_tokens_expires_idx').on(t.expiresAt),
    check('guardian_login_tokens_purpose_ck', sql`${t.purpose} in ('sign_in')`),
    check('guardian_login_tokens_expiry_ck', sql`${t.expiresAt} > ${t.createdAt}`),
    check('guardian_login_tokens_email_ck', sql`${t.usedAt} is not null or ${t.email} is not null`),
  ],
);

export type Family = typeof families.$inferSelect;
export type Guardian = typeof guardians.$inferSelect;
export type GuardianLoginToken = typeof guardianLoginTokens.$inferSelect;
