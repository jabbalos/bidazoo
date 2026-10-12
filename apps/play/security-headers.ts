/**
 * Security headers for the PLAYABLE CLIENT (the HTML page and its assets).
 *
 * One definition, three uses, so nothing drifts:
 *  1. `vite preview` (what the Playwright and Studio runs serve) sends these as HTTP headers.
 *  2. The production build embeds the same CSP as a <meta http-equiv> in index.html, so the policy
 *     is enforced even if a hosting layer forgets to add headers (see vite.config.ts).
 *  3. docs/SECURITY.md shows how to send them from the production reverse proxy, which is the
 *     preferred place (headers can also carry frame-ancestors, which a <meta> cannot).
 *
 * The policy is deliberately strict. The page loads one same-origin module script and one
 * same-origin stylesheet; Phaser draws to a canvas; the only network calls are same-origin fetches
 * to /api. If a browser run ever reports a violation, loosen ONLY that directive, with a comment.
 */
const DIRECTIVES: Record<string, string> = {
  'default-src': "'none'",
  'script-src': "'self'",
  'style-src': "'self'",
  'img-src': "'self' data:",
  'font-src': "'self'",
  'connect-src': "'self'",
  'media-src': "'self'",
  'manifest-src': "'self'",
  'object-src': "'none'",
  'base-uri': "'none'",
  'form-action': "'none'",
  'frame-ancestors': "'none'",
};

/** Directives a <meta> CSP cannot carry (browsers ignore them and log a console error). */
const HEADER_ONLY = new Set(['frame-ancestors', 'report-uri', 'report-to', 'sandbox']);

function serialize(skip: ReadonlySet<string> = new Set()): string {
  return Object.entries(DIRECTIVES)
    .filter(([name]) => !skip.has(name))
    .map(([name, value]) => `${name} ${value}`)
    .join('; ');
}

/** The full Content-Security-Policy header value. */
export const CLIENT_CSP = serialize();

/** The same policy minus header-only directives, for the <meta http-equiv> fallback. */
export const CLIENT_CSP_META = serialize(HEADER_ONLY);

/** Every security header the client server should send. */
export function clientSecurityHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': CLIENT_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  };
}
