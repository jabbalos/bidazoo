import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, eq, lte } from 'drizzle-orm';
import {
  SESSION_LENGTH,
  type AnswerResult,
  type MasterySummary,
  type PlaySession,
  type PublicQuestion,
  type StartPlaySessionRequest,
  type SubmitAnswerRequest,
} from '@bidazoo/contracts';
import { attempts, playSessions, servedQuestions } from '@bidazoo/database/schema';
import {
  applyAttempt,
  generateQuestion,
  gradeAnswer,
  labelForSkillKey,
  selectNextSkill,
  type MasteryState,
  type SelectionReason,
  type SessionHistoryItem,
} from '@bidazoo/learning-core';
import type { AppContext, Executor, Tx } from '../../context';
import { ApiError, errors, isUniqueViolation } from '../../http/errors';
import { loadMasteryForUpdate, loadMasteryMap, saveMastery } from '../learning';
import {
  appendGrants,
  getTotals,
  grantsForAttempt,
  grantsForCompletion,
  grantsForSource,
  type Grant,
} from '../rewards';
import {
  buildSessionView,
  publicQuestionOf,
  readPrivateGrading,
  type SessionRow,
} from './views';

export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Loads a session ONLY if it belongs to the player, and locks it for this transaction. */
async function lockOwnedSession(tx: Tx, playerId: string, sessionId: string): Promise<SessionRow> {
  const [row] = await tx
    .select()
    .from(playSessions)
    .where(and(eq(playSessions.id, sessionId), eq(playSessions.playerId, playerId)))
    .for('update');
  if (!row) throw errors.notFound(); // same answer for "missing" and "someone else's"
  return row;
}

/** Marks an active session whose time has run out as expired. Returns the fresh row. */
async function expireIfStale(tx: Executor, session: SessionRow, now: Date): Promise<SessionRow> {
  if (session.status === 'active' && session.expiresAt.getTime() <= now.getTime()) {
    const [updated] = await tx
      .update(playSessions)
      .set({ status: 'expired' })
      .where(eq(playSessions.id, session.id))
      .returning();
    return updated ?? { ...session, status: 'expired' };
  }
  return session;
}

