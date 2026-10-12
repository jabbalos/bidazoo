import { DEFAULT_RATE_LIMITS, type RateLimitConfig, type RateWindow } from './http/rate-limit';
import { parseTrustProxy, type TrustProxySetting } from './http/trust-proxy';

export interface ApiConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
  /** Send the guest cookie only over HTTPS. Defaults to true in production. */
  cookieSecure: boolean;
  /** Additional origins permitted to make state-changing requests (comma-separated env). */
  allowedOrigins: string[];
  /** Which proxies may set the client address. Default false: trust no forwarding header. */
  trustProxy: TrustProxySetting;
  /** Abuse limits (on by default). */
  rateLimits: RateLimitConfig;
  /** Strict-Transport-Security max-age in seconds. 0 = do not send the header. */
  hstsMaxAgeSeconds: number;
}

const ENVIRONMENTS = ['development', 'test', 'production'] as const;

function parseBoolean(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be "true" or "false"`);
}

function parseInteger(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a whole number between ${min} and ${max}`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) throw new Error(`${name} must be a whole number between ${min} and ${max}`);
  return parsed;
}

const MAX_WINDOW_SECONDS = 7 * 86_400;

/** Reads RATE_<NAME>_MAX and RATE_<NAME>_WINDOW_SECONDS. `allowZero` lets MAX=0 disable a rule. */
function parseWindow(
  source: Record<string, string | undefined>,
  name: string,
  fallback: RateWindow,
  allowZero = false,
): RateWindow {
  return {
    max: parseInteger(`RATE_${name}_MAX`, source[`RATE_${name}_MAX`], fallback.max, allowZero ? 0 : 1, 1_000_000),
    windowSeconds: parseInteger(`RATE_${name}_WINDOW_SECONDS`, source[`RATE_${name}_WINDOW_SECONDS`], fallback.windowSeconds, 1, MAX_WINDOW_SECONDS),
  };
}

export function loadRateLimits(source: Record<string, string | undefined>): RateLimitConfig {
  const d = DEFAULT_RATE_LIMITS;
  return {
    enabled: parseBoolean('RATE_LIMIT_ENABLED', source['RATE_LIMIT_ENABLED'], d.enabled),
    guestCreateBurst: parseWindow(source, 'GUEST_CREATE_BURST', d.guestCreateBurst),
    guestCreateHourly: parseWindow(source, 'GUEST_CREATE_HOURLY', d.guestCreateHourly),
    globalGuestCreate: parseWindow(source, 'GLOBAL_GUEST_CREATE', d.globalGuestCreate, true),
    sessionStart: parseWindow(source, 'SESSION_START', d.sessionStart),
    answer: parseWindow(source, 'ANSWER', d.answer),
    apiPerIp: parseWindow(source, 'API_PER_IP', d.apiPerIp),
    cacheSize: parseInteger('RATE_CACHE_SIZE', source['RATE_CACHE_SIZE'], d.cacheSize, 100, 1_000_000),
  };
}

/**
 * Reads and validates configuration from the environment.
 *
 * Error messages name the variable but never echo its value, because
 * DATABASE_URL can contain a password.
 */
export function loadConfig(source: Record<string, string | undefined> = process.env): ApiConfig {
  const env = source['NODE_ENV'] ?? 'development';
  if (!(ENVIRONMENTS as readonly string[]).includes(env)) {
    throw new Error(`NODE_ENV must be one of: ${ENVIRONMENTS.join(', ')}`);
  }

  const port = Number(source['API_PORT'] ?? '3001');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be an integer between 1 and 65535');
  }

  const databaseUrl = source['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required (see .env.example)');
  }

  const allowedOrigins = (source['ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
  for (const origin of allowedOrigins) {
    try {
      if (new URL(origin).origin !== origin) throw new Error('not an origin');
    } catch {
      throw new Error('ALLOWED_ORIGINS must be a comma-separated list of origins like https://play.example.com');
    }
  }

  return {
    env: env as ApiConfig['env'],
    host: source['API_HOST'] ?? '127.0.0.1',
    port,
    databaseUrl,
    cookieSecure: parseBoolean('COOKIE_SECURE', source['COOKIE_SECURE'], env === 'production'),
    allowedOrigins,
    trustProxy: parseTrustProxy(source['TRUST_PROXY']),
    rateLimits: loadRateLimits(source),
    hstsMaxAgeSeconds: parseInteger('HSTS_MAX_AGE_SECONDS', source['HSTS_MAX_AGE_SECONDS'], 0, 0, 63_072_000),
  };
}
