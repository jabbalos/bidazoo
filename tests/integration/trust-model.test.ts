import { describe, it } from 'vitest';

/**
 * Structure for the API trust-model tests that arrive with the checkpoints that
 * build sessions, rewards, and inventory. Intentionally `todo`: they record the
 * required guarantees without pretending the behavior exists yet.
 */
describe('API trust model (future)', () => {
  it.todo('an answer cannot award rewards twice (idempotency key replay)');
  it.todo('invalid or finished sessions cannot earn rewards');
  it.todo('clients cannot directly set XP');
  it.todo('clients cannot directly set currency');
  it.todo('clients cannot directly unlock inventory');
  it.todo('answer keys are not present in any response before the answer is graded');
  it.todo('malformed or oversized input is rejected by server-side validation');
});
