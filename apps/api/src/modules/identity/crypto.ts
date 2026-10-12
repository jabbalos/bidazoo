import { createHmac, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Identity cryptography helpers. Node's built-in `crypto` only: no new dependency.
 *
 * Secrets in play:
 *  - Cookie and email-link tokens are 32 random bytes (256 bits). Only their plain SHA-256 is
 *    stored (see `hashToken` in service.ts); nothing short of the token can be brute forced.
 *  - Short human codes (device codes, legacy claim codes) have less entropy, so their stored hash
 *    is a KEYED HMAC: a database leak alone cannot be used to test guesses against it.
 *  - Throttle keys are keyed HMACs too, so identity_throttles never holds a raw email or IP.
 *  - All keys are derived from IDENTITY_SECRET with HKDF, one per purpose.
 */

export interface IdentityKeys {
  /** Keys identity_throttles rows. */
  throttle: Buffer;
  /** Keys the stored hash of short human codes. */
  code: Buffer;
  /** Pre-keys profile PINs before scrypt, so a database leak alone cannot brute-force a 4-digit PIN. */
  pin: Buffer;
}

function derive(secret: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), `bidazoo-identity-${purpose}-v1`, 32));
}

export function deriveIdentityKeys(secret: string): IdentityKeys {
  const material = Buffer.from(secret, 'utf8');
  return { throttle: derive(material, 'throttle'), code: derive(material, 'code'), pin: derive(material, 'pin') };
}

/** 32 random bytes as 43 base64url characters: a cookie or email-link token. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Lowercase hex HMAC-SHA-256 of `value` under `key`. */
export function hmacHex(key: Buffer | string, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

// Crockford base32: no I, L, O or U, so a code read aloud or typed from a screen is unambiguous.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A random human-typable code with at least `bits` bits of entropy, grouped in fours:
 * 40 bits -> "ABCD-EFGH", 130 bits -> 26 characters.
 */
export function newHumanCode(bits: number): string {
  const length = Math.ceil(bits / 5);
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[(bytes[i] as number) & 31];
  return out.match(/.{1,4}/g)!.join('-');
}

/** Normalizes what a person typed back into the canonical form (Crockford rules). */
export function normalizeHumanCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** The stored form of a human code: a keyed hash of its normalized form. */
export function hashHumanCode(keys: IdentityKeys, input: string): string {
  return hmacHex(keys.code, `code:${normalizeHumanCode(input)}`);
}

/**
 * The part of a client address that is limited as one unit: the whole IPv4 address, or the /64
 * network of an IPv6 address (so one household cannot dodge a limit by rotating addresses, the
 * same rule Checkpoint D uses).
 */
export function ipSubject(ip: string): string {
  const address = (ip.split('%')[0] ?? '').toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (mapped) return mapped[1] as string;
  if (!address.includes(':')) return address;
  const [head = '', tail] = address.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const groups = tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  return groups
    .slice(0, 4)
    .map((group) => group.padStart(4, '0'))
    .join(':');
}
