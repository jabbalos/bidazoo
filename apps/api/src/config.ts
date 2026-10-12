export interface ApiConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
}

const ENVIRONMENTS = ['development', 'test', 'production'] as const;

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

  return {
    env: env as ApiConfig['env'],
    host: source['API_HOST'] ?? '127.0.0.1',
    port,
    databaseUrl,
  };
}
