// What stands at each side's hard boundary, and how tall: the one answer the renderer draws and
// a craft collides with. A boundary stops a craft only up to its top; one in the air at or above
// it passes over and is beside the course, where the fall rules take it (core/vehicle.ts).

import type { BoundKind, CourseBounds, FloorKind, TrackSample } from './types.ts';
import {
  BRIDGE_DECK_REACH,
  CANYON_MIN_HEIGHT,
  CROSSING_WINDOW,
  FENCE_TOP,
  QUAY_BARRIER_H,
  RAIL_HEIGHT,
  RIDGE_FENCE_BAND,
  RIDGE_HEIGHT,
  RIDGE_ROCK_SCALE,
  RUNOFF_MIN,
  STREET_WALL_TAPER,
  WALL_LOW,
  WALL_TAPER,
} from '../data/tuning.ts';

/** The ribbon being built, as far as its walls need it. */
export interface WallSite {
  readonly closed: boolean;
  readonly step: number;
  readonly below: FloorKind;
  readonly samples: TrackSample[];
  readonly crossings: readonly { s: number; other: number; style: 'bridge' | 'flat' }[];
  paramToS(u: number): number;
  delta(a: number, b: number): number;
  wrap(s: number): number;
  forRange(s0: number, s1: number, fn: (k: number) => void): void;
}

/**
 * Fills every sample's walls, boundL/R, wallL/R, deck and bridge. `bounds` is what the world
 * stands at the boundary (streets and lagoons only on the main road); `junction` marks, per side
 * (0 left, 1 right), the samples where that side opens onto another ribbon's road; `raised`, per
 * side, how tall a 'walls' feature stands that side's wall (0 where none).
 */
export function buildWalls(r: WallSite, bounds: CourseBounds, junction: [boolean[], boolean[]], raised: [number[], number[]]): void {
  const n = r.samples.length;
  const walls = eased(r, r.samples.map((p) => p.wallHeight)).map((w) => Math.max(WALL_LOW, w));
  const tall = [eased(r, raised[0]), eased(r, raised[1])];
  const street = new Array<boolean>(n).fill(false);
  const harbour: [boolean[], boolean[]] = [new Array<boolean>(n).fill(false), new Array<boolean>(n).fill(false)];
  for (const span of bounds.streets) {
    r.forRange(r.paramToS(span.from), r.paramToS(span.to), (k) => {
      street[k] = true;
      if (span.harbour !== undefined) harbour[span.harbour < 0 ? 0 : 1][k] = true;
    });
  }
  const lagoon = new Array<boolean>(n).fill(false);
  for (const span of bounds.lagoons) r.forRange(r.paramToS(span.from), r.paramToS(span.to), (k) => (lagoon[k] = true));
  easeIntoStreets(r, walls, street);
  const bridge = bridgeDecks(r);
  const ridge = RIDGE_HEIGHT * (bounds.style === 'rock' ? RIDGE_ROCK_SCALE : 1) + (bounds.style === 'fence' ? RIDGE_FENCE_BAND[1] : 0);
  r.samples.forEach((p, k) => {
    p.walls = walls[k];
    p.bridge = bridge[k];
    const tunnel = Number.isFinite(p.ceiling);
    p.deck = p.magnet || bridge[k] || (r.below === 'void' && !tunnel);
    const side = (i: 0 | 1): [BoundKind, number] => {
      if (i === 0 ? p.dropL : p.dropR) return ['drop', 0];
      // Nothing stands beside a chasm: its crack runs on past the boundary.
      if (p.gap) return ['chasm', 0];
      if (tunnel) return ['tunnel', p.ceiling];
      if (p.deck) return ['rail', RAIL_HEIGHT];
      // Where a side opens onto another road, that road's far wall bounds both.
      if (junction[i][k]) return ['wall', walls[k]];
      if (street[k]) return harbour[i][k] ? ['quay', QUAY_BARRIER_H] : ['barrier', FENCE_TOP];
      const run = (i === 0 ? p.edgeL : p.edgeR) - p.width / 2;
      // The buoys float at sea level under the road: nothing stands in the way of a craft in the air.
      if (run >= RUNOFF_MIN) return lagoon[k] ? ['buoys', 0] : ['ridge', ridge];
      return ['wall', Math.max(walls[k], tall[i][k])];
    };
    [p.boundL, p.wallL] = side(0);
    [p.boundR, p.wallR] = side(1);
  });
}

