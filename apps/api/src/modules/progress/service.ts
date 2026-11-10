import { and, asc, eq, sql } from 'drizzle-orm';
import { playSessions } from '@bidazoo/database/schema';
import {
  EXPEDITION_DESTINATIONS,
  type ExpeditionDestination,
  type ExpeditionProgress,
  type Stamp,
} from '@bidazoo/contracts';
import type { Db, Executor, Tx } from '../../context';
import { errors } from '../../http/errors';
import { destinationStamps, expeditionEvents, type DestinationStampRow } from './tables';

/** Owner decision (proposal section 10): a stamp needs at least 3 of the 5 beacons lit. */
export const STAMP_MIN_BEACONS = 3;

/** The event kind written once per completed expedition run. */
export const EXPEDITION_RUN_EVENT = 'expedition_run';

export function isExpeditionDestination(value: string): value is ExpeditionDestination {
  return (EXPEDITION_DESTINATIONS as readonly string[]).includes(value);
}

/**
 * Which destinations a player may start, from the destinations where they hold at least one stamp.
 *
 * PENDING owner decision (unlock rules are a product decision). Placeholder rule: the first
 * destination is always open, and each later one opens once the one before it has a stamp.
 * Pure: no database, no clock.
 */
export function unlockedDestinations(stamped: ReadonlySet<string>): ExpeditionDestination[] {
  const unlocked: ExpeditionDestination[] = [];
  for (const [i, destination] of EXPEDITION_DESTINATIONS.entries()) {
    const previous = i === 0 ? undefined : EXPEDITION_DESTINATIONS[i - 1];
    if (previous !== undefined && !stamped.has(previous)) break;
    unlocked.push(destination);
  }
  return unlocked;
}

function orderOf(destination: string): number {
  const i = (EXPEDITION_DESTINATIONS as readonly string[]).indexOf(destination);
  return i === -1 ? EXPEDITION_DESTINATIONS.length : i;
}

function toStamp(row: DestinationStampRow): Stamp {
  return {
    destination: row.destination,
    count: row.count,
    bestStreak: row.bestStreak,
    artifacts: Array.isArray(row.artifacts) ? row.artifacts.filter((a): a is string => typeof a === 'string') : [],
  };
}

/** GET /api/v1/me/expedition: the player's stamps (passport order) and unlocked destinations. Read-only. */
export async function getExpeditionProgress(executor: Executor, playerId: string): Promise<ExpeditionProgress> {
  const rows = await executor
    .select()
    .from(destinationStamps)
    .where(eq(destinationStamps.playerId, playerId))
    .orderBy(asc(destinationStamps.destination));
  rows.sort((a, b) => orderOf(a.destination) - orderOf(b.destination));
  const stamped = new Set(rows.filter((row) => row.count > 0).map((row) => row.destination));
  return { stamps: rows.map(toStamp), unlocked: unlockedDestinations(stamped) };
}

export interface ExpeditionRun {
  playerId: string;
  playSessionId: string;
  destination: string;
  /** From the server's own replay of its stored answers (replayExpedition), never from the client. */
  beaconsLit: number;
  bossWon: boolean;
  bestStreak: number;
}

/**
 * Records one completed expedition run and, when at least STAMP_MIN_BEACONS beacons were lit, adds
 * a stamp. Exactly-once per session: a second call for the same session changes nothing and
 * returns the first outcome. Call it inside the session-completion transaction (item C2).
 */
