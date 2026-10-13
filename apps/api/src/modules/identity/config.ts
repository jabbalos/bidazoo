import { parseInteger, parseWindow } from '../../env-parse';
import { normalizeEmail } from './email';
import type { SmtpSecurity, SmtpSettings } from './mail-smtp';
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

export type MailTransportName = 'none' | 'console' | 'file' | 'smtp';

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
  /** Sender address (bare, normalized) for transports that need one. A BidaZoo-owned domain, never jonabalos.com. */
  mailFrom: string | undefined;
  /** Sender display name. */
  mailFromName?: string;
  /** SMTP settings; present exactly when mailTransport is 'smtp'. */
  smtp?: SmtpSettings;
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
const TRANSPORTS: readonly string[] = ['none', 'console', 'file', 'smtp'];

function parseSecret(name: string, value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (value.length < MIN_SECRET_CHARS) {
    throw new Error(`${name} must be at least ${MIN_SECRET_CHARS} characters (for example the output of: openssl rand -base64 32)`);
  }
  return value;
}

function parseBaseUrl(value: string | undefined, env: string): string {
  if (!value) throw new Error('PUBLIC_BASE_URL is required when IDENTITY_SECRET is set (the origin used in emailed links)');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('PUBLIC_BASE_URL must be an origin like https://play.example.com');
  }
  if (url.username !== '' || url.password !== '') throw new Error('PUBLIC_BASE_URL must not contain credentials');
  if (url.origin !== value) throw new Error('PUBLIC_BASE_URL must be an origin only (no path, query, or trailing slash)');
  if (env === 'production') {
    if (url.protocol !== 'https:') throw new Error('PUBLIC_BASE_URL must use https in production');
    // An emailed link must lead to the real public site, never a loopback or raw-address host.
    const host = url.hostname;
    if (host === 'localhost' || host.endsWith('.localhost') || host.startsWith('[') || /^[0-9.]+$/.test(host) || !host.includes('.')) {
      throw new Error('PUBLIC_BASE_URL must be the public https hostname in production (not localhost or an IP address)');
    }
  }
  return value;
}

const FORBIDDEN_SENDER_DOMAIN = 'jonabalos.com';

