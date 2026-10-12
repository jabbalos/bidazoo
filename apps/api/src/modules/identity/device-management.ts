import { and, asc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { childProfiles, deviceAuthCodes, deviceSessions } from '@bidazoo/database/schema';
import type { DeviceStateResponse, DeviceSummary, DeviceCodeResponse } from '@bidazoo/contracts';
import type { FastifyRequest } from 'fastify';
import type { AppContext } from '../../context';
import { ApiError, errors } from '../../http/errors';
import { recordAudit } from './audit';
import { hashHumanCode, newHumanCode } from './crypto';
import { buildDeviceState, cleanLabel, findDeviceByToken, issueDeviceSession, toDeviceSummary, type DeviceContext } from './devices';
import type { GuardianContext } from './guardian-auth';
import type { IdentityRuntime } from './runtime';
import { verifyPinForSwitch } from './pin';
import { clientSubject, enforce, hit } from './throttle';

/** Unused, unexpired device codes one family may hold at once. */
const MAX_OPEN_CODES = 10;

/**
 * Choose which of the family's profiles this device plays as. Needs a trusted device, not guardian
 * authority.
 *
 * The profile is looked up scoped to the device's OWN family and must be playable, BEFORE any PIN
 * work. A profile of another family, an archived one and a made-up id are all the same 404, so a
 * foreign id reveals nothing (existence, ownership, PIN state) and never reaches PIN verification.
 * A profile with no PIN switches with no further step.
 */
export async function selectProfile(
  ctx: AppContext,
  runtime: IdentityRuntime,
  device: DeviceContext,
  childProfileId: string,
  pin: string | undefined,
): Promise<DeviceStateResponse> {
  const [child] = await ctx.db
    .select()
    .from(childProfiles)
    .where(and(eq(childProfiles.id, childProfileId), eq(childProfiles.familyId, device.familyId), isNull(childProfiles.archivedAt)));
  if (!child) throw errors.notFound();
  // A profile without a PIN switches with no further step. With a PIN, the correct PIN is required:
  // counted per device first (429 when over), then checked against the profile's durable lockout.
  if (child.pinHash !== null) {
    if (pin === undefined) throw errors.pinIncorrect(); // carries no guess, so it is not counted
    await enforce(ctx, runtime, 'pin_device', runtime.config.limits.pinDevice, device.sessionId);
    await verifyPinForSwitch(ctx, runtime, device.familyId, child.id, pin);
  }
  await ctx.db.update(deviceSessions).set({ activeChildProfileId: child.id }).where(eq(deviceSessions.id, device.sessionId));
  return buildDeviceState(ctx, { ...device, activeChild: { id: child.id, playerId: child.playerId, nickname: child.nickname } });
}

/** The family's live devices (not revoked, not expired), newest first. */
export async function listDevices(ctx: AppContext, guardian: GuardianContext): Promise<DeviceSummary[]> {
  const now = ctx.clock.now();
  const rows = await ctx.db
    .select({
      id: deviceSessions.id,
      label: deviceSessions.label,
      createdAt: deviceSessions.createdAt,
      lastSeenAt: deviceSessions.lastSeenAt,
      expiresAt: deviceSessions.expiresAt,
      childNickname: childProfiles.nickname,
    })
    .from(deviceSessions)
    .leftJoin(childProfiles, eq(childProfiles.id, deviceSessions.activeChildProfileId))
    .where(and(eq(deviceSessions.familyId, guardian.familyId), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, now)))
    .orderBy(asc(deviceSessions.createdAt), asc(deviceSessions.id));
  return rows.map((row) =>
    toDeviceSummary(row, { current: row.id === guardian.sessionId, activeChildNickname: row.childNickname }),
  );
}

/** Revokes one device of this family. Idempotent. Another family's device is a 404. */
export async function revokeDevice(
  ctx: AppContext,
  guardian: GuardianContext,
  deviceId: string,
): Promise<{ revoked: number; current: boolean }> {
  const now = ctx.clock.now();
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: deviceSessions.id })
      .from(deviceSessions)
      .where(and(eq(deviceSessions.id, deviceId), eq(deviceSessions.familyId, guardian.familyId)))
      .for('update');
    if (!row) throw errors.notFound();
    const done = await tx
      .update(deviceSessions)
      .set({ revokedAt: now })
      .where(and(eq(deviceSessions.id, deviceId), isNull(deviceSessions.revokedAt)))
      .returning({ id: deviceSessions.id });
    if (done.length > 0) {
      await recordAudit(tx, ctx.clock, {
        actorType: 'guardian', actorId: guardian.guardianId, action: 'device.revoked', familyId: guardian.familyId,
        subjectType: 'device', subjectId: deviceId,
      });
    }
    return { revoked: done.length, current: deviceId === guardian.sessionId };
  });
}

