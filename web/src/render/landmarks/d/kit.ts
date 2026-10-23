// Ice kit for the set-D landmarks (Frostline). Static scenery and ambient motion use the set-B
// buckets (merged vertex colours, GPU motion, looping GPU particles); anything driven by a
// course hazard or by the road's position rides bones of one set-A rig, posed on the CPU each
// frame; event-driven snow and dust are a set-A CPU point cloud.
//
// Road-relative parts are posed from the hazard binding inside update(), never at build time,
// so a landmark is correct whether the track scene places it before or after building it.

import * as THREE from 'three';
import type { CourseHazard } from '../../../core/hazards.ts';
import type { HazardDef } from '../../../core/types.ts';
import type { HazardBinding, Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import { mix, shade } from '../b/shapes.ts';
import { finishCoast } from '../c/kit.ts';
import { Rig } from '../a/kit.ts';
import { Particles as CpuParticles } from '../a/particles.ts';

export type HazardType = HazardDef['type'];
export type Def<K extends HazardType> = Extract<HazardDef, { type: K }>;

// --- Palette ------------------------------------------------------------------------------

export const ICE = 0xbfe8ff;
export const ICE_DEEP = 0x3f8fd0;
export const ICE_DARK = 0x1d4f86;
export const WATER = 0x10304a;
export const STEEL = 0x56616e;
export const DARK = 0x23272e;
export const WARM_LIGHT = 0xffd890;
export const RED_LIGHT = 0xff3030;
/** Polar-station orange, weathered rather than toy-bright. */
export const SAFETY = 0xc85a2a;
/** Working-vehicle and cargo liveries: oxide red, ochre, slate, olive, navy. */
export const INDUSTRIAL: readonly number[] = [0x8a2a22, 0xa07a34, 0x4a5560, 0x5e6244, 0x2e4a66];

/** Snow takes a little of the track's snow tint (the palette's `sand`). */
function snowColor(opts: LandmarkOptions, k = 1): THREE.Color {
  return shade(mix(0xf6faff, opts.palette.sand, SNOW_TINT), k);
}
const SNOW_TINT = 0.45;

// --- Hazard binding -----------------------------------------------------------------------

/** The road a free-running landmark animates against: a virtual straight road in its own space. */
export interface FreeRoad<K extends HazardType> {
  def: Def<K>;
  /** Local z of the virtual road's centre line (it runs along local X). */
  roadZ: number;
  /** +1: track +x maps to local +Z; −1: to local −Z. */
  lateral: 1 | -1;
  minX: number;
  maxX: number;
  /** Length along s for droppers and gusts (centred on local x = 0). */
  span?: number;
}

export interface Bound<K extends HazardType> {
  def: Def<K>;
  hazard: CourseHazard;
  binding: HazardBinding;
  /** True when no course hazard is bound and the landmark runs against its own virtual road. */
  free: boolean;
}

/**
 * The hazard this landmark animates from: the placement's, or (unbound) a virtual one inside
 * the landmark's own footprint so it never reaches onto a real road.
 */
export function bindHazard<K extends HazardType>(name: string, opts: LandmarkOptions, kinds: readonly K[], free: FreeRoad<K>): Bound<K> {
  const h = opts.hazard;
  if (h) {
    const d = h.hazard.def;
    if (!(kinds as readonly HazardType[]).includes(d.type)) throw new Error(`${name}: cannot be bound to a ${d.type} hazard (${d.id}); supports ${kinds.join(', ')}`);
    return { def: d as Def<K>, hazard: h.hazard, binding: h, free: false };
  }
  const span = free.span ?? 0;
  const hazard: CourseHazard = { def: free.def, s0: -span / 2, s1: span / 2, seed: opts.seed, minX: free.minX, maxX: free.maxX };
  const binding: HazardBinding = {
    hazard,
    toLocal: (s, x, y, out) => out.set(s, y, free.roadZ + free.lateral * x),
  };
  return { def: free.def, hazard, binding, free: true };
}

/**
 * The road's local frame at one s: origin on the centre line, unit `across` (+x) and `along`
 * (+s) directions on the ground, and how many local units one track metre is.
 */
export class RoadFrame {
  readonly origin = new THREE.Vector3();
  readonly across = new THREE.Vector3();
  readonly along = new THREE.Vector3();
  unit = 1;
  private readonly p = new THREE.Vector3();

  constructor(private readonly binding: HazardBinding) {}

  at(s: number): this {
    const b = this.binding;
    b.toLocal(s, 0, 0, this.origin);
    b.toLocal(s, 1, 0, this.p);
    this.across.subVectors(this.p, this.origin);
    this.unit = this.across.length();
    this.across.y = 0;
    this.across.normalize();
    b.toLocal(s + 1, 0, 0, this.p);
    this.along.subVectors(this.p, this.origin);
    this.along.y = 0;
    this.along.normalize();
    return this;
  }

  /** Local point at lateral x and height y (metres) on this cross-section. */
  point(x: number, y: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.origin).addScaledVector(this.across, x * this.unit).setY(this.origin.y + y * this.unit);
  }

  /** Yaw (about +Y) that turns a part's local +X onto `dir` (a horizontal local direction). */
  static yaw(dir: THREE.Vector3): number {
    return Math.atan2(-dir.z, dir.x);
  }
}

