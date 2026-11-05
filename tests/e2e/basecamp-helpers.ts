import { expect, type Page } from '@playwright/test';

/**
 * Since Checkpoint W1 "Choose [Name]" opens Expedition Basecamp, and the run starts when the buddy
 * walks into the Basecamp Gate. Tests that are about the run itself use the Basecamp's real
 * accessibility action ("Enter the gate ...", a real DOM button) instead of walking there every
 * time; basecamp.spec.ts covers the walking and the portal with real input.
 */
export async function sceneOf(page: Page): Promise<string> {
  return (await page.locator('#game').getAttribute('data-scene')) ?? '';
}

/** From the menu's "Choose" tap: wait for Basecamp, enter the gate, wait for the run (or run-error). */
export async function enterGate(page: Page): Promise<void> {
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toBe('basecamp'); // the 1 s celebration is slow under software GL
  const action = page.locator('#bz-a11y button[data-action="enter-gate"]');
  await expect(action).toBeAttached();
  await action.dispatchEvent('click');
  await expect.poll(() => sceneOf(page), { timeout: 60_000 }).toMatch(/^run(-error)?$/);
}
