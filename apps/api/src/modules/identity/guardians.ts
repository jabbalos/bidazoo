import type { FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { families, guardianLoginTokens, guardians, deviceSessions } from '@bidazoo/database/schema';
import { ACCOUNT_PAGE_PATH, LINK_FRAGMENT_KEY, type DeviceStateResponse } from '@bidazoo/contracts';
import type { AppContext, Executor } from '../../context';
import { ApiError, errors } from '../../http/errors';
import { recordAudit } from './audit';
import { newToken } from './crypto';
import { buildDeviceState, cleanLabel, findDeviceByToken, issueDeviceSession } from './devices';
import { normalizeEmail } from './email';
import type { IdentityRuntime } from './runtime';
import { hashToken } from './service';
import { clientSubject, enforce, hit, maybeSweep } from './throttle';

/**
 * Guardian sign-in with one-time emailed links. There are no passwords.
 *
 * Why the request side can never reveal whether an address is known: it does exactly the same
 * work for every address (store a hashed single-use token, queue one email) and always answers
 * 202. Whether an account exists is only decided later, when the person who OWNS the mailbox
 * opens the link. A guardian row is created at that moment, so authority is never granted to an
 * address that was not proved.
 */

function buildLink(runtime: IdentityRuntime, token: string): string {
  return `${runtime.config.publicBaseUrl}${ACCOUNT_PAGE_PATH}#${LINK_FRAGMENT_KEY}=${token}`;
}

function linkMessage(runtime: IdentityRuntime, to: string, token: string) {
  return {
    to,
    subject: 'Your BidaZoo sign-in link',
    text: [
      'Someone asked to sign in to BidaZoo with this email address.',
      '',
      'Open this link on the device you want to use:',
      buildLink(runtime, token),
      '',
      `The link works once and expires in ${runtime.config.emailLinkMinutes} minutes.`,
      'If this was not you, ignore this message. Nothing happens unless the link is opened.',
    ].join('\n'),
  };
}

/**
 * Handles "email me a sign-in link". Always completes silently for a well-formed address.
 *
 * Limits (durable, checked before anything is written):
 *  - per client address: over the limit is a 429;
 *  - whole service: over the limit is a 503 (protects the mail provider's quota);
 *  - per address: over the limit is silently accepted with NO mail, so the limit leaks nothing and
 *    cannot be used to mail-bomb a victim.
 */
export async function requestEmailLink(
  ctx: AppContext,
  runtime: IdentityRuntime,
  request: FastifyRequest,
  rawEmail: string,
): Promise<void> {
  const limits = runtime.config.limits;
  await enforce(ctx, runtime, 'login_ip', limits.loginIp, clientSubject(request));
  const email = normalizeEmail(rawEmail);
  if (!email) throw new ApiError(400, 'invalid_request');

  const global = await hit(ctx, runtime, 'login_global', limits.loginGlobal, 'all');
  if (!global.allowed) throw new ApiError(503, 'service_busy', undefined, global.retryAfterSeconds);
  const perEmail = await hit(ctx, runtime, 'login_email', limits.loginEmail, email);
  if (!perEmail.allowed) return;

  void maybeSweep(ctx, runtime);

  const now = ctx.clock.now();
  const token = newToken();
  await ctx.db.insert(guardianLoginTokens).values({
    tokenHash: hashToken(token),
    email,
    createdAt: now,
    expiresAt: new Date(now.getTime() + runtime.config.emailLinkMinutes * 60_000),
  });
  // Sent after the response is decided: provider speed or failure never changes what the caller sees.
  runtime.mail.enqueue(linkMessage(runtime, email, token));
}

async function findGuardianByEmail(executor: Executor, email: string) {
  const [row] = await executor
    .select({ id: guardians.id, familyId: guardians.familyId })
    .from(guardians)
    .where(eq(guardians.email, email));
  return row ?? null;
}

/** The guardian for a verified address, creating the family and guardian on first sign-in. */
async function findOrCreateGuardian(
  executor: Executor,
  email: string,
  now: Date,
): Promise<{ id: string; familyId: string; created: boolean }> {
  const existing = await findGuardianByEmail(executor, email);
  if (existing) return { ...existing, created: false };

  const [family] = await executor.insert(families).values({ createdAt: now }).returning({ id: families.id });
  if (!family) throw new Error('family insert returned no row');
  const [inserted] = await executor
    .insert(guardians)
    .values({ familyId: family.id, email, emailVerifiedAt: now, createdAt: now })
    .onConflictDoNothing({ target: guardians.email })
    .returning({ id: guardians.id, familyId: guardians.familyId });
  if (inserted) return { ...inserted, created: true };

  // Two links for the same new address were redeemed at once; the other one won. Use its guardian.
  await executor.delete(families).where(eq(families.id, family.id));
  const winner = await findGuardianByEmail(executor, email);
  if (!winner) throw new Error('guardian disappeared during sign-in');
  return { ...winner, created: false };
}

export interface ConsumeResult {
  state: DeviceStateResponse;
  /** The raw device-cookie token. Handed to the route once, to set the cookie; never stored or returned in a body. */
  deviceToken: string;
}

/**
 * Redeems a sign-in link: proves control of the address, then issues a trusted device session
 * with guardian authority. Unknown, expired and already-used links are indistinguishable (one
 * 400 `link_invalid`), and a rejected attempt changes nothing except its throttle counter.
 */
export async function consumeEmailLink(
  ctx: AppContext,
  runtime: IdentityRuntime,
  request: FastifyRequest,
  input: { token: string; deviceLabel?: string | undefined },
  presentedDeviceToken: unknown,
): Promise<ConsumeResult> {
  await enforce(ctx, runtime, 'consume_ip', runtime.config.limits.linkConsumeIp, clientSubject(request));

  const now = ctx.clock.now();
  const issued = await ctx.db.transaction(async (tx) => {
    // The row lock makes two simultaneous redemptions of one link run one after the other.
    const [link] = await tx
      .select()
      .from(guardianLoginTokens)
      .where(eq(guardianLoginTokens.tokenHash, hashToken(input.token)))
      .for('update');
    if (!link || link.usedAt !== null || link.expiresAt <= now || link.email === null) return null;

    // Single use: the link is spent and its pending email cleared in the same transaction.
    await tx.update(guardianLoginTokens).set({ usedAt: now, email: null }).where(eq(guardianLoginTokens.id, link.id));

    const guardian = await findOrCreateGuardian(tx, link.email, now);
    if (guardian.created) {
      await recordAudit(tx, ctx.clock, {
        actorType: 'guardian', actorId: guardian.id, action: 'guardian.created', familyId: guardian.familyId,
        subjectType: 'guardian', subjectId: guardian.id,
      });
    }
    await recordAudit(tx, ctx.clock, {
      actorType: 'guardian', actorId: guardian.id, action: 'guardian.verified', familyId: guardian.familyId,
      subjectType: 'guardian', subjectId: guardian.id, meta: { method: 'email_link' },
    });

    // A browser that already holds a device session gets a NEW one; the old row is retired, and
    // its chosen child carries over when it belongs to the same family.
    const presented = await findDeviceByToken(ctx, presentedDeviceToken, tx);
    let carriedChild: string | null = null;
    if (presented) {
      if (presented.familyId === guardian.familyId && presented.activeChild) carriedChild = presented.activeChild.id;
      await tx.update(deviceSessions).set({ revokedAt: now }).where(eq(deviceSessions.id, presented.sessionId));
    }

    const device = await issueDeviceSession(ctx, runtime, tx, {
      familyId: guardian.familyId,
      guardianId: guardian.id,
      origin: 'email_link',
      label: cleanLabel(input.deviceLabel),
      activeChildProfileId: carriedChild,
    });
    await recordAudit(tx, ctx.clock, {
      actorType: 'guardian', actorId: guardian.id, action: 'device.authorized', familyId: guardian.familyId,
      subjectType: 'device', subjectId: device.id, meta: { origin: 'email_link', replaced: presented !== null },
    });
    return { deviceToken: device.token };
  });
  if (!issued) throw errors.linkInvalid();

  const device = await findDeviceByToken(ctx, issued.deviceToken);
  if (!device) throw new Error('a device session that was just issued could not be found');
  return { state: await buildDeviceState(ctx, device), deviceToken: issued.deviceToken };
}
