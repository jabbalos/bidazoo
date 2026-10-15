import { type BrowserContext, type Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * F5: the starter's expression reacts to what the server already decided. These tests drive the REAL
 * stack (Phaser -> Vite preview -> Fastify API -> PostgreSQL) and read the page state the game
 * publishes (`data-expression` on #game). Expressions last a fraction of a second, so nothing here
 * polls for a moment: an in-page recorder logs every published state, and the tests assert on the log.
 *
 * The mapping under test (presentation only):
 *   waiting / loading / error -> idle      submitting -> thinking
 *   correct -> happy                       incorrect -> tryAgain
 *   finished run -> cheer                  finished run with a newly mastered fact -> discover
 */

interface Target {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  visible?: boolean;
}

interface Sample {
  scene: string;
  phase: string;
  expression: string;
  questionId: string;
  correct: string;
  character: string;
  progress: string;
  streak: string;
}

/** The five locked starters, in on-screen order. Click is the host and is NOT selectable. */
const STARTERS = [
  { id: 'dino', name: 'Dino' },
  { id: 'koala', name: 'Koala' },
  { id: 'tarsier', name: 'Tarsier' },
  { id: 'eagle', name: 'Eagle' },
  { id: 'bronco', name: 'Bronco' },
];

/** Nothing about a character or its expression may ever be in a request. */
const FORBIDDEN_IN_REQUESTS = /expression|emotion|mood|thinking|cheer|discover|tryAgain|character|avatar|starter|dino|koala|tarsier|eagle|bronco|click/i;

/** Every starter must pass through these exact (phase | last answer | expression) states. */
const REQUIRED_STATES = [
  'question||discover',
  'question||thinking',
  'submitting||thinking',
  'feedback|true|happy',
  'feedback|false|tryAgain',
];

async function targets(page: Page): Promise<Target[]> {
  const raw = await page.locator('#game').getAttribute('data-hit-targets');
  return JSON.parse(raw ?? '[]') as Target[];
}

async function scene(page: Page): Promise<string> {
  return (await page.locator('#game').getAttribute('data-scene')) ?? '';
}

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

/** Touch on the phone/tablet projects, mouse on desktop: decided only by the Playwright project. */
function tapMode(): 'touch' | 'mouse' {
  return test.info().project.use.hasTouch === true ? 'touch' : 'mouse';
}

async function tap(page: Page, id: string): Promise<void> {
  await bringIntoView(page, id);
  const all = await targets(page);
  const target = all.find((t) => t.id === id);
  expect(target, `target ${id} should exist in ${all.map((t) => t.id).join(',')}`).toBeTruthy();
  const box = await page.locator('#game canvas').boundingBox();
  expect(box).toBeTruthy();
  const x = box!.x + target!.x + target!.w / 2;
  const y = box!.y + target!.y + target!.h / 2;
  if (tapMode() === 'touch') await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
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
  await expect(page.locator('#game[data-phase="question"]')).toBeAttached({ timeout: 90_000 });
  const status = await statusText(page);
  const m = /(\d+) × (\d+)/.exec(status);
  expect(m, `status should contain a multiplication prompt: "${status}"`).toBeTruthy();
  const choices = (await page.locator('#bz-a11y button[data-action^="answer-"]').allTextContents()).map(Number);
  expect(choices).toHaveLength(4);
  const id = (await page.locator('#game').getAttribute('data-question-id')) ?? '';
  return { id, a: Number(m![1]), b: Number(m![2]), choices };
}

// ---------------------------------------------------------------------------
// The recorder: every published expression state, in order, read inside the page.
// ---------------------------------------------------------------------------

async function recordExpressions(page: Page): Promise<void> {
  await page.evaluate(() => {
    const game = document.querySelector('#game') as HTMLElement;
    const w = window as unknown as { __expressions: Array<Record<string, string>> };
    w.__expressions = [];
    const capture = () => {
      const sample = {
        scene: game.dataset['scene'] ?? '',
        phase: game.dataset['phase'] ?? '',
        expression: game.dataset['expression'] ?? '',
        questionId: game.dataset['questionId'] ?? '',
        correct: game.dataset['lastCorrect'] ?? '',
        character: game.dataset['character'] ?? '',
        progress: game.dataset['progress'] ?? '',
        streak: game.dataset['streak'] ?? '',
      };
      // A screen that is not showing a starter publishes no expression: nothing to record.
      if (sample.expression === '') return;
      const last = w.__expressions[w.__expressions.length - 1];
      if (!last || JSON.stringify(last) !== JSON.stringify(sample)) w.__expressions.push(sample);
    };
    new MutationObserver(capture).observe(game, { attributes: true });
    capture();
  });
}

async function samples(page: Page): Promise<Sample[]> {
  return page.evaluate(() => (window as unknown as { __expressions: Sample[] }).__expressions);
}

async function waitForSample(page: Page, find: (s: Sample) => boolean, message: string): Promise<Sample> {
  let found: Sample | undefined;
  await expect
    .poll(
      async () => {
        found = (await samples(page)).find(find);
        return found !== undefined;
      },
      { timeout: 45_000, message },
    )
    .toBe(true);
  return found!;
}

/** What the run screen must show for a recorded state. This is the whole mapping, restated independently. */
function expectedRunExpression(s: Sample): string {
  if (s.phase === 'submitting') return 'thinking';
  if (s.phase === 'feedback') {
    if (s.correct === 'true') return Number(s.streak) >= 3 ? 'cheer' : 'happy';
    return s.correct === 'false' ? 'tryAgain' : 'idle';
  }
  if (s.phase === 'question') return s.progress.startsWith('0/') ? 'discover' : 'thinking'; // the first question discovers, the rest present
  return 'idle';
}

/** Every state the run screen ever published obeys the mapping: no stale, wrong or leftover expression. */
function expectRunMapping(all: Sample[]): void {
  const run = all.filter((s) => s.scene === 'run' || s.scene === 'run-error');
  expect(run.length).toBeGreaterThan(0);
  for (const s of run) {
    expect(s.expression, `${s.scene}/${s.phase}/answer=${s.correct}`).toBe(expectedRunExpression(s));
  }
}

function stateKeys(all: Sample[]): string[] {
  return [...new Set(all.filter((s) => s.scene === 'run' || s.scene === 'run-error').map((s) => `${s.phase}|${s.phase === 'feedback' ? s.correct : ''}|${s.expression}`))];
}

// ---------------------------------------------------------------------------
// What crosses the wire, and what the server counted.
// ---------------------------------------------------------------------------

interface Sent {
  method: string;
  url: string;
  body: string;
}

function captureApiRequests(page: Page): Sent[] {
  const sent: Sent[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      sent.push({ method: request.method(), url: request.url(), body: request.postData() ?? '' });
    }
  });
  return sent;
}

