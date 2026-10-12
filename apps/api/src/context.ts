import type { Database } from './db';
import type { IdentityRuntime } from './modules/identity/runtime';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export type Db = Database['db'];
/** The handle passed to a `db.transaction` callback. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Anything that can run queries: the database itself or an open transaction. */
export type Executor = Db | Tx;

export interface CookieSettings {
  name: string;
  secure: boolean;
  maxAgeSeconds: number;
}

/**
 * Everything the gameplay modules need, injected by server.ts (real) or tests (fake clock,
 * throwaway database). Modules never import a global database or read process.env.
 */
export interface AppContext {
  db: Db;
  clock: Clock;
  cookie: CookieSettings;
  /** Extra origins allowed to send state-changing requests, besides the API's own origin. */
  allowedOrigins: readonly string[];
  /**
   * Family identity (Checkpoint E). UNDEFINED means identity is off: no identity route exists and
   * only the guest cookie authenticates, exactly like the guest-only build.
   */
  identity?: IdentityRuntime;
}

export interface ModuleOptions {
  /** Absent for a health-only app (operational tests with no database). */
  ctx?: AppContext;
}
