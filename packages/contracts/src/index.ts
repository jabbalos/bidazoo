/**
 * @bidazoo/contracts
 *
 * The single home for types shared between the API and game clients.
 * Do not re-declare these shapes in apps or games.
 *
 * TRUST MODEL (see docs/SECURITY.md):
 *  - Everything here that flows CLIENT -> SERVER is a *request for a domain action*,
 *    never a statement of state. There is intentionally no request type that carries
 *    xp, coins, inventory, mastery, or entitlements.
 *  - Everything that flows SERVER -> CLIENT *before* an answer is graded must be
 *    free of answer-key information (see PublicQuestion).
 */

// ---------------------------------------------------------------------------
// Operational endpoints
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: 'ok';
  service: 'bidazoo-api';
}

export interface ReadyResponse {
  status: 'ready' | 'not_ready';
  checks: {
    database: 'ok' | 'unavailable';
  };
}

// ---------------------------------------------------------------------------
// Questions (answer security)
// ---------------------------------------------------------------------------

/** Opaque identifiers. Brand-free for now; the server issues and validates all of them. */
export type SessionId = string;
export type QuestionId = string;
export type ChoiceId = string;

export interface PublicChoice {
  id: ChoiceId;
  /** Display text only. Carries no hint about correctness. */
  label: string;
}

/**
 * The ONLY question shape a client may receive before answering.
 *
 * Invariant: contains no correct-answer information (no `answer`, `correct`,
 * `correctChoiceId`, explanation that gives it away, or ordering that encodes it).
 * The server keeps the full question (including the key) and grades responses itself.
 */
export interface PublicQuestion {
  questionId: QuestionId;
  skillId: string;
  prompt: string;
  choices: PublicChoice[];
}

// ---------------------------------------------------------------------------
// Domain actions (client -> server)
// ---------------------------------------------------------------------------

/** What a game asks the platform to start. The server decides everything else. */
export interface GameConfig {
  gameId: string;
}

/** A player's answer to a PublicQuestion. Nothing else is accepted from the client. */
export interface PlayerResponse {
  questionId: QuestionId;
  choiceId: ChoiceId;
}

/**
 * Envelope for submitting an answer. `idempotencyKey` lets the server
 * apply reward-changing effects at most once per answer, even on retries.
 */
export interface SubmitAnswerRequest {
  sessionId: SessionId;
  idempotencyKey: string;
  response: PlayerResponse;
}

// ---------------------------------------------------------------------------
// Results (server -> client). Read-only facts for the client to animate.
// ---------------------------------------------------------------------------

export interface GameSession {
  sessionId: SessionId;
  question: PublicQuestion;
}

/** A reward the SERVER already committed. The client only displays it. */
export interface RewardGrant {
  kind: 'xp' | 'coins';
  amount: number;
}

export interface AnswerResult {
  questionId: QuestionId;
  correct: boolean;
  /** Revealed only AFTER grading. */
  correctChoiceId: ChoiceId;
  rewards: RewardGrant[];
  /** Next question, or null when the session has no more questions. */
  nextQuestion: PublicQuestion | null;
}

export interface SessionResult {
  sessionId: SessionId;
  questionsAnswered: number;
  questionsCorrect: number;
  rewards: RewardGrant[];
}
