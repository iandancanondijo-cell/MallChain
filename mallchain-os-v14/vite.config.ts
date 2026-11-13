import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Fail `vite build` when it is being aimed at a machine the users cannot
 * reach, rather than shipping a bundle that throws on first page load.
 *
 * Vite inlines VITE_* values at build time, so the built app carries this
 * origin in every request: an upload built against `http://localhost:4000`
 * works perfectly on the build machine and is dead everywhere else.
 * `src/services/config.ts` refuses to start such a bundle, which is the back
 * stop — but a failed deploy step beats a blank page in front of a customer.
 * `VITE_ALLOW_LOCAL_API=1` is the opt-out for a deliberate local build (the
 * `vite preview` smoke test in package.json's README notes).
 */
function guardProductionApiUrl() {
  return {
    name: 'guard-production-api-url',
    apply: 'build',
    buildStart(this: any) {
      const url = process.env.VITE_API_BASE_URL || '';
      const allowLocal = process.env.VITE_ALLOW_LOCAL_API === '1';
      if (!url) {
        this.error(
          'VITE_API_BASE_URL is not set. This build would be published pointing at nothing — ' +
          'set it to the API origin deployed users can reach (see .env.example).'
        );
      }
      let host: string;
      try {
        host = new URL(url).hostname;
      } catch {
        this.error(`VITE_API_BASE_URL is not a valid absolute URL: ${url}`);
      }
      if (!allowLocal && /^(localhost|127\.|0\.0\.0\.0|::1)/.test(host)) {
        this.error(
          `VITE_API_BASE_URL=${url} is a loopback address. Rebuild with the public API origin, ` +
          'or pass VITE_ALLOW_LOCAL_API=1 if this build is only ever served from this machine.'
        );
      }
    },
  };
}

// Mallchain Mission Control v14 — Vite config.
// Hash-based routing: the app runs from any static host (no server rewrites needed).

/**
 * `/api` plus the Socket.IO endpoint, proxied to the local backend.
 *
 * The socket entry matters: `src/services/socket.ts` connects to the same
 * origin this app is served from whenever `VITE_API_BASE_URL` is unset (the
 * local dev/preview default), and the handshake is an HTTP request followed by
 * a WebSocket upgrade on `/socket.io`. Without the upgrade enabled here, the
 * socket could never connect locally, so every realtime surface — the
 * "Connected" badge, live blocks, live price, push notifications — was dead in
 * development no matter what the backend was doing.
 */
const localProxy = {
  '/api': {
    target: 'http://localhost:4000',
    changeOrigin: true,
  },
  '/socket.io': {
    target: 'http://localhost:4000',
    changeOrigin: true,
    ws: true,
  },
};

export default defineConfig({
  plugins: [react(), guardProductionApiUrl()],
  base: './',
  server: {
    port: 5173,
    host: true,
    proxy: localProxy,
  },
  // Same proxy for `vite preview`, which serves the built `dist/`. Without it
  // the only way to exercise a production build against a local API is to
  // cross the origin boundary, and the API is not CORS-permissive — so a
  // preview would show a bundle that "works" only because every request
  // failed. Build with VITE_API_BASE_URL=http://localhost:4173 (this port) to
  // keep requests same-origin and let them land here.
  preview: {
    port: 4173,
    proxy: localProxy,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    // Was 1200 — high enough that the pre-code-splitting ~2.5MB single
    // bundle never even warned. Now that routes are lazy-loaded
    // (router.tsx), the two remaining large chunks are genuinely shared
    // vendor code (@cosmjs, react, socket.io-client, hash-wasm, etc.) sitting
    // just under 1100 KB each — this keeps a signal on those without
    // warning on every small per-route chunk. Splitting that vendor code
    // further with build.rollupOptions.output.manualChunks is the next step
    // if this needs to come down further.
    chunkSizeWarningLimit: 700,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
