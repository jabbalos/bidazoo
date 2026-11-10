#!/usr/bin/env node
/**
 * Sharded Playwright run for continuous integration (proposal 4.2 and 7, integration workspace).
 *
 *   npm run test:e2e:sharded [-- <extra playwright args>]
 *
 * Reads the shard table (default `.bake/shards.json`, override with E2E_SHARDS_FILE): one entry per shard
 * with `Shard`, `Api`, `Play` and `DbE2e`. For each shard it gives Playwright its own API and play ports
 * (E2E_API_PORT / E2E_PLAY_PORT; the identity stack and character lab take the next ports, see
 * tests/e2e/ports.ts), its own throwaway database in DATABASE_URL, its own temp folder (the identity mail
 * outbox lives under the OS temp folder) and its own output folder, then runs `--shard=i/N` of the same
 * suite at the same time.
 *
 * The client and API are built once, before the shards start (E2E_SKIP_BUILD=1 tells the Playwright config
 * not to rebuild them per shard, so three shards never rewrite dist/ under each other's preview servers).
 *
 * This is CI only. It does not change what any spec tests. The unsharded run inside
 * scripts/validate-studio.ps1 stays the release gate.
 *
 * Environment: E2E_PG_URL (default postgres://postgres@127.0.0.1:54330), E2E_SHARDS_FILE, E2E_LOG_DIR
 * (default .bake/logs).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, createWriteStream, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shardsFile = resolve(root, process.env['E2E_SHARDS_FILE'] ?? '.bake/shards.json');
const pgUrl = (process.env['E2E_PG_URL'] ?? 'postgres://postgres@127.0.0.1:54330').replace(/\/+$/, '');
const logDir = resolve(root, process.env['E2E_LOG_DIR'] ?? '.bake/logs');
const extraArgs = process.argv.slice(2);
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

function fail(msg) {
  console.error(`test:e2e:sharded: ${msg}`);
  process.exit(2);
}

if (!existsSync(shardsFile)) fail(`shard table not found: ${shardsFile}`);
const shards = JSON.parse(readFileSync(shardsFile, 'utf8').replace(/^﻿/, ''));
if (!Array.isArray(shards) || shards.length === 0) fail(`no shards in ${shardsFile}`);
for (const s of shards) {
  if (!Number.isInteger(s.Shard) || !Number.isInteger(s.Api) || !Number.isInteger(s.Play) || !/^[a-z0-9_]+$/.test(s.DbE2e ?? '')) {
    fail(`bad shard entry ${JSON.stringify(s)} (needs integer Shard, Api, Play and a lowercase DbE2e)`);
  }
}
mkdirSync(logDir, { recursive: true });

function run(cmd, args, opts = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(cmd, args, { cwd: root, shell: isWin, ...opts, stdio: opts.log ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    if (opts.log) {
      const out = createWriteStream(opts.log);
      const tag = opts.tag ?? '';
      for (const stream of [child.stdout, child.stderr]) {
        stream.on('data', (chunk) => {
          out.write(chunk);
          if (opts.echo) for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) process.stdout.write(`${tag}${line}\n`);
        });
      }
      child.on('close', (code) => out.end(() => resolveRun(code ?? 1)));
    } else {
      child.on('close', (code) => resolveRun(code ?? 1));
    }
  });
}

async function recreateDatabase(name) {
  const client = new pg.Client({ connectionString: `${pgUrl}/postgres` });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${name}`);
  } finally {
    await client.end();
  }
}

const started = Date.now();
console.log(`== build once (api, play, character lab); log ${join(logDir, `${stamp}-sharded-build.log`)}`);
for (const [cmd, args] of [
  [npm, ['run', 'build', '-w', '@bidazoo/api']],
  [npm, ['run', 'build', '-w', '@bidazoo/play']],
  [npm, ['run', 'build:character-lab', '-w', '@bidazoo/play']],
]) {
  const code = await run(cmd, args, { log: join(logDir, `${stamp}-sharded-build-${args[args.length - 1].replace(/\W/g, '')}-${args[1].replace(/\W/g, '')}.log`) });
  if (code !== 0) fail(`build step failed: ${cmd} ${args.join(' ')} (exit ${code})`);
}

for (const s of shards) {
  console.log(`== shard ${s.Shard}: recreate ${s.DbE2e} and migrate`);
  await recreateDatabase(s.DbE2e);
  const code = await run(npm, ['run', 'db:migrate'], {
    env: { ...process.env, DATABASE_URL: `${pgUrl}/${s.DbE2e}` },
    log: join(logDir, `${stamp}-shard${s.Shard}-migrate.log`),
  });
  if (code !== 0) fail(`migration failed for ${s.DbE2e} (exit ${code})`);
}

const total = shards.length;
// The Studio PC also serves the live beta: at most E2E_SHARD_CONCURRENCY browser stacks at once (default 2,
// the owner's limit after the November 9 outage). The rest of the shards queue.
const concurrency = Math.max(1, Math.min(total, Number(process.env['E2E_SHARD_CONCURRENCY'] ?? 2) || 2));
console.log(`== running ${total} shards, at most ${concurrency} at a time`);
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
const results = await pool(shards, concurrency, async (s, i) => {
  {
    const shardTmp = join(root, 'tests', 'test-results', `shard-${s.Shard}`, 'tmp');
    rmSync(join(root, 'tests', 'test-results', `shard-${s.Shard}`), { recursive: true, force: true });
    mkdirSync(shardTmp, { recursive: true });
    const jsonReport = join(logDir, `${stamp}-shard${s.Shard}-report.json`);
    const log = join(logDir, `${stamp}-shard${s.Shard}-playwright.log`);
    const env = {
      ...process.env,
      CI: '1',
      E2E_SKIP_BUILD: '1',
      E2E_API_PORT: String(s.Api),
      E2E_PLAY_PORT: String(s.Play),
      DATABASE_URL: `${pgUrl}/${s.DbE2e}`,
      E2E_OUTPUT_DIR: join(root, 'tests', 'test-results', `shard-${s.Shard}`, 'out'),
      TEMP: shardTmp,
      TMP: shardTmp,
      TMPDIR: shardTmp,
      PLAYWRIGHT_JSON_OUTPUT_NAME: jsonReport,
    };
    delete env['PW_CHROMIUM_EXECUTABLE'];
    const code = await run(
      npm,
      ['run', 'test:e2e', '-w', '@bidazoo/tests', '--', `--shard=${i + 1}/${total}`, '--reporter=list,json', ...extraArgs],
      { env, log, echo: true, tag: `[shard ${s.Shard}] ` },
    );
    let stats = null;
    try {
      stats = JSON.parse(readFileSync(jsonReport, 'utf8')).stats;
    } catch {
      /* report missing: counted as a failure below */
    }
    return { shard: s.Shard, code, log, stats };
  }
});

console.log('');
let failed = 0;
const sum = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
for (const r of results) {
  const st = r.stats;
  if (st) for (const k of Object.keys(sum)) sum[k] += st[k] ?? 0;
  const ok = r.code === 0 && st !== null;
  if (!ok) failed++;
  console.log(
    `shard ${r.shard}: ${ok ? 'PASS' : `FAIL (exit ${r.code})`}  ` +
      (st ? `passed ${st.expected}, failed ${st.unexpected}, flaky ${st.flaky}, skipped ${st.skipped}` : 'no report') +
      `  log ${r.log}`,
  );
}
const minutes = ((Date.now() - started) / 60000).toFixed(1);
console.log(`total: passed ${sum.expected}, failed ${sum.unexpected}, flaky ${sum.flaky}, skipped ${sum.skipped}; ${minutes} min`);
console.log(failed === 0 ? 'SHARDED E2E PASSED' : 'SHARDED E2E FAILED');
process.exit(failed === 0 ? 0 : 1);
