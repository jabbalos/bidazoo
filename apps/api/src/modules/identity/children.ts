import { and, eq } from 'drizzle-orm';
import { childProfiles, guardians, players } from '@bidazoo/database/schema';
import type { ChildProfile, FamilyResponse } from '@bidazoo/contracts';
import type { AppContext } from '../../context';
import { errors } from '../../http/errors';
import { recordAudit } from './audit';
import { listChildren, toChildProfile } from './family';
import type { GuardianContext } from './guardian-auth';

/** A family as its guardian sees it: their own address and every profile (archived included). */
export async function getFamily(ctx: AppContext, guardian: GuardianContext): Promise<FamilyResponse> {
  const [row] = await ctx.db.select({ email: guardians.email }).from(guardians).where(eq(guardians.id, guardian.guardianId));
  if (!row) throw errors.forbidden();
  return { guardianEmail: row.email, children: await listChildren(ctx.db, guardian.familyId, true) };
}

/**
 * Creates a child profile with a brand-new player (no history). The profile needs no email.
 * Never accepts a player id: the only way to attach an EXISTING player is the guest claim.
 */
export async function createChild(ctx: AppContext, guardian: GuardianContext, nickname: string): Promise<ChildProfile> {
  const now = ctx.clock.now();
  return ctx.db.transaction(async (tx) => {
    const [player] = await tx.insert(players).values({ nickname, createdAt: now }).returning({ id: players.id });
    if (!player) throw new Error('player insert returned no row');
    const [child] = await tx
      .insert(childProfiles)
      .values({ familyId: guardian.familyId, playerId: player.id, nickname, createdByGuardianId: guardian.guardianId, createdAt: now })
      .returning();
    if (!child) throw new Error('child insert returned no row');
    await recordAudit(tx, ctx.clock, {
      actorType: 'guardian', actorId: guardian.guardianId, action: 'child.created', familyId: guardian.familyId,
      subjectType: 'child', subjectId: child.id, meta: { method: 'new' },
    });
    return toChildProfile(child);
  });
}

/**
 * Archive or restore a profile of THIS family. Idempotent. Archiving never touches the player,
 * attempts, mastery or ledger: it only stops the profile from being playable. A profile of
 * another family looks exactly like a missing one (404).
 */
export async function setChildArchived(
  ctx: AppContext,
  guardian: GuardianContext,
  childId: string,
  archived: boolean,
): Promise<ChildProfile> {
  const now = ctx.clock.now();
  return ctx.db.transaction(async (tx) => {
    const [child] = await tx
      .select()
      .from(childProfiles)
      .where(and(eq(childProfiles.id, childId), eq(childProfiles.familyId, guardian.familyId)))
      .for('update');
    if (!child) throw errors.notFound();
    if ((child.archivedAt !== null) === archived) return toChildProfile(child);
    const [updated] = await tx
      .update(childProfiles)
      .set({ archivedAt: archived ? now : null })
      .where(eq(childProfiles.id, child.id))
      .returning();
    if (!updated) throw new Error('child update returned no row');
    await recordAudit(tx, ctx.clock, {
      actorType: 'guardian', actorId: guardian.guardianId, action: archived ? 'child.archived' : 'child.restored',
      familyId: guardian.familyId, subjectType: 'child', subjectId: child.id,
    });
    return toChildProfile(updated);
  });
}
