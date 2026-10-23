import * as THREE from 'three';
import type { Ribbon } from '../../core/track.ts';
import type { BoundaryStyle } from '../../data/tracks/scenery.ts';
import { FlatBuilder, SmoothBuilder, type P3 } from './builder.ts';
import {
  CANYON_RIM,
  CHUNK_LENGTH,
  KERB_BLOCK,
  LIGHT_SPACING,
  PYLON_SPACING,
  RIDGE_HEIGHT,
  RIDGE_OUTER,
  RIDGE_RISE,
  ROAD_TEXTURE_LENGTH,
  LAGOON_DEPTH,
  RUNOFF_MIN,
  SEA_LEVEL,
  STATION_STRIDE,
  type Quality,
} from './config.ts';
import type { Ground } from './ground.ts';
import { valueNoise } from './noise.ts';
import { quadFacing, rockQuad, type Paint } from './paint.ts';
import { sideIndex, type RibbonView } from './shape.ts';
import { portal, tunnelStrip } from './tunnel.ts';
import { buildSupports, deckStrip, dropFace } from './deck.ts';

/** Road vertex shade inside tunnels: the bore is lit by its strips, not the sun. */
const TUNNEL_ROAD_SHADE = 0.42;
/** A branch road reaches this far under the main road in a junction so no crack shows. */
const JUNCTION_OVERLAP = 1.2;
/** Atlas split of the road texture: u below this is paved road, above it is run-off sand. */
export const ROAD_ATLAS_SPLIT = 0.5;
/** A side is hidden when a landmark covers its lip crest or this far past the boundary. */
const HIDE_PROBE = 2;
/** Walls at least this far into a canyon are never hidden by a landmark. */
const CANYON_KEEP = 0.05;
/** Run-off sand reads a little lower than the road so the paved edge has a lip to it. */
const RUNOFF_DROP = 0.12;

export type { BoundaryStyle as Boundary } from '../../data/tracks/scenery.ts';

export interface Chunk {
  k0: number;
  k1: number;
  road: SmoothBuilder;
  sand: FlatBuilder;
  rock: FlatBuilder;
}

/** Things the corridor scatters that another module turns into instanced meshes. */
export interface Scatter {
  /** Boundary pylons on run-off lips: base point, outward direction, side and sample. */
  pylons: { p: P3; out: P3; side: number; k: number; view: number }[];
  /** Lamp posts on top of walls: base point and the direction toward the road. */
  lights: { p: P3; inward: P3 }[];
  /** Buoys floating on the hard boundary of lagoon run-off. */
  buoys: P3[];
}

/** Side cross-section of one station: 7 points from the boundary foot outward. */
interface Profile {
  pts: P3[];
  cols: THREE.Color[];
  /** Run-off lip (sand) or wall (rock). */
  sand: boolean;
  /** Inside a landmark's footprint: the landmark marks the boundary, nothing is drawn. */
  hidden: boolean;
}

/** The dressed corridor of one ribbon, in chunks for culling. */
export class Corridor {
  readonly chunks: Chunk[] = [];
  readonly stride: number;
  readonly ribbon: Ribbon;
  readonly n: number;
  private readonly chunkSamples: number;
  readonly noise = valueNoise(911);
  private readonly profiles = new Map<number, Profile>();

  constructor(
    readonly view: RibbonView,
    readonly vi: number,
    readonly ground: Ground,
    readonly paint: Paint,
    readonly boundary: BoundaryStyle,
    quality: Quality,
    readonly glow: FlatBuilder,
    readonly scatter: Scatter,
  ) {
    this.ribbon = view.ribbon;
    this.n = this.ribbon.samples.length;
    this.stride = STATION_STRIDE[quality];
    this.chunkSamples = Math.round(CHUNK_LENGTH[quality] / this.ribbon.step);
    const last = this.ribbon.closed ? this.n : this.n - 1;
    for (let k0 = 0; k0 < last; k0 += this.chunkSamples) {
      const k1 = Math.min(last, k0 + this.chunkSamples);
      // Low quality draws sand and rock untextured in one mesh: one draw call fewer per chunk.
      const rock = new FlatBuilder();
      const chunk: Chunk = { k0, k1, road: new SmoothBuilder(), sand: quality === 'low' ? rock : new FlatBuilder(), rock };
      this.chunks.push(chunk);
      this.buildRoad(chunk);
      this.buildSides(chunk);
    }
    this.collectPylons();
    buildSupports(this);
  }

