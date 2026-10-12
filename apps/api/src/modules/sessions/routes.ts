import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import {
  AnswerResultSchema,
  ApiPaths,
  ErrorResponseSchema,
  GetPlaySessionResponseSchema,
  QuestionResponseSchema,
  SessionParamsSchema,
  StartPlaySessionRequestSchema,
  StartPlaySessionResponseSchema,
  SubmitAnswerRequestSchema,
} from '@bidazoo/contracts';
import type { AppContext } from '../../context';
import { requireGuest } from '../identity';
import { getSession, issueQuestion, startOrResumeSession, submitAnswer } from './service';

const EmptyBody = Type.Object({}, { additionalProperties: false });
const failures = { '4xx': ErrorResponseSchema, '5xx': ErrorResponseSchema } as const;

export function registerSessionRoutes(app: FastifyInstance, ctx: AppContext): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.post(
    ApiPaths.playSessions,
    {
      config: app.routeRateLimit('sessionStart'),
      schema: {
        body: StartPlaySessionRequestSchema,
        response: { 200: StartPlaySessionResponseSchema, 201: StartPlaySessionResponseSchema, ...failures },
      },
    },
    async (request, reply) => {
      const guest = await requireGuest(ctx, request);
      const result = await startOrResumeSession(ctx, guest.playerId, request.body);
      return reply.code(result.resumed ? 200 : 201).send(result);
    },
  );

  typed.get(
    `${ApiPaths.playSessions}/:sessionId`,
    { schema: { params: SessionParamsSchema, response: { 200: GetPlaySessionResponseSchema, ...failures } } },
    async (request, reply) => {
      const guest = await requireGuest(ctx, request);
      const session = await getSession(ctx, guest.playerId, request.params.sessionId);
      return reply.code(200).send({ session });
    },
  );

  // Issues the next question, or returns the outstanding one unchanged (refresh-safe).
  typed.post(
    `${ApiPaths.playSessions}/:sessionId/question`,
    {
      schema: {
        params: SessionParamsSchema,
        body: EmptyBody,
        response: { 200: QuestionResponseSchema, ...failures },
      },
    },
    async (request, reply) => {
      const guest = await requireGuest(ctx, request);
      const result = await issueQuestion(ctx, guest.playerId, request.params.sessionId);
      return reply.code(200).send(result);
    },
  );

  typed.post(
    `${ApiPaths.playSessions}/:sessionId/answers`,
    {
      config: app.routeRateLimit('answer'),
      schema: {
        params: SessionParamsSchema,
        body: SubmitAnswerRequestSchema,
        response: { 200: AnswerResultSchema, ...failures },
      },
    },
    async (request, reply) => {
      const guest = await requireGuest(ctx, request);
      const result = await submitAnswer(ctx, guest.playerId, request.params.sessionId, request.body);
      return reply.code(200).send(result);
    },
  );
}
