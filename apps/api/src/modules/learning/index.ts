import type { FastifyPluginAsync } from 'fastify';

/**
 * learning module — Adapter between the API and @bidazoo/learning-core.
 *
 * Owns the persistence of mastery state (skill_mastery). The rules themselves (Leitner boxes,
 * fluency, selection, question generation) live in the pure learning-core package; this module
 * only loads state, hands it to learning-core, and stores what comes back.
 */
export const learningModule: FastifyPluginAsync = async () => {
  // No routes: mastery is read and written only inside the sessions module's transactions.
};

export { loadMasteryForUpdate, loadMasteryMap, saveMastery, skillsMasteredSince } from './mastery-repo';
