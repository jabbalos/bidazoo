import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import {
  ApiPaths,
  ChildResponseSchema,
  ErrorResponseSchema,
  LegacyClaimCodeRequestSchema,
  LegacyClaimResponseSchema,
  LegacyKidLinkRequestSchema,
  LegacyKidParamsSchema,
  LegacyOfferResponseSchema,
} from '@bidazoo/contracts';
import type { AppContext } from '../../context';
import { requireGuardian } from './guardian-auth';
import { claimByCode, claimByEmail, legacyOffer, linkLegacyKid } from './legacy';
import type { IdentityRuntime } from './runtime';

const failures = { '4xx': ErrorResponseSchema, '5xx': ErrorResponseSchema } as const;
const EmptyBody = Type.Object({}, { additionalProperties: false });

/** Legacy (Hop Quest) claim routes. Registered only when identity is enabled; every route needs guardian authority. */
export function registerLegacyRoutes(app: FastifyInstance, ctx: AppContext, runtime: IdentityRuntime): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.get(ApiPaths.legacyOffer, { schema: { response: { 200: LegacyOfferResponseSchema, ...failures } } }, async (request) =>
    legacyOffer(ctx, runtime, await requireGuardian(ctx, request)),
  );

  // Claim the legacy family that matches this guardian's VERIFIED email. No body: nothing to inject.
  typed.post(
    ApiPaths.legacyClaim,
    { schema: { body: EmptyBody, response: { 200: LegacyClaimResponseSchema, 201: LegacyClaimResponseSchema, ...failures } } },
    async (request, reply) => {
      const result = await claimByEmail(ctx, runtime, await requireGuardian(ctx, request));
      return reply.code(result.created ? 201 : 200).send({ kids: result.kids });
    },
  );

  typed.post(
    ApiPaths.legacyClaimCode,
    { schema: { body: LegacyClaimCodeRequestSchema, response: { 201: LegacyClaimResponseSchema, ...failures } } },
    async (request, reply) => {
      const result = await claimByCode(ctx, runtime, await requireGuardian(ctx, request), request, request.body.code);
      return reply.code(201).send({ kids: result.kids });
    },
  );

  typed.post(
    ApiPaths.legacyKidLink(':legacyKidId'),
    { schema: { params: LegacyKidParamsSchema, body: LegacyKidLinkRequestSchema, response: { 200: ChildResponseSchema, 201: ChildResponseSchema, ...failures } } },
    async (request, reply) => {
      const result = await linkLegacyKid(ctx, runtime, await requireGuardian(ctx, request), request.params.legacyKidId, request.body.nickname);
      return reply.code(result.created ? 201 : 200).send({ child: result.child });
    },
  );
}