/** The lateral spans a blocker closes, outside its opening (empty spans dropped). */
export function blockedSpans(h: CourseHazard): [number, number][] {
  const d = h.def;
  if (d.type !== 'blocker') throw new Error(`hazard ${d.id} is not a blocker`);
  const spans: [number, number][] = [
    [h.minX, Math.min(h.maxX, d.offset - d.opening / 2)],
    [Math.max(h.minX, d.offset + d.opening / 2), h.maxX],
  ];
  return spans.filter(([a, b]) => b - a > MIN_SPAN);
}
const MIN_SPAN = 0.5;

// --- The kit ------------------------------------------------------------------------------

/** One landmark under construction: set-B buckets, a set-A rig and CPU point clouds. */
export class IceKit {
  readonly b: Kit;
  readonly rig = new Rig();
  readonly snow: THREE.Color;
  private readonly clouds: CpuParticles[] = [];

  constructor(readonly opts: LandmarkOptions, salt: number) {
    this.b = new Kit(opts, salt);
    this.snow = snowColor(opts);
  }

  get rng(): () => number {
    return this.b.rng;
  }

  q(high: number, low: number): number {
    return this.b.q(high, low);
  }

  /** A CPU point cloud: `fixed` lamp slots, then a ring buffer of short-lived particles. */
  cloud(capacity: number, fixed: number, additive: boolean, hardness: number): CpuParticles {
    const c = new CpuParticles(capacity, fixed, additive, hardness);
    this.clouds.push(c);
    return c;
  }

  /**
   * Builds every draw. `reach`/`height` bound the rig's moving parts for culling; `animate`
   * runs after the GPU clock is set, with race time.
   */
  finish(radius: number, reach: number, height: number, animate: (time: number, dt: number) => void): Landmark {
    const lm = finishCoast(this.b, radius);
    // After finishCoast: it rewrites set-B sprite shaders and would reject the set-A clouds.
    this.rig.build(lm.group, reach, height);
    for (const c of this.clouds) lm.group.add(c.points);
    const rig = this.rig;
    const clouds = this.clouds;
    return {
      group: lm.group,
      radius,
      update(time, dt) {
        lm.update(time, dt);
        animate(time, dt);
        for (const c of clouds) c.update(dt);
      },
      dispose() {
        lm.dispose();
        rig.dispose();
        for (const c of clouds) c.dispose();
      },
    };
  }
}

// --- Small helpers ------------------------------------------------------------------------

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth01 = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** Hides a bone (and everything skinned to it) by collapsing it. */
export function hide(b: THREE.Bone): void {
  b.scale.setScalar(0);
}
