import { CLIENT_CSP, CLIENT_CSP_META } from '../../apps/play/security-headers';
import { expect, test } from './fixtures';

/**
 * The playable client is served with an ENFORCED Content-Security-Policy. The auto guard in
 * fixtures.ts fails every browser test on any violation, console error, page error, or
 * throttled API call, so the full-run and refresh tests in play.spec.ts double as the "whole game
 * works under CSP" evidence. These tests pin the policy itself.
 */

test('the page is served with the enforced CSP and the other security headers', async ({ page }) => {
  const response = await page.goto('/');
  expect(response).toBeTruthy();
  const headers = response!.headers();
  expect(headers['content-security-policy']).toBe(CLIENT_CSP);
  expect(headers['content-security-policy-report-only']).toBeUndefined(); // enforced, not report-only
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['permissions-policy']).toContain('camera=()');

  // The policy is strict: no unsafe-inline, no unsafe-eval, no wildcard, no remote origin.
  for (const bad of ["'unsafe-inline'", "'unsafe-eval'", '*', 'http:', 'https:']) {
    expect(CLIENT_CSP, `CSP must not contain ${bad}`).not.toContain(bad);
  }
  expect(CLIENT_CSP).toContain("default-src 'none'");
  expect(CLIENT_CSP).toContain("frame-ancestors 'none'");
  expect(CLIENT_CSP).toContain("connect-src 'self'");

  // And the game actually runs under it.
  await expect(page.locator('#game[data-phaser-ready="true"] canvas')).toBeVisible();
  await expect.poll(async () => (await page.locator('#game').getAttribute('data-scene')) ?? '').toBe('menu');
});

test('the built page embeds the same policy, so enforcement does not depend on the host', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html);
  expect(meta, 'index.html embeds a CSP <meta>').toBeTruthy();
  const decoded = meta![1]!.replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
  expect(decoded).toBe(CLIENT_CSP_META);
  expect(decoded).not.toContain('frame-ancestors'); // header-only directive; a <meta> would log an error
  // The page itself contains no inline style or inline script for the policy to trip over.
  expect(html).not.toMatch(/<style[\s>]/i);
  expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
  expect(html).not.toMatch(/\sstyle="/i);
});

test('API responses reached through the client origin keep their own strict headers', async ({ request }) => {
  const res = await request.get('/api/v1/me'); // no cookie: 401
  expect(res.status()).toBe(401);
  const headers = res.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['cache-control']).toBe('no-store');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(await res.json()).toEqual({ error: { code: 'unauthenticated', message: 'No valid guest session. Start again.' } });
});

test('the CSP guard really detects a violation (so a silent pass is not a blind spot)', async ({ page, problems }) => {
  test.info().annotations.push({ type: 'expects-csp-violation' });
  await page.goto('/');
  await expect(page.locator('#game[data-phaser-ready="true"]')).toBeAttached();
  const baseline = problems.length;
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__injected = true';
    document.body.appendChild(script); // inline script: blocked by script-src 'self'
  });
  await expect.poll(() => problems.length).toBeGreaterThan(baseline);
  expect(problems.some((p) => /script-src|Refused to execute inline script/i.test(p))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined();
});