  /** Marker pylons along the crest of every run-off lip; lamp posts along the top of walls. */
  private collectPylons() {
    const every = Math.round(PYLON_SPACING / this.ribbon.step);
    const lamps = Math.round(LIGHT_SPACING / this.ribbon.step);
    for (let k = 0; k < this.n; k++) {
      if (this.gap(k) || this.tunnel(k) || this.deck(k) || this.junction(k)) continue;
      for (const side of [-1, 1]) {
        if (this.open(k, side) || this.drop(k, side)) continue;
        const out = { x: this.shape.rx[k] * side, y: 0, z: this.shape.rz[k] * side };
        const sand = this.shape.run[sideIndex(side)][k] >= RUNOFF_MIN;
        if (sand && this.shape.water[k] && k % every === 0) {
          const b = this.beside(k, side, 0, SEA_LEVEL);
          this.scatter.buoys.push(b);
          continue;
        }
        if (this.profile(k, side).hidden) continue;
        if (sand && k % every === 0) this.scatter.pylons.push({ p: this.profile(k, side).pts[2], out, side, k, view: this.vi });
        if (!sand && k % lamps === 0) this.scatter.lights.push({ p: this.profile(k, side).pts[3], inward: { x: -out.x, y: 0, z: -out.z } });
      }
    }
  }

  get shape() {
    return this.view.shape;
  }

  /** The chunk that should hold something standing at s. */
  chunkAt(s: number): Chunk {
    const k = Math.floor(this.ribbon.wrap(s) / this.ribbon.step);
    return this.chunks[Math.min(this.chunks.length - 1, Math.floor(k / this.chunkSamples))];
  }

  // --- Frames -----------------------------------------------------------------------------

  idx(k: number): number {
    return this.ribbon.closed ? ((k % this.n) + this.n) % this.n : Math.max(0, Math.min(this.n - 1, k));
  }

  /** Point in the banked road frame of sample k. */
  banked(k: number, x: number, y: number): P3 {
    const s = this.ribbon.samples[this.idx(k)];
    return {
      x: s.pos.x + s.right.x * x + s.up.x * y,
      y: s.pos.y + s.right.y * x + s.up.y * y,
      z: s.pos.z + s.right.z * x + s.up.z * y,
    };
  }

  /** Lateral distance of the hard boundary on `side`. */
  edge(k: number, side: number): number {
    const s = this.ribbon.samples[this.idx(k)];
    return side > 0 ? s.edgeR : s.edgeL;
  }

  /** Point dx metres horizontally out from the hard boundary on `side`, at absolute height y. */
  beside(k: number, side: number, dx: number, y: number): P3 {
    const kk = this.idx(k);
    const e = this.banked(kk, side * this.edge(kk, side), 0);
    return { x: e.x + this.shape.rx[kk] * side * dx, y, z: e.z + this.shape.rz[kk] * side * dx };
  }

  gap(k: number): boolean {
    return this.ribbon.samples[this.idx(k)].gap;
  }
  tunnel(k: number): boolean {
    return this.shape.tunnel[this.idx(k)] === 1;
  }
  open(k: number, side: number): boolean {
    return this.shape.open[sideIndex(side)][this.idx(k)] === 1;
  }
  deck(k: number): boolean {
    return this.shape.deck[this.idx(k)] === 1;
  }
  drop(k: number, side: number): boolean {
    return this.shape.drop[sideIndex(side)][this.idx(k)] === 1;
  }
  junction(k: number): boolean {
    return this.shape.junction[this.idx(k)] === 1;
  }

  // --- Road and run-off ribbon ---------------------------------------------------------------

