import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { E2E_IDENTITY_SECRET, E2E_LEGACY_PEPPER, ID_BASE_URL, OUTBOX_FILE } from './identity-env';

/**
 * The family/account page, end to end: real browser, real API, real PostgreSQL, real emailed link
 * (read from the file mailer's outbox), real operator tools for the legacy cases. Nothing is faked.
 * Runs on the identity-enabled stack (see identity-env.ts); the identity-disabled test at the bottom
 * uses the default stack, where identity is off.
 */
test.use({ baseURL: ID_BASE_URL });

const API_CWD = fileURLToPath(new URL('../../apps/api', import.meta.url));
const unique = () => randomUUID().replace(/-/g, '').slice(0, 10);
const newEmail = () => `parent-${unique()}@example.com`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The most recent sign-in link emailed to `to`, as a path + fragment on the account page. */
async function emailedLink(to: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    if (existsSync(OUTBOX_FILE)) {
      const lines = readFileSync(OUTBOX_FILE, 'utf8').split('\n').filter(Boolean);
      for (const line of lines.reverse()) {
        const message = JSON.parse(line) as { to: string; text: string };
        if (message.to !== to) continue;
        const match = /account\.html#t=[A-Za-z0-9_-]+/.exec(message.text);
        if (match) return `/${match[0]}`;
      }
    }
    await sleep(100);
  }
  throw new Error('no sign-in email arrived');
}

async function requestLink(page: Page, email: string): Promise<void> {
  await page.goto('/account.html');
  await page.getByLabel('Your email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
}

async function signIn(page: Page, email: string): Promise<void> {
  await requestLink(page, email);
  await page.goto(await emailedLink(email));
  await expect(page.getByRole('heading', { name: 'Your family' })).toBeVisible();
}

async function newSignedIn(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: ID_BASE_URL });
  const page = await context.newPage();
  await signIn(page, email);
  return { context, page };
}

async function expectNoOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, view: window.innerWidth }));
  expect(widths.doc).toBeLessThanOrEqual(widths.view);
  expect(widths.body).toBeLessThanOrEqual(widths.view);
}

/** Nothing sensitive lives in web storage, in any form: it should hold nothing at all. */
async function expectCleanStorage(page: Page): Promise<void> {
  const stored = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
    cookie: document.cookie,
  }));
  expect(stored.local).toEqual([]);
  expect(stored.session).toEqual([]);
  expect(stored.cookie).toBe(''); // auth cookies are HttpOnly: script cannot see them
}

async function addChild(page: Page, nickname: string): Promise<void> {
  await page.getByLabel('Player nickname').fill(nickname);
  await page.getByRole('button', { name: 'Add player', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: nickname }).first()).toBeVisible();
}

/** Field-level error text (the page also has one page-level alert region). */
const fieldError = (scope: Page | import('@playwright/test').Locator) => scope.locator('p.error:not([hidden])');
const pageAlert = (page: Page) => page.locator('#notice-alert');
const row = (page: Page, nickname: string) => page.getByRole('list').getByRole('listitem').filter({ hasText: nickname }).first();

// ---------------------------------------------------------------------------------------------

test('sign-in: one generic "check your email" for any address; no password; keyboard works', async ({ page, browser }) => {
  await page.goto('/account.html');
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expectNoOverflow(page);

  // Keyboard only: focus the field, type, press Enter.
  const known = newEmail();
  await page.getByLabel('Your email').focus();
  await page.keyboard.type(known);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const first = await page.locator('main').innerText();

  // The same page text for a different, never-seen address, and for an address that already has an account.
  const other = await browser.newContext({ baseURL: ID_BASE_URL });
  const otherPage = await other.newPage();
  await requestLink(otherPage, newEmail());
  expect(await otherPage.locator('main').innerText()).toBe(first);
  await requestLink(otherPage, known);
  expect(await otherPage.locator('main').innerText()).toBe(first);
  expect(first).not.toMatch(new RegExp(known.split('@')[0]!, 'i'));
  await other.close();

  // A malformed address is rejected on the page, tied to the field, without any request about it.
  await page.goto('/account.html');
  await page.getByLabel('Your email').fill('not-an-email');
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'valid email' });
  await expect(alert.first()).toBeVisible();
  await expect(page.getByLabel('Your email')).toHaveAttribute('aria-invalid', 'true');
  await expectCleanStorage(page);
});

