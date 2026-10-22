// Static structures of the spaceport: launch pads with their gantries, and the mag-launch
// rail. Split from spaceport.ts, which owns the layout and all the animation.

import * as THREE from 'three';
import { T, between, block, box, cyl, ringOf, shade, strut, type Rig } from './kit.ts';

export const PAD_R = 36;
export const PAD_H = 3;
export const GANTRY_H = 72;
const GANTRY_W = 8;
const ARM_Y = 46;

/** Mag-launch rail behind the pads: a ramp that flings a lancer into the sky. */
export const RAIL_Z = 118;
export const RAIL_X0 = -235;
const RAIL_LEN = 440;
const RAIL_TOP = 190;
const RAIL_CURVE = 2.2;
export const RAIL_RINGS = 14;

/** A point on the rail at 0..1 (bottom to the lip). */
export function railPoint(u: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(RAIL_X0 + RAIL_LEN * u, 6 + RAIL_TOP * Math.pow(u, RAIL_CURVE), RAIL_Z);
}

/** The rail's climb angle at 0..1, radians. */
export function railSlope(u: number): number {
  return Math.atan((RAIL_CURVE * RAIL_TOP * Math.pow(u, RAIL_CURVE - 1)) / RAIL_LEN);
}

interface RailColours {
  steel: THREE.Color;
  dark: THREE.Color;
  metal: THREE.Color;
  accent: THREE.Color;
  warm: THREE.Color;
}

/** Twin rails on pylons, induction rings and a breech house at the bottom. */
export function buildRail(rig: Rig, hi: boolean, c: RailColours): void {
  const { steel, dark, metal, accent, warm } = c;
  const R0 = new THREE.Vector3();
  const R1 = new THREE.Vector3();
  const RAIL_SEGS = hi ? 22 : 12;
  for (let k = 0; k < RAIL_SEGS; k++) {
    railPoint(k / RAIL_SEGS, R0);
    railPoint((k + 1) / RAIL_SEGS, R1);
    for (const dz of [-5, 5]) {
      rig.add(strut(), steel, { m: between(R0.clone().setZ(RAIL_Z + dz), R1.clone().setZ(RAIL_Z + dz), 2.4) });
    }
    rig.add(strut(), dark, { m: between(R0.clone().setY(R0.y - 2.5), R1.clone().setY(R1.y - 2.5), 4) });
    if (k % 2 === 1 && R0.y > 10) {
      rig.add(block(3, R0.y, 3), metal, { m: T(R0.x, 0, RAIL_Z - 7) });
      rig.add(block(3, R0.y, 3), metal, { m: T(R0.x, 0, RAIL_Z + 7) });
      rig.add(box(3, 2, 17), accent, { m: T(R0.x, R0.y - 2, RAIL_Z) });
      rig.add(strut(), steel, { m: between(new THREE.Vector3(R0.x, 0, RAIL_Z - 7), new THREE.Vector3(R0.x, R0.y - 3, RAIL_Z + 7), 0.8) });
    }
  }
  for (let k = 0; k < RAIL_RINGS; k++) {
    const u = (k + 1) / (RAIL_RINGS + 1);
    railPoint(u, R0);
    const slope = railSlope(u);
    rig.add(new THREE.TorusGeometry(10, 0.9, 4, 10).rotateY(Math.PI / 2), dark, { m: T(R0.x, R0.y + 4, RAIL_Z, 0, 0, slope) });
  }
  rig.add(block(40, 16, 26), metal, { m: T(RAIL_X0 - 8, 0, RAIL_Z) });
  rig.add(box(2, 9, 14), warm, { m: T(RAIL_X0 + 12.2, 6, RAIL_Z), layer: 'glow' });
}

export interface PadColours {
  concrete: THREE.Color;
  steel: THREE.Color;
  dark: THREE.Color;
  hazard: THREE.Color;
  accent: THREE.Color;
  metal: THREE.Color;
  warm: THREE.Color;
}

/** A raised launch pad with hazard ring, flame trench and a lattice gantry with a swing arm. */
export function buildPad(rig: Rig, p: THREE.Vector3, c: PadColours): THREE.Bone {
  rig.add(cyl(PAD_R, PAD_R + 4, PAD_H, 16), c.concrete, { m: T(p.x, 0, p.z) });
  rig.add(cyl(PAD_R * 0.55, PAD_R * 0.55, 0.1, 16), shade(c.concrete, 0.8), { m: T(p.x, PAD_H, p.z) });
  ringOf(16, PAD_R - 2.5, 4, 0.2, 2.2, PAD_H + 0.05).forEach((g, k) => rig.add(g, k % 2 ? c.hazard : c.dark, { m: T(p.x, 0, p.z) }));
  rig.add(block(16, 1.2, 50), c.dark, { m: T(p.x, 0, p.z + PAD_R + 18) });
  // Gantry: four columns, ring frames and cross braces.
  const gx = p.x + PAD_R + 10;
  const gz = p.z + 6;
  const h = GANTRY_W / 2;
  for (const [dx, dz] of [[-h, -h], [h, -h], [h, h], [-h, h]] as const) {
    rig.add(block(1.2, GANTRY_H, 1.2), c.steel, { m: T(gx + dx, 0, gz + dz) });
  }
  for (let y = 8; y <= GANTRY_H; y += 8) {
    rig.add(box(GANTRY_W + 1, 0.8, GANTRY_W + 1), c.accent, { m: T(gx, y, gz) });
    const a = new THREE.Vector3(gx - h, y - 8, gz - h);
    const b = new THREE.Vector3(gx + h, y, gz - h);
    rig.add(strut(), c.steel, { m: between(a, b, 0.5) });
    rig.add(strut(), c.steel, { m: between(new THREE.Vector3(gx - h, y - 8, gz + h), new THREE.Vector3(gx - h, y, gz - h), 0.5) });
  }
  rig.add(block(GANTRY_W + 4, 3, GANTRY_W + 4), c.metal, { m: T(gx, GANTRY_H, gz) });
  rig.add(cyl(0.3, 0.3, 10, 4), c.steel, { m: T(gx, GANTRY_H + 3, gz) });
  const arm = rig.bone(rig.root, gx - h, ARM_Y, gz);
  rig.add(box(PAD_R - 4, 2.4, 3), c.metal, { bone: arm, m: T(-(PAD_R - 4) / 2, 0, 0) });
  rig.add(box(3, 4, 4), c.accent, { bone: arm, m: T(-(PAD_R - 3), -1, 0) });
  rig.add(box(PAD_R - 6, 0.5, 0.5), c.warm, { bone: arm, m: T(-(PAD_R - 6) / 2, -1.4, -1.6), layer: 'glow' });
  return arm;
}
