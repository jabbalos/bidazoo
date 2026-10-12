/**
 * Browser security headers sent on EVERY API response (success, error, 404, 429, 503).
 *
 * The API returns JSON only, so its Content-Security-Policy is the tightest possible: nothing may
 * load or run from an API response, and it cannot be framed. The headers for the playable client
 * (which does need a script/style/image policy) live with the client server: apps/play.
 */
export function apiSecurityHeaders(hstsMaxAgeSeconds: number): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  };
  // Only when explicitly configured: HSTS is sticky, so it must not be guessed. It is meaningful
  // only over HTTPS and is normally set by the TLS-terminating proxy as well.
  if (hstsMaxAgeSeconds > 0) headers['Strict-Transport-Security'] = `max-age=${hstsMaxAgeSeconds}`;
  return headers;
}
