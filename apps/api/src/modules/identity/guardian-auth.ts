import type { FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { guardians } from '@bidazoo/database/schema';
import type { AppContext } from '../../context';
import { errors } from '../../http/errors';
import { deviceCookieName, findDeviceByToken, type DeviceContext } from './devices';

export interface GuardianContext extends DeviceContext {
  guardianId: string;
}

/** The trusted device making this request, or null. Reads only the device cookie. */
export async function currentDevice(ctx: AppContext, request: FastifyRequest): Promise<DeviceContext | null> {
  return findDeviceByToken(ctx, request.cookies[deviceCookieName(ctx.cookie.secure)]);
}

/** Any trusted device (guardian authority not required). 401 when there is none. */
export async function requireDevice(ctx: AppContext, request: FastifyRequest): Promise<DeviceContext> {
  const device = await currentDevice(ctx, request);
  if (!device) throw errors.unauthenticated();
  return device;
}

/**
 * Guardian authority: a trusted device that a guardian signed in on, inside the authority window.
 * No device = 401. A device without current authority (a child device, or an expired window) =
 * 403, and the same guardian re-authorizes by email link. The guardian row is re-checked so a
 * deleted guardian can never keep acting.
 */
export async function requireGuardian(ctx: AppContext, request: FastifyRequest): Promise<GuardianContext> {
  const device = await requireDevice(ctx, request);
  if (!device.guardianAuthority || device.guardianId === null) throw errors.forbidden();
  const [row] = await ctx.db.select({ id: guardians.id }).from(guardians).where(eq(guardians.id, device.guardianId));
  if (!row) throw errors.forbidden();
  return { ...device, guardianId: device.guardianId };
}
