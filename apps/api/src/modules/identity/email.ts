/**
 * Email normalization. ONE function, used by guardian sign-in and by the legacy match key, so a
 * guardian's verified address and a legacy parent's address compare exactly the way they were
 * normalized, never differently.
 *
 * Rules (from the approved assessment): Unicode NFKC, trim, lower-case the whole address. There is
 * deliberately NO provider-specific folding (no dropping dots, no stripping +tags): the match is
 * exact, so it can never merge two real people.
 *
 * Returns null for anything that is not a plausible single address. A rejected address is a 400,
 * which says nothing about whether any address exists.
 */
const MAX_LENGTH = 254;
const MAX_LOCAL = 64;
// No whitespace, control characters, or the characters that separate or quote addresses.
const LOCAL = /^[^\s\u0000-\u001f\u007f@<>()[\]\\,;:"']+$/u;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeEmail(raw: string): string | null {
  const email = raw.normalize('NFKC').trim().toLowerCase();
  if (email.length < 3 || email.length > MAX_LENGTH) return null;
  const at = email.indexOf('@');
  if (at < 1 || at !== email.lastIndexOf('@')) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > MAX_LOCAL || !LOCAL.test(local)) return null;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some((label) => !LABEL.test(label))) return null;
  return email;
}
