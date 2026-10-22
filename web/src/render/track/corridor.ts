import * as THREE from 'three';
import type { Track } from '../../core/track.ts';
import { FlatBuilder, SmoothBuilder, type P3 } from './builder.ts';
import {
  BERM_BLOCK,
  CANYON_RIM,
  CHUNK_LENGTH,
  ROAD_TEXTURE_LENGTH,
  STATION_STRIDE,
  TUNNEL_RIB_SPACING,
  TUNNEL_ROCK_ABOVE,
  TUNNEL_ROCK_WIDTH,
  type Quality,
} from './config.ts';
import type { Ground } from './ground.ts';
import { valueNoise } from './noise.ts';
import { quadFacing, type Paint } from './paint.ts';
import type { CorridorShape } from './shape.ts';

/** Road vertex shade inside tunnels: the bore is lit by its strips, not the sun. */
const TUNNEL_ROAD_SHADE = 0.42;
/** Tunnel bore cross-section: walls rise to this fraction of the ceiling, then chamfer in. */
const TUNNEL_WALL_FRACTION = 0.62;
const TUNNEL_CHAMFER = 0.72;
/** The mesa foot sits this far under the road so the terrain never shows below it. */
const TUNNEL_FOOT = 8;
/** Lift of tunnel light strips off their rock face, metres. */
const LIGHT_INSET = 0.08;

export interface Chunk {
  k0: number;
  k1: number;
  road: SmoothBuilder;
  env: FlatBuilder;
}

/** Side cross-section of one station: 7 points from road edge outward, with colours. */
interface Profile {
  pts: P3[];
  cols: THREE.Color[];
}

export class Corridor {
  readonly chunks: Chunk[] = [];
  readonly stride: number;
  private readonly n: number;
  private readonly chunkSamples: number;
  private readonly noise = valueNoise(911);
  private readonly profiles = new Map<number, Profile>();

  constructor(
    readonly track: Track,
    readonly shape: CorridorShape,
    readonly ground: Ground,
    readonly paint: Paint,
    quality: Quality,
    readonly glow: FlatBuilder,
  ) {
    this.n = track.samples.length;
    this.stride = STATION_STRIDE[quality];
    this.chunkSamples = Math.round(CHUNK_LENGTH / track.step);
    for (let k0 = 0; k0 < this.n; k0 += this.chunkSamples) {
      const k1 = Math.min(this.n, k0 + this.chunkSamples);
      const chunk: Chunk = { k0, k1, road: new SmoothBuilder(), env: new FlatBuilder() };
      this.chunks.push(chunk);
      this.buildRoad(chunk);
      this.buildSides(chunk);
    }
  }

  /** The chunk whose env mesh should hold something standing at s. */
  envAt(s: number): FlatBuilder {
    const k = Math.floor(this.track.wrap(s) / this.track.step);
    return this.chunks[Math.min(this.chunks.length - 1, Math.floor(k / this.chunkSamples))].env;
  }

  // --- Frames -----------------------------------------------------------------------------

  /** Point in the banked road frame of sample k. */
  banked(k: number, x: number, y: number): P3 {
    const s = this.track.samples[k % this.n];
    return {
      x: s.pos.x + s.right.x * x + s.up.x * y,
      y: s.pos.y + s.right.y * x + s.up.y * y,
      z: s.pos.z + s.right.z * x + s.up.z * y,
    };
  }

  /** Point dx metres horizontally out from the road edge on `side`, at absolute height y. */
  beside(k: number, side: number, dx: number, y: number): P3 {
    const kk = k % this.n;
    const e = this.banked(kk, (side * this.track.samples[kk].width) / 2, 0);
    return { x: e.x + this.shape.rx[kk] * side * dx, y, z: e.z + this.shape.rz[kk] * side * dx };
  }

  private gap(k: number): boolean {
    return this.track.samples[((k % this.n) + this.n) % this.n].gap;
  }
  private tunnel(k: number): boolean {
    return this.shape.tunnel[((k % this.n) + this.n) % this.n] === 1;
  }

  // --- Road ribbon --------------------------------------------------------------------------

