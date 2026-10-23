// The harbour as a sweeper hazard: a gantry crane straddling the road whose trolley runs a
// hanging container low across the course. The container is the sweeper's body, placed every
// frame at the scheduled lateral position, so racers dodge exactly what they see.

import * as THREE from 'three';
import type { Kit } from '../b/kit.ts';
import { Bucket } from '../b/bucket.ts';
import { solidMaterial } from '../b/motion.ts';
import { beam, box, shade } from '../b/shapes.ts';
import { sweeperX } from '../../../core/hazards.ts';
import type { HazardBinding } from '../types.ts';
import { DARK, RED_LIGHT } from './kit.ts';
import { mover, roadBasis, type HazardOf } from './hazard.ts';

/** Boom height above the container's top, legs' clearance beyond the road and the run. */
const BOOM_CLEAR = 26;
const LEG_CLEAR = 7;
const GAUGE = 8;
/** The container fills this share of the collision cylinder's diameter. */
const BOX_FILL = 0.9;
/** It hangs just clear of the road. */
const HANG = 0.6;
const CRANE = 0xe8603a;
const CARGO = [0x2f6fb8, 0xc8402a, 0x3f9a5f, 0xf2a33a];

export function roadCrane(kit: Kit, bound: { binding: HazardBinding; hazard: HazardOf<'sweeper'> }): (time: number) => void {
  const { binding, hazard } = bound;
  const d = hazard.def;
  const r = d.radius;
  const basis = roadBasis(binding, hazard.s0, 0);
  const origin = binding.toLocal(hazard.s0, 0, 0, new THREE.Vector3());
  const frame = new THREE.Matrix4().makeTranslation(origin).multiply(basis);
  // Everything below is in track metres: x across the road, y up, z along it.
  const at = (x: number, y: number, z: number): THREE.Matrix4 => frame.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
  const lo = Math.min(d.xFrom, d.xTo, hazard.minX) - r - LEG_CLEAR;
  const hi = Math.max(d.xFrom, d.xTo, hazard.maxX) + r + LEG_CLEAR;
  const boomY = d.height + BOOM_CLEAR;
  const gauge = r + GAUGE;
  const dark = shade(CRANE, 0.7);
  for (const x of [lo, hi]) {
    for (const z of [-gauge, gauge]) kit.solid.add(box(1.8, boomY, 1.8), CRANE, at(x, 0, z));
    kit.solid.add(box(1.4, 1.4, gauge * 2), dark, at(x, boomY * 0.45, 0));
    kit.solid.add(box(3, 1, gauge * 2 + 4), DARK, at(x, 0, 0));
  }
  for (const z of [-3.2, 3.2]) kit.solid.add(box(hi - lo + 14, 2.6, 1.4), CRANE, at((lo + hi) / 2, boomY, z));
  for (const x of [lo, hi]) kit.solid.add(box(1.6, 2.2, gauge * 2 + 2), CRANE, at(x, boomY + 2.6, 0));
  kit.solid.add(box(6, 4, 6), 0xf4f1ea, at(hi + 4, boomY - 4, 0));
  kit.solid.add(box(10, 0.6, 10), DARK, at(lo - 4, boomY + 2.6, 0));
  for (const x of [lo, hi]) {
    const top = new THREE.Vector3().applyMatrix4(at(x, boomY + 5.2, 0));
    kit.lamp(new THREE.OctahedronGeometry(0.6), [top.x, top.y, top.z], RED_LIGHT, 4, undefined, { depth: 0.9, freq: 2, phase: x, sharp: 6 });
  }

  // The moving part: trolley, cables, spreader and the container, built round x = 0.
  const b = new Bucket({});
  const side = 2 * r * BOX_FILL;
  const top = d.height;
  b.add(box(7, 2.4, 8), DARK, new THREE.Matrix4().makeTranslation(0, boomY - 2.4, 0));
  for (const dx of [-side / 3, side / 3]) for (const dz of [-side / 3, side / 3]) b.add(beam([dx * 0.3, boomY - 2.4, dz * 0.3], [dx, top + 0.8, dz], 0.08, 3), 0x222222);
  b.add(box(side + 0.6, 0.8, side + 0.6), 0xf4d03f, new THREE.Matrix4().makeTranslation(0, top, 0));
  const cargo = CARGO[Math.floor(kit.rng() * CARGO.length)];
  b.add(box(side, top - HANG, side), cargo, new THREE.Matrix4().makeTranslation(0, HANG, 0));
  for (let i = 1; i < 6; i++) {
    const z = -side / 2 + (i * side) / 6;
    for (const sx of [-1, 1]) b.add(box(0.2, top - HANG - 0.6, 0.35), shade(cargo, 0.75), new THREE.Matrix4().makeTranslation((sx * (side + 0.2)) / 2, HANG + 0.3, z));
  }
  b.add(new THREE.OctahedronGeometry(0.4), RED_LIGHT, new THREE.Matrix4().makeTranslation(0, boomY, -4.2));
  const geo = b.geometry();
  const mat = solidMaterial(kit.u, false);
  const mesh = mover(geo, mat, 'craneLoad');
  kit.addObject(mesh, geo, mat);

  const p = new THREE.Vector3();
  return (time) => {
    binding.toLocal(hazard.s0, sweeperX(d, time), 0, p);
    mesh.matrix.copy(basis).setPosition(p);
    mesh.matrixWorldNeedsUpdate = true;
  };
}
