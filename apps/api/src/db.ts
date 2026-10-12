import * as schema from '@bidazoo/database/schema';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export interface DatabaseOptions {
  /**
   * Called when the pool reports an error on an idle connection (database restart,
   * failover, network drop). Receives only the error; never log the client object.
   */
  onError?: (err: Error) => void;
}

export interface Database {
  /** Drizzle handle. Domain modules will receive this; routes never build SQL by hand. */
  db: ReturnType<typeof drizzle<typeof schema>>;
  /** Underlying pool. Exposed for shutdown and tests only; domain code uses `db`. */
  pool: pg.Pool;
  /** Resolves true if the database answers a trivial query; rejects otherwise. */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * Creates the connection pool lazily: no connection is attempted until the first query,
 * so the API can start while PostgreSQL is down and /ready will honestly report it.
 */
export function createDatabase(databaseUrl: string, options: DatabaseOptions = {}): Database {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 2_000,
    query_timeout: 2_000,
  });

  // REQUIRED: without a listener, an 'error' event on an idle client (for example when
  // PostgreSQL restarts) is an uncaught exception and kills the whole process.
  // The pool discards the broken client and reconnects on the next query.
  pool.on('error', (err) => options.onError?.(err));

  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    async ping() {
      await db.execute(sql`select 1`);
      return true;
    },
    async close() {
      await pool.end();
    },
  };
}
