import type { FastifyRequest } from 'fastify';
import type { AppContext } from '../../context';
import { errors } from '../../http/errors';
import { currentDevice } from './guardian-auth';
import { findGuestByToken, type GuestIdentity } from './service';

/**
 * The single place that decides WHICH EXISTING PLAYER a request acts as. Learning, rewards and
 * mastery stay keyed by player_id exactly as before; this only chooses the player.
 *
 * Precedence (identity configured):
 *  1. a valid trusted device with an active, non-archived child profile -> that child's player;
 *  2. otherwise a valid guest cookie -> that guest (unchanged behaviour);
 *  3. otherwise a valid trusted device with neither -> 409 `profile_required`;
 *  4. otherwise nobody (null). Creating a guest is NEVER done here; only POST /guest may.
 *
 * With identity off (`ctx.identity` undefined) the device cookie is not even read: this is
 * exactly the guest-only lookup. Request bodies never supply a player id.
 */
export async function resolvePlayer(ctx: AppContext, request: FastifyRequest): Promise<GuestIdentity | null> {
  const device = ctx.identity ? await currentDevice(ctx, request) : null;
  if (device?.activeChild) {
    return { playerId: device.activeChild.playerId, nickname: device.activeChild.nickname };
  }
  const guest = await findGuestByToken(ctx, request.cookies[ctx.cookie.name]);
  if (guest) return guest;
  if (device) throw errors.profileRequired();
  return null;
}
