#!/usr/bin/env node
/**
 * Screenshots and measurements for the exploration spike (build: npm run build:world-spike -w
 * @bidazoo/play; serve: npm run preview:world-spike -w @bidazoo/play). Drives the spike with real
 * key presses, records hook values (player/camera x, landmark proximity), and saves PNGs.
 *
 *   node tests/scripts/explore-capture.mjs --out <dir> [--base http://127.0.0.1:4174] [--exe <chromium>] [--buddy dino] [--only phone-390x844,desktop-1280x800]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (n, f) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : f; };
const BASE = arg('base', 'http://127.0.0.1:4174');
const OUT = resolve(arg('out', 'explore-qa'));
const BUDDY = arg('buddy', 'dino');
const EXE = arg('exe', process.env['PW_CHROMIUM_EXECUTABLE']);
const ONLY = arg('only', '').split(',').filter(Boolean);
const EXTRA = (process.env['PW_CHROMIUM_ARGS'] ?? '').split(/\s+/).filter(Boolean);
const VIEWPORTS = [
  { name: 'phone-390x844', width: 390, height: 844, dpr: 2, mobile: true },
  { name: 'phone-360x640', width: 360, height: 640, dpr: 2, mobile: true },
  { name: 'desktop-1280x800', width: 1280, height: 800, dpr: 1, mobile: false },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const attrs = (page) => page.evaluate(() => Object.fromEntries([...document.querySelector('#game').attributes].map((a) => [a.name.replace(/^data-/, ''), a.value])));

async function until(page, pred, ms, what) {
  const t0 = Date.now();
  for (;;) {
    const a = await attrs(page);
    if (pred(a)) return a;
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}: ${JSON.stringify(a)}`);
    await sleep(150);
  }
}

async function run(browser, vp) {
  const dir = join(OUT, vp.name);
  await mkdir(dir, { recursive: true });
  const report = { viewport: vp, steps: [], problems: [] };
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, isMobile: vp.mobile, hasTouch: vp.mobile });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) report.problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => report.problems.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/?explore=1&buddy=${BUDDY}`);
  await until(page, (a) => a.scene === 'explore' && a['buddy-rect'], 60000, 'explore scene');
  await sleep(1500);
  const snap = async (name, note) => {
    await page.screenshot({ path: join(dir, `${name}.png`) });
    const a = await attrs(page);
    report.steps.push({ name, note, playerX: Number(a['player-x']), cameraX: Number(a['camera-x']), near: a.near, facing: a.facing, moved: a.moved, buddy: a['buddy-rect'], click: a['click-rect'], layers: a.layers });
  };
  await snap('01-start', 'buddy at the start, scenery, HUD, hint');
  const startX = Number((await attrs(page))['player-x']);
  await page.keyboard.down('ArrowRight');
  await until(page, (a) => Number(a['player-x']) > startX + vp.height * 0.5, 60000, 'walk right');
  await page.keyboard.up('ArrowRight');
  await sleep(900);
  await snap('02-walked', 'after walking right: the camera has followed');
  await page.keyboard.down('ArrowRight');
  await until(page, (a) => a.near === 'signpost', 90000, 'signpost');
  await page.keyboard.up('ArrowRight');
  await sleep(1200);
  await snap('03-signpost', 'at the signpost landmark');
  await page.keyboard.down('ArrowRight');
  await until(page, (a) => a.near === 'gate', 120000, 'gate');
  // keep walking until Click is fully on screen, then stop
  await until(page, (a) => { try { const c = JSON.parse(a['click-rect']); return c.x > 0 && c.x + c.w < vp.width; } catch { return false; } }, 60000, 'Click on screen');
  await page.keyboard.up('ArrowRight');
  await sleep(1500);
  await snap('04-gate-click', 'at the gate, Click beside it speaks');
  await page.keyboard.down('ArrowLeft');
  const gx = Number((await attrs(page))['player-x']);
  await until(page, (a) => Number(a['player-x']) < gx - vp.height * 0.25, 60000, 'walk left');
  await page.keyboard.up('ArrowLeft');
  await sleep(900);
  await snap('05-walk-left', 'walking back: facing flips, camera follows left');
  await ctx.close();
  await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2));
  return report;
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', ...EXTRA] });
let failed = false;
for (const vp of VIEWPORTS) {
  if (ONLY.length && !ONLY.includes(vp.name)) continue;
  try {
    const r = await run(browser, vp);
    console.log(vp.name, 'OK', r.steps.map((s) => `${s.name}:x=${s.playerX}/cam=${s.cameraX}/${s.near || '-'}`).join(' '), r.problems.length ? `PROBLEMS ${r.problems.join('|')}` : '');
  } catch (e) {
    failed = true;
    console.log(vp.name, 'FAILED', e.message);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
