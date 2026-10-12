import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Drives the REAL stack: Phaser in the browser -> Vite preview proxy -> Fastify API -> PostgreSQL.
 * The game is canvas-rendered, so the game publishes its tap targets as data attributes on
 * #game (`data-hit-targets`); these tests tap those rectangles with real pointer/touch events.
 * The test knows the answer only because it can do multiplication itself; the API never sends it.
 */

interface Target {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** false means scrolled out of view (menu grid only); omitted means always on screen. */
  visible?: boolean;
}

const MIN_TAP = 44; // CSS px; the game targets far more, this is the accessibility floor.

/** The five locked starters, in on-screen order. Click is the host and is NOT selectable. */
const STARTERS = [
  { id: 'dino', name: 'Dino' },
  { id: 'koala', name: 'Koala' },
  { id: 'tarsier', name: 'Tarsier' },
  { id: 'eagle', name: 'Eagle' },
  { id: 'bronco', name: 'Bronco' },
];
const STARTER_IDS = STARTERS.map((s) => `character-${s.id}`);

async function targets(page: Page): Promise<Target[]> {
  const raw = await page.locator('#game').getAttribute('data-hit-targets');
  return JSON.parse(raw ?? '[]') as Target[];
}

async function scene(page: Page): Promise<string> {
  return (await page.locator('#game').getAttribute('data-scene')) ?? '';
}

/** `data-scroll` is "offset/max" for the menu's card grid (the grid scrolls when five cards do not fit). */
async function scrollState(page: Page): Promise<{ offset: number; max: number }> {
  const raw = (await page.locator('#game').getAttribute('data-scroll')) ?? '0/0';
  const [offset, max] = raw.split('/').map(Number);
  return { offset: offset ?? 0, max: max ?? 0 };
}

async function canvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('#game canvas').boundingBox();
  expect(box).toBeTruthy();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/** Scrolls the menu grid with the mouse wheel until the target's centre is on screen. */
async function bringIntoView(page: Page, id: string): Promise<void> {
  const viewportHeight = (await page.evaluate(() => window.innerHeight)) as number;
  for (let i = 0; i < 12; i++) {
    const target = (await targets(page)).find((t) => t.id === id);
    expect(target, `target ${id} should exist`).toBeTruthy();
    if (target!.visible !== false) return;
    const before = (await scrollState(page)).offset;
    const centre = await canvasCenter(page);
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.wheel(0, target!.y + target!.h / 2 < viewportHeight / 2 ? -140 : 140);
    await expect.poll(async () => (await scrollState(page)).offset).not.toBe(before);
  }
  throw new Error(`could not scroll ${id} into view`);
}

