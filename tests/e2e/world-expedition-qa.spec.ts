import { expect, test } from './fixtures';
import {
  action,
  attr,
  bootToBasecamp,
  expectCanvasFillsViewport,
  expectRectOnScreen,
  expectTargetsOnScreen,
  finishEncounter,
  game,
  mapTiles,
  num,
  openOutfitter,
  orientations,
  outfitterCoins,
  playRunToResults,
  pulse,
  rectOf,
  rotateTo,
  sceneOf,
  startGreatWall,
  tap,
  targets,
  viewport,
  waitUntilStill,
  walkThePath,
  walkUntilNear,
} from './world-helpers';

/**
 * The owner's four blocking bugs from the live build 2fcf73e (November 10, 2026), each as a browser
 * test with real taps. Written to FAIL on that build; the fixes make them pass.
 *
 *   1. The outfitter: a purchase never confirmed.
 *   2. At the map board, "Open the map" opened the outfitter, then the game locked up.
 *   3. After the boss the game died instead of showing the summit.
 *   4. The layout broke after rotating back to portrait.
 *
 * Everything asserted is presentation state the game publishes; coins, ownership and results are
 * the server's facts, shown and compared, never decided here.
 */

const RED_SCARF = { id: 'scarf-red', name: 'Red Scarf', price: 15 };

test('bug 1: a real tap on an affordable item buys it, the card says it is worn, and the coins go down by the server price', async ({ page, context }) => {
  test.setTimeout(300_000); // one full gate run to earn coins, software-rendered
  await bootToBasecamp(page);
  // coins come only from play: the gate run (10 questions) pays per correct answer and on completion
  await action(page, 'enter-gate').dispatchEvent('click');
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('run');
  const run = await playRunToResults(page);
  expect(run.known, 'the test could answer the multiplication questions').toBeGreaterThanOrEqual(3);
  await tap(page, 'play-again');
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('basecamp');

  await openOutfitter(page);
  const before = await outfitterCoins(page);
  expect(before, 'coins after a run').toBeGreaterThanOrEqual(RED_SCARF.price);
  const card = (await targets(page, 'outfitter-targets')).find((t) => t.id === `outfitter-${RED_SCARF.id}`);
  expect(card?.label).toBe(`Buy ${RED_SCARF.name} for ${RED_SCARF.price} coins`);

  await tap(page, `outfitter-${RED_SCARF.id}`, 'outfitter-targets');

  // the purchase confirms on screen: the card is now worn, the balance is the server's new balance
  await expect
    .poll(async () => (await targets(page, 'outfitter-targets')).find((t) => t.id === `outfitter-${RED_SCARF.id}`)?.label ?? '', { timeout: 15_000 })
    .toBe(`Take off ${RED_SCARF.name}`);
  expect(await outfitterCoins(page)).toBe(before - RED_SCARF.price);
  // and the server agrees (the test only compares; it never decides the balance)
  const gear = (await (await context.request.get('/api/v1/me/gear')).json()) as { owned: string[]; equipped: string[]; coins: number };
  expect(gear.owned).toContain(RED_SCARF.id);
  expect(gear.equipped).toContain(RED_SCARF.id);
  expect(gear.coins).toBe(before - RED_SCARF.price);
});

test('bug 2a: after walking past the lodge, a real tap on "Open the map" at the map board opens the map, not the outfitter', async ({ page }) => {
  test.setTimeout(180_000);
  await bootToBasecamp(page);
  // the lodge door comes first on the walk; its prompt is offered and left behind without a tap
  await walkUntilNear(page, 'lodge-door');
  expect((await targets(page)).map((t) => t.id)).toContain('open-lodge-door');
  await walkUntilNear(page, 'map-board');
  const prompt = (await targets(page)).find((t) => t.id === 'open-map-board');
  expect(prompt, 'the map prompt').toBeTruthy();
  expect(prompt!.label).toBe('Open the map');

  await tap(page, 'open-map-board');

  await expect(game(page)).toHaveAttribute('data-overlay', 'map');
  await expect.poll(async () => (await mapTiles(page)).length).toBe(7);
  expect(await attr(page, 'outfitter')).not.toMatch(/^(open|loading)$/);
  // and still only one overlay: closing the map gives the walk back
  await action(page, 'map-close').dispatchEvent('click');
  await expect(game(page)).toHaveAttribute('data-overlay', '');
  await expect(action(page, 'enter-gate')).toBeAttached();
});

test('bug 2b: closing the outfitter with a real tap gives Basecamp back: the buddy walks again and the map still opens', async ({ page }) => {
  test.setTimeout(180_000);
  await bootToBasecamp(page);
  await openOutfitter(page);
  await tap(page, 'outfitter-close', 'outfitter-targets');

  await expect(game(page)).toHaveAttribute('data-outfitter', 'closed');
  await expect(game(page)).toHaveAttribute('data-overlay', '');
  await expect(action(page, 'enter-gate')).toBeAttached();
  await expect(action(page, 'open-map')).toBeAttached();
  // walking works again (to the left: the gate is to the right, and a run must not start here)
  const x0 = await num(page, 'player-x');
  for (let i = 0; i < 3; i++) await pulse(page, 'ArrowLeft', 80);
  await expect.poll(() => num(page, 'player-x'), { timeout: 15_000 }).toBeLessThan(x0);
  // and the next overlay opens
  await action(page, 'open-map').dispatchEvent('click');
  await expect(game(page)).toHaveAttribute('data-overlay', 'map');
  await expect.poll(async () => (await mapTiles(page)).length).toBe(7);
});