  private buildRoad(c: Chunk) {
    const white = new THREE.Color();
    let prev: number[] | null = null;
    for (let k = c.k0; k <= c.k1; k++) {
      if (this.gap(k)) {
        prev = null;
        continue;
      }
      const smp = this.track.samples[k % this.n];
      const half = smp.width / 2;
      const v = (k * this.track.step) / ROAD_TEXTURE_LENGTH;
      white.setScalar(this.tunnel(k) ? TUNNEL_ROAD_SHADE : 1);
      const row = [-half, 0, half].map((x, i) => c.road.vertex(this.banked(k, x, 0), white, i / 2, v));
      if (prev) {
        for (let i = 0; i < 2; i++) {
          c.road.tri(prev[i], prev[i + 1], row[i + 1]);
          c.road.tri(prev[i], row[i + 1], row[i]);
        }
      }
      prev = row;
    }
  }

  // --- Sides: berms, canyon walls, shoulders, tunnels -------------------------------------

  private isStation(k: number, c: Chunk): boolean {
    if (k === c.k0 || k === c.k1 || k % this.stride === 0) return true;
    return (
      this.gap(k) !== this.gap(k - 1) ||
      this.gap(k) !== this.gap(k + 1) ||
      this.tunnel(k) !== this.tunnel(k - 1) ||
      this.tunnel(k) !== this.tunnel(k + 1)
    );
  }

  private buildSides(c: Chunk) {
    let a = -1;
    for (let k = c.k0; k <= c.k1; k++) {
      if (!this.isStation(k, c)) continue;
      if (a >= 0 && !this.gap(a) && !this.gap(k)) {
        if (this.tunnel(a) && this.tunnel(k)) this.tunnelStrip(c.env, a, k);
        else if (!this.tunnel(a) && !this.tunnel(k)) {
          this.sideStrip(c.env, a, k, -1);
          this.sideStrip(c.env, a, k, 1);
        }
      }
      if (this.tunnel(k) && !this.gap(k)) {
        if (!this.tunnel(k - 1)) this.portal(c.env, k, -1);
        if (!this.tunnel(k + 1)) this.portal(c.env, k, 1);
      }
      a = k;
    }
  }

  /** Cross-section of one side at sample k: barrier + shoulder, or canyon wall + rim + slope. */
  profile(k: number, side: number): Profile {
    const kk = k % this.n;
    const key = kk * 2 + (side > 0 ? 1 : 0);
    const hit = this.profiles.get(key);
    if (hit) return hit;
    const { wall, canyon, reach } = this.shape;
    const h = wall[kk];
    const c = canyon[kk];
    const out = reach[kk];
    const s = kk * this.track.step;
    const ey = this.banked(kk, (side * this.track.samples[kk].width) / 2, 0).y;
    const nz = (i: number) => Math.abs(this.noise(s / 15 + i * 3.1, side * 5 + i * 1.7)) * h * 0.09;
    const lean = 2 + h * 0.12;
    const ground = (dx: number) => {
      const p = this.beside(kk, side, dx, 0);
      return this.ground.height(p.x, p.z) - ey;
    };
    const g6 = ground(out);
    const bermDx = [0, 0.12, 0.25, 1.7, 3.4, out * 0.45, out];
    const bermDy = [0, h * 0.55, h, h, -0.35, ground(out * 0.45), g6];
    const rimEnd = Math.min(out - 8, lean + CANYON_RIM);
    const canDx = [0, lean * 0.35 + nz(1), lean * 0.7 + nz(2), lean + nz(3), rimEnd, rimEnd + (out - rimEnd) * 0.5, out];
    const canDy = [0, h * 0.33, h * 0.66, h, h + nz(4) * 0.4, h + (g6 - h) * 0.6, g6];
    const pts: P3[] = [];
    const cols: THREE.Color[] = [];
    for (let i = 0; i < 7; i++) {
      const dx = bermDx[i] + (canDx[i] - bermDx[i]) * c;
      const dy = bermDy[i] + (canDy[i] - bermDy[i]) * c;
      const p = this.beside(kk, side, dx, ey + dy);
      pts.push(p);
      const col = new THREE.Color();
      if (i >= 4 && c < 0.5) this.ground.color(p.x, p.z, p.y, i === 4 ? 0.6 : 0.2, col);
      else if (i >= 5) this.ground.color(p.x, p.z, p.y, 0.6, col).lerp(this.paint.strata(p.y, 0.8, new THREE.Color()), c * 0.6);
      else this.paint.strata(p.y, 0.62 + 0.38 * Math.min(1, dy / Math.max(1, h)), col);
      cols.push(col);
    }
    const prof = { pts, cols };
    this.profiles.set(key, prof);
    return prof;
  }

