import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  ApiPaths,
  ChildParamsSchema,
  ClaimGuestRequestSchema,
  ChildResponseSchema,
  CreateChildRequestSchema,
  ErrorResponseSchema,
  FamilyResponseSchema,
  GuestClaimAvailabilityResponseSchema,
  SetPinRequestSchema,
} from '@bidazoo/contracts';
import type { AppContext } from '../../context';
import { createChild, getFamily, setChildArchived } from './children';
import { claimGuest, guestClaimAvailable } from './guest-claim';
import { requireGuardian } from './guardian-auth';
import { clearPin, setPin } from './pin';
import type { IdentityRuntime } from './runtime';

const failures = { '4xx': ErrorResponseSchema, '5xx': ErrorResponseSchema } as const;

/** Family and child-profile management. Every route needs guardian authority. */
export function registerFamilyRoutes(app: FastifyInstance, ctx: AppContext, runtime: IdentityRuntime): void {
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

  // Attach THIS browser's existing guest player to a new child profile. The player comes only
  // from the guest cookie; the body is a nickname. 201 when created, 200 for an idempotent retry.
  typed.post(
    ApiPaths.familyChildrenFromGuest,
    { schema: { body: ClaimGuestRequestSchema, response: { 200: ChildResponseSchema, 201: ChildResponseSchema, ...failures } } },
    async (request, reply) => {
      const guardian = await requireGuardian(ctx, request);
      const result = await claimGuest(ctx, guardian, request, request.body.nickname);
      // The guest credential is spent either way: remove it, with the attributes it was set with.
      void reply.clearCookie(ctx.cookie.name, { path: '/', httpOnly: true, sameSite: 'lax', secure: ctx.cookie.secure });
      return reply.code(result.created ? 201 : 200).send({ child: result.child });
    },
  );

  // Does this browser hold a guest player a guardian could keep? A bare boolean, read-only: no
  // identifiers, no reason for a "no", no audit row. Same guardian authority as the claim itself.
  typed.get(
    ApiPaths.familyGuestClaim,
    { schema: { response: { 200: GuestClaimAvailabilityResponseSchema, ...failures } } },
    async (request) => {
      await requireGuardian(ctx, request);
      return { available: await guestClaimAvailable(ctx, request) };
    },
  );

  // Set / reset / remove a profile PIN: guardian authority only. The PIN is a local profile-switch
  // lock; it is never a login or recovery credential.
  typed.post(
    ApiPaths.familyChildPin(':childId'),
    { schema: { params: ChildParamsSchema, body: SetPinRequestSchema, response: { 200: ChildResponseSchema, ...failures } } },
    async (request) => ({
      child: await setPin(ctx, runtime, await requireGuardian(ctx, request), request.params.childId, request.body.pin),
    }),
  );
  typed.delete(
    ApiPaths.familyChildPin(':childId'),
    { schema: { params: ChildParamsSchema, response: { 200: ChildResponseSchema, ...failures } } },
    async (request) => ({ child: await clearPin(ctx, await requireGuardian(ctx, request), request.params.childId) }),
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