function expectNoCharacterOrExpressionOnTheWire(sent: Sent[]): void {
  expect(sent.length).toBeGreaterThan(0);
  for (const request of sent) {
    expect(`${request.url} ${request.body}`, `${request.method} ${request.url}`).not.toMatch(FORBIDDEN_IN_REQUESTS);
  }
  const answers = sent.filter((r) => r.method === 'POST' && new URL(r.url).pathname.endsWith('/answers'));
  expect(answers.length).toBeGreaterThan(0);
  for (const request of answers) {
    const body = JSON.parse(request.body) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['attemptId', 'questionId', 'response']);
    expect(typeof body['attemptId']).toBe('string');
    expect(typeof body['questionId']).toBe('string');
    expect(typeof body['response']).toBe('number');
  }
  for (const request of sent.filter((r) => r.method === 'POST' && new URL(r.url).pathname === '/api/v1/play-sessions')) {
    expect(JSON.parse(request.body)).toEqual({ gameId: 'zoo-sprint', mode: 'multiplication' });
  }
}

async function serverTotals(context: BrowserContext): Promise<{ totals: { xp: number; coins: number }; activeSessionId: string | null }> {
  const me = await context.request.get('/api/v1/me');
  expect(me.status()).toBe(200);
  return (await me.json()) as { totals: { xp: number; coins: number }; activeSessionId: string | null };
}

