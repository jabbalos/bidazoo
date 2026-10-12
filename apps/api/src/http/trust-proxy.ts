import { isIP } from 'node:net';

/**
 * What we pass to Fastify's `trustProxy`: nothing, or an explicit list of proxy addresses.
 * Deliberately NOT `true` (trust anyone) and NOT a hop count: Fastify itself treats a bare number
 * as "trust nothing" because a hop count cannot verify who is talking to the API, so a client that
 * reached the API directly could forge the header with enough hops.
 */
export type TrustProxySetting = false | string[];

const KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/**
 * Parses TRUST_PROXY. The client IP drives every per-IP limit, and a client can send any
 * X-Forwarded-For it likes, so the proxy topology must be stated, never guessed:
 *
 *   unset, "", "false"      do not trust any forwarding header (default; the socket address is used)
 *   "loopback, 10.0.0.0/8"  trust forwarding headers only when the connection comes from one of these
 *                           addresses, CIDR ranges, or the keywords loopback / linklocal / uniquelocal.
 *                           The client address is then the right-most X-Forwarded-For entry that is NOT
 *                           one of those proxies, which a client cannot forge by adding entries on the left.
 *   "true"                  REFUSED: it would trust any X-Forwarded-For from anyone
 *   "1", "2", ...           REFUSED: hop counts cannot verify the immediate peer (see TrustProxySetting)
 *
 * Error messages name the variable, not the value.
 */
export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = (raw ?? '').trim();
  if (value === '' || value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'true') {
    throw new Error('TRUST_PROXY=true is not allowed (it trusts any X-Forwarded-For). Use a hop count like 1, or a list of proxy addresses.');
  }
  if (/^\d+$/.test(value)) {
    throw new Error('TRUST_PROXY hop counts are not supported. List the address(es) of your proxy instead, for example "loopback" or "10.0.0.0/8".');
  }
  const entries = value.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '');
  if (entries.length === 0) throw new Error('TRUST_PROXY must be false or a comma-separated list of proxy addresses');
  for (const entry of entries) {
    if (KEYWORDS.has(entry)) continue;
    const [address, prefix, ...rest] = entry.split('/');
    const family = isIP(address ?? '');
    const prefixOk =
      prefix === undefined ||
      (/^\d{1,3}$/.test(prefix) && Number(prefix) <= (family === 4 ? 32 : 128));
    if (family === 0 || rest.length > 0 || !prefixOk) {
      throw new Error('TRUST_PROXY entries must be IP addresses, CIDR ranges, or loopback/linklocal/uniquelocal');
    }
  }
  return entries;
}
