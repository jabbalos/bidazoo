// LAYER B (rehearsal): the REAL BidaZoo API behind a rehearsal Caddy that mirrors Caddyfile.beta.
// Proves identity per-IP throttling keys on the Cloudflare-supplied visitor address and cannot be
// split or bypassed with forged X-Forwarded-* / X-Real-IP headers.
// Usage: node layerB.mjs --caddy-port 8482 --max 3
// Needs: the API started with identity ON (rehearsal), TRUST_PROXY=loopback and
// IDENTITY_RATE_LOGIN_IP_MAX=<max>. NEVER point this at the live stack: it sends sign-in requests.
import http from 'node:http';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? dflt : process.argv[i + 1];
};
const PORT = Number(arg('--caddy-port', '8482'));
const MAX = Number(arg('--max', '3'));
if (PORT === 8480 || PORT === 3101 || PORT === 54340) {
  console.error('Refusing: that is a live-stack port.');
  process.exit(2);
}
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
};
let n = 0;
const post = (extra) =>
  new Promise((resolve) => {
    const body = JSON.stringify({ email: `layerb-${Date.now().toString(36)}-${++n}@example.test` });
    const headers = {
      Host: 'play.bidazoo.com',
      Origin: 'https://play.bidazoo.com',
      'CF-Visitor': '{"scheme":"https"}',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      ...extra,
    };
    const req = http.request(
      { host: '127.0.0.1', port: PORT, method: 'POST', path: '/api/v1/guardian/email-links', headers },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, retryAfter: res.headers['retry-after'] }));
      },
    );
    req.on('error', () => resolve({ status: -1 }));
    req.write(body);
    req.end();
  });
const forged = (i) => ({
  'X-Forwarded-For': `6.6.6.${i}, 7.7.7.${i}`,
  'X-Forwarded-Proto': 'http',
  'X-Forwarded-Host': 'evil.example',
  'X-Real-IP': `8.8.8.${i}`,
});
const A = { 'CF-Connecting-IP': '203.0.113.10' };
const B = { 'CF-Connecting-IP': '203.0.113.20' };
const C = { 'CF-Connecting-IP': '203.0.113.30' };

console.log(`Layer B against rehearsal Caddy on 127.0.0.1:${PORT}, per-IP login limit = ${MAX}\n`);
const results = [];
for (let i = 1; i <= MAX; i += 1) results.push((await post({ ...A, ...forged(i) })).status);
check(`client A: first ${MAX} requests accepted despite a different forged X-Forwarded-For each time`, results.every((s) => s === 202), results.join(','));
const over = await post({ ...A, ...forged(99) });
check('client A: next request is throttled (429) even with a brand-new forged X-Forwarded-For', over.status === 429, `status ${over.status}`);
check('429 carries Retry-After', over.retryAfter !== undefined, String(over.retryAfter));
const b1 = await post({ ...B, ...forged(1) });
check('client B (different CF-Connecting-IP) is NOT throttled: identities are not collapsed onto the proxy', b1.status === 202, `status ${b1.status}`);
const c1 = await post({ ...C });
check('client C (no forged headers) is NOT throttled', c1.status === 202, `status ${c1.status}`);
const aAgain = await post({ ...A });
check('client A is still throttled after B and C used the service', aAgain.status === 429, `status ${aAgain.status}`);
const none = await post({});
console.log(`INFO  request WITHOUT CF-Connecting-IP -> status ${none.status}. Such a request cannot reach Caddy publicly (only the BidaZoo tunnel can); locally it falls back to the loopback identity.`);
console.log(`\n${failures === 0 ? 'LAYER B (rehearsal): ALL CHECKS PASSED' : `LAYER B (rehearsal): ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
