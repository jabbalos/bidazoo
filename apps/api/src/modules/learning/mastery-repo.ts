import { and, eq, gte } from 'drizzle-orm';
import { skillMastery } from '@bidazoo/database/schema';
import type { MasteryState } from '@bidazoo/learning-core';
import type { Executor } from '../../context';

type Row = typeof skillMastery.$inferSelect;

function toState(row: Row): MasteryState {
  return {
    box: row.box,
    streak: row.streak,
    attempts: row.attempts,
    correctCount: row.correctCount,
    fluentDays: row.fluentDays,
    lastFluentDay: row.lastFluentDay,
    lastAttemptAt: row.lastAttemptAt,
    nextReviewAt: row.nextReviewAt,
    masteredAt: row.masteredAt,
  };
}

/** All of a player's mastery rows (at most one per fact), for next-question selection. */
export async function loadMasteryMap(
  executor: Executor,
  playerId: string,
): Promise<Map<string, MasteryState>> {
  const rows = await executor.select().from(skillMastery).where(eq(skillMastery.playerId, playerId));
  return new Map(rows.map((row) => [row.skillKey, toState(row)]));
}

/** Reads one row and locks it for the rest of the transaction. */
export async function loadMasteryForUpdate(
  tx: Executor,
  playerId: string,
  skillKey: string,
): Promise<MasteryState | null> {
  const [row] = await tx
    .select()
    .from(skillMastery)
    .where(and(eq(skillMastery.playerId, playerId), eq(skillMastery.skillKey, skillKey)))
    .for('update');
  return row ? toState(row) : null;
}

export async function saveMastery(
  tx: Executor,
  playerId: string,
  skillKey: string,
  state: MasteryState,
  now: Date,
): Promise<void> {
  const values = {
    box: state.box,
    streak: state.streak,
    attempts: state.attempts,
    correctCount: state.correctCount,
    fluentDays: state.fluentDays,
    lastFluentDay: state.lastFluentDay,
    lastAttemptAt: state.lastAttemptAt,
    nextReviewAt: state.nextReviewAt,
    masteredAt: state.masteredAt,
    updatedAt: now,
  };
  await tx
    .insert(skillMastery)
    .values({ playerId, skillKey, ...values })
    .onConflictDoUpdate({ target: [skillMastery.playerId, skillMastery.skillKey], set: values });
}

/** Skill keys this player mastered at or after `since`. */
export async function skillsMasteredSince(
  executor: Executor,
  playerId: string,
  since: Date,
): Promise<string[]> {
  const rows = await executor
    .select({ skillKey: skillMastery.skillKey, masteredAt: skillMastery.masteredAt })
    .from(skillMastery)
    .where(and(eq(skillMastery.playerId, playerId), gte(skillMastery.masteredAt, since)));
  return rows.map((row) => row.skillKey).sort();
}
