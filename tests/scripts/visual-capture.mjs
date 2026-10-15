#!/usr/bin/env node
/**
 * Visual QA capture for BidaZoo World Expedition (presentation review, not a pass/fail test).
 *
 * Drives the BUILT play app (`npm run build -w @bidazoo/play`, then `vite preview`) in headless
 * Chromium and screenshots the critical screens at several viewports. The platform API is replaced
 * with a small deterministic fake by intercepting /api/* in the browser, so the REAL game code and
 * the REAL HTTP platform client run, and nothing on the server (or in the contracts) is touched.
 *
 *   node tests/scripts/visual-capture.mjs --label after --out visual-qa
 *
 * Options (all optional):
 *   --base   http://127.0.0.1:4173     where the preview server is
 *   --out    visual-qa                 output root; files go to <out>/<label>/<viewport>/
 *   --label  after                     folder name ("before" / "after")
 *   --only   phone-390x844,desktop     comma list of viewport names to run
 *   --exe    /path/to/chromium         else PW_CHROMIUM_EXECUTABLE, else Playwright's own Chromium
 * Env: PW_CHROMIUM_ARGS  extra Chromium flags, space separated (for example swiftshader WebGL flags).
 *
 * Alongside the PNGs it writes report.json: canvas size, document overflow, the page's published
 * data-* hooks, and (when the build publishes them) the rendered character rectangles.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://127.0.0.1:4173');
const OUT = resolve(arg('out', 'visual-qa'));
const LABEL = arg('label', 'after');
const ONLY = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const EXE = arg('exe', process.env['PW_CHROMIUM_EXECUTABLE']);
/** 'all' (default) or 'select' (only the character-select screens, for quick iteration). */
const STEPS = arg('steps', 'all');
/** Only these starters in the select sweep (comma list), default all five. */
const ONLY_STARTERS = arg('starters', '').split(',').map((s) => s.trim()).filter(Boolean);
const EXTRA_ARGS = (process.env['PW_CHROMIUM_ARGS'] ?? '').split(/\s+/).filter(Boolean);

const VIEWPORTS = [
  { name: 'phone-360x640', width: 360, height: 640, dpr: 2, mobile: true },
  { name: 'phone-390x844', width: 390, height: 844, dpr: 2, mobile: true },
  { name: 'phone-landscape-844x390', width: 844, height: 390, dpr: 2, mobile: true },
  { name: 'tablet-820x1180', width: 820, height: 1180, dpr: 2, mobile: true },
  { name: 'desktop-1280x800', width: 1280, height: 800, dpr: 1, mobile: false },
];
const STARTERS = ['dino', 'koala', 'tarsier', 'eagle', 'bronco'];

// ---------------------------------------------------------------------------
// A tiny deterministic stand-in for the API (shapes follow packages/contracts).
// ---------------------------------------------------------------------------

const FACTS = [
  [6, 7], [8, 4], [9, 6], [7, 7], [5, 8], [3, 9], [6, 6], [4, 7], [8, 8], [9, 9],
];

