import type { FastifyInstance, FastifyReply } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  ApiPaths,
  DeviceCodeRequestSchema,
  DeviceCodeResponseSchema,
  DeviceParamsSchema,
  DeviceStateResponseSchema,
  DevicesResponseSchema,
  ErrorResponseSchema,
  RedeemDeviceCodeRequestSchema,
  RevokeAllRequestSchema,
  RevokeResponseSchema,
  SwitchProfileRequestSchema,
} from '@bidazoo/contracts';
import type { AppContext } from '../../context';
import {
  issueDeviceCode, listDevices, redeemDeviceCode, revokeAllDevices, revokeDevice, selectProfile,
} from './device-management';
import { buildDeviceState, deviceCookieName, deviceCookieOptions } from './devices';
import { requireDevice, requireGuardian } from './guardian-auth';
import type { IdentityRuntime } from './runtime';

const failures = { '4xx': ErrorResponseSchema, '5xx': ErrorResponseSchema } as const;

/** Trusted-device routes. Registered only when identity is enabled. */
export function registerDeviceRoutes(app: FastifyInstance, ctx: AppContext, runtime: IdentityRuntime): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const cookieName = deviceCookieName(ctx.cookie.secure);

  // Same attributes as when it was set, so the browser actually removes it (and __Host- stays valid).
  const clearDeviceCookie = (reply: FastifyReply): void => {
    void reply.clearCookie(cookieName, { path: '/', httpOnly: true, sameSite: 'lax', secure: ctx.cookie.secure });
  };

  // What this device may see about itself. 401 for no/revoked/expired device.
  typed.get(ApiPaths.device, { schema: { response: { 200: DeviceStateResponseSchema, ...failures } } }, async (request) =>
    buildDeviceState(ctx, await requireDevice(ctx, request)),
  );

  // Choose which profile this device plays as. The request names a profile of THIS family; it can
  // never name a player. A PIN-protected profile also needs its PIN (the only place a PIN is checked).
  typed.post(
    ApiPaths.deviceProfile,
    { schema: { body: SwitchProfileRequestSchema, response: { 200: DeviceStateResponseSchema, ...failures } } },
    async (request) =>
      selectProfile(ctx, runtime, await requireDevice(ctx, request), request.body.childProfileId, request.body.pin),
  );

  typed.get(ApiPaths.devices, { schema: { response: { 200: DevicesResponseSchema, ...failures } } }, async (request) => ({
    devices: await listDevices(ctx, await requireGuardian(ctx, request)),
  }));

  typed.post(
    ApiPaths.deviceRevoke(':deviceId'),
    { schema: { params: DeviceParamsSchema, response: { 200: RevokeResponseSchema, ...failures } } },
    async (request, reply) => {
      const result = await revokeDevice(ctx, await requireGuardian(ctx, request), request.params.deviceId);
      if (result.current) clearDeviceCookie(reply);
      return { revoked: result.revoked };
    },
  );

  // Declared after the parameterised route is fine: find-my-way prefers the static segment.
  typed.post(
    ApiPaths.devicesRevokeAll,
    { schema: { body: RevokeAllRequestSchema, response: { 200: RevokeResponseSchema, ...failures } } },
    async (request, reply) => {
      const result = await revokeAllDevices(ctx, await requireGuardian(ctx, request), request.body.includeCurrent === true);
      if (result.current) clearDeviceCookie(reply);
      return { revoked: result.revoked };
    },
  );

  typed.post(
    ApiPaths.deviceCodes,
    { schema: { body: DeviceCodeRequestSchema, response: { 201: DeviceCodeResponseSchema, ...failures } } },
    async (request, reply) =>
      reply.code(201).send(await issueDeviceCode(ctx, runtime, await requireGuardian(ctx, request), request.body.childProfileId)),
  );

  typed.post(
    ApiPaths.deviceCodesRedeem,
    { schema: { body: RedeemDeviceCodeRequestSchema, response: { 200: DeviceStateResponseSchema, ...failures } } },
    async (request, reply) => {
      const result = await redeemDeviceCode(ctx, runtime, request, request.body, request.cookies[cookieName]);
      void reply.setCookie(cookieName, result.deviceToken, deviceCookieOptions(ctx, runtime));
      return reply.code(200).send(result.state);
    },
  );
}
