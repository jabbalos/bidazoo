import { defineConfig } from '@playwright/test';

const PORT = 4173;

/**
 * Four required viewports. Chromium only (minimal download); `isMobile` and `hasTouch`
 * emulate phone behavior. Add WebKit/Firefox later if device-specific bugs appear.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
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
  webServer: {
    command: `npm run build -w @bidazoo/play && npm run preview -w @bidazoo/play -- --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    cwd: '../..',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
