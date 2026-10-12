import Fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  AnswerResultSchema,
  ChildParamsSchema,
  ChildResponseSchema,
  ClaimGuestRequestSchema,
  ConsumeLinkRequestSchema,
  CreateChildRequestSchema,
  DeviceCodeRequestSchema,
  DeviceCodeResponseSchema,
  DeviceParamsSchema,
  DeviceStateResponseSchema,
  DevicesResponseSchema,
  EmailLinkAcceptedSchema,
  EmailLinkRequestSchema,
  ErrorCodeSchema,
  FamilyResponseSchema,
  LegacyClaimCodeRequestSchema,
  LegacyClaimResponseSchema,
  LegacyKidLinkRequestSchema,
  LegacyKidParamsSchema,
  LegacyOfferResponseSchema,
  RedeemDeviceCodeRequestSchema,
  RevokeAllRequestSchema,
  RevokeResponseSchema,
  SetPinRequestSchema,
  SwitchProfileRequestSchema,
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

// ---------------------------------------------------------------------------
// Checkpoint E: family identity contracts
// ---------------------------------------------------------------------------

/** Every identity request a client can send, with the only properties it may carry. */
const IDENTITY_REQUESTS: Array<[string, unknown, string[]]> = [
  ['EmailLinkRequest', EmailLinkRequestSchema, ['email']],
  ['ConsumeLinkRequest', ConsumeLinkRequestSchema, ['deviceLabel', 'token']],
  ['CreateChildRequest', CreateChildRequestSchema, ['nickname']],
  ['ClaimGuestRequest', ClaimGuestRequestSchema, ['nickname']],
  ['SetPinRequest', SetPinRequestSchema, ['pin']],
  ['SwitchProfileRequest', SwitchProfileRequestSchema, ['childProfileId', 'pin']],
  ['DeviceCodeRequest', DeviceCodeRequestSchema, ['childProfileId']],
  ['RedeemDeviceCodeRequest', RedeemDeviceCodeRequestSchema, ['code', 'deviceLabel']],
  ['RevokeAllRequest', RevokeAllRequestSchema, ['includeCurrent']],
  ['LegacyClaimCodeRequest', LegacyClaimCodeRequestSchema, ['code']],
  ['LegacyKidLinkRequest', LegacyKidLinkRequestSchema, ['nickname']],
  ['ChildParams', ChildParamsSchema, ['childId']],
  ['DeviceParams', DeviceParamsSchema, ['deviceId']],
  ['LegacyKidParams', LegacyKidParamsSchema, ['legacyKidId']],
];

const IDENTITY_RESPONSES: Array<[string, unknown]> = [
  ['EmailLinkAccepted', EmailLinkAcceptedSchema],
  ['ChildResponse', ChildResponseSchema],
  ['DeviceStateResponse', DeviceStateResponseSchema],
  ['FamilyResponse', FamilyResponseSchema],
  ['DeviceCodeResponse', DeviceCodeResponseSchema],
  ['DevicesResponse', DevicesResponseSchema],
  ['RevokeResponse', RevokeResponseSchema],
  ['LegacyOfferResponse', LegacyOfferResponseSchema],
  ['LegacyClaimResponse', LegacyClaimResponseSchema],
];

/** Collects every property name at any depth of a TypeBox schema. */
function deepPropertyNames(schema: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) {
    for (const item of schema) deepPropertyNames(item, into);
  } else if (schema && typeof schema === 'object') {
    for (const [key, value] of Object.entries(schema)) {
      if (key === 'properties' && value && typeof value === 'object') {
        for (const name of Object.keys(value)) into.add(name);
      }
      deepPropertyNames(value, into);
    }
  }
  return into;
}

describe('identity contracts (Checkpoint E)', () => {
  it('every identity request forbids extra properties and carries only its allowlisted fields', () => {
    for (const [name, schema, allowed] of IDENTITY_REQUESTS) {
      expect((schema as { additionalProperties?: unknown }).additionalProperties, name).toBe(false);
      expect(propertyNames(schema).sort(), name).toEqual([...allowed].sort());
    }
  });

  it('no identity request can name a player or set xp, coins, mastery, correctness or timing', () => {
    for (const [name, schema] of IDENTITY_REQUESTS) {
      for (const property of propertyNames(schema)) {
        expect(STATE_FIELD_NAMES, `${name}.${property}`).not.toContain(property);
        // A child is addressed by its profile id; the player is resolved from the cookie.
        expect(property, `${name}.${property}`).not.toMatch(/player/i);
      }
    }
  });

  it('only the two PIN-carrying requests have a pin property, and the PIN is never sent back', () => {
    const withPin = IDENTITY_REQUESTS.filter(([, schema]) => propertyNames(schema).includes('pin')).map(([name]) => name);
    expect(withPin.sort()).toEqual(['SetPinRequest', 'SwitchProfileRequest']);
    for (const [name, schema] of IDENTITY_RESPONSES) {
      expect([...deepPropertyNames(schema)], name).not.toContain('pin');
    }
  });

  it('no identity response can carry a token, hash, salt, pepper, secret, or player id', () => {
    for (const [name, schema] of IDENTITY_RESPONSES) {
      for (const property of deepPropertyNames(schema)) {
        expect(property, `${name}.${property}`).not.toMatch(/token|hash|salt|pepper|secret|hmac|playerid/i);
      }
      expect((schema as { additionalProperties?: unknown }).additionalProperties, name).toBe(false);
    }
  });

  it('the only response that carries an email is the guardian seeing their own address', () => {
    const withEmail = IDENTITY_RESPONSES.filter(([, schema]) =>
      [...deepPropertyNames(schema)].some((property) => /email/i.test(property)),
    ).map(([name]) => name);
    expect(withEmail).toEqual(['FamilyResponse']);
  });

  it('declares the identity error codes with no code that could reveal whether an email exists', () => {
    const codes = (ErrorCodeSchema as { anyOf: Array<{ const: string }> }).anyOf.map((member) => member.const);
    expect(codes).toEqual(
      expect.arrayContaining(['link_invalid', 'forbidden', 'already_claimed', 'pin_incorrect', 'profile_required']),
    );
    for (const code of codes) expect(code).not.toMatch(/email|exists|unknown_user|no_such/i);
  });

  it('the legacy offer shape carries labels only, never names, progress, credentials or emails', () => {
    const names = [...deepPropertyNames(LegacyOfferResponseSchema), ...deepPropertyNames(LegacyClaimResponseSchema)];
    for (const name of names) {
      // `username` is the one allowed label (a display string, never a credential).
      expect(name).not.toMatch(/email|^(first|last|full|real)?name$|^pin$|coins|xp|mastery|badge|streak|inventory|password/i);
    }
    expect(new Set(names)).toEqual(
      new Set(['offer', 'childCount', 'kids', 'id', 'username', 'gradeBand', 'childProfileId']),
    );
  });
});
