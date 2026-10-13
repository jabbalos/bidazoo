import type { FastifyRequest } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { childProfiles, deviceSessions, guestSessions, players } from '@bidazoo/database/schema';
import type { ChildProfile } from '@bidazoo/contracts';
import type { AppContext } from '../../context';
import { errors } from '../../http/errors';
import { recordAudit } from './audit';
import { toChildProfile } from './family';
import type { GuardianContext } from './guardian-auth';
import { hashToken, isWellFormedToken } from './service';

export interface GuestClaimResult {
  child: ChildProfile;
  /** True when this call created the profile; false for an idempotent replay. */
  created: boolean;
}

/**
 * Attaches the EXISTING guest player of this browser to a new child profile of the guardian's family.
 *
 *   existing guest player_id  ->  becomes owned by  ->  a new child_profile
 *
 * Nothing about the player or its learning history is touched: no new player, no copied or moved
 * rows, no ledger, mastery, attempt or session writes. The only rows changed are the child
 * profile (inserted), this device's active profile, and the player's guest sessions (revoked).
 *
 * The player is identified ONLY by the guest cookie of this very request. The body carries just a
 * nickname, so a guardian can never name a player, guest, family or guardian.
 *
 * Everything is one transaction (a failure leaves no profile, no revoked session, no audit row).
 * The player row is locked first, so two simultaneous claims run one after the other; the
 * unique(player_id) constraint on child_profiles is the final backstop.
 */
export async function claimGuest(
  ctx: AppContext,
  guardian: GuardianContext,
  request: FastifyRequest,
  nickname: string,
): Promise<GuestClaimResult> {
  const token = request.cookies[ctx.cookie.name];
  if (!isWellFormedToken(token)) throw errors.unauthenticated();
  const tokenHash = hashToken(token);
  const now = ctx.clock.now();

  return ctx.db.transaction(async (tx) => {
    const [found] = await tx
      .select({ playerId: guestSessions.playerId })
      .from(guestSessions)
      .where(eq(guestSessions.tokenHash, tokenHash));
    if (!found) throw errors.unauthenticated();

    // Serialize every claim of this player, whichever guest session or family it comes from.
    const [player] = await tx.select({ id: players.id }).from(players).where(eq(players.id, found.playerId)).for('no key update');
    if (!player) throw errors.unauthenticated();

    // Re-read under the lock: the session may have been revoked, or the player claimed, meanwhile.
    const [session] = await tx
      .select()
      .from(guestSessions)
      .where(eq(guestSessions.tokenHash, tokenHash));
    const [existing] = await tx.select().from(childProfiles).where(eq(childProfiles.playerId, player.id));

    if (existing) {
      // Already claimed. The same family gets its profile back (safe retry); anyone else is told
      // only that the player is taken. Nothing is written either way.
      if (existing.familyId !== guardian.familyId) throw errors.alreadyClaimed();
      return { child: toChildProfile(existing), created: false };
    }

    // An unclaimed player: the cookie must be a LIVE guest session. A revoked or expired one is
    // just a stale string and claims nothing.
    if (!session || session.revokedAt !== null || session.expiresAt <= now) throw errors.unauthenticated();

    const [child] = await tx
      .insert(childProfiles)
      .values({
        familyId: guardian.familyId,
        playerId: player.id,
        nickname,
        createdByGuardianId: guardian.guardianId,
        createdAt: now,
      })
      .returning();
    if (!child) throw new Error('child insert returned no row');

    await tx
      .update(guestSessions)
      .set({ revokedAt: now })
      .where(and(eq(guestSessions.playerId, player.id), isNull(guestSessions.revokedAt)));

    // This device becomes this child. If it was revoked a moment ago the whole claim rolls back.
    const switched = await tx
      .update(deviceSessions)
      .set({ activeChildProfileId: child.id })
      .where(and(eq(deviceSessions.id, guardian.sessionId), isNull(deviceSessions.revokedAt)))
      .returning({ id: deviceSessions.id });
    if (switched.length === 0) throw errors.unauthenticated();

    await recordAudit(tx, ctx.clock, {
      actorType: 'guardian', actorId: guardian.guardianId, action: 'guest.claimed', familyId: guardian.familyId,
      subjectType: 'child', subjectId: child.id, meta: { method: 'guest_cookie' },
    });
    return { child: toChildProfile(child), created: true };
  });
}

/**
 * Is the guest player held by THIS browser's guest cookie claimable right now? A pure read.
 *
 * True only when the cookie is a well-formed, known, unrevoked, unexpired guest session AND its
 * player has no child profile yet (the same conditions under which claimGuest would create one).
 * Everything else is the same plain `false`: no cookie, a stale, expired, revoked or unknown one,
 * a player already claimed by this family or another. It returns no identifier and writes nothing:
 * no audit row, no session touch, no active-child change.
 *
 * It looks only at the guest cookie of this request, never at the device's selected child, so a
 * guest player stays discoverable while another child is active on the device.
 */
export async function guestClaimAvailable(ctx: AppContext, request: FastifyRequest): Promise<boolean> {
  const token = request.cookies[ctx.cookie.name];
  if (!isWellFormedToken(token)) return false;
  const now = ctx.clock.now();
  const [session] = await ctx.db
    .select({ playerId: guestSessions.playerId, revokedAt: guestSessions.revokedAt, expiresAt: guestSessions.expiresAt })
    .from(guestSessions)
    .where(eq(guestSessions.tokenHash, hashToken(token)));
  if (!session || session.revokedAt !== null || session.expiresAt <= now) return false;
  const [claimed] = await ctx.db.select({ id: childProfiles.id }).from(childProfiles).where(eq(childProfiles.playerId, session.playerId));
  return !claimed;
}
