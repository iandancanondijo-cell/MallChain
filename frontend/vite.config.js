import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
      filename: 'bundle-analysis.html',
    }),
  ],

  define: {
    global: 'globalThis',
  },

  resolve: {
    alias: {
      './runtimeConfig': './runtimeConfig-browser',
    },
  },
})