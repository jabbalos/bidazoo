import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration. Run via the root scripts:
 *   npm run db:generate   (diff schema -> new SQL migration in ./migrations)
 *   npm run db:migrate    (apply pending migrations to DATABASE_URL)
 *
 * DATABASE_URL comes from the environment (see .env.example). It is never hard-coded here.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
