// Builds uniformly sampled ribbons (the main road, closed on a circuit and open on a sprint,
// and the open branches: shortcuts and the routes of forks) and answers track-space queries.
// The simulation lives entirely in track space (s, x, y); only presentation calls toWorld.

import type {
  Arch,
  BoostCell,
  BoostPad,
  BranchDef,
  CourseKind,
  FloorKind,
  Jump,
  Obstacle,
  TrackControlPoint,
  TrackDef,
  TrackFeature,
  TrackSample,
  Vec3,
} from './types.ts';
import { catmullRom, cross, makeFrame, normalize, smoothstep, vec3, type Frame } from './geom.ts';
import { layLoops, shapeCourse, type LoopSpan } from './courseShapes.ts';
import { compileHazards, type CourseHazard } from './hazards.ts';
import { mulberry32, range } from './rng.ts';
import {
  AI_ROUTE_OBSTACLE_METRES,
  ARCH_LEG_MIN_RADIUS,
  BANK_PER_CURVATURE,
  BOOST_PAD_LENGTH,
  BOOST_PAD_WIDTH,
  BRANCH_EDGE_FADE,
  BRANCH_JUNCTION_LENGTH,
  CHASM_DEPTH,
  DEFAULT_NARROW_BLEND,
  DROP_DEPTH,
  KICKER_BACK_FRACTION,
  MAX_BANK,
  OBSTACLE_BUCKET,
  PILLAR_HEIGHT,
  SEA_LEVEL,
  SPRINT_GRID_APRON,
  SPRINT_RUNOUT,
  TRACK_SAMPLE_STEP,
  TRACK_SMOOTH_RADIUS,
  TRACK_SPLINE_SUBDIVISIONS,
} from '../data/tuning.ts';

export { makeFrame, vec3, type Frame } from './geom.ts';

/** What a ribbon is built from: the main road's def or a branch's derived one. */
export interface RibbonSpec {
  id: string;
  closed: boolean;
  /**
   * The control point the features' param 0 names: 0, except on a sprint, whose builder puts
   * the grid apron's point first (so the author's point 0, the start line, is control point 1).
   */
  paramOffset: number;
  seed: number;
  width: number;
  runoff: number;
  /** What lies below it (see FloorKind): a branch has its main road's. */
  floor: FloorKind;
  points: TrackControlPoint[];
  features: TrackFeature[];
}

/** Extra edge room a junction needs, applied after the ribbon's own features. */
interface EdgeOverride {
  s0: number;
  s1: number;
  side: -1 | 1;
  /** The edge sits this far beyond that side's road edge (0 = a wall at the road edge). */
  extra: number;
  /**
   * Blend from the ribbon's own edge into this one along the range ('in') or back out of it
   * ('out'), so run-off narrows gradually instead of stepping into a wall.
   */
  fade?: 'in' | 'out';
}

export class Ribbon {
  readonly id: string;
  readonly closed: boolean;
  /** What lies below the course (see FloorKind); each sample carries its floor's height. */
  readonly below: FloorKind;
  readonly length: number;
  readonly step: number;
  readonly samples: TrackSample[];
  readonly obstacles: Obstacle[] = [];
  readonly arches: Arch[] = [];
  readonly boostPads: BoostPad[] = [];
  readonly cells: BoostCell[] = [];
  /** Repair cells; indices are their own (separate from boost cells). */
  readonly repairCells: BoostCell[] = [];
  /** Declared self-crossings, as s pairs on this ribbon. */
  readonly crossings: { s: number; other: number; style: 'bridge' | 'flat' }[] = [];
  /** Scheduled hazards on this ribbon (see core/hazards.ts). */
  readonly hazards: CourseHazard[];
  readonly jumps: Jump[] = [];
  /** Vertical loops, in s along the finished road (see layLoops). */
  readonly loops: LoopSpan[];
  /** Authored arc length at each control point (for a closed loop, plus the full length at the end). */
  private readonly pointS: number[];
  /** Matching knots of authored arc length and s on the finished road (see baseToS). */
  private readonly baseKnots: number[];
  private readonly sKnots: number[];
  private readonly paramOffset: number;
  private readonly buckets: Obstacle[][];
  /** Number of resampled intervals; samples.length is count (closed) or count + 1 (open). */
  private readonly count: number;

