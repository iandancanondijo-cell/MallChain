import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Mallchain Mission Control v14 — Vite config.
// Hash-based routing: the app runs from any static host (no server rewrites needed).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    host: true,
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
