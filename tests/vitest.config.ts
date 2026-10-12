import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['integration/**/*.test.ts'],
    globalSetup: ['integration/support/global-setup.ts'],
    // Database-backed tests share one throwaway database, so files run one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