  constructor(spec: RibbonSpec, edgeOverrides: EdgeOverride[] = []) {
    this.id = spec.id;
    this.closed = spec.closed;
    this.below = spec.floor;
    this.paramOffset = spec.paramOffset;
    const n = spec.points.length;
    if (n < 4) throw new Error(`Ribbon ${spec.id}: needs at least 4 control points, has ${n}`);

    // 1. Dense spline. An open ribbon mirrors its end points to give the end segments a tangent.
    const ctrl = spec.points.map((p) => vec3(p.x, p.y, p.z));
    const widths = spec.points.map((p) => p.width ?? spec.width);
    const at = (i: number): Vec3 => {
      if (this.closed) return ctrl[(i + n) % n];
      if (i < 0) return vec3(2 * ctrl[0].x - ctrl[1].x, 2 * ctrl[0].y - ctrl[1].y, 2 * ctrl[0].z - ctrl[1].z);
      if (i >= n) {
        const a = ctrl[n - 1];
        const b = ctrl[n - 2];
        return vec3(2 * a.x - b.x, 2 * a.y - b.y, 2 * a.z - b.z);
      }
      return ctrl[i];
    };
    const segments = this.closed ? n : n - 1;
    const dense: Vec3[] = [];
    const denseW: number[] = [];
    const segStart: number[] = [];
    for (let i = 0; i < segments; i++) {
      segStart.push(dense.length);
      const w0 = widths[i];
      const w1 = widths[(i + 1) % n];
      for (let k = 0; k < TRACK_SPLINE_SUBDIVISIONS; k++) {
        const t = k / TRACK_SPLINE_SUBDIVISIONS;
        dense.push(catmullRom(at(i - 1), at(i), at(i + 1), at(i + 2), t));
        denseW.push(w0 + (w1 - w0) * smoothstep(t));
      }
    }
    dense.push(this.closed ? { ...dense[0] } : { ...ctrl[n - 1] });
    denseW.push(this.closed ? denseW[0] : widths[n - 1]);
    const arcLength = (pts: Vec3[]) => {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
      }
      return cum;
    };
    const baseCum = arcLength(dense);
    this.pointS = segStart.map((d) => baseCum[d]);
    this.pointS.push(baseCum[baseCum.length - 1]);

    // Loops go in before the resample: they add road, and s must be true road length for the
    // simulation, the camera and the mesh alike (a sample every TRACK_SAMPLE_STEP of real road).
    const line = layLoops(spec.features, dense, denseW, baseCum, (u) => this.baseParamToS(u));
    const cum = arcLength(line.pts);
    const total = cum[cum.length - 1];
    this.baseKnots = line.base;
    this.sKnots = cum;
    this.loops = line.loops.map((l) => ({ at: l.at, s0: this.baseToS(l.b0), s1: this.baseToS(l.b1), settled: this.baseToS(l.settled), shift: l.shift, right: l.right }));

    // 2. Uniform resample.
    const count = Math.round(total / TRACK_SAMPLE_STEP);
    this.length = total;
    this.step = total / count;
    this.count = count;
    const ns = this.closed ? count : count + 1;
    const pos: Vec3[] = [];
    const width: number[] = [];
    const drift: Vec3[] = [];
    let j = 0;
    for (let k = 0; k < ns; k++) {
      const s = Math.min(total, k * this.step);
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const w = (s - cum[j]) / (cum[j + 1] - cum[j]);
      const a = line.pts[j];
      const b = line.pts[j + 1];
      pos.push(vec3(a.x + (b.x - a.x) * w, a.y + (b.y - a.y) * w, a.z + (b.z - a.z) * w));
      width.push(line.widths[j] + (line.widths[j + 1] - line.widths[j]) * w);
      const da = line.drift[j];
      const db = line.drift[j + 1];
      drift.push(vec3(da.x + (db.x - da.x) * w, 0, da.z + (db.z - da.z) * w));
    }

    // 3. Horizontal curvature from heading change, smoothed. A loop's settle is left out: the
    // road eases sideways back onto its line there, and racers ride it as the straight it was.
    const heading: number[] = [];
    for (let k = 0; k < ns; k++) {
      const ka = this.nb(k, -1);
      const kb = this.nb(k, 1);
      const a = pos[ka];
      const b = pos[kb];
      heading.push(Math.atan2(b.x - drift[kb].x - (a.x - drift[ka].x), -(b.z - drift[kb].z - (a.z - drift[ka].z))));
    }
    const rawCurv: number[] = [];
    for (let k = 0; k < ns; k++) {
      const a = this.nb(k, -1);
      const b = this.nb(k, 1);
      let dh = heading[b] - heading[a];
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      rawCurv.push(dh / ((b - a === 0 ? 1 : this.closed ? 2 : b - a) * this.step));
    }
    // A loop turns in the vertical plane: its heading flips over the top, which is no corner.
    for (const l of this.loops) this.forRange(l.s0, l.s1, (k) => (rawCurv[k] = 0));
    const curvature = this.smooth(rawCurv);

