import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Checkpoints F3 + F4: the cast's production art inside the REAL game (the normal build, real API).
 * The shared fixture fails every test on a CSP violation, console error, or page error.
 *
 * "Is this really the production art?" is answered three ways: the boot hook reports how many
 * production textures are loaded (36 = six characters x six expressions); every starter card on the
 * menu is compared pixel-for-pixel with the same card rendered from the code-drawn fallback and must
 * look different; and (for Dino, the F3 reference) the canvas holds the production spike orange
 * (#F54A05 family), which the old code-drawn Dino (#FF8A2B) never contains.
 *
 * Click (the host and guide) ships art, but is never a selectable starter: no menu hit target, no
 * accessible control, and nothing about him is stored or sent to the API.
 */
interface Target {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const PNG_SIGNATURE = '89504e470d0a1a0a';
const STARTER_IDS = ['dino', 'koala', 'tarsier', 'eagle', 'bronco'] as const;
const CAST_IDS = [...STARTER_IDS, 'click'] as const;
const PNG_PATH = /^\/assets\/(dino|koala|tarsier|eagle|bronco|click)_(idle|happy|thinking|cheer|discover|tryAgain)-[\w-]+\.png$/;
/** Aborts every cast PNG (the art cannot be loaded). */
const ALL_ART = '**/assets/{dino,koala,tarsier,eagle,bronco,click}_*.png';

async function targets(page: Page): Promise<Target[]> {
  return JSON.parse((await page.locator('#game').getAttribute('data-hit-targets')) ?? '[]') as Target[];
}
async function scene(page: Page): Promise<string> {
  return (await page.locator('#game').getAttribute('data-scene')) ?? '';
}
async function tap(page: Page, id: string): Promise<void> {
  const target = (await targets(page)).find((t) => t.id === id);
  expect(target, `target ${id}`).toBeTruthy();
  const box = await page.locator('#game canvas').boundingBox();
  const x = box!.x + target!.x + target!.w / 2;
  const y = box!.y + target!.y + target!.h / 2;
  if (test.info().project.use.hasTouch === true) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env['BZ_SHOTS_DIR'];
  if (!dir) return;
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${dir}/${test.info().project.name}__flow-${name}.png` });
}

/** How many pixels of the page's canvas are the production Dino spike orange (decoded in a throwaway tab). */
async function productionOrangePixels(page: Page): Promise<number> {
  const png = await page.locator('#game canvas').screenshot();
  const helper = await page.context().newPage();
  try {
    return await helper.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const g = canvas.getContext('2d')!;
      g.drawImage(image, 0, 0);
      const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i]! - 245) <= 16 && Math.abs(data[i + 1]! - 74) <= 26 && Math.abs(data[i + 2]! - 5) <= 26) count += 1;
      }
      return count;
    }, png.toString('base64'));
  } finally {
    await helper.close();
  }
}


interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Hit-target rectangles of the five starter cards, in CSS pixels of the canvas. */
async function starterCards(page: Page): Promise<Record<string, Rect>> {
  const all = await targets(page);
  const cards: Record<string, Rect> = {};
  for (const id of STARTER_IDS) {
    const t = all.find((candidate) => candidate.id === `character-${id}`);
    expect(t, `menu card for ${id}`).toBeTruthy();
    cards[id] = { x: t!.x, y: t!.y, w: t!.w, h: t!.h };
  }
  return cards;
}

/** A screenshot of the canvas plus its CSS width (to convert hit-target rectangles to image pixels). */
async function canvasShot(page: Page): Promise<{ base64: string; cssWidth: number }> {
  const box = await page.locator('#game canvas').boundingBox();
  const png = await page.locator('#game canvas').screenshot();
  return { base64: png.toString('base64'), cssWidth: box!.width };
}

/**
 * For each card, the fraction of its pixels that differ noticeably between two canvas screenshots.
 * 0 means identical; around 1 means a different picture. Decoded in a throwaway tab.
 */
async function cardDifference(
  page: Page,
  a: { base64: string; cssWidth: number },
  b: { base64: string; cssWidth: number },
  cards: Record<string, Rect>,
): Promise<Record<string, number>> {
  const helper = await page.context().newPage();
  try {
    return await helper.evaluate(
      async ({ a, b, cards }) => {
        const load = async (base64: string): Promise<ImageData> => {
          const image = new Image();
          image.src = `data:image/png;base64,${base64}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const g = canvas.getContext('2d')!;
          g.drawImage(image, 0, 0);
          return g.getImageData(0, 0, canvas.width, canvas.height);
        };
        const [first, second] = await Promise.all([load(a.base64), load(b.base64)]);
        const scale = first.width / a.cssWidth;
        const result: Record<string, number> = {};
        for (const [id, r] of Object.entries(cards)) {
          const x0 = Math.max(0, Math.floor(r.x * scale));
          const y0 = Math.max(0, Math.floor(r.y * scale));
          const x1 = Math.min(first.width, Math.ceil((r.x + r.w) * scale));
          const y1 = Math.min(first.height, Math.ceil((r.y + r.h) * scale));
          let differing = 0;
          let total = 0;
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const i = (y * first.width + x) * 4;
              const d = Math.abs(first.data[i]! - second.data[i]!) + Math.abs(first.data[i + 1]! - second.data[i + 1]!) + Math.abs(first.data[i + 2]! - second.data[i + 2]!);
              if (d > 48) differing += 1;
              total += 1;
            }
          }
          result[id] = total === 0 ? 0 : differing / total;
        }
        return result;
      },
      { a, b, cards },
    );
  } finally {
    await helper.close();
  }
}

