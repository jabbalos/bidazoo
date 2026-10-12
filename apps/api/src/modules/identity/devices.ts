import { and, eq, gt, isNull } from 'drizzle-orm';
import { childProfiles, deviceSessions } from '@bidazoo/database/schema';
import type { DeviceStateResponse, DeviceSummary } from '@bidazoo/contracts';
import type { AppContext, Executor } from '../../context';
import { newToken } from './crypto';
import { listChildren } from './family';
import type { IdentityRuntime } from './runtime';
import { hashToken, isWellFormedToken } from './service';

/**
 * Trusted device sessions.
 *
 * A device is one browser the family authorized. It holds a random opaque token in an HttpOnly
 * cookie (never in localStorage, never a bearer header); only the SHA-256 hash is stored. Each
 * device can be revoked on its own, and a revoked device can never be revived (database trigger).
 *
 * A new device session is ALWAYS issued with a fresh token, including when a guardian signs in on
 * a browser that already has one (the old row is retired, "replaced"): the identifier never
 * survives a privilege change.
 */

/** The device cookie name. Same `__Host-` rule as the guest cookie under HTTPS or production. */
export function deviceCookieName(secure: boolean): string {
  return secure ? '__Host-bidazoo_device' : 'bidazoo_device';
}

export function deviceCookieOptions(ctx: AppContext, runtime: IdentityRuntime) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: ctx.cookie.secure,
    path: '/',
    maxAge: runtime.config.deviceSessionDays * 24 * 60 * 60,
  };
}

/** Refresh last_seen_at at most this often, to avoid a write on every request. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export interface ActiveChild {
  id: string;
  playerId: string;
  nickname: string;
}

export interface DeviceContext {
  sessionId: string;
  familyId: string;
  guardianId: string | null;
  /** True only while `authority_expires_at` is in the future. */
  guardianAuthority: boolean;
  authorityExpiresAt: Date | null;
  label: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  /** The profile this device plays as. Null when none is chosen, or the chosen one is archived. */
  activeChild: ActiveChild | null;
}

/** Display-only label: NFKC, control characters removed, spaces collapsed, at most 40 characters. */
export function cleanLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const label = raw
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim();
  return label === '' ? null : label;
}

export interface IssueDeviceInput {
  familyId: string;
  /** Set only for a guardian-authorized device. Grants the short guardian-authority window. */
  guardianId: string | null;
  origin: 'email_link' | 'device_code';
  label: string | null;
  activeChildProfileId: string | null;
}

/** Creates a device session. Returns the raw token ONCE; only its hash is stored. */
export async function issueDeviceSession(
  ctx: AppContext,
  runtime: IdentityRuntime,
  executor: Executor,
  input: IssueDeviceInput,
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const token = newToken();
  const now = ctx.clock.now();
  const expiresAt = new Date(now.getTime() + runtime.config.deviceSessionDays * 86_400_000);
  const authorityExpiresAt =
    input.guardianId === null ? null : new Date(now.getTime() + runtime.config.guardianAuthorityHours * 3_600_000);
  const [row] = await executor
    .insert(deviceSessions)
    .values({
      familyId: input.familyId,
      guardianId: input.guardianId,
      activeChildProfileId: input.activeChildProfileId,
      tokenHash: hashToken(token),
      origin: input.origin,
      label: input.label,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      authorityExpiresAt,
    })
    .returning({ id: deviceSessions.id });
  if (!row) throw new Error('device session insert returned no row');
  return { id: row.id, token, expiresAt };
}

/** Resolves a device cookie token, or null if it is missing, malformed, unknown, expired or revoked. */
export async function findDeviceByToken(
  ctx: AppContext,
  token: unknown,
  executor: Executor = ctx.db,
): Promise<DeviceContext | null> {
  if (!isWellFormedToken(token)) return null;
  const now = ctx.clock.now();
  const [row] = await executor
    .select({
      session: deviceSessions,
      childId: childProfiles.id,
      childPlayerId: childProfiles.playerId,
      childNickname: childProfiles.nickname,
      childArchivedAt: childProfiles.archivedAt,
    })
    .from(deviceSessions)
    .leftJoin(childProfiles, eq(childProfiles.id, deviceSessions.activeChildProfileId))
    .where(
      and(eq(deviceSessions.tokenHash, hashToken(token)), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, now)),
    );
  if (!row) return null;
  const s = row.session;
  if (now.getTime() - s.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await executor.update(deviceSessions).set({ lastSeenAt: now }).where(eq(deviceSessions.id, s.id));
  }
  const activeChild: ActiveChild | null =
    row.childId !== null && row.childPlayerId !== null && row.childNickname !== null && row.childArchivedAt === null
      ? { id: row.childId, playerId: row.childPlayerId, nickname: row.childNickname }
      : null;
  return {
    sessionId: s.id,
    familyId: s.familyId,
    guardianId: s.guardianId,
    guardianAuthority: s.guardianId !== null && s.authorityExpiresAt !== null && s.authorityExpiresAt > now,
    authorityExpiresAt: s.authorityExpiresAt,
    label: s.label,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
    expiresAt: s.expiresAt,
    activeChild,
  };
}

export function toDeviceSummary(
  row: { id: string; label: string | null; createdAt: Date; lastSeenAt: Date; expiresAt: Date },
  options: { current: boolean; activeChildNickname: string | null },
): DeviceSummary {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    current: options.current,
    activeChildNickname: options.activeChildNickname,
  };
}

/** What a trusted device may see about itself. Never a token, hash, or player id. */
export async function buildDeviceState(
  ctx: AppContext,
  device: DeviceContext,
  executor: Executor = ctx.db,
): Promise<DeviceStateResponse> {
  return {
    device: toDeviceSummary(
      { id: device.sessionId, label: device.label, createdAt: device.createdAt, lastSeenAt: device.lastSeenAt, expiresAt: device.expiresAt },
      { current: true, activeChildNickname: device.activeChild?.nickname ?? null },
    ),
    guardianAuthority: device.guardianAuthority,
    authorityExpiresAt: device.guardianAuthority && device.authorityExpiresAt ? device.authorityExpiresAt.toISOString() : null,
    children: await listChildren(executor, device.familyId, false),
    activeChildId: device.activeChild?.id ?? null,
  };
}