    // 4. Features that shape elevation, width, edges and the sky above.
    const elev = pos.map((p) => p.y);
    const gap = new Array<boolean>(ns).fill(false);
    const ceiling = new Array<number>(ns).fill(Infinity);
    const wallHeight = new Array<number>(ns).fill(0);
    const runL = new Array<number>(ns).fill(spec.runoff);
    const runR = new Array<number>(ns).fill(spec.runoff);
    const rng = mulberry32(spec.seed);
    for (const f of spec.features) this.applyShape(f, elev, width, gap, ceiling, wallHeight, runL, runR);
    for (let k = 0; k < ns; k++) pos[k].y = elev[k];
    const shape = shapeCourse({ paramToS: (u) => this.paramToS(u), forRange: (a, b, fn) => this.forRange(a, b, fn) }, spec.features, this.loops, ns, runL, runR);
    const edgeL = width.map((w, k) => w / 2 + runL[k]);
    const edgeR = width.map((w, k) => w / 2 + runR[k]);
    for (const o of edgeOverrides) {
      this.forRange(o.s0, o.s1, (k, t) => {
        const own = o.side < 0 ? edgeL[k] : edgeR[k];
        const target = width[k] / 2 + o.extra;
        const w = o.fade === 'in' ? smoothstep(t) : o.fade === 'out' ? 1 - smoothstep(t) : 1;
        const edge = own + (target - own) * w;
        if (o.side < 0) edgeL[k] = edge;
        else edgeR[k] = edge;
      });
    }

    // 5. Slope, bank, frames. Differences never straddle a gap edge: the chasm floor sits at
    // the base elevation, so a central difference at a lip would read the drop as a steep
    // downslope and launch racers into the pit instead of over it.
    const prevOf = (k: number) => {
      const p = this.nb(k, -1);
      return gap[p] === gap[k] ? p : k;
    };
    const nextOf = (k: number) => {
      const q = this.nb(k, 1);
      return gap[q] === gap[k] ? q : k;
    };
    const slope: number[] = [];
    for (let k = 0; k < ns; k++) {
      const a = prevOf(k);
      const b = nextOf(k);
      const span = (a === k ? 0 : 1) + (b === k ? 0 : 1);
      slope.push(span === 0 ? 0 : (elev[b] - elev[a]) / (span * this.step));
    }
    const bank = this.smooth(curvature.map((c) => Math.max(-MAX_BANK, Math.min(MAX_BANK, c * BANK_PER_CURVATURE))));
    const floor = this.floors(elev, gap);
    const worldUp = vec3(0, 1, 0);
    this.samples = [];
    for (let k = 0; k < ns; k++) {
      const p = vec3(pos[k].x, elev[k], pos[k].z);
      const a = pos[this.nb(k, -1)];
      const b = pos[this.nb(k, 1)];
      const loopRight = shape.loopRight[k];
      let t: Vec3;
      let r0: Vec3;
      if (loopRight) {
        t = normalize(vec3(b.x - a.x, b.y - a.y, b.z - a.z));
        const along = t.x * loopRight.x + t.y * loopRight.y + t.z * loopRight.z;
        r0 = normalize(vec3(loopRight.x - t.x * along, loopRight.y - t.y * along, loopRight.z - t.z * along));
      } else {
        // Horizontal run of the central difference with the gap-safe slope for the rise.
        const run = Math.hypot(b.x - a.x, b.z - a.z);
        t = normalize(vec3(b.x - a.x, slope[k] * run, b.z - a.z));
        r0 = normalize(cross(t, worldUp));
      }
      const u0 = cross(r0, t);
      const roll = bank[k] + shape.bankAdd[k];
      const c = Math.cos(roll);
      const sn = Math.sin(roll);
      this.samples.push({
        s: Math.min(total, k * this.step),
        pos: p,
        tangent: t,
        right: vec3(r0.x * c - u0.x * sn, r0.y * c - u0.y * sn, r0.z * c - u0.z * sn),
        up: vec3(u0.x * c + r0.x * sn, u0.y * c + r0.y * sn, u0.z * c + r0.z * sn),
        width: width[k],
        curvature: curvature[k],
        slope: slope[k],
        bank: roll,
        gap: gap[k],
        ceiling: ceiling[k],
        wallHeight: wallHeight[k],
        edgeL: edgeL[k],
        edgeR: edgeR[k],
        dropL: shape.dropL[k],
        dropR: shape.dropR[k],
        magnet: shape.magnet[k],
        grip: shape.grip[k],
        rough: shape.rough[k],
        floor: floor.y[k],
        water: floor.water[k],
      });
    }

