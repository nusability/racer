import type { Branch, Ribbon, Track } from '../../core/track.ts';
import type { LoopSpan } from '../../core/courseShapes.ts';
import type { TrackFeature, TrackParam } from '../../core/types.ts';
import { BRANCH_JUNCTION_LENGTH, CROSSING_WINDOW } from '../../data/tuning.ts';
import { nearest } from '../../core/walls.ts';
import { CANYON_MIN_HEIGHT, CANYON_OUTER, CHASM_SIDE, RIDGE_OUTER, RUNOFF_MIN, TUNNEL_ROCK_WIDTH, WALL_OUTER } from './config.ts';
import { smoothstep } from './noise.ts';
import { markStreets, type StreetSpans } from './street.ts';

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
  /** The rock or concrete wall a walled side stands, metres over the road edge (the core's TrackSample.walls). */
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
  /** The side is an open drop: a sheer face falls away from the road edge, nothing stands there. */
  drop: [Uint8Array, Uint8Array];
  /** Loops and corkscrews: the road is held on, whatever its attitude. */
  magnet: Uint8Array;
  /** Inside a vertical loop (the road is lifted off its baseline). */
  loop: Uint8Array;
  /**
   * Where the ground meets the course: the centreline, except inside a loop, where it is the
   * baseline the loop stands on (the road itself is up in the air).
   */
  gx: Float32Array;
  gy: Float32Array;
  gz: Float32Array;
  /**
   * The road stands in the air on a deck (rails, underside, piers) instead of on the ground:
   * loops, corkscrews, the upper stretch of a bridge crossing, a road in the void (the core's
   * TrackSample.deck, whose rails it collides with).
   */
  deck: Uint8Array;
  /** Upper stretch of a bridge: the ground ignores it and follows what runs underneath. */
  bridge: Uint8Array;
  /**
   * Beside a flat X crossing: no run-off strip and no boundary dressing, the roads meet in an
   * open junction.
   */
  junction: Uint8Array;
  /** The road surface sits this far under its true height, so the other road of a flat X wins. */
  sink: Float32Array;
  /** A city street section (track/street.ts): a race barrier on the kerb, a pavement behind it. */
  street: Uint8Array;
  /** The street's side is a harbour quay over a basin rather than a pavement under shopfronts. */
  quay: [Uint8Array, Uint8Array];
}

/** Below this horizontal length the right vector is too steep to define the side by. */
const HORIZONTAL_MIN = 0.3;
/** Lateral reach of the side geometry past the edge where a drop or deck has no run-off. */
const DECK_REACH = 3;
/** Width over which the canyon factor ramps from low wall to full canyon, metres of height. */
const CANYON_RAMP = 10;

export const sideIndex = (side: number): 0 | 1 => (side > 0 ? 1 : 0);

/** Main-loop param spans whose run-off is water. */
export type WaterSpans = { from: TrackParam; to: TrackParam }[];

/** `streets`: the main loop's city street sections (track/street.ts), none outside a city. */
export function ribbonViews(track: Track, water: WaterSpans, streets: StreetSpans): RibbonView[] {
  const views: RibbonView[] = [{ ribbon: track, features: track.def.features, branch: null, shape: corridorShape(track) }];
  const mainWater = views[0].shape.water;
  for (const w of water) {
    const s0 = track.paramToS(w.from);
    const len = track.wrap(track.paramToS(w.to) - s0);
    for (let d = 0; d <= len; d += track.step / 2) mainWater[Math.round(track.wrap(s0 + d) / track.step) % track.samples.length] = 1;
  }
  for (const c of track.crossings) markCrossing(track, views[0].shape, c);
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
  // After the junctions: a street's side that opens onto a branch has no barrier.
  markStreets(track, views[0].shape, streets);
  return views;
}

