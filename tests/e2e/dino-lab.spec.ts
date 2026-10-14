import { type Page } from '@playwright/test';
import { computeExpressionPlacement } from '../../games/zoo-sprint/src/character-assets';
import { EXPRESSION_STATES, type ExpressionState } from '../../games/zoo-sprint/src/character-definitions';
import { expect, test } from './fixtures';
import { LAB_PORT } from './lab-env';

/**
 * Checkpoint F3, Lane B + Lane A: proves in a real browser, under the real client CSP, that Dino's
 * six production expressions load as ordinary same-origin images, can all be shown, and stay put.
 *
 * Uses the developer-only lab build (`npm run build:character-lab -w @bidazoo/play`, served on its
 * own port). The lab has no platform access, so nothing here can touch questions, XP, or coins.
 * The shared fixture still fails every test on a CSP violation, console error, or page error.
 */
test.use({ baseURL: `http://127.0.0.1:${LAB_PORT}` });

const MIN_TAP = 44;
const PNG_SIGNATURE = '89504e470d0a1a0a';

interface Geometry {
  id: string;
  expression: ExpressionState;
  production: boolean;
  textureKey: string;
  displayWidth: number;
  displayHeight: number;
  anchorX: number;
  anchorY: number;
  size: number;
  worldEyeY: number;
  worldX: number;
  bounds: { x: number; y: number; w: number; h: number };
}
interface Target {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

async function attr(page: Page, name: string): Promise<string> {
  return (await page.locator('#game').getAttribute(name)) ?? '';
}
async function geometry(page: Page): Promise<Geometry[]> {
  return JSON.parse(await attr(page, 'data-lab-geometry')) as Geometry[];
}
async function openLab(page: Page, query = ''): Promise<void> {
  await page.goto(`/?character-lab${query}`);
  await expect(page.locator('#game')).toHaveAttribute('data-scene', 'character-lab');
  await expect(page.locator('#game')).toHaveAttribute('data-lab-ready', 'true');
}
async function tap(page: Page, id: string): Promise<void> {
  const targets = JSON.parse(await attr(page, 'data-hit-targets')) as Target[];
  const target = targets.find((t) => t.id === id);
  expect(target, `target ${id}`).toBeTruthy();
  const box = await page.locator('#game canvas').boundingBox();
  expect(box).toBeTruthy();
  const x = box!.x + target!.x + target!.w / 2;
  const y = box!.y + target!.y + target!.h / 2;
  if (test.info().project.use.hasTouch === true) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env['BZ_SHOTS_DIR'];
  if (!dir) return;
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${dir}/${test.info().project.name}__${name}.png` });
}

test.describe('Dino production expressions (lab build)', () => {
  test('all six expressions load as production art and stay anchored', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/')) apiCalls.push(pathname);
    });
    await openLab(page);
    expect(await attr(page, 'data-production-art')).toBe('6');

    const viewport = page.viewportSize()!;
    const seen: Geometry[] = [];
    for (const state of EXPRESSION_STATES) {
      await tap(page, `lab-state-${state}`);
      await expect(page.locator('#game')).toHaveAttribute('data-lab-state', state);
      const [look] = await geometry(page);
      expect(look, state).toBeTruthy();
      expect(look!.expression).toBe(state);
      expect(look!.production, `${state} uses production art`).toBe(true);
      expect(look!.textureKey).toBe(`bz-we-character-dino-${state}`);
      seen.push(look!);
      await shot(page, state);
    }

    // The placement the scene actually produced equals the contract's rule, at the real bust size.
    for (const look of seen) {
      const placement = computeExpressionPlacement('dino', look.expression, look.size)!;
      expect(Math.abs(look.displayWidth - placement.displayWidth), `${look.expression} width`).toBeLessThan(0.5);
      expect(Math.abs(look.displayHeight - placement.displayHeight), `${look.expression} height`).toBeLessThan(0.5);
    }
    // One scale for all six (no head-size jump) and the eye line and head center never move.
    const scales = seen.map((look) => look.displayWidth / computeExpressionPlacement('dino', look.expression, look.size)!.displayWidth);
    expect(Math.max(...scales) - Math.min(...scales)).toBeLessThan(0.005);
    const eyes = seen.map((look) => look.worldEyeY);
    const columns = seen.map((look) => look.worldX);
    expect(Math.max(...eyes) - Math.min(...eyes), 'eye line stays on one row').toBeLessThan(0.5);
    expect(Math.max(...columns) - Math.min(...columns), 'head center stays in one column').toBeLessThan(0.5);

    // Nothing clipped by the screen or by the bust box.
    for (const look of seen) {
      const half = look.size / 2;
      const cx = look.worldX;
      const cy = look.worldEyeY - (look.anchorY - 0); // container center y = worldEyeY - anchorY
      expect(look.bounds.x, `${look.expression} left`).toBeGreaterThanOrEqual(0);
      expect(look.bounds.y, `${look.expression} top`).toBeGreaterThanOrEqual(0);
      expect(look.bounds.x + look.bounds.w, `${look.expression} right`).toBeLessThanOrEqual(viewport.width);
      expect(look.bounds.y + look.bounds.h, `${look.expression} bottom`).toBeLessThanOrEqual(viewport.height);
      expect(look.bounds.x, `${look.expression} inside box left`).toBeGreaterThanOrEqual(cx - half - 1);
      expect(look.bounds.x + look.bounds.w, `${look.expression} inside box right`).toBeLessThanOrEqual(cx + half + 1);
      expect(look.bounds.y, `${look.expression} inside box top`).toBeGreaterThanOrEqual(cy - half - 1);
      expect(look.bounds.y + look.bounds.h, `${look.expression} inside box bottom`).toBeLessThanOrEqual(cy + half + 1);
    }

    // The page does not scroll, and the six buttons are real, reachable tap targets.
    const page$ = await page.evaluate(() => ({
      sh: document.documentElement.scrollHeight,
      ih: window.innerHeight,
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    expect(page$.sh).toBeLessThanOrEqual(page$.ih);
    expect(page$.sw).toBeLessThanOrEqual(page$.iw);
    const targets = (JSON.parse(await attr(page, 'data-hit-targets')) as Target[]).filter((t) => t.id.startsWith('lab-state-'));
    expect(targets.map((t) => t.id)).toEqual(EXPRESSION_STATES.map((s) => `lab-state-${s}`));
    for (const t of targets) {
      expect(t.w, `${t.id} width`).toBeGreaterThanOrEqual(MIN_TAP);
      expect(t.h, `${t.id} height`).toBeGreaterThanOrEqual(MIN_TAP);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w).toBeLessThanOrEqual(viewport.width);
      expect(t.y + t.h).toBeLessThanOrEqual(viewport.height);
    }

    // Switching expressions is presentation only: the lab never talks to the platform API.
    expect(apiCalls.filter((path) => path !== '/api/v1/device'), 'no platform calls from the lab').toEqual([]);
  });

  test('loads each PNG once, as a real same-origin image, and nothing else', async ({ page }) => {
    const pngRequests: string[] = [];
    const responses: Array<{ url: string; status: number; type: string; signature: string }> = [];
    page.on('request', (request) => {
      if (/\.png(\?|$)/.test(request.url())) pngRequests.push(new URL(request.url()).pathname);
    });
    page.on('response', async (response) => {
      if (!/\.png(\?|$)/.test(response.url())) return;
      const body = await response.body();
      responses.push({
        url: new URL(response.url()).pathname,
        status: response.status(),
        type: response.headers()['content-type'] ?? '',
        signature: body.subarray(0, 8).toString('hex'),
      });
    });
    await openLab(page);

    // Exactly the six Dino PNGs, each requested once (no duplicate loads), all real PNG bytes.
    expect(pngRequests.length).toBe(6);
    expect(new Set(pngRequests).size).toBe(6);
    expect(pngRequests.sort().map((p) => p.replace(/^\/assets\/(dino_[A-Za-z]+)-[^.]+\.png$/, '$1')).sort()).toEqual(
      EXPRESSION_STATES.map((state) => `dino_${state}`).sort(),
    );
    await expect.poll(() => responses.length).toBe(6);
    for (const response of responses) {
      expect(response.status, response.url).toBe(200);
      expect(response.type, response.url).toBe('image/png');
      expect(response.signature, `${response.url} is a real PNG, not LFS pointer text`).toBe(PNG_SIGNATURE);
    }

    // The browser reports how each file was fetched: an <img> element, not XHR/fetch (which would be a blob: image).
    const entries = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((entry) => /\.png/.test(entry.name))
        .map((entry) => ({ name: new URL(entry.name).pathname, initiator: (entry as PerformanceResourceTiming).initiatorType })),
    );
    expect(entries.length).toBe(6);
    for (const entry of entries) expect(entry.initiator, entry.name).toBe('img');
  });

  test('strip view: all six at once share one scale and one eye line', async ({ page }) => {
    await openLab(page, '&view=strip');
    expect(await attr(page, 'data-lab-view')).toBe('strip');
    const looks = await geometry(page);
    expect(looks.map((look) => look.expression)).toEqual([...EXPRESSION_STATES]);
    for (const look of looks) {
      expect(look.production).toBe(true);
      const placement = computeExpressionPlacement('dino', look.expression, look.size)!;
      expect(Math.abs(look.displayWidth - placement.displayWidth)).toBeLessThan(0.5);
      expect(Math.abs(look.displayHeight - placement.displayHeight)).toBeLessThan(0.5);
      // Local anchor is the same fraction of the bust box in every cell.
      expect(look.anchorY / look.size).toBeCloseTo(computeExpressionPlacement('dino', look.expression, look.size)!.y / look.size, 5);
    }
    expect(new Set(looks.map((look) => look.size)).size).toBe(1);
    await shot(page, 'strip');
  });

  test('negative control: Phaser default XHR loading IS blocked by the CSP, so the guard and the fix are real', async ({ page, problems }) => {
    test.info().annotations.push({ type: 'expects-csp-violation', description: 'XHR image loading creates blob: URLs, which img-src forbids' });
    const methods: string[] = [];
    await page.goto('/?character-lab&loader=xhr');
    await expect(page.locator('#game')).toHaveAttribute('data-lab-ready', 'true');
    await expect.poll(() => problems.some((p) => /Refused to load the image 'blob:[^']+' because it violates .*img-src 'self' data:/.test(p))).toBe(true);
    // No texture survives, so the lab (and the game) would fall back to code-drawn art.
    expect(await attr(page, 'data-production-art')).toBe('0');
    const initiators = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((entry) => /\.png/.test(entry.name))
        .map((entry) => (entry as PerformanceResourceTiming).initiatorType),
    );
    methods.push(...initiators);
    expect(methods.length).toBeGreaterThan(0);
    for (const initiator of methods) expect(initiator).not.toBe('img');
  });
});
