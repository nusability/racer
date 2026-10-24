import { CAM_FOV_MAX } from '../../cameraTuning.ts';
import { TERRAIN_CELLS_NEAR, TERRAIN_TILE, type Quality } from '../config.ts';
import type { Ground } from '../ground.ts';
import { sideIndex, type RibbonView } from '../shape.ts';

// Where a city building may stand and how tall it may rise: clear of the course, of the air its
// loops, corkscrews and bridges sweep through, and of the landmarks; low enough round the inside
// of a corner that the chase camera still sees the road ahead; and footed on the lowest ground
// under its whole footprint, so it never floats on a slope and never sinks out of sight on one.

/** A building's footprint: centre, width and depth along its own axes, and its yaw about +Y. */
export interface Lot {
  x: number;
  z: number;
  w: number;
  d: number;
  yaw: number;
}

export interface CitySite {
  /** The lot stands clear of every road, the air round loops and bridges, and the landmarks. */
  clear(lot: Lot): boolean;
  /** Highest roof the lot may carry (world y); Infinity where nothing caps it. */
  roofCap(lot: Lot): number;
  /**
   * The rendered terrain under the lot: `lo` is the lowest point the base must reach (the
   * footprint grown by a terrain cell, since the mesh interpolates between its vertices),
   * `hi` the highest point inside the footprint, which the building's height is measured from.
   */
  footing(lot: Lot): { lo: number; hi: number };
}

/** Buildings keep this far past the corridor's reach, the air round the course and landmark footprints. */
export const BUILDING_CLEAR = 22;
/**
 * Loops and corkscrews keep at least this much more open ground round them (their road swings
 * out sideways and up), and more for a taller one: the square round a loop is as wide as the
 * loop is high, so it reads against the sky rather than against a wall.
 */
const MAGNET_CLEAR = 80;
/** Spacing of the keep-out points along loops, corkscrews and bridge decks, metres. */
const AIR_STRIDE = 8;
/**
 * How far ahead the road must stay in view round a corner: two seconds at the top of the
 * 550–800 km/h band, the time a racer needs to read a bend and set up for it.
 */
const SIGHT_AHEAD = 450;
/** Spacing of the sightline chords along the road and of their far ends, metres. */
const SIGHT_STEP = 10;
/** Landscape iPhone aspect (844 × 390 points): the chase camera's widest horizontal view. */
const PHONE_ASPECT = 2.16;
/** Half the chase camera's horizontal view at its widest FOV: road beyond this bearing is off screen. */
const SIGHT_HALF_ANGLE = Math.atan(Math.tan(((CAM_FOV_MAX / 2) * Math.PI) / 180) * PHONE_ASPECT);
/** Bucket size of the sightline lookup grid, metres. */
const SIGHT_CELL = 100;
/** Past an open drop the roofs stay this far under the road, so the edge still reads as a fall. */
const DROP_ROOF = 8;
/** Points sampled across a footprint (per axis) for the landmark keep-out. */
const LANDMARK_PROBES = 4;

interface AirPoint {
  x: number;
  z: number;
  /** Keep-out radius round the point, metres. */
  r: number;
}

interface Chord {
  ax: number;
  az: number;
  ay: number;
  bx: number;
  bz: number;
  by: number;
}