/** One correct answer is worth exactly 10 XP and 2 coins; a miss is worth nothing and costs nothing. */
const ONE_RIGHT_ONE_WRONG = { xp: 10, coins: 2 };
/** Nine right and one wrong, plus the finish bonus (the same numbers the full-run test in play.spec.ts expects). */
const NINE_RIGHT_ONE_WRONG = { xp: 9 * 10 + 25, coins: 9 * 2 + 10 };

/** Answers the first nine questions correctly straight through the API, using the page's own guest cookie. */
async function answerNineThroughTheApi(context: BrowserContext): Promise<string> {
  const api = context.request;
  const started = await api.post('/api/v1/play-sessions', { data: { gameId: 'zoo-sprint', mode: 'multiplication' } });
  expect(started.ok()).toBe(true);
  const sessionId = ((await started.json()) as { session: { id: string } }).session.id;
  for (let i = 0; i < 9; i++) {
    const issued = await api.post(`/api/v1/play-sessions/${sessionId}/question`, { data: {} });
    expect(issued.ok()).toBe(true);
    const question = ((await issued.json()) as { question: { id: string; prompt: string } }).question;
    const m = /(\d+) × (\d+)/.exec(question.prompt);
    expect(m, `prompt: ${question.prompt}`).toBeTruthy();
    const answer = await api.post(`/api/v1/play-sessions/${sessionId}/answers`, {
      data: { attemptId: `e2e-${Math.random().toString(36).slice(2, 12)}-${i}`, questionId: question.id, response: Number(m![1]) * Number(m![2]) },
    });
    expect(answer.ok()).toBe(true);
  }
  return sessionId;
}

/** Changes the viewport and waits until the game has laid itself out again. */
async function resizeViewport(page: Page): Promise<void> {
  const before = await page.locator('#game').getAttribute('data-hit-targets');
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: Math.max(320, viewport.width - 24), height: Math.max(480, viewport.height - 48) });
  await expect.poll(() => page.locator('#game').getAttribute('data-hit-targets')).not.toBe(before);
}

// ---------------------------------------------------------------------------
// One test per starter: thinking, a right answer, a wrong answer, all identical.
// ---------------------------------------------------------------------------

for (const starter of STARTERS) {
  test(`expressions: ${starter.name} thinks, is happy on a right answer and tries again on a wrong one, like every starter`, async ({ page, context }) => {
    test.setTimeout(240_000);
    const sent = captureApiRequests(page);
    await bootToMenu(page);
    await tap(page, `character-${starter.id}`);
    await expect(page.locator('#game')).toHaveAttribute('data-character', starter.id);
    await recordExpressions(page);
    await tap(page, 'start-run');

    // Question 1: waiting rests at idle, submitting thinks, a right answer is happy.
    const q1 = await waitForQuestion(page);
    await expect(page.locator('#game')).toHaveAttribute('data-expression', 'discover');
    await expect(page.locator('#game')).toHaveAttribute('data-character', starter.id);
    await tap(page, `answer-${q1.choices.indexOf(q1.a * q1.b)}`);
    await waitForSample(page, (s) => s.questionId === q1.id && s.phase === 'submitting' && s.expression === 'thinking', 'thinking while submitting question 1');
    await waitForSample(page, (s) => s.questionId === q1.id && s.phase === 'feedback' && s.correct === 'true' && s.expression === 'happy', 'happy after the right answer');

    // Question 2: the next question rests at idle again; a wrong answer is tryAgain.
    await expect.poll(async () => (await page.locator('#game').getAttribute('data-question-id')) ?? '', { timeout: 30_000 }).not.toBe(q1.id);
    const q2 = await waitForQuestion(page);
    expect(q2.id).not.toBe(q1.id);
    await expect(page.locator('#game')).toHaveAttribute('data-expression', 'thinking');
    const wrong = q2.choices.find((c) => c !== q2.a * q2.b)!;
    await tap(page, `answer-${q2.choices.indexOf(wrong)}`);
    await waitForSample(page, (s) => s.questionId === q2.id && s.phase === 'submitting' && s.expression === 'thinking', 'thinking while submitting question 2');
    await waitForSample(page, (s) => s.questionId === q2.id && s.phase === 'feedback' && s.correct === 'false' && s.expression === 'tryAgain', 'tryAgain after the wrong answer');

    // Question 3: the temporary states have returned to idle.
    const q3 = await waitForQuestion(page);
    expect(q3.id).not.toBe(q2.id);
    await expect(page.locator('#game')).toHaveAttribute('data-expression', 'thinking');

    // The whole log obeys the mapping, names this starter throughout, and passes through the same states as every other starter.
    const all = await samples(page);
    expectRunMapping(all);
    for (const s of all.filter((x) => x.scene === 'run')) expect(s.character).toBe(starter.id);
    for (const required of REQUIRED_STATES) expect(stateKeys(all), `${starter.name} passes through ${required}`).toContain(required);
    expect(all.some((s) => s.expression === 'cheer')).toBe(false); // no streak of three here, so no cheer on the run screen

    // Presentation only: the server counted one right and one wrong answer, nothing else, and heard nothing about the starter.
    const me = await serverTotals(context);
    expect(me.totals).toEqual(ONE_RIGHT_ONE_WRONG);
    const session = await (await context.request.get(`/api/v1/play-sessions/${me.activeSessionId}`)).json();
    expect(session.session.answered).toBe(2);
    expectNoCharacterOrExpressionOnTheWire(sent);
  });
}

