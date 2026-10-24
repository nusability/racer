// Race performance readout for the debug menu's toggle. The race session creates it when
// loadDebugFlags(store).perfOverlay is on and calls update() each frame with its SessionDebug.
import { h } from './kit.ts';

/** How often the text is rewritten, ms (per-frame rewrites would cost what they measure). */
const REFRESH_MS = 250;

export interface PerfSample {
  fps: number;
  drawCalls: number;
  triangles: number;
  /** Which world-look effects the race is paying for (look/look.ts describeLook). */
  look: string;
}

export interface PerfOverlay {
  update(d: PerfSample): void;
  dispose(): void;
}

export function createPerfOverlay(root: HTMLElement): PerfOverlay {
  const el = h('pre', 'race-ui perf');
  el.id = 'race_perf_overlay';
  root.append(el);
  let minFps = Infinity;
  let lastWrite = 0;
  return {
    update(d) {
      minFps = Math.min(minFps, d.fps);
      const now = performance.now();
      if (now - lastWrite < REFRESH_MS) return;
      lastWrite = now;
      el.textContent = `${d.fps.toFixed(0)} fps (min ${minFps.toFixed(0)})\n${d.drawCalls} calls  ${(d.triangles / 1000).toFixed(1)}k tris\n${d.look}`;
      minFps = Infinity;
    },
    dispose() {
      el.remove();
    },
  };
}
