// LAYER A client checks against the PUBLIC URL while observe.mjs is the only thing behind Caddy.
// Usage: node layerA-check.mjs --expect-ip <this machine's public IP> [--host play.bidazoo.com]
// (Check A, the "honest phone" request, is done by hand: open https://<host>/api/observe on mobile data.)
import https from 'node:https';
import http from 'node:http';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? dflt : process.argv[i + 1];
};
const host = arg('--host', 'play.bidazoo.com');
const expectIp = arg('--expect-ip');
if (!expectIp) {
  console.error('--expect-ip <public IP of this machine> is required');
  process.exit(2);
}
if (host !== 'play.bidazoo.com') console.log(`NOTE: host is ${host}`);
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
};
const get = (mod, headers) =>
  new Promise((resolve) => {
    const req = mod.request({ host, path: '/api/observe', method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = undefined; }
        resolve({ status: res.statusCode, location: res.headers.location, json });
      });
    });
    req.on('error', () => resolve({ status: -1 }));
    req.end();
  });

const honest = await get(https, {});
const j = honest.json ?? {};
check('B0 honest request from this machine: ip equals this machine\'s public IP', j.ip === expectIp, `ip=${j.ip}`);
check('B0 protocol is https', j.protocol === 'https', `protocol=${j.protocol}`);
check('B0 hostname is the public host', j.hostnameIsExpected === true, `hostname=${j.hostname}`);
check('B0 socket peer is loopback', j.socketRemote === '127.0.0.1' || j.socketRemote === '::1', `socket=${j.socketRemote}`);
check('B0 exactly one X-Forwarded-For entry and it equals ip', j.xffSingleEntryEqualsIp === true, `entries=${j.xffEntryCount}`);

const forged = await get(https, {
  'X-Forwarded-For': '6.6.6.6',
  'X-Forwarded-Proto': 'http',
  'X-Forwarded-Host': 'evil.example',
  'CF-Connecting-IP': '7.7.7.7',
  'X-Real-IP': '8.8.8.8',
});
const f = forged.json ?? {};
check('B1 forged headers: ip is still the real visitor', f.ip === expectIp, `ip=${f.ip}`);
check('B1 forged X-Forwarded-Proto: protocol still https', f.protocol === 'https', `protocol=${f.protocol}`);
check('B1 forged X-Forwarded-Host: hostname still the public host', f.hostnameIsExpected === true, `hostname=${f.hostname}`);
check('B1 forged headers: still exactly one X-Forwarded-For entry equal to ip', f.xffSingleEntryEqualsIp === true, `entries=${f.xffEntryCount}`);

const plain = await get(http, {});
check('C1 plain HTTP is redirected to HTTPS and never returns the JSON', plain.status >= 300 && plain.status < 400 && String(plain.location ?? '').startsWith('https://') && plain.json === undefined, `status=${plain.status}`);

console.log(`\n${failures === 0 ? 'LAYER A: ALL CHECKS PASSED' : `LAYER A: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
