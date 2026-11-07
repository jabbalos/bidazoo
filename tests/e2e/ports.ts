/**
 * Loopback ports the e2e stacks bind. One source of truth so the suite can run next to other
 * local services (the Studio PC keeps its own things on 3001 and friends).
 *
 *   E2E_API_PORT   default 3001   identity-OFF API            (identity-ON API  = +1)
 *   E2E_PLAY_PORT  default 4173   identity-OFF play preview   (identity-ON play = +1, character lab = +2)
 *
 * Leave both unset for the documented defaults. The Studio validator (scripts/validate-studio.ps1)
 * sets them only when a default port is already taken, and records what it used.
 */
function portFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1024 || n > 65533) {
    throw new Error(`${name} must be an integer between 1024 and 65533 (got "${raw}")`);
  }
  return n;
}

export const API_PORT = portFromEnv('E2E_API_PORT', 3001);
export const PLAY_PORT = portFromEnv('E2E_PLAY_PORT', 4173);
export const ID_API_PORT = API_PORT + 1;
export const ID_PLAY_PORT = PLAY_PORT + 1;
export const LAB_PORT = PLAY_PORT + 2;
