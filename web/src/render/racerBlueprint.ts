// The static description of a skimmer: baked hull geometries plus the anchors the runtime model
// animates (fans, flaps, wingtips, the air cushion). Styles (racerStyles.ts) fill it with the
// helpers below; everything is deterministic so a racer looks identical every time.
//
// Craft space: forward −Z, up +Y, origin at the craft centre at ride height; the ground is at
// y = −SKIMMER_RIDE_HEIGHT.
import * as THREE from 'three';
import type { RacerVisual } from '../core/types.ts';
import { PartBuilder, placement, type ProfilePoint } from './racerParts.ts';
import { SKIMMER_RIDE_HEIGHT } from './skimmerTuning.ts';

export type Detail = 'high' | 'low';

export interface FanSpec {
  /** Fan disc centre. */
  pos: THREE.Vector3;
  /** Duct exit, where the jet starts. */
  exit: THREE.Vector3;
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

/** Footprint of the air cushion under the hull. */
export interface CushionSpec {
  width: number;
  length: number;
  z: number;
}

export interface Blueprint {
  hull: THREE.BufferGeometry;
  glow: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
  fans: FanSpec[];
  flaps: FlapSpec[];
  /** Wingtip points that shed vortex trails. */
  tips: THREE.Vector3[];
  /** Small marker lights (glow halos). */
  lights: THREE.Vector3[];
  cushion: CushionSpec;
}

/** Shared hull colours beyond the racer's own palette. */
export const DARK = 0x1f1d1f;
export const METAL = 0x6f7378;
export const STEEL = 0xb5b8bc;
/** Glow parts are baked white and tinted by the glow material at runtime. */
const GLOW_WHITE = 0xffffff;
const MIN_LOW_SEGMENTS = 6;
const LOW_SEGMENT_FACTOR = 0.65;
/** Fin outlines are drawn with +X running aft; this yaw lays them along the craft. */
export const ALONG = -Math.PI / 2;
/** The lowest hull point (skids, endplates) clears the ground by this much. */
export const SKID_CLEARANCE = 0.12;
export const SKID_Y = -SKIMMER_RIDE_HEIGHT + SKID_CLEARANCE;

export interface Palette {
  p: number;
  s: number;
  a: number;
}

/** [radius fraction, axial fraction 0 = nose .. 1 = tail, colour]. */
export type ShapePoint = [number, number, number];

export interface BodyOpts {
  /** Nose position (z) and length aft of it. */
  z: number;
  length: number;
  y: number;
  radius: number;
  /** Vertical squash: fuselages are flat. */
  squash: number;
  segments: number;
  shape: ShapePoint[];
  canopy: { from: number; to: number; width: number; height: number };
  phase?: number;
}

export interface DuctOpts {
  radius: number;
  /** Duct chord along Z. */
  length: number;
  color: number;
  lip: number;
  segments: number;
  /** Stator vanes behind the fan; they give the ring a readable "turbine" face from behind. */
  vanes: number;
}

export class BlueprintBuilder {
  readonly hull = new PartBuilder();
  readonly glow = new PartBuilder();
  readonly canopy = new PartBuilder();
  readonly fans: FanSpec[] = [];
  readonly flaps: FlapSpec[] = [];
  readonly tips: THREE.Vector3[] = [];
  readonly lights: THREE.Vector3[] = [];
  cushion: CushionSpec = { width: 4, length: 6, z: 0 };
  readonly c: Palette;

  constructor(visual: RacerVisual, readonly detail: Detail) {
    this.c = { p: visual.primary, s: visual.secondary, a: visual.accent };
  }

  /** Low detail drops roughly a third of the radial segments; coarse shapes keep theirs. */
  seg(high: number): number {
    if (this.detail === 'high' || high <= MIN_LOW_SEGMENTS) return high;
    return Math.max(MIN_LOW_SEGMENTS, Math.round(high * LOW_SEGMENT_FACTOR));
  }

  /** Flat fuselage with an integrated canopy. */
  body(o: BodyOpts): void {
    const frame = placement(0, o.y, 0, 0, 0, 0, 1, o.squash, 1);
    const profile: ProfilePoint[] = o.shape.map(([rf, zf, color]) => ({ r: rf * o.radius, z: o.z + zf * o.length, color }));
    this.hull.lathe(profile, this.seg(o.segments), frame, o.phase ?? 0);
    const cz = o.z + (o.canopy.from + o.canopy.to) / 2 * o.length;
    const clen = (o.canopy.to - o.canopy.from) * o.length;
    const dome = new THREE.SphereGeometry(1, this.seg(10), this.detail === 'high' ? 5 : 3, 0, Math.PI * 2, 0, Math.PI / 2);
    const top = o.y + this.bodyHalfHeight(o, cz) * 0.75;
    this.canopy.add(dome, 0xffffff, placement(0, top, cz, 0, 0, 0, o.canopy.width / 2, o.canopy.height, clen / 2));
  }