function toMasterySummary(skillKey: string, state: MasteryState): MasterySummary {
  return {
    label: labelForSkillKey(skillKey),
    box: state.box,
    streak: state.streak,
    fluentDays: state.fluentDays,
    mastered: state.masteredAt !== null,
    nextReviewAt: state.nextReviewAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Start / resume
// ---------------------------------------------------------------------------

export async function startOrResumeSession(
  ctx: AppContext,
  playerId: string,
  request: StartPlaySessionRequest,
): Promise<{ session: PlaySession; resumed: boolean }> {
  return ctx.db.transaction(async (tx) => {
    const now = ctx.clock.now();
    const sameGame = and(eq(playSessions.playerId, playerId), eq(playSessions.gameId, request.gameId));

    await tx
      .update(playSessions)
      .set({ status: 'expired' })
      .where(and(sameGame, eq(playSessions.status, 'active'), lte(playSessions.expiresAt, now)));

    const findActive = () =>
      tx
        .select()
        .from(playSessions)
        .where(and(sameGame, eq(playSessions.status, 'active')));

    const [existing] = await findActive();
    if (existing) return { session: await buildSessionView(tx, existing), resumed: true };

    // The partial unique index allows one active session per player and game. If two requests
    // race, the loser inserts nothing and falls through to resume the winner's session.
    const [created] = await tx
      .insert(playSessions)
      .values({
        playerId,
        gameId: request.gameId,
        mode: request.mode,
        seed: randomBytes(16).toString('hex'),
        totalQuestions: SESSION_LENGTH,
        startedAt: now,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      })
      .onConflictDoNothing()
      .returning();
    if (created) return { session: await buildSessionView(tx, created), resumed: false };

    const [winner] = await findActive();
    if (!winner) throw new Error('session insert conflicted but no active session was found');
    return { session: await buildSessionView(tx, winner), resumed: true };
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getSession(
  ctx: AppContext,
  playerId: string,
  sessionId: string,
): Promise<PlaySession> {
  return ctx.db.transaction(async (tx) => {
    const session = await lockOwnedSession(tx, playerId, sessionId);
    const fresh = await expireIfStale(tx, session, ctx.clock.now());
    return buildSessionView(tx, fresh);
  });
}

// ---------------------------------------------------------------------------
// Issue (or restore) the current question
// ---------------------------------------------------------------------------

type IssueOutcome =
  | { kind: 'ok'; question: PublicQuestion; session: PlaySession }
  | { kind: 'error'; error: ApiError };

export async function issueQuestion(
  ctx: AppContext,
  playerId: string,
  sessionId: string,
): Promise<{ question: PublicQuestion; session: PlaySession }> {
  const outcome = await ctx.db.transaction(async (tx): Promise<IssueOutcome> => {
    const now = ctx.clock.now();
    const locked = await lockOwnedSession(tx, playerId, sessionId);
    const session = await expireIfStale(tx, locked, now);
    // Returning (not throwing) lets the expiry update above commit.
    if (session.status !== 'active') return { kind: 'error', error: errors.sessionNotActive() };

    // Restore: an outstanding question is returned unchanged. served_at is NOT reset, so
    // refreshing the page can never give a child extra time or a fresh timer.
    const rows = await tx
      .select()
      .from(servedQuestions)
      .where(eq(servedQuestions.playSessionId, session.id))
      .orderBy(asc(servedQuestions.sequence));
    const open = rows.find((row) => row.answeredAt === null);
    if (open) {
      return { kind: 'ok', question: publicQuestionOf(open), session: await buildSessionView(tx, session) };
    }
    if (session.answeredCount >= session.totalQuestions) {
      return { kind: 'error', error: errors.sessionNotActive() };
    }

    const sequence = session.answeredCount + 1;
    const answeredRows = await tx
      .select({ skillKey: servedQuestions.skillKey, reason: servedQuestions.selectionReason, correct: attempts.correct })
      .from(servedQuestions)
      .innerJoin(attempts, eq(attempts.servedQuestionId, servedQuestions.id))
      .where(eq(servedQuestions.playSessionId, session.id))
      .orderBy(asc(servedQuestions.sequence));
    const history: SessionHistoryItem[] = answeredRows.map((row) => ({
      skillKey: row.skillKey,
      reason: row.reason as SelectionReason,
      correct: row.correct,
    }));

    const mastery = await loadMasteryMap(tx, playerId);
    const questionSeed = `${session.seed}:${sequence}`;
    const selection = selectNextSkill({ seed: questionSeed, now, mastery, history });

    const previous = rows[rows.length - 1];
    let avoidAnswerIndex: number | undefined;
    if (previous) {
      const previousChoices = publicQuestionOf(previous).choices;
      avoidAnswerIndex = previousChoices.indexOf(readPrivateGrading(previous).correctAnswer);
    }
    const generated = generateQuestion(selection.skillKey, questionSeed, { avoidAnswerIndex });

    const id = randomUUID();
    const publicPayload = {
      id,
      sequence,
      prompt: generated.prompt,
      type: 'multipleChoice',
      choices: generated.choices,
    };
    await tx.insert(servedQuestions).values({
      id,
      playSessionId: session.id,
      sequence,
      skillKey: generated.skillKey,
      selectionReason: selection.reason,
      publicPayload,
      privateGradingData: { skillKey: generated.skillKey, correctAnswer: generated.correctAnswer },
      servedAt: now,
    });

    const [fresh] = await tx.select().from(servedQuestions).where(eq(servedQuestions.id, id));
    if (!fresh) throw new Error('served question vanished after insert');
    return { kind: 'ok', question: publicQuestionOf(fresh), session: await buildSessionView(tx, session) };
  });
  if (outcome.kind === 'error') throw outcome.error;
  return { question: outcome.question, session: outcome.session };
}

// ---------------------------------------------------------------------------
// Answer
// ---------------------------------------------------------------------------

type AnswerOutcome = { kind: 'ok'; result: AnswerResult } | { kind: 'error'; error: ApiError };

/**
 * Grades an answer and commits everything that follows from it in ONE transaction:
 * attempt, mastery, reward ledger, question marked answered, session advanced or completed.
 *
 * Exactly-once is layered:
 *  1. The play_sessions row is locked first, so answers for a session run one at a time.
 *  2. A repeat of the same attempt id returns the stored result (replayed: true).
 *  3. A served question that already has a grade is refused (409), whatever the attempt id.
 *  4. The database enforces the same rules with unique constraints, as a backstop.
 */
export async function submitAnswer(
  ctx: AppContext,
  playerId: string,
  sessionId: string,
  body: SubmitAnswerRequest,
): Promise<AnswerResult> {
  let outcome: AnswerOutcome;
  try {
    outcome = await ctx.db.transaction((tx) => answerInTransaction(ctx, tx, playerId, sessionId, body));
  } catch (err) {
    // Backstop: only reachable if a unique constraint fires despite the checks above.
    if (isUniqueViolation(err)) throw errors.alreadyAnswered();
    throw err;
  }
  if (outcome.kind === 'error') throw outcome.error;
  return outcome.result;
}

async function answerInTransaction(
  ctx: AppContext,
  tx: Tx,
  playerId: string,
  sessionId: string,
  body: SubmitAnswerRequest,
): Promise<AnswerOutcome> {
  const now = ctx.clock.now();
  const locked = await lockOwnedSession(tx, playerId, sessionId);

  // --- Idempotent replay ---------------------------------------------------
  const [sameKey] = await tx
    .select()
    .from(attempts)
    .where(and(eq(attempts.playerId, playerId), eq(attempts.idempotencyKey, body.attemptId)));
  if (sameKey) {
    if (
      sameKey.playSessionId !== sessionId ||
      sameKey.servedQuestionId !== body.questionId ||
      sameKey.submittedResponse !== body.response
    ) {
      return { kind: 'error', error: errors.idempotencyConflict() };
    }
    return { kind: 'ok', result: await replayResult(tx, locked, sameKey) };
  }

  // --- Preconditions ---------------------------------------------------------
  const session = await expireIfStale(tx, locked, now);
  if (session.status !== 'active') return { kind: 'error', error: errors.sessionNotActive() };

  // The question must belong to THIS session (which belongs to this player).
  const [question] = await tx
    .select()
    .from(servedQuestions)
    .where(and(eq(servedQuestions.id, body.questionId), eq(servedQuestions.playSessionId, session.id)));
  if (!question) return { kind: 'error', error: errors.notFound() };
  if (question.answeredAt !== null) return { kind: 'error', error: errors.alreadyAnswered() };

  // --- Grade (server-side, from the stored key) ------------------------------
  const publicQuestion = publicQuestionOf(question);
  const grading = readPrivateGrading(question);
  const graded = gradeAnswer(publicQuestion.choices, grading.correctAnswer, body.response);
  if (graded.kind === 'invalid') return { kind: 'error', error: errors.invalidResponse() };

  // Server-measured time: both ends are server timestamps. Nothing from the client is used.
  const responseMs = Math.max(0, now.getTime() - question.servedAt.getTime());

  // --- Mastery (learning-core decides; this module only persists) ------------
  const previous = await loadMasteryForUpdate(tx, playerId, grading.skillKey);
  const update = applyAttempt(previous, { correct: graded.correct, responseMs, now });

  // --- Commit: attempt, mastery, ledger, question, session --------------------
  const [attempt] = await tx
    .insert(attempts)
    .values({
      servedQuestionId: question.id,
      playSessionId: session.id,
      playerId,
      idempotencyKey: body.attemptId,
      submittedResponse: body.response,
      correct: graded.correct,
      fluent: update.fluent,
      responseMs,
      createdAt: now,
    })
    .returning();
  if (!attempt) throw new Error('attempt insert returned no row');

  await saveMastery(tx, playerId, grading.skillKey, update.state, now);

  const rewards: Grant[] = await appendGrants(
    tx,
    { playerId, playSessionId: session.id, sourceType: 'attempt', sourceId: attempt.id },
    grantsForAttempt({ correct: graded.correct }),
  );

  await tx.update(servedQuestions).set({ answeredAt: now }).where(eq(servedQuestions.id, question.id));

  const answeredCount = session.answeredCount + 1;
  const correctCount = session.correctCount + (graded.correct ? 1 : 0);
  const completes = answeredCount >= session.totalQuestions;
  const [advanced] = await tx
    .update(playSessions)
    .set(
      completes
        ? { answeredCount, correctCount, status: 'completed', completedAt: now }
        : { answeredCount, correctCount },
    )
    .where(eq(playSessions.id, session.id))
    .returning();
  if (!advanced) throw new Error('session update returned no row');

  if (completes) {
    rewards.push(
      ...(await appendGrants(
        tx,
        { playerId, playSessionId: session.id, sourceType: 'play_session', sourceId: session.id },
        grantsForCompletion(),
      )),
    );
  }

  return {
    kind: 'ok',
    result: {
      questionId: question.id,
      correct: graded.correct,
      fluent: update.fluent,
      responseMs,
      correctAnswer: grading.correctAnswer,
      rewards,
      mastery: toMasterySummary(grading.skillKey, update.state),
      totals: await getTotals(tx, playerId),
      session: await buildSessionView(tx, advanced),
      replayed: false,
    },
  };
}

/** Rebuilds the response for an attempt that was already committed. Awards nothing. */
async function replayResult(
  tx: Tx,
  session: SessionRow,
  attempt: typeof attempts.$inferSelect,
): Promise<AnswerResult> {
  const [question] = await tx.select().from(servedQuestions).where(eq(servedQuestions.id, attempt.servedQuestionId));
  if (!question) throw new Error('attempt references a missing question');
  const grading = readPrivateGrading(question);

  const rewards = await grantsForSource(tx, 'attempt', attempt.id);
  const finishedSession = session.status === 'completed' && question.sequence === session.totalQuestions;
  if (finishedSession) rewards.push(...(await grantsForSource(tx, 'play_session', session.id)));

  const mastery =
    (await loadMasteryForUpdate(tx, session.playerId, grading.skillKey)) ??
    (() => {
      throw new Error('attempt exists without mastery row');
    })();

  return {
    questionId: question.id,
    correct: attempt.correct,
    fluent: attempt.fluent,
    responseMs: attempt.responseMs,
    correctAnswer: grading.correctAnswer,
    rewards,
    mastery: toMasterySummary(grading.skillKey, mastery),
    totals: await getTotals(tx, session.playerId),
    session: await buildSessionView(tx, session),
    replayed: true,
  };
}

