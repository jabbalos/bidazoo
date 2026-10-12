import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  ApiPaths,
  ConsumeLinkRequestSchema,
  DeviceStateResponseSchema,
  EmailLinkAcceptedSchema,
  EmailLinkRequestSchema,
  ErrorResponseSchema,
} from '@bidazoo/contracts';
import type { AppContext } from '../../context';
import { deviceCookieName, deviceCookieOptions } from './devices';
import { consumeEmailLink, requestEmailLink } from './guardians';
import type { IdentityRuntime } from './runtime';

const failures = { '4xx': ErrorResponseSchema, '5xx': ErrorResponseSchema } as const;

/** Guardian sign-in routes. Registered only when identity is enabled. */
export function registerGuardianRoutes(app: FastifyInstance, ctx: AppContext, runtime: IdentityRuntime): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const cookieName = deviceCookieName(ctx.cookie.secure);

  // "Email me a sign-in link." The same 202 for every address; says nothing about whether it exists.
  typed.post(
    ApiPaths.guardianEmailLinks,
    { schema: { body: EmailLinkRequestSchema, response: { 202: EmailLinkAcceptedSchema, ...failures } } },
    async (request, reply) => {
      await requestEmailLink(ctx, runtime, request, request.body.email);
      return reply.code(202).send({ accepted: true });
    },
  );

  // Redeem the emailed link (a POST, so a mail scanner that merely GETs the link cannot spend it).
  typed.post(
    ApiPaths.guardianEmailLinkConsume,
    { schema: { body: ConsumeLinkRequestSchema, response: { 200: DeviceStateResponseSchema, ...failures } } },
    async (request, reply) => {
      const result = await consumeEmailLink(ctx, runtime, request, request.body, request.cookies[cookieName]);
      void reply.setCookie(cookieName, result.deviceToken, deviceCookieOptions(ctx, runtime));
      return reply.code(200).send(result.state);
    },
  );
}
