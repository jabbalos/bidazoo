import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Durable abuse counters for identity-sensitive actions (email-link requests, link use, device
 * and claim codes). Unlike the in-process Checkpoint D limiter, these survive an API restart and
 * are shared by every API process.
 *
 * `key_hash` is a keyed HMAC of the thing being counted (an email address, an IP, a profile), so
 * this table never contains a raw email address or IP address. Each row is one tumbling window,
 * updated by a single atomic upsert; expired rows are swept opportunistically.
 */
export const identityThrottles = pgTable(
  'identity_throttles',
  {
    scope: text('scope').notNull(),
    keyHash: text('key_hash').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull(),
  },
  (t) => [
    primaryKey({ name: 'identity_throttles_pk', columns: [t.scope, t.keyHash] }),
    index('identity_throttles_window_idx').on(t.windowStart),
    check('identity_throttles_count_ck', sql`${t.count} >= 0`),
    check('identity_throttles_scope_ck', sql`length(${t.scope}) between 1 and 48`),
  ],
);

export type IdentityThrottle = typeof identityThrottles.$inferSelect;
