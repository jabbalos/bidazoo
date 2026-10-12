import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { childProfiles } from '@bidazoo/database/schema';
import type { AppContext } from '../../context';
import { errors } from '../../http/errors';
import { recordAudit } from './audit';
import { hmacHex } from './crypto';
import type { IdentityKeys } from './crypto';
import type { GuardianContext } from './guardian-auth';
import { toChildProfile } from './family';
import type { ChildProfile } from '@bidazoo/contracts';
import type { IdentityRuntime } from './runtime';

/**
 * Optional profile PIN: a local profile-switch lock on an ALREADY TRUSTED device, nothing more.
 *
 * It never authenticates a guardian, creates a device, signs anyone in or recovers anything. The
 * only code that checks it is `verifyPinForSwitch`, called from the profile-switch route after
 * the trusted-device check. No other endpoint accepts a PIN (their request schemas are strict).
 *
 * Hashing: scrypt (N=16384, r=8, p=1, 16-byte random salt) over an HMAC of the PIN keyed from
 * IDENTITY_SECRET and bound to the profile id. The keyed pre-step means a database leak alone
 * cannot brute-force a four-digit PIN, and binding to the profile id means a hash cannot be
 * copied to another profile. Nothing is shared with Hop Quest. Rotating IDENTITY_SECRET makes
 * every stored PIN unverifiable; a guardian sets or removes it again.
 */

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;
const PREFIX = 'scrypt$v1';

