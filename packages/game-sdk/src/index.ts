/**
 * @bidazoo/game-sdk
 *
 * The boundary between a game and the platform. A game talks ONLY in terms of
 * these domain actions and the shared contracts. It must not know about:
 *   - database structure
 *   - login internals
 *   - how currency is stored
 *   - how mastery is persisted
 *   - subscription logic
 *   - entitlement internals
 *
 * Checkpoint A establishes the boundary only; there is intentionally no
 * implementation here. See docs/GAME-SDK.md.
 */
import type {
  AnswerResult,
  GameConfig,
  GameSession,
  PlayerResponse,
  SessionResult,
} from '@bidazoo/contracts';

export type {
  AnswerResult,
  GameConfig,
  GameSession,
  PlayerResponse,
  PublicQuestion,
  RewardGrant,
  SessionResult,
} from '@bidazoo/contracts';

/**
 * The platform-facing surface of a game session.
 *
 * Every method is a request for a domain action. Results are facts the server
 * already decided; the game's job is to present them (animate, play sound, etc.).
 */
export interface BidaZooGame {
  start(config: GameConfig): Promise<GameSession>;
  submitAnswer(response: PlayerResponse): Promise<AnswerResult>;
  finish(): Promise<SessionResult>;
}
