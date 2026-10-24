// City kit for the set-E landmarks (Neon Meridian). They are built with the ice world's rig kit
// (set-B buckets for static and GPU-animated parts, a set-A rig for anything posed from a hazard
// or the road, CPU point clouds for event-driven dust): that machinery is biome-neutral. This
// adds the city's colours, and lit facades: boxes whose windows and neon the shader draws
// (render/facade.ts), one instanced draw for every building a landmark has.

import * as THREE from 'three';
import type { LandmarkOptions } from '../types.ts';
import type { Kit } from '../b/kit.ts';
import { CITY_NEON, facadeBox, facadeMaterial } from '../../facade.ts';

export { IceKit as RigKit, RoadFrame, bindHazard, hide, smooth01 } from '../d/kit.ts';

// --- Palette ------------------------------------------------------------------------------

export const [MAGENTA, CYAN, AMBER] = CITY_NEON;
export const NEON: readonly number[] = CITY_NEON;
export const CONCRETE = 0x8a8c94;
export const CONCRETE_DARK = 0x4a4c54;
export const STEEL = 0x5c636e;
export const DARK = 0x1e2026;
export const GLASS = 0x2a3a52;
export const WHITE = 0xe8eaf0;
export const WARM_LIGHT = 0xffd890;
export const RED_LIGHT = 0xff3030;
/** Construction yellow, the colour of cranes and hoardings. */
export const SAFETY = 0xf2b418;
/** Wall tones of landmark buildings: concrete, dark glass, brick, steel. */
export const WALLS: readonly number[] = [0x4a4c56, 0x2a3242, 0x4a3634, 0x5a5e68, 0x343846];

// --- Lit facades --------------------------------------------------------------------------

/** Collects buildings (boxes, base on y = 0) and adds them to a kit as one instanced draw. */
export class Facades {
  private readonly list: { m: THREE.Matrix4; tint: THREE.Color }[] = [];

  get count(): number {
    return this.list.length;
  }

  /** A building of w × h × d standing at (x, y, z), turned by yaw. */
  add(x: number, y: number, z: number, w: number, h: number, d: number, yaw: number, tint: THREE.ColorRepresentation): void {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(w, h, d));
    this.list.push({ m, tint: new THREE.Color(tint) });
  }

  /** Adds the instanced mesh to the kit (it owns and disposes it). */
  build(kit: Kit, opts: LandmarkOptions): void {
    if (this.list.length === 0) return;
    const geo = facadeBox();
    const mat = facadeMaterial({ palette: opts.palette, neon: CITY_NEON, baseShade: null });
    const mesh = new THREE.InstancedMesh(geo, mat, this.list.length);
    this.list.forEach((b, i) => {
      mesh.setMatrixAt(i, b.m);
      mesh.setColorAt(i, b.tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = 'facades';
    kit.addObject(mesh, geo, mat);
  }
}
const UP = new THREE.Vector3(0, 1, 0);
