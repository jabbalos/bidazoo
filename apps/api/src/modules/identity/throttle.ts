import type { FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import type { RateWindow } from '../../http/rate-limit';
import { ApiError } from '../../http/errors';
import type { AppContext, Executor } from '../../context';
import { hmacHex, ipSubject } from './crypto';
import type { IdentityRuntime } from './runtime';

/**
 * Durable abuse limits for identity-sensitive actions.
 *
 * The Checkpoint D limiter is in-process: a restart clears it and two API processes each keep
 * their own. These counters live in PostgreSQL (`identity_throttles`), so they survive restarts
 * and are shared. They sit BEHIND the in-process limiter, which stays as the outer layer.
 *
 * One atomic upsert counts a hit and returns the new count, so concurrent requests cannot
 * undercount. Each call is its own statement (never inside the caller's transaction): a request
 * that is later rejected still keeps its count. The key is a keyed HMAC of the thing counted, so
 * the table never holds a raw email address or IP address.
 *
 * Every limit is checked BEFORE the action it guards, so a throttled request changes nothing but
 * its own counter.
 */

export interface ThrottleResult {
  allowed: boolean;
  count: number;
  /** Whole seconds until the window ends (at least 1). */
  retryAfterSeconds: number;
}

/** Counts one hit of `subject` against `rule`. `subject` is hashed here; pass the raw value. */
export async function hit(
  ctx: AppContext,
  runtime: IdentityRuntime,
  scope: string,
  window: RateWindow,
  subject: string,
  executor: Executor = ctx.db,
): Promise<ThrottleResult> {
  const now = ctx.clock.now();
  const keyHash = hmacHex(runtime.keys.throttle, `${scope}\u0000${subject}`);
  const cap = window.max + 1; // stop counting just past the limit; the count never needs to grow further
  const result = await executor.execute(sql`
    INSERT INTO identity_throttles AS t (scope, key_hash, window_start, count)
    VALUES (${scope}, ${keyHash}, ${now}::timestamptz, 1)
    ON CONFLICT (scope, key_hash) DO UPDATE SET
      window_start = CASE WHEN t.window_start + make_interval(secs => ${window.windowSeconds}::double precision) <= ${now}::timestamptz
                          THEN ${now}::timestamptz ELSE t.window_start END,
      count = CASE WHEN t.window_start + make_interval(secs => ${window.windowSeconds}::double precision) <= ${now}::timestamptz
                   THEN 1 ELSE LEAST(t.count + 1, ${cap}::int) END
    RETURNING count, window_start
  `);
  const row = (result.rows as Array<{ count: number; window_start: Date | string }>)[0];
  if (!row) throw new Error('throttle upsert returned no row');
  const windowEnd = new Date(row.window_start).getTime() + window.windowSeconds * 1000;
  return {
    allowed: row.count <= window.max,
    count: row.count,
    retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now.getTime()) / 1000)),
  };
}

/** The request's client address as the unit that is limited (see ipSubject). Proxy-aware via Fastify. */
export function clientSubject(request: FastifyRequest): string {
  return ipSubject(request.ip);
}

/** Throws 429 (with Retry-After) when the caller is over the limit. */
export async function enforce(
  ctx: AppContext,
  runtime: IdentityRuntime,
  scope: string,
  window: RateWindow,
  subject: string,
): Promise<void> {
  const result = await hit(ctx, runtime, scope, window, subject);
  if (!result.allowed) throw new ApiError(429, 'rate_limited', undefined, result.retryAfterSeconds);
}

/**
 * Removes expired rows from the identity tables. Best-effort, at most once per ten minutes per
 * process: it is housekeeping, never part of a request's outcome.
 */
export async function maybeSweep(ctx: AppContext, runtime: IdentityRuntime): Promise<void> {
  const now = ctx.clock.now();
  if (now.getTime() - runtime.lastSweepAtMs < 10 * 60 * 1000) return;
  runtime.lastSweepAtMs = now.getTime();
  try {
    // 8 days is longer than the longest configurable window (7 days).
    await ctx.db.execute(sql`DELETE FROM identity_throttles WHERE window_start < ${now}::timestamptz - interval '8 days'`);
    // Unused links go a day after they expire; used ones (email already cleared) after a week.
    await ctx.db.execute(sql`
      DELETE FROM guardian_login_tokens
      WHERE (used_at IS NULL AND expires_at < ${now}::timestamptz - interval '1 day')
         OR (used_at IS NOT NULL AND used_at < ${now}::timestamptz - interval '7 days')`);
  } catch {
    // Cleanup failing must never fail a request; the next sweep retries.
  }
}
