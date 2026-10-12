import { and, asc, eq, isNull } from 'drizzle-orm';
import type { PlaySession, PublicQuestion, SessionResults } from '@bidazoo/contracts';
import { attempts, playSessions, servedQuestions } from '@bidazoo/database/schema';
import { labelForSkillKey } from '@bidazoo/learning-core';
import type { Executor } from '../../context';
import { getSessionTotals } from '../rewards';
import { skillsMasteredSince } from '../learning';

export type SessionRow = typeof playSessions.$inferSelect;
export type QuestionRow = typeof servedQuestions.$inferSelect;

/** The server-only answer key stored with each served question. */
export interface PrivateGrading {
  skillKey: string;
  correctAnswer: number;
}

export function readPrivateGrading(row: QuestionRow): PrivateGrading {
  const data = row.privateGradingData as Partial<PrivateGrading> | null;
  if (!data || typeof data.skillKey !== 'string' || !Number.isInteger(data.correctAnswer)) {
    throw new Error('served question has malformed grading data');
  }
  return { skillKey: data.skillKey, correctAnswer: data.correctAnswer as number };
}

/**
 * Rebuilds the public question from an ALLOWLIST of fields. Even if something sensitive were
 * ever stored in the payload column by mistake, it would not be forwarded from here.
 */
export function publicQuestionOf(row: QuestionRow): PublicQuestion {
  const payload = row.publicPayload as { prompt?: unknown; choices?: unknown };
  return {
    id: row.id,
    sequence: row.sequence,
    prompt: String(payload.prompt),
    type: 'multipleChoice',
    choices: (payload.choices as number[]).slice(),
  };
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
