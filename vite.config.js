import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages project site: https://duimalves94-beep.github.io/global-travel-guide/
  base: '/global-travel-guide/',
  resolve: {
    dedupe: ['three'],
  },
  server: {
    host: '0.0.0.0',
    port: 4731,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4731,
    strictPort: true,
  },
});
