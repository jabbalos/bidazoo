import { parseInteger, parseWindow } from '../../env-parse';
import type { RateWindow } from '../../http/rate-limit';

/**
 * Family identity configuration (Checkpoint E).
 *
 * IDENTITY IS OFF UNLESS `IDENTITY_SECRET` IS SET. With it unset, no identity route is registered
 * and only the guest cookie authenticates, so the server behaves exactly like the guest-only
 * build that is running in the closed beta. That is also the rollback boundary.
 *
 * Error messages name the variable and never echo its value.
 */

export type MailTransportName = 'none' | 'console' | 'file';

/** Durable (database-backed) limits for identity-sensitive actions. All env-configurable. */
export interface IdentityLimits {
  /** Email-link requests for one address. Overflow is silently accepted (no mail), so it leaks nothing. */
  loginEmail: RateWindow;
  /** Email-link requests from one client address. Overflow is a 429. */
  loginIp: RateWindow;
  /** Email-link requests across the whole service (protects the mail provider's quota). Overflow is a 503. */
  loginGlobal: RateWindow;
  /** Sign-in link redemption attempts from one client address. */
  linkConsumeIp: RateWindow;
  /** Device-code redemption attempts from one client address. */
  deviceCodeIp: RateWindow;
  /** Device-code redemption attempts across the whole service. */
  deviceCodeGlobal: RateWindow;
  /** Legacy claim-code attempts from one client address. */
  claimCodeIp: RateWindow;
  /** Profile-PIN attempts from one trusted device, across all profiles. */
  pinDevice: RateWindow;
  /** Wrong PINs on one profile before it locks. */
  pinMaxFailures: number;
  /** How long a locked profile stays locked. */
  pinLockSeconds: number;
}

export interface IdentityConfig {
  /** Secret that every identity key (throttle, code, PIN pepper) is derived from. At least 32 characters. */
  secret: string;
  /** The public origin used to build emailed links. Never taken from a request's Host header. */
  publicBaseUrl: string;
  mailTransport: MailTransportName;
  /** Where the `file` transport writes (development and e2e only). */
  mailOutboxDir: string | undefined;
  /** Sender address for transports that need one. */
  mailFrom: string | undefined;
  emailLinkMinutes: number;
  deviceSessionDays: number;
  guardianAuthorityHours: number;
  deviceCodeMinutes: number;
  claimCodeDays: number;
  limits: IdentityLimits;
  /** Enables legacy (Hop Quest) family matching. Unset = legacy claiming is off. At least 32 characters. */
  legacyMatchPepper: string | undefined;
}

export const DEFAULT_IDENTITY_LIMITS: IdentityLimits = {
  loginEmail: { max: 5, windowSeconds: 3600 },
  loginIp: { max: 20, windowSeconds: 3600 },
  loginGlobal: { max: 300, windowSeconds: 3600 },
  linkConsumeIp: { max: 30, windowSeconds: 900 },
  deviceCodeIp: { max: 10, windowSeconds: 600 },
  deviceCodeGlobal: { max: 200, windowSeconds: 600 },
  claimCodeIp: { max: 10, windowSeconds: 3600 },
  pinDevice: { max: 30, windowSeconds: 3600 },
  pinMaxFailures: 5,
  pinLockSeconds: 900,
};

const MIN_SECRET_CHARS = 32;
const TRANSPORTS: readonly string[] = ['none', 'console', 'file'];

function parseSecret(name: string, value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (value.length < MIN_SECRET_CHARS) {
    throw new Error(`${name} must be at least ${MIN_SECRET_CHARS} characters (for example the output of: openssl rand -base64 32)`);
  }
  return value;
}

function parseBaseUrl(value: string | undefined, env: string): string {
  if (!value) throw new Error('PUBLIC_BASE_URL is required when IDENTITY_SECRET is set (the origin used in emailed links)');
  let origin: string;
  let protocol: string;
  try {
    const url = new URL(value);
    origin = url.origin;
    protocol = url.protocol;
  } catch {
    throw new Error('PUBLIC_BASE_URL must be an origin like https://play.example.com');
  }
  if (origin !== value) throw new Error('PUBLIC_BASE_URL must be an origin only (no path, query, or trailing slash)');
  if (env === 'production' && protocol !== 'https:') throw new Error('PUBLIC_BASE_URL must use https in production');
  return value;
}

