import type { HealthResponse, ReadyResponse } from '@bidazoo/contracts';
import type { FastifyPluginAsync } from 'fastify';

export interface ReadinessChecks {
  /** Resolves true when the database is reachable. May reject or resolve false when it is not. */
  database: () => Promise<boolean>;
}

export interface HealthRouteOptions {
  checks: ReadinessChecks;
}

/**
 * GET /health  Liveness: the process is up. Never touches dependencies.
 * GET /ready   Readiness: dependencies are usable. 200 when ready, 503 otherwise.
 *
 * /ready reports only coarse status. Underlying errors are logged server-side and
 * never returned, since they can reveal hostnames, usernames, or other internals.
 */
export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (app, options) => {
  app.get('/health', async (): Promise<HealthResponse> => {
    return { status: 'ok', service: 'bidazoo-api' };
  });

  app.get('/ready', async (request, reply) => {
    let database: ReadyResponse['checks']['database'] = 'unavailable';
    try {
      if (await options.checks.database()) {
        database = 'ok';
      }
    } catch (err) {
      request.log.warn({ err }, 'readiness: database check failed');
    }

    const ready = database === 'ok';
    const body: ReadyResponse = {
      status: ready ? 'ready' : 'not_ready',
      checks: { database },
    };
    return reply.code(ready ? 200 : 503).send(body);
  });
};
