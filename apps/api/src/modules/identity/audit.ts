import { auditEvents } from '@bidazoo/database/schema';
import type { Clock, Executor } from '../../context';

/**
 * The security audit trail for identity actions (append-only table `audit_events`).
 *
 * What is recorded: who (an opaque actor id), what (a fixed action name), which family, which
 * subject (an opaque id), and a tiny `meta` object built ONLY from an allowlist of keys whose
 * values are short strings, numbers or booleans.
 *
 * Conventions (a test enforces the checkable ones):
 *  - one row per security-significant STATE CHANGE, written in the same transaction as the change,
 *    so a rollback removes it and a failed request never leaves a success record;
 *  - an idempotent replay or a no-op writes nothing (no change, no event). The one deliberate
 *    exception is `device.revoked_all`: an explicit "revoke everything" is recorded per call with
 *    its `count` (0 for a no-op), because the guardian's intent is itself security-relevant;
 *  - ordinary requests (reads, plain profile switches) are not audited;
 *  - `at` is the server clock at the moment of the action (never a client value);
 *  - the actor is the authenticated guardian when there is one, `device` for an unauthenticated
 *    local action (a PIN lock), `operator` for CLI tools.
 *
 * What is never recorded: raw tokens, cookies, PINs, hashes, email-link secrets, or email
 * addresses. This is enforced here, not left to callers: a key outside the allowlist, or a value
 * that looks like a secret or an email, THROWS (a programmer error), and the throw message never
 * echoes the value.
 */

/** Every audit action. Names are `<subject>.<past-tense verb>`; a test enforces the shape. */
export const AUDIT_ACTIONS = [
  'guardian.created',
  'guardian.verified',
  'device.authorized',
  'device.revoked',
  'device.revoked_all',
  'device.code_issued',
  'child.created',
  'child.archived',
  'child.restored',
  'guest.claimed',
  'pin.set',
  'pin.cleared',
  'pin.locked',
  'legacy.batch_loaded',
  'legacy.claim_code_issued',
  'legacy.claim_code_redeemed',
  'legacy.claim_code_revoked',
  'legacy.family_claimed',
  'legacy.kid_linked',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditInput {
  actorType: 'guardian' | 'device' | 'system' | 'operator';
  actorId?: string | null;
  action: AuditAction;
  familyId?: string | null;
  subjectType?: string;
  subjectId?: string;
  meta?: Record<string, string | number | boolean>;
}

const META_KEYS = new Set(['method', 'origin', 'reason', 'count', 'childCount', 'kidCount', 'includeCurrent', 'replaced', 'wasSet']);
const SECRET_LIKE = [
  /@/, //                         an email address
  /^[A-Za-z0-9_-]{32,}$/, //      a base64url token or a long opaque string
  /^[0-9a-f]{32,}$/i, //          a hex hash
  /\b\d{4,}\b/, //                something PIN-shaped
];

function checkMeta(meta: Record<string, string | number | boolean>): void {
  for (const [key, value] of Object.entries(meta)) {
    if (!META_KEYS.has(key)) throw new Error('audit meta key is not allowed');
    if (typeof value === 'string') {
      if (value.length > 40 || SECRET_LIKE.some((pattern) => pattern.test(value))) {
        throw new Error('audit meta value looks like a secret or an email address');
      }
    } else if (typeof value !== 'number' && typeof value !== 'boolean') {
      throw new Error('audit meta values must be strings, numbers or booleans');
    }
  }
}

/** Writes one audit row. Pass the open transaction so the record commits or rolls back with the action. */
export async function recordAudit(executor: Executor, clock: Clock, event: AuditInput): Promise<void> {
  const meta = event.meta ?? {};
  checkMeta(meta);
  await executor.insert(auditEvents).values({
    at: clock.now(),
    actorType: event.actorType,
    actorId: event.actorId ?? null,
    action: event.action,
    familyId: event.familyId ?? null,
    subjectType: event.subjectType ?? null,
    subjectId: event.subjectId ?? null,
    meta,
  });
}
