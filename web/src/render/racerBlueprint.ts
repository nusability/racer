// The static description of a racer: baked hull geometries plus the anchor points the runtime
// model animates (nozzles, binder emitters, flaps, cables). Styles (racerStyles.ts) fill it with
// the helpers below; everything is deterministic so a racer looks identical every time.
import * as THREE from 'three';
import type { RacerVisual } from '../core/types.ts';
import { PartBuilder, placement, type ProfilePoint } from './racerParts.ts';

export type Detail = 'high' | 'low';

export interface NozzleSpec {
  pos: THREE.Vector3;
  /** Unit exhaust direction (mostly +Z). */
  dir: THREE.Vector3;
  radius: number;
}

export interface FlapSpec {
  /** Hinge placement (translation + rotation, no scale) in craft space. */
  base: THREE.Matrix4;
  size: THREE.Vector3;
  /** Local axis the flap swings about. */
  axis: THREE.Vector3;
  /** Radians per unit of steer. */
  gain: number;
  color: number;
}

export interface CableSpec {
  /** On an engine, craft space. */
  engine: THREE.Vector3;
  /** On the pod, pod space. */
  pod: THREE.Vector3;
}

export interface Blueprint {
  hull: THREE.BufferGeometry;
  glow: THREE.BufferGeometry;
  pod: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
  /** Pod group origin (its tow point) in craft space; pod geometry is relative to it. */
  podPivot: THREE.Vector3;
  nozzles: NozzleSpec[];
  /** Pod thrusters, pod space. */
  podNozzles: NozzleSpec[];
  binders: [THREE.Vector3, THREE.Vector3][];
  flaps: FlapSpec[];
  cables: CableSpec[];
}

/** Shared hull colours beyond the racer's own palette. */
export const DARK = 0x231f1c;
export const METAL = 0x77736d;
export const STEEL = 0xb3aea5;
/** Nozzle and emitter glow parts are baked white and tinted by the glow material at runtime. */
const GLOW_WHITE = 0xffffff;
const MIN_LOW_SEGMENTS = 6;
const LOW_SEGMENT_FACTOR = 0.65;

export interface Palette {
  p: number;
  s: number;
  a: number;
}

/** [radius fraction, axial fraction 0 = intake .. 1 = nozzle, colour]. */
export type ShapePoint = [number, number, number];

export interface EngineOpts {
  length: number;
  radius: number;
  segments: number;
  shape: ShapePoint[];
  /** Nozzle opening as a fraction of radius. */
  nozzle: number;
  /** Length of a centre spike poking out of the intake, 0 for none. */
  spike: number;
  phase?: number;
}

export interface PodOpts {
  length: number;
  radius: number;
  segments: number;
  /** Vertical squash of the tub. */
  squash: number;
  shape: ShapePoint[];
  canopy: { from: number; to: number; width: number; height: number };
  nozzle: number;
  phase?: number;
}

export class BlueprintBuilder {
  readonly hull = new PartBuilder();
  readonly glow = new PartBuilder();
  readonly pod = new PartBuilder();
  readonly canopy = new PartBuilder();
  readonly nozzles: NozzleSpec[] = [];
  readonly podNozzles: NozzleSpec[] = [];
  readonly binders: [THREE.Vector3, THREE.Vector3][] = [];
  readonly flaps: FlapSpec[] = [];
  readonly cables: CableSpec[] = [];
  readonly podPivot = new THREE.Vector3();
  readonly c: Palette;

  constructor(visual: RacerVisual, readonly detail: Detail) {
    this.c = { p: visual.primary, s: visual.secondary, a: visual.accent };
  }

  /** Low detail drops roughly a third of the radial segments; hex and coarser shapes are the
   * look itself, so they keep their count. */
  seg(high: number): number {
    if (this.detail === 'high' || high <= MIN_LOW_SEGMENTS) return high;
    return Math.max(MIN_LOW_SEGMENTS, Math.round(high * LOW_SEGMENT_FACTOR));
  }