/** Tap the centre of a published target with a real touch (phones) or mouse (desktop). */
async function tap(page: Page, id: string): Promise<void> {
  await bringIntoView(page, id);
  const all = await targets(page);
  const target = all.find((t) => t.id === id);
  expect(target, `target ${id} should exist in ${all.map((t) => t.id).join(',')}`).toBeTruthy();
  const box = await page.locator('#game canvas').boundingBox();
  expect(box).toBeTruthy();
  // Targets are published as top-left x/y plus width/height, in canvas CSS pixels.
  const x = box!.x + target!.x + target!.w / 2;
  const y = box!.y + target!.y + target!.h / 2;
  const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function expectNoScrollAndVisible(page: Page, ids: (id: string) => boolean): Promise<void> {
  const m = await page.evaluate(() => ({
    sh: document.documentElement.scrollHeight,
    ih: window.innerHeight,
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  expect(m.sh).toBeLessThanOrEqual(m.ih);
  expect(m.sw).toBeLessThanOrEqual(m.iw);
  const canvas = await page.locator('#game canvas').boundingBox();
  expect(canvas).toBeTruthy();
  const buttons = (await targets(page)).filter((t) => ids(t.id));
  expect(buttons.length).toBeGreaterThan(0);
  for (const t of buttons) {
    expect(t.w, `${t.id} width`).toBeGreaterThanOrEqual(MIN_TAP);
    expect(t.h, `${t.id} height`).toBeGreaterThanOrEqual(MIN_TAP);
    expect(t.x, `${t.id} left edge`).toBeGreaterThanOrEqual(-1);
    expect(t.x + t.w, `${t.id} right edge`).toBeLessThanOrEqual(m.iw + 1);
    expect(t.y, `${t.id} top edge`).toBeGreaterThanOrEqual(-1);
    expect(t.y + t.h, `${t.id} bottom edge`).toBeLessThanOrEqual(m.ih + 1);
  }
}

async function statusText(page: Page): Promise<string> {
  return (await page.locator('#bz-a11y [role="status"]').textContent()) ?? '';
}

async function bootToMenu(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#game[data-phaser-ready="true"]')).toBeAttached();
  await expect.poll(() => scene(page)).toBe('menu');
}

async function waitForQuestion(page: Page): Promise<{ id: string; a: number; b: number; choices: number[] }> {
  await expect(page.locator('#game[data-phase="question"]')).toBeAttached({ timeout: 15_000 });
  const status = await statusText(page);
  const m = /(\d+) × (\d+)/.exec(status);
  expect(m, `status should contain a multiplication prompt: "${status}"`).toBeTruthy();
  const choices = (await page.locator('#bz-a11y button[data-action^="answer-"]').allTextContents()).map(Number);
  expect(choices).toHaveLength(4);
  const id = (await page.locator('#game').getAttribute('data-question-id')) ?? '';
  return { id, a: Number(m![1]), b: Number(m![2]), choices };
}

/**
 * Feedback is transient (the game auto-advances), so a test that polls for it can miss it on a
 * slow machine. Instead, record every feedback state INSIDE the page the moment it is published,
 * keyed by question id, and assert on the record afterwards. This is timing-independent.
 */
async function recordFeedback(page: Page): Promise<void> {
  await page.evaluate(() => {
    const game = document.querySelector('#game') as HTMLElement;
    const status = document.querySelector('#bz-a11y [role="status"]') as HTMLElement;
    const w = window as unknown as { __feedback: Record<string, { correct: string; status: string; progress: string }> };
    w.__feedback = {};
    const capture = () => {
      if (game.dataset['phase'] !== 'feedback') return;
      const id = game.dataset['questionId'] ?? '';
      w.__feedback[id] = {
        correct: game.dataset['lastCorrect'] ?? '',
        status: status.textContent ?? '',
        progress: game.dataset['progress'] ?? '',
      };
    };
    new MutationObserver(capture).observe(game, { attributes: true });
    new MutationObserver(capture).observe(status, { childList: true, characterData: true, subtree: true });
  });
}

async function feedbackFor(page: Page, questionId: string): Promise<{ correct: string; status: string; progress: string }> {
  await expect
    .poll(() => page.evaluate((id) => (window as unknown as { __feedback: Record<string, unknown> }).__feedback[id] !== undefined, questionId), { timeout: 30_000 })
    .toBe(true);
  return page.evaluate((id) => (window as unknown as { __feedback: Record<string, { correct: string; status: string; progress: string }> }).__feedback[id]!, questionId);
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

test('menu: exactly five selectable starters, Dino is the default, and Click is not selectable', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await bootToMenu(page);

  const all = await targets(page);
  expect(all.filter((t) => t.id.startsWith('character-')).map((t) => t.id)).toEqual(STARTER_IDS);
  expect(all.filter((t) => t.id.startsWith('character-')).map((t) => t.label)).toEqual(STARTERS.map((s) => s.name));
  expect(all.map((t) => t.id).sort()).toEqual([...STARTER_IDS, 'start-run'].sort());
  // Click is the host, never a choice: nowhere in the tap targets or the accessible controls.
  expect(all.some((t) => /click/i.test(t.id) || /click/i.test(t.label))).toBe(false);
  const labels = await page.locator('#bz-a11y button').allTextContents();
  expect(labels).toEqual([...STARTERS.map((s) => s.name), 'Start Run']);
  expect(labels.some((l) => /click/i.test(l))).toBe(false);

  // Nothing remembered yet, so the default starter is Dino.
  await expect(page.locator('#game')).toHaveAttribute('data-character', 'dino');
  expect(await statusText(page)).toContain('Dino selected');
  expect(errors).toEqual([]);
});

test('menu: starter cards and Start Run are large, inside the width, and the page never overflows', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await bootToMenu(page);
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
    sh: document.documentElement.scrollHeight,
    ih: window.innerHeight,
  }));
  expect(m.sw, 'no horizontal overflow').toBeLessThanOrEqual(m.iw);
  expect(m.sh, 'the page itself never scrolls').toBeLessThanOrEqual(m.ih);

  const all = await targets(page);
  const cards = all.filter((t) => t.id.startsWith('character-'));
  expect(cards).toHaveLength(5);
  for (const t of cards) {
    // Cards may sit below the fold of the grid, but every one is a full-size, fully-inside-the-width target.
    expect(t.w, `${t.id} width`).toBeGreaterThanOrEqual(MIN_TAP);
    expect(t.h, `${t.id} height`).toBeGreaterThanOrEqual(MIN_TAP);
    expect(t.x, `${t.id} left edge`).toBeGreaterThanOrEqual(-1);
    expect(t.x + t.w, `${t.id} right edge`).toBeLessThanOrEqual(m.iw + 1);
  }
  // The Start action is always on screen, whatever the grid is doing.
  await expectNoScrollAndVisible(page, (id) => id === 'start-run');

  // Phones get a two-column grid (never five cramped cards in a row).
  if (m.iw <= 430) {
    const perRow = new Map<number, number>();
    for (const t of cards) perRow.set(t.y, (perRow.get(t.y) ?? 0) + 1);
    expect(Math.max(...perRow.values())).toBeLessThanOrEqual(2);
    expect(cards.every((t) => t.w >= 148)).toBe(true); // cards are not shrunk to avoid scrolling
  }
  // At least the first row of cards is on screen without any scrolling.
  expect(cards.filter((t) => t.visible).length).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('menu: every starter can be chosen with a real tap, the choice is shown, and it survives a reload', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await bootToMenu(page);
  for (const starter of STARTERS) {
    await tap(page, `character-${starter.id}`);
    await expect(page.locator('#game')).toHaveAttribute('data-character', starter.id);
    await expect.poll(() => statusText(page)).toContain(`${starter.name} selected`);
    expect(await page.evaluate(() => localStorage.getItem('bidazoo.animal'))).toBe(starter.id);
  }

  // Leave a non-default, non-first starter selected and reload: it is remembered.
  await tap(page, 'character-tarsier');
  await page.reload();
  await expect.poll(() => scene(page)).toBe('menu');
  await expect(page.locator('#game')).toHaveAttribute('data-character', 'tarsier');
  expect(await statusText(page)).toContain('Tarsier selected');

  // Choosing is presentation only: it never created or changed anything on the server.
  const me = await (await page.context().request.get('/api/v1/me')).json();
  expect(me.totals).toEqual({ xp: 0, coins: 0 });
  expect(me.activeSessionId).toBeNull();
  expect(errors).toEqual([]);
});

test('menu: legacy panda / monkey / lion values (and junk) safely fall back to Dino', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await bootToMenu(page);
  for (const legacy of ['panda', 'monkey', 'lion', 'click', 'not-a-starter']) {
    await page.evaluate((value) => localStorage.setItem('bidazoo.animal', value), legacy);
    await page.reload();
    await expect.poll(() => scene(page)).toBe('menu');
    await expect(page.locator('#game'), `stored "${legacy}"`).toHaveAttribute('data-character', 'dino');
    expect(await statusText(page)).toContain('Dino selected');
    // The old value is not migrated to some other starter; it is simply ignored.
    expect(await page.evaluate(() => localStorage.getItem('bidazoo.animal'))).toBe(legacy);
  }
  // A real choice afterwards replaces it normally.
  await tap(page, 'character-eagle');
  await expect(page.locator('#game')).toHaveAttribute('data-character', 'eagle');
  expect(await page.evaluate(() => localStorage.getItem('bidazoo.animal'))).toBe('eagle');
  expect(errors).toEqual([]);
});

