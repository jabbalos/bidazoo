import { describe, it } from 'vitest';

/**
 * Index of where each trust-model guarantee is tested. The tests themselves live next to the
 * behavior they prove; this file exists so a missing guarantee is visible in one place.
 * Remaining `todo` entries are guarantees whose feature does not exist yet.
 *
 * Proven by database-backed tests (tests/integration/*.test.ts):
 *  - question authority (random/nonexistent/unserved ids cannot be graded)  server-authority
 *  - ownership (player A cannot answer player B's question)                 server-authority
 *  - one grade per question (API 409 and database unique constraint)       server-authority, database-guards
 *  - idempotent replay and alternate-key rejection                          idempotency-concurrency
 *  - simultaneous submissions commit once                                   idempotency-concurrency
 *  - currency / XP / mastery authority (no field accepts them)              server-authority, contracts-boundary
 *  - answer secrecy before grading                                          server-authority, contracts-boundary
 *  - completed/expired sessions cannot mint rewards                         server-authority, idempotency-concurrency
 *  - refresh restores the question without resetting its timer              gameplay-flow
 *  - server-measured response time and fluency                              gameplay-flow
 *  - malformed or oversized input is rejected                               server-authority
 */
describe('API trust model: guarantees whose feature does not exist yet', () => {
  it.todo('clients cannot directly unlock inventory (no inventory feature yet)');
  it.todo('parent/account identity cannot be forged (no accounts yet)');
  it.todo('rate limiting bounds guest creation and answer submission');
});
