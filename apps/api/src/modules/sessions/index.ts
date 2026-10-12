import type { FastifyPluginAsync } from 'fastify';
import type { ModuleOptions } from '../../context';
import { registerSessionRoutes } from './routes';

/**
 * sessions module — Play-session lifecycle and the answer transaction.
 *
 * Start or resume a session, issue questions (server-side, via learning-core), and grade
 * answers. This is where "client request -> validation -> domain logic -> database commit ->
 * result" happens. See service.ts for the transaction and its exactly-once guarantees.
 */
export const sessionsModule: FastifyPluginAsync<ModuleOptions> = async (app, options) => {
  if (!options.ctx) return;
  registerSessionRoutes(app, options.ctx);
};
