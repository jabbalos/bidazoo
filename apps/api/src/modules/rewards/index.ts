import type { FastifyPluginAsync } from 'fastify';

/**
 * rewards module — Append-only XP and coin ledgers, written only inside the answer transaction.
 *
 * Exposes no routes: a client can never request a reward, only answer a question. Balances are
 * sums of ledger rows. See ledger.ts and policy.ts.
 */
export const rewardsModule: FastifyPluginAsync = async () => {
  // No routes by design.
};

export { appendGrants, getSessionTotals, getTotals, grantsForSource } from './ledger';
export { grantsForAttempt, grantsForCompletion, REWARD_POLICY } from './policy';
export type { Grant } from './policy';
