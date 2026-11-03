// LAYER A harness. Throwaway, NOT part of the repository build. Reports ONLY derived values.
// Fastify is configured exactly like the API with TRUST_PROXY=loopback.
// It answers GET /api/observe and nothing else, and EXITS BY ITSELF after OBSERVE_MAX_SECONDS.
//   OBSERVE_FASTIFY_FROM = path to <checkout>\apps\api\package.json (to load the same Fastify)
//   OBSERVE_PORT (default 3101), OBSERVE_MAX_SECONDS (default 600), OBSERVE_HOST (default play.bidazoo.com)
import { createRequire } from 'node:module';

const from = process.env.OBSERVE_FASTIFY_FROM;
if (!from) throw new Error('Set OBSERVE_FASTIFY_FROM to the path of apps/api/package.json in the checkout');
const port = Number(process.env.OBSERVE_PORT ?? '3101');
const maxSeconds = Number(process.env.OBSERVE_MAX_SECONDS ?? '600');
const expectHost = process.env.OBSERVE_HOST ?? 'play.bidazoo.com';
const Fastify = createRequire(from)('fastify');
const app = Fastify({ trustProxy: ['loopback'], logger: false });

app.get('/api/observe', async (request, reply) => {
  const xff = request.headers['x-forwarded-for'];
  const entries = typeof xff === 'string' && xff.trim() !== '' ? xff.split(',').map((s) => s.trim()) : [];
  void reply.header('cache-control', 'no-store');
  return {
    ip: request.ip,
    protocol: request.protocol,
    hostname: request.hostname,
    hostnameIsExpected: request.hostname === expectHost,
    socketRemote: request.socket.remoteAddress,
    xffEntryCount: entries.length,
    xffSingleEntryEqualsIp: entries.length === 1 && entries[0] === request.ip,
  };
});
app.setNotFoundHandler((_req, reply) => reply.code(404).send());

await app.listen({ host: '127.0.0.1', port });
console.log(`observe: listening on 127.0.0.1:${port}; will exit by itself in ${maxSeconds}s`);
setTimeout(() => {
  console.log('observe: time limit reached, exiting');
  void app.close().then(() => process.exit(0));
}, maxSeconds * 1000).unref();
process.on('SIGINT', () => void app.close().then(() => process.exit(0)));
