/**
 * @bidazoo/contracts
 *
 * The single home for the public API contract shared by the server and every client.
 * Each shape is a TypeBox schema: the SAME object validates requests, serializes responses
 * on the server, and (via `Static`) types the client. Do not re-declare these shapes in
 * apps or games.
 *
 * TRUST MODEL (see docs/SECURITY.md):
 *  - Everything that flows CLIENT -> SERVER is a *request for a domain action*, never a
 *    statement of state. There is intentionally no request field for xp, coins, inventory,
 *    mastery, entitlements, correctness, or timing. Request schemas forbid extra properties,
 *    so a body such as { "coins": 999999 } is rejected, not ignored.
 *  - Everything that flows SERVER -> CLIENT *before* an answer is graded is free of
 *    answer-key information (see PublicQuestionSchema). Response schemas list every field
 *    explicitly, and the server serializes through them, so a stray private field on a
 *    database row cannot reach the wire.
 */
import { Type, type Static } from 'typebox';

// Paths and constants live in ./paths so clients can import them without TypeBox.
export { API_PREFIX, ApiPaths, GAME_ID, MODE_MULTIPLICATION, SESSION_LENGTH } from './paths';
import { GAME_ID, MODE_MULTIPLICATION } from './paths';

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

const Uuid = Type.String({ format: 'uuid' });
const Timestamp = Type.String({ format: 'date-time' });
const strict = { additionalProperties: false } as const;

// ---------------------------------------------------------------------------
// Operational endpoints
// ---------------------------------------------------------------------------

export const HealthResponseSchema = Type.Object(
  { status: Type.Literal('ok'), service: Type.Literal('bidazoo-api') },
  strict,
);
export type HealthResponse = Static<typeof HealthResponseSchema>;

export const ReadyResponseSchema = Type.Object(
  {
    status: Type.Union([Type.Literal('ready'), Type.Literal('not_ready')]),
    checks: Type.Object(
      { database: Type.Union([Type.Literal('ok'), Type.Literal('unavailable')]) },
      strict,
    ),
  },
  strict,
);
export type ReadyResponse = Static<typeof ReadyResponseSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const ErrorCodeSchema = Type.Union([
  Type.Literal('invalid_request'),
  Type.Literal('unauthenticated'),
  Type.Literal('forbidden_origin'),
  Type.Literal('not_found'),
  Type.Literal('session_not_active'),
  Type.Literal('question_already_answered'),
  Type.Literal('idempotency_key_conflict'),
  Type.Literal('invalid_response'),
  // Checkpoint D: abuse protection. 429 = this caller is going too fast; 503 = the service-wide
  // new-guest circuit breaker is open. Both carry a Retry-After header.
  Type.Literal('rate_limited'),
  Type.Literal('service_busy'),
  Type.Literal('internal_error'),
]);
export type ErrorCode = Static<typeof ErrorCodeSchema>;

/** Every non-2xx API response. Messages are fixed text: they never echo request values. */
export const ErrorResponseSchema = Type.Object(
  {
    error: Type.Object({ code: ErrorCodeSchema, message: Type.String() }, strict),
  },
  strict,
);
export type ErrorResponse = Static<typeof ErrorResponseSchema>;

// ---------------------------------------------------------------------------
// Questions (answer security)
// ---------------------------------------------------------------------------

/**
 * The ONLY question shape a client may receive before answering.
 *
 * Invariant: no correct answer, no answer key, no grading data, no explanation that gives it
 * away. `choices` are the four options in the (server-shuffled) order to display. The server
 * keeps the key and grades responses itself.
 */
export const PublicQuestionSchema = Type.Object(
  {
    id: Uuid,
    sequence: Type.Integer({ minimum: 1, maximum: 100 }),
    prompt: Type.String(),
    type: Type.Literal('multipleChoice'),
    choices: Type.Array(Type.Integer({ minimum: 0, maximum: 100000 }), {
      minItems: 4,
      maxItems: 4,
    }),
  },
  strict,
);
export type PublicQuestion = Static<typeof PublicQuestionSchema>;

// ---------------------------------------------------------------------------
// Guest identity
// ---------------------------------------------------------------------------

export const TotalsSchema = Type.Object(
  {
    xp: Type.Integer({ minimum: 0 }),
    coins: Type.Integer({ minimum: 0 }),
  },
  strict,
);
export type Totals = Static<typeof TotalsSchema>;

export const GuestResponseSchema = Type.Object(
  {
    player: Type.Object({ id: Uuid, nickname: Type.String() }, strict),
    totals: TotalsSchema,
    /** The player's in-progress play session, if any, so a refresh can resume it. */
    activeSessionId: Type.Union([Uuid, Type.Null()]),
  },
  strict,
);
export type GuestResponse = Static<typeof GuestResponseSchema>;

// ---------------------------------------------------------------------------
// Play sessions
// ---------------------------------------------------------------------------

/** What a game asks the platform to start. The server decides everything else. */
export const StartPlaySessionRequestSchema = Type.Object(
  {
    gameId: Type.Literal(GAME_ID),
    mode: Type.Literal(MODE_MULTIPLICATION),
  },
  strict,
);
export type StartPlaySessionRequest = Static<typeof StartPlaySessionRequestSchema>;

