import { Writable } from 'node:stream';
import { sql as dsql } from 'drizzle-orm';
import { auditEvents } from '@bidazoo/database/schema';
import type { Db } from '@bidazoo/api/context';
import { sql, type Harness } from './harness';

/** Every table that can hold identity data. Secret scans walk all of them. */
export const IDENTITY_TABLES = [
  'families', 'guardians', 'guardian_login_tokens', 'child_profiles', 'device_sessions', 'device_auth_codes',
  'identity_throttles', 'audit_events', 'legacy_batches', 'legacy_families', 'legacy_kids', 'legacy_claim_codes',
  'players', 'guest_sessions',
] as const;

/** The tables whose row text contains `needle` (case-sensitive). Empty array means it is nowhere. */
export async function tablesContaining(h: Harness, needle: string): Promise<string[]> {
  const found: string[] = [];
  for (const table of IDENTITY_TABLES) {
    const rows = await sql<{ n: string }>(
      h,
      `select count(*)::text as n from ${table} t where position($1 in row_to_json(t)::text) > 0`,
      [needle],
    );
    if (Number(rows[0]?.n ?? 0) > 0) found.push(table);
  }
  return found;
}

/**
 * Localized fault injection: a view of the database whose transactions fail when the `nth`
 * audit_events insert is attempted. Every other statement is real, so everything the action wrote
 * BEFORE its audit row is genuinely written and must then be rolled back. No trigger, no schema
 * change, and nothing else in the suite can observe it.
 */
export function faultyDb(real: Db, nth = 1): Db {
  let seen = 0;
  const bound = (target: object, prop: string | symbol) => {
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  };
  const wrapTx = (tx: object): object =>
    new Proxy(tx, {
      get(target, prop) {
        if (prop === 'insert') {
          return (table: unknown) => {
            if (table === auditEvents) {
              seen += 1;
              if (seen === nth) return { values: () => Promise.reject(new Error('injected audit failure')) };
            }
            return (target as { insert: (t: unknown) => unknown }).insert(table);
          };
        }
        return bound(target, prop);
      },
    });
  return new Proxy(real, {
    get(target, prop) {
      if (prop === 'transaction') {
        return (callback: (tx: object) => Promise<unknown>, config?: unknown) =>
          (target as unknown as { transaction: (cb: unknown, c?: unknown) => Promise<unknown> }).transaction(
            (tx: object) => callback(wrapTx(tx)),
            config,
          );
      }
      return bound(target, prop);
    },
  }) as Db;
}

/** Runs `action` with the harness database failing at its nth audit insert, then restores it. */
export async function withAuditFault<T>(h: Harness, nth: number, action: () => Promise<T>): Promise<T> {
  const real = h.ctx.db;
  (h.ctx as { db: Db }).db = faultyDb(real, nth);
  try {
    return await action();
  } finally {
    (h.ctx as { db: Db }).db = real;
  }
}

/** Makes every transaction run a real query that fails with the given secret bound as a parameter. */
export async function withBrokenDb<T>(h: Harness, secretParam: string, action: () => Promise<T>): Promise<T> {
  const real = h.ctx.db;
  const broken = new Proxy(real, {
    get(target, prop) {
      if (prop === 'transaction') return () => target.execute(dsql`select ${secretParam}::int`);
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Db;
  (h.ctx as { db: Db }).db = broken;
  try {
    return await action();
  } finally {
    (h.ctx as { db: Db }).db = real;
  }
}

/** A Fastify logger config that collects everything written, with the production redaction list. */
export function captureLogs() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(String(chunk));
      done();
    },
  });
  return {
    logger: {
      level: 'trace',
      stream,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
    text: () => chunks.join(''),
  };
}
