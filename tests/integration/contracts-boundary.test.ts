import Fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  AnswerResultSchema,
  PublicQuestionSchema,
  StartPlaySessionRequestSchema,
  SubmitAnswerRequestSchema,
  GuestResponseSchema,
  type AnswerResult,
  type GuestResponse,
  type PublicQuestion,
  type StartPlaySessionRequest,
  type SubmitAnswerRequest,
} from '@bidazoo/contracts';
import { describe, expect, expectTypeOf, it } from 'vitest';

/**
 * Trust-model guards for the shared API contract.
 *  - Compile-time (`expectTypeOf`, checked by `npm run typecheck`): if someone adds an
 *    answer-key field to PublicQuestion or a state field to a client request, typechecking fails.
 *  - Runtime: the same schemas the server validates with are inspected directly.
 */

const STATE_FIELD_NAMES = [
  'xp',
  'coins',
  'currency',
  'amount',
  'inventory',
  'mastery',
  'box',
  'streak',
  'achievements',
  'unlocks',
  'entitlements',
  'correct',
  'fluent',
  'responseMs',
  'elapsedMs',
  'servedAt',
  'answeredAt',
  'correctAnswer',
  'playerId',
];

const SECRET_FIELD_NAMES = ['correctAnswer', 'correctChoiceId', 'answerKey', 'gradingData', 'privateGradingData'];

function propertyNames(schema: unknown): string[] {
  return Object.keys((schema as { properties: Record<string, unknown> }).properties);
}

describe('contract boundaries (checked at typecheck time)', () => {
  it('PublicQuestion carries no answer-key information', () => {
    expectTypeOf<keyof PublicQuestion>().toEqualTypeOf<'id' | 'sequence' | 'prompt' | 'type' | 'choices'>();
    expectTypeOf<PublicQuestion['choices']>().toEqualTypeOf<number[]>();
    expect(true).toBe(true);
  });

  it('client requests are domain actions and never carry xp, coins, mastery, correctness or timing', () => {
    expectTypeOf<keyof SubmitAnswerRequest>().toEqualTypeOf<'attemptId' | 'questionId' | 'response'>();
    expectTypeOf<keyof StartPlaySessionRequest>().toEqualTypeOf<'gameId' | 'mode'>();
    expect(true).toBe(true);
  });

  it('rewards, mastery and the revealed answer appear only in server results', () => {
    expectTypeOf<AnswerResult>().toHaveProperty('rewards');
    expectTypeOf<AnswerResult>().toHaveProperty('mastery');
    expectTypeOf<AnswerResult>().toHaveProperty('correctAnswer');
    expectTypeOf<GuestResponse>().toHaveProperty('totals');
    expect(true).toBe(true);
  });
});

describe('contract boundaries (runtime, on the real schemas)', () => {
  it('every client request schema forbids extra properties', () => {
    for (const schema of [SubmitAnswerRequestSchema, StartPlaySessionRequestSchema]) {
      expect((schema as { additionalProperties?: unknown }).additionalProperties).toBe(false);
    }
  });

  it('no client request schema has a property that could set progress, rewards or timing', () => {
    for (const schema of [SubmitAnswerRequestSchema, StartPlaySessionRequestSchema]) {
      for (const name of propertyNames(schema)) {
        expect(STATE_FIELD_NAMES, `request property "${name}"`).not.toContain(name);
      }
    }
    expect(propertyNames(SubmitAnswerRequestSchema).sort()).toEqual(['attemptId', 'questionId', 'response']);
  });

  it('the public question schema has no secret property and forbids extras', () => {
    expect(propertyNames(PublicQuestionSchema).sort()).toEqual(['choices', 'id', 'prompt', 'sequence', 'type']);
    for (const name of SECRET_FIELD_NAMES) expect(propertyNames(PublicQuestionSchema)).not.toContain(name);
    expect((PublicQuestionSchema as { additionalProperties?: unknown }).additionalProperties).toBe(false);
  });

  it('only the graded result may reveal the answer', () => {
    expect(propertyNames(AnswerResultSchema)).toContain('correctAnswer');
    for (const schema of [PublicQuestionSchema, GuestResponseSchema]) {
      for (const name of SECRET_FIELD_NAMES) expect(propertyNames(schema)).not.toContain(name);
    }
  });
});

describe('response serialization is an allowlist (private data cannot leak by accident)', () => {
  it('drops any property not in the response schema, even if the handler returns it', async () => {
    const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();
    app.get('/leaky', { schema: { response: { 200: PublicQuestionSchema } } }, async () => {
      // A handler that mistakenly returns a whole database row, secrets included.
      return {
        id: '5f2b2192-7940-4e63-9b99-41ab59c2eef7',
        sequence: 3,
        prompt: '7 × 8',
        type: 'multipleChoice' as const,
        choices: [48, 54, 56, 63],
        correctAnswer: 56,
        privateGradingData: { skillKey: 'mul:7x8', correctAnswer: 56 },
        private_grading_data: '{"correctAnswer":56}',
        answerKey: 56,
      };
    });
    const res = await app.inject({ method: 'GET', url: '/leaky' });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json()).sort()).toEqual(['choices', 'id', 'prompt', 'sequence', 'type']);
    expect(res.body).not.toMatch(/correctAnswer|privateGradingData|private_grading_data|answerKey/);
    await app.close();
  });
});
