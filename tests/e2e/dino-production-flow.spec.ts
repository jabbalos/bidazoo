import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Checkpoint F3: Dino's production art inside the REAL game (the normal build, real API).
 * The shared fixture fails every test on a CSP violation, console error, or page error.
 *
 * "Is this really the production art?" is answered two ways: the boot hook reports how many
 * production textures are loaded, and the canvas is checked for the production orange spike color
 * (#F54A05 family), which the old code-drawn Dino (#FF8A2B) never contains.
 */
interface Target {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const PNG_SIGNATURE = '89504e470d0a1a0a';

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

test.describe('Dino production art in the real game', () => {
  test('boot loads the six production textures once, and the menu draws Dino from them', async ({ page }) => {
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
    await expect(page.locator('#game')).toHaveAttribute('data-production-art', '6');

    // Six distinct Dino PNGs, one request each, all real PNG bytes. No other character art is fetched.
    expect(pngRequests).toHaveLength(6);
    expect(new Set(pngRequests).size).toBe(6);
    for (const path of pngRequests) expect(path).toMatch(/^\/assets\/dino_(idle|happy|thinking|cheer|discover|tryAgain)-[\w-]+\.png$/);
    await expect.poll(() => pngResponses.length).toBe(6);
    for (const response of pngResponses) {
      expect(response.status).toBe(200);
      expect(response.type).toBe('image/png');
      expect(response.signature).toBe(PNG_SIGNATURE);
    }

    // The menu's Dino card is drawn from production art (spike orange is present).
    await page.waitForTimeout(400);
    const orange = await productionOrangePixels(page);
    test.info().annotations.push({ type: 'production-orange-pixels', description: String(orange) });
    expect(orange, 'production Dino spikes are visible on the menu').toBeGreaterThan(40);
    await shot(page, 'menu');

    // Art selection is presentation only: nothing about it is sent to the API.
    for (const url of apiUrls) expect(url, 'API request').not.toMatch(/dino|expression|texture|production|art/i);
  });

  test('if the art cannot be loaded the game still starts, with the code-drawn fallback', async ({ page }) => {
    await page.route('**/assets/dino_*.png', (route) => route.abort());
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

  test('the character lab does not exist in the normal build', async ({ page }) => {
    await page.goto('/?character-lab&state=cheer');
    await expect.poll(() => scene(page)).toBe('menu');
    for (const name of ['data-lab-ready', 'data-lab-state', 'data-lab-geometry', 'data-lab-view']) {
      expect(await page.locator('#game').getAttribute(name), name).toBeNull();
    }
    expect(await page.locator('#bz-a11y button[data-action^="lab-"]').count()).toBe(0);
    const html = await page.content();
    expect(html).not.toMatch(/expression lab/i);
  });

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
      await expect(page.locator('#game[data-phase="question"]')).toBeAttached({ timeout: 15_000 });
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
      await expect(page.locator('#game')).not.toHaveAttribute('data-question-id', id, { timeout: 15_000 }).catch(() => undefined);
      if (i < 9) await expect(page.locator('#game[data-phase="question"]')).toBeAttached({ timeout: 15_000 });
    }
    await expect.poll(() => scene(page), { timeout: 30_000 }).toBe('results');
    await page.waitForTimeout(500);
    expect(await productionOrangePixels(page), 'Dino on the results screen is production art').toBeGreaterThan(20);
    await shot(page, 'results');
  });
});
