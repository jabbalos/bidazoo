import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { errors } from '../../http/errors';
import type { AppContext, ModuleOptions } from '../../context';
import { createGuest, findGuestByToken, type GuestIdentity } from './service';
import { registerIdentityRoutes } from './routes';

/**
 * identity module — Guest player identity (Checkpoint B).
 *
 * The browser receives an opaque session cookie: HttpOnly, SameSite=Lax, Secure under
 * HTTPS/production. No bearer token is ever exposed to JavaScript or stored in localStorage.
 * Parent accounts and the jonabalos.com Accounts service are intentionally not integrated yet.
 */
export const identityModule: FastifyPluginAsync<ModuleOptions> = async (app, options) => {
  if (!options.ctx) return;
  registerIdentityRoutes(app, options.ctx);
};

/** Used by other modules (plain function call inside the monolith). Throws 401 if not a guest. */
export async function requireGuest(ctx: AppContext, request: FastifyRequest): Promise<GuestIdentity> {
  const guest = await findGuestByToken(ctx, request.cookies[ctx.cookie.name]);
  if (!guest) throw errors.unauthenticated();
  return guest;
}

export { createGuest, findGuestByToken };
export type { GuestIdentity };