  private buildRoad(c: Chunk) {
    const shade = new THREE.Color();
    const branch = this.view.branch;
    const towardMain = branch ? -branch.side : 0;
    let prev: number[] | null = null;
    for (let k = c.k0; k <= c.k1; k++) {
      if (this.gap(k)) {
        prev = null;
        continue;
      }
      const smp = this.ribbon.samples[this.idx(k)];
      const half = smp.width / 2;
      const v = (k * this.ribbon.step) / ROAD_TEXTURE_LENGTH;
      shade.setScalar(this.tunnel(k) ? TUNNEL_ROAD_SHADE : 1);
      // Paved road on u 0..split; each run-off strip maps across the sand half of the atlas.
      const extL = towardMain < 0 && this.open(k, -1) ? JUNCTION_OVERLAP : 0;
      const extR = towardMain > 0 && this.open(k, 1) ? JUNCTION_OVERLAP : 0;
      // Lagoon run-off is the sea itself: no sand strip.
      // In a flat X junction the other road fills the shoulders.
      const bare = this.shape.water[this.idx(k)] === 1 || this.junction(k);
      const runL = this.open(k, -1) ? extL : bare ? 0 : Math.max(0, smp.edgeL - half);
      const runR = this.open(k, 1) ? extR : bare ? 0 : Math.max(0, smp.edgeR - half);
      const S = ROAD_ATLAS_SPLIT;
      // A deck's run-off is part of the deck, level with the road.
      const lip = (run: number) => (run > RUNOFF_MIN && !this.deck(k) ? -RUNOFF_DROP : 0);
      const y = -this.shape.sink[this.idx(k)];
      const row = [
        c.road.vertex(this.banked(k, -half - runL, y + lip(runL)), shade, 1, v),
        c.road.vertex(this.banked(k, -half, y), shade, S, v),
        c.road.vertex(this.banked(k, -half, y), shade, 0, v),
        c.road.vertex(this.banked(k, 0, y), shade, S / 2, v),
        c.road.vertex(this.banked(k, half, y), shade, S, v),
        c.road.vertex(this.banked(k, half, y), shade, S, v),
        c.road.vertex(this.banked(k, half + runR, y + lip(runR)), shade, 1, v),
      ];
      if (prev) {
        // Pairs: [0-1] left run-off, [2-3] [3-4] road, [5-6] right run-off.
        for (const [i, j] of [[0, 1], [2, 3], [3, 4], [5, 6]]) {
          c.road.tri(prev[i], prev[j], row[j]);
          c.road.tri(prev[i], row[j], row[i]);
        }
      }
      prev = row;
    }
  }

  // --- Sides: run-off lips, walls, canyons, tunnels ----------------------------------------

  private isStation(k: number, c: Chunk): boolean {
    if (k === c.k0 || k === c.k1 || k % this.stride === 0) return true;
    for (const d of [-1, 1]) {
      if (this.gap(k) !== this.gap(k + d) || this.tunnel(k) !== this.tunnel(k + d)) return true;
      if (this.shape.water[this.idx(k)] !== this.shape.water[this.idx(k + d)]) return true;
      if (this.deck(k) !== this.deck(k + d) || this.junction(k) !== this.junction(k + d)) return true;
      if (this.drop(k, -1) !== this.drop(k + d, -1) || this.drop(k, 1) !== this.drop(k + d, 1)) return true;
      if (this.open(k, -1) !== this.open(k + d, -1) || this.open(k, 1) !== this.open(k + d, 1)) return true;
      for (const side of [-1, 1]) {
        const a = this.shape.run[sideIndex(side)][this.idx(k)] >= RUNOFF_MIN;
        if (a !== this.shape.run[sideIndex(side)][this.idx(k + d)] >= RUNOFF_MIN) return true;
      }
    }
    return false;
  }

