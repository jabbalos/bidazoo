import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  ApiPaths,
  ErrorResponseSchema,
  ExpeditionProgressSchema,
  StartExpeditionRunRequestSchema,
  StartExpeditionRunResponseSchema,
} from '@bidazoo/contracts';
import type { AppContext } from '../../context';
import { requireGuest } from '../identity';
import { getExpeditionProgress, startExpeditionRun } from './service';

const failures = { '4xx': ErrorResponseSchema, '5xx': ErrorResponseSchema } as const;

export function registerProgressRoutes(app: FastifyInstance, ctx: AppContext): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  // Stamps and unlocked destinations. Read-only: nothing here can award a stamp.
  typed.get(
    ApiPaths.meExpedition,
    { schema: { response: { 200: ExpeditionProgressSchema, ...failures } } },
    async (request, reply) => {
      const guest = await requireGuest(ctx, request);
      return reply.code(200).send(await getExpeditionProgress(ctx.db, guest.playerId));
    },
  );

  // Records which destination an active session plays. The only thing a client may say here is the
  // destination; the server checks it is unlocked, and decides every stamp itself at completion.
  typed.post(
    ApiPaths.meExpeditionRuns,
    {
      schema: {
        body: StartExpeditionRunRequestSchema,
        response: { 200: StartExpeditionRunResponseSchema, 201: StartExpeditionRunResponseSchema, ...failures },
      },
    },
    async (request, reply) => {
      const guest = await requireGuest(ctx, request);
      const { sessionId, destination } = request.body;
      const { created } = await startExpeditionRun(ctx.db, guest.playerId, sessionId, destination);
      return reply.code(created ? 201 : 200).send({ sessionId, destination });
    },
  );
}
