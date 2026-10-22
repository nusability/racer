// Minimap: the lap outline with its shortcuts, drawn once, plus racer dots each frame.
import './minimap.css';
import type { Track } from '../core/track.ts';
import type { RacerState, Vec3 } from '../core/types.ts';
import {
  MINIMAP_BRANCH_DASH,
  MINIMAP_DOT,
  MINIMAP_LINE,
  MINIMAP_PAD,
  MINIMAP_PLAYER_DOT,
  MINIMAP_SAMPLE_EVERY,
  MINIMAP_START_HALF,
} from './minimapTuning.ts';

export interface Minimap {
  update(racers: readonly RacerState[], playerIndex: number, colors: readonly string[]): void;
  dispose(): void;
}

export function createMinimap(root: HTMLElement, track: Track): Minimap {
  const canvas = document.createElement('canvas');
  canvas.className = 'minimap';
  canvas.setAttribute('aria-hidden', 'true');
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('minimap: 2D canvas unavailable');

  // Fit the whole course (loop + branches) into the canvas, north up.
  const all: Vec3[] = [
    ...track.samples.map((s) => s.pos),
    ...track.branches.flatMap((b) => b.ribbon.samples.map((s) => s.pos)),
  ];
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minZ = Math.min(...all.map((p) => p.z));
  const maxZ = Math.max(...all.map((p) => p.z));

  let size = 0;
  let scale = 1;
  let ox = 0;
  let oz = 0;
  const base = document.createElement('canvas');
  const toPx = (p: Vec3) => [(p.x - minX) * scale + ox, (p.z - minZ) * scale + oz] as const;

  function layout() {
    const css = canvas.clientWidth;
    const dpr = Math.min(2, window.devicePixelRatio);
    if (css === 0 || css * dpr === size) return;
    size = css * dpr;
    canvas.width = canvas.height = base.width = base.height = size;
    const inner = size - 2 * MINIMAP_PAD * dpr;
    scale = inner / Math.max(maxX - minX, maxZ - minZ);
    ox = (size - (maxX - minX) * scale) / 2;
    oz = (size - (maxZ - minZ) * scale) / 2;
    drawBase(dpr);
  }

  function path(c: CanvasRenderingContext2D, pts: Vec3[], close: boolean) {
    c.beginPath();
    for (let i = 0; i < pts.length; i += MINIMAP_SAMPLE_EVERY) {
      const [x, y] = toPx(pts[i]);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    if (close) c.closePath();
    else {
      const [x, y] = toPx(pts[pts.length - 1]);
      c.lineTo(x, y);
    }
  }

  function drawBase(dpr: number) {
    const c = base.getContext('2d');
    if (!c) throw new Error('minimap: 2D canvas unavailable');
    c.clearRect(0, 0, size, size);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    const main = track.samples.map((s) => s.pos);
    path(c, main, true);
    c.strokeStyle = 'rgba(20, 8, 2, 0.75)';
    c.lineWidth = (MINIMAP_LINE + 3) * dpr;
    c.stroke();
    c.strokeStyle = 'rgba(255, 233, 204, 0.9)';
    c.lineWidth = MINIMAP_LINE * dpr;
    c.stroke();
    for (const b of track.branches) {
      path(c, b.ribbon.samples.map((s) => s.pos), false);
      c.setLineDash([MINIMAP_BRANCH_DASH * dpr, MINIMAP_BRANCH_DASH * dpr]);
      c.strokeStyle = 'rgba(61, 252, 208, 0.95)';
      c.lineWidth = (MINIMAP_LINE - 1) * dpr;
      c.stroke();
      c.setLineDash([]);
    }
    // Start line: a short bar across the road at s = 0.
    const s0 = track.samples[0];
    const [sx, sy] = toPx(s0.pos);
    const rx = s0.right.x * scale * MINIMAP_START_HALF;
    const rz = s0.right.z * scale * MINIMAP_START_HALF;
    c.beginPath();
    c.moveTo(sx - rx, sy - rz);
    c.lineTo(sx + rx, sy + rz);
    c.strokeStyle = '#ff7a1a';
    c.lineWidth = 3 * dpr;
    c.stroke();
  }

  const world: Vec3 = { x: 0, y: 0, z: 0 };
  return {
    update(racers, playerIndex, colors) {
      layout();
      if (size === 0) return;
      const dpr = size / canvas.clientWidth;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(base, 0, 0);
      // Draw the player last so it is never hidden under a rival.
      for (let n = 0; n <= racers.length; n++) {
        const i = n === racers.length ? playerIndex : n;
        if (n < racers.length && i === playerIndex) continue;
        const r = racers[i];
        track.ribbon(r.branch).toWorld(r.s, r.x, 0, world);
        const [x, y] = toPx(world);
        const isPlayer = i === playerIndex;
        ctx.beginPath();
        ctx.arc(x, y, (isPlayer ? MINIMAP_PLAYER_DOT : MINIMAP_DOT) * dpr, 0, Math.PI * 2);
        ctx.fillStyle = colors[i];
        ctx.fill();
        ctx.lineWidth = (isPlayer ? 2.5 : 1.5) * dpr;
        ctx.strokeStyle = isPlayer ? '#ffffff' : 'rgba(20, 8, 2, 0.8)';
        ctx.stroke();
      }
    },
    dispose() {
      canvas.remove();
    },
  };
}