  private buildSides(c: Chunk) {
    let a = -1;
    for (let k = c.k0; k <= c.k1; k++) {
      if (!this.isStation(k, c)) continue;
      if (a >= 0 && !this.gap(a) && !this.gap(k)) {
        if (this.tunnel(a) && this.tunnel(k)) tunnelStrip(this, c.rock, a, k);
        else if (this.deck(a) && this.deck(k)) deckStrip(this, c, a, k);
        else if (!this.tunnel(a) && !this.tunnel(k) && !this.junction(a) && !this.junction(k)) {
          for (const side of [-1, 1]) {
            if (this.open(a, side) || this.open(k, side)) continue;
            if (this.drop(a, side) && this.drop(k, side)) dropFace(this, c, a, k, side);
            else if (!this.drop(a, side) && !this.drop(k, side)) this.sideStrip(c, a, k, side);
          }
          if (this.shape.water[this.idx(a)] && this.shape.water[this.idx(k)]) this.causewaySides(c, a, k);
        }
      }
      if (this.tunnel(k) && !this.gap(k)) {
        if (!this.tunnel(k - 1)) portal(this, c.rock, k, -1);
        if (!this.tunnel(k + 1)) portal(this, c.rock, k, 1);
      }
      a = k;
    }
  }

  /** Cross-section of one side at sample k, from the boundary foot outward. */
  profile(k: number, side: number): Profile {
    const kk = this.idx(k);
    const key = kk * 2 + sideIndex(side);
    const hit = this.profiles.get(key);
    if (hit) return hit;
    const run = this.shape.run[sideIndex(side)][kk];
    const prof = run >= RUNOFF_MIN ? this.lipProfile(kk, side) : this.wallProfile(kk, side);
    // A landmark replaces a run-off lip or a low wall it stands on; canyon walls always stay.
    const probe = this.beside(kk, side, HIDE_PROBE, 0);
    const covered = this.ground.inFootprint(prof.pts[2].x, prof.pts[2].z) || this.ground.inFootprint(probe.x, probe.z);
    prof.hidden = (covered && this.shape.canyon[kk] < CANYON_KEEP && !this.tunnel(kk)) || (run >= RUNOFF_MIN && this.shape.water[kk] === 1);
    this.profiles.set(key, prof);
    return prof;
  }

  /** Height of the ground at dx past the boundary, relative to the boundary foot. */
  private groundAt(kk: number, side: number, dx: number, footY: number): number {
    const p = this.beside(kk, side, dx, 0);
    return this.ground.height(p.x, p.z) - footY;
  }

  /** Run-off side: a rising lip of sand or rock just past the boundary, then back to the dunes. */
  private lipProfile(kk: number, side: number): Profile {
    const s = kk * this.ribbon.step;
    const foot = this.banked(kk, side * this.edge(kk, side), -RUNOFF_DROP);
    const outer = RIDGE_OUTER;
    const n = (i: number) => this.noise(s / 21 + i * 3.7, side * 9 + i) * 0.8;
    const rock = this.boundary === 'rock';
    const h = RIDGE_HEIGHT * (rock ? 1.3 : 1) + n(0);
    const g5 = this.groundAt(kk, side, outer * 0.6, foot.y);
    const g6 = this.groundAt(kk, side, outer, foot.y);
    const dx = [0, RIDGE_RISE * 0.4, RIDGE_RISE, RIDGE_RISE + 5 + n(1), RIDGE_RISE + 14, outer * 0.6, outer];
    const dy = [0, h * (rock ? 0.75 : 0.45), h, h * 0.92, Math.max(g5, h * 0.4), g5, g6];
    const pts: P3[] = [];
    const cols: THREE.Color[] = [];
    for (let i = 0; i < 7; i++) {
      const p = this.beside(kk, side, dx[i], foot.y + dy[i]);
      if (i === 0) Object.assign(p, foot);
      pts.push(p);
      const col = new THREE.Color();
      if (rock && i >= 1 && i <= 3) this.paint.strata(p.y, 0.95, col);
      else this.ground.color(p.x, p.z, p.y, i === 1 ? 0.5 : 0.15, col);
      cols.push(col);
    }
    return { pts, cols, sand: !rock, hidden: false };
  }

