import { asc, eq, and, isNull } from 'drizzle-orm';
import { childProfiles } from '@bidazoo/database/schema';
import type { ChildProfile } from '@bidazoo/contracts';
import type { Executor } from '../../context';

/** The public shape of a child profile: never the PIN, its hash, or the player id. */
export function toChildProfile(row: typeof childProfiles.$inferSelect): ChildProfile {
  return {
    id: row.id,
    nickname: row.nickname,
    hasPin: row.pinHash !== null,
    archived: row.archivedAt !== null,
  };
}

/** A family's profiles in the order they were added. Archived ones only when asked for. */
export async function listChildren(executor: Executor, familyId: string, includeArchived: boolean): Promise<ChildProfile[]> {
  const rows = await executor
    .select()
    .from(childProfiles)
    .where(
      includeArchived
        ? eq(childProfiles.familyId, familyId)
        : and(eq(childProfiles.familyId, familyId), isNull(childProfiles.archivedAt)),
    )
    .orderBy(asc(childProfiles.createdAt), asc(childProfiles.id));
  return rows.map(toChildProfile);
}
