import type { FastifyPluginAsync } from 'fastify';
import type { ModuleOptions } from '../../context';
import { registerProgressRoutes } from './routes';

/**
 * progress module: World Expedition progression (Lane C). Passport stamps and unlocked
 * destinations under /api/v1/me/*.
 *
 * Every value here is decided by the server from its own records: a client can read its progress
 * but never set it. Everything keys off the existing player id, so guests keep working.
 */
export const progressModule: FastifyPluginAsync<ModuleOptions> = async (app, options) => {
  if (!options.ctx) return;
  registerProgressRoutes(app, options.ctx);
};

export {
  EXPEDITION_RUN_EVENT,
  STAMP_MIN_BEACONS,
  getExpeditionProgress,
  isExpeditionDestination,
  recordExpeditionRun,
  unlockedDestinations,
} from './service';
export type { ExpeditionRun } from './service';
export { destinationStamps, expeditionEvents, playerProgress } from './tables';
export type { GearState } from './tables';