  /** Walled side: a rock wall at the road edge, growing into a full canyon where tall. */
  private wallProfile(kk: number, side: number): Profile {
    const h = this.shape.wall[kk];
    const c = this.shape.canyon[kk];
    const s = kk * this.ribbon.step;
    const foot = this.banked(kk, side * this.edge(kk, side), 0);
    const outer = this.shape.outer[sideIndex(side)][kk] - this.edge(kk, side);
    const nz = (i: number) => Math.abs(this.noise(s / 15 + i * 3.1, side * 5 + i * 1.7)) * h * 0.09;
    const lean = 1.2 + h * 0.12;
    const g6 = this.groundAt(kk, side, outer, foot.y);
    const rimEnd = Math.min(outer - 8, lean + 6 + (CANYON_RIM - 6) * c);
    const dx = [0, lean * 0.35 + nz(1), lean * 0.7 + nz(2), lean + nz(3), rimEnd, rimEnd + (outer - rimEnd) * 0.5, outer];
    const dy = [0, h * 0.33, h * 0.66, h, h + nz(4) * 0.4, h + (g6 - h) * 0.6, g6];
    const pts: P3[] = [];
    const cols: THREE.Color[] = [];
    for (let i = 0; i < 7; i++) {
      const p = this.beside(kk, side, dx[i], foot.y + dy[i]);
      pts.push(p);
      const col = new THREE.Color();
      if (i >= 5) this.ground.color(p.x, p.z, p.y, 0.6, col).lerp(this.paint.strata(p.y, 0.8, new THREE.Color()), 0.3 + c * 0.4);
      else this.paint.strata(p.y, 0.62 + 0.38 * Math.min(1, dy[i] / Math.max(1, h)), col);
      cols.push(col);
    }
    return { pts, cols, sand: false, hidden: false };
  }

  /** Over lagoon water the road stands on a causeway: its faces drop into the sea. */
  private causewaySides(c: Chunk, ka: number, kb: number) {
    const bed = SEA_LEVEL - LAGOON_DEPTH - 0.5;
    const col = this.paint.white.clone().multiplyScalar(0.62);
    const wetCol = this.paint.white.clone().multiplyScalar(0.38);
    for (const side of [-1, 1]) {
      const half = (k: number) => (side * this.ribbon.samples[this.idx(k)].width) / 2;
      const a = this.banked(ka, half(ka), 0);
      const b = this.banked(kb, half(kb), 0);
      const kk = this.idx(ka);
      const out = { x: this.shape.rx[kk] * side, y: 0, z: this.shape.rz[kk] * side };
      quadFacing(c.rock, { ...a, y: bed }, { ...b, y: bed }, b, a, out, wetCol, wetCol, col, col);
    }
  }

  private sideStrip(c: Chunk, ka: number, kb: number, side: number) {
    const A = this.profile(ka, side);
    const B = this.profile(kb, side);
    if (A.hidden || B.hidden) return;
    const kk = this.idx(ka);
    const dir = { x: -side * this.shape.rx[kk] * 0.3, y: 1, z: -side * this.shape.rz[kk] * 0.3 };
    const both = A.sand && B.sand;
    const target = both ? c.sand : c.rock;
    for (let i = 0; i < 6; i++) {
      const lipFace = i < 3;
      if (!A.sand && !B.sand && i < 4) {
        rockQuad(c.rock, this.paint, A.pts[i], B.pts[i], B.pts[i + 1], A.pts[i + 1], dir, i === 0 ? 0.75 : 0.92);
      } else if (!both && lipFace) {
        quadFacing(c.rock, A.pts[i], A.pts[i + 1], B.pts[i + 1], B.pts[i], dir, A.cols[i], A.cols[i + 1], B.cols[i + 1], B.cols[i]);
      } else {
        quadFacing(i >= 4 ? c.sand : target, A.pts[i], A.pts[i + 1], B.pts[i + 1], B.pts[i], dir, A.cols[i], A.cols[i + 1], B.cols[i + 1], B.cols[i]);
      }
    }
    // Walls get an unlit hazard kerb along their foot so they read at speed.
    if (!A.sand && !B.sand) {
      const block = Math.floor((((ka + kb) / 2) * this.ribbon.step) / KERB_BLOCK) % 2 === 0;
      const lift = (p: P3, y: number): P3 => ({ x: p.x - side * this.shape.rx[kk] * 0.05, y: p.y + y, z: p.z - side * this.shape.rz[kk] * 0.05 });
      quadFacing(this.glow, lift(A.pts[0], 0), lift(B.pts[0], 0), lift(B.pts[0], 1.1), lift(A.pts[0], 1.1), dir, block ? this.paint.accent : this.paint.white);
    }
  }
}
