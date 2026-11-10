import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { PlaySession, PublicQuestion, SessionResults } from '@bidazoo/contracts';
import { attempts, playSessions, servedQuestions, xpEvents } from '@bidazoo/database/schema';
import { labelForSkillKey } from '@bidazoo/learning-core';
import type { Executor } from '../../context';
import { getSessionTotals } from '../rewards';
import { skillsMasteredSince } from '../learning';
import { levelForXp, levelUpBetween } from '../progress/level';
import { getExpeditionRunOutcome } from '../progress/service';

export type SessionRow = typeof playSessions.$inferSelect;
export type QuestionRow = typeof servedQuestions.$inferSelect;

/** The server-only answer key stored with each served question. */
export interface PrivateGrading {
  skillKey: string;
  /** A number for a number question, a non-empty string for a text question. */
  correctAnswer: number | string;
}

export function readPrivateGrading(row: QuestionRow): PrivateGrading {
  const data = row.privateGradingData as Partial<PrivateGrading> | null;
  const answer = data?.correctAnswer;
  const wellFormed = Number.isInteger(answer) || (typeof answer === 'string' && answer.length > 0);
  if (!data || typeof data.skillKey !== 'string' || !wellFormed) {
    throw new Error('served question has malformed grading data');
  }
  return { skillKey: data.skillKey, correctAnswer: answer as number | string };
}

/**
 * Rebuilds the public question from an ALLOWLIST of fields. Even if something sensitive were
 * ever stored in the payload column by mistake, it would not be forwarded from here.
 */
export function publicQuestionOf(row: QuestionRow): PublicQuestion {
  const payload = row.publicPayload as { prompt?: unknown; choices?: unknown; kind?: unknown };
  // Choices are numbers (number questions) or strings (text questions); anything else is dropped.
  const choices = (payload.choices as unknown[]).filter(
    (choice): choice is number | string => typeof choice === 'number' || typeof choice === 'string',
  );
  // `kind` is forwarded only when the stored payload carries it (number questions stay as before).
  const kind = payload.kind === 'number' || payload.kind === 'text' ? payload.kind : undefined;
  return {
    id: row.id,
    sequence: row.sequence,
    prompt: String(payload.prompt),
    type: 'multipleChoice',
    ...(kind === undefined ? {} : { kind }),
    choices,
  } as PublicQuestion;
}

/**
 * The player's total XP as of the end of this session: every XP event written at or before this
 * session's last one. Later sessions write later events (the database stamps them at commit time),
 * so they never change an older session's level, and a re-read result shows the same level-up.
 */
async function xpAtEndOfSession(executor: Executor, session: SessionRow): Promise<number> {
  const [row] = await executor
    .select({ total: sql<string>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .where(
      and(
        eq(xpEvents.playerId, session.playerId),
        sql`${xpEvents.createdAt} <= (select max(e.created_at) from xp_events e where e.play_session_id = ${session.id})`,
      ),
    );
  return Number(row?.total ?? 0);
}

async function buildResults(executor: Executor, session: SessionRow): Promise<SessionResults> {
  const rows = await executor
    .select({
      sequence: servedQuestions.sequence,
      payload: servedQuestions.publicPayload,
      correct: attempts.correct,
      fluent: attempts.fluent,
    })
    .from(attempts)
    .innerJoin(servedQuestions, eq(attempts.servedQuestionId, servedQuestions.id))
    .where(eq(attempts.playSessionId, session.id))
    .orderBy(asc(servedQuestions.sequence));
  const earned = await getSessionTotals(executor, session.id);
  const bonus = await getSessionTotals(executor, session.id, 'session_completion');
  const mastered = await skillsMasteredSince(executor, session.playerId, session.startedAt);
  const xpAfter = await xpAtEndOfSession(executor, session);
  const xpBefore = Math.max(0, xpAfter - earned.xp);
  // Present only for a session with a recorded expedition run (see recordExpeditionRun).
  const expedition = await getExpeditionRunOutcome(executor, session.id);
  return {
    correct: session.correctCount,
    total: session.totalQuestions,
    fluent: rows.filter((row) => row.fluent).length,
    xpEarned: earned.xp,
    coinsEarned: earned.coins,
    bonus,
    newlyMastered: mastered.map(labelForSkillKey),
    answers: rows.map((row) => ({
      sequence: row.sequence,
      prompt: String((row.payload as { prompt?: unknown }).prompt),
      correct: row.correct,
      fluent: row.fluent,
    })),
    ...(expedition === null ? {} : { beaconsLit: expedition.beaconsLit, stampEarned: expedition.stampEarned }),
    level: levelForXp(xpAfter),
    levelUp: levelUpBetween(xpBefore, xpAfter),
  };
}

/** The wire view of a session, including its outstanding question and (once done) results. */
export async function buildSessionView(executor: Executor, session: SessionRow): Promise<PlaySession> {
  const [open] = await executor
    .select()
    .from(servedQuestions)
    .where(and(eq(servedQuestions.playSessionId, session.id), isNull(servedQuestions.answeredAt)));
  return {
    id: session.id,
    gameId: session.gameId,
    mode: session.mode,
    status: session.status as PlaySession['status'],
    total: session.totalQuestions,
    answered: session.answeredCount,
    correct: session.correctCount,
    startedAt: session.startedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    completedAt: session.completedAt ? session.completedAt.toISOString() : null,
    currentQuestion: open && session.status === 'active' ? publicQuestionOf(open) : null,
    results: session.status === 'completed' ? await buildResults(executor, session) : null,
  };
}
