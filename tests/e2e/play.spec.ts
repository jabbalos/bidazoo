import { expect, test, type Page } from '@playwright/test';

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
}

const MIN_TAP = 44; // CSS px; the game targets far more, this is the accessibility floor.

async function targets(page: Page): Promise<Target[]> {
  const raw = await page.locator('#game').getAttribute('data-hit-targets');
  return JSON.parse(raw ?? '[]') as Target[];
}

async function scene(page: Page): Promise<string> {
  return (await page.locator('#game').getAttribute('data-scene')) ?? '';
}

/** Tap the centre of a published target with a real touch (phones) or mouse (desktop). */
async function tap(page: Page, id: string): Promise<void> {
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

test('menu: animals and Start Run are visible, large, and need no scrolling', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await bootToMenu(page);
  await expectNoScrollAndVisible(page, (id) => id === 'start-run' || id.startsWith('animal-'));
  const ids = (await targets(page)).map((t) => t.id);
  expect(ids).toEqual(expect.arrayContaining(['animal-panda', 'animal-monkey', 'animal-lion', 'start-run']));
  expect(errors).toEqual([]);
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

  await bootToMenu(page);
  await recordFeedback(page);
  await tap(page, 'animal-monkey');
  await tap(page, 'start-run');

  let sawIncorrectFeedback = false;
  for (let i = 1; i <= 10; i++) {
    const q = await waitForQuestion(page);
    expect(await statusText(page)).toContain(`Question ${i} of 10`);
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
