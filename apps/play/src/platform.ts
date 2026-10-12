import { ApiPaths } from '@bidazoo/contracts/paths';
import {
  PlatformError,
  type AnswerResult,
  type BidaZooPlatform,
  type GuestResponse,
  type PlaySession,
  type QuestionResponse,
  type StartPlaySessionRequest,
  type StartPlaySessionResponse,
  type SubmitAnswerRequest,
} from '@bidazoo/game-sdk';

/**
 * The HTTP implementation of the platform interface.
 *
 * Identity is an HttpOnly cookie that the browser attaches by itself; this code never reads,
 * stores, or sends a token (there is nothing for it to see). Requests are same-origin: the dev
 * server and the production reverse proxy forward /api to the API.
 */
async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new PlatformError(0, 'network', 'The network request failed.');
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = undefined;
  }
  if (!response.ok) {
    const error = (parsed as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new PlatformError(response.status, error?.code ?? 'unknown', error?.message ?? 'Request failed.');
  }
  return parsed as T;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createHttpPlatform(): BidaZooPlatform {
  return {
    ensureGuest: () => call<GuestResponse>('POST', ApiPaths.guest, {}),

    startSession: (request: StartPlaySessionRequest) =>
      call<StartPlaySessionResponse>('POST', ApiPaths.playSessions, request),

    getSession: async (sessionId: string): Promise<PlaySession> =>
      (await call<{ session: PlaySession }>('GET', ApiPaths.playSession(sessionId))).session,

    nextQuestion: (sessionId: string) => call<QuestionResponse>('POST', ApiPaths.question(sessionId), {}),

    // Safe to retry on a network failure: the attempt id makes the submission idempotent, so the
    // server will return the original result instead of awarding twice.
    async submitAnswer(sessionId: string, request: SubmitAnswerRequest): Promise<AnswerResult> {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await call<AnswerResult>('POST', ApiPaths.answers(sessionId), request);
        } catch (err) {
          if (!(err instanceof PlatformError) || !err.isNetwork) throw err;
          lastError = err;
          await sleep(300 * (attempt + 1));
        }
      }
      throw lastError;
    },
  };
}
