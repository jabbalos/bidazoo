import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ApiPaths, ErrorResponseSchema, ExpeditionProgressSchema } from '@bidazoo/contracts';
import type { AppContext } from '../../context';
import { requireGuest } from '../identity';
import { getExpeditionProgress } from './service';

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
}