  /** Squashed fuselage half-height at craft z (for seating canopies and fins on it). */
  bodyHalfHeight(o: BodyOpts, z: number): number {
    const t = (z - o.z) / o.length;
    for (let i = 0; i < o.shape.length - 1; i++) {
      const [r0, z0] = o.shape[i];
      const [r1, z1] = o.shape[i + 1];
      if (t >= z0 && t <= z1) {
        const k = z1 === z0 ? 0 : (t - z0) / (z1 - z0);
        return (r0 + (r1 - r0) * k) * o.radius * o.squash;
      }
    }
    throw new Error(`bodyHalfHeight: z ${z} outside the fuselage`);
  }

  /** Ducted fan centred at (x, y, z): ring, spinner, stator vanes and a glowing inner band. */
  duct(x: number, y: number, z: number, o: DuctOpts): void {
    const r = o.radius;
    const h = o.length / 2;
    const seg = this.seg(o.segments);
    const frame = placement(x, y, z);
    const wall = r * 0.16;
    this.hull.lathe([
      { r: r * 1.02, z: -h, color: o.lip },
      { r: r + wall, z: -h + 0.08, color: o.color },
      { r: r + wall * 1.15, z: 0, color: o.color },
      { r: r + wall * 0.7, z: h, color: DARK },
      { r: r * 1.0, z: h, color: DARK },
      { r: r * 0.98, z: -h, color: DARK },
    ], seg, frame);
    // Spinner: a short cone pointing aft.
    this.hull.lathe([
      { r: r * 0.24, z: -0.05, color: METAL },
      { r: r * 0.22, z: h * 0.5, color: METAL },
      { r: 0, z: h + 0.15, color: STEEL },
    ], this.seg(8), frame);
    for (let i = 0; i < o.vanes; i++) {
      const a = (i / o.vanes) * Math.PI * 2 + Math.PI / 2;
      this.hull.box(0.05, r * 0.8, 0.12, DARK, placement(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, h * 0.55, 0, 0, a - Math.PI / 2), frame);
    }
    this.glow.lathe([{ r: r * 1.0, z: h - 0.14, color: GLOW_WHITE }, { r: r * 1.0, z: h - 0.02, color: GLOW_WHITE }], seg, frame);
    this.glow.lathe([{ r: r + wall * 0.72, z: h + 0.005, color: GLOW_WHITE }, { r: r + wall * 0.3, z: h + 0.005, color: GLOW_WHITE }], seg, frame);
    this.fans.push({
      pos: new THREE.Vector3(x, y, z - 0.02),
      exit: new THREE.Vector3(x, y, z + h),
      dir: new THREE.Vector3(0, 0, 1),
      radius: r,
    });
  }

  /** Vertical plate along the craft from a (z, y) outline, standing at lateral position x. */
  plate(x: number, outline: [number, number][], thickness: number, color: number, cant = 0): void {
    this.hull.fin(outline, thickness, color, placement(x, 0, 0, 0, ALONG, cant));
  }

  /** Thin glowing strip between two points (trailing-edge lights). */
  strip(a: THREE.Vector3, b: THREE.Vector3, thickness: number): void {
    const len = a.distanceTo(b);
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    this.glow.box(thickness, thickness, len, GLOW_WHITE, placement(mid.x, mid.y, mid.z, 0, yaw, 0));
  }

  light(x: number, y: number, z: number): void {
    this.glow.add(new THREE.SphereGeometry(0.07, 5, 3), GLOW_WHITE, placement(x, y, z));
    this.lights.push(new THREE.Vector3(x, y, z));
  }

  flap(local: THREE.Matrix4, size: [number, number, number], axis: 'x' | 'y', gain: number, color: number): void {
    this.flaps.push({
      base: local,
      size: new THREE.Vector3(...size),
      axis: axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0),
      gain,
      color,
    });
  }

  tip(x: number, y: number, z: number): void {
    this.tips.push(new THREE.Vector3(x, y, z));
  }

  build(): Blueprint {
    return {
      hull: this.hull.build(),
      glow: this.glow.build(),
      canopy: this.canopy.build(),
      fans: this.fans,
      flaps: this.flaps,
      tips: this.tips,
      lights: this.lights,
      cushion: this.cushion,
    };
  }
}
