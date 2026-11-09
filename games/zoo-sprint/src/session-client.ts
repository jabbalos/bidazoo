import type {
  AnswerResult,
  BidaZooPlatform,
  PlaySession,
  PublicQuestion,
  SessionResults,
  StartPlaySessionRequest,
} from '@bidazoo/game-sdk';

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

/** Interface only: every method is a stub until Lane A (item A3) implements it. */
export function createSessionClient(_platform: BidaZooPlatform): SessionClient {
  return {
    async startSession(_req) {
      throw new Error('STUB: Lane A item A3 implements this');
    },
    async nextQuestion() {
      throw new Error('STUB: Lane A item A3 implements this');
    },
    async submitAnswer(_choice) {
      throw new Error('STUB: Lane A item A3 implements this');
    },
    async results() {
      throw new Error('STUB: Lane A item A3 implements this');
    },
  };
}
