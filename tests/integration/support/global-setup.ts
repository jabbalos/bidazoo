import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

/**
 * Applies the real SQL migrations to the throwaway test database before the database-backed
 * tests run. Skipped (loudly) when TEST_DATABASE_URL is not set.
 */
export default async function setup(): Promise<void> {
  const url = process.env['TEST_DATABASE_URL'];
  if (!url) {
    console.warn(
      '\n[tests] TEST_DATABASE_URL is not set: database-backed tests are SKIPPED, not passed.\n' +
        '        Point it at a throwaway PostgreSQL database to run them (see docs/ARCHITECTURE.md).\n',
    );
    return;
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: fileURLToPath(new URL('../../../database/migrations', import.meta.url)),
    });
  } finally {
    await pool.end();
  }
}
