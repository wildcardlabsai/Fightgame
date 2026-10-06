import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Single-bundle build used to publish a hosted preview (everything is inlined by scripts/preview/assemble.mjs).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist-preview', emptyOutDir: true, rollupOptions: { output: { inlineDynamicImports: true } } },
} as never)
