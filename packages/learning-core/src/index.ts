/**
 * @bidazoo/learning-core
 *
 * Pure TypeScript. Allowed to depend on: @bidazoo/contracts (types only).
 * Forbidden: document, window, localStorage, Phaser, React, database access, Fastify.
 * The boundary is enforced by tsconfig (no DOM lib, no node types) and by
 * tests/integration/learning-core-purity.test.ts.
 *
 * Future responsibilities: skill selection, mastery transitions, session progression,
 * retry scheduling, difficulty, base scoring/reward calculation.
 */
export { createRng } from './rng';
export type { Rng } from './rng';
export { toPublicQuestion } from './question';
export type { ServerQuestion } from './question';
export { gradeResponse } from './grading';
export type { GradeOutcome } from './grading';
export { buildChoices } from './choices';
export type { BuildChoicesInput, BuiltChoices } from './choices';
