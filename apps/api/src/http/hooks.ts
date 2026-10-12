import type { FastifyInstance } from 'fastify';
import { ApiPaths, API_PREFIX } from '@bidazoo/contracts';
import { ApiError } from './errors';
import { apiSecurityHeaders } from './security-headers';

/**
 * Cross-cutting HTTP behavior: security headers, a same-origin check for state-changing API
 * calls, and one error handler so no response ever echoes request values or internals.
 */
export function installHttpHooks(
  app: FastifyInstance,
  allowedOrigins: readonly string[],
  hstsMaxAgeSeconds = 0,
): void {
  const securityHeaders = apiSecurityHeaders(hstsMaxAgeSeconds);
  // onSend runs for every response, including 404s, validation errors, 429s, and 503s.
  app.addHook('onSend', async (request, reply, payload) => {
    for (const [name, value] of Object.entries(securityHeaders)) reply.header(name, value);
    if (request.url.startsWith(API_PREFIX)) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  // CSRF defense in depth. The cookie is SameSite=Lax (not sent on cross-site POSTs) and bodies
  // must be application/json (not sendable by a plain cross-site form). On top of that, if a
  // browser says where a state-changing request came from, it must be this site.
  app.addHook('onRequest', async (request) => {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return;
    if (!request.url.startsWith(API_PREFIX)) return;
    const origin = request.headers.origin;
    if (origin === undefined) return; // non-browser client (curl, tests); no ambient cookie risk
    if (allowedOrigins.includes(origin)) return;
    try {
      if (new URL(origin).host === request.headers.host) return;
    } catch {
      // fall through to rejection
    }
    throw new ApiError(403, 'forbidden_origin');
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ error: { code: 'not_found', message: 'Not found.' } });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      if (error.retryAfterSeconds !== undefined) void reply.header('Retry-After', String(error.retryAfterSeconds));
      return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
    }
    const status = (error as { statusCode?: number }).statusCode;
    const isValidation = (error as { validation?: unknown }).validation !== undefined;
    if (isValidation || (status !== undefined && status >= 400 && status < 500)) {
      // Schema failures, unsupported media type, oversized body, malformed JSON.
      return reply
        .code(isValidation ? 400 : (status as number))
        .send({ error: { code: 'invalid_request', message: 'The request was not valid.' } });
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply
      .code(500)
      .send({ error: { code: 'internal_error', message: 'Something went wrong.' } });
  });
}

export { ApiPaths };
