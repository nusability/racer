import { defineConfig } from 'vite';

// Relative base so the build works under the GitHub Pages project path. track-viewer.html is a
// developer tool (fly-through of a track), built alongside the game but never linked from it.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: { main: 'index.html', trackViewer: 'track-viewer.html' } },
  },
});
