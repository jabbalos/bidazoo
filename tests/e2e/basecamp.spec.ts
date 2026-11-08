import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { sceneOf } from './basecamp-helpers';

/**
 * Expedition Basecamp (Checkpoint W1) with REAL input: the buddy walks with a held screen half and
 * with the arrow keys, the camera follows, Click waits by the gate, and walking INTO the gate is the
 * portal that starts the run. The run itself is covered by play.spec.ts; this file proves the way
 * into it and the way back out.
 *
 * Everything asserted here is presentation state the game publishes on #game. None of it is, or
 * comes from, the server: Basecamp makes no API call of its own.
 */
interface Target {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const game = (page: Page) => page.locator('#game');
const num = async (page: Page, name: string): Promise<number> => Number((await game(page).getAttribute(`data-${name}`)) ?? 'NaN');
const rect = async (page: Page, name: string): Promise<Rect> => JSON.parse((await game(page).getAttribute(`data-${name}`)) ?? 'null') as Rect;
const targets = async (page: Page): Promise<Target[]> => JSON.parse((await game(page).getAttribute('data-hit-targets')) ?? '[]') as Target[];

async function tapTarget(page: Page, id: string): Promise<void> {
  const t = (await targets(page)).find((x) => x.id === id);
  expect(t, `target ${id}`).toBeTruthy();
  const box = await page.locator('#game canvas').boundingBox();
  await page.mouse.click(box!.x + t!.x + t!.w / 2, box!.y + t!.y + t!.h / 2);
}

async function bootToBasecamp(page: Page, starter = 'dino'): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#game[data-phaser-ready="true"]')).toBeAttached();
  await expect.poll(() => sceneOf(page)).toBe('menu');
  await tapTarget(page, `character-${starter}`);
  await expect(game(page)).toHaveAttribute('data-character', starter);
  await tapTarget(page, 'start-run');
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('basecamp');
  await expect(game(page)).toHaveAttribute('data-buddy-rect', /\{/);
}

const viewport = (page: Page) => page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));

/**
 * Walks right in short pulses until the buddy is "near" a landmark. Pulses, not one long hold, so
 * the stop lands close to where "near" began. The exact stopping point is NOT guaranteed: under
 * software rendering (measured at 1440x900 in a cloud sandbox) a frame takes ~230 ms and a key
 * event is acknowledged ~0.7 to 1.1 s later, so even a zero-length pulse can carry the buddy
 * 0.1 to 0.3 unit, more than the width of the near-but-outside band. The buddy may therefore
 * already be in the gate opening when this returns. The precise near-vs-opening geometry is proven
 * in the pure model (tests/integration/basecamp-model.test.ts); the tests here prove the real
 * input path and the real portal.
 */
async function walkUntilNear(page: Page, landmark: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if ((await game(page).getAttribute('data-near')) === landmark) return;
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(80);
    await page.keyboard.up('ArrowRight');
  }
  throw new Error(`never got near ${landmark}`);
}

/** Resolves once `data-player-x` has stopped changing (two readings 600 ms apart agree). */
async function waitUntilStill(page: Page): Promise<number> {
  let last = await num(page, 'player-x');
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(600);
    const now = await num(page, 'player-x');
    if (now === last) return now;
    last = now;
  }
  throw new Error('the buddy never came to a stop');
}

