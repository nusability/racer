import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { offline } from './offline.vite.ts';

// Build stamp (src/build.d.ts): git short SHA + UTC build time, e.g. "bf6e129 2026-10-23T14:05Z".
// git is always present (locally and in CI), so a failure here fails the build loudly.
const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const BUILD = `${sha} ${new Date().toISOString().slice(0, 16)}Z`;

// Relative base so the build works under the GitHub Pages project path. track-viewer.html is the
// level viewer, a developer tool built alongside the game and opened from its hidden debug menu.
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  // Precache the whole build in a service worker so the game runs offline (home-screen app).
  plugins: [offline(BUILD)],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: { main: 'index.html', trackViewer: 'track-viewer.html' } },
  },
});