// ---------------------------------------------------------------------------
// THINKING is held while the answer is out, survives a resize, and rebuilds nothing else.
// ---------------------------------------------------------------------------

test('expressions: thinking is held while the answer is out, survives a resize, and loads nothing new', async ({ page, context }) => {
  test.setTimeout(240_000);
  const sent = captureApiRequests(page);
  await bootToMenu(page);
  await expect(page.locator('#game')).toHaveAttribute('data-production-art', '36');
  const images: string[] = [];
  page.on('request', (request) => {
    if (/\.(png|webp|jpe?g|gif|svg)(\?|$)/i.test(new URL(request.url()).pathname)) images.push(request.url());
  });
  await recordExpressions(page);

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/play-sessions/*/answers', async (route) => {
    await gate;
    await route.continue();
  });

  await tap(page, 'start-run');
  const q = await waitForQuestion(page);
  await tap(page, `answer-${q.choices.indexOf(q.a * q.b)}`);
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'submitting');
  await expect(page.locator('#game')).toHaveAttribute('data-expression', 'thinking');

  // Held while the answer is out; a resize rebuilds the screen but not the expression or the game state.
  const before = {
    questionId: await page.locator('#game').getAttribute('data-question-id'),
    progress: await page.locator('#game').getAttribute('data-progress'),
    character: await page.locator('#game').getAttribute('data-character'),
  };
  await resizeViewport(page);
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'submitting');
  await expect(page.locator('#game')).toHaveAttribute('data-expression', 'thinking');
  expect({
    questionId: await page.locator('#game').getAttribute('data-question-id'),
    progress: await page.locator('#game').getAttribute('data-progress'),
    character: await page.locator('#game').getAttribute('data-character'),
  }).toEqual(before);
  await expect(page.locator('#game')).toHaveAttribute('data-production-art', '36');

  // The answer comes back: thinking gives way to the outcome.
  release();
  await waitForSample(page, (s) => s.questionId === q.id && s.phase === 'feedback' && s.correct === 'true' && s.expression === 'happy', 'happy once the answer is back');
  await waitForQuestion(page);
  await expect(page.locator('#game')).toHaveAttribute('data-expression', 'thinking');

  expectRunMapping(await samples(page));
  // Switching expressions loaded no picture: no image was requested at any point after boot.
  expect(images).toEqual([]);
  // One right answer, counted once, and no expression anywhere on the wire.
  expect((await serverTotals(context)).totals).toEqual({ xp: 10, coins: 2 });
  expectNoCharacterOrExpressionOnTheWire(sent);
});

// ---------------------------------------------------------------------------
// A failed submission is not a mood: the error screen rests at idle, and the retry thinks again.
// ---------------------------------------------------------------------------

test('expressions: an error rests at idle, and the retry thinks again and then reacts to the real outcome', async ({ page, context }) => {
  test.setTimeout(240_000);
  const sent = captureApiRequests(page);
  await bootToMenu(page);
  await recordExpressions(page);

  let failed = false;
  await page.route('**/api/v1/play-sessions/*/answers', async (route) => {
    if (!failed) {
      failed = true;
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'server_error', message: 'Something went wrong.' } }) });
    } else {
      await route.continue();
    }
  });

  await tap(page, 'start-run');
  const q = await waitForQuestion(page);
  await tap(page, `answer-${q.choices.indexOf(q.a * q.b)}`);
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'error');
  await expect(page.locator('#game')).toHaveAttribute('data-scene', 'run-error');
  await expect(page.locator('#game')).toHaveAttribute('data-expression', 'idle');

  await tap(page, 'retry');
  await waitForSample(page, (s) => s.questionId === q.id && s.phase === 'feedback' && s.correct === 'true' && s.expression === 'happy', 'happy after the retry succeeds');

  const all = await samples(page);
  expectRunMapping(all);
  expect(stateKeys(all)).toEqual(expect.arrayContaining(['error||idle', 'submitting||thinking', 'feedback|true|happy']));
  // The failed attempt never reached the server, so the retry was the one and only answer.
  expect((await serverTotals(context)).totals).toEqual({ xp: 10, coins: 2 });
  const answers = sent.filter((r) => r.method === 'POST' && new URL(r.url).pathname.endsWith('/answers'));
  expect(answers.length).toBeGreaterThanOrEqual(2);
  expect(new Set(answers.map((r) => (JSON.parse(r.body) as { attemptId: string }).attemptId)).size).toBe(1); // same attempt id: safe to retry
  expectNoCharacterOrExpressionOnTheWire(sent);
});

// ---------------------------------------------------------------------------
// The results screen: CHEER, and the same numbers the server counted.
// ---------------------------------------------------------------------------

test('expressions: a finished run cheers, keeps cheering through a resize, and changes no XP, coins, mastery or saved choice', async ({ page, context }) => {
  test.setTimeout(300_000);
  const sent = captureApiRequests(page);
  await bootToMenu(page);
  await tap(page, 'character-koala');
  await expect(page.locator('#game')).toHaveAttribute('data-character', 'koala');
  const sessionId = await answerNineThroughTheApi(context);
  await recordExpressions(page);

  await tap(page, 'start-run'); // resumes the run at question 10
  await expect(page.locator('#game')).toHaveAttribute('data-progress', '9/10', { timeout: 90_000 });
  const q10 = await waitForQuestion(page);
  const wrong = q10.choices.find((c) => c !== q10.a * q10.b)!;
  await tap(page, `answer-${q10.choices.indexOf(wrong)}`);
  await waitForSample(page, (s) => s.questionId === q10.id && s.phase === 'feedback' && s.correct === 'false' && s.expression === 'tryAgain', 'tryAgain on the last, missed question');

  // The results screen: a resting starter first, then the cheer.
  await expect.poll(() => scene(page), { timeout: 20_000 }).toBe('results');
  await expect(page.locator('#game')).toHaveAttribute('data-expression', 'cheer', { timeout: 60_000 });
  await expect(page.locator('#game')).toHaveAttribute('data-character', 'koala');
  await expect(page.locator('#game')).toHaveAttribute('data-correct', '9');
  const results = (await samples(page)).filter((s) => s.scene === 'results');
  expect(results.map((s) => s.expression)).toEqual(['idle', 'cheer']);
  expect((await samples(page)).some((s) => s.expression === 'discover')).toBe(false); // nothing was newly mastered

  // A resize rebuilds the screen but not the celebration.
  await resizeViewport(page);
  await expect(page.locator('#game')).toHaveAttribute('data-scene', 'results');
  await expect(page.locator('#game')).toHaveAttribute('data-expression', 'cheer');

  // The server's numbers are exactly what the answers earned: expressions changed nothing.
  const me = await serverTotals(context);
  expect(me.totals).toEqual(NINE_RIGHT_ONE_WRONG);
  expect(me.activeSessionId).toBeNull();
  const finished = await (await context.request.get(`/api/v1/play-sessions/${sessionId}`)).json();
  expect(finished.session.status).toBe('completed');
  expect(finished.session.results.correct).toBe(9);
  expect(finished.session.results.newlyMastered).toEqual([]);

  // Play again: the new run starts from a resting starter, not from the cheer.
  await tap(page, 'play-again');
  await expect.poll(() => scene(page)).toBe('run');
  await waitForQuestion(page);
  await expect(page.locator('#game')).toHaveAttribute('data-expression', 'discover');
  const afterAgain = await samples(page);
  expectRunMapping(afterAgain);
  expect(afterAgain.filter((s) => s.scene === 'run').some((s) => s.expression === 'cheer')).toBe(false);

  // The choice and the totals survive a reload, and no expression leaks into the menu.
  await page.reload();
  await expect.poll(() => scene(page)).toBe('menu');
  await expect(page.locator('#game')).toHaveAttribute('data-character', 'koala');
  await expect(page.locator('#game')).not.toHaveAttribute('data-expression', /.*/);
  expect(await page.evaluate(() => localStorage.getItem('bidazoo.animal'))).toBe('koala');
  expect((await serverTotals(context)).totals).toEqual(NINE_RIGHT_ONE_WRONG);
  expectNoCharacterOrExpressionOnTheWire(sent);
});

