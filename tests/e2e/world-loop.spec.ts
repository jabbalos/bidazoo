import { expect, test } from './fixtures';
import {
  action,
  attr,
  bootToBasecamp,
  expectCanvasFillsViewport,
  expectRectOnScreen,
  expectTargetsOnScreen,
  game,
  installPhaseLog,
  num,
  openOutfitter,
  orientations,
  outfitterCoins,
  pulse,
  readPhaseLog,
  rectOf,
  rotateTo,
  sceneOf,
  startGreatWall,
  tap,
  targets,
  viewport,
  waitUntilStill,
  walkThePath,
} from './world-helpers';

/**
 * THE WHOLE LOOP, in one sitting, with real taps (owner requirement, November 10, 2026): this test
 * must pass on every project before any deploy.
 *
 *   Basecamp -> map board -> Great Wall -> five encounters and the boss -> summit (turned to
 *   landscape and back) -> Basecamp -> outfitter: buy and wear -> turned to landscape and back ->
 *   walking in Basecamp again.
 *
 * The test knows multiplication answers because it can multiply; imported text questions get the
 * first choice, so the loop never depends on an answer key. Coins, XP, beacons, the stamp and the
 * gear are the server's facts: shown by the game, compared against the API, never decided here.
 */

const RED_SCARF = { id: 'scarf-red', name: 'Red Scarf', price: 15 };

test('whole loop: Basecamp, map, Great Wall, 5 encounters, boss, summit, outfitter buy and wear, rotate, back to Basecamp', async ({ page, context }) => {
  test.setTimeout(900_000);
  const { portrait, landscape } = orientations();
  const apiCalls: string[] = [];
  const attemptIds = new Set<string>();
  page.on('request', (req) => {
    if (!req.url().includes('/api/')) return;
    apiCalls.push(`${req.method()} ${new URL(req.url()).pathname}`);
    // one attempt id per answered question; a network retry re-sends the same id and the server grades it once
    if (req.method() === 'POST' && req.url().endsWith('/answers')) {
      const body = req.postDataJSON() as { attemptId?: string } | null;
      if (body?.attemptId) attemptIds.add(body.attemptId);
    }
  });

  // 1. Basecamp
  await bootToBasecamp(page);
  await expectCanvasFillsViewport(page);
  await installPhaseLog(page);

  // 2. the map board, 3. the Great Wall path
  await startGreatWall(page);
  expect(apiCalls).toContain('POST /api/v1/play-sessions');
  await expect.poll(() => attr(page, 'session'), { timeout: 60_000 }).toBe('ready');
  expect(apiCalls).toContain('POST /api/v1/me/expedition/runs');

  // 4. five encounters and the boss, every answer a real tap
  const walk = await walkThePath(page);
  expect(walk.encounters).toBe(6);
  // fifteen questions: five nodes of two and a boss of five, every one answered by this test's taps
  const answersSent = attemptIds.size;
  if (walk.asked !== answersSent) console.log(`[loop] driver answered ${walk.asked}, the page sent ${answersSent} distinct attempts:`, (await readPhaseLog(page)).join(' | '));
  expect(answersSent, 'distinct answers sent to the server').toBe(15);
  expect(walk.asked, 'answers tapped by the test').toBe(15);

  // 5. the summit: the server's results
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('summit');
  const me = (await (await context.request.get('/api/v1/me')).json()) as { totals?: { xp: number; coins: number } };
  const xpShown = Number(await attr(page, 'xp'));
  const coinsShown = Number(await attr(page, 'coins'));
  expect(xpShown).toBeGreaterThan(0);
  expect(coinsShown).toBeGreaterThanOrEqual(10); // at least the completion reward
  expect(await attr(page, 'beacons')).toMatch(/^[0-5]$/);
  if (me.totals) expect(me.totals.coins).toBeGreaterThanOrEqual(coinsShown);
  // turned on its side and back on the summit card
  await rotateTo(page, landscape.w, landscape.h);
  await expectTargetsOnScreen(page, (id) => id.startsWith('summit-'));
  await rotateTo(page, portrait.w, portrait.h);
  await expectTargetsOnScreen(page, (id) => id.startsWith('summit-'));
  expect(await sceneOf(page)).toBe('summit');

  // 6. back to Basecamp
  await tap(page, 'summit-basecamp');
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('basecamp');
  await expectCanvasFillsViewport(page);

  // 7. the outfitter: buy the Red Scarf and wear it (the server's price, the server's balance)
  await openOutfitter(page);
  const before = await outfitterCoins(page);
  expect(before, 'coins earned on the expedition').toBeGreaterThanOrEqual(RED_SCARF.price);
  await tap(page, `outfitter-${RED_SCARF.id}`, 'outfitter-targets');
  await expect
    .poll(async () => (await targets(page, 'outfitter-targets')).find((t) => t.id === `outfitter-${RED_SCARF.id}`)?.label ?? '', { timeout: 15_000 })
    .toBe(`Take off ${RED_SCARF.name}`);
  expect(await outfitterCoins(page)).toBe(before - RED_SCARF.price);
  const gear = (await (await context.request.get('/api/v1/me/gear')).json()) as { owned: string[]; equipped: string[]; coins: number };
  expect(gear.owned).toContain(RED_SCARF.id);
  expect(gear.equipped).toContain(RED_SCARF.id);
  expect(gear.coins).toBe(before - RED_SCARF.price);
  await tap(page, 'outfitter-close', 'outfitter-targets');
  await expect(game(page)).toHaveAttribute('data-overlay', '');

  // 8. rotate on Basecamp, landscape and back, then walk: the loop closes where it began
  await rotateTo(page, landscape.w, landscape.h);
  expectRectOnScreen(await rectOf(page, 'buddy-rect'), await viewport(page), 'the buddy (landscape)');
  await rotateTo(page, portrait.w, portrait.h);
  expectRectOnScreen(await rectOf(page, 'buddy-rect'), await viewport(page), 'the buddy (portrait again)');
  const x0 = await num(page, 'player-x');
  for (let i = 0; i < 3; i++) await pulse(page, 'ArrowLeft', 80); // away from the gate: the loop ends in Basecamp, not in a run
  await expect.poll(() => num(page, 'player-x'), { timeout: 15_000 }).toBeLessThan(x0);
  await waitUntilStill(page);
  expect(await sceneOf(page)).toBe('basecamp');
  await expect(action(page, 'enter-gate')).toBeAttached();
  await expect(action(page, 'open-map')).toBeAttached();
  await expect(action(page, 'open-outfitter')).toBeAttached();
});