  /** Engine nacelle centred at the frame origin, intake at −Z. Returns its frame for add-ons. */
  engine(frame: THREE.Matrix4, o: EngineOpts): void {
    const half = o.length / 2;
    const profile: ProfilePoint[] = o.shape.map(([rf, zf, color]) => ({ r: rf * o.radius, z: -half + zf * o.length, color }));
    const first = profile[0];
    const last = profile[profile.length - 1];
    const seg = this.seg(o.segments);
    const phase = o.phase ?? 0;
    // Intake: the lip curls inward to a dark throat so the front reads as an open mouth.
    this.hull.lathe([{ r: first.r * 0.72, z: first.z + o.radius * 0.5, color: DARK }, { r: first.r, z: first.z, color: first.color }], seg, frame, phase);
    this.hull.lathe([{ r: 0, z: first.z + o.radius * 0.55, color: DARK }, { r: first.r * 0.72, z: first.z + o.radius * 0.5, color: DARK }], seg, frame, phase);
    this.hull.lathe(profile, seg, frame, phase);
    if (o.spike > 0) {
      this.hull.lathe([
        { r: 0, z: first.z - o.spike, color: METAL },
        { r: first.r * 0.38, z: first.z + o.radius * 0.3, color: METAL },
      ], seg, frame, phase);
    }
    // Nozzle: dark bell, then a glowing ring and core recessed just inside it.
    const nr = o.radius * o.nozzle;
    this.hull.lathe([{ r: last.r, z: last.z, color: DARK }, { r: nr, z: last.z + 0.02, color: DARK }, { r: nr * 0.8, z: last.z - 0.25, color: DARK }], seg, frame, phase);
    this.glow.lathe([{ r: nr * 0.82, z: last.z - 0.24, color: GLOW_WHITE }, { r: 0, z: last.z - 0.1, color: GLOW_WHITE }], seg, frame, phase);
    const pos = new THREE.Vector3(0, 0, last.z).applyMatrix4(frame);
    const dir = new THREE.Vector3(0, 0, 1).transformDirection(frame);
    this.nozzles.push({ pos, dir, radius: nr });
  }

  /** Tow pod: nose at the pivot, extending to +Z. */
  podTub(o: PodOpts): void {
    const frame = placement(0, 0, 0, 0, 0, 0, 1, o.squash, 1);
    const seg = this.seg(o.segments);
    const profile: ProfilePoint[] = o.shape.map(([rf, zf, color]) => ({ r: rf * o.radius, z: zf * o.length, color }));
    this.pod.lathe(profile, seg, frame, o.phase ?? 0);
    const last = profile[profile.length - 1];
    const nr = o.radius * o.nozzle;
    this.pod.lathe([{ r: last.r, z: last.z, color: DARK }, { r: 0, z: last.z - 0.05, color: DARK }], seg, frame, o.phase ?? 0);
    this.podNozzles.push({ pos: new THREE.Vector3(0, 0, last.z), dir: new THREE.Vector3(0, 0, 1), radius: nr });
    // Canopy: a half dome stretched over the cockpit opening.
    const cz = (o.canopy.from + o.canopy.to) / 2 * o.length;
    const clen = (o.canopy.to - o.canopy.from) * o.length;
    const dome = new THREE.SphereGeometry(1, this.seg(10), this.detail === 'high' ? 5 : 3, 0, Math.PI * 2, 0, Math.PI / 2);
    const top = this.podTop(o, cz) - o.canopy.height * 0.25;
    this.canopy.add(dome, 0xffffff, placement(0, top, cz, 0, 0, 0, o.canopy.width / 2, o.canopy.height, clen / 2));
  }

  /** Height of the tub surface at axial position z (along the squashed profile). */
  podTop(o: PodOpts, z: number): number {
    const t = z / o.length;
    for (let i = 0; i < o.shape.length - 1; i++) {
      const [r0, z0] = o.shape[i];
      const [r1, z1] = o.shape[i + 1];
      if (t >= z0 && t <= z1) {
        const k = z1 === z0 ? 0 : (t - z0) / (z1 - z0);
        return (r0 + (r1 - r0) * k) * o.radius * o.squash;
      }
    }
    throw new Error(`podTop: z ${z} outside the pod profile`);
  }

  /** A post on an engine's inner flank ending in a glowing emitter; binders join these tips. */
  emitter(frame: THREE.Matrix4, local: THREE.Vector3, reach: THREE.Vector3): THREE.Vector3 {
    const a = local.clone().applyMatrix4(frame);
    const tip = local.clone().add(reach).applyMatrix4(frame);
    this.hull.rod(a, tip, 0.07, this.seg(6), METAL);
    this.glow.add(new THREE.SphereGeometry(0.13, this.seg(6), 4), GLOW_WHITE, placement(tip.x, tip.y, tip.z));
    return tip;
  }

  flap(frame: THREE.Matrix4, local: THREE.Matrix4, size: [number, number, number], axis: 'x' | 'y', gain: number, color: number): void {
    const base = new THREE.Matrix4().multiplyMatrices(frame, local);
    this.flaps.push({
      base,
      size: new THREE.Vector3(...size),
      axis: axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0),
      gain,
      color,
    });
  }

  cable(engine: THREE.Vector3, pod: THREE.Vector3): void {
    this.cables.push({ engine, pod });
  }

  build(): Blueprint {
    return {
      hull: this.hull.build(),
      glow: this.glow.build(),
      pod: this.pod.build(),
      canopy: this.canopy.build(),
      podPivot: this.podPivot,
      nozzles: this.nozzles,
      podNozzles: this.podNozzles,
      binders: this.binders,
      flaps: this.flaps,
      cables: this.cables,
    };
  }
}

/** Engine placement: centre, splay (yaw, + turns the intake toward −X) and roll. */
export function engineFrame(x: number, y: number, z: number, yaw = 0, roll = 0): THREE.Matrix4 {
  return placement(x, y, z, 0, yaw, roll);
}