test('bug 3: after the boss, the summit card shows the expedition results', async ({ page }) => {
  test.setTimeout(600_000); // fifteen questions with their moments, software-rendered
  await bootToBasecamp(page);
  await startGreatWall(page);
  const walk = await walkThePath(page);
  expect(walk.encounters).toBe(6);

  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('summit');
  await expect(game(page)).toHaveAttribute('data-destination', 'great-wall');
  await expectTargetsOnScreen(page, (id) => id.startsWith('summit-'));
  // the server's results are on the card (the test knew at least the multiplication answers)
  expect(Number(await attr(page, 'xp'))).toBeGreaterThan(0);
  expect(Number(await attr(page, 'coins'))).toBeGreaterThan(0);
  const beacons = await attr(page, 'beacons');
  expect(beacons, 'the server reported the beacons lit').toMatch(/^[0-5]$/);
  // and the way home works
  await tap(page, 'summit-basecamp');
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('basecamp');
});

test('bug 4: rotating to landscape and back to portrait keeps Basecamp, the outfitter, the map, the path and an encounter laid out', async ({ page }) => {
  test.setTimeout(420_000);
  const { portrait, landscape } = orientations();
  const twice = async (check: () => Promise<void>): Promise<void> => {
    await rotateTo(page, landscape.w, landscape.h);
    await check();
    await rotateTo(page, portrait.w, portrait.h);
    await check();
  };

  await bootToBasecamp(page);
  await pulse(page, 'ArrowRight', 600);
  await waitUntilStill(page);
  await twice(async () => {
    await expectCanvasFillsViewport(page);
    expect(await sceneOf(page)).toBe('basecamp');
    expectRectOnScreen(await rectOf(page, 'buddy-rect'), await viewport(page), 'the buddy');
    await expect(action(page, 'enter-gate')).toBeAttached();
  });

  // the outfitter stays open and usable through both turns
  await openOutfitter(page);
  await twice(async () => {
    await expectCanvasFillsViewport(page);
    await expect.poll(() => attr(page, 'outfitter'), { timeout: 30_000 }).toBe('open');
    await expectTargetsOnScreen(page, () => true, 'outfitter-targets');
  });
  await tap(page, 'outfitter-close', 'outfitter-targets');
  await expect(game(page)).toHaveAttribute('data-overlay', '');

  // the map board too
  await action(page, 'open-map').dispatchEvent('click');
  await expect(game(page)).toHaveAttribute('data-overlay', 'map');
  await twice(async () => {
    await expectCanvasFillsViewport(page);
    await expect.poll(async () => (await mapTiles(page)).length).toBe(7);
    const vp = await viewport(page);
    for (const t of await mapTiles(page)) expectRectOnScreen(t, vp, `tile ${t.id}`);
  });
  await action(page, 'map-close').dispatchEvent('click');
  await expect(game(page)).toHaveAttribute('data-overlay', '');

  // the path: the buddy stays on screen through both turns
  await startGreatWall(page);
  await expect.poll(() => attr(page, 'session'), { timeout: 60_000 }).toBe('ready');
  await twice(async () => {
    await expectCanvasFillsViewport(page);
    expect(await sceneOf(page)).toBe('expedition');
    const vp = await viewport(page);
    const onScreen = (await num(page, 'player-x')) - (await num(page, 'camera-x'));
    expect(onScreen, 'the buddy is on screen').toBeGreaterThanOrEqual(0);
    expect(onScreen).toBeLessThanOrEqual(vp.w);
    await expect(action(page, 'expedition-home')).toBeAttached(); // the path publishes no tap rectangles; the way home is the mirror's
  });

  // an encounter: the first artifact is passed on the way to the first encounter; the question survives both turns
  await action(page, 'next-stop').dispatchEvent('click');
  await expect.poll(() => attr(page, 'artifacts'), { timeout: 30_000 }).toBe('1');
  await expect(action(page, 'next-stop')).toBeAttached({ timeout: 30_000 });
  await action(page, 'next-stop').dispatchEvent('click');
  await expect.poll(() => attr(page, 'encounter'), { timeout: 60_000 }).toBe('question');
  await twice(async () => {
    await expectCanvasFillsViewport(page);
    await expect.poll(() => attr(page, 'encounter'), { timeout: 30_000 }).toBe('question');
    await expectTargetsOnScreen(page, (id) => id.startsWith('answer-'));
  });
  const r = await finishEncounter(page);
  expect(r.asked).toBe(2);
});
