// Course-hazard plumbing for the set-A landmarks. A bound landmark animates from its hazard's
// schedule (race time) and places the parts that ARE the hazard with the binding's track →
// local mapping, so what a racer sees is exactly what they collide with.

import * as THREE from 'three';
import type { HazardDef } from '../../../core/types.ts';
import type { CourseHazard } from '../../../core/hazards.ts';
import type { HazardBinding, LandmarkOptions } from '../types.ts';

export type HazardOf<T extends HazardDef['type']> = CourseHazard & { def: Extract<HazardDef, { type: T }> };

/** The binding, checked to be a hazard type this landmark can play; anything else fails loud. */
export function boundHazard<T extends HazardDef['type']>(
  opts: LandmarkOptions,
  kind: string,
  types: readonly T[],
): { binding: HazardBinding; hazard: HazardOf<T> } | null {
  const b = opts.hazard;
  if (!b) return null;
  if (!(types as readonly string[]).includes(b.hazard.def.type)) {
    throw new Error(`landmark ${kind} cannot play a ${b.hazard.def.type} hazard (${b.hazard.def.id}); it plays ${types.join(', ')}`);
  }
  return { binding: b, hazard: b.hazard as HazardOf<T> };
}

/** Seconds into the hazard's current cycle (the same arithmetic as core/hazards.ts). */
export function cycleTime(time: number, period: number, phase: number): number {
  const t = (time + phase) % period;
  return t < 0 ? t + period : t;
}

/**
 * The road at (s, x) in local space: its origin and one track metre along x (lateral),
 * y (up) and s, as local vectors. Not normalised, so sizes in metres times `k` come out right
 * whatever scale the landmark is placed at.
 */
export class RoadFrame {
  readonly o = new THREE.Vector3();
  readonly ex = new THREE.Vector3();
  readonly ey = new THREE.Vector3();
  readonly es = new THREE.Vector3();
  /** Local units per track metre. */
  k = 1;

  private readonly b: HazardBinding;
  private readonly s: number;
  private readonly x: number;

  constructor(b: HazardBinding, s: number, x: number) {
    this.b = b;
    this.s = s;
    this.x = x;
    this.refresh();
  }

  /**
   * Re-reads the binding. The track scene fills a binding's mapping in only once it has placed
   * the landmark, after building it, so a landmark that poses parts from the road calls this
   * in update(); what the constructor read is only right where the binding is ready up front.
   */
  refresh(): this {
    const { b, s, x } = this;
    b.toLocal(s, x, 0, this.o);
    b.toLocal(s, x + 1, 0, this.ex).sub(this.o);
    b.toLocal(s, x, 1, this.ey).sub(this.o);
    b.toLocal(s + 1, x, 0, this.es).sub(this.o);
    this.k = this.ex.length();
    return this;
  }

  /** The local point at lateral x, height y and `ds` along the road from this frame's s. */
  point(x: number, y: number, ds: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.o).addScaledVector(this.ex, x - this.x).addScaledVector(this.ey, y).addScaledVector(this.es, ds);
  }

  /** A track-space direction (lateral, up, along) as a local vector, `k` long per metre. */
  dir(x: number, y: number, ds: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0, 0).addScaledVector(this.ex, x).addScaledVector(this.ey, y).addScaledVector(this.es, ds);
  }

  /** +1 if the landmark's origin lies toward +x of the road here, −1 if toward −x. */
  originSide(): number {
    return this.o.dot(this.ex) > 0 ? -1 : 1;
  }
}

/** Distance from the landmark origin to the farthest point the bound parts reach, for culling. */
export function boundReach(f: RoadFrame, extraMetres: number): number {
  return f.o.length() + extraMetres * f.k;
}

/**
 * Places `bone` at `p` with its +Z along `fwd` and +Y as close to `upRef` as the forward
 * allows (both local, need not be normalised).
 */
export function aim(bone: THREE.Object3D, p: THREE.Vector3, fwd: THREE.Vector3, upRef: THREE.Vector3): void {
  _f.copy(fwd).normalize();
  _r.crossVectors(upRef, _f);
  if (_r.lengthSq() < 1e-8) _r.set(1, 0, 0).cross(_f);
  _r.normalize();
  _u.crossVectors(_f, _r);
  _m.makeBasis(_r, _u, _f);
  bone.quaternion.setFromRotationMatrix(_m);
  bone.position.copy(p);
}
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _m = new THREE.Matrix4();
