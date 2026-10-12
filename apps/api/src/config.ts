export interface ApiConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
  /** Send the guest cookie only over HTTPS. Defaults to true in production. */
  cookieSecure: boolean;
  /** Additional origins permitted to make state-changing requests (comma-separated env). */
  allowedOrigins: string[];
}

const ENVIRONMENTS = ['development', 'test', 'production'] as const;

function parseBoolean(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be "true" or "false"`);
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
  };
}