export async function recordExpeditionRun(tx: Tx, run: ExpeditionRun): Promise<{ stampEarned: boolean }> {
  if (!isExpeditionDestination(run.destination)) throw new Error('unknown expedition destination');
  if (!Number.isInteger(run.beaconsLit) || run.beaconsLit < 0) throw new Error('invalid beacon count');
  if (!Number.isInteger(run.bestStreak) || run.bestStreak < 0) throw new Error('invalid streak');
  const stampEarned = run.beaconsLit >= STAMP_MIN_BEACONS;

  const inserted = await tx
    .insert(expeditionEvents)
    .values({
      playSessionId: run.playSessionId,
      playerId: run.playerId,
      kind: EXPEDITION_RUN_EVENT,
      payload: { destination: run.destination, beaconsLit: run.beaconsLit, bossWon: run.bossWon, stampEarned },
    })
    .onConflictDoNothing({ target: [expeditionEvents.playSessionId, expeditionEvents.kind] })
    .returning({ id: expeditionEvents.id });

  if (inserted.length === 0) {
    const [previous] = await tx
      .select({ payload: expeditionEvents.payload, playerId: expeditionEvents.playerId })
      .from(expeditionEvents)
      .where(and(eq(expeditionEvents.playSessionId, run.playSessionId), eq(expeditionEvents.kind, EXPEDITION_RUN_EVENT)));
    if (!previous || previous.playerId !== run.playerId) throw new Error('expedition run conflict');
    return { stampEarned: previous.payload['stampEarned'] === true };
  }

  if (stampEarned) {
    await tx
      .insert(destinationStamps)
      .values({ playerId: run.playerId, destination: run.destination, count: 1, bestStreak: run.bestStreak })
      .onConflictDoUpdate({
        target: [destinationStamps.playerId, destinationStamps.destination],
        set: {
          count: sql`${destinationStamps.count} + 1`,
          bestStreak: sql`greatest(${destinationStamps.bestStreak}, excluded.best_streak)`,
          updatedAt: sql`now()`,
        },
      });
  }
  return { stampEarned };
}

/** The event kind written when a client says which destination an active session is playing. */
export const EXPEDITION_START_EVENT = 'start';

/** The destination recorded for a session by its 'start' event, or null when there is none. */
export async function getSessionDestination(executor: Executor, playSessionId: string): Promise<string | null> {
  const [row] = await executor
    .select({ payload: expeditionEvents.payload })
    .from(expeditionEvents)
    .where(and(eq(expeditionEvents.playSessionId, playSessionId), eq(expeditionEvents.kind, EXPEDITION_START_EVENT)));
  const destination = row?.payload['destination'];
  return typeof destination === 'string' ? destination : null;
}

/**
 * POST /api/v1/me/expedition/runs. Records which destination an active session plays.
 *
 * The session must belong to the caller and be active (404 for missing or someone else's, 409 when
 * not active). The destination must be known and unlocked for this player (403 otherwise). A repeat
 * with the same destination is idempotent (created: false); a different destination is a 409.
 */
export async function startExpeditionRun(
  db: Db,
  playerId: string,
  sessionId: string,
  destination: string,
): Promise<{ created: boolean }> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(playSessions)
      .where(and(eq(playSessions.id, sessionId), eq(playSessions.playerId, playerId)))
      .for('update');
    if (!session) throw errors.notFound();
    if (session.status !== 'active') throw errors.sessionNotActive();
    if (!isExpeditionDestination(destination)) throw errors.forbidden();
    const progress = await getExpeditionProgress(tx, playerId);
    if (!progress.unlocked.includes(destination)) throw errors.forbidden();

    const existing = await getSessionDestination(tx, sessionId);
    if (existing !== null) {
      if (existing !== destination) throw errors.idempotencyConflict();
      return { created: false };
    }
    await tx.insert(expeditionEvents).values({
      playSessionId: sessionId,
      playerId,
      kind: EXPEDITION_START_EVENT,
      payload: { destination },
    });
    return { created: true };
  });
}

/** What a completed expedition session shows in its results, read from its recorded run. */
export async function getExpeditionRunOutcome(
  executor: Executor,
  playSessionId: string,
): Promise<{ beaconsLit: number; stampEarned: boolean } | null> {
  const [row] = await executor
    .select({ payload: expeditionEvents.payload })
    .from(expeditionEvents)
    .where(and(eq(expeditionEvents.playSessionId, playSessionId), eq(expeditionEvents.kind, EXPEDITION_RUN_EVENT)));
  if (!row) return null;
  const beaconsLit = row.payload['beaconsLit'];
  return typeof beaconsLit === 'number'
    ? { beaconsLit, stampEarned: row.payload['stampEarned'] === true }
    : null;
}
