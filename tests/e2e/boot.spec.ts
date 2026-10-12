import { expect, test } from './fixtures';

test('Phaser boots and renders the BidaZoo start screen', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('BidaZoo');
  await expect(page.locator('#game[data-phaser-ready="true"] canvas')).toBeVisible();
});

test('the boot screen fits the viewport without scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#game[data-phaser-ready="true"]')).toBeAttached();

  const metrics = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
});
// The "question screen fits without scrolling" requirement is enforced in play.spec.ts.