test('menu: cards that do not fit scroll by wheel and by drag, and Start stays pinned', async ({ page, context }, testInfo) => {
  await bootToMenu(page);
  const { max } = await scrollState(page);
  const startBefore = (await targets(page)).find((t) => t.id === 'start-run')!;

  if (max === 0) {
    // Roomy screens (tablet, desktop, tall phones) need no scrolling at all: every card is on screen.
    const cards = (await targets(page)).filter((t) => t.id.startsWith('character-'));
    expect(cards.every((t) => t.visible === true)).toBe(true);
    return;
  }

  const centre = await canvasCenter(page);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, 5000);
  await expect.poll(async () => (await scrollState(page)).offset).toBe(max);
  let cards = (await targets(page)).filter((t) => t.id.startsWith('character-'));
  const bronco = cards.find((t) => t.id === 'character-bronco')!;
  const start = (await targets(page)).find((t) => t.id === 'start-run')!;
  expect(bronco.visible).toBe(true);
  expect(bronco.y + bronco.h, 'the last card ends above the Start button').toBeLessThanOrEqual(start.y);
  expect(start).toEqual(startBefore); // the Start button did not move

  // Drag the content down with a mouse...
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x, centre.y + 40, { steps: 6 });
  await page.mouse.move(centre.x, centre.y + 90, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await scrollState(page)).offset).toBeLessThan(max);
  // ...and a drag is a scroll, not a selection.
  await expect(page.locator('#game')).toHaveAttribute('data-character', 'dino');

  // On phones, also swipe with real touch events (Chromium DevTools protocol).
  if (testInfo.project.use.hasTouch) {
    const cdp = await context.newCDPSession(page);
    const before = (await scrollState(page)).offset;
    const x = centre.x;
    const y0 = centre.y + 60;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - step * 12 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await scrollState(page)).offset).toBeGreaterThan(before);
    await expect(page.locator('#game')).toHaveAttribute('data-character', 'dino');
  }

  // A tap on a card that needed scrolling still selects it.
  await tap(page, 'character-bronco');
  await expect(page.locator('#game')).toHaveAttribute('data-character', 'bronco');
  cards = (await targets(page)).filter((t) => t.id.startsWith('character-'));
  expect(cards).toHaveLength(5);
});

