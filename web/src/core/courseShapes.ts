// Course shapes that bend the ribbon beyond a ground-hugging road: vertical loops, barrel-roll
// corkscrews and open drops at the road edge. Loops are laid into the centreline before it is
// resampled (layLoops), so s is true road length through them too; the rest is applied to the
// resampled centreline before the frames are built, and the simulation reads the per-sample
// flags (magnet, drop, grip, rough).

import type { TrackFeature, TrackParam, Vec3 } from './types.ts';
import { cross, normalize, smoothstep, vec3 } from './geom.ts';
import { CORKSCREW_MIN_TURN, LOOP_CROWN_MIN, LOOP_LAY_STEP, LOOP_MIN_RADIUS, ROUGH_BLEND, SLICK_BLEND_FRACTION } from '../data/tuning.ts';

export interface ShapeHelpers {
  paramToS(u: number): number;
  forRange(s0: number, s1: number, fn: (k: number, t: number, ds: number) => void): void;
}

/** A vertical loop as laid into the centreline, in metres of s along the finished road. */
export interface LoopSpan {
  /** The feature's param, naming it in messages and checks. */
  at: TrackParam;
  /** Where the climb leaves the ground and where the descent rejoins it. */
  s0: number;
  s1: number;
  /** Where the exit is back on the line it left (the end of the settle). */
  settled: number;
  shift: number;
  /** The loop's fixed lateral axis: the frame inside cannot be built from world-up. */
  right: Vec3;
}

export interface CourseShape {
  magnet: boolean[];
  dropL: boolean[];
  dropR: boolean[];
  grip: number[];
  /** Rough ground 0..1 per sample (see the 'rough' feature). */
  rough: number[];
  /** Extra bank (radians) a corkscrew adds on top of the curvature bank. */
  bankAdd: number[];
  /**
   * Inside a loop the frame cannot be built from world-up (the road points straight up at
   * the sides): these samples carry the loop's fixed lateral axis instead.
   */
  loopRight: (Vec3 | null)[];
}

/**
 * Applies drops, corkscrews, slick and rough ground, and flags the samples of the loops that
 * layLoops already laid into `pos`. `runL`/`runR` lose their run-off where a drop opens.
 */
export function shapeCourse(
  h: ShapeHelpers,
  features: TrackFeature[],
  loops: LoopSpan[],
  n: number,
  runL: number[],
  runR: number[],
): CourseShape {
  const shape: CourseShape = {
    magnet: new Array<boolean>(n).fill(false),
    dropL: new Array<boolean>(n).fill(false),
    dropR: new Array<boolean>(n).fill(false),
    grip: new Array<number>(n).fill(1),
    rough: new Array<number>(n).fill(0),
    bankAdd: new Array<number>(n).fill(0),
    loopRight: new Array<Vec3 | null>(n).fill(null),
  };
  for (const f of features) {
    switch (f.kind) {
      case 'drop':
        h.forRange(h.paramToS(f.from), h.paramToS(f.to), (k) => {
          if (f.side !== 1) {
            runL[k] = 0;
            shape.dropL[k] = true;
          }
          if (f.side !== -1) {
            runR[k] = 0;
            shape.dropR[k] = true;
          }
        });
        break;
      case 'slick':
        h.forRange(h.paramToS(f.from), h.paramToS(f.to), (k, t) => {
          // Blend in and out over the ends so grip never changes in a single step.
          const edge = Math.min(1, Math.min(t, 1 - t) * SLICK_BLEND_FRACTION);
          shape.grip[k] = 1 + (f.grip - 1) * smoothstep(edge);
        });
        break;
      case 'rough': {
        if (!(f.amount > 0 && f.amount <= 1)) throw new Error(`rough ${f.from}..${f.to}: amount ${f.amount} outside (0, 1]`);
        // Gathered first: the stretch's length (it may wrap the start line) sets the end ramps.
        const span: [number, number][] = [];
        h.forRange(h.paramToS(f.from), h.paramToS(f.to), (k, _t, ds) => span.push([k, ds]));
        const len = span.length > 0 ? span[span.length - 1][1] : 0;
        for (const [k, ds] of span) {
          // A short ramp at each end, so the damage rate never steps from nothing to full.
          const edge = Math.min(1, Math.min(ds, len - ds) / ROUGH_BLEND);
          shape.rough[k] = Math.max(shape.rough[k], f.amount * smoothstep(edge));
        }
        break;
      }
      case 'corkscrew': {
        const s0 = h.paramToS(f.from);
        const s1 = h.paramToS(f.to);
        const perTurn = (s1 - s0) / f.turns;
        if (!(perTurn >= CORKSCREW_MIN_TURN)) {
          throw new Error(`corkscrew ${f.from}..${f.to}: ${perTurn.toFixed(0)} m per roll, under ${CORKSCREW_MIN_TURN} m (it would spin, not roll)`);
        }
        h.forRange(s0, s1, (k, t) => {
          // Ease the roll in and out so the road doesn't snap into its first quarter turn.
          shape.bankAdd[k] = 2 * Math.PI * f.turns * smoothstep(t);
          shape.magnet[k] = true;
        });
        break;
      }
      default:
        break;
    }
  }
  for (const l of loops) {
    h.forRange(l.s0, l.s1, (k) => {
      shape.magnet[k] = true;
      shape.loopRight[k] = l.right;
    });
  }
  return shape;
}

