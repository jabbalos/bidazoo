import type {
  AnswerResult,
  BidaZooPlatform,
  PlaySession,
  PublicQuestion,
  SessionResults,
  StartPlaySessionRequest,
} from '@bidazoo/game-sdk';
import { makeAttemptId } from './ui';

/** A destination folder id under assets/world-expedition/destinations/ (proposal 2.2). */
export type DestinationId = string;

/**
 * One play session (proposal 2.6 item 2; Lane A). Shared by RunScene, the encounter overlay and the
 * summit. Every result is a fact the server decided.
 */
export interface SessionClient {
  /** Start a run, or resume the one in progress. */
  startSession(req: StartPlaySessionRequest & { destination?: DestinationId }): Promise<PlaySession>;
  /** The outstanding question, or the next one. */
  nextQuestion(): Promise<PublicQuestion>;
  /** Answers the outstanding question with the chosen value (a number, or a string for text questions). */
  submitAnswer(choice: number | string): Promise<AnswerResult>;
  /** The session's results once it is completed; null before that. */
  results(): Promise<SessionResults | null>;
}

/**
 * The one implementation of {@link SessionClient}: the platform calls RunScene used to make itself
 * (start or resume, fetch the question, submit with an idempotency key, read the results), plus the
 * session it last heard from the server.
 *
 * Additions beyond the 2.6 interface (Lane A's side, not part of the contract): `session`, the last
 * session the server returned, and `refresh()`, which re-reads it from the server (the resync after
 * an answer crossed with another tab or a retry).
 */
export class PlaySessionClient implements SessionClient {
  private current: PlaySession | null = null;
  private question: PublicQuestion | null = null;
  private chosenDestination: DestinationId | null = null;
  /** One idempotency key per question, so a retry (or double tap) is the same attempt. */
  private readonly attemptIds = new Map<string, string>();

  constructor(private readonly platform: BidaZooPlatform) {}

  /** The last session the server returned; null before `startSession`. */
  get session(): PlaySession | null {
    return this.current;
  }

  /** The destination passed to `startSession`. Client-side only: the server request has no such field. */
  get destination(): DestinationId | null {
    return this.chosenDestination;
  }

  async startSession(req: StartPlaySessionRequest & { destination?: DestinationId }): Promise<PlaySession> {
    // The server's request schema forbids extra properties, so only the server's fields are sent.
    const { destination, ...request } = req;
    const started = await this.platform.startSession({ gameId: request.gameId, mode: request.mode });
    this.chosenDestination = destination ?? null;
    this.adopt(started.session);
    // An expedition tells the server its destination, so the server can stamp it at completion from its own
    // replay of the answers. The server checks ownership and the unlock; a refusal surfaces as an error.
    if (destination && request.mode === 'expedition' && this.platform.startExpeditionRun) {
      await this.platform.startExpeditionRun({ sessionId: started.session.id, destination });
    }
    return started.session;
  }

  async nextQuestion(): Promise<PublicQuestion> {
    const session = this.requireSession();
    if (session.status !== 'active') throw new Error(`The session is ${session.status}; there is no next question.`);
    if (this.question) return this.question;
    const next = await this.platform.nextQuestion(session.id);
    this.adopt(next.session);
    this.question = next.question;
    return next.question;
  }

  async submitAnswer(choice: number | string): Promise<AnswerResult> {
    const session = this.requireSession();
    const question = this.question;
    if (!question) throw new Error('There is no outstanding question to answer; call nextQuestion() first.');
    let attemptId = this.attemptIds.get(question.id);
    if (!attemptId) {
      attemptId = makeAttemptId();
      this.attemptIds.set(question.id, attemptId);
    }
    const result = await this.platform.submitAnswer(session.id, { attemptId, questionId: question.id, response: choice });
    this.adopt(result.session);
    return result;
  }

  async results(): Promise<SessionResults | null> {
    const session = this.current;
    if (!session) return null;
    if (session.status === 'completed' && session.results) return session.results;
    const fresh = await this.refresh();
    return fresh.status === 'completed' ? fresh.results : null;
  }

  /** Re-reads the session from the server (by default the current one) and adopts it. */
  async refresh(sessionId?: string): Promise<PlaySession> {
    const id = sessionId ?? this.current?.id;
    if (!id) throw new Error('No session to refresh; call startSession() first.');
    const session = await this.platform.getSession(id);
    this.adopt(session);
    return session;
  }

  private adopt(session: PlaySession): void {
    this.current = session;
    this.question = session.status === 'active' ? session.currentQuestion : null;
  }

  private requireSession(): PlaySession {
    if (!this.current) throw new Error('No session; call startSession() first.');
    return this.current;
  }
}

export function createSessionClient(platform: BidaZooPlatform): SessionClient {
  return new PlaySessionClient(platform);
}