function derive(secret: Buffer, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** The value fed to scrypt: a keyed digest of the profile id and PIN. */
function prekey(keys: IdentityKeys, childId: string, pin: string): Buffer {
  return Buffer.from(hmacHex(keys.pin, `pin:v1:${childId}:${pin}`), 'hex');
}

export async function hashPin(keys: IdentityKeys, childId: string, pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(prekey(keys, childId, pin), salt);
  return `${PREFIX}$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/** Constant-time check. A malformed or foreign stored value never matches (fails closed, never throws). */
export async function checkPin(keys: IdentityKeys, childId: string, pin: string, stored: string | null): Promise<boolean> {
  // With nothing valid to compare, still do one derivation so timing does not distinguish the cases.
  const parts = stored?.split('$') ?? [];
  const valid = parts.length === 7 && `${parts[0]}$${parts[1]}` === PREFIX && parts[2] === String(N) && parts[3] === String(R) && parts[4] === String(P);
  const salt = valid ? Buffer.from(parts[5] as string, 'base64url') : Buffer.alloc(16);
  const expected = valid ? Buffer.from(parts[6] as string, 'base64url') : Buffer.alloc(KEYLEN);
  const actual = await derive(prekey(keys, childId, pin), salt);
  return valid && expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Guardian sets (or resets) a profile PIN. Clears any lock and failure count. */
export async function setPin(
  ctx: AppContext,
  runtime: IdentityRuntime,
  guardian: GuardianContext,
  childId: string,
  pin: string,
): Promise<ChildProfile> {
  const now = ctx.clock.now();
  const hash = await hashPin(runtime.keys, childId, pin);
  return ctx.db.transaction(async (tx) => {
    const [child] = await tx
      .select()
      .from(childProfiles)
      .where(and(eq(childProfiles.id, childId), eq(childProfiles.familyId, guardian.familyId)))
      .for('update');
    if (!child) throw errors.notFound();
    const [updated] = await tx
      .update(childProfiles)
      .set({ pinHash: hash, pinSetAt: now, pinFailures: 0, pinLockedUntil: null })
      .where(eq(childProfiles.id, childId))
      .returning();
    if (!updated) throw new Error('child update returned no row');
    await recordAudit(tx, ctx.clock, {
      actorType: 'guardian', actorId: guardian.guardianId, action: 'pin.set', familyId: guardian.familyId,
      subjectType: 'child', subjectId: childId, meta: { wasSet: child.pinHash !== null },
    });
    return toChildProfile(updated);
  });
}

/** Guardian removes a profile PIN (this is also how a locked profile is released). Idempotent. */
export async function clearPin(ctx: AppContext, guardian: GuardianContext, childId: string): Promise<ChildProfile> {
  return ctx.db.transaction(async (tx) => {
    const [child] = await tx
      .select()
      .from(childProfiles)
      .where(and(eq(childProfiles.id, childId), eq(childProfiles.familyId, guardian.familyId)))
      .for('update');
    if (!child) throw errors.notFound();
    if (child.pinHash === null && child.pinFailures === 0 && child.pinLockedUntil === null) return toChildProfile(child);
    const [updated] = await tx
      .update(childProfiles)
      .set({ pinHash: null, pinSetAt: null, pinFailures: 0, pinLockedUntil: null })
      .where(eq(childProfiles.id, childId))
      .returning();
    if (!updated) throw new Error('child update returned no row');
    if (child.pinHash !== null) {
      await recordAudit(tx, ctx.clock, {
        actorType: 'guardian', actorId: guardian.guardianId, action: 'pin.cleared', familyId: guardian.familyId,
        subjectType: 'child', subjectId: childId,
      });
    }
    return toChildProfile(updated);
  });
}

/**
 * Checks a PIN for a profile of the device's family, as part of a profile switch. Resolves when
 * the switch may proceed; throws the same generic 403 for a wrong PIN, a missing PIN and a locked
 * profile (no lock detail, no Retry-After).
 *
 * The profile row is locked for the whole check, so concurrent guesses are counted one at a time
 * and cannot beat the limit. The failure count and lock live in the database, so an API restart
 * resets nothing. Every failure is committed (the 403 is thrown only after the transaction ends).
 *
 *  - wrong PIN: pin_failures + 1; reaching the maximum locks the profile until now + lock window;
 *  - locked: the PIN is still hashed (same timing) but the answer is always "no" and the counter
 *    and lock are not extended;
 *  - correct PIN: pin_failures reset to 0, lock cleared;
 *  - the count does not decay with time. It stays at the maximum when a lock expires, so one more
 *    wrong guess locks again at once. Only success, or a guardian setting/removing the PIN, resets it.
 *
 * SECURITY DECISION (deliberately strict, not an accident): a four-digit PIN has only 10,000
 * values, so after the first lock an attacker gets ONE guess per lock window (one per 15 minutes
 * by default, about 96 a day), never a fresh batch of five. The cost is that a child who forgets a
 * PIN stays locked until a guardian resets it, which is the intended recovery path.
 *
 * This profile-level state in PostgreSQL is the authoritative brute-force control. The per-device
 * hourly cap applied before this check (`pin_device`) is supplemental: it limits how fast one
 * device can spend attempts across profiles, but the lockout above does not depend on it.
 *
 * Callers must have already established that `childId` belongs to the device's own family and is
 * playable; this function re-scopes its lookup by `familyId` as a second guard.
 */
export async function verifyPinForSwitch(
  ctx: AppContext,
  runtime: IdentityRuntime,
  familyId: string,
  childId: string,
  pin: string,
): Promise<void> {
  const now = ctx.clock.now();
  const { maxFailures, lockMs } = { maxFailures: runtime.config.limits.pinMaxFailures, lockMs: runtime.config.limits.pinLockSeconds * 1000 };
  const ok = await ctx.db.transaction(async (tx) => {
    const [child] = await tx
      .select()
      .from(childProfiles)
      .where(and(eq(childProfiles.id, childId), eq(childProfiles.familyId, familyId)))
      .for('update');
    if (!child) return false;
    const matches = await checkPin(runtime.keys, childId, pin, child.pinHash);
    const locked = child.pinLockedUntil !== null && child.pinLockedUntil > now;
    if (matches && !locked) {
      if (child.pinFailures !== 0 || child.pinLockedUntil !== null) {
        await tx.update(childProfiles).set({ pinFailures: 0, pinLockedUntil: null }).where(eq(childProfiles.id, childId));
      }
      return true;
    }
    if (!locked) {
      const failures = Math.min(child.pinFailures + 1, maxFailures);
      const lockNow = failures >= maxFailures;
      await tx
        .update(childProfiles)
        .set({ pinFailures: failures, pinLockedUntil: lockNow ? new Date(now.getTime() + lockMs) : null })
        .where(eq(childProfiles.id, childId));
      if (lockNow) {
        await recordAudit(tx, ctx.clock, {
          actorType: 'device', action: 'pin.locked', familyId, subjectType: 'child', subjectId: childId,
        });
      }
    }
    return false;
  });
  if (!ok) throw errors.pinIncorrect();
}