/** The centreline with its loops laid in: points, their widths, and the s each had before. */
export interface LaidLine {
  pts: Vec3[];
  widths: number[];
  /** Arc length of each point along the line as authored (no loops): rises with the index. */
  base: number[];
  /** How far a loop's sideways shift and settle have moved each point (see layLoops). */
  drift: Vec3[];
  loops: { at: TrackParam; b0: number; b1: number; settled: number; shift: number; forward: Vec3; right: Vec3 }[];
}

/**
 * Lays each vertical loop into a dense centreline (arc lengths `cum`, as authored). The road
 * climbs a full circle of `radius` while drifting `span` metres forward, crosses sideways by
 * `shift` over the top, and eases back onto its line over `settle`. The loop's points replace
 * the `span` metres of straight it stands on, so the line gets longer by the loop's extra road
 * and every later s moves on with it; `base` keeps each point's authored arc length, which is
 * what feature params are measured along. A loop may start while the one before is still
 * settling (a double loop): the settles add up.
 */
export function layLoops(features: TrackFeature[], pts: Vec3[], widths: number[], cum: number[], baseS: (u: TrackParam) => number): LaidLine {
  const total = cum[cum.length - 1];
  const loops = features
    .filter((f): f is Extract<TrackFeature, { kind: 'loop' }> => f.kind === 'loop')
    .map((f) => ({ f, b0: baseS(f.at) }))
    .sort((a, b) => a.b0 - b.b0);
  const along = (b: number) => {
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < b) i++;
    const w = (b - cum[i]) / (cum[i + 1] - cum[i]);
    const p = pts[i];
    const q = pts[i + 1];
    return { p: vec3(p.x + (q.x - p.x) * w, p.y + (q.y - p.y) * w, p.z + (q.z - p.z) * w), width: widths[i] + (widths[i + 1] - widths[i]) * w };
  };
  const laid: LaidLine['loops'] = [];
  for (const { f, b0 } of loops) {
    checkLoop(f);
    const b1 = b0 + f.span;
    const settled = b1 + f.settle;
    // A loop never starts inside another one, and never runs over the end of the line (on a
    // circuit its s range would wrap the start line).
    const prev = laid[laid.length - 1];
    if (prev && b0 < prev.b1) throw new Error(`loop at ${f.at}: starts ${(prev.b1 - b0).toFixed(0)} m inside the loop at ${prev.at}`);
    if (settled > total) throw new Error(`loop at ${f.at}: its settle runs ${(settled - total).toFixed(0)} m past the end of the line`);
    const a = along(b0).p;
    const b = along(b1).p;
    const forward = normalize(vec3(b.x - a.x, 0, b.z - a.z));
    laid.push({ at: f.at, b0, b1, settled, shift: f.shift, forward, right: normalize(cross(forward, vec3(0, 1, 0))) });
  }
  // After a loop the exit eases back onto the line it left: a sideways drift, never a corner.
  const drift = (b: number): Vec3 => {
    const d = vec3();
    for (const l of laid) {
      if (b <= l.b1 || b >= l.settled) continue;
      const side = l.shift * (1 - smoothstep((b - l.b1) / (l.settled - l.b1)));
      d.x += l.right.x * side;
      d.z += l.right.z * side;
    }
    return d;
  };
  const out: LaidLine = { pts: [], widths: [], base: [], drift: [], loops: laid };
  const push = (p: Vec3, width: number, b: number, d: Vec3) => {
    out.pts.push(vec3(p.x + d.x, p.y, p.z + d.z));
    out.widths.push(width);
    out.base.push(b);
    out.drift.push(d);
  };
  let next = 0;
  for (let i = 0; i < pts.length; i++) {
    const b = cum[i];
    for (; next < laid.length && laid[next].b0 <= b; next++) layLoop(loops[next].f, laid[next], along, drift, push);
    if (laid.some((l) => b >= l.b0 && b <= l.b1)) continue;
    push(pts[i], widths[i], b, drift(b));
  }
  return out;
}