test('guest identity: HttpOnly cookie, no token readable by JavaScript or in localStorage', async ({ page, context }) => {
  await bootToMenu(page);
  const cookies = await context.cookies();
  const guest = cookies.find((c) => c.name.endsWith('bidazoo_guest'));
  expect(guest, 'guest cookie should be set').toBeTruthy();
  expect(guest!.httpOnly).toBe(true);
  expect(guest!.sameSite).toBe('Lax');
  const readable = await page.evaluate(() => ({ cookie: document.cookie, storage: JSON.stringify({ ...localStorage }) }));
  expect(readable.cookie).not.toContain(guest!.value);
  expect(readable.storage).not.toContain(guest!.value);
});

test('full run: 10 real taps through the real API; server totals match; a miss teaches without punishing', async ({ page, request, context }) => {
  // Headless Chromium without a GPU renders Phaser on the CPU (measured: about 14 fps at 360x640,
  // under 5 fps at 1440x900), so a 10-question run can take minutes there. Real devices are fast.
  test.setTimeout(360_000);
  const errors = collectConsoleErrors(page);
  const apiBodies: string[] = [];
  page.on('response', async (res) => {
    if (res.url().includes('/api/v1/play-sessions') && res.request().method() === 'POST') {
      apiBodies.push(await res.text().catch(() => ''));
    }
  });
  // Everything the browser sends to the API, to prove the starter choice stays presentation-only.
  const apiRequests: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/')) apiRequests.push(`${req.method()} ${req.url()} ${req.postData() ?? ''}`);
  });

  await bootToMenu(page);
  await recordFeedback(page);
  await tap(page, 'character-eagle');
  await expect(page.locator('#game')).toHaveAttribute('data-character', 'eagle');
  await tap(page, 'start-run');

  let sawIncorrectFeedback = false;
  for (let i = 1; i <= 10; i++) {
    const q = await waitForQuestion(page);
    expect(await statusText(page)).toContain(`Question ${i} of 10`);
    // The run screen draws the starter the child picked.
    await expect(page.locator('#game')).toHaveAttribute('data-character', 'eagle');
    // The question and every answer control are visible without scrolling, at every question.
    await expectNoScrollAndVisible(page, (id) => id.startsWith('answer-'));
    expect((await targets(page)).filter((t) => t.id.startsWith('answer-'))).toHaveLength(4);

    const product = q.a * q.b;
    const wrong = i === 4;
    const choice = wrong ? q.choices.find((c) => c !== product)! : product;
    await tap(page, `answer-${q.choices.indexOf(choice)}`);

    const fb = await feedbackFor(page, q.id);
    if (wrong) {
      sawIncorrectFeedback = true;
      expect(fb.correct).toBe('false');
      expect(fb.status).toContain(`The answer is ${product}`);
    } else {
      expect(fb.correct).toBe('true');
      expect(fb.status).toMatch(/Correct\. Plus 10 xp and 2 coins/i);
    }
    expect(fb.progress).toBe(`${i}/10`);
  }
  expect(sawIncorrectFeedback).toBe(true);

  await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('results');
  await expectNoScrollAndVisible(page, (id) => id === 'play-again');
  await expect(page.locator('#game')).toHaveAttribute('data-correct', '9');
  // The results screen features the same starter (it publishes the character it actually drew).
  await expect(page.locator('#game')).toHaveAttribute('data-character', 'eagle');

  // The authoritative numbers come from the server, not from anything the page displays.
  const me = await context.request.get('/api/v1/me');
  expect(me.status()).toBe(200);
  const body = await me.json();
  expect(body.totals).toEqual({ xp: 9 * 10 + 25, coins: 9 * 2 + 10 });
  expect(body.activeSessionId).toBeNull();

  // No answer-key material ever crossed the wire in a question response.
  for (const text of apiBodies.filter((t) => t.includes('"choices"') && !t.includes('"correctAnswer"'))) {
    expect(text).not.toMatch(/answerKey|correctChoice|gradingData|privateGrading/i);
  }
  // The starter choice never went over the wire: no request carried it.
  expect(apiRequests.length).toBeGreaterThan(10);
  for (const request of apiRequests) expect(request).not.toMatch(/eagle|character|avatar|starter/i);
  expect(errors).toEqual([]);
  void request;
});

