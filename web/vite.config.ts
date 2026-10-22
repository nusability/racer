import { defineConfig } from 'vite';

// Relative base so the build works under the GitHub Pages project path.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