export function corridorShape(r: Ribbon): CorridorShape {
  const n = r.samples.length;
  const wall = Float32Array.from(r.samples, (p) => p.walls);
  const canyon = new Float32Array(n);
  const tunnel = new Uint8Array(n);
  const run: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  const outer: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  const open: [Uint8Array, Uint8Array] = [new Uint8Array(n), new Uint8Array(n)];
  const water = new Uint8Array(n);
  const rx = new Float32Array(n);
  const rz = new Float32Array(n);
  const drop: [Uint8Array, Uint8Array] = [new Uint8Array(n), new Uint8Array(n)];
  const magnet = new Uint8Array(n);
  const loop = new Uint8Array(n);
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const gz = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const p = r.samples[k];
    drop[0][k] = p.dropL ? 1 : 0;
    drop[1][k] = p.dropR ? 1 : 0;
    magnet[k] = p.magnet ? 1 : 0;
    gx[k] = p.pos.x;
    gy[k] = p.pos.y;
    gz[k] = p.pos.z;
  }
  for (const l of r.loops) loopBaseline(r, l, loop, gx, gy, gz, rx, rz);
  for (let k = 0; k < n; k++) {
    const smp = r.samples[k];
    const half = smp.width / 2;
    canyon[k] = smoothstep((wall[k] - CANYON_MIN_HEIGHT) / CANYON_RAMP);
    tunnel[k] = Number.isFinite(smp.ceiling) ? 1 : 0;
    run[0][k] = smp.edgeL - half;
    run[1][k] = smp.edgeR - half;
    for (const i of [0, 1] as const) {
      const sand = run[i][k] >= RUNOFF_MIN;
      const reach = smp.gap
        ? run[i][k] + CHASM_SIDE
        : drop[i][k] || magnet[k]
          ? DECK_REACH
          : tunnel[k]
          ? TUNNEL_ROCK_WIDTH
          : sand
            ? run[i][k] + RIDGE_OUTER
            : WALL_OUTER + (CANYON_OUTER - WALL_OUTER) * canyon[k];
      outer[i][k] = half + reach;
    }
    // A loop's samples keep the axis of the baseline they stand on (set by loopBaseline): their
    // own right vector twists with the sideways shift over the top.
    if (loop[k]) continue;
    // A corkscrew rolls the right vector up to vertical; the tangent still gives the side.
    const l = Math.hypot(smp.right.x, smp.right.z);
    const flip = smp.up.y < 0 ? -1 : 1;
    if (l > HORIZONTAL_MIN) {
      rx[k] = (smp.right.x / l) * flip;
      rz[k] = (smp.right.z / l) * flip;
    } else {
      const t = Math.hypot(smp.tangent.x, smp.tangent.z);
      rx[k] = -smp.tangent.z / t;
      rz[k] = smp.tangent.x / t;
    }
  }
  const deck = Uint8Array.from(r.samples, (p) => (p.deck ? 1 : 0));
  const bridge = Uint8Array.from(r.samples, (p) => (p.bridge ? 1 : 0));
  return { wall, canyon, tunnel, run, outer, water, open, rx, rz, drop, magnet, loop, gx, gy, gz, deck, bridge, junction: new Uint8Array(n), sink: new Float32Array(n), street: new Uint8Array(n), quay: [new Uint8Array(n), new Uint8Array(n)] };
}

/** A flat X opens the boundary dressing this far past the other road's hard boundary. */
const JUNCTION_MARGIN = 30;
/** The lower road of a flat X sits this far down, under the other road's surface. */
const JUNCTION_SINK = 0.06;

/**
 * A declared flat crossing of the main loop with itself (a bridge's deck is the core's,
 * core/walls.ts): it opens both corridors into one junction and tucks the second road a hair
 * under the first.
 */
function markCrossing(r: Ribbon, sh: CorridorShape, c: { s: number; other: number; style: 'bridge' | 'flat' }) {
  if (c.style === 'bridge') return;
  const n = r.samples.length;
  const at = (s: number) => Math.round(r.wrap(s) / r.step) % n;
  const w = Math.round(CROSSING_WINDOW / r.step);
  for (const [mine, other, sinkIt] of [
    [c.s, c.other, false],
    [c.other, c.s, true],
  ] as const) {
    const km = at(mine);
    for (let q = km - w; q <= km + w; q++) {
      const k = ((q % n) + n) % n;
      const p = r.samples[k].pos;
      const near = nearest(r, other, p.x, p.z);
      const o = r.samples[near.k];
      const otherEdge = Math.max(o.edgeL, o.edgeR);
      if (near.d < otherEdge + r.samples[k].width / 2 + JUNCTION_MARGIN) sh.junction[k] = 1;
      if (sinkIt && near.d < otherEdge + r.samples[k].width) sh.sink[k] = JUNCTION_SINK;
    }
  }
}

/**
 * Inside a loop the ground follows the straight line from the sample before it to the one after,
 * and the side of the course is the entry's: the axis the loop turns about.
 */
function loopBaseline(r: Ribbon, span: LoopSpan, loop: Uint8Array, gx: Float32Array, gy: Float32Array, gz: Float32Array, rx: Float32Array, rz: Float32Array) {
  const k0 = Math.ceil(span.s0 / r.step);
  const k1 = Math.floor(span.s1 / r.step);
  const n = r.samples.length;
  const wrap = (k: number) => ((k % n) + n) % n;
  const a = r.samples[wrap(k0 - 1)].pos;
  const b = r.samples[wrap(k1 + 1)].pos;
  for (let k = k0; k <= k1; k++) {
    const t = (k - k0 + 1) / (k1 - k0 + 2);
    const q = wrap(k);
    loop[q] = 1;
    gx[q] = a.x + (b.x - a.x) * t;
    gy[q] = a.y + (b.y - a.y) * t;
    gz[q] = a.z + (b.z - a.z) * t;
    rx[q] = span.right.x;
    rz[q] = span.right.z;
  }
}
