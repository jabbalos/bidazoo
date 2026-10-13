import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { errors } from '../../http/errors';
import type { AppContext, ModuleOptions } from '../../context';
import { resolvePlayer } from './resolver';
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
  const guest = await resolvePlayer(ctx, request);
  if (!guest) throw errors.unauthenticated();
  return guest;
}

export { createGuest, findGuestByToken };
export type { GuestIdentity };

// Family identity (Checkpoint E): wiring and test support.
export { DEFAULT_IDENTITY_LIMITS, loadIdentityConfig } from './config';
export type { IdentityConfig, IdentityLimits } from './config';
export { createIdentityRuntime } from './runtime';
export type { IdentityRuntime } from './runtime';
export { FakeMailer, MailDeliveryError, MailDispatcher, createMailer, logMailFailure } from './mail';
export type { MailFailure, MailFailureCategory, MailMessage, Mailer } from './mail';
export { SmtpMailer, classifyMailError } from './mail-smtp';
export type { SmtpSecurity, SmtpSettings, SmtpTransportLike } from './mail-smtp';
export { guardianLoginEmail } from './mail-content';
export { deviceCookieName } from './devices';
export { normalizeEmail } from './email';
export {
  ManifestError, hashLegacyClaimCode, issueLegacyClaimCode, legacyMatchFor, loadLegacyManifest,
  parseLegacyManifest, revokeLegacyClaimCodes,
} from './legacy-manifest';
export { deriveIdentityKeys } from './crypto';
export { AUDIT_ACTIONS } from './audit';
export type { AuditAction } from './audit';
export { hashHumanCode } from './crypto';
export { hashToken } from './service';
export { legacyMatchHmac } from './legacy-manifest';
export { MANIFEST_DELETE_REMINDER, MANIFEST_SENSITIVE_NOTICE, broadReadWarning } from './sensitive-input';
export { describeErrorForLog } from '../../http/log-safe';