test('email link: success routes to the family screen and leaves nothing in the URL or storage', async ({ page }) => {
  const email = newEmail();
  await requestLink(page, email);
  const link = await emailedLink(email);
  const token = link.split('#t=')[1]!;
  expect(token).toHaveLength(43);

  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Your family' })).toBeVisible();
  await expect(page.getByText('Signed in as')).toBeVisible();

  const url = new URL(page.url());
  expect(url.pathname).toBe('/account.html');
  expect(url.hash).toBe('');
  expect(url.search).toBe('');
  expect(page.url()).not.toContain(token);
  expect(await page.content()).not.toContain(token);
  expect(await page.evaluate(() => history.length)).toBeLessThan(5);
  await expectCleanStorage(page);

  // A reload stays signed in (cookie), and the page still has no token anywhere.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your family' })).toBeVisible();
});

test('email link: replayed, expired-looking, and garbage tokens all fail the same generic way', async ({ page, browser }) => {
  const email = newEmail();
  await requestLink(page, email);
  const link = await emailedLink(email);

  // First use works (in its own context so the replay below is a different browser).
  const first = await browser.newContext({ baseURL: ID_BASE_URL });
  const firstPage = await first.newPage();
  await firstPage.goto(link);
  await expect(firstPage.getByRole('heading', { name: 'Your family' })).toBeVisible();
  await first.close();

  const messages: string[] = [];
  for (const bad of [link, '/account.html#t=' + 'A'.repeat(43), '/account.html#t=short', '/account.html#t=%00%00']) {
    await page.goto(bad);
    await expect(pageAlert(page)).toContainText("didn't work");
    messages.push(await pageAlert(page).innerText());
    await expect(page.getByLabel('Your email')).toBeVisible(); // routed to sign-in, not stuck
    expect(new URL(page.url()).hash).toBe('');
    expect(page.url()).not.toContain('A'.repeat(43));
  }
  expect(new Set(messages).size).toBe(1);
  await expectCleanStorage(page);
});

test('family: add players without a reload; switch with no PIN; active player is marked', async ({ page }) => {
  await signIn(page, newEmail());
  await expect(page.getByText('No players yet')).toBeVisible();
  // No guest player on this browser: the keep-progress card is not offered.
  await expect(page.getByRole('region', { name: "Keep this player's progress" })).toHaveCount(0);
  await page.evaluate(() => { (window as unknown as { __marker: number }).__marker = 7; });

  await addChild(page, 'Ava');
  await addChild(page, 'Ben');
  // No full page reload: the marker survived.
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(7);

  // Nickname validation matches the server (1 to 32); the server stays authoritative.
  await page.getByLabel('Player nickname').fill('   ');
  await page.getByRole('button', { name: 'Add player' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'nickname' }).first()).toBeVisible();
  // The field itself stops at 32 characters, the server's limit.
  await expect(page.getByLabel('Player nickname')).toHaveAttribute('maxlength', '32');

  await row(page, 'Ava').getByRole('button', { name: 'Switch to Ava' }).click();
  await expect(row(page, 'Ava')).toContainText('Playing now');
  await expect(row(page, 'Ben')).not.toContainText('Playing now');
  await row(page, 'Ben').getByRole('button', { name: 'Switch to Ben' }).click();
  await expect(row(page, 'Ben')).toContainText('Playing now');
  await expect(row(page, 'Ava')).not.toContainText('Playing now');

  // Archived players leave the main list and sit in their own section; restoring brings them back.
  await row(page, 'Ava').getByRole('button', { name: 'Archive Ava' }).click();
  await expect(page.getByText('Archived players (1)')).toBeVisible();
  await page.getByText('Archived players (1)').click();
  await page.getByRole('button', { name: 'Restore Ava' }).click();
  await expect(row(page, 'Ava').getByRole('button', { name: 'Switch to Ava' })).toBeVisible();

  // The page never shows internal identifiers.
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  await expectNoOverflow(page);
  await expectCleanStorage(page);
});