export const SessionResultsSchema = Type.Object(
  {
    correct: Type.Integer({ minimum: 0 }),
    total: Type.Integer({ minimum: 1 }),
    fluent: Type.Integer({ minimum: 0 }),
    xpEarned: Type.Integer({ minimum: 0 }),
    coinsEarned: Type.Integer({ minimum: 0 }),
    bonus: TotalsSchema,
    /** Facts that became mastered during this session, as display text like "7 × 8". */
    newlyMastered: Type.Array(Type.String()),
    answers: Type.Array(
      Type.Object(
        {
          sequence: Type.Integer({ minimum: 1 }),
          prompt: Type.String(),
          correct: Type.Boolean(),
          fluent: Type.Boolean(),
        },
        strict,
      ),
    ),
  },
  strict,
);
export type SessionResults = Static<typeof SessionResultsSchema>;

export const PlaySessionSchema = Type.Object(
  {
    id: Uuid,
    gameId: Type.String(),
    mode: Type.String(),
    status: Type.Union([
      Type.Literal('active'),
      Type.Literal('completed'),
      Type.Literal('expired'),
    ]),
    total: Type.Integer({ minimum: 1 }),
    answered: Type.Integer({ minimum: 0 }),
    correct: Type.Integer({ minimum: 0 }),
    startedAt: Timestamp,
    expiresAt: Timestamp,
    completedAt: Type.Union([Timestamp, Type.Null()]),
    /** The issued, still-unanswered question. Null between an answer and the next request. */
    currentQuestion: Type.Union([PublicQuestionSchema, Type.Null()]),
    /** Present only once the session is completed. */
    results: Type.Union([SessionResultsSchema, Type.Null()]),
  },
  strict,
);
export type PlaySession = Static<typeof PlaySessionSchema>;

export const StartPlaySessionResponseSchema = Type.Object(
  {
    session: PlaySessionSchema,
    /** True when an existing active session was returned instead of creating a new one. */
    resumed: Type.Boolean(),
  },
  strict,
);
export type StartPlaySessionResponse = Static<typeof StartPlaySessionResponseSchema>;

export const GetPlaySessionResponseSchema = Type.Object({ session: PlaySessionSchema }, strict);
export type GetPlaySessionResponse = Static<typeof GetPlaySessionResponseSchema>;

/** Issues the next question (or restores the outstanding one). Takes no body. */
export const QuestionResponseSchema = Type.Object(
  {
    question: PublicQuestionSchema,
    session: PlaySessionSchema,
  },
  strict,
);
export type QuestionResponse = Static<typeof QuestionResponseSchema>;

// ---------------------------------------------------------------------------
// Answering (client -> server request, server -> client result)
// ---------------------------------------------------------------------------

export const SessionParamsSchema = Type.Object({ sessionId: Uuid }, strict);
export type SessionParams = Static<typeof SessionParamsSchema>;

/**
 * A player's answer to a question the server issued.
 *
 * `attemptId` is the client-generated idempotency key: retrying the same attempt can never
 * award twice. There is no field for correctness, response time, xp, coins, or mastery.
 */
export const SubmitAnswerRequestSchema = Type.Object(
  {
    attemptId: Type.String({ minLength: 8, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' }),
    questionId: Uuid,
    response: Type.Integer({ minimum: 0, maximum: 100000 }),
  },
  strict,
);
export type SubmitAnswerRequest = Static<typeof SubmitAnswerRequestSchema>;

/** A reward the SERVER already committed. The client only displays it. */
export const RewardGrantSchema = Type.Object(
  {
    kind: Type.Union([Type.Literal('xp'), Type.Literal('coins')]),
    amount: Type.Integer({ minimum: 1 }),
    reason: Type.String(),
  },
  strict,
);
export type RewardGrant = Static<typeof RewardGrantSchema>;

export const MasterySummarySchema = Type.Object(
  {
    label: Type.String(),
    /** Leitner box, 0 (new or just missed) to 5 (longest review interval). */
    box: Type.Integer({ minimum: 0, maximum: 5 }),
    streak: Type.Integer({ minimum: 0 }),
    fluentDays: Type.Integer({ minimum: 0 }),
    mastered: Type.Boolean(),
    nextReviewAt: Timestamp,
  },
  strict,
);
export type MasterySummary = Static<typeof MasterySummarySchema>;

export const AnswerResultSchema = Type.Object(
  {
    questionId: Uuid,
    correct: Type.Boolean(),
    /** Correct AND answered within the fluency window, as timed by the server. */
    fluent: Type.Boolean(),
    /** Server-measured: answered_at minus served_at. */
    responseMs: Type.Integer({ minimum: 0 }),
    /** Revealed only AFTER grading. */
    correctAnswer: Type.Integer({ minimum: 0 }),
    rewards: Type.Array(RewardGrantSchema),
    mastery: MasterySummarySchema,
    totals: TotalsSchema,
    session: PlaySessionSchema,
    /** True when this response replays an earlier committed attempt (a retry or double tap). */
    replayed: Type.Boolean(),
  },
  strict,
);
export type AnswerResult = Static<typeof AnswerResultSchema>;
