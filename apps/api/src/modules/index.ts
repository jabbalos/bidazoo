import type { FastifyPluginAsync } from 'fastify';
import type { ModuleOptions } from '../context';
import { identityModule } from './identity';
import { playersModule } from './players';
import { learningModule } from './learning';
import { sessionsModule } from './sessions';
import { rewardsModule } from './rewards';
import { inventoryModule } from './inventory';
import { contentModule } from './content';
import { analyticsModule } from './analytics';

export interface ApiModule {
  name: string;
  plugin: FastifyPluginAsync<ModuleOptions>;
}

/**
 * All domain modules, registered by buildApp in this order.
 * Modules talk to each other through plain function calls inside the process
 * (modular monolith), never over the network.
 */
export const modules: readonly ApiModule[] = [
  { name: 'identity', plugin: identityModule },
  { name: 'players', plugin: playersModule },
  { name: 'learning', plugin: learningModule },
  { name: 'sessions', plugin: sessionsModule },
  { name: 'rewards', plugin: rewardsModule },
  { name: 'inventory', plugin: inventoryModule },
  { name: 'content', plugin: contentModule },
  { name: 'analytics', plugin: analyticsModule },
];
