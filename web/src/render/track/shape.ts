import type { Branch, Ribbon, Track } from '../../core/track.ts';
import type { TrackFeature, TrackParam } from '../../core/types.ts';
import { BRANCH_JUNCTION_LENGTH } from '../../data/tuning.ts';
import {
  CANYON_MIN_HEIGHT,
  CANYON_OUTER,
  CHASM_SIDE,
  RIDGE_OUTER,
  RUNOFF_MIN,
  TUNNEL_ROCK_WIDTH,
  WALL_LOW,
  WALL_OUTER,
  WALL_TAPER,
} from './config.ts';
import { smoothstep } from './noise.ts';

/** One drivable ribbon to dress: the main loop or a shortcut, with its authored features. */
export interface RibbonView {
  ribbon: Ribbon;
  features: TrackFeature[];
  branch: Branch | null;
  shape: CorridorShape;
}

/**
 * Per-sample cross-section facts shared by the corridor and the ground, so the terrain knows
 * exactly how far the corridor geometry reaches and can tuck itself underneath.
 * Arrays indexed [side][k] use side 0 = left, 1 = right.
 */
export interface CorridorShape {
  /** Visual wall height above the road edge where walled: canyon walls tapered at their ends. */
  wall: Float32Array;
  /** 0 = low rock wall, 1 = full canyon cross-section. */
  canyon: Float32Array;
  tunnel: Uint8Array;
  /** Drivable sand between road edge and hard boundary, metres. */
  run: [Float32Array, Float32Array];
  /** Lateral reach of the corridor geometry from the centreline, metres. */
  outer: [Float32Array, Float32Array];
  /** The run-off here is lagoon water (a sea biome), not sand: no lip, no strip, buoys. */
  water: Uint8Array;
  /** The side opens onto a neighbouring ribbon (a junction): no side geometry at all. */
  open: [Uint8Array, Uint8Array];
  /** Horizontal unit right vector (bank removed): side geometry stands on world up. */
  rx: Float32Array;
  rz: Float32Array;
}

/** Width over which the canyon factor ramps from low wall to full canyon, metres of height. */
const CANYON_RAMP = 10;

export const sideIndex = (side: number): 0 | 1 => (side > 0 ? 1 : 0);

/** Main-loop param spans whose run-off is water. */
export type WaterSpans = { from: TrackParam; to: TrackParam }[];

export function ribbonViews(track: Track, water: WaterSpans): RibbonView[] {
  const views: RibbonView[] = [{ ribbon: track, features: track.def.features, branch: null, shape: corridorShape(track) }];
  const mainWater = views[0].shape.water;
  for (const w of water) {
    const s0 = track.paramToS(w.from);
    const len = track.wrap(track.paramToS(w.to) - s0);
    for (let d = 0; d <= len; d += track.step / 2) mainWater[Math.round(track.wrap(s0 + d) / track.step) % track.samples.length] = 1;
  }
  for (const b of track.branches) views.push({ ribbon: b.ribbon, features: b.def.features, branch: b, shape: corridorShape(b.ribbon) });
  // Junctions: each ribbon's side facing the other opens, since the other's road covers it.
  for (const b of track.branches) {
    const main = views[0].shape.open[sideIndex(b.side)];
    for (const [s0, s1] of [
      [b.entryS, b.entryS + BRANCH_JUNCTION_LENGTH],
      [b.exitS - BRANCH_JUNCTION_LENGTH, b.exitS],
    ]) {
      for (let s = s0; s <= s1; s += track.step / 2) main[Math.round(track.wrap(s) / track.step) % track.samples.length] = 1;
    }
    const r = b.ribbon;
    const open = views[b.index + 1].shape.open[sideIndex(-b.side)];
    const jEnd = r.paramToS(1);
    const xStart = r.paramToS(b.def.points.length + 2);
    r.samples.forEach((smp, k) => {
      if (smp.s <= jEnd + r.step || smp.s >= xStart - r.step) open[k] = 1;
    });
  }
  return views;
}

export function corridorShape(r: Ribbon): CorridorShape {
  const n = r.samples.length;
  const wall = new Float32Array(n);
  for (let k = 0; k < n; k++) wall[k] = r.samples[k].wallHeight;
  // Taper both ends with a forward and a backward pass (twice round when the ribbon loops).
  const drop = WALL_TAPER * r.step;
  if (r.closed) {
    for (let q = 1; q <= 2 * n; q++) wall[q % n] = Math.max(wall[q % n], wall[(q - 1) % n] - drop);
    for (let q = 2 * n; q >= 1; q--) wall[(q - 1) % n] = Math.max(wall[(q - 1) % n], wall[q % n] - drop);
  } else {
    for (let k = 1; k < n; k++) wall[k] = Math.max(wall[k], wall[k - 1] - drop);
    for (let k = n - 2; k >= 0; k--) wall[k] = Math.max(wall[k], wall[k + 1] - drop);
  }
  const canyon = new Float32Array(n);
  const tunnel = new Uint8Array(n);
  const run: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  const outer: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  const open: [Uint8Array, Uint8Array] = [new Uint8Array(n), new Uint8Array(n)];
  const water = new Uint8Array(n);
  const rx = new Float32Array(n);
  const rz = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const smp = r.samples[k];
    const half = smp.width / 2;
    canyon[k] = smoothstep((wall[k] - CANYON_MIN_HEIGHT) / CANYON_RAMP);
    wall[k] = Math.max(WALL_LOW, wall[k]);
    tunnel[k] = Number.isFinite(smp.ceiling) ? 1 : 0;
    run[0][k] = smp.edgeL - half;
    run[1][k] = smp.edgeR - half;
    for (const i of [0, 1] as const) {
      const sand = run[i][k] >= RUNOFF_MIN;
      const reach = smp.gap
        ? run[i][k] + CHASM_SIDE
        : tunnel[k]
          ? TUNNEL_ROCK_WIDTH
          : sand
            ? run[i][k] + RIDGE_OUTER
            : WALL_OUTER + (CANYON_OUTER - WALL_OUTER) * canyon[k];
      outer[i][k] = half + reach;
    }
    const l = Math.hypot(smp.right.x, smp.right.z);
    rx[k] = smp.right.x / l;
    rz[k] = smp.right.z / l;
  }
  return { wall, canyon, tunnel, run, outer, water, open, rx, rz };
}
