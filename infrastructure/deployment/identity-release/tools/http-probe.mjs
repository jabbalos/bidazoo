// Tiny HTTP probe with full control of the Host header. Prints status and a few headers only.
// Usage: node http-probe.mjs <port> <METHOD> <path> [--host h] [--cf-https] [--hdr "Name: value"]... [--body json]
import http from 'node:http';

const [port, method, path, ...rest] = process.argv.slice(2);
if (!port || !method || !path) {
  console.error('usage: node http-probe.mjs <port> <METHOD> <path> [--host h] [--cf-https] [--hdr "K: V"]... [--body json]');
  process.exit(2);
}
const headers = {};
let body;
for (let i = 0; i < rest.length; i += 1) {
  if (rest[i] === '--host') headers['Host'] = rest[++i];
  else if (rest[i] === '--cf-https') headers['CF-Visitor'] = '{"scheme":"https"}';
  else if (rest[i] === '--hdr') {
    const s = rest[++i];
    const at = s.indexOf(':');
    headers[s.slice(0, at).trim()] = s.slice(at + 1).trim();
  } else if (rest[i] === '--body') {
    body = rest[++i];
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(body);
  }
}
const req = http.request({ host: '127.0.0.1', port: Number(port), method, path, headers }, (res) => {
  res.resume();
  res.on('end', () => {
    console.log(`status=${res.statusCode}`);
    for (const h of ['content-security-policy', 'cache-control', 'location', 'retry-after', 'x-content-type-options'])
      if (res.headers[h] !== undefined) console.log(`h:${h}=${res.headers[h]}`);
  });
});
req.on('error', (e) => {
  console.log(`status=-1 error=${e.code ?? 'error'}`);
  process.exit(1);
});
if (body) req.write(body);
req.end();
