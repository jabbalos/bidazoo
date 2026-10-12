import { createHash } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { API_PREFIX } from '@bidazoo/contracts';
import { ApiError } from './errors';

/**
 * Abuse protection (Checkpoint D).
 *
 * Built on @fastify/rate-limit with its in-memory store (no new infrastructure). Two rules keep
 * this layer from ever touching learning state:
 *  1. A limiter runs BEFORE the route handler (route `onRequest` hook, or the first statement of
 *     the guest-creation handler), so a throttled request never reaches the database.
 *  2. Limiters only ever answer 429/503. They cannot grade, reward, or alter a session.
 *
 * Window semantics: the plugin's local store keeps one counter per key, anchored at that key's
 * first request, and resets it when the window ends (a tumbling window, not a true sliding one).
 * A client can therefore spend up to twice its allowance across a window boundary; guest
 * creation uses two tiers (burst + hourly) to bound that. State is per API process and is lost
 * on restart. A multi-process deployment would need a shared store, which is deliberately NOT
 * introduced here (see docs/SECURITY.md).
 */

export interface RateWindow {
  /** Requests allowed per window. 0 disables the rule (only meaningful for the global ceiling). */
  max: number;
  windowSeconds: number;
}

export interface RateLimitConfig {
  /** Master switch. Off only for local debugging; tests that exercise limits turn it on. */
  enabled: boolean;
  /** New guests per client IP, short window (a classroom arriving together). */
  guestCreateBurst: RateWindow;
  /** New guests per client IP, long window. */
  guestCreateHourly: RateWindow;
  /**
   * Emergency circuit breaker: new guests across the whole service. Counts only creations that
   * already passed the per-IP rules. Existing guests are never affected. 0 disables it.
   */
  globalGuestCreate: RateWindow;
  /** Starting (or resuming) a play session, per guest. */
  sessionStart: RateWindow;
  /** Submitting answers, per guest. */
  answer: RateWindow;
  /** Backstop for every /api request from one IP (floods, forged cookies). */
  apiPerIp: RateWindow;
  /** Max tracked keys per limiter (oldest evicted first). Bounds memory. */
  cacheSize: number;
}

/**
 * Defaults, chosen from the real request pattern of one 10-question game:
 *   1 POST /guest, 1 POST /play-sessions, 11 POST .../question, 10 POST .../answers
 * (a refresh adds 1 guest + 1 session resume + 1 question; "Play again" adds 1 + 11 + 10).
 * A fast child finishes a game in about a minute, so one guest sends well under 30 requests per
 * minute. Every limit is several times that, and the per-IP rules assume a classroom behind one
 * NAT address.
 */
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  enabled: true,
  guestCreateBurst: { max: 30, windowSeconds: 60 },
  guestCreateHourly: { max: 150, windowSeconds: 3600 },
  globalGuestCreate: { max: 3000, windowSeconds: 3600 },
  sessionStart: { max: 30, windowSeconds: 600 },
  answer: { max: 120, windowSeconds: 60 },
  apiPerIp: { max: 2400, windowSeconds: 60 },
  cacheSize: 10_000,
};

const ms = (w: RateWindow): number => w.windowSeconds * 1000;
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

type Check = (request: FastifyRequest, options?: { increment?: boolean }) => Promise<
  | { isAllowed: true; key: string }
  | { isAllowed: false; remaining: number; ttlInSeconds: number; isExceeded: boolean }
>;

export type RouteLimitName = 'sessionStart' | 'answer';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Call immediately before creating a guest. Throws 429 (this IP is creating guests too fast)
     * or 503 (the service-wide breaker is open). Must be called BEFORE any write.
     */
    admitGuestCreation(request: FastifyRequest): Promise<void>;
    /** Route `config` for a per-guest limit, or undefined when limiting is disabled. */
    routeRateLimit(name: RouteLimitName): { rateLimit: Record<string, unknown> } | undefined;
  }
}

