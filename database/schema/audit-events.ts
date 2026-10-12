import { sql } from 'drizzle-orm';
import { bigint, check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Minimal security audit trail for identity actions. Append-only (the same trigger function that
 * guards the ledgers refuses UPDATE, and DELETE outside an erasure routine).
 *
 * Never stored here: raw tokens, cookies, PINs, hashes, email-link secrets, or email addresses.
 * Actors and subjects are opaque ids. `meta` is a small object built only from an allowlist of
 * keys in the API (see modules/identity/audit.ts). There are deliberately no foreign keys: an
 * audit record must outlive the rows it describes.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    familyId: uuid('family_id'),
    subjectType: text('subject_type'),
    subjectId: uuid('subject_id'),
    meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    index('audit_events_family_idx').on(t.familyId, t.at),
    index('audit_events_action_idx').on(t.action, t.at),
    check('audit_events_actor_ck', sql`${t.actorType} in ('guardian', 'device', 'system', 'operator')`),
    check('audit_events_meta_ck', sql`jsonb_typeof(${t.meta}) = 'object'`),
  ],
);

export type AuditEvent = typeof auditEvents.$inferSelect;