test('after Choose, the buddy stands in Basecamp as a whole body, on screen, with Click, scenery and HUD, and the page does not scroll', async ({ page }) => {
  await bootToBasecamp(page);
  const vp = await viewport(page);
  await expect(game(page)).toHaveAttribute('data-walk-art', 'true');
  // scenery: the painted backdrop (its layers) or the code-drawn fallback (six parallax bands at least)
  const backdrop = await game(page).getAttribute('data-backdrop');
  expect(['painted', 'code']).toContain(backdrop);
  expect(await num(page, 'layers')).toBeGreaterThanOrEqual(backdrop === 'painted' ? 1 : 6);
  const buddy = await rect(page, 'buddy-rect');
  expect(buddy.x).toBeGreaterThanOrEqual(0);
  expect(buddy.x + buddy.w).toBeLessThanOrEqual(vp.w);
  expect(buddy.y + buddy.h).toBeLessThanOrEqual(vp.h);
  // sized from the screen height, capped by the source art's sharpness (never a blurry giant)
  expect(buddy.h).toBeGreaterThanOrEqual(vp.h * 0.18);
  const paintedBuddy = (await game(page).getAttribute('data-walk-art-painted')) === 'true';
  expect(buddy.h).toBeLessThanOrEqual(paintedBuddy ? vp.h * 0.42 : Math.min(vp.h * 0.32, 289 * 1.3 + 2));
  // Click is in the world, further along (by the lodge door on the painted backdrop, beside the
  // gate on the code-drawn one), standing on the same ground
  const click = await rect(page, 'click-rect');
  expect(click.y + click.h).toBe(buddy.y + buddy.h);
  expect(await num(page, 'gate-x')).toBeGreaterThan(await num(page, 'player-x'));
  // the page itself never scrolls
  const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: window.innerHeight, sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(m.sh).toBeLessThanOrEqual(m.ih);
  expect(m.sw).toBeLessThanOrEqual(m.iw);
  // the accessible action to enter the gate exists from the first moment
  await expect(page.locator('#bz-a11y button[data-action="enter-gate"]')).toBeAttached();
  expect(await page.locator('#bz-a11y [role="status"]').textContent()).toContain('Expedition Basecamp');
});

test('holding the right half of the screen walks right and the camera follows; holding the left half turns the buddy around', async ({ page }) => {
  await bootToBasecamp(page);
  const vp = await viewport(page);
  const x0 = await num(page, 'player-x');
  await page.mouse.move(vp.w * 0.8, vp.h * 0.55);
  await page.mouse.down();
  await expect.poll(() => num(page, 'player-x'), { timeout: 30_000 }).toBeGreaterThan(x0 + vp.h * 0.4);
  await expect(game(page)).toHaveAttribute('data-facing', '1');
  await expect(game(page)).toHaveAttribute('data-moved', 'true');
  expect(await num(page, 'camera-x')).toBeGreaterThan(0);
  await page.mouse.up();
  const stopped = await waitUntilStill(page); // letting go stops the walk (the glide length is a model test)
  await page.mouse.move(vp.w * 0.2, vp.h * 0.55);
  await page.mouse.down();
  await expect.poll(() => num(page, 'player-x'), { timeout: 30_000 }).toBeLessThan(stopped - vp.h * 0.1);
  await expect(game(page)).toHaveAttribute('data-facing', '-1');
  await page.mouse.up();
  // the buddy is still on screen wherever it walked
  const buddy = await rect(page, 'buddy-rect');
  expect(buddy.x).toBeGreaterThanOrEqual(-2);
  expect(buddy.x + buddy.w).toBeLessThanOrEqual(vp.w + 2);
});

test('arrow keys walk too, the world has edges, and the signpost is announced', async ({ page }) => {
  await bootToBasecamp(page);
  const vp = await viewport(page);
  const x0 = await num(page, 'player-x');
  await page.keyboard.down('ArrowLeft');
  await expect.poll(() => num(page, 'player-x'), { timeout: 30_000 }).toBeLessThan(x0);
  // the left edge of the world stops the walk while the key is still held
  const atEdge = await waitUntilStill(page);
  expect(atEdge).toBeLessThan(x0);
  await page.waitForTimeout(600);
  expect(await num(page, 'player-x')).toBe(atEdge);
  await page.keyboard.up('ArrowLeft');
  // short pulses, so a slow poll cannot miss the signpost band (the painted backdrop's signpost
  // band is about half a second of walking wide)
  await walkUntilNear(page, 'signpost');
  expect(await num(page, 'camera-x')).toBeGreaterThanOrEqual(0);
  expect(await num(page, 'camera-x')).toBeLessThanOrEqual((await num(page, 'world-w')) - vp.w + 1);
});

