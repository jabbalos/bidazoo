import { test as base, expect } from '@playwright/test';

/**
 * Every browser test runs with this guard. The client is served with an enforced
 * Content-Security-Policy, so ANY of these during a test is a failure:
 *   - a console error (Chromium reports each CSP violation as one: "Refused to ...")
 *   - an uncaught page error
 *   - a CSP violation event
 *   - the API answering 429 or 503 (normal play must never be throttled)
 * Network-status noise ("Failed to load resource ... 401") is not counted: some tests make
 * deliberately unauthenticated calls.
 *
 * A test that provokes a violation ON PURPOSE (to prove this detector works) opts out with the
 * annotation `expects-csp-violation` and asserts on `problems` itself.
 */
export const test = base.extend<{ problems: string[]; guard: void }>({
  problems: async ({}, use) => {
    await use([]);
  },
  guard: [
    async ({ context, problems }, use, testInfo) => {
      await context.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          console.error(`[csp-violation] ${event.violatedDirective} blocked ${event.blockedURI || 'inline'}`);
        });
      });
      context.on('console', (message) => {
        if (message.type() !== 'error') return;
        if (/Failed to load resource/.test(message.text())) return;
        problems.push(`console error: ${message.text()}`);
      });
      context.on('weberror', (webError) => problems.push(`page error: ${webError.error().message}`));
      context.on('response', (response) => {
        const status = response.status();
        if ((status === 429 || status === 503) && response.url().includes('/api/')) {
          problems.push(`throttled: ${status} ${new URL(response.url()).pathname}`);
        }
      });
      await use();
      if (!testInfo.annotations.some((a) => a.type === 'expects-csp-violation')) {
        expect(problems, 'no CSP violations, console errors, page errors, or throttled requests').toEqual([]);
      }
    },
    { auto: true },
  ],
});

export { expect };
