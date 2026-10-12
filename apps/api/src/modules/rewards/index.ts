import type { FastifyPluginAsync } from 'fastify';

/**
 * rewards module — Idempotent reward issuance (XP, coins). The only writer of reward ledgers.
 *
 * Checkpoint A: placeholder. Registers no routes and holds no state.
 */
export const rewardsModule: FastifyPluginAsync = async () => {
  // Intentionally empty.
};
