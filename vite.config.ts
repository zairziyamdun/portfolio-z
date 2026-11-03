import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [glsl({ compress: true })],
  build: {
    target: 'es2022',
    // three.js ends up in its own chunk via the dynamic import in main.ts
    assetsInlineLimit: 0,
  },
})
