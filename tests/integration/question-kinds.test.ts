import Fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { PublicQuestionSchema, SubmitAnswerRequestSchema, type PublicQuestion } from '@bidazoo/contracts';
import { gradeAnswer } from '@bidazoo/learning-core';
import { describe, expect, it } from 'vitest';

/**
 * D3: question `kind` (number | text), 3 or 4 choices, and an answer `response` that is the
 * chosen value (integer or string). These tests run the real contract schemas through Fastify's
 * validation and serialization, and the real learning-core grader against a server-held key.
 * No database is involved: the session service (Lane A/C file) is not part of this lane's list.
 */

const ID = '5f2b2192-7940-4e63-9b99-41ab59c2eef7';

interface Fixture {
  name: string;
  question: PublicQuestion;
  key: number | string;
  wrong: number | string;
}

const FIXTURES: Fixture[] = [
  { name: '4 number choices, kind absent', question: { id: ID, sequence: 1, prompt: '7 x 8', type: 'multipleChoice', choices: [48, 54, 56, 63] }, key: 56, wrong: 54 },
  { name: '4 number choices, kind number', question: { id: ID, sequence: 1, prompt: '7 x 8', type: 'multipleChoice', kind: 'number', choices: [48, 54, 56, 63] }, key: 63, wrong: 48 },
  { name: '3 number choices', question: { id: ID, sequence: 2, prompt: '4 + 5', type: 'multipleChoice', kind: 'number', choices: [8, 9, 10] }, key: 9, wrong: 10 },
  { name: '4 text choices', question: { id: ID, sequence: 3, prompt: 'Which is largest?', type: 'multipleChoice', kind: 'text', choices: ['3/4', '1/2', '2/3', '1/4'] }, key: '3/4', wrong: '1/4' },
  { name: '3 text choices', question: { id: ID, sequence: 4, prompt: 'Round 467 to the nearest ten', type: 'multipleChoice', kind: 'text', choices: ['460', '470', '500'] }, key: '470', wrong: '500' },
];

/** Same Ajv options as apps/api/src/app.ts: strings are never coerced into numbers. */
function newApp() {
  return Fastify({
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false, allErrors: false } },
  }).withTypeProvider<TypeBoxTypeProvider>();
}

async function appFor(fixture: Fixture) {
  const app = newApp();
  app.get('/q', { schema: { response: { 200: PublicQuestionSchema } } }, async () => ({
    ...fixture.question,
    // A handler that returns the stored row by mistake must not leak the key.
    correctAnswer: fixture.key,
    privateGradingData: { correctAnswer: fixture.key },
  }));
  app.post('/answer', { schema: { body: SubmitAnswerRequestSchema } }, async (req) => {
    // The server's key lives here, never in the body. Grading compares against it.
    return gradeAnswer(fixture.question.choices, fixture.key, req.body.response);
  });
  return app;
}

describe('PublicQuestion serialization: kind and 3 or 4 choices', () => {
  for (const f of FIXTURES) {
    it(`${f.name}: serialized as sent, no key`, async () => {
      const app = await appFor(f);
      const res = await app.inject({ method: 'GET', url: '/q' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.choices).toEqual(f.question.choices);
      expect(body.kind).toBe(f.question.kind);
      expect(Object.keys(body).sort()).toEqual(Object.keys(f.question).sort());
      expect(res.body).not.toMatch(/correctAnswer|privateGradingData/);
      await app.close();
    });
  }

  it('rejects 2 or 5 choices and mixed number and string choices at serialization', async () => {
    for (const choices of [[1, 2], [1, 2, 3, 4, 5], ['a', 'b'], [1, 'b', 3, 4], ['a', 2, 'c']]) {
      const app = newApp();
      app.get('/bad', { schema: { response: { 200: PublicQuestionSchema } } }, async () => ({
        id: ID, sequence: 1, prompt: 'p', type: 'multipleChoice' as const, choices: choices as never,
      }));
      const res = await app.inject({ method: 'GET', url: '/bad' });
      expect(res.statusCode, JSON.stringify(choices)).toBe(500);
      await app.close();
    }
  });

  it('rejects an unknown kind', async () => {
    const app = newApp();
    app.get('/bad', { schema: { response: { 200: PublicQuestionSchema } } }, async () => ({
      id: ID, sequence: 1, prompt: 'p', type: 'multipleChoice' as const, kind: 'picture' as never, choices: [1, 2, 3],
    }));
    expect((await app.inject({ method: 'GET', url: '/bad' })).statusCode).toBe(500);
    await app.close();
  });
});

describe('answer request and grading: number and text', () => {
  const attempt = { attemptId: 'attempt-0001', questionId: ID };
  for (const f of FIXTURES) {
    it(`${f.name}: the chosen value is accepted and graded against the key`, async () => {
      const app = await appFor(f);
      const right = await app.inject({ method: 'POST', url: '/answer', payload: { ...attempt, response: f.key } });
      expect(right.statusCode).toBe(200);
      expect(right.json()).toEqual({ kind: 'graded', correct: true });
      const wrong = await app.inject({ method: 'POST', url: '/answer', payload: { ...attempt, response: f.wrong } });
      expect(wrong.json()).toEqual({ kind: 'graded', correct: false });
      const never = await app.inject({ method: 'POST', url: '/answer', payload: { ...attempt, response: typeof f.key === 'number' ? 99999 : 'never offered' } });
      expect(never.json()).toEqual({ kind: 'invalid', reason: 'not_an_offered_choice' });
      await app.close();
    });
  }

  it('a number question does not accept the same digits as a string, and the reverse', async () => {
    const [num, text] = [FIXTURES[0], FIXTURES[3]] as [Fixture, Fixture];
    const a = await appFor(num);
    const asString = await a.inject({ method: 'POST', url: '/answer', payload: { ...attempt, response: '56' } });
    expect(asString.json()).toEqual({ kind: 'invalid', reason: 'not_an_offered_choice' });
    await a.close();
    const b = await appFor({ ...text, question: { ...text.question, choices: ['1', '2', '3', '4'] }, key: '3' });
    const asNumber = await b.inject({ method: 'POST', url: '/answer', payload: { ...attempt, response: 3 } });
    expect(asNumber.json()).toEqual({ kind: 'invalid', reason: 'not_an_offered_choice' });
    await b.close();
  });

  it('the request schema rejects bad response types and values', async () => {
    const app = await appFor(FIXTURES[0] as Fixture);
    for (const response of [null, true, 1.5, -1, 100001, '', 'x'.repeat(201), [1], { a: 1 }]) {
      const res = await app.inject({ method: 'POST', url: '/answer', payload: { ...attempt, response } });
      expect(res.statusCode, JSON.stringify(response)).toBe(400);
    }
    const extra = await app.inject({ method: 'POST', url: '/answer', payload: { ...attempt, response: 1, correct: true } });
    expect(extra.statusCode).toBe(400);
    await app.close();
  });
});
