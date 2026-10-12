import { defineConfig } from '@playwright/test';

const PLAY_PORT = 4173;
const API_PORT = 3001;
const executablePath = process.env['PW_CHROMIUM_EXECUTABLE'];

/**
 * OFFICIAL RUN: leave PW_CHROMIUM_EXECUTABLE unset. Playwright then uses the Chromium build it
 * pins (`npx playwright install chromium`). That is the only run that counts as validation.
 *
 * SUPPLEMENTARY RUN: setting PW_CHROMIUM_EXECUTABLE points Playwright at some other Chromium
 * binary. Results from such a run are useful for catching layout/logic bugs early, but they are
 * NOT the official validation and must be reported as "supplementary".
 *
 * Required environment for the API web server: DATABASE_URL (a migrated, throwaway database).
 * COOKIE_SECURE is left unset, so the guest cookie is issued without `Secure` over http://127.0.0.1.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  // Phaser renders on the CPU in headless Chromium without a GPU. Several browsers at once starve
  // each other and cause timing flakes on small machines, so the default is one worker.
  // Override with `--workers=N` on a machine with cores to spare.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list']],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PLAY_PORT}`,
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: 'phone-small-360x640',
      use: { browserName: 'chromium', viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    {
      name: 'phone-modern-390x844',
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    },
    {
      name: 'tablet-820x1180',
      use: { browserName: 'chromium', viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    {
      name: 'desktop-1440x900',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'npm run build -w @bidazoo/api && node apps/api/dist/server.js',
      url: `http://127.0.0.1:${API_PORT}/ready`,
      cwd: '../..',
      env: { API_PORT: String(API_PORT), DATABASE_URL: process.env['DATABASE_URL'] ?? '' },
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
    {
      command: `npm run build -w @bidazoo/play && npm run preview -w @bidazoo/play -- --port ${PLAY_PORT} --strictPort`,
      url: `http://127.0.0.1:${PLAY_PORT}`,
      cwd: '../..',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  ],
});
