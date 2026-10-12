/**
 * @bidazoo/learning-core
 *
 * Pure TypeScript with NO runtime dependencies. Time and randomness are always passed in
 * (a `Date` for "now", a string seed), so every function here is deterministic and testable.
 * Forbidden: document, window, localStorage, Phaser, React, database access, Fastify.
 * The boundary is enforced by tsconfig (no DOM lib, no node types) and by
 * tests/integration/learning-core-purity.test.ts.
 *
 * Responsibilities: fact families, seeded question generation, distractors, answer validation,
 * Leitner mastery with fluency, next-fact selection with bounded retry.
 * Not here: persistence, rewards, sessions, HTTP.
 */
export { createRng } from './rng';
export type { Rng } from './rng';

export {
  FACTOR_MIN,
  FACTOR_MAX,
  allMultiplicationFacts,
  factLabel,
  labelForSkillKey,
  parseSkillKey,
  skillKeyFor,
} from './multiplication';
export type { FactFamily, MultiplicationFact } from './multiplication';

export { CHOICE_COUNT, distractorCandidates, generateQuestion } from './question';
export type { GenerateOptions, GeneratedQuestion } from './question';

export { gradeAnswer } from './grading';
export type { GradeOutcome } from './grading';

export {
  MASTERY_CONFIG,
  applyAttempt,
  isFluent,
  isMastered,
  newMasteryState,
  priority,
  utcDay,
} from './mastery';
export type { AttemptObservation, MasteryConfig, MasteryState, MasteryUpdate } from './mastery';

export { SELECTION_CONFIG, selectNextSkill } from './selection';
export type { Selection, SelectionInput, SelectionReason, SessionHistoryItem } from './selection';