  private sideStrip(b: FlatBuilder, ka: number, kb: number, side: number) {
    const A = this.profile(ka, side);
    const B = this.profile(kb, side);
    const kk = ka % this.n;
    const dir = { x: -side * this.shape.rx[kk] * 0.3, y: 1, z: -side * this.shape.rz[kk] * 0.3 };
    const block = Math.floor((((ka + kb) / 2) * this.track.step) / BERM_BLOCK) % 2 === 0;
    const kerb = block ? this.paint.accent : this.paint.white;
    const kerbOn = this.shape.canyon[kk] < 0.5;
    for (let i = 0; i < 6; i++) {
      if (kerbOn && i < 3) {
        const top = i === 2 ? kerb.clone().multiplyScalar(0.8) : kerb;
        quadFacing(b, A.pts[i], A.pts[i + 1], B.pts[i + 1], B.pts[i], dir, top);
      } else {
        quadFacing(b, A.pts[i], A.pts[i + 1], B.pts[i + 1], B.pts[i], dir, A.cols[i], A.cols[i + 1], B.cols[i + 1], B.cols[i]);
      }
    }
  }

  // --- Tunnels --------------------------------------------------------------------------------

  /** Bore (inner) and mesa (outer) outlines in the banked frame, left to right. */
  private tunnelRing(k: number): { inner: P3[]; outer: P3[]; axis: P3 } {
    const kk = k % this.n;
    const smp = this.track.samples[kk];
    const h = smp.width / 2;
    const c = smp.ceiling;
    const top = c + TUNNEL_ROCK_ABOVE * (0.85 + 0.3 * Math.abs(this.noise(kk * 0.01, 7)));
    const w = TUNNEL_ROCK_WIDTH;
    const wobble = (i: number) => this.noise(kk * 0.06 + i, i * 2.3) * 4;
    const inner: [number, number][] = [
      [-h, 0],
      [-h, c * TUNNEL_WALL_FRACTION],
      [-h * TUNNEL_CHAMFER, c],
      [h * TUNNEL_CHAMFER, c],
      [h, c * TUNNEL_WALL_FRACTION],
      [h, 0],
    ];
    const outer: [number, number][] = [
      [-h - w, -TUNNEL_FOOT],
      [-h - w * 0.78 + wobble(1), top * 0.72],
      [-h - w * 0.4 + wobble(2), top + wobble(3)],
      [h + w * 0.4 + wobble(4), top + wobble(5)],
      [h + w * 0.78 + wobble(6), top * 0.72],
      [h + w, -TUNNEL_FOOT],
    ];
    return {
      inner: inner.map(([x, y]) => this.banked(kk, x, y)),
      outer: outer.map(([x, y]) => this.banked(kk, x, y)),
      axis: this.banked(kk, 0, c * 0.5),
    };
  }

  private tunnelStrip(b: FlatBuilder, ka: number, kb: number) {
    const A = this.tunnelRing(ka);
    const B = this.tunnelRing(kb);
    const col = new THREE.Color();
    const col2 = new THREE.Color();
    for (let i = 0; i < 5; i++) {
      const mid = mean(A.inner[i], A.inner[i + 1], B.inner[i], B.inner[i + 1]);
      const shade = i === 2 ? 0.28 : 0.38;
      quadFacing(b, A.inner[i], A.inner[i + 1], B.inner[i + 1], B.inner[i], sub(A.axis, mid), this.paint.strata(mid.y, shade, col));
      const mo = mean(A.outer[i], A.outer[i + 1], B.outer[i], B.outer[i + 1]);
      this.paint.strata(A.outer[i].y, 0.95, col);
      this.paint.strata(A.outer[i + 1].y, i === 2 ? 1.05 : 0.95, col2);
      quadFacing(b, A.outer[i], A.outer[i + 1], B.outer[i + 1], B.outer[i], sub(mo, A.axis), col, col2, col2, col);
    }
    this.tunnelLights(ka, kb);
  }