function uuid(n) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function createFakeApi(opts = {}) {
  const slow = { ms: opts.slowMs ?? 0 };
  const state = { answered: 0, correct: 0, xp: 340, coins: 125, qIndex: -1, lastQuestion: null, completed: false };
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 3600_000).toISOString();

  const question = () => {
    const [a, b] = FACTS[state.answered % FACTS.length];
    const right = a * b;
    const pool = [right, right + a, right - b, right + b + 2].map((n) => Math.max(1, n));
    const rot = state.answered % 4;
    const choices = pool.map((_, i) => pool[(i + rot) % 4]);
    return { id: uuid(100 + state.answered), sequence: state.answered + 1, prompt: `${a} × ${b}`, type: 'multipleChoice', choices, _right: right };
  };
  const publicQuestion = (q) => ({ id: q.id, sequence: q.sequence, prompt: q.prompt, type: q.type, choices: q.choices });

  const session = (q) => ({
    id: uuid(1),
    gameId: 'zoo-sprint',
    mode: 'multiplication',
    status: state.completed ? 'completed' : 'active',
    total: 10,
    answered: state.answered,
    correct: state.correct,
    startedAt: now,
    expiresAt: later,
    completedAt: state.completed ? now : null,
    currentQuestion: q ? publicQuestion(q) : null,
    results: state.completed
      ? {
          correct: state.correct,
          total: 10,
          fluent: Math.min(state.correct, 6),
          xpEarned: state.correct * 10 + 20,
          coinsEarned: state.correct * 2 + 10,
          bonus: { xp: 20, coins: 10 },
          newlyMastered: ['6 × 7', '9 × 6'],
          answers: Array.from({ length: 10 }, (_, i) => ({ sequence: i + 1, prompt: `${FACTS[i][0]} × ${FACTS[i][1]}`, correct: i !== 2, fluent: i % 2 === 0 })),
        }
      : null,
  });

  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  return {
    slow,
    state,
    currentRight: () => (state.lastQuestion ? state.lastQuestion._right : null),
    currentChoices: () => (state.lastQuestion ? state.lastQuestion.choices : []),
    async handle(route) {
      const url = new URL(route.request().url());
      const method = route.request().method();
      const path = url.pathname;
      if (path.endsWith('/device')) return json(route, 404, { error: { code: 'not_found', message: 'off' } });
      if (path.endsWith('/guest')) return json(route, 200, { player: { id: uuid(9), nickname: 'Explorer' }, totals: { xp: state.xp, coins: state.coins }, activeSessionId: null });
      if (path.endsWith('/play-sessions') && method === 'POST') {
        state.lastQuestion = question();
        return json(route, 200, { session: session(state.lastQuestion), resumed: false });
      }
      if (path.endsWith('/question')) {
        state.lastQuestion = state.lastQuestion ?? question();
        return json(route, 200, { question: publicQuestion(state.lastQuestion), session: session(state.lastQuestion) });
      }
      if (path.endsWith('/answers')) {
        const body = JSON.parse(route.request().postData() ?? '{}');
        if (slow.ms) await new Promise((r) => setTimeout(r, slow.ms));
        const q = state.lastQuestion;
        const correct = body.response === q._right;
        state.answered += 1;
        if (correct) {
          state.correct += 1;
          state.xp += 10;
          state.coins += 2;
        }
        state.completed = state.answered >= 10;
        const next = state.completed ? null : question();
        const result = {
          questionId: q.id,
          correct,
          fluent: correct && state.answered % 2 === 1,
          responseMs: 1800,
          correctAnswer: q._right,
          rewards: correct ? [{ kind: 'xp', amount: 10, reason: 'correct_answer' }, { kind: 'coins', amount: 2, reason: 'correct_answer' }] : [],
          mastery: { label: q.prompt, box: 1, streak: correct ? 1 : 0, fluentDays: 0, mastered: false, nextReviewAt: later },
          totals: { xp: state.xp, coins: state.coins },
          session: session(next),
          replayed: false,
        };
        state.lastQuestion = next;
        return json(route, 200, result);
      }
      return json(route, 404, { error: { code: 'not_found', message: 'unmocked' } });
    },
  };
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hooks(page) {
  return page.evaluate(() => {
    const el = document.getElementById('game');
    const out = {};
    for (const a of el.getAttributeNames()) if (a.startsWith('data-') && a !== 'data-hit-targets') out[a.slice(5)] = el.getAttribute(a);
    let targets = [];
    try {
      targets = JSON.parse(el.getAttribute('data-hit-targets') ?? '[]');
    } catch {
      targets = [];
    }
    const canvas = el.querySelector('canvas');
    const de = document.documentElement;
    return {
      attrs: out,
      targets,
      canvas: canvas ? { cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, width: canvas.width, height: canvas.height } : null,
      overflow: { scrollW: de.scrollWidth, clientW: de.clientWidth, scrollH: de.scrollHeight, clientH: de.clientHeight },
    };
  });
}

/** Polls a published data-* hook from Node. (The page CSP forbids eval, so waitForFunction is not usable.) */
async function waitAttr(page, key, value, timeout = 15000) {
  const end = Date.now() + timeout;
  for (;;) {
    const h = await hooks(page);
    if (h.attrs[key] === value) return h;
    if (Date.now() > end) throw new Error(`timed out waiting for data-${key}="${value}" (now "${h.attrs[key]}"; attrs ${JSON.stringify(h.attrs)}; targets ${h.targets.map((t) => t.id).join(",")})`);
    await sleep(100);
  }
}

async function tap(page, id) {
  const { targets, canvas } = await hooks(page);
  const t = targets.find((x) => x.id === id);
  if (!t) throw new Error(`no hit target "${id}" (have: ${targets.map((x) => x.id).join(', ')})`);
  const box = await page.locator('#game canvas').boundingBox();
  const x = box.x + t.x + t.w / 2;
  const y = box.y + t.y + t.h / 2;
  await page.mouse.click(x, y);
  return { t, canvas };
}

async function shot(page, dir, name, report) {
  const file = join(dir, `${name}.png`);
  await page.screenshot({ path: file });
  const h = await hooks(page);
  report.shots.push({ name, file, ...h });
  return h;
}

// ---------------------------------------------------------------------------
// One viewport
// ---------------------------------------------------------------------------

