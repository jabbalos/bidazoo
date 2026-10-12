import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  ApiPaths,
  ChildParamsSchema,
  ChildResponseSchema,
  CreateChildRequestSchema,
  ErrorResponseSchema,
  FamilyResponseSchema,
} from '@bidazoo/contracts';
import type { AppContext } from '../../context';
import { createChild, getFamily, setChildArchived } from './children';
import { requireGuardian } from './guardian-auth';

const failures = { '4xx': ErrorResponseSchema, '5xx': ErrorResponseSchema } as const;

/** Family and child-profile management. Every route needs guardian authority. */
export function registerFamilyRoutes(app: FastifyInstance, ctx: AppContext): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.get(ApiPaths.family, { schema: { response: { 200: FamilyResponseSchema, ...failures } } }, async (request) =>
    getFamily(ctx, await requireGuardian(ctx, request)),
  );

  typed.post(
    ApiPaths.familyChildren,
    { schema: { body: CreateChildRequestSchema, response: { 201: ChildResponseSchema, ...failures } } },
    async (request, reply) => {
      const guardian = await requireGuardian(ctx, request);
      return reply.code(201).send({ child: await createChild(ctx, guardian, request.body.nickname) });
    },
  );

  for (const [path, archived] of [
    [ApiPaths.familyChildArchive(':childId'), true],
    [ApiPaths.familyChildRestore(':childId'), false],
  ] as const) {
    typed.post(
      path,
      { schema: { params: ChildParamsSchema, response: { 200: ChildResponseSchema, ...failures } } },
      async (request) => {
        const guardian = await requireGuardian(ctx, request);
        return { child: await setChildArchived(ctx, guardian, request.params.childId, archived) };
      },
    );
  }
}
