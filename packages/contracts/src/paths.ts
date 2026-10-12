/**
 * Paths and constants shared by server and clients. Kept in a module with NO runtime
 * dependencies so a browser client can import them without pulling in the schema library.
 */

export const API_PREFIX = '/api/v1';

export const ApiPaths = {
  guest: `${API_PREFIX}/guest`,
  me: `${API_PREFIX}/me`,
  playSessions: `${API_PREFIX}/play-sessions`,
  playSession: (sessionId: string) => `${API_PREFIX}/play-sessions/${sessionId}`,
  question: (sessionId: string) => `${API_PREFIX}/play-sessions/${sessionId}/question`,
  answers: (sessionId: string) => `${API_PREFIX}/play-sessions/${sessionId}/answers`,
} as const;

export const GAME_ID = 'zoo-sprint';
export const MODE_MULTIPLICATION = 'multiplication';
/** Questions in one play session. The server enforces it; the client only displays it. */
export const SESSION_LENGTH = 10;

