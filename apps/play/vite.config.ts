import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { CLIENT_CSP_META, clientSecurityHeaders } from './security-headers.ts';

// The browser only ever talks to its own origin. In development and preview, Vite forwards
// /api to the API process, so the guest cookie is same-origin and no CORS is needed. In
// production a reverse proxy does the same job.
const apiTarget = process.env['API_PROXY_TARGET'] ?? 'http://127.0.0.1:3001';
const proxy = { '/api': { target: apiTarget } };

/**
 * Production builds embed the client CSP in index.html, so enforcement does not depend on which
 * server or proxy ends up hosting the files. (`vite dev` is left alone: its hot-reload client
 * injects styles at runtime and would only produce noise.)
 */
function embedCsp(): Plugin {
  return {
    name: 'bidazoo-embed-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CLIENT_CSP_META }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig({
  plugins: [embedCsp()],
  server: { host: '127.0.0.1', port: 5173, proxy },
  // `vite preview` serves the production build: it gets the full enforced header set.
  preview: { host: '127.0.0.1', port: 4173, proxy, headers: clientSecurityHeaders() },
  build: {
    // Two pages: the game (index.html) and the family/account tools (account.html). Both get the
    // embedded CSP above.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        account: fileURLToPath(new URL('./account.html', import.meta.url)),
      },
    },
    // Phaser alone is ~1.2 MB minified, so the default 500 kB warning is expected noise.
    chunkSizeWarningLimit: 1500,
  },
});
