// Builds a closed, uniformly sampled track from a TrackDef and answers track-space queries.
// The simulation lives entirely in track space (s, x, y); only presentation calls toWorld.

import type {
  Arch,
  BoostPad,
  Jump,
  Obstacle,
  TrackDef,
  TrackFeature,
  TrackSample,
  Vec3,
} from './types.ts';
import { mulberry32, range } from './rng.ts';
import {
  ARCH_LEG_MIN_RADIUS,
  BANK_PER_CURVATURE,
  BOOST_PAD_LENGTH,
  BOOST_PAD_WIDTH,
  CHASM_DEPTH,
  DEFAULT_NARROW_BLEND,
  KICKER_BACK_FRACTION,
  MAX_BANK,
  OBSTACLE_BUCKET,
  PILLAR_HEIGHT,
  TRACK_SAMPLE_STEP,
  TRACK_SMOOTH_RADIUS,
  TRACK_SPLINE_SUBDIVISIONS,
} from '../data/tuning.ts';

export interface Frame {
  pos: Vec3;
  tangent: Vec3;
  right: Vec3;
  up: Vec3;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function makeFrame(): Frame {
  return { pos: vec3(), tangent: vec3(), right: vec3(), up: vec3() };
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  if (l === 0) throw new Error('normalize: zero-length vector (degenerate track geometry)');
  v.x /= l;
  v.y /= l;
  v.z /= l;
  return v;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Centripetal Catmull-Rom between p1 and p2. */
function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const alpha = 0.5;
  const d = (a: Vec3, b: Vec3) => Math.max(1e-4, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) ** alpha);
  const t0 = 0;
  const t1 = t0 + d(p0, p1);
  const t2 = t1 + d(p1, p2);
  const t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a: Vec3, b: Vec3, ta: number, tb: number) => {
    const w = (u - ta) / (tb - ta);
    return vec3(a.x + (b.x - a.x) * w, a.y + (b.y - a.y) * w, a.z + (b.z - a.z) * w);
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

export class Track {
  readonly def: TrackDef;
  readonly length: number;
  readonly step: number;
  readonly samples: TrackSample[];
  readonly obstacles: Obstacle[] = [];
  readonly arches: Arch[] = [];
  readonly boostPads: BoostPad[] = [];
  readonly jumps: Jump[] = [];
  /** Arc length at each control point, plus the full length at the end. */
  private readonly pointS: number[];
  private readonly buckets: Obstacle[][];
  private readonly count: number;

  constructor(def: TrackDef) {
    this.def = def;
    const n = def.points.length;
    if (n < 4) throw new Error(`Track ${def.id}: needs at least 4 control points, has ${n}`);

    // 1. Dense closed spline.
    const ctrl = def.points.map((p) => vec3(p.x, p.y, p.z));
    const widths = def.points.map((p) => p.width ?? def.width);
    const dense: Vec3[] = [];
    const denseW: number[] = [];
    const segStart: number[] = [];
    for (let i = 0; i < n; i++) {
      segStart.push(dense.length);
      const p0 = ctrl[(i - 1 + n) % n];
      const p1 = ctrl[i];
      const p2 = ctrl[(i + 1) % n];
      const p3 = ctrl[(i + 2) % n];
      for (let k = 0; k < TRACK_SPLINE_SUBDIVISIONS; k++) {
        const t = k / TRACK_SPLINE_SUBDIVISIONS;
        dense.push(catmullRom(p0, p1, p2, p3, t));
        denseW.push(widths[i] + (widths[(i + 1) % n] - widths[i]) * smoothstep(t));
      }
    }
    dense.push({ ...dense[0] });
    denseW.push(denseW[0]);
    const cum = [0];
    for (let i = 1; i < dense.length; i++) {
      const a = dense[i - 1];
      const b = dense[i];
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    const total = cum[cum.length - 1];
    this.pointS = segStart.map((d) => cum[d]);
    this.pointS.push(total);

    // 2. Uniform resample.
    const count = Math.round(total / TRACK_SAMPLE_STEP);
    this.length = total;
    this.step = total / count;
    this.count = count;
    const pos: Vec3[] = [];
    const width: number[] = [];
    let j = 0;
    for (let k = 0; k < count; k++) {
      const s = k * this.step;
      while (cum[j + 1] < s) j++;
      const w = (s - cum[j]) / (cum[j + 1] - cum[j]);
      const a = dense[j];
      const b = dense[j + 1];
      pos.push(vec3(a.x + (b.x - a.x) * w, a.y + (b.y - a.y) * w, a.z + (b.z - a.z) * w));
      width.push(denseW[j] + (denseW[j + 1] - denseW[j]) * w);
    }

    // 3. Horizontal curvature from heading change, smoothed.
    const heading: number[] = [];
    for (let k = 0; k < count; k++) {
      const a = pos[(k - 1 + count) % count];
      const b = pos[(k + 1) % count];
      heading.push(Math.atan2(b.x - a.x, -(b.z - a.z)));
    }
    const rawCurv: number[] = [];
    for (let k = 0; k < count; k++) {
      let dh = heading[(k + 1) % count] - heading[(k - 1 + count) % count];
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      rawCurv.push(dh / (2 * this.step));
    }
    const curvature = this.smooth(rawCurv);

    // 4. Features that shape elevation, width and the sky above.
    const elev = pos.map((p) => p.y);
    const gap = new Array<boolean>(count).fill(false);
    const ceiling = new Array<number>(count).fill(Infinity);
    const wallHeight = new Array<number>(count).fill(0);
    const rng = mulberry32(def.seed);
    for (const f of def.features) this.applyShape(f, elev, width, gap, ceiling, wallHeight);

    // 5. Slope, bank, frames. Differences never straddle a gap edge: the chasm floor sits at
    // the base elevation, so a central difference at a lip would read the drop as a steep
    // downslope and launch racers into the pit instead of over it.
    const prevOf = (k: number) => {
      const p = (k - 1 + count) % count;
      return gap[p] === gap[k] ? p : k;
    };
    const nextOf = (k: number) => {
      const q = (k + 1) % count;
      return gap[q] === gap[k] ? q : k;
    };
    const slope: number[] = [];
    for (let k = 0; k < count; k++) {
      const a = prevOf(k);
      const b = nextOf(k);
      const span = (a === k ? 0 : 1) + (b === k ? 0 : 1);
      slope.push(span === 0 ? 0 : (elev[b] - elev[a]) / (span * this.step));
    }
    const bank = this.smooth(curvature.map((c) => Math.max(-MAX_BANK, Math.min(MAX_BANK, c * BANK_PER_CURVATURE))));
    const worldUp = vec3(0, 1, 0);
    this.samples = [];
    for (let k = 0; k < count; k++) {
      const p = vec3(pos[k].x, elev[k], pos[k].z);
      const a = pos[(k - 1 + count) % count];
      const b = pos[(k + 1) % count];
      // Horizontal run of the central difference with the gap-safe slope for the rise.
      const run = Math.hypot(b.x - a.x, b.z - a.z);
      const t = normalize(vec3(b.x - a.x, slope[k] * run, b.z - a.z));
      const r0 = normalize(cross(t, worldUp));
      const u0 = cross(r0, t);
      const c = Math.cos(bank[k]);
      const sn = Math.sin(bank[k]);
      this.samples.push({
        s: k * this.step,
        pos: p,
        tangent: t,
        right: vec3(r0.x * c - u0.x * sn, r0.y * c - u0.y * sn, r0.z * c - u0.z * sn),
        up: vec3(u0.x * c + r0.x * sn, u0.y * c + r0.y * sn, u0.z * c + r0.z * sn),
        width: width[k],
        curvature: curvature[k],
        slope: slope[k],
        bank: bank[k],
        gap: gap[k],
        ceiling: ceiling[k],
        wallHeight: wallHeight[k],
      });
    }

    // 6. Things standing on the road.
    for (const f of def.features) this.applyObjects(f, rng);
    this.obstacles.sort((a, b) => a.s - b.s);
    this.buckets = Array.from({ length: Math.ceil(this.length / OBSTACLE_BUCKET) }, () => []);
    for (const o of this.obstacles) {
      // An obstacle sits in every bucket its radius touches, so a query never misses it.
      const lo = Math.floor((o.s - o.radius) / OBSTACLE_BUCKET);
      const hi = Math.floor((o.s + o.radius) / OBSTACLE_BUCKET);
      for (let b = lo; b <= hi; b++) {
        this.buckets[((b % this.buckets.length) + this.buckets.length) % this.buckets.length].push(o);
      }
    }
  }

  /** Arc length of a control-point parameter (see TrackParam). */
  paramToS(u: number): number {
    const n = this.def.points.length;
    if (u < 0 || u > n) throw new Error(`Track ${this.def.id}: feature param ${u} outside 0..${n}`);
    const i = Math.min(n - 1, Math.floor(u));
    const f = u - i;
    return this.pointS[i] + (this.pointS[i + 1] - this.pointS[i]) * f;
  }

  wrap(s: number): number {
    const r = s % this.length;
    return r < 0 ? r + this.length : r;
  }

  /** Signed forward distance from a to b, in (-length/2, length/2]. */
  delta(a: number, b: number): number {
    let d = this.wrap(b - a);
    if (d > this.length / 2) d -= this.length;
    return d;
  }

  private indexOf(s: number): { i: number; f: number; i2: number } {
    const w = this.wrap(s) / this.step;
    const i = Math.floor(w) % this.samples.length;
    return { i, f: w - Math.floor(w), i2: (i + 1) % this.samples.length };
  }

  /** The nearest sample (no interpolation): for flags like gap and ceiling. */
  sampleAt(s: number): TrackSample {
    const { i, f, i2 } = this.indexOf(s);
    return this.samples[f < 0.5 ? i : i2];
  }

  private lerpScalar(s: number, key: 'width' | 'curvature' | 'slope' | 'bank'): number {
    const { i, f, i2 } = this.indexOf(s);
    return this.samples[i][key] + (this.samples[i2][key] - this.samples[i][key]) * f;
  }

  widthAt(s: number): number {
    return this.lerpScalar(s, 'width');
  }
  curvatureAt(s: number): number {
    return this.lerpScalar(s, 'curvature');
  }
  slopeAt(s: number): number {
    return this.lerpScalar(s, 'slope');
  }
  bankAt(s: number): number {
    return this.lerpScalar(s, 'bank');
  }
  /** Road surface elevation on the centreline (in a gap: where the surface would be). */
  elevationAt(s: number): number {
    const { i, f, i2 } = this.indexOf(s);
    return this.samples[i].pos.y + (this.samples[i2].pos.y - this.samples[i].pos.y) * f;
  }
  isGap(s: number): boolean {
    return this.sampleAt(s).gap;
  }
  ceilingAt(s: number): number {
    return this.sampleAt(s).ceiling;
  }
  /** Lowest a racer can fall inside a chasm before it counts as a crash. */
  chasmFloorAt(s: number): number {
    return this.elevationAt(s) - CHASM_DEPTH;
  }

  /** Interpolated, re-normalised frame at s. */
  frameAt(s: number, out: Frame = makeFrame()): Frame {
    const { i, f, i2 } = this.indexOf(s);
    const a = this.samples[i];
    const b = this.samples[i2];
    const mix = (va: Vec3, vb: Vec3, o: Vec3) => {
      o.x = va.x + (vb.x - va.x) * f;
      o.y = va.y + (vb.y - va.y) * f;
      o.z = va.z + (vb.z - va.z) * f;
      return o;
    };
    out.pos.x = a.pos.x + (b.pos.x - a.pos.x) * f;
    out.pos.y = a.pos.y + (b.pos.y - a.pos.y) * f;
    out.pos.z = a.pos.z + (b.pos.z - a.pos.z) * f;
    normalize(mix(a.tangent, b.tangent, out.tangent));
    normalize(mix(a.right, b.right, out.right));
    normalize(mix(a.up, b.up, out.up));
    return out;
  }

  /** Track space → world. y is height above the (banked) road surface. */
  toWorld(s: number, x: number, y: number, out: Vec3 = vec3(), frame: Frame = makeFrame()): Vec3 {
    const fr = this.frameAt(s, frame);
    out.x = fr.pos.x + fr.right.x * x + fr.up.x * y;
    out.y = fr.pos.y + fr.right.y * x + fr.up.y * y;
    out.z = fr.pos.z + fr.right.z * x + fr.up.z * y;
    return out;
  }

  /** Obstacles whose centre is within `ahead` metres in front of s or `behind` behind it. */
  obstaclesNear(s: number, behind: number, ahead: number, out: Obstacle[] = []): Obstacle[] {
    out.length = 0;
    const nb = this.buckets.length;
    const lo = Math.floor((s - behind) / OBSTACLE_BUCKET);
    const hi = Math.floor((s + ahead) / OBSTACLE_BUCKET);
    for (let b = lo; b <= hi && b - lo < nb; b++) {
      for (const o of this.buckets[((b % nb) + nb) % nb]) {
        const d = this.delta(s, o.s);
        if (d >= -behind && d <= ahead && !out.includes(o)) out.push(o);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------

  private smooth(values: number[]): number[] {
    const n = values.length;
    const r = TRACK_SMOOTH_RADIUS;
    return values.map((_, k) => {
      let sum = 0;
      for (let d = -r; d <= r; d++) sum += values[(k + d + n) % n];
      return sum / (2 * r + 1);
    });
  }

  /** Calls fn(k, t) for every sample index between s0 and s1 (wrapping), t = 0..1 along it. */
  private forRange(s0: number, s1: number, fn: (k: number, t: number, ds: number) => void) {
    const len = s1 >= s0 ? s1 - s0 : s1 + this.length - s0;
    const n = this.count;
    const k0 = Math.ceil(s0 / this.step);
    const steps = Math.floor(len / this.step);
    for (let q = 0; q <= steps; q++) {
      const ds = (k0 + q) * this.step - s0;
      if (ds > len) break;
      fn((((k0 + q) % n) + n) % n, len === 0 ? 0 : ds / len, ds);
    }
  }

  private applyShape(
    f: TrackFeature,
    elev: number[],
    width: number[],
    gap: boolean[],
    ceiling: number[],
    wallHeight: number[],
  ) {
    switch (f.kind) {
      case 'dunes': {
        const s0 = this.paramToS(f.from);
        const s1 = this.paramToS(f.to);
        this.forRange(s0, s1, (k, t, ds) => {
          // Fade in and out so the dunes never start with a step.
          const env = smoothstep(t * 6) * smoothstep((1 - t) * 6);
          elev[k] += f.amplitude * Math.sin((2 * Math.PI * ds) / f.wavelength) * env;
        });
        break;
      }
      case 'kicker': {
        const s0 = this.paramToS(f.at);
        const back = f.length * KICKER_BACK_FRACTION;
        this.forRange(s0, this.wrap(s0 + f.length), (k, t) => (elev[k] += f.height * t * t));
        this.forRange(this.wrap(s0 + f.length), this.wrap(s0 + f.length + back), (k, t) => {
          elev[k] += f.height * (1 - smoothstep(t));
        });
        break;
      }
      case 'jump': {
        const s0 = this.paramToS(f.at);
        const lip = this.wrap(s0 + f.rampLength);
        const end = this.wrap(lip + f.gapLength);
        this.forRange(s0, lip, (k, t) => (elev[k] += f.rampHeight * t * t));
        this.forRange(lip, end, (k) => (gap[k] = true));
        this.jumps.push({ rampStart: s0, lip, gapEnd: end, rampHeight: f.rampHeight });
        break;
      }
      case 'tunnel': {
        this.forRange(this.paramToS(f.from), this.paramToS(f.to), (k) => (ceiling[k] = f.ceiling));
        break;
      }
      case 'canyon': {
        this.forRange(this.paramToS(f.from), this.paramToS(f.to), (k) => (wallHeight[k] = f.wallHeight));
        break;
      }
      case 'narrow': {
        const blend = f.blend ?? DEFAULT_NARROW_BLEND;
        const s0 = this.paramToS(f.from);
        const s1 = this.paramToS(f.to);
        const len = s1 >= s0 ? s1 - s0 : s1 + this.length - s0;
        this.forRange(s0, s1, (k, _t, ds) => {
          const w = smoothstep(Math.min(ds, len - ds) / blend);
          width[k] = width[k] + (f.width - width[k]) * w;
        });
        break;
      }
      case 'pillar':
      case 'arch':
      case 'boulders':
      case 'boostPad':
        break;
    }
  }

  private applyObjects(f: TrackFeature, rng: () => number) {
    switch (f.kind) {
      case 'pillar': {
        const s = this.paramToS(f.at);
        this.obstacles.push({ kind: 'pillar', s, x: f.lateral, radius: f.radius, height: PILLAR_HEIGHT });
        break;
      }
      case 'arch': {
        const s = this.paramToS(f.at);
        const half = this.widthAt(s) / 2;
        const openMin = f.offset - f.opening / 2;
        const openMax = f.offset + f.opening / 2;
        // Each leg fills the road from the wall to the opening edge.
        const left = Math.max(ARCH_LEG_MIN_RADIUS, (openMin + half) / 2);
        const right = Math.max(ARCH_LEG_MIN_RADIUS, (half - openMax) / 2);
        this.obstacles.push({ kind: 'archLeg', s, x: openMin - left, radius: left, height: f.height });
        this.obstacles.push({ kind: 'archLeg', s, x: openMax + right, radius: right, height: f.height });
        this.arches.push({ s, openMin, openMax, height: f.height });
        break;
      }
      case 'boulders': {
        const s0 = this.paramToS(f.from);
        const s1 = this.paramToS(f.to);
        const len = s1 >= s0 ? s1 - s0 : s1 + this.length - s0;
        for (let i = 0; i < f.count; i++) {
          const s = this.wrap(s0 + rng() * len);
          const radius = f.radius * range(rng, 0.6, 1.2);
          const half = this.widthAt(s) / 2 - radius;
          this.obstacles.push({ kind: 'boulder', s, x: range(rng, -half, half), radius, height: radius * 1.6 });
        }
        break;
      }
      case 'boostPad': {
        const s = this.paramToS(f.at);
        this.boostPads.push({ s, x: f.lateral, length: BOOST_PAD_LENGTH, width: BOOST_PAD_WIDTH });
        break;
      }
      default:
        break;
    }
  }
}