export function citySite(ground: Ground, quality: Quality): CitySite {
  const air = airPoints(ground.views);
  const sight = sightlines(ground.views);
  const cell = TERRAIN_TILE / TERRAIN_CELLS_NEAR[quality];
  const reachOf = (lot: Lot) => Math.hypot(lot.w, lot.d) / 2;
  return {
    clear(lot) {
      const reach = reachOf(lot);
      if (!ground.clearOfCourse(lot.x, lot.z, BUILDING_CLEAR + reach)) return false;
      for (const p of air) if (Math.hypot(p.x - lot.x, p.z - lot.z) < p.r + reach) return false;
      const grown = { ...lot, w: lot.w + 2 * BUILDING_CLEAR, d: lot.d + 2 * BUILDING_CLEAR };
      for (let i = 0; i <= LANDMARK_PROBES; i++) {
        for (let j = 0; j <= LANDMARK_PROBES; j++) {
          const p = lotPoint(grown, (2 * i) / LANDMARK_PROBES - 1, (2 * j) / LANDMARK_PROBES - 1);
          if (ground.inFootprint(p.x, p.z)) return false;
        }
      }
      return true;
    },
    roofCap(lot) {
      const reach = reachOf(lot);
      let cap = Infinity;
      for (const c of sight.near(lot.x, lot.z, reach)) {
        const t = closestT(c, lot.x, lot.z);
        const px = c.ax + (c.bx - c.ax) * t;
        const pz = c.az + (c.bz - c.az) * t;
        if (Math.hypot(px - lot.x, pz - lot.z) < reach) cap = Math.min(cap, c.ay + (c.by - c.ay) * t);
      }
      const near = ground.nearest(lot.x, lot.z);
      if (near && ground.views[near.v].shape.drop[sideIndex(near.d)][near.k]) cap = Math.min(cap, ground.views[near.v].ribbon.samples[near.k].pos.y - DROP_ROOF);
      return cap;
    },
    footing(lot) {
      // The centre always counts: a footprint narrower than a terrain cell may hold no other probe.
      let hi = ground.meshHeight(lot.x, lot.z);
      let lo = hi;
      const grown = { ...lot, w: lot.w + 2 * cell, d: lot.d + 2 * cell };
      const nw = Math.ceil(grown.w / cell);
      const nd = Math.ceil(grown.d / cell);
      for (let i = 0; i <= nw; i++) {
        for (let j = 0; j <= nd; j++) {
          const a = (2 * i) / nw - 1;
          const b = (2 * j) / nd - 1;
          const p = lotPoint(grown, a, b);
          const y = ground.meshHeight(p.x, p.z);
          lo = Math.min(lo, y);
          // Inside the footprint proper (the grown ring only deepens the base).
          if (Math.abs(a) * grown.w <= lot.w && Math.abs(b) * grown.d <= lot.d) hi = Math.max(hi, y);
        }
      }
      return { lo, hi };
    },
  };
}

/** World point at (a, b) ∈ [-1, 1]² across the lot (the instance matrix's rotation about +Y). */
function lotPoint(lot: Lot, a: number, b: number): { x: number; z: number } {
  const lx = (a * lot.w) / 2;
  const lz = (b * lot.d) / 2;
  const c = Math.cos(lot.yaw);
  const s = Math.sin(lot.yaw);
  return { x: lot.x + lx * c + lz * s, z: lot.z - lx * s + lz * c };
}

/**
 * Keep-out points along every stretch of road in the air. A loop or corkscrew keeps
 * MAGNET_CLEAR or its own height, whichever is more, measured from where its road really
 * runs (a loop swings sideways off its baseline); a bridge deck, which the ground's own
 * nearest-road lookup skips, keeps the ordinary clearance.
 */
function airPoints(views: RibbonView[]): AirPoint[] {
  const out: AirPoint[] = [];
  for (const v of views) {
    const sh = v.shape;
    const smp = v.ribbon.samples;
    const n = smp.length;
    const stride = Math.max(1, Math.round(AIR_STRIDE / v.ribbon.step));
    const rise = runMax(sh.magnet, v.ribbon.closed, (k) => smp[k].pos.y - sh.gy[k]);
    for (let k = 0; k < n; k += stride) {
      if (!sh.magnet[k] && !sh.bridge[k]) continue;
      const extra = sh.magnet[k] ? Math.max(MAGNET_CLEAR, rise[k]) : 0;
      out.push({ x: smp[k].pos.x, z: smp[k].pos.z, r: Math.max(sh.outer[0][k], sh.outer[1][k]) + BUILDING_CLEAR + extra });
    }
  }
  return out;
}