async function openMenu(page: Page, expectedArt: string): Promise<void> {
  await page.goto('/');
  await expect.poll(() => scene(page)).toBe('menu');
  await expect(page.locator('#game')).toHaveAttribute('data-production-art', expectedArt);
  await page.waitForTimeout(500);
}

test.describe('Cast production art in the real game', () => {
  test('boot loads the 36 production textures once, and the menu draws the starters from them', async ({ page }) => {
    const pngRequests: string[] = [];
    const apiUrls: string[] = [];
    const pngResponses: Array<{ url: string; status: number; type: string; signature: string }> = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (/\.png$/.test(url.pathname)) pngRequests.push(url.pathname);
      if (url.pathname.startsWith('/api/')) apiUrls.push(url.pathname + url.search);
    });
    page.on('response', async (response) => {
      if (!/\.png$/.test(new URL(response.url()).pathname)) return;
      const body = await response.body();
      pngResponses.push({ url: response.url(), status: response.status(), type: response.headers()['content-type'] ?? '', signature: body.subarray(0, 8).toString('hex') });
    });

    await page.goto('/');
    await expect.poll(() => scene(page)).toBe('menu');
    await expect(page.locator('#game')).toHaveAttribute('data-production-art', '36');

    // 36 distinct cast PNGs (6 characters x 6 expressions), one request each, all real PNG bytes. No other PNG is fetched.
    expect(pngRequests).toHaveLength(36);
    expect(new Set(pngRequests).size).toBe(36);
    for (const path of pngRequests) expect(path).toMatch(PNG_PATH);
    const pairs = pngRequests.map((path) => path.replace(PNG_PATH, '$1_$2')).sort();
    expect(pairs).toEqual(CAST_IDS.flatMap((id) => ['idle', 'happy', 'thinking', 'cheer', 'discover', 'tryAgain'].map((state) => `${id}_${state}`)).sort());
    await expect.poll(() => pngResponses.length).toBe(36);
    for (const response of pngResponses) {
      expect(response.status, response.url).toBe(200);
      expect(response.type, response.url).toBe('image/png');
      expect(response.signature, `${response.url} is a real PNG, not LFS pointer text`).toBe(PNG_SIGNATURE);
    }

    // The menu's Dino card is drawn from production art (spike orange is present).
    await page.waitForTimeout(400);
    const orange = await productionOrangePixels(page);
    test.info().annotations.push({ type: 'production-orange-pixels', description: String(orange) });
    expect(orange, 'production Dino spikes are visible on the menu').toBeGreaterThan(40);
    await shot(page, 'menu');

    // Art selection is presentation only: nothing about it is sent to the API.
    for (const url of apiUrls) expect(url, 'API request').not.toMatch(/dino|koala|tarsier|eagle|bronco|click|expression|texture|production|art/i);
  });

  test('every starter card on the menu is drawn from production art, not the code-drawn fallback', async ({ page }) => {
    await openMenu(page, '36');
    const cards = await starterCards(page);
    const production = await canvasShot(page);

    // The same menu, drawn twice from production art, is the same picture: the comparison below is meaningful.
    const again = await canvasShot(page);
    const noise = await cardDifference(page, production, again, cards);
    for (const id of STARTER_IDS) expect(noise[id], `${id} card is stable between two screenshots`).toBeLessThan(0.02);

    // The same menu with every cast PNG blocked draws the code-drawn busts instead.
    const fallbackPage = await page.context().newPage();
    try {
      await fallbackPage.route(ALL_ART, (route) => route.abort());
      await openMenu(fallbackPage, '0');
      const fallback = await canvasShot(fallbackPage);
      const diff = await cardDifference(page, production, fallback, cards);
      test.info().annotations.push({ type: 'card-difference', description: JSON.stringify(diff) });
      for (const id of STARTER_IDS) expect(diff[id], `${id} card differs from the code-drawn fallback`).toBeGreaterThan(0.08);
    } finally {
      await fallbackPage.close();
    }
  });

  test('Click ships art but is not a starter: no menu target, no accessible control, nothing stored', async ({ page }) => {
    await openMenu(page, '36');
    const ids = (await targets(page)).map((t) => t.id);
    expect(ids).toEqual([...STARTER_IDS.map((id) => `character-${id}`), 'start-run']);
    expect(ids.join(' ')).not.toMatch(/click/i);
    const labels = await page.locator('#bz-a11y button').allTextContents();
    expect(labels).toHaveLength(6);
    expect(labels.join(' ')).not.toMatch(/click/i);
    expect(await page.locator('#bz-a11y button[data-action*="click" i]').count()).toBe(0);
    // Choosing a starter stores that starter and nothing about Click.
    await tap(page, 'character-eagle');
    await expect(page.locator('#game')).toHaveAttribute('data-character', 'eagle');
    const stored = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    expect(JSON.stringify(stored)).not.toMatch(/click/i);
    // A saved "click" (e.g. hand-edited storage) is ignored, never honored.
    await page.evaluate(() => localStorage.setItem('bidazoo.animal', 'click'));
    await page.reload();
    await expect.poll(() => scene(page)).toBe('menu');
    await expect(page.locator('#game')).toHaveAttribute('data-character', 'dino');
  });

  test('if the art cannot be loaded the game still starts, with the code-drawn fallback', async ({ page }) => {
    await page.route(ALL_ART, (route) => route.abort());
    await page.goto('/');
    await expect.poll(() => scene(page)).toBe('menu');
    await expect(page.locator('#game')).toHaveAttribute('data-production-art', '0');
    await page.waitForTimeout(400);
    const orange = await productionOrangePixels(page);
    test.info().annotations.push({ type: 'fallback-orange-pixels', description: String(orange) });
    expect(orange, 'no production art on screen').toBeLessThan(10);
    // Starter selection still works with the fallback art.
    await tap(page, 'character-koala');
    await expect(page.locator('#game')).toHaveAttribute('data-character', 'koala');
    await shot(page, 'fallback-menu');
  });

  test('a character is never drawn half in production art: one missing file sends that character back to its fallback', async ({ page }) => {
    await openMenu(page, '36');
    const cards = await starterCards(page);
    const production = await canvasShot(page);

    const partial = await page.context().newPage();
    try {
      await partial.route('**/assets/koala_cheer-*.png', (route) => route.abort());
      await openMenu(partial, '35');
      const withoutKoala = await canvasShot(partial);
      const diff = await cardDifference(page, production, withoutKoala, cards);
      test.info().annotations.push({ type: 'card-difference', description: JSON.stringify(diff) });
      expect(diff['koala'], 'Koala falls back as a whole').toBeGreaterThan(0.08);
      for (const id of ['dino', 'tarsier', 'eagle', 'bronco'] as const) expect(diff[id], `${id} is unaffected`).toBeLessThan(0.02);
      // The game works with a mixed cast.
      await tap(partial, 'character-koala');
      await expect(partial.locator('#game')).toHaveAttribute('data-character', 'koala');
    } finally {
      await partial.close();
    }
  });

  test('the character lab does not exist in the normal build', async ({ page }) => {
    await page.goto('/?character-lab&state=cheer&cast=click');
    await expect.poll(() => scene(page)).toBe('menu');
    for (const name of ['data-lab-ready', 'data-lab-state', 'data-lab-cast', 'data-lab-geometry', 'data-lab-view']) {
      expect(await page.locator('#game').getAttribute(name), name).toBeNull();
    }
    expect(await page.locator('#bz-a11y button[data-action^="lab-"]').count()).toBe(0);
    const html = await page.content();
    expect(html).not.toMatch(/expression lab/i);
  });

  for (const id of ['koala', 'tarsier', 'eagle', 'bronco'] as const) {
    test(`a run with ${id} starts and takes an answer, with the production art loaded`, async ({ page }) => {
      test.setTimeout(120_000);
      await openMenu(page, '36');
      await tap(page, `character-${id}`);
      await expect(page.locator('#game')).toHaveAttribute('data-character', id);
      await tap(page, 'start-run');
      await expect.poll(() => scene(page)).toBe('run');
      await expect(page.locator('#game[data-phase="question"]')).toBeAttached({ timeout: 60_000 });
      expect(await page.locator('#game').getAttribute('data-production-art')).toBe('36');
      const status = (await page.locator('#bz-a11y [role="status"]').textContent()) ?? '';
      const m = /(\d+) × (\d+)/.exec(status)!;
      const choices = (await page.locator('#bz-a11y button[data-action^="answer-"]').allTextContents()).map(Number);
      const qid = (await page.locator('#game').getAttribute('data-question-id')) ?? '';
      await tap(page, `answer-${choices.indexOf(Number(m[1]) * Number(m[2]))}`);
      await expect(page.locator('#game')).not.toHaveAttribute('data-question-id', qid, { timeout: 60_000 });
      await shot(page, `run-${id}`);
    });
  }

  test('a run with Dino reaches the results screen, with Dino on every screen', async ({ page }) => {
    // Ten real taps through the real API, software-rendered: same allowance as the full-run test in play.spec.ts.
    test.setTimeout(360_000);
    await page.goto('/');
    await expect.poll(() => scene(page)).toBe('menu');
    await tap(page, 'character-dino');
    await expect(page.locator('#game')).toHaveAttribute('data-character', 'dino');
    await tap(page, 'start-run');
    await expect.poll(() => scene(page)).toBe('run');
    await page.waitForTimeout(500);
    expect(await productionOrangePixels(page), 'Dino on the run screen is production art').toBeGreaterThan(20);
    await shot(page, 'run');

    for (let i = 0; i < 10; i++) {
      await expect(page.locator('#game[data-phase="question"]')).toBeAttached({ timeout: 60_000 });
      const status = (await page.locator('#bz-a11y [role="status"]').textContent()) ?? '';
      const m = /(\d+) × (\d+)/.exec(status)!;
      const choices = (await page.locator('#bz-a11y button[data-action^="answer-"]').allTextContents()).map(Number);
      const right = Number(m[1]) * Number(m[2]);
      // Question 2 is answered wrongly on purpose, to exercise the gentle tryAgain expression.
      const pick = i === 1 ? choices.findIndex((c) => c !== right) : choices.indexOf(right);
      const id = (await page.locator('#game').getAttribute('data-question-id')) ?? '';
      await tap(page, `answer-${pick}`);
      if (i === 0) await shot(page, 'run-correct');
      if (i === 1) await shot(page, 'run-miss');
      await expect(page.locator('#game')).not.toHaveAttribute('data-question-id', id, { timeout: 60_000 }).catch(() => undefined);
      if (i < 9) await expect(page.locator('#game[data-phase="question"]')).toBeAttached({ timeout: 60_000 });
    }
    await expect.poll(() => scene(page), { timeout: 30_000 }).toBe('results');
    await page.waitForTimeout(500);
    expect(await productionOrangePixels(page), 'Dino on the results screen is production art').toBeGreaterThan(20);
    await shot(page, 'results');
  });
});
