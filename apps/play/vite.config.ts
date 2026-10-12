import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    // Phaser alone is ~1.2 MB minified, so the default 500 kB warning is expected noise.
    chunkSizeWarningLimit: 1500,
  },
});