/** Returns undefined (identity off) when IDENTITY_SECRET is unset. */
export function loadIdentityConfig(
  source: Record<string, string | undefined>,
  env: 'development' | 'test' | 'production',
): IdentityConfig | undefined {
  const secret = parseSecret('IDENTITY_SECRET', source['IDENTITY_SECRET']);
  if (secret === undefined) return undefined;

  const requested = source['MAIL_TRANSPORT'] ?? '';
  // No production transport ships in Checkpoint E: the provider is a separate decision (see
  // docs/IDENTITY.md). Production therefore cannot enable identity until an adapter exists.
  const transport = requested === '' ? (env === 'production' ? 'none' : 'console') : requested;
  if (!TRANSPORTS.includes(transport)) throw new Error(`MAIL_TRANSPORT must be one of: ${TRANSPORTS.join(', ')}`);
  if (env === 'production' && transport !== 'none') {
    throw new Error('MAIL_TRANSPORT console and file are for development and tests only and are refused in production');
  }
  if (transport === 'none') {
    throw new Error(
      'IDENTITY_SECRET is set but no mail transport is available: set MAIL_TRANSPORT (console or file outside production). A production mail adapter is not part of this build, so identity cannot be enabled in production yet.',
    );
  }
  const mailOutboxDir = source['MAIL_OUTBOX_DIR'] || undefined;
  if (transport === 'file' && !mailOutboxDir) throw new Error('MAIL_OUTBOX_DIR is required when MAIL_TRANSPORT=file');

  const d = DEFAULT_IDENTITY_LIMITS;
  const P = 'IDENTITY_RATE_';
  return {
    secret,
    publicBaseUrl: parseBaseUrl(source['PUBLIC_BASE_URL'], env),
    mailTransport: transport as MailTransportName,
    mailOutboxDir,
    mailFrom: source['MAIL_FROM'] || undefined,
    emailLinkMinutes: parseInteger('IDENTITY_LINK_MINUTES', source['IDENTITY_LINK_MINUTES'], 15, 5, 60),
    deviceSessionDays: parseInteger('IDENTITY_DEVICE_DAYS', source['IDENTITY_DEVICE_DAYS'], 90, 1, 365),
    guardianAuthorityHours: parseInteger('IDENTITY_AUTHORITY_HOURS', source['IDENTITY_AUTHORITY_HOURS'], 24, 1, 168),
    deviceCodeMinutes: parseInteger('IDENTITY_DEVICE_CODE_MINUTES', source['IDENTITY_DEVICE_CODE_MINUTES'], 10, 2, 60),
    claimCodeDays: parseInteger('IDENTITY_CLAIM_CODE_DAYS', source['IDENTITY_CLAIM_CODE_DAYS'], 7, 1, 30),
    limits: {
      loginEmail: parseWindow(source, P, 'LOGIN_EMAIL', d.loginEmail),
      loginIp: parseWindow(source, P, 'LOGIN_IP', d.loginIp),
      loginGlobal: parseWindow(source, P, 'LOGIN_GLOBAL', d.loginGlobal),
      linkConsumeIp: parseWindow(source, P, 'LINK_CONSUME_IP', d.linkConsumeIp),
      deviceCodeIp: parseWindow(source, P, 'DEVICE_CODE_IP', d.deviceCodeIp),
      deviceCodeGlobal: parseWindow(source, P, 'DEVICE_CODE_GLOBAL', d.deviceCodeGlobal),
      claimCodeIp: parseWindow(source, P, 'CLAIM_CODE_IP', d.claimCodeIp),
      pinDevice: parseWindow(source, P, 'PIN_DEVICE', d.pinDevice),
      pinMaxFailures: parseInteger('IDENTITY_PIN_MAX_FAILURES', source['IDENTITY_PIN_MAX_FAILURES'], d.pinMaxFailures, 3, 20),
      pinLockSeconds: parseInteger('IDENTITY_PIN_LOCK_SECONDS', source['IDENTITY_PIN_LOCK_SECONDS'], d.pinLockSeconds, 60, 86_400),
    },
    legacyMatchPepper: parseSecret('LEGACY_MATCH_PEPPER', source['LEGACY_MATCH_PEPPER']),
  };
}
