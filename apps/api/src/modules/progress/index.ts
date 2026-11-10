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
  EXPEDITION_START_EVENT,
  STAMP_MIN_BEACONS,
  getExpeditionProgress,
  getExpeditionRunOutcome,
  getSessionDestination,
  isExpeditionDestination,
  recordExpeditionRun,
  startExpeditionRun,
  unlockedDestinations,
} from './service';
export type { ExpeditionRun } from './service';
export { destinationStamps, expeditionEvents, playerProgress } from './tables';
export type { GearState } from './tables';
export { GEAR_PURCHASE_SOURCE, gearPurchaseReason, getGear, updateGear } from './gear';
export { GEAR_CATALOG, GEAR_SLOTS, gearItem, publicCatalog } from './gear-catalog';
export type { CatalogItem, GearSlot } from './gear-catalog';