/** Authored wall heights eased in and out at their ends (WALL_TAPER), so a tall wall never pops up. */
function eased(r: WallSite, heights: readonly number[]): number[] {
  const n = heights.length;
  const wall = [...heights];
  const taper = WALL_TAPER * r.step;
  // A forward and a backward pass, twice round when the ribbon loops.
  if (r.closed) {
    for (let q = 1; q <= 2 * n; q++) wall[q % n] = Math.max(wall[q % n], wall[(q - 1) % n] - taper);
    for (let q = 2 * n; q >= 1; q--) wall[(q - 1) % n] = Math.max(wall[(q - 1) % n], wall[q % n] - taper);
  } else {
    for (let k = 1; k < n; k++) wall[k] = Math.max(wall[k], wall[k - 1] - taper);
    for (let k = n - 2; k >= 0; k--) wall[k] = Math.max(wall[k], wall[k + 1] - taper);
  }
  return wall;
}

/**
 * A street's barrier and the city's concrete walls stand on the same boundary: past a street's
 * ends the wall rises from the top of the barrier's debris fence over STREET_WALL_TAPER, so the
 * two meet without a step and nowhere along them does the boundary dip below the fence (a canyon
 * keeps its own height).
 */
function easeIntoStreets(r: WallSite, walls: number[], street: boolean[]) {
  const n = walls.length;
  const steps = Math.ceil(STREET_WALL_TAPER / r.step);
  const at = (q: number) => (r.closed ? ((q % n) + n) % n : q);
  for (let k = 0; k < n; k++) {
    if (!street[k]) continue;
    for (const dir of [-1, 1]) {
      const next = at(k + dir);
      if (next < 0 || next >= n || street[next]) continue;
      for (let i = 1; i <= steps; i++) {
        const q = at(k + dir * i);
        if (q < 0 || q >= n || street[q] || walls[q] > CANYON_MIN_HEIGHT) break;
        walls[q] = Math.min(walls[q], FENCE_TOP + ((walls[q] - FENCE_TOP) * i) / steps);
      }
    }
  }
}

/**
 * The upper road of each bridge crossing is a deck for as long as it is over the lower road's
 * corridor (BRIDGE_DECK_REACH); a loop or corkscrew there is a deck already.
 */
function bridgeDecks(r: WallSite): boolean[] {
  const n = r.samples.length;
  const bridge = new Array<boolean>(n).fill(false);
  const at = (s: number) => Math.round(r.wrap(s) / r.step) % n;
  const w = Math.round(CROSSING_WINDOW / r.step);
  for (const c of r.crossings) {
    if (c.style !== 'bridge') continue;
    const [up, low] = r.samples[at(c.s)].pos.y >= r.samples[at(c.other)].pos.y ? [c.s, c.other] : [c.other, c.s];
    const ku = at(up);
    for (let q = ku - w; q <= ku + w; q++) {
      if (!r.closed && (q < 0 || q >= n)) continue;
      const k = ((q % n) + n) % n;
      const smp = r.samples[k];
      // A ramp that loops over itself (a cloverleaf) has both passes in the window: only the
      // half nearer the upper pass is the bridge, the lower pass stays on the ground.
      if (Math.abs(r.delta(up, smp.s)) > Math.abs(r.delta(low, smp.s))) continue;
      const near = nearest(r, low, smp.pos.x, smp.pos.z);
      const lower = r.samples[near.k];
      if (!smp.magnet && near.d < Math.max(lower.edgeL, lower.edgeR) + BRIDGE_DECK_REACH + smp.width / 2) bridge[k] = true;
    }
  }
  return bridge;
}

/** Horizontal distance from (x, z) to the ribbon's centreline near s0 (within CROSSING_WINDOW), and that sample. */
export function nearest(r: Pick<WallSite, 'samples' | 'closed' | 'step' | 'wrap'>, s0: number, x: number, z: number): { d: number; k: number } {
  const n = r.samples.length;
  const c = Math.round(r.wrap(s0) / r.step) % n;
  const w = Math.round(CROSSING_WINDOW / r.step);
  let best = Infinity;
  let bk = c;
  for (let q = c - w; q <= c + w; q++) {
    if (!r.closed && (q < 0 || q >= n)) continue;
    const k = ((q % n) + n) % n;
    const p = r.samples[k].pos;
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) {
      best = d;
      bk = k;
    }
  }
  return { d: Math.sqrt(best), k: bk };
}