test('refresh mid-run restores the same question, progress, and server timer', async ({ page, context }) => {
  await bootToMenu(page);
  await recordFeedback(page);
  await tap(page, 'start-run');
  for (let i = 1; i <= 3; i++) {
    const q = await waitForQuestion(page);
    await tap(page, `answer-${q.choices.indexOf(q.a * q.b)}`);
    await feedbackFor(page, q.id);
  }
  const fourth = await waitForQuestion(page);
  const before = await (await context.request.get('/api/v1/me')).json();
  const sessionId: string = before.activeSessionId;
  expect(sessionId).toBeTruthy();
  const sessionBefore = await (await context.request.get(`/api/v1/play-sessions/${sessionId}`)).json();
  expect(sessionBefore.session.answered).toBe(3);
  expect(sessionBefore.session.currentQuestion.id).toBe(fourth.id);

  await page.reload();
  await expect.poll(() => scene(page)).toBe('menu');
  await tap(page, 'start-run'); // resumes the active session
  const restored = await waitForQuestion(page);
  expect(restored.id).toBe(fourth.id);
  expect(restored.choices).toEqual(fourth.choices);
  await expect(page.locator('#game')).toHaveAttribute('data-progress', '3/10');
  expect(await statusText(page)).toContain('Question 4 of 10');

  // The server issued no replacement question, and the same player came back.
  const after = await (await context.request.get(`/api/v1/play-sessions/${sessionId}`)).json();
  expect(after.session.currentQuestion.id).toBe(fourth.id);
  expect(after.session.answered).toBe(3);
  const afterMe = await (await context.request.get('/api/v1/me')).json();
  expect(afterMe.player.id).toBe(before.player.id);
});
