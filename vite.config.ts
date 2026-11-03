import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'
import { contentPlugin } from './scripts/content-plugin'

export default defineConfig({
  plugins: [contentPlugin(), glsl({ minify: true })],
  build: {
    target: 'es2022',
    // three.js ends up in its own chunk via the dynamic import in main.ts
    assetsInlineLimit: 0,
    // budgets are tracked in gzip (docs/ARCHITECTURE.md); the three.js chunk is ~530 KB raw by design
    chunkSizeWarningLimit: 600,
  },
})
