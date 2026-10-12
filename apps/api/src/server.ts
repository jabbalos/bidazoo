import { buildApp } from './app';
import { loadConfig } from './config';
import { systemClock } from './context';
import { createDatabase } from './db';

const config = loadConfig();
const database = createDatabase(config.databaseUrl, {
  // Log the message only: the pg error can carry the client object, which holds connection details.
  onError: (err) => app.log.warn({ message: err.message }, 'database pool error (will reconnect)'),
});

const app = buildApp({
  checks: { database: () => database.ping() },
  ctx: {
    db: database.db,
    clock: systemClock,
    // __Host- prefix (browser-enforced: Secure, Path=/, no Domain) whenever the cookie is Secure.
    cookie: {
      name: config.cookieSecure ? '__Host-bidazoo_guest' : 'bidazoo_guest',
      secure: config.cookieSecure,
      maxAgeSeconds: 90 * 24 * 60 * 60,
    },
    allowedOrigins: config.allowedOrigins,
  },
  trustProxy: config.trustProxy,
  rateLimits: config.rateLimits,
  hstsMaxAgeSeconds: config.hstsMaxAgeSeconds,
  logger: {
    level: config.env === 'production' ? 'info' : 'debug',
    // Never log credentials or session cookies.
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  },
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
    await database.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error({ err }, 'failed to start');
  process.exit(1);
}