/** The points of one loop, from where it leaves the line to where it rejoins it. */
function layLoop(
  f: Extract<TrackFeature, { kind: 'loop' }>,
  l: LaidLine['loops'][number],
  along: (b: number) => { p: Vec3; width: number },
  drift: (b: number) => Vec3,
  push: (p: Vec3, width: number, b: number, d: Vec3) => void,
) {
  const t0 = l.forward;
  const r0 = l.right;
  // Seen side-on the loop crosses itself: the climb passes the descent at the same height and
  // distance along. The exit only clears the entry if the whole sideways shift is in place by
  // then, so the road moves across over the top, between the two passes, and runs straight
  // through both of them.
  const pass = loopCrossing(f.radius, f.span);
  const count = Math.ceil((2 * Math.PI * f.radius + f.span) / LOOP_LAY_STEP);
  for (let j = 0; j <= count; j++) {
    const t = j / count;
    const th = 2 * Math.PI * t;
    const fwd = f.radius * Math.sin(th);
    const lift = f.radius * (1 - Math.cos(th));
    const side = f.shift * smoothstep((t - pass) / (1 - 2 * pass));
    const b = l.b0 + f.span * t;
    const on = along(b);
    // The crossing over the top is sideways drift like a settle: the exit then joins its settle
    // without a step in the line the corners are measured on.
    const d = drift(b);
    push(vec3(on.p.x + t0.x * fwd, on.p.y + lift, on.p.z + t0.z * fwd), on.width, b, vec3(d.x + r0.x * side, 0, d.z + r0.z * side));
  }
}

/** The loop sizing rules (see LOOP_MIN_RADIUS and LOOP_CROWN_MIN): a loop outside them fails the build. */
function checkLoop(f: Extract<TrackFeature, { kind: 'loop' }>) {
  // A loop needs its radius larger than the forward drift per radian, or the road never
  // turns back on itself at the top (it would just be a hump).
  if (f.radius <= f.span / (2 * Math.PI)) {
    throw new Error(`loop at ${f.at}: radius ${f.radius} must exceed span/2π = ${(f.span / (2 * Math.PI)).toFixed(1)}`);
  }
  if (f.radius < LOOP_MIN_RADIUS) throw new Error(`loop at ${f.at}: radius ${f.radius} m is under the ${LOOP_MIN_RADIUS} m minimum`);
  const crown = loopCrownRadius(f.radius, f.span);
  if (crown < LOOP_CROWN_MIN * f.radius) {
    throw new Error(`loop at ${f.at}: its crown curls to a ${crown.toFixed(0)} m radius, under ${LOOP_CROWN_MIN} of its ${f.radius} m radius (span ${f.span} drifts too far)`);
  }
}

/**
 * Radius of curvature at a loop's crown. The road runs forward span·t + radius·sin(2πt) at
 * height radius·(1 − cos(2πt)); at the top it moves back at 2π·radius − span per unit t while
 * turning at 4π²·radius, so the crown is (2π·radius − span)² / (4π²·radius).
 */
export function loopCrownRadius(radius: number, span: number): number {
  return (2 * Math.PI * radius - span) ** 2 / (4 * Math.PI ** 2 * radius);
}

/** Bisection steps for the crossing: 2^-40 of the span is far below a sample. */
const CROSSING_ITERATIONS = 40;

/**
 * Where a loop crosses itself, seen side-on: the fraction t of the span at which the climb
 * meets the descent (the descent passes there at 1 - t). The road runs forward
 * radius·sin(2πt) + span·t at height radius·(1 - cos(2πt)); the two passes share a height at
 * t and 1 - t and meet where 2·radius·sin(2πt) = span·(1 - 2t). That difference is concave on
 * [0, ½], negative at 0 and zero again only at ½, so its one sign change is the crossing.
 */
export function loopCrossing(radius: number, span: number): number {
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < CROSSING_ITERATIONS; i++) {
    const t = (lo + hi) / 2;
    if (2 * radius * Math.sin(2 * Math.PI * t) < span * (1 - 2 * t)) lo = t;
    else hi = t;
  }
  return (lo + hi) / 2;
}