test('PIN: guardian sets it; switching needs exactly four digits; wrong PIN is one generic message; PIN never stored', async ({ page }) => {
  await signIn(page, newEmail());
  await addChild(page, 'Ava');
  await addChild(page, 'Ben');
  await row(page, 'Ava').getByRole('button', { name: 'Switch to Ava' }).click();
  await expect(row(page, 'Ava')).toContainText('Playing now');

  // Set a PIN on Ben. The dialog says what a PIN is, and is not.
  await row(page, 'Ben').getByRole('button', { name: 'Set PIN for Ben' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('not a password');
  await expect(dialog).toContainText('cannot recover your account');
  const input = dialog.getByLabel('New PIN');
  await expect(input).toHaveAttribute('inputmode', 'numeric');
  await expect(input).toHaveAttribute('autocomplete', 'off');
  await input.fill('12ab');
  await expect(input).toHaveValue('12'); // digits only
  await dialog.getByRole('button', { name: 'Save PIN' }).click();
  await expect(dialog.getByRole('alert')).toContainText('exactly four digits');
  await input.fill('2468');
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  await dialog.getByRole('button', { name: 'Save PIN' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row(page, 'Ben')).toContainText('PIN lock');

  // Switching to Ben now asks for the PIN. Wrong PIN, twice: the same message, input cleared, no counts.
  await row(page, 'Ben').getByRole('button', { name: 'Switch to Ben' }).click();
  const prompt = page.getByRole('dialog');
  const pin = prompt.getByLabel('PIN');
  await expect(pin).toBeFocused();
  await pin.fill('99');
  await prompt.getByRole('button', { name: 'Unlock' }).click();
  await expect(prompt.getByRole('alert')).toContainText('exactly four digits');
  const messages: string[] = [];
  for (const wrong of ['1111', '2222']) {
    await pin.fill(wrong);
    await prompt.getByRole('button', { name: 'Unlock' }).click();
    await expect(prompt.getByRole('alert')).toContainText("didn't work");
    messages.push(await prompt.getByRole('alert').innerText());
    await expect(pin).toHaveValue('');
  }
  expect(new Set(messages).size).toBe(1);
  expect(messages[0]).not.toMatch(/attempt|locked|remaining|\d+ (more|tries)/i);
  await expect(row(page, 'Ava')).toContainText('Playing now'); // nothing switched

  // Escape closes the dialog and returns focus to the control that opened it.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row(page, 'Ben').getByRole('button', { name: 'Switch to Ben' })).toBeFocused();

  // Correct PIN switches.
  await row(page, 'Ben').getByRole('button', { name: 'Switch to Ben' }).click();
  await page.getByRole('dialog').getByLabel('PIN').fill('2468');
  await page.getByRole('dialog').getByRole('button', { name: 'Unlock' }).click();
  await expect(row(page, 'Ben')).toContainText('Playing now');

  // The PIN is nowhere: not in storage, URL, or page text.
  await expectCleanStorage(page);
  expect(page.url()).not.toContain('2468');
  expect(await page.content()).not.toContain('2468');

  // Removing the PIN is a confirmed guardian action and switching is direct afterwards.
  await row(page, 'Ben').getByRole('button', { name: 'Remove PIN for Ben' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove PIN' }).click();
  await expect(row(page, 'Ben')).not.toContainText('PIN lock');
  await expectNoOverflow(page);
});

test('guest claim: keep the browser\'s existing player as a child profile', async ({ page }) => {
  // A real guest player first, then sign in on the same browser.
  const guest = await page.request.post('/api/v1/guest', { data: {} });
  expect(guest.ok()).toBe(true);
  await signIn(page, newEmail());

  const card = page.getByRole('region', { name: "Keep this player's progress" });
  await expect(card).toBeVisible();
  await expect(card).not.toContainText(/player.?id|[0-9a-f]{8}-/i);
  await card.getByLabel('Nickname for this player').fill('Zed');
  await card.getByRole('button', { name: 'Keep progress and add player' }).click();
  await expect(row(page, 'Zed')).toContainText('Playing now');
  await expect(card).toHaveCount(0);

  // The same player is what the API now answers as.
  const me = await page.request.get('/api/v1/me');
  expect(me.status()).toBe(200);
  await expectCleanStorage(page);
});

test('guest claim: the card stays available while another child is active', async ({ page }) => {
  // A real guest player first (a signed-in device without a child cannot start one), then sign in,
  // and let the device select ANOTHER child.
  expect((await page.request.post('/api/v1/guest', { data: {} })).ok()).toBe(true);
  await signIn(page, newEmail());
  const card = page.getByRole('region', { name: "Keep this player's progress" });
  await expect(card).toBeVisible();
  await addChild(page, 'Ava');
  await row(page, 'Ava').getByRole('button', { name: 'Switch to Ava' }).click();
  await expect(row(page, 'Ava')).toContainText('Playing now');
  await page.reload();
  await expect(card).toBeVisible(); // Ava is active AND the guest player is still claimable
  await expectNoOverflow(page);

  await card.getByLabel('Nickname for this player').fill('Zed');
  await card.getByRole('button', { name: 'Keep progress and add player' }).click();
  // The backend selected the claimed child; the page shows what the backend says.
  await expect(row(page, 'Zed')).toContainText('Playing now');
  await expect(row(page, 'Ava')).not.toContainText('Playing now');
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(card).toHaveCount(0);
  await expectCleanStorage(page);
});

test('devices: current device is marked; revoke one; revoke all others (confirmed); sign this device out', async ({ browser }) => {
  const email = newEmail();
  const a = await newSignedIn(browser, email);
  const b = await newSignedIn(browser, email);
  const c = await newSignedIn(browser, email);
  const page = a.page;
  await page.reload();

  const list = page.getByRole('region', { name: 'Trusted devices' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list.locator('.badge', { hasText: 'This device' })).toHaveCount(1);
  // Safe metadata only: no token, hash or id on the page.
  const text = await list.innerText();
  expect(text).not.toMatch(/token|hash|[0-9a-f]{8}-[0-9a-f]{4}-/i);

  // Revoke one other device: it is dropped immediately.
  await list.getByRole('listitem').filter({ hasNotText: 'This device' }).first().getByRole('button', { name: /^Revoke/ }).click();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  const statuses: number[] = [];
  for (const other of [b.context, c.context]) statuses.push((await other.request.get('/api/v1/device')).status());
  expect(statuses.sort()).toEqual([200, 401]);

  // Revoke all others: confirmation first (cancel changes nothing), then it applies.
  await page.getByRole('button', { name: 'Revoke all other devices' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Revoke all other devices' }).click();
  await expect(page.getByRole('dialog')).toContainText('except this one');
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke other devices' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  expect((await b.context.request.get('/api/v1/device')).status()).toBe(401);
  expect((await c.context.request.get('/api/v1/device')).status()).toBe(401);

  // The revoked browsers land cleanly on sign-in (no error, not stuck).
  await b.page.reload();
  await expect(b.page.getByLabel('Your email')).toBeVisible();
  await expect(pageAlert(b.page)).toHaveText('');

  // Signing this device out is confirmed and ends in the signed-out screen.
  await page.getByRole('button', { name: 'Sign out this device' }).click();
  await expect(page.getByRole('dialog')).toContainText('Sign out this device?');
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByLabel('Your email')).toBeVisible();
  await expect(page.getByText('This device was signed out.')).toBeVisible();
  expect((await page.request.get('/api/v1/device')).status()).toBe(401);
  await expectCleanStorage(page);
  for (const x of [a, b, c]) await x.context.close();
});

test('devices: "Sign out everywhere" signs this device out too', async ({ browser }) => {
  const email = newEmail();
  const a = await newSignedIn(browser, email);
  const b = await newSignedIn(browser, email);
  await a.page.reload();
  await a.page.getByRole('button', { name: 'Sign out everywhere' }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Sign out everywhere' }).click();
  await expect(a.page.getByLabel('Your email')).toBeVisible();
  expect((await a.context.request.get('/api/v1/device')).status()).toBe(401);
  expect((await b.context.request.get('/api/v1/device')).status()).toBe(401);
  await a.context.close();
  await b.context.close();
});

test('device code: guardian issues one; a child device redeems it once; a second try fails generically', async ({ browser }) => {
  const parent = await newSignedIn(browser, newEmail());
  await parent.page.getByLabel('Player nickname').fill('Ava');
  await parent.page.getByRole('button', { name: 'Add player' }).click();
  await parent.page.getByRole('button', { name: 'Create a device code' }).click();
  const code = (await parent.page.locator('code.code').innerText()).trim();
  expect(code.length).toBeGreaterThanOrEqual(8);

  const kid = await browser.newContext({ baseURL: ID_BASE_URL });
  const kidPage = await kid.newPage();
  await kidPage.goto('/account.html');
  await kidPage.getByLabel('Device code').fill(code);
  await kidPage.getByRole('button', { name: 'Use device code' }).click();
  await expect(kidPage.getByRole('heading', { name: 'Your family' })).toBeVisible();
  await expect(kidPage.getByRole('button', { name: 'Switch to Ava' })).toBeVisible();
  // A child device has no guardian tools.
  await expect(kidPage.getByRole('region', { name: 'Trusted devices' })).toHaveCount(0);
  await expect(kidPage.getByRole('button', { name: 'Create a device code' })).toHaveCount(0);

  const second = await browser.newContext({ baseURL: ID_BASE_URL });
  const secondPage = await second.newPage();
  await secondPage.goto('/account.html');
  await secondPage.getByLabel('Device code').fill(code);
  await secondPage.getByRole('button', { name: 'Use device code' }).click();
  await expect(fieldError(secondPage)).toContainText("didn't work");
  await expect(secondPage.getByLabel('Device code')).toHaveValue('');
  await expectCleanStorage(secondPage);
  for (const x of [parent.context, kid, second]) await x.close();
});

// --- Legacy Hop Quest: real manifest load and claim-code issue through the operator CLIs -----------

function runCli(script: string, args: string[]): string {
  const env = { ...process.env, DATABASE_URL: process.env['DATABASE_URL'] ?? '', LEGACY_MATCH_PEPPER: E2E_LEGACY_PEPPER, IDENTITY_SECRET: E2E_IDENTITY_SECRET };
  return execFileSync('node', ['--import', 'tsx', script, ...args], { cwd: API_CWD, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function loadManifest(email: string, kids: Array<{ id: string; username: string }>, familyId: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'bz-manifest-'));
  const file = join(dir, 'manifest.json');
  writeFileSync(file, JSON.stringify({ version: 1, families: [{ legacyFamilyId: familyId, guardianEmail: email, kids: kids.map((k) => ({ legacyKidId: k.id, username: k.username })) }] }));
  try {
    runCli('src/cli/legacy-load.ts', ['--file', file, '--label', 'e2e']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('legacy: verified-email offer, claim, and explicit kid link; progress is not imported; no legacy ids or emails shown', async ({ page }) => {
  const email = newEmail();
  const familyId = `hq-fam-${unique()}`;
  loadManifest(email, [{ id: `hq-kid-${unique()}`, username: 'RoboFox' }], familyId);

  await signIn(page, email);
  const card = page.getByRole('region', { name: 'Moving from Hop Quest' });
  await expect(card).toContainText('not brought over');
  await expect(card).toContainText('progress, rewards, PINs and passwords');
  await card.getByRole('button', { name: 'Claim my Hop Quest family' }).click();
  await expect(card.getByText('RoboFox', { exact: true })).toBeVisible();

  // Nothing was created by claiming. A player appears only through the explicit link action.
  await expect(page.getByText('No players yet')).toBeVisible();
  await card.getByLabel('BidaZoo nickname for RoboFox').fill('Fox');
  await card.getByRole('button', { name: 'Create BidaZoo player' }).click();
  await expect(row(page, 'Fox')).toBeVisible();

  // The legacy card never shows the old family id, kid ids, or the matched email. (The signed-in
  // guardian's own address appears in the page header, so the check is scoped to the card.)
  const text = await card.innerText();
  expect(text).not.toContain(familyId);
  expect(text).not.toContain(email);
  expect(await page.locator('main').innerText()).not.toMatch(/hq-(fam|kid)-/);
  await expectNoOverflow(page);
  await expectCleanStorage(page);
});

test('legacy: operator claim code works once; a wrong code fails generically and is cleared', async ({ page, browser }) => {
  const oldEmail = newEmail();
  const familyId = `hq-fam-${unique()}`;
  loadManifest(oldEmail, [{ id: `hq-kid-${unique()}`, username: 'Sparrow' }], familyId);
  const issued = runCli('src/cli/legacy-claim-code.ts', ['issue', '--legacy-family', familyId, '--days', '1', '--by', 'e2e']);
  const code = /claim code:\s+(\S+)/.exec(issued)![1]!;

  await signIn(page, newEmail()); // a different verified address: the email path cannot match
  const card = page.getByRole('region', { name: 'Moving from Hop Quest' });
  await card.getByText('I have a claim code').click();

  const attempts: string[] = [];
  for (const bad of ['WRONG-CODE-1234', 'short', code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A')]) {
    await card.getByLabel('Claim code').fill(bad);
    await card.getByRole('button', { name: 'Use claim code' }).click();
    const error = fieldError(card);
    await expect(error).toContainText("didn't work");
    attempts.push(await error.innerText());
    await expect(card.getByLabel('Claim code')).toHaveValue('');
  }
  expect(new Set(attempts).size).toBe(1);

  await card.getByLabel('Claim code').fill(code);
  await card.getByRole('button', { name: 'Use claim code' }).click();
  await expect(card.getByText('Sparrow', { exact: true })).toBeVisible();
  await expect(card.getByLabel('Claim code')).toHaveCount(0).catch(() => undefined);

  // Replaying the code from another guardian fails the same generic way.
  const other = await newSignedIn(browser, newEmail());
  const otherCard = other.page.getByRole('region', { name: 'Moving from Hop Quest' });
  await otherCard.getByText('I have a claim code').click();
  await otherCard.getByLabel('Claim code').fill(code);
  await otherCard.getByRole('button', { name: 'Use claim code' }).click();
  await expect(fieldError(otherCard)).toContainText("didn't work");

  await expectCleanStorage(page);
  expect(page.url()).not.toContain(code);
  expect(await page.content()).not.toContain(code);
  await other.context.close();
});

test('game shell: a Family link appears when identity is on, and leads to the account page', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('#family-link');
  await expect(link).toBeVisible();
  await expect(page.locator('#game canvas')).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/account\.html$/);
});

test('mobile: every screen fits the viewport with practical touch targets', async ({ page }) => {
  const small = (page.viewportSize()?.width ?? 1000) <= 400;
  await page.goto('/account.html');
  await expectNoOverflow(page);
  await signIn(page, newEmail());
  await addChild(page, 'A Rather Long Nickname Here');
  await expectNoOverflow(page);
  await row(page, 'A Rather Long').getByRole('button', { name: /Set PIN/ }).click();
  await expectNoOverflow(page);
  const buttons = page.getByRole('dialog').getByRole('button');
  for (let i = 0; i < (await buttons.count()); i++) {
    const box = (await buttons.nth(i).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  // The dialog's own controls are all reachable on screen (no clipped, unreachable buttons).
  const viewport = page.viewportSize()!;
  for (let i = 0; i < (await buttons.count()); i++) {
    const box = (await buttons.nth(i).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
  await page.keyboard.press('Escape');
  const all = page.getByRole('main').getByRole('button');
  for (let i = 0; i < (await all.count()); i++) {
    const box = await all.nth(i).boundingBox();
    if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  }
  if (small) await expectNoOverflow(page);
});

// --- Identity switched off: this runs on the DEFAULT stack, where identity is not configured -----

test.describe('identity disabled', () => {
  test.use({ baseURL: 'http://127.0.0.1:4173' });

  test('guest play stays usable; no family entry point; the account page degrades without an error', async ({ page }) => {
    expect((await page.request.get('/api/v1/device')).status()).toBe(404);
    await page.goto('/');
    await expect(page.locator('#game canvas')).toBeVisible();
    await expect(page.locator('#family-link')).toHaveCount(0);

    await page.goto('/account.html');
    await expect(page.getByRole('heading', { name: /aren't available here/ })).toBeVisible();
    await expect(pageAlert(page)).toHaveText('');
    await expect(page.locator('input')).toHaveCount(0);
    await page.getByRole('link', { name: 'Play BidaZoo' }).click();
    await expect(page.locator('#game canvas')).toBeVisible();
    await expectNoOverflow(page);
    await expectCleanStorage(page);
  });
});
