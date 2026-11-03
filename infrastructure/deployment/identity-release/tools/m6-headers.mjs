// M6 RELEASE GATE (F6 follow-up M6): production cache and security-header verification for the static client.
// Read-only: sends GET requests only, prints derived values only (header names and verdicts), never bodies.
//
//   Rehearsal (local Caddy that mirrors Caddyfile.beta):
//     node m6-headers.mjs --base http://127.0.0.1:8482 --host play.bidazoo.com --cf-https
//   Maintenance window, through the real Cloudflare -> tunnel -> Caddy path:
//     node m6-headers.mjs --base https://play.bidazoo.com
//   Maintenance window, origin only (loopback Caddy, bypasses Cloudflare):
//     node m6-headers.mjs --base http://127.0.0.1:8480 --host play.bidazoo.com --cf-https
//
// Verifies, for the SAME build that is being released:
//   1. the HTML shell is not long-term cached (no-cache / no-store / max-age=0, never immutable, never an edge HIT)
//   2. content-hashed /assets/* (JS, CSS and a production character PNG) are long-lived and immutable
//   3. X-Content-Type-Options: nosniff, frame protection, Permissions-Policy
//   4. the EFFECTIVE client CSP (no unsafe-inline / unsafe-eval / wildcard; script-src 'self'; frame-ancestors 'none')
//   5. the API keeps its own strict CSP and no-store (not the client policy)
// Exit code 0 only when every check passes.
import http from 'node:http';
import https from 'node:https';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? dflt : process.argv[i + 1];
};
const has = (name) => process.argv.includes(name);
const base = arg('--base');
if (!base) {
  console.error('usage: node m6-headers.mjs --base <http(s)://host[:port]> [--host <Host header>] [--cf-https]');
  process.exit(2);
}
const target = new URL(base);
const hostHeader = arg('--host');
const extra = {};
if (has('--cf-https')) extra['CF-Visitor'] = '{"scheme":"https"}';
const transport = target.protocol === 'https:' ? https : http;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
};
const info = (text) => console.log(`INFO  ${text}`);

const get = (path, wantBody = false) =>
  new Promise((resolve) => {
    const headers = { ...extra, 'Accept-Encoding': 'identity' };
    if (hostHeader) headers.Host = hostHeader;
    const options = {
      host: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path,
      method: 'GET',
      headers,
    };
    if (target.protocol === 'https:' && hostHeader) options.servername = hostHeader;
    const req = transport.request(options, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (wantBody && size < 6_000_000) chunks.push(c);
      });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: wantBody ? Buffer.concat(chunks).toString('utf8') : '' }));
    });
    req.on('error', (e) => resolve({ status: -1, headers: {}, body: '', error: e.code ?? e.message }));
    req.setTimeout(20_000, () => req.destroy(new Error('timeout')));
    req.end();
  });

const cacheDirectives = (value) => {
  const out = {};
  for (const part of String(value ?? '').split(',')) {
    const [k, v] = part.trim().toLowerCase().split('=');
    if (k) out[k] = v === undefined ? true : v.replace(/"/g, '');
  }
  return out;
};
const cspDirectives = (value) => {
  const out = {};
  for (const part of String(value ?? '').split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length) out[tokens[0].toLowerCase()] = tokens.slice(1);
  }
  return out;
};

const shellIsNotLongCached = (value) => {
  const d = cacheDirectives(value);
  if (d.immutable) return false;
  if (d['no-store'] || d['no-cache']) return true;
  return d['max-age'] === '0' && (d['s-maxage'] === undefined || d['s-maxage'] === '0');
};
const assetIsLongLivedImmutable = (value) => {
  const d = cacheDirectives(value);
  const maxAge = /^\d+$/.test(String(d['max-age'])) ? Number(d['max-age']) : -1;
  return maxAge >= 31_536_000 && d.immutable === true && !d['no-cache'] && !d['no-store'];
};
const isContentHashed = (path) => /[-.][A-Za-z0-9_-]{8,}\.(?:js|css|png|webp|woff2?)$/.test(path);

const frameProtected = (headers) => {
  const xfo = String(headers['x-frame-options'] ?? '').toUpperCase();
  if (xfo === 'DENY' || xfo === 'SAMEORIGIN') return true;
  const fa = cspDirectives(headers['content-security-policy'])['frame-ancestors'];
  return Array.isArray(fa) && fa.length > 0 && fa.every((t) => t === "'none'" || t === "'self'");
};
const permissionsPolicyOk = (headers) => {
  const pp = String(headers['permissions-policy'] ?? '').replace(/\s+/g, '');
  return ['camera=()', 'microphone=()', 'geolocation=()'].every((t) => pp.includes(t));
};

// ---------------------------------------------------------------- 1 + 3 + 4: the HTML shell
console.log(`M6 header check against ${target.origin}${hostHeader ? ` (Host: ${hostHeader})` : ''}`);
const shell = await get('/', true);
check('HTML shell: GET / answers 200', shell.status === 200, shell.status === -1 ? shell.error : `status=${shell.status}`);
if (shell.status !== 200) {
  console.log('M6 RESULT: FAIL (cannot read the shell)');
  process.exit(1);
}
const h = shell.headers;
check('HTML shell is NOT long-term cached (no-cache / no-store / max-age=0; never immutable)', shellIsNotLongCached(h['cache-control']), `cache-control=${h['cache-control'] ?? '(missing)'}`);
if (h['cf-cache-status'] !== undefined) check('HTML shell is not served from the Cloudflare edge cache (cf-cache-status is not HIT)', String(h['cf-cache-status']).toUpperCase() !== 'HIT', `cf-cache-status=${h['cf-cache-status']}`);
if (h.age !== undefined) check('HTML shell carries no positive Age (no intermediary cache served it)', Number(h.age) === 0, `age=${h.age}`);
check('HTML shell: X-Content-Type-Options is nosniff', String(h['x-content-type-options'] ?? '').toLowerCase() === 'nosniff', `value=${h['x-content-type-options'] ?? '(missing)'}`);
check('HTML shell: frame protection (X-Frame-Options DENY/SAMEORIGIN or CSP frame-ancestors none/self)', frameProtected(h), `x-frame-options=${h['x-frame-options'] ?? '(missing)'}`);
check('HTML shell: Permissions-Policy denies camera, microphone and geolocation', permissionsPolicyOk(h), `present=${h['permissions-policy'] !== undefined}`);

