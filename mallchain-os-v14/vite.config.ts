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
    chunkSizeWarningLimit: 1200,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
