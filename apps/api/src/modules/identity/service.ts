import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { guestSessions, players } from '@bidazoo/database/schema';
import type { AppContext, Executor } from '../../context';

/** Browser identity for guests: an opaque random token in an HttpOnly cookie. */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Refresh last_seen_at at most this often, to avoid a write on every request. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isWellFormedToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

export interface GuestIdentity {
  playerId: string;
  nickname: string;
}

/** Resolves a cookie token to its player, or null if it is missing, malformed, expired or revoked. */
export async function findGuestByToken(
  ctx: AppContext,
  token: unknown,
  executor: Executor = ctx.db,
): Promise<GuestIdentity | null> {
  if (!isWellFormedToken(token)) return null;
  const now = ctx.clock.now();
  const [row] = await executor
    .select({
      sessionId: guestSessions.id,
      lastSeenAt: guestSessions.lastSeenAt,
      playerId: players.id,
      nickname: players.nickname,
    })
    .from(guestSessions)
    .innerJoin(players, eq(players.id, guestSessions.playerId))
    .where(
      and(
        eq(guestSessions.tokenHash, hashToken(token)),
        gt(guestSessions.expiresAt, now),
        isNull(guestSessions.revokedAt),
      ),
    );
  if (!row) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await executor.update(guestSessions).set({ lastSeenAt: now }).where(eq(guestSessions.id, row.sessionId));
  }
  return { playerId: row.playerId, nickname: row.nickname };
}

function makeNickname(): string {
  return `Guest-${randomBytes(3).toString('hex')}`;
}

/** Creates a brand-new guest player and a session for it. Returns the raw token ONCE. */
export async function createGuest(ctx: AppContext): Promise<GuestIdentity & { token: string }> {
  const token = randomBytes(32).toString('base64url');
  const now = ctx.clock.now();
  const expiresAt = new Date(now.getTime() + ctx.cookie.maxAgeSeconds * 1000);
  const nickname = makeNickname();
  const playerId = await ctx.db.transaction(async (tx) => {
    const [player] = await tx.insert(players).values({ nickname, createdAt: now }).returning({ id: players.id });
    if (!player) throw new Error('player insert returned no row');
    await tx.insert(guestSessions).values({
      playerId: player.id,
      tokenHash: hashToken(token),
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
    });
    return player.id;
  });
  return { playerId, nickname, token };
}
