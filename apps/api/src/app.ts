import cookie from '@fastify/cookie';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { AppContext } from './context';
import { installHttpHooks } from './http/hooks';
import { deviceCookieName } from './modules/identity/devices';
import { installRateLimiting, type RateLimitConfig } from './http/rate-limit';
import type { TrustProxySetting } from './http/trust-proxy';
import { modules } from './modules';
import { healthRoutes, type ReadinessChecks } from './routes/health';

export interface BuildAppOptions {
  /** Injected so tests can run without a live database. */
  checks: ReadinessChecks;
  logger?: FastifyServerOptions['logger'];
  /**
   * Database, clock and cookie settings for the gameplay modules. Omit for a health-only app
   * (operational tests): the gameplay routes are then simply not registered.
   */
  ctx?: AppContext;
  /**
   * Abuse limits. Omitted (or `enabled: false`) means NO limiting: that is only for operational
   * tests. server.ts always passes the configured limits, which are ON by default.
   */
  rateLimits?: RateLimitConfig;
  /** Which proxies may set the client address (see http/trust-proxy.ts). Default: none. */
  trustProxy?: TrustProxySetting;
  /** Strict-Transport-Security max-age in seconds; 0 (default) sends no HSTS header. */
  hstsMaxAgeSeconds?: number;
}

/**
 * Builds the Fastify application without starting it (no port, no real I/O).
 * server.ts wires real dependencies; tests wire fakes or a throwaway database.
 */
export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    // Never `true`: see http/trust-proxy.ts. Without it request.ip is the socket address.
    trustProxy: options.trustProxy ?? false,
    // Requests here are tiny JSON documents. A small limit makes oversized input fail fast.
    bodyLimit: 16 * 1024,
    ajv: {
      customOptions: {
        // Reject, don't repair: unknown properties are an error (so { "coins": 999999 } is a
        // 400, not silently dropped), strings are never coerced into numbers, and defaults are
        // never injected into client input.
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: false,
        allErrors: false,
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>() as unknown as FastifyInstance;

  installHttpHooks(app, options.ctx?.allowedOrigins ?? [], options.hstsMaxAgeSeconds ?? 0);
  void app.register(cookie);
  installRateLimiting(app, options.rateLimits, {
    cookieName: options.ctx?.cookie.name ?? 'bidazoo_guest',
    deviceCookieName: options.ctx?.identity ? deviceCookieName(options.ctx.cookie.secure) : undefined,
  });

  void app.register(healthRoutes, { checks: options.checks });

  // Domain modules (modular monolith). Each registers its own routes as it gains features.
  for (const module of modules) {
    void app.register(module.plugin, { ctx: options.ctx });
  }

  return app;
}