export interface RateLimitInstallOptions {
  /** Name of the guest cookie, used to key per-guest limits. */
  cookieName: string;
  /**
   * Name of the trusted-device cookie, set only when family identity is enabled. A request that
   * carries a well-formed device cookie is limited per DEVICE, so children on separate
   * devices behind one school or home IP do not share one address bucket.
   */
  deviceCookieName?: string | undefined;
}

/** Registers the plugin and decorators. With `config` undefined, limiting is off (no-ops). */
export function installRateLimiting(
  app: FastifyInstance,
  config: RateLimitConfig | undefined,
  options: RateLimitInstallOptions,
): void {
  if (!config || !config.enabled) {
    app.decorate('admitGuestCreation', async () => {});
    app.decorate('routeRateLimit', () => undefined);
    return;
  }

  void app.register(rateLimit, { global: false, cache: config.cacheSize });

  /**
   * Per-client key: a hash of the device cookie, else of the guest cookie (never the raw
   * credential), else the client IP. Only a well-formed device value is trusted as a key (so
   * junk cannot mint buckets from the device namespace). Forged or rotated cookies buy no extra
   * allowance beyond the per-IP backstop (`apiPerIp`), which is untouched and applies to every
   * request regardless of cookies.
   */
  const guestKey = (request: FastifyRequest): string => {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const device = options.deviceCookieName ? cookies?.[options.deviceCookieName] : undefined;
    if (device && /^[A-Za-z0-9_-]{43}$/.test(device)) return `d:${sha256(device)}`;
    const cookie = cookies?.[options.cookieName];
    return cookie ? `g:${sha256(cookie)}` : `ip:${request.ip}`;
  };
  const tooMany = (): ApiError => new ApiError(429, 'rate_limited');

  app.decorate('routeRateLimit', (name: RouteLimitName) => {
    const w = config[name];
    return {
      rateLimit: {
        max: w.max,
        timeWindow: ms(w),
        cache: config.cacheSize,
        groupId: name,
        keyGenerator: guestKey,
        errorResponseBuilder: () => tooMany(),
      },
    };
  });

  // The plugin's decorators exist once it has loaded; `after` runs at that point, in this
  // context, before any route that follows is registered.
  app.after(() => {
    const make = (w: RateWindow, extra: Record<string, unknown> = {}): Check =>
      app.createRateLimit({ max: w.max, timeWindow: ms(w), cache: config.cacheSize, ...extra } as never) as Check;

    const apiPerIp = make(config.apiPerIp);
    const burst = make(config.guestCreateBurst);
    const hourly = make(config.guestCreateHourly);
    const global = config.globalGuestCreate.max > 0 ? make(config.globalGuestCreate, { keyGenerator: () => 'global' }) : undefined;

    // Backstop on every API request, before anything else runs. Uses the (proxy-aware) client IP.
    app.addHook('onRequest', async (request) => {
      if (!request.url.startsWith(API_PREFIX)) return;
      const result = await apiPerIp(request);
      if (!result.isAllowed && result.isExceeded) {
        throw new ApiError(429, 'rate_limited', undefined, result.ttlInSeconds);
      }
    });

    app.decorate('admitGuestCreation', async (request: FastifyRequest) => {
      // 1. Is the emergency breaker open? Read without counting, so a tripped breaker does not
      //    also burn this IP's own allowance.
      if (global) {
        const state = await global(request, { increment: false });
        if (!state.isAllowed && state.remaining === 0) {
          throw new ApiError(503, 'service_busy', undefined, Math.max(1, state.ttlInSeconds));
        }
      }
      // 2. Per-IP rules. These count the attempt.
      for (const rule of [burst, hourly]) {
        const result = await rule(request);
        if (!result.isAllowed && result.isExceeded) {
          throw new ApiError(429, 'rate_limited', undefined, Math.max(1, result.ttlInSeconds));
        }
      }
      // 3. Only a creation that passed the per-IP rules counts toward the global ceiling, so one
      //    address can consume at most its own per-IP allowance of it.
      if (global) await global(request);
    });
  });
}
