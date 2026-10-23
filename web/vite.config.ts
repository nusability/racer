import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// Build stamp (src/build.d.ts): git short SHA + UTC build time, e.g. "bf6e129 2026-10-23T14:05Z".
// git is always present (locally and in CI), so a failure here fails the build loudly.
const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const BUILD = `${sha} ${new Date().toISOString().slice(0, 16)}Z`;

// Relative base so the build works under the GitHub Pages project path. track-viewer.html is a
// developer tool (fly-through of a track), built alongside the game but never linked from it.
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: { main: 'index.html', trackViewer: 'track-viewer.html' } },
  },
});