/** Revokes every live device of the family. The calling device survives unless `includeCurrent`. */
export async function revokeAllDevices(
  ctx: AppContext,
  guardian: GuardianContext,
  includeCurrent: boolean,
): Promise<{ revoked: number; current: boolean }> {
  const now = ctx.clock.now();
  return ctx.db.transaction(async (tx) => {
    const done = await tx
      .update(deviceSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(deviceSessions.familyId, guardian.familyId),
          isNull(deviceSessions.revokedAt),
          includeCurrent ? undefined : ne(deviceSessions.id, guardian.sessionId),
        ),
      )
      .returning({ id: deviceSessions.id });
    await recordAudit(tx, ctx.clock, {
      actorType: 'guardian', actorId: guardian.guardianId, action: 'device.revoked_all', familyId: guardian.familyId,
      meta: { count: done.length, includeCurrent },
    });
    return { revoked: done.length, current: includeCurrent };
  });
}

/** A guardian creates a short-lived, single-use code that authorizes another browser as a family device. */
export async function issueDeviceCode(
  ctx: AppContext,
  runtime: IdentityRuntime,
  guardian: GuardianContext,
  childProfileId: string | undefined,
): Promise<DeviceCodeResponse> {
  const now = ctx.clock.now();
  return ctx.db.transaction(async (tx) => {
    if (childProfileId) {
      const [child] = await tx
        .select({ id: childProfiles.id })
        .from(childProfiles)
        .where(and(eq(childProfiles.id, childProfileId), eq(childProfiles.familyId, guardian.familyId), isNull(childProfiles.archivedAt)));
      if (!child) throw errors.notFound();
    }
    const [open] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(deviceAuthCodes)
      .where(and(eq(deviceAuthCodes.familyId, guardian.familyId), isNull(deviceAuthCodes.usedAt), gt(deviceAuthCodes.expiresAt, now)));
    if ((open?.n ?? 0) >= MAX_OPEN_CODES) throw new ApiError(429, 'rate_limited', undefined, 60);
    const code = newHumanCode(40);
    const expiresAt = new Date(now.getTime() + runtime.config.deviceCodeMinutes * 60_000);
    await tx.insert(deviceAuthCodes).values({
      codeHash: hashHumanCode(runtime.keys, code),
      familyId: guardian.familyId,
      childProfileId: childProfileId ?? null,
      createdByGuardianId: guardian.guardianId,
      createdAt: now,
      expiresAt,
    });
    await recordAudit(tx, ctx.clock, {
      actorType: 'guardian', actorId: guardian.guardianId, action: 'device.code_issued', familyId: guardian.familyId,
    });
    return { code, expiresAt: expiresAt.toISOString() };
  });
}

/**
 * Redeems a device code on a new browser. Anonymous, so every attempt is counted first (per client
 * address, and across the whole service); only then is the code looked up. The device it creates is
 * family-wide but carries NO guardian authority. Unknown, used and expired codes look the same.
 */
export async function redeemDeviceCode(
  ctx: AppContext,
  runtime: IdentityRuntime,
  request: FastifyRequest,
  input: { code: string; deviceLabel?: string | undefined },
  presentedDeviceToken: unknown,
): Promise<{ state: DeviceStateResponse; deviceToken: string }> {
  const limits = runtime.config.limits;
  await enforce(ctx, runtime, 'device_code_ip', limits.deviceCodeIp, clientSubject(request));
  const global = await hit(ctx, runtime, 'device_code_global', limits.deviceCodeGlobal, 'all');
  if (!global.allowed) throw new ApiError(503, 'service_busy', undefined, global.retryAfterSeconds);

  const now = ctx.clock.now();
  const issued = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(deviceAuthCodes)
      .where(eq(deviceAuthCodes.codeHash, hashHumanCode(runtime.keys, input.code)))
      .for('update');
    if (!row || row.usedAt !== null || row.expiresAt <= now) return null;

    // The profile the code names, if it is still playable.
    let startChild: string | null = null;
    if (row.childProfileId) {
      const [child] = await tx
        .select({ id: childProfiles.id })
        .from(childProfiles)
        .where(and(eq(childProfiles.id, row.childProfileId), isNull(childProfiles.archivedAt)));
      startChild = child?.id ?? null;
    }
    const presented = await findDeviceByToken(ctx, presentedDeviceToken, tx);
    if (presented) await tx.update(deviceSessions).set({ revokedAt: now }).where(eq(deviceSessions.id, presented.sessionId));

    const device = await issueDeviceSession(ctx, runtime, tx, {
      familyId: row.familyId,
      guardianId: null,
      origin: 'device_code',
      label: cleanLabel(input.deviceLabel),
      activeChildProfileId: startChild,
    });
    await tx
      .update(deviceAuthCodes)
      .set({ usedAt: now, usedByDeviceSessionId: device.id })
      .where(eq(deviceAuthCodes.id, row.id));
    await recordAudit(tx, ctx.clock, {
      actorType: 'guardian', actorId: row.createdByGuardianId, action: 'device.authorized', familyId: row.familyId,
      subjectType: 'device', subjectId: device.id, meta: { origin: 'device_code', replaced: presented !== null },
    });
    return { deviceToken: device.token };
  });
  if (!issued) throw errors.linkInvalid();

  const device = await findDeviceByToken(ctx, issued.deviceToken);
  if (!device) throw new Error('a device session that was just issued could not be found');
  return { state: await buildDeviceState(ctx, device), deviceToken: issued.deviceToken };
}
