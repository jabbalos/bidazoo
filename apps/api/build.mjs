// Bundles the API into a single dist/server.js.
//
// Why a bundler step: workspace packages (@bidazoo/*) export TypeScript source, which
// plain Node cannot run from node_modules. We inline those, and keep real third-party
// dependencies (fastify, pg, drizzle-orm) external so they load from node_modules.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const external = Object.keys(pkg.dependencies ?? {})
  .filter((name) => !name.startsWith('@bidazoo/'))
  .flatMap((name) => [name, `${name}/*`]);

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external,
  logLevel: 'info',
});
