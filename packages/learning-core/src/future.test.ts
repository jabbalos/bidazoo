import { describe, it } from 'vitest';

/**
 * Structure for tests that arrive with later checkpoints.
 * Intentionally `todo`: they document intent and show up in the test report
 * without pretending the behavior exists.
 */
describe('learning-core (future)', () => {
  it.todo('generated questions are valid for every skill and difficulty');
  it.todo('mastery transitions: unseen -> learning -> practicing -> mastered (and back on repeated misses)');
  it.todo('missed questions are scheduled for retry after a spacing interval');
  it.todo('session progression selects the next skill from mastery state');
  it.todo('seeded generation of whole sessions is reproducible');
});
