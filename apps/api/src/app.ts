import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { modules } from './modules';
import { healthRoutes, type ReadinessChecks } from './routes/health';

export interface BuildAppOptions {
  /** Injected so tests can run without a live database. */
  checks: ReadinessChecks;
  logger?: FastifyServerOptions['logger'];
}

/**
 * Builds the Fastify application without starting it (no port, no real I/O).
 * server.ts wires real dependencies; tests wire fakes.
 */
export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  void app.register(healthRoutes, { checks: options.checks });

  // Domain modules (modular monolith). Each registers its own routes as it gains features.
  for (const module of modules) {
    void app.register(module.plugin);
  }

  return app;
}
