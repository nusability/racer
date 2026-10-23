// The invasion's siege strider: an armoured hull slung between four tall arched legs.
// Split from invasion.ts, which walks them and fires their guns.

import * as THREE from 'three';
import { T, between, box, cyl, type Rig } from './kit.ts';

export const HIP_Y = 30;
const THIGH_X = 15;
const THIGH_Y = 12;
const SHIN_X = 11;
const SHIN_Y = -(HIP_Y - 2 + THIGH_Y);

/** Leg bone lengths and rest angles (in the hip's vertical plane), for IK. */
export const LEG = {
  a: Math.hypot(THIGH_X, THIGH_Y),
  b: Math.hypot(SHIN_X, SHIN_Y),
  alpha0: Math.atan2(THIGH_Y, THIGH_X),
  beta0: Math.atan2(SHIN_Y, SHIN_X),
} as const;

export interface Strider {
  holder: THREE.Bone;
  head: THREE.Bone;
  hips: THREE.Bone[];
  shins: THREE.Bone[];
  cx: number;
  cz: number;
  ax: number;
  az: number;
  phase: number;
  dir: number;
}

export interface StriderColours {
  invader: THREE.Color;
  invaderLight: THREE.Color;
  red: THREE.Color;
  dark: THREE.Color;
}

/**
 * A siege strider: an armoured hull slung between four tall arched legs (knees above the
 * hull, like a harvestman), a gun head with a red sensor slit. ~45 m tall.
 */
export function buildStrider(
  rig: Rig,
  c: StriderColours,
  path: { cx: number; cz: number; ax: number; az: number; phase: number; dir: number },
): Strider {
  const holder = rig.bone();
  rig.add(cyl(0.75, 1, 8, 6).rotateY(Math.PI / 6).scale(9, 1, 12), c.invader, { bone: holder, m: T(0, HIP_Y - 4, 0) });
  rig.add(cyl(0.5, 0.8, 4, 6).rotateY(Math.PI / 6).scale(7, 1, 9), c.invaderLight, { bone: holder, m: T(0, HIP_Y + 4, -1) });
  rig.add(cyl(3, 5, 6, 6), c.dark, { bone: holder, m: T(0, HIP_Y - 10, 0) });
  rig.add(box(2, 6, 2), c.invaderLight, { bone: holder, m: T(0, HIP_Y + 9, -8, -0.3) });
  const head = rig.bone(holder, 0, HIP_Y + 6, 8);
  rig.add(cyl(0.6, 1, 5, 5).rotateY(Math.PI / 5).scale(5, 1, 7), c.invaderLight, { bone: head });
  rig.add(box(6, 0.8, 0.6), c.red, { bone: head, m: T(0, 2.6, 6.2), layer: 'glow' });
  for (const dx of [-2.2, 2.2]) rig.add(cyl(0.5, 0.7, 12, 5).rotateX(Math.PI / 2), c.dark, { bone: head, m: T(dx, 1.2, 4) });
  const hips: THREE.Bone[] = [];
  const shins: THREE.Bone[] = [];
  const corners = [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const;
  for (const [sx, sz] of corners) {
    const hip = rig.bone(holder, sx * 7, HIP_Y - 2, sz * 8);
    // Each leg's frame points outward and a little forward/back, so the stance is wide.
    hip.userData.base = Math.atan2(-sz * 0.7, sx);
    hip.rotation.y = hip.userData.base;
    // Thigh: a tapering armoured beam with a plate along its top; shin: a long greave that
    // narrows to the ankle; foot: three splayed claws. Heavy, not stick-insect thin.
    const knee = new THREE.Vector3(THIGH_X, THIGH_Y, 0);
    rig.add(cyl(2.2, 3.4, 1, 5), c.invader, { bone: hip, m: between(new THREE.Vector3(), knee, 1) });
    rig.add(box(4.5, 1.6, 4.2), c.invaderLight, { bone: hip, m: T(THIGH_X * 0.45, THIGH_Y * 0.45 + 2.6, 0, 0, 0, Math.atan2(THIGH_Y, THIGH_X)).multiply(T(0, 0, 0, 0, 0, 0, 3, 1, 1)) });
    rig.add(cyl(2.6, 2.6, 5, 6).rotateX(Math.PI / 2).translate(0, 0, -2.5), c.dark, { bone: hip, m: T(THIGH_X, THIGH_Y, 0) });
    const shin = rig.bone(hip, THIGH_X, THIGH_Y, 0);
    const foot = new THREE.Vector3(SHIN_X, SHIN_Y, 0);
    rig.add(cyl(1.1, 2.6, 1, 6), c.dark, { bone: shin, m: between(new THREE.Vector3(), foot, 1) });
    rig.add(cyl(0.6, 2.4, 1, 4), c.invader, { bone: shin, m: between(new THREE.Vector3(0.6, 0, 0), foot.clone().multiplyScalar(0.55).setX(foot.x * 0.55 + 1.4), 1) });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      const toe = new THREE.Vector3(foot.x + Math.cos(a) * 5, foot.y, Math.sin(a) * 5);
      rig.add(cyl(0.3, 1.2, 1, 4), c.invader, { bone: shin, m: between(foot.clone().setY(foot.y + 1.6), toe, 1) });
    }
    hips.push(hip);
    shins.push(shin);
  }
  return { holder, head, hips, shins, ...path };
}