const csp = cspDirectives(h['content-security-policy']);
const cspRaw = String(h['content-security-policy'] ?? '');
check('CSP present', cspRaw !== '');
check("CSP: default-src 'none'", JSON.stringify(csp['default-src']) === JSON.stringify(["'none'"]), `default-src=${(csp['default-src'] ?? ['(missing)']).join(' ')}`);
check("CSP: script-src is exactly 'self'", JSON.stringify(csp['script-src']) === JSON.stringify(["'self'"]), `script-src=${(csp['script-src'] ?? ['(missing)']).join(' ')}`);
check("CSP: object-src 'none', base-uri 'none', frame-ancestors 'none'", ['object-src', 'base-uri', 'frame-ancestors'].every((d) => JSON.stringify(csp[d]) === JSON.stringify(["'none'"])));
check("CSP: no 'unsafe-inline', 'unsafe-eval' or bare wildcard source in any directive", !/'unsafe-(inline|eval)'|(^|[\s;])\*([\s;]|$)/.test(cspRaw));
check("CSP: img-src allows 'self' (production character art is same-origin)", (csp['img-src'] ?? []).includes("'self'"), `img-src=${(csp['img-src'] ?? ['(missing)']).join(' ')}`);

// ---------------------------------------------------------------- 2: content-hashed assets
const assetPaths = [...new Set([...shell.body.matchAll(/(?:src|href)="(\/assets\/[A-Za-z0-9._-]+\.(?:js|css))"/g)].map((m) => m[1]))];
const jsPaths = assetPaths.filter((p) => p.endsWith('.js'));
const cssPaths = assetPaths.filter((p) => p.endsWith('.css'));
check('index.html references at least one hashed JS asset under /assets/', jsPaths.length > 0, `js=${jsPaths.length} css=${cssPaths.length}`);
let pngPaths = [];
for (const p of [...jsPaths, ...cssPaths]) {
  const asset = await get(p, p.endsWith('.js'));
  check(`${p} is 200`, asset.status === 200, `status=${asset.status}`);
  check(`${p} filename is content-hashed (so immutable caching is safe)`, isContentHashed(p));
  check(`${p} is long-lived and immutable (max-age >= 31536000, immutable)`, assetIsLongLivedImmutable(asset.headers['cache-control']), `cache-control=${asset.headers['cache-control'] ?? '(missing)'}`);
  check(`${p} X-Content-Type-Options is nosniff`, String(asset.headers['x-content-type-options'] ?? '').toLowerCase() === 'nosniff');
  if (p.endsWith('.js')) {
    for (const m of asset.body.matchAll(/(?:\/?assets\/)?([A-Za-z0-9_.]+-[A-Za-z0-9_-]{8,}\.png)/g)) pngPaths.push(`/assets/${m[1]}`);
  }
}
pngPaths = [...new Set(pngPaths)];
check('the bundle references production character PNGs under /assets/', pngPaths.length >= 1, `png references=${pngPaths.length}`);
for (const p of pngPaths.slice(0, 2)) {
  const png = await get(p);
  check(`${p} is 200 image/png`, png.status === 200 && String(png.headers['content-type'] ?? '').startsWith('image/png'), `status=${png.status} content-type=${png.headers['content-type'] ?? '(missing)'}`);
  check(`${p} is long-lived and immutable`, assetIsLongLivedImmutable(png.headers['cache-control']), `cache-control=${png.headers['cache-control'] ?? '(missing)'}`);
}

// ---------------------------------------------------------------- 5: the API keeps its own policy
const api = await get('/api/v1/me');
const ah = api.headers;
const apiCsp = cspDirectives(ah['content-security-policy']);
check('API /api/v1/me answers 401 (guest-less) through the same path', api.status === 401, `status=${api.status}`);
check("API keeps its own CSP (default-src 'none', not the client policy)", JSON.stringify(apiCsp['default-src']) === JSON.stringify(["'none'"]) && apiCsp['script-src'] === undefined);
check('API responses are Cache-Control: no-store', cacheDirectives(ah['cache-control'])['no-store'] === true, `cache-control=${ah['cache-control'] ?? '(missing)'}`);
check('API X-Content-Type-Options is nosniff', String(ah['x-content-type-options'] ?? '').toLowerCase() === 'nosniff');

// ---------------------------------------------------------------- informational: who answered
for (const name of ['server', 'via', 'cf-cache-status', 'cf-ray', 'strict-transport-security']) if (h[name] !== undefined) info(`${name}: ${name === 'cf-ray' ? '(present)' : h[name]}`);
info('Cloudflare edge settings (Browser Cache TTL, Cache Rules, Always Use HTTPS) can rewrite these headers: run this against the PUBLIC URL in the maintenance window, not only against the local Caddy.');

console.log(`M6 RESULT: ${failures === 0 ? 'PASS' : `FAIL (${failures} failed)`}`);
process.exit(failures === 0 ? 0 : 1);
