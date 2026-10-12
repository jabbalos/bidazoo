import type { ErrorCode } from '@bidazoo/contracts';

/** A failure the API reports to the client on purpose, with a fixed, value-free message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'ApiError';
  }
}

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  invalid_request: 'The request was not valid.',
  unauthenticated: 'No valid guest session. Start again.',
  forbidden_origin: 'This request is not allowed from here.',
  not_found: 'Not found.',
  session_not_active: 'This play session is not active.',
  question_already_answered: 'That question was already answered.',
  idempotency_key_conflict: 'That attempt id was already used for a different request.',
  invalid_response: 'That is not one of the offered choices.',
  internal_error: 'Something went wrong.',
};

export const errors = {
  unauthenticated: () => new ApiError(401, 'unauthenticated'),
  // The same answer for "does not exist" and "belongs to someone else": no probing.
  notFound: () => new ApiError(404, 'not_found'),
  sessionNotActive: () => new ApiError(409, 'session_not_active'),
  alreadyAnswered: () => new ApiError(409, 'question_already_answered'),
  idempotencyConflict: () => new ApiError(409, 'idempotency_key_conflict'),
  invalidResponse: () => new ApiError(422, 'invalid_response'),
};

/** PostgreSQL unique_violation. */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    ((err as { code?: unknown }).code === '23505' ||
      isUniqueViolation((err as { cause?: unknown }).cause))
  );
}