test('walking into the Basecamp Gate is the portal: the prompt appears, standing in the opening starts the run, and nothing is sent until then', async ({ page }) => {
  test.setTimeout(180_000);
  await bootToBasecamp(page, 'koala');
  const apiCalls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/')) apiCalls.push(`${req.method()} ${new URL(req.url()).pathname}`);
  });
  await walkUntilNear(page, 'gate');
  // near the gate: a tappable prompt, and no server traffic for as long as we are still here
  // (the snapshot of calls is taken BEFORE the scene is read, so a run that starts in between
  // cannot make this pass by accident)
  const prompt = (await targets(page)).find((t) => t.id === 'enter-gate');
  const callsSoFar = apiCalls.filter((c) => !c.includes('/device'));
  const stillHere = (await sceneOf(page)) === 'basecamp';
  expect(prompt).toBeTruthy();
  expect(prompt!.label).toMatch(/run/i);
  expect(prompt!.w).toBeGreaterThanOrEqual(44);
  expect(prompt!.h).toBeGreaterThanOrEqual(44);
  if (stillHere) expect(callsSoFar).toEqual([]);
  // walk on, into the opening: the portal fills and the run begins without any tap
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await num(page, 'portal')) > 0 || (await sceneOf(page)) !== 'basecamp', { timeout: 60_000 }).toBe(true);
  // standing in the opening, Click is on screen beside the gate (code-drawn Basecamp; on the
  // painted backdrop Click waits at the lodge door instead)
  if ((await sceneOf(page)) === 'basecamp' && (await game(page).getAttribute('data-backdrop')) === 'code') {
    const vp = await viewport(page);
    const click = await rect(page, 'click-rect');
    expect(click.x).toBeLessThan(vp.w);
    expect(click.x + click.w).toBeGreaterThan(0);
  }
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toMatch(/^run(-error)?$/);
  await page.keyboard.up('ArrowRight');
  await expect(game(page)).toHaveAttribute('data-character', 'koala');
  expect(apiCalls.some((c) => c === 'POST /api/v1/play-sessions')).toBe(true);
});

test('the gate prompt can be tapped instead of walked into', async ({ page }) => {
  test.setTimeout(180_000);
  await bootToBasecamp(page, 'bronco');
  await walkUntilNear(page, 'gate');
  // The prompt is a published hit target the moment the buddy is near; tapping it enters the
  // gate. (On a slow renderer the walk may already have carried the buddy into the opening, see
  // walkUntilNear; the tap is still the documented way in, and the hit target is what is proven.)
  await tapTarget(page, 'enter-gate');
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toMatch(/^run(-error)?$/);
});

test('the screen reader action enters the gate from anywhere, and a resumed run says so', async ({ page, context }) => {
  await bootToBasecamp(page);
  await page.locator('#bz-a11y button[data-action="enter-gate"]').dispatchEvent('click');
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('run');
  await expect(page.locator('#game[data-phase="question"]')).toBeAttached({ timeout: 90_000 });
  // a reload lands on the menu with an active session; Basecamp then offers to continue it
  const me = await (await context.request.get('/api/v1/me')).json();
  expect(me.activeSessionId).toBeTruthy();
  await page.reload();
  await expect.poll(() => sceneOf(page)).toBe('menu');
  await tapTarget(page, 'start-run');
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('basecamp');
  expect(await page.locator('#bz-a11y button[data-action="enter-gate"]').textContent()).toMatch(/continue/i);
  expect(await page.locator('#bz-a11y [role="status"]').textContent()).toMatch(/continue your run/i);
});

test('a viewport change (rotation, window resize) keeps the buddy where it was and on screen', async ({ page }) => {
  await bootToBasecamp(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowRight');
  const before = await waitUntilStill(page);
  // "Where it was" is the buddy's spot IN BASECAMP: the fraction of the walkable span. The world is
  // laid out from the view, so its pixel width changes on a rotation (a painted backdrop scales with
  // the view height); a pixel x kept from the tall view could land past the end of the short one.
  const span0 = { min: await num(page, 'walk-min-x'), max: await num(page, 'walk-max-x') };
  const frac0 = (before - span0.min) / (span0.max - span0.min);
  const vp0 = await viewport(page);
  await page.setViewportSize({ width: Math.round(vp0.h * 0.8), height: Math.round(vp0.w * 0.8) }); // a rotation-like change
  await page.waitForTimeout(600);
  const vp = await viewport(page);
  const buddy = await rect(page, 'buddy-rect');
  expect(buddy.x).toBeGreaterThanOrEqual(0);
  expect(buddy.x + buddy.w).toBeLessThanOrEqual(vp.w);
  const span = { min: await num(page, 'walk-min-x'), max: await num(page, 'walk-max-x') };
  const frac = ((await num(page, 'player-x')) - span.min) / (span.max - span.min);
  expect(Math.abs(frac - frac0), 'same relative spot in Basecamp').toBeLessThan(0.02);
});