    // 6. Things standing on the road.
    for (const f of spec.features) this.applyObjects(f, rng);
    this.hazards = compileHazards(this, spec.features, spec.seed);
    for (const f of spec.features) {
      if (f.kind === 'crossing') this.crossings.push({ s: this.paramToS(f.at), other: this.paramToS(f.other), style: f.style });
    }
    this.obstacles.sort((a, b) => a.s - b.s);
    this.buckets = Array.from({ length: Math.ceil(this.length / OBSTACLE_BUCKET) }, () => []);
    for (const o of this.obstacles) {
      // An obstacle sits in every bucket its radius touches, so a query never misses it.
      const lo = Math.floor((o.s - o.radius) / OBSTACLE_BUCKET);
      const hi = Math.floor((o.s + o.radius) / OBSTACLE_BUCKET);
      for (let b = lo; b <= hi; b++) {
        if (!this.closed && (b < 0 || b >= this.buckets.length)) continue;
        this.buckets[((b % this.buckets.length) + this.buckets.length) % this.buckets.length].push(o);
      }
    }
  }

  /**
   * The floor under every sample (see FloorKind): in a chasm, CHASM_DEPTH below the lower of its
   * two edges (one flat floor per chasm); elsewhere DROP_DEPTH below the road, which is what lies
   * past an open edge. Over water the sea's surface when that is higher; over the void none.
   */
  private floors(elev: readonly number[], gap: readonly boolean[]): { y: number[]; water: boolean[] } {
    const n = elev.length;
    const ground = elev.map((e) => e - DROP_DEPTH);
    const done = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      if (!gap[k] || done[k]) continue;
      // The whole run of gap samples k belongs to (on a circuit it may wrap the start line).
      let a = k;
      while (gap[this.nb(a, -1)] && this.nb(a, -1) !== a && this.nb(a, -1) !== k) a = this.nb(a, -1);
      let b = k;
      while (gap[this.nb(b, 1)] && this.nb(b, 1) !== b && this.nb(b, 1) !== a) b = this.nb(b, 1);
      const bottom = Math.min(elev[this.nb(a, -1)], elev[this.nb(b, 1)]) - CHASM_DEPTH;
      for (let q = a; ; q = this.nb(q, 1)) {
        ground[q] = bottom;
        done[q] = 1;
        if (q === b) break;
      }
    }
    switch (this.below) {
      case 'ground':
        return { y: ground, water: ground.map(() => false) };
      case 'water':
        return { y: ground.map((g) => Math.max(g, SEA_LEVEL)), water: ground.map((g) => g <= SEA_LEVEL) };
      case 'void':
        return { y: ground.map(() => -Infinity), water: ground.map(() => false) };
    }
  }

  /** Neighbour sample index d steps away (clamped at the ends of an open ribbon). */
  private nb(k: number, d: number): number {
    const ns = this.closed ? this.count : this.count + 1;
    if (this.closed) return (k + d + ns) % ns;
    return Math.max(0, Math.min(ns - 1, k + d));
  }

  /** Arc length of a control-point parameter (see TrackParam). */
  paramToS(param: number): number {
    return this.baseToS(this.baseParamToS(param));
  }

  /** Arc length of a control-point parameter along the line as authored, before loops were laid in. */
  private baseParamToS(param: number): number {
    const segments = this.pointS.length - 1;
    const u = param + this.paramOffset;
    if (u < 0 || u > segments) throw new Error(`Ribbon ${this.id}: feature param ${param} outside ${-this.paramOffset}..${segments - this.paramOffset}`);
    const i = Math.min(segments - 1, Math.floor(u));
    const f = u - i;
    return this.pointS[i] + (this.pointS[i + 1] - this.pointS[i]) * f;
  }

  /**
   * s on the finished road of an authored arc length. Past a loop it moves on by the loop's
   * extra road; inside one it spreads evenly over the loop, like the authored straight it replaced.
   */
  private baseToS(b: number): number {
    const base = this.baseKnots;
    let lo = 0;
    let hi = base.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (base[mid] <= b) lo = mid;
      else hi = mid;
    }
    const span = base[hi] - base[lo];
    const w = span > 0 ? Math.min(1, Math.max(0, (b - base[lo]) / span)) : 0;
    return this.sKnots[lo] + (this.sKnots[hi] - this.sKnots[lo]) * w;
  }

  /** A closed loop wraps s; an open ribbon clamps it to its ends. */
  wrap(s: number): number {
    if (!this.closed) return Math.max(0, Math.min(this.length, s));
    const r = s % this.length;
    return r < 0 ? r + this.length : r;
  }

  /** Signed forward distance from a to b (on a loop: the short way round). */
  delta(a: number, b: number): number {
    if (!this.closed) return b - a;
    let d = this.wrap(b - a);
    if (d > this.length / 2) d -= this.length;
    return d;
  }

  private indexOf(s: number): { i: number; f: number; i2: number } {
    const w = this.wrap(s) / this.step;
    if (!this.closed) {
      const i = Math.min(this.count - 1, Math.floor(w));
      return { i, f: Math.min(1, w - i), i2: i + 1 };
    }
    const i = Math.floor(w) % this.count;
    return { i, f: w - Math.floor(w), i2: (i + 1) % this.count };
  }

  /** The nearest sample (no interpolation): for flags like gap and ceiling. */
  sampleAt(s: number): TrackSample {
    const { i, f, i2 } = this.indexOf(s);
    return this.samples[f < 0.5 ? i : i2];
  }

  private lerpScalar(s: number, key: 'width' | 'curvature' | 'slope' | 'bank' | 'edgeL' | 'edgeR'): number {
    const { i, f, i2 } = this.indexOf(s);
    return this.samples[i][key] + (this.samples[i2][key] - this.samples[i][key]) * f;
  }

  /** Road width (edge to edge of the paved surface). */
  widthAt(s: number): number {
    return this.lerpScalar(s, 'width');
  }
  /** Hard boundary on the left, as a negative x. */
  minXAt(s: number): number {
    return -this.lerpScalar(s, 'edgeL');
  }
  /** Hard boundary on the right, as a positive x. */
  maxXAt(s: number): number {
    return this.lerpScalar(s, 'edgeR');
  }
  /** True when x is on the paved road rather than the sand run-off. */
  onRoad(s: number, x: number): boolean {
    return Math.abs(x) <= this.widthAt(s) / 2;
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
  /** Racers are held to the surface here (loops, corkscrews). */
  isMagnet(s: number): boolean {
    return this.sampleAt(s).magnet;
  }
  /** Surface grip multiplier at s (1 = normal). */
  gripAt(s: number): number {
    return this.sampleAt(s).grip;
  }
  /** Rough ground at s, 0..1 (0 = smooth road). */
  roughAt(s: number): number {
    return this.sampleAt(s).rough;
  }
  /** World metres per metre of s (inside a loop > 1). */
  /** True when leaving the course on that side (−1 left, 1 right) means falling off. */
  dropAt(s: number, side: -1 | 1): boolean {
    const smp = this.sampleAt(s);
    return side < 0 ? smp.dropL : smp.dropR;
  }
  /** Height of what a racer falling here meets (see TrackSample.floor); -Infinity over the void. */
  floorAt(s: number): number {
    return this.sampleAt(s).floor;
  }
  /** The floor here is the sea. */
  isWaterAt(s: number): boolean {
    return this.sampleAt(s).water;
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
    mix(a.pos, b.pos, out.pos);
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

  /**
   * World → track space near a hint: the s and lateral x of the closest centreline point
   * within `window` metres of sHint (horizontal distance). Used to hand a racer between the
   * main loop and a branch at a junction.
   */
  project(p: Vec3, sHint: number, window: number): { s: number; x: number } {
    const k0 = Math.round(this.wrap(sHint) / this.step);
    const reach = Math.ceil(window / this.step);
    let best = -1;
    let bestD = Infinity;
    for (let d = -reach; d <= reach; d++) {
      const k = this.closed ? this.nb(k0, d) : k0 + d;
      if (k < 0 || k >= this.samples.length) continue;
      const q = this.samples[k].pos;
      const dd = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = k;
      }
    }
    if (best < 0) throw new Error(`Ribbon ${this.id}: nothing to project onto near s=${sHint}`);
    const smp = this.samples[best];
    const dx = p.x - smp.pos.x;
    const dz = p.z - smp.pos.z;
    const along = dx * smp.tangent.x + dz * smp.tangent.z;
    const tanH = Math.hypot(smp.tangent.x, smp.tangent.z);
    const rightH = Math.hypot(smp.right.x, smp.right.z);
    return {
      s: this.wrap(smp.s + along / tanH),
      x: (dx * smp.right.x + dz * smp.right.z) / (rightH * rightH),
    };
  }

  /** Obstacles whose centre is within `ahead` metres in front of s or `behind` behind it. */
  obstaclesNear(s: number, behind: number, ahead: number, out: Obstacle[] = []): Obstacle[] {
    out.length = 0;
    const nb = this.buckets.length;
    const lo = Math.floor((s - behind) / OBSTACLE_BUCKET);
    const hi = Math.floor((s + ahead) / OBSTACLE_BUCKET);
    for (let b = lo; b <= hi && b - lo < nb; b++) {
      if (!this.closed && (b < 0 || b >= nb)) continue;
      for (const o of this.buckets[((b % nb) + nb) % nb]) {
        const d = this.delta(s, o.s);
        if (d >= -behind && d <= ahead && !out.includes(o)) out.push(o);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------

  private smooth(values: number[]): number[] {
    const r = TRACK_SMOOTH_RADIUS;
    return values.map((_, k) => {
      let sum = 0;
      for (let d = -r; d <= r; d++) sum += values[this.nb(k, d)];
      return sum / (2 * r + 1);
    });
  }

  /** Calls fn(k, t) for every sample index between s0 and s1 (wrapping on a loop), t = 0..1 along it. */
  private forRange(s0: number, s1: number, fn: (k: number, t: number, ds: number) => void) {
    if (!this.closed && s1 < s0) throw new Error(`Ribbon ${this.id}: range ${s0}..${s1} runs backwards`);
    const len = s1 >= s0 ? s1 - s0 : s1 + this.length - s0;
    const n = this.count;
    const k0 = Math.ceil(s0 / this.step - 1e-9);
    const steps = Math.floor(len / this.step);
    for (let q = 0; q <= steps; q++) {
      const ds = (k0 + q) * this.step - s0;
      if (ds > len + 1e-9) break;
      const k = this.closed ? (((k0 + q) % n) + n) % n : k0 + q;
      if (k > n) break;
      fn(k, len === 0 ? 0 : ds / len, ds);
    }
  }

  private applyShape(
    f: TrackFeature,
    elev: number[],
    width: number[],
    gap: boolean[],
    ceiling: number[],
    wallHeight: number[],
    runL: number[],
    runR: number[],
  ) {
    const sides = (side: -1 | 1 | undefined, fn: (arr: number[]) => void) => {
      if (side !== 1) fn(runL);
      if (side !== -1) fn(runR);
    };
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
        this.forRange(this.paramToS(f.from), this.paramToS(f.to), (k) => {
          ceiling[k] = f.ceiling;
          runL[k] = 0;
          runR[k] = 0;
        });
        break;
      }
      case 'canyon': {
        this.forRange(this.paramToS(f.from), this.paramToS(f.to), (k) => {
          wallHeight[k] = f.wallHeight;
          runL[k] = 0;
          runR[k] = 0;
        });
        break;
      }
      case 'walls': {
        this.forRange(this.paramToS(f.from), this.paramToS(f.to), (k) => sides(f.side, (arr) => (arr[k] = 0)));
        break;
      }
      case 'runoff': {
        this.forRange(this.paramToS(f.from), this.paramToS(f.to), (k) =>
          sides(f.side, (arr) => (arr[k] = f.amount)),
        );
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
      case 'boostCells':
      case 'repairCells':
      case 'drop':
      case 'loop':
      case 'corkscrew':
      case 'slick':
      case 'rough':
      case 'hazard':
      case 'crossing':
      case 'route':
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
      case 'boostCells':
      case 'repairCells': {
        const list = f.kind === 'boostCells' ? this.cells : this.repairCells;
        const s0 = this.paramToS(f.at);
        for (let i = 0; i < f.count; i++) {
          list.push({ index: list.length, s: this.wrap(s0 + i * f.spacing), x: f.lateral });
        }
        break;
      }
      default:
        break;
    }
  }
}

/** A branch ribbon (shortcut or route) and where it meets the main road. */
export interface Branch {
  index: number;
  def: BranchDef;
  ribbon: Ribbon;
  side: -1 | 1;
  /** The fork this branch is a route of; null for a shortcut. */
  fork: Fork | null;
  /** Main-loop s where the branch leaves (start of the entry junction) and rejoins (end of the exit junction). */
  entryS: number;
  exitS: number;
  /**
   * Lateral offset from the main centreline to the branch centreline inside the junctions:
   * the branch runs alongside the main road, edge to edge.
   */
  junctionOffset: number;
}

/**
 * Where the road splits into parallel routes and rejoins: the main road's own way (named by
 * its 'route' feature) and one or two route branches beside it, left and right.
 */
export interface Fork {
  index: number;
  /** The main road's route name. */
  name: string;
  /** Main-road s where the routes leave (start of the entry junctions) and rejoin (end of the exit junctions). */
  entryS: number;
  exitS: number;
  /** Indices into Track.branches of its route branches. */
  routes: number[];
  /**
   * Every way through, as a ribbon index (-1 = the main road, else the branch), gentlest
   * first: by metres of rough ground times its amount, plus AI_ROUTE_OBSTACLE_METRES for each
   * obstacle and hazard. Ties keep left, centre, right order.
   */
  byDifficulty: number[];
}

/** The main road plus its branches. Existing code treats a Track as its main ribbon. */
export class Track extends Ribbon {
  readonly def: TrackDef;
  readonly course: CourseKind;
  /** Main-road s of the start line: 0 on a circuit, the end of the grid apron on a sprint. */
  readonly startS: number;
  /** Start line to finish line: one lap of a circuit, the whole of a sprint. */
  readonly raceLength: number;
  readonly branches: Branch[];
  readonly forks: Fork[];

  constructor(def: TrackDef) {
    validateCourse(def);
    // The main road's edge on a branch's side opens up at the junctions so racers can move
    // across, and closes into a divider wall between them.
    const probe = new Ribbon(mainSpec(def));
    const overrides: EdgeOverride[] = [];
    for (const b of def.branches) {
      const entryS = probe.paramToS(b.from);
      const exitS = probe.paramToS(b.to);
      if (exitS - entryS < 4 * BRANCH_JUNCTION_LENGTH) {
        throw new Error(`Track ${def.id}: branch ${b.id} must leave and rejoin in order and be longer than its junctions`);
      }
      if (def.course === 'sprint' && (b.from < 0 || b.to > def.points.length - 1)) {
        throw new Error(`Track ${def.id}: branch ${b.id} must leave and rejoin between the start and the finish`);
      }
      const fadeIn = Math.max(0, entryS - BRANCH_EDGE_FADE);
      overrides.push({ s0: fadeIn, s1: entryS, side: b.side, extra: b.width, fade: 'in' });
      overrides.push({ s0: entryS, s1: entryS + BRANCH_JUNCTION_LENGTH, side: b.side, extra: b.width });
      overrides.push({ s0: entryS + BRANCH_JUNCTION_LENGTH, s1: exitS - BRANCH_JUNCTION_LENGTH, side: b.side, extra: 0 });
      overrides.push({ s0: exitS - BRANCH_JUNCTION_LENGTH, s1: exitS, side: b.side, extra: b.width });
      overrides.push({ s0: exitS, s1: Math.min(probe.length, exitS + BRANCH_EDGE_FADE), side: b.side, extra: b.width, fade: 'out' });
    }
    super(mainSpec(def), overrides);
    this.def = def;
    this.course = def.course;
    this.startS = def.course === 'circuit' ? 0 : this.paramToS(0);
    this.raceLength = def.course === 'circuit' ? this.length : this.paramToS(def.points.length - 1) - this.startS;
    this.branches = def.branches.map((b, index) => buildBranch(this, b, index));
    this.forks = buildForks(this);
  }

  /** The ribbon a racer is on: -1 = the main road, else a branch. */
  ribbon(branch: number): Ribbon {
    if (branch < 0) return this;
    const b = this.branches[branch];
    if (!b) throw new Error(`Track ${this.def.id}: no branch ${branch}`);
    return b.ribbon;
  }

  /**
   * The named way a racer at (branch, s) is on, or null: a branch's name anywhere on it, the
   * main road's route name once it is past a fork's entry junctions (it has stayed on the main
   * road's way), null elsewhere on the main road.
   */
  pathNameAt(branch: number, s: number): string | null {
    if (branch >= 0) return this.branches[branch].def.name;
    for (const f of this.forks) {
      if (s > f.entryS + BRANCH_JUNCTION_LENGTH && s < f.exitS - BRANCH_JUNCTION_LENGTH) return f.name;
    }
    return null;
  }
}

/** The course kind's rules a def must keep before anything is built from it. */
function validateCourse(def: TrackDef) {
  if (def.course === 'sprint' && def.laps !== 1) throw new Error(`Track ${def.id}: a sprint is raced once, laps must be 1 (has ${def.laps})`);
  if (!(Number.isInteger(def.laps) && def.laps >= 1)) throw new Error(`Track ${def.id}: laps ${def.laps} must be a whole number of at least 1`);
  for (const f of def.branches.flatMap((b) => b.features)) {
    if (f.kind === 'route') throw new Error(`Track ${def.id}: a 'route' feature names the main road's way through a fork; it belongs on the main road`);
  }
  // Two branches on one side over the same stretch would share the main road's opened edge.
  for (const a of def.branches) {
    for (const b of def.branches) {
      if (a !== b && a.side === b.side && a.from < b.to && b.from < a.to) {
        throw new Error(`Track ${def.id}: branches ${a.id} and ${b.id} leave the same side over overlapping stretches`);
      }
    }
  }
}

function mainSpec(def: TrackDef): RibbonSpec {
  const base = { id: def.id, seed: def.seed, width: def.width, runoff: def.runoff, floor: def.floor, features: def.features };
  if (def.course === 'circuit') return { ...base, closed: true, paramOffset: 0, points: def.points };
  const p = def.points;
  const n = p.length;
  if (n < 2) throw new Error(`Track ${def.id}: a sprint needs a start and a finish point`);
  // Straight on from each end: the grid stands on the apron, finishers glide out on the run-out.
  return { ...base, closed: false, paramOffset: 1, points: [beyond(p[0], p[1], SPRINT_GRID_APRON), ...p, beyond(p[n - 1], p[n - 2], SPRINT_RUNOUT)] };
}

/** A control point `length` metres past `end`, straight on from `inner` toward it, level with `end`. */
function beyond(end: TrackControlPoint, inner: TrackControlPoint, length: number): TrackControlPoint {
  const dx = end.x - inner.x;
  const dz = end.z - inner.z;
  const d = Math.hypot(dx, dz);
  if (d === 0) throw new Error('Track: a sprint\'s end point sits on its neighbour');
  return { x: end.x + (dx / d) * length, z: end.z + (dz / d) * length, y: end.y, width: end.width };
}

/** Groups route branches into forks with their main-road route names (see Fork). */
function buildForks(main: Track): Fork[] {
  const named = main.def.features.flatMap((f) => (f.kind === 'route' ? [f] : []));
  const forks = named.map((f, index): Fork => {
    const routes = main.branches.filter((b) => b.def.kind === 'route' && b.def.from === f.from && b.def.to === f.to);
    if (routes.length === 0) throw new Error(`Track ${main.def.id}: route "${f.name}" names a fork with no route branch over ${f.from}..${f.to}`);
    const entryS = main.paramToS(f.from);
    const exitS = main.paramToS(f.to);
    const difficulty = new Map<number, number>([[-1, ribbonDifficulty(main, entryS, exitS)], ...routes.map((b): [number, number] => [b.index, ribbonDifficulty(b.ribbon, 0, b.ribbon.length)])]);
    // Left, centre, right: the order ties keep.
    const ways = [...routes.filter((b) => b.side < 0).map((b) => b.index), -1, ...routes.filter((b) => b.side > 0).map((b) => b.index)];
    const byDifficulty = ways.map((w, i) => ({ w, i })).sort((a, b) => (difficulty.get(a.w) as number) - (difficulty.get(b.w) as number) || a.i - b.i).map((x) => x.w);
    return { index, name: f.name, entryS, exitS, routes: routes.map((b) => b.index), byDifficulty };
  });
  for (const b of main.branches) {
    if (b.def.kind !== 'route') continue;
    const fork = forks.find((f) => f.routes.includes(b.index));
    if (!fork) throw new Error(`Track ${main.def.id}: route branch ${b.def.id} has no main-road 'route' feature over ${b.def.from}..${b.def.to} naming the main way`);
    b.fork = fork;
  }
  return forks;
}

/** Metres of rough ground times its amount between s0 and s1, plus AI_ROUTE_OBSTACLE_METRES per obstacle and hazard there. */
function ribbonDifficulty(r: Ribbon, s0: number, s1: number): number {
  let rough = 0;
  for (const smp of r.samples) if (smp.s >= s0 && smp.s <= s1) rough += smp.rough * r.step;
  const things = r.obstacles.filter((o) => o.s >= s0 && o.s <= s1).length + r.hazards.filter((h) => h.s0 >= s0 && h.s0 <= s1).length;
  return rough + things * AI_ROUTE_OBSTACLE_METRES;
}

function buildBranch(main: Track, b: BranchDef, index: number): Branch {
  const entryS = main.paramToS(b.from);
  const exitS = main.paramToS(b.to);
  const offset = (s: number) => b.side * (main.widthAt(s) / 2 + b.width / 2);
  const onMain = (s: number): TrackControlPoint => {
    const p = main.toWorld(s, offset(s), 0);
    return { x: p.x, y: p.y, z: p.z, width: b.width };
  };
  const points = [
    onMain(entryS),
    onMain(entryS + BRANCH_JUNCTION_LENGTH),
    ...b.points,
    onMain(exitS - BRANCH_JUNCTION_LENGTH),
    onMain(exitS),
  ];
  const spec: RibbonSpec = {
    id: `${main.def.id}/${b.id}`,
    closed: false,
    paramOffset: 0,
    seed: main.def.seed + index + 1,
    width: b.width,
    runoff: b.runoff,
    floor: main.def.floor,
    points,
    features: b.features,
  };
  const ribbonProbe = new Ribbon(spec);
  // Inside the junctions the branch's main-facing edge opens across the main road.
  const towardMain = (b.side === 1 ? -1 : 1) as -1 | 1;
  const endJ = ribbonProbe.paramToS(1);
  const startExitJ = ribbonProbe.paramToS(points.length - 2);
  const ribbon = new Ribbon(spec, [
      { s0: 0, s1: endJ, side: towardMain, extra: main.widthAt(entryS) },
      { s0: startExitJ, s1: ribbonProbe.length, side: towardMain, extra: main.widthAt(exitS) },
  ]);
  return { index, def: b, ribbon, side: b.side, fork: null, entryS, exitS, junctionOffset: offset(entryS) };
}