/** For each flagged sample, the largest value over its contiguous flagged run (wrapping on a closed ribbon). */
function runMax(flag: Uint8Array, closed: boolean, value: (k: number) => number): Float32Array {
  const n = flag.length;
  const out = new Float32Array(n);
  // Two passes each way spread the maximum along each run; twice round covers the wrap.
  const laps = closed ? 2 : 1;
  for (let q = 0; q < n * laps; q++) {
    const k = q % n;
    if (!flag[k]) continue;
    const prev = k === 0 ? (closed ? n - 1 : -1) : k - 1;
    out[k] = Math.max(out[k], value(k), prev >= 0 && flag[prev] ? out[prev] : 0);
  }
  for (let q = n * laps - 1; q >= 0; q--) {
    const k = q % n;
    if (!flag[k]) continue;
    const next = k === n - 1 ? (closed ? 0 : -1) : k + 1;
    if (next >= 0 && flag[next]) out[k] = Math.max(out[k], out[next]);
  }
  return out;
}

/**
 * Sightlines the chase camera needs: chords from each point of the road to the road up to
 * SIGHT_AHEAD further on, while that far point is still on screen. Only chords that cut inside
 * a bend far enough to reach a building are kept; a roof under a chord never hides the road
 * along it, since the camera rides above the road.
 */
function sightlines(views: RibbonView[]): { near(x: number, z: number, reach: number): Chord[] } {
  const grid = new Map<string, Chord[]>();
  const key = (i: number, j: number) => `${i},${j}`;
  for (const v of views) {
    const r = v.ribbon;
    const smp = r.samples;
    const sh = v.shape;
    const n = smp.length;
    const stride = Math.max(1, Math.round(SIGHT_STEP / r.step));
    const steps = Math.round(SIGHT_AHEAD / SIGHT_STEP);
    const at = (k: number) => (r.closed ? (k + n) % n : k);
    for (let i = 0; i < n; i += stride) {
      // From inside a loop or a corkscrew the camera rolls with the road: no sightline to keep.
      if (sh.magnet[i] || smp[i].gap) continue;
      const a = smp[i].pos;
      const t = smp[i].tangent;
      const tl = Math.hypot(t.x, t.z);
      for (let m = 2; m <= steps; m++) {
        const q = at(i + m * stride);
        if (q >= n) break;
        const b = smp[q].pos;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 1) break;
        if ((dx * t.x + dz * t.z) / (len * tl) < Math.cos(SIGHT_HALF_ANGLE)) break;
        // The chord strays furthest from the road near its middle: skip it if that is still
        // inside the band no building may enter anyway.
        const mid = smp[at(i + Math.round((m * stride) / 2))];
        const dev = Math.abs(((mid.pos.x - a.x) * dz - (mid.pos.z - a.z) * dx) / len);
        if (dev < mid.width / 2 + BUILDING_CLEAR) continue;
        const c: Chord = { ax: a.x, az: a.z, ay: a.y, bx: b.x, bz: b.z, by: b.y };
        for (let gi = Math.floor(Math.min(a.x, b.x) / SIGHT_CELL); gi <= Math.floor(Math.max(a.x, b.x) / SIGHT_CELL); gi++) {
          for (let gj = Math.floor(Math.min(a.z, b.z) / SIGHT_CELL); gj <= Math.floor(Math.max(a.z, b.z) / SIGHT_CELL); gj++) {
            const list = grid.get(key(gi, gj));
            if (list) list.push(c);
            else grid.set(key(gi, gj), [c]);
          }
        }
      }
    }
  }
  return {
    near(x, z, reach) {
      const found = new Set<Chord>();
      for (let gi = Math.floor((x - reach) / SIGHT_CELL); gi <= Math.floor((x + reach) / SIGHT_CELL); gi++) {
        for (let gj = Math.floor((z - reach) / SIGHT_CELL); gj <= Math.floor((z + reach) / SIGHT_CELL); gj++) {
          for (const c of grid.get(key(gi, gj)) ?? []) found.add(c);
        }
      }
      return [...found];
    },
  };
}

/** Parameter of the point on the chord closest to (x, z), clamped to the chord. */
function closestT(c: Chord, x: number, z: number): number {
  const dx = c.bx - c.ax;
  const dz = c.bz - c.az;
  const l2 = dx * dx + dz * dz;
  return Math.max(0, Math.min(1, ((x - c.ax) * dx + (z - c.az) * dz) / l2));
}
