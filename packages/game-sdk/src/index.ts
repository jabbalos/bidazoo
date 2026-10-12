/**
 * @bidazoo/game-sdk
 *
 * The boundary between a game and the platform. A game talks ONLY in terms of these domain
 * actions and the shared contracts. It must not know about:
 *   - database structure
 *   - login internals (it never sees a token; the browser keeps an HttpOnly cookie)
 *   - how currency or XP are stored
 *   - how mastery is persisted
 *   - subscription logic
 *   - entitlement internals
 *
 * Every platform method is a request for a domain action; every result is a fact the server
 * already decided. The game's job is to present them. See docs/GAME-SDK.md.
 */
import type {
  AnswerResult,
  GuestResponse,
  PlaySession,
  QuestionResponse,
  StartPlaySessionRequest,
  StartPlaySessionResponse,
  SubmitAnswerRequest,
} from '@bidazoo/contracts';

export type {
  AnswerResult,
  GuestResponse,
  MasterySummary,
  PlaySession,
  PublicQuestion,
  QuestionResponse,
  RewardGrant,
  SessionResults,
  StartPlaySessionRequest,
  StartPlaySessionResponse,
  SubmitAnswerRequest,
  Totals,
} from '@bidazoo/contracts';

/** What the platform offers a game. The shell supplies an implementation (HTTP, or a fake in tests). */
export interface BidaZooPlatform {
  /** Make sure this browser has a guest identity; returns who it is and the saved totals. */
  ensureGuest(): Promise<GuestResponse>;
  /** Start a run, or resume the one already in progress. */
  startSession(request: StartPlaySessionRequest): Promise<StartPlaySessionResponse>;
  getSession(sessionId: string): Promise<PlaySession>;
  /** Ask for the next question (or the outstanding one, after a refresh). */
  nextQuestion(sessionId: string): Promise<QuestionResponse>;
  /**
   * Submit an answer. `attemptId` is the idempotency key: retrying with the same id can never
   * award twice, so implementations may retry network failures safely.
   */
  submitAnswer(sessionId: string, request: SubmitAnswerRequest): Promise<AnswerResult>;
}

export interface MountOptions {
  /** The element the game draws into. */
  parent: HTMLElement;
  platform: BidaZooPlatform;
}

export interface MountedGame {
  destroy(): void;
}

/** What a game package exports. */
export interface BidaZooGame {
  mount(options: MountOptions): MountedGame;
}

/** A failed platform call. `status` is 0 for a network failure. */
export class PlatformError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PlatformError';
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}