// ---------------------------------------------------------------------------
// DISCOVER: only when the server's finished run says something was newly mastered.
// ---------------------------------------------------------------------------

test('expressions: a newly mastered fact is a discovery, not a cheer, and the server record is untouched', async ({ page, context }) => {
  test.setTimeout(300_000);
  const sent = captureApiRequests(page);
  await bootToMenu(page);
  await tap(page, 'character-bronco');
  await expect(page.locator('#game')).toHaveAttribute('data-character', 'bronco');
  const sessionId = await answerNineThroughTheApi(context);
  await recordExpressions(page);

  // Fresh players cannot master anything in one run, so the finished run the browser is shown is
  // told it did. Only what the CLIENT receives changes; the server's own record is read back below.
  await page.route('**/api/v1/play-sessions/*/answers', async (route) => {
    const response = await route.fetch();
    const json = (await response.json()) as { session?: { results?: { newlyMastered: string[] } } };
    if (json.session?.results) json.session.results.newlyMastered = ['7 × 8'];
    await route.fulfill({ response, json });
  });

  await tap(page, 'start-run');
  const q10 = await waitForQuestion(page);
  const wrong = q10.choices.find((c) => c !== q10.a * q10.b)!;
  await tap(page, `answer-${q10.choices.indexOf(wrong)}`);

  await expect.poll(() => scene(page), { timeout: 20_000 }).toBe('results');
  await expect(page.locator('#game')).toHaveAttribute('data-expression', 'discover', { timeout: 60_000 });
  await expect(page.locator('#game')).toHaveAttribute('data-character', 'bronco');
  expect(await statusText(page)).toContain('Mastered 7 × 8');
  const results = (await samples(page)).filter((s) => s.scene === 'results');
  expect(results.map((s) => s.expression)).toEqual(['idle', 'discover']); // discover takes precedence: never a cheer first
  expect((await samples(page)).some((s) => s.scene === 'results' && s.expression === 'cheer')).toBe(false);

  // It survives a resize too.
  await resizeViewport(page);
  await expect(page.locator('#game')).toHaveAttribute('data-expression', 'discover');

  // The server's record is exactly what ten real answers produced: nothing mastered, nothing extra awarded.
  const me = await serverTotals(context);
  expect(me.totals).toEqual(NINE_RIGHT_ONE_WRONG);
  const finished = await (await context.request.get(`/api/v1/play-sessions/${sessionId}`)).json();
  expect(finished.session.results.newlyMastered).toEqual([]);
  expect(finished.session.results.correct).toBe(9);
  expectNoCharacterOrExpressionOnTheWire(sent);
});
