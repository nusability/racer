// Course shapes that bend the ribbon beyond a ground-hugging road: vertical loops, barrel-roll
// corkscrews and open drops at the road edge. Applied to the resampled centreline before the
// frames are built; the simulation reads the per-sample flags (magnet, stretch, drop).

import type { TrackFeature, Vec3 } from './types.ts';
import { cross, normalize, smoothstep, vec3 } from './geom.ts';
import { ROUGH_BLEND, SLICK_BLEND_FRACTION } from '../data/tuning.ts';

export interface ShapeHelpers {
  paramToS(u: number): number;
  forRange(s0: number, s1: number, fn: (k: number, t: number, ds: number) => void): void;
  /** Neighbour sample index d steps away. */
  nb(k: number, d: number): number;
}

export interface CourseShape {
  magnet: boolean[];
  stretch: number[];
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
 * Applies drops, loops and corkscrews. `pos` must already carry the final elevation in y;
 * loops move those positions. `runL`/`runR` lose their run-off where a drop opens.
 */
export function shapeCourse(
  h: ShapeHelpers,
  features: TrackFeature[],
  pos: Vec3[],
  runL: number[],
  runR: number[],
): CourseShape {
  const n = pos.length;
  const shape: CourseShape = {
    magnet: new Array<boolean>(n).fill(false),
    stretch: new Array<number>(n).fill(1),
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
      case 'corkscrew':
        h.forRange(h.paramToS(f.from), h.paramToS(f.to), (k, t) => {
          // Ease the roll in and out so the road doesn't snap into its first quarter turn.
          shape.bankAdd[k] = 2 * Math.PI * f.turns * smoothstep(t);
          shape.magnet[k] = true;
        });
        break;
      case 'loop':
        applyLoop(h, f, pos, shape);
        break;
      default:
        break;
    }
  }
  return shape;
}

function applyLoop(
  h: ShapeHelpers,
  f: Extract<TrackFeature, { kind: 'loop' }>,
  pos: Vec3[],
  shape: CourseShape,
) {
  // A loop needs its radius larger than the forward drift per radian, or the road never
  // turns back on itself at the top (it would just be a hump).
  if (f.radius <= f.span / (2 * Math.PI)) {
    throw new Error(`loop at ${f.at}: radius ${f.radius} must exceed span/2π = ${(f.span / (2 * Math.PI)).toFixed(1)}`);
  }
  const s0 = h.paramToS(f.at);
  let k0 = -1;
  // The first sample at or after the loop's start (a zero-length range has none).
  h.forRange(s0, s0 + f.span, (k) => {
    if (k0 < 0) k0 = k;
  });
  if (k0 < 0) throw new Error(`loop at ${f.at}: no sample at s=${s0}`);
  const a = pos[h.nb(k0, -1)];
  const b = pos[h.nb(k0, 1)];
  const t0 = normalize(vec3(b.x - a.x, 0, b.z - a.z));
  const up = vec3(0, 1, 0);
  const r0 = normalize(cross(t0, up));
  const base = pos.map((p) => ({ ...p }));
  const touched: number[] = [];
  h.forRange(s0, s0 + f.span, (k, t) => {
    const th = 2 * Math.PI * t;
    const fwd = f.radius * Math.sin(th);
    const lift = f.radius * (1 - Math.cos(th));
    const side = f.shift * t;
    pos[k] = vec3(
      base[k].x + t0.x * fwd + up.x * lift + r0.x * side,
      base[k].y + lift,
      base[k].z + t0.z * fwd + r0.z * side,
    );
    shape.magnet[k] = true;
    shape.loopRight[k] = r0;
    touched.push(k);
  });
  h.forRange(s0 + f.span, s0 + f.span + f.settle, (k, t) => {
    const side = f.shift * (1 - smoothstep(t));
    pos[k] = vec3(base[k].x + r0.x * side, base[k].y, base[k].z + r0.z * side);
  });
  for (const k of touched) {
    const p = pos[h.nb(k, -1)];
    const q = pos[h.nb(k, 1)];
    const bp = base[h.nb(k, -1)];
    const bq = base[h.nb(k, 1)];
    const world = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    const param = Math.hypot(bq.x - bp.x, bq.y - bp.y, bq.z - bp.z);
    shape.stretch[k] = Math.max(1, world / param);
  }
}
