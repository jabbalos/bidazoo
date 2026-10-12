import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { and, eq, gt } from 'drizzle-orm';
import { Type } from 'typebox';
import { ApiPaths, ErrorResponseSchema, GuestResponseSchema } from '@bidazoo/contracts';
import { playSessions } from '@bidazoo/database/schema';
import type { AppContext } from '../../context';
import { getTotals } from '../rewards/ledger';
import { resolvePlayer } from './resolver';
import { createGuest, type GuestIdentity } from './service';
import { errors } from '../../http/errors';
import { registerFamilyRoutes } from './family-routes';
import { registerDeviceRoutes } from './device-routes';
import { registerGuardianRoutes } from './guardian-routes';
import { registerLegacyRoutes } from './legacy-routes';

const EmptyBody = Type.Object({}, { additionalProperties: false });

async function activeSessionId(ctx: AppContext, playerId: string): Promise<string | null> {
  const [row] = await ctx.db
    .select({ id: playSessions.id })
    .from(playSessions)
    .where(
      and(
        eq(playSessions.playerId, playerId),
        eq(playSessions.status, 'active'),
        gt(playSessions.expiresAt, ctx.clock.now()),
      ),
    );
  return row?.id ?? null;
}

async function profile(ctx: AppContext, guest: GuestIdentity) {
  return {
    player: { id: guest.playerId, nickname: guest.nickname },
    totals: await getTotals(ctx.db, guest.playerId),
    activeSessionId: await activeSessionId(ctx, guest.playerId),
  };
}

export function registerIdentityRoutes(app: FastifyInstance, ctx: AppContext): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  // Family identity (Checkpoint E) exists only when configured. With ctx.identity undefined none
  // of these routes is registered, so the API is exactly the guest-only build.
  if (ctx.identity) {
    registerGuardianRoutes(app, ctx, ctx.identity);
    registerFamilyRoutes(app, ctx, ctx.identity);
    registerDeviceRoutes(app, ctx, ctx.identity);
    registerLegacyRoutes(app, ctx, ctx.identity);
  }

  // Idempotent "make sure I have a guest identity". A valid cookie returns the same player, so
  // a page refresh reconnects to the same guest. Otherwise a new guest and cookie are created.
  typed.post(
    ApiPaths.guest,
    {
      schema: {
        body: EmptyBody,
        response: { 200: GuestResponseSchema, '4xx': ErrorResponseSchema, '5xx': ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      // A trusted device with a chosen child answers as that child (no guest is created); a device
      // with no child and no guest gets 409 profile_required rather than a silently new guest.
      let guest = await resolvePlayer(ctx, request);
      if (!guest) {
        // A refresh with a valid cookie never reaches here, so it never counts against creation
        // limits. This check precedes the first write: a throttled request creates nothing.
        await app.admitGuestCreation(request);
        const created = await createGuest(ctx);
        void reply.setCookie(ctx.cookie.name, created.token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: ctx.cookie.secure,
          path: '/',
          maxAge: ctx.cookie.maxAgeSeconds,
        });
        guest = { playerId: created.playerId, nickname: created.nickname };
      }
      return reply.code(200).send(await profile(ctx, guest));
    },
  );

  typed.get(
    ApiPaths.me,
    { schema: { response: { 200: GuestResponseSchema, '4xx': ErrorResponseSchema, '5xx': ErrorResponseSchema } } },
    async (request, reply) => {
      const guest = await resolvePlayer(ctx, request);
      if (!guest) throw errors.unauthenticated();
      return reply.code(200).send(await profile(ctx, guest));
    },
  );
}