/** Sender: a bare address on a BidaZoo-owned domain. The jonabalos.com identity is never reused. */
function parseSender(source: Record<string, string | undefined>): { address: string; name: string } {
  const raw = source['MAIL_FROM'];
  if (!raw) throw new Error('MAIL_FROM is required when MAIL_TRANSPORT=smtp (a bare address such as no-reply@notify.example.com)');
  const address = normalizeEmail(raw);
  if (address === null || address !== raw.trim().toLowerCase()) throw new Error('MAIL_FROM must be a single plain email address (no display name; use MAIL_FROM_NAME)');
  const domain = address.slice(address.indexOf('@') + 1);
  if (domain === FORBIDDEN_SENDER_DOMAIN || domain.endsWith(`.${FORBIDDEN_SENDER_DOMAIN}`)) {
    throw new Error(`MAIL_FROM must not use the ${FORBIDDEN_SENDER_DOMAIN} sending identity; BidaZoo mail uses its own sender domain`);
  }
  const name = source['MAIL_FROM_NAME'] ?? 'BidaZoo';
  if (name.length < 1 || name.length > 64 || !/^[\p{L}\p{N} .,'&-]+$/u.test(name)) {
    throw new Error('MAIL_FROM_NAME must be 1 to 64 letters, digits, spaces or . , \' & -');
  }
  return { address, name };
}

function parseSmtp(source: Record<string, string | undefined>, env: string): { smtp: SmtpSettings; from: string; fromName: string } {
  const host = source['MAIL_SMTP_HOST'];
  if (!host) throw new Error('MAIL_SMTP_HOST is required when MAIL_TRANSPORT=smtp');
  if (host.length > 253 || !/^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(host)) throw new Error('MAIL_SMTP_HOST must be a hostname');

  const securityRaw = source['MAIL_SMTP_SECURITY'] || 'starttls';
  if (!['tls', 'starttls', 'none'].includes(securityRaw)) throw new Error('MAIL_SMTP_SECURITY must be one of: tls, starttls, none');
  const security = securityRaw as SmtpSecurity;
  if (security === 'none' && env === 'production') throw new Error('MAIL_SMTP_SECURITY=none is refused in production (use tls or starttls)');

  const port = parseInteger('MAIL_SMTP_PORT', source['MAIL_SMTP_PORT'], security === 'tls' ? 465 : 587, 1, 65_535);

  const user = source['MAIL_SMTP_USER'] || undefined;
  const password = source['MAIL_SMTP_PASSWORD'] || undefined;
  if ((user === undefined) !== (password === undefined)) throw new Error('MAIL_SMTP_USER and MAIL_SMTP_PASSWORD must be set together');
  if (user === undefined && env === 'production') throw new Error('MAIL_SMTP_USER and MAIL_SMTP_PASSWORD are required in production');
  if (user !== undefined && security === 'none') throw new Error('SMTP credentials are never sent over a connection without TLS (MAIL_SMTP_SECURITY=none)');
  if (user !== undefined && /[\r\n\u0000]/.test(`${user}${password}`)) throw new Error('MAIL_SMTP_USER and MAIL_SMTP_PASSWORD must not contain control characters');

  const timeoutSeconds = parseInteger('MAIL_SMTP_TIMEOUT_SECONDS', source['MAIL_SMTP_TIMEOUT_SECONDS'], 10, 1, 60);
  const sender = parseSender(source);
  return {
    smtp: { host, port, security, user, password, fromAddress: sender.address, fromName: sender.name, timeoutSeconds },
    from: sender.address,
    fromName: sender.name,
  };
}

/** Returns undefined (identity off) when IDENTITY_SECRET is unset. */
export function loadIdentityConfig(
  source: Record<string, string | undefined>,
  env: 'development' | 'test' | 'production',
): IdentityConfig | undefined {
  const secret = parseSecret('IDENTITY_SECRET', source['IDENTITY_SECRET']);
  if (secret === undefined) return undefined;

  const requested = source['MAIL_TRANSPORT'] ?? '';
  // Production has exactly one acceptable transport: real SMTP delivery. It is never inferred, and
  // there is no fallback: console, file and "nothing configured" all stop startup.
  const transport = requested === '' ? (env === 'production' ? 'none' : 'console') : requested;
  if (!TRANSPORTS.includes(transport)) throw new Error(`MAIL_TRANSPORT must be one of: ${TRANSPORTS.join(', ')}`);
  if (env === 'production' && (transport === 'console' || transport === 'file')) {
    throw new Error('MAIL_TRANSPORT console and file are for development and tests only and are refused in production');
  }
  if (transport === 'none') {
    throw new Error('IDENTITY_SECRET is set but no mail transport is configured: production needs MAIL_TRANSPORT=smtp (with the MAIL_SMTP_* settings and MAIL_FROM)');
  }
  const mailOutboxDir = source['MAIL_OUTBOX_DIR'] || undefined;
  if (transport === 'file' && !mailOutboxDir) throw new Error('MAIL_OUTBOX_DIR is required when MAIL_TRANSPORT=file');
  const smtp = transport === 'smtp' ? parseSmtp(source, env) : undefined;

  const d = DEFAULT_IDENTITY_LIMITS;
  const P = 'IDENTITY_RATE_';
  return {
    secret,
    publicBaseUrl: parseBaseUrl(source['PUBLIC_BASE_URL'], env),
    mailTransport: transport as MailTransportName,
    mailOutboxDir,
    mailFrom: smtp ? smtp.from : source['MAIL_FROM'] || undefined,
    ...(smtp ? { mailFromName: smtp.fromName, smtp: smtp.smtp } : {}),
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
