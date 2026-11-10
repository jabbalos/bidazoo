import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { sceneOf } from './basecamp-helpers';

/**
 * Expedition (Lane B): the map board on Basecamp, the trailhead card, and the Great Wall path.
 * Everything asserted is presentation state the game publishes on #game; beacons, XP and stamps
 * are never read or decided here. The encounter itself belongs to Lane A, so these tests stop at
 * the first stop that needs a question (an artifact comes first on every path).
 */
interface Tile {
  id: string;
  unlocked: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Target {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const game = (page: Page) => page.locator('#game');
const attr = async (page: Page, name: string): Promise<string> => (await game(page).getAttribute(`data-${name}`)) ?? '';
const targets = async (page: Page): Promise<Target[]> => JSON.parse((await attr(page, 'hit-targets')) || '[]') as Target[];
const tiles = async (page: Page): Promise<Tile[]> => JSON.parse((await attr(page, 'map-tiles')) || '[]') as Tile[];
const action = (page: Page, id: string) => page.locator(`#bz-a11y button[data-action="${id}"]`);

async function tapTarget(page: Page, id: string): Promise<void> {
  const t = (await targets(page)).find((x) => x.id === id);
  expect(t, `target ${id}`).toBeTruthy();
  const box = await page.locator('#game canvas').boundingBox();
  await page.mouse.click(box!.x + t!.x + t!.w / 2, box!.y + t!.y + t!.h / 2);
}

async function bootToBasecamp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#game[data-phaser-ready="true"]')).toBeAttached();
  await expect.poll(() => sceneOf(page)).toBe('menu');
  await tapTarget(page, 'character-dino');
  await expect(game(page)).toHaveAttribute('data-character', 'dino');
  await tapTarget(page, 'start-run');
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('basecamp');
  await expect(game(page)).toHaveAttribute('data-buddy-rect', /\{/);
}

async function openMap(page: Page): Promise<void> {
  await action(page, 'open-map').dispatchEvent('click');
  await expect(game(page)).toHaveAttribute('data-overlay', 'map');
  await expect.poll(async () => (await tiles(page)).length).toBe(7);
}

test('the map board lists seven destinations: one open, six locked, every tile big enough to tap and on screen', async ({ page }) => {
  await bootToBasecamp(page);
  await openMap(page);
  const all = await tiles(page);
  expect(all.filter((t) => t.unlocked).map((t) => t.id).sort()).toEqual(['great-wall']);
  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  for (const t of all) {
    expect(t.w).toBeGreaterThanOrEqual(48);
    expect(t.h).toBeGreaterThanOrEqual(48);
    expect(t.x).toBeGreaterThanOrEqual(0);
    expect(t.y).toBeGreaterThanOrEqual(0);
    expect(t.x + t.w).toBeLessThanOrEqual(vp.w);
    expect(t.y + t.h).toBeLessThanOrEqual(vp.h);
  }
  // the screen reader sees the unlock rule on a locked tile
  await expect(action(page, 'map-tile-andes')).toContainText('Locked');
  await expect(action(page, 'map-tile-great-wall')).toContainText('Open');
  // closing returns to the walk
  await action(page, 'map-close').dispatchEvent('click');
  await expect(game(page)).toHaveAttribute('data-overlay', '');
  await expect(action(page, 'enter-gate')).toBeAttached();
});

test('a locked tile does nothing; an unlocked tile opens the trailhead card; Back returns to the board', async ({ page }) => {
  await bootToBasecamp(page);
  await openMap(page);
  await action(page, 'map-tile-andes').dispatchEvent('click');
  await expect(action(page, 'trailhead-start')).toHaveCount(0);
  await action(page, 'map-tile-great-wall').dispatchEvent('click');
  await expect(action(page, 'trailhead-start')).toBeAttached();
  await action(page, 'trailhead-back').dispatchEvent('click');
  await expect(action(page, 'trailhead-start')).toHaveCount(0);
  await expect(action(page, 'map-tile-great-wall')).toBeAttached();
});

test('a real tap on the Great Wall tile, then Start, opens the Great Wall path: three layers, a long world, and a way home', async ({ page }) => {
  await bootToBasecamp(page);
  await openMap(page);
  const t = (await tiles(page)).find((x) => x.id === 'great-wall')!;
  const box = await page.locator('#game canvas').boundingBox();
  await page.mouse.click(box!.x + t.x + t.w / 2, box!.y + t.y + t.h * 0.3);
  await expect(action(page, 'trailhead-start')).toBeAttached();
  await action(page, 'trailhead-start').dispatchEvent('click');
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('expedition');
  await expect(game(page)).toHaveAttribute('data-destination', 'great-wall');
  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  expect(Number(await attr(page, 'world-w'))).toBeGreaterThanOrEqual(vp.w * 7);
  expect(await attr(page, 'layers')).toBe('3');
  expect(await attr(page, 'backdrop')).toBe('gradient');
  expect(JSON.parse(await attr(page, 'nodes')) as unknown[]).toHaveLength(11);
  // the way home is always there, whether or not the session opened
  await expect(action(page, 'expedition-home')).toBeAttached();
  await action(page, 'expedition-home').dispatchEvent('click');
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('basecamp');
});

test('on the path the buddy walks, the world scrolls, and the first artifact is collected by walking to it (once the session is open)', async ({ page }) => {
  await bootToBasecamp(page);
  await openMap(page);
  await action(page, 'map-tile-great-wall').dispatchEvent('click');
  await action(page, 'trailhead-start').dispatchEvent('click');
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('expedition');
  await expect.poll(() => attr(page, 'session'), { timeout: 30_000 }).toMatch(/^(ready|error)$/);
  if ((await attr(page, 'session')) === 'error') {
    // the session client is not available yet: the path must say so and offer the way home, never freeze
    await expect(action(page, 'expedition-retry')).toBeAttached();
    await expect(action(page, 'expedition-home')).toBeAttached();
    return;
  }
  const x0 = Number(await attr(page, 'player-x'));
  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  await page.mouse.move(vp.w * 0.8, vp.h * 0.55);
  await page.mouse.down();
  await expect.poll(async () => Number(await attr(page, 'player-x')), { timeout: 30_000 }).toBeGreaterThan(x0 + vp.h * 0.4);
  await page.mouse.up();
  expect(Number(await attr(page, 'camera-x'))).toBeGreaterThan(0);
  // the screen-reader action stands at the next stop; the first stop on every path is an artifact
  await action(page, 'next-stop').dispatchEvent('click');
  await expect.poll(() => attr(page, 'artifacts'), { timeout: 30_000 }).toBe('1');
});
