import type {
  AnswerResult,
  GameConfig,
  PlayerResponse,
  PublicChoice,
  PublicQuestion,
  SubmitAnswerRequest,
} from '@bidazoo/contracts';
import { describe, expect, expectTypeOf, it } from 'vitest';

/**
 * Compile-time guards for the trust model. `expectTypeOf` is checked by
 * `tsc` (npm run typecheck): if someone adds an answer-key field to PublicQuestion,
 * or a state field (xp, coins, inventory) to a client request, typechecking fails.
 */
describe('contract boundaries (checked at typecheck time)', () => {
  it('PublicQuestion carries no answer-key information', () => {
    expectTypeOf<keyof PublicQuestion>().toEqualTypeOf<
      'questionId' | 'skillId' | 'prompt' | 'choices'
    >();
    expectTypeOf<keyof PublicChoice>().toEqualTypeOf<'id' | 'label'>();
    expect(true).toBe(true);
  });

  it('client requests are domain actions and never carry xp, coins, or inventory', () => {
    expectTypeOf<keyof SubmitAnswerRequest>().toEqualTypeOf<
      'sessionId' | 'idempotencyKey' | 'response'
    >();
    expectTypeOf<keyof PlayerResponse>().toEqualTypeOf<'questionId' | 'choiceId'>();
    expectTypeOf<keyof GameConfig>().toEqualTypeOf<'gameId'>();
    expect(true).toBe(true);
  });

  it('rewards appear only in server results, as read-only facts', () => {
    expectTypeOf<AnswerResult>().toHaveProperty('rewards');
    expect(true).toBe(true);
  });
});
