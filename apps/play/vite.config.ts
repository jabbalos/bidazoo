import { defineConfig } from 'vite';

// The browser only ever talks to its own origin. In development and preview, Vite forwards
// /api to the API process, so the guest cookie is same-origin and no CORS is needed. In
// production a reverse proxy does the same job.
const apiTarget = process.env['API_PROXY_TARGET'] ?? 'http://127.0.0.1:3001';
const proxy = { '/api': { target: apiTarget } };

export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, proxy },
  preview: { host: '127.0.0.1', port: 4173, proxy },
  build: {
    // Phaser alone is ~1.2 MB minified, so the default 500 kB warning is expected noise.
    chunkSizeWarningLimit: 1500,
  },
});