  private tunnelLights(ka: number, kb: number) {
    const g = this.glow;
    const warm = new THREE.Color(0xfff1c8);
    const edge = this.paint.accent;
    for (const side of [-1, 1]) {
      // Continuous strip along each upper chamfer and a guide line low on each wall.
      const strip = (k: number, x: number, y: number) => this.banked(k, side * x, y);
      for (const [x0, y0, x1, y1, color] of this.lightLines()) {
        const a0 = strip(ka, x0(ka), y0(ka));
        const a1 = strip(ka, x1(ka), y1(ka));
        const b0 = strip(kb, x0(kb), y0(kb));
        const b1 = strip(kb, x1(kb), y1(kb));
        const axis = this.banked(ka, 0, this.track.samples[ka % this.n].ceiling * 0.5);
        quadFacing(g, a0, a1, b1, b0, sub(axis, a0), color === 'warm' ? warm : edge);
      }
    }
    // Ceiling ribs: bright bars across the roof that strobe past at speed.
    const s0 = ka * this.track.step;
    const s1 = kb * this.track.step;
    const first = Math.ceil(s0 / TUNNEL_RIB_SPACING) * TUNNEL_RIB_SPACING;
    for (let s = first; s < s1; s += TUNNEL_RIB_SPACING) {
      const smp = this.track.sampleAt(s);
      const h = (smp.width / 2) * TUNNEL_CHAMFER;
      const y = smp.ceiling - LIGHT_INSET;
      const p = (ds: number, x: number) => this.track.toWorld(s + ds, x, y);
      quadFacing(g, p(0, -h), p(0, h), p(1.4, h), p(1.4, -h), sub(this.track.toWorld(s, 0, 0), p(0, 0)), warm);
    }
  }

  /** Light lines as lateral/height functions of the sample (both ends of each strip). */
  private lightLines(): [(k: number) => number, (k: number) => number, (k: number) => number, (k: number) => number, 'warm' | 'edge'][] {
    const half = (k: number) => this.track.samples[k % this.n].width / 2;
    const ceil = (k: number) => this.track.samples[k % this.n].ceiling;
    const t = 0.35;
    return [
      [
        (k) => half(k) - LIGHT_INSET - (1 - TUNNEL_CHAMFER) * half(k) * (0.5 - t / 2),
        (k) => ceil(k) * (TUNNEL_WALL_FRACTION + (1 - TUNNEL_WALL_FRACTION) * (0.5 - t / 2)),
        (k) => half(k) - LIGHT_INSET - (1 - TUNNEL_CHAMFER) * half(k) * (0.5 + t / 2),
        (k) => ceil(k) * (TUNNEL_WALL_FRACTION + (1 - TUNNEL_WALL_FRACTION) * (0.5 + t / 2)),
        'warm',
      ],
      [(k) => half(k) - LIGHT_INSET, () => 0.6, (k) => half(k) - LIGHT_INSET, () => 1.2, 'edge'],
    ];
  }

  /** The cliff face where the bore enters (dir -1) or leaves (dir 1) the mesa. */
  private portal(b: FlatBuilder, k: number, dir: number) {
    const R = this.tunnelRing(k);
    const t = this.track.samples[k % this.n].tangent;
    const facing = { x: t.x * dir, y: t.y * dir, z: t.z * dir };
    const col = new THREE.Color();
    const col2 = new THREE.Color();
    for (let i = 0; i < 5; i++) {
      this.paint.strata(R.inner[i].y, 0.8, col);
      this.paint.strata(R.outer[i + 1].y, 0.9, col2);
      quadFacing(b, R.inner[i], R.inner[i + 1], R.outer[i + 1], R.outer[i], facing, col, col, col2, col2);
    }
    // Hazard-lit frame around the mouth so the hole reads from far away.
    const frame = this.paint.hazard;
    for (let i = 0; i < 5; i++) {
      const a = R.inner[i];
      const c2 = R.inner[i + 1];
      const lift = (p: P3, m: number): P3 => ({
        x: p.x + facing.x * 0.1 + (p.x - R.axis.x) * m,
        y: p.y + facing.y * 0.1 + (p.y - R.axis.y) * m,
        z: p.z + facing.z * 0.1 + (p.z - R.axis.z) * m,
      });
      quadFacing(this.glow, lift(a, 0), lift(c2, 0), lift(c2, 0.08), lift(a, 0.08), facing, frame);
    }
  }
}

export function mean(...p: P3[]): P3 {
  const o = { x: 0, y: 0, z: 0 };
  for (const q of p) {
    o.x += q.x / p.length;
    o.y += q.y / p.length;
    o.z += q.z / p.length;
  }
  return o;
}

export function sub(a: P3, b: P3): P3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
