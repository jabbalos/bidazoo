// LAYER B (live, maintenance window only): the REAL application through the REAL Cloudflare -> tunnel -> Caddy path.
// Needs NO configuration change. The API's default per-IP guest-creation limit is 30 per 60 s (Checkpoint D).
// From THIS machine we create guests with a different forged X-Forwarded-For / X-Real-IP each time:
//   - if the forged values created new identities, we would never be throttled;
//   - if every Cloudflare visitor collapsed onto one proxy address, the phone check below would also fail.
// Side effect: at most ~30 throwaway guest rows in the live beta database (harmless). Stops at the first 429.
// Usage: node layerB-live.mjs [--host play.bidazoo.com] [--max 36]
import https from 'node:https';
import { randomInt } from 'node:crypto';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i === -1 ? d : process.argv[i + 1]; };
const host = arg('--host', 'play.bidazoo.com');
const MAX = Number(arg('--max', '36'));
const post = (i) => new Promise((resolve) => {
  const body = '{}';
  const req = https.request({
    host, path: '/api/v1/guest', method: 'POST',
    headers: {
      Origin: `https://${host}`, 'Content-Type': 'application/json', 'Content-Length': 2,
      'X-Forwarded-For': `${randomInt(11, 200)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`,
      'X-Real-IP': `${randomInt(11, 200)}.1.1.${i}`, 'X-Forwarded-Proto': 'http',
    },
  }, (res) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, retryAfter: res.headers['retry-after'] })); });
  req.on('error', () => resolve({ status: -1 }));
  req.write(body); req.end();
});

const statuses = [];
let firstThrottle = -1;
let retryAfter;
for (let i = 1; i <= MAX; i += 1) {
  const r = await post(i);
  statuses.push(r.status);
  if (r.status === 429) { firstThrottle = i; retryAfter = r.retryAfter; break; }
  if (r.status < 200 || r.status >= 300) { console.log(`FAIL  unexpected status ${r.status} on request ${i}`); process.exit(1); }
}
const created = statuses.filter((s) => s >= 200 && s < 300).length;
console.log(`created ${created} throwaway guest(s); first 429 at request ${firstThrottle}; Retry-After=${retryAfter}`);
const ok = firstThrottle > 0 && created <= 30;
console.log(ok
  ? 'PASS  throttled by the REAL visitor address despite a different forged X-Forwarded-For on every request'
  : 'FAIL  never throttled within the request budget: forged headers may be creating new identities');
console.log('NOW (by hand): from a phone on MOBILE DATA open https://' + host + ' - it must still load and start a guest.\n'
  + '       If the phone is throttled too, every visitor shares one address and the proxy chain is wrong: STOP.');
process.exit(ok ? 0 : 1);