async function runViewport(browser, vp) {
  const dir = join(OUT, LABEL, vp.name);
  await mkdir(dir, { recursive: true });
  const report = { viewport: vp, shots: [], problems: [] };
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (process.env.VDEBUG && m.type() !== 'log') console.log('C', m.type(), m.text().slice(0,300)); if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) { report.problems.push(`console: ${m.text()}`); if (process.env.VDEBUG) console.log('CONSOLE', m.text()); }
  });
  page.on('pageerror', (e) => { report.problems.push(`pageerror: ${e.message}`); if (process.env.VDEBUG) console.log('PAGEERROR', e.message, e.stack); });

  const api = createFakeApi({ slowMs: 4000 });
  await page.route('**/api/**', (route) => api.handle(route));

  await page.goto(BASE + '/');
  await waitAttr(page, 'scene', 'menu', 30000);
  await sleep(1500); // art + first idle settle

  let n = 1;
  const num = () => String(n++).padStart(2, '0');

  // 1-5: character select, each starter
  for (const id of STARTERS) {
    if (ONLY_STARTERS.length && !ONLY_STARTERS.includes(id)) continue;
    if (id !== 'dino') {
      await tap(page, `character-${id}`);
      await sleep(1600); // let the ~1 s selection celebration finish
    }
    await shot(page, dir, `${num()}-select-${id}`, report);
  }
  if (STEPS === 'select') {
    await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2));
    await context.close();
    return report;
  }
  // back to Dino (the default) for the run
  await tap(page, 'character-dino');
  await sleep(1600);

  // 6: gameplay question
  await tap(page, 'start-run');
  if (process.env.VDEBUG) for (let i = 0; i < 10; i++) { await sleep(500); const hh = await hooks(page); console.log('dbg', i, hh.attrs.scene, hh.attrs.phase); }
  await waitAttr(page, 'phase', 'question', 90000); // software GL at DPR 2 runs the 1 s celebration timer slowly
  await sleep(1500);
  await shot(page, dir, `${num()}-run-question`, report);

  // 7: submitting (thinking) — the fake API holds the answer for 700 ms
  const choices1 = api.currentChoices();
  const right1 = api.currentRight();
  const wrongIdx = choices1.findIndex((c) => c !== right1);
  await tap(page, `answer-${wrongIdx}`);
  await sleep(250);
  await shot(page, dir, `${num()}-run-submitting`, report);

  // 8: incorrect-answer / tryAgain
  api.slow.ms = 300;
  await waitAttr(page, 'phase', 'feedback', 60000);
  await sleep(500);
  await shot(page, dir, `${num()}-run-tryagain`, report);

  // next question, then a correct answer
  await waitAttr(page, 'phase', 'question', 20000);
  await sleep(900);
  let right = api.currentRight();
  let choices = api.currentChoices();
  await tap(page, `answer-${choices.indexOf(right)}`);
  await waitAttr(page, 'phase', 'feedback');
  await sleep(450);
  await shot(page, dir, `${num()}-run-correct`, report);

  // play the rest of the run correctly (a streak), grabbing one more reaction on the way
  let streakShot = false;
  for (let guard = 0; guard < 80; guard++) {
    const h = await hooks(page);
    if (h.attrs['scene'] === 'results') break;
    if (h.attrs['phase'] === 'question') {
      await sleep(350);
      right = api.currentRight();
      choices = api.currentChoices();
      await tap(page, `answer-${choices.indexOf(right)}`);
      await sleep(900);
      if (!streakShot) {
        const h2 = await hooks(page);
        if (h2.attrs['phase'] === 'feedback') {
          await shot(page, dir, `${num()}-run-streak`, report);
          streakShot = true;
        }
      }
    } else {
      await sleep(400);
    }
  }
  await waitAttr(page, 'scene', 'results', 240000);
  await sleep(1800); // celebration
  await shot(page, dir, `${num()}-results`, report);

  await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2));
  await context.close();
  return report;
}

async function main() {
  await mkdir(join(OUT, LABEL), { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXE || undefined,
    args: EXTRA_ARGS,
    headless: true,
  });
  const summary = [];
  for (const vp of VIEWPORTS) {
    if (ONLY.length && !ONLY.some((o) => vp.name.includes(o))) continue;
    process.stdout.write(`[visual] ${LABEL} ${vp.name} ... `);
    try {
      const r = await runViewport(browser, vp);
      summary.push({ viewport: vp.name, shots: r.shots.length, problems: r.problems });
      console.log(`${r.shots.length} shots${r.problems.length ? `, ${r.problems.length} problem(s)` : ''}`);
    } catch (err) {
      summary.push({ viewport: vp.name, error: String(err) });
      console.log(`FAILED: ${err}`);
    }
  }
  await browser.close();
  await writeFile(join(OUT, LABEL, 'summary.json'), JSON.stringify(summary, null, 2));
  if (summary.some((s) => s.error)) process.exitCode = 1;
}

await main();
