// Props shared by several set-B landmarks: awnings, bunting, light strings, palms and the
// pack beasts of the frontier markets.

import * as THREE from 'three';
import type { Rng } from '../../../core/rng.ts';
import type { Bucket } from './bucket.ts';
import type { Kit } from './kit.ts';
import type { V3 } from './motion.ts';
import { Frame, ball, beam, box, catenary, cone, mix, prism, quad, shade, tri, vary } from './shapes.ts';

/** Two triangles through four corners (in order round the quad). */
export function quadPts(a: V3, b: V3, c: V3, d: V3): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  return g;
}

export interface Flutter {
  amp: number;
  freq: number;
  phase: number;
}

/**
 * A striped canvas in frame `f`, `w` wide along local x, sloping from the back edge
 * (backY, backZ) to the front edge (frontY, frontZ), with a scalloped valance. With
 * `flutter` it rocks about its back edge as if the wind were under it.
 */
export function stripedAwning(
  b: Bucket,
  f: Frame,
  w: number,
  back: readonly [number, number],
  front: readonly [number, number],
  stripes: number,
  colA: THREE.ColorRepresentation,
  colB: THREE.ColorRepresentation,
  flutter?: Flutter,
): void {
  const motion = flutter && { pivot: f.p(0, back[0], back[1]), axisB: f.dir(1, 0, 0), swingB: flutter.amp, freq: flutter.freq, phase: flutter.phase };
  const sw = w / stripes;
  const drop = w / stripes / 1.6;
  for (let i = 0; i < stripes; i++) {
    const x0 = -w / 2 + i * sw;
    const x1 = x0 + sw;
    const color = i % 2 ? colB : colA;
    b.add(quadPts([x0, back[0], back[1]], [x1, back[0], back[1]], [x1, front[0], front[1]], [x0, front[0], front[1]]), color, f.base, motion);
    b.add(tri([x0, front[0], front[1]], [x1, front[0], front[1]], [(x0 + x1) / 2, front[0] - drop, front[1]]), i % 2 ? colA : colB, f.base, motion);
  }
}

const ROPE_RADIUS = 0.07;
const ROPE_SEGMENTS = 4;
const ROPE_COLOR = 0x3a2a20;

export function rope(kit: Kit, a: V3, b: V3, sag: number): V3[] {
  const pts = catenary(a, b, sag, ROPE_SEGMENTS);
  for (let i = 0; i < ROPE_SEGMENTS; i++) kit.solid.add(beam(pts[i], pts[i + 1], ROPE_RADIUS, 3), ROPE_COLOR);
  return pts;
}

/** Pennants hung along a sagging rope, each swinging about the rope. */
export function bunting(kit: Kit, a: V3, b: V3, sag: number, flags: number, size: number): void {
  rope(kit, a, b, sag);
  const pts = catenary(a, b, sag, flags + 1);
  const d = new THREE.Vector3(b[0] - a[0], 0, b[2] - a[2]).normalize();
  const axis: V3 = [d.x, 0, d.z];
  const freq = 2 + kit.rng() * 1.5;
  for (let i = 1; i <= flags; i++) {
    const p = pts[i];
    const h = size * 0.5;
    const g = tri([p[0] - d.x * h, p[1], p[2] - d.z * h], [p[0] + d.x * h, p[1], p[2] + d.z * h], [p[0], p[1] - size * 1.3, p[2]]);
    kit.moving.add(g, kit.festiveColor(), undefined, { pivot: p, axisB: axis, swingB: 0.35, freq, phase: i * 0.7 });
  }
}

/** A string of bulbs whose twinkle runs along it like a marquee. */
export function lampString(kit: Kit, a: V3, b: V3, sag: number, bulbs: number, bulb: number, halo: number, colors?: readonly THREE.ColorRepresentation[]): void {
  rope(kit, a, b, sag);
  const pts = catenary(a, b, sag, bulbs + 1);
  const g = new THREE.OctahedronGeometry(bulb);
  for (let i = 1; i <= bulbs; i++) {
    const color = colors ? colors[i % colors.length] : kit.lamps[i % kit.lamps.length];
    kit.lamp(g, pts[i], color, halo, undefined, { depth: 0.55, freq: 3, phase: -i * 0.9, sharp: 2 });
  }
}

const PALM_SEGMENTS = 5;
const PALM_FRONDS = 7;

/** A date palm: curved segmented trunk and drooping fronds that sway in the wind. */
export function palm(kit: Kit, x: number, z: number, h: number, rng: Rng): void {
  const lean = rng() * Math.PI * 2;
  const bend = 0.12 + rng() * 0.18;
  const dx = Math.cos(lean);
  const dz = Math.sin(lean);
  let prev: V3 = [x, 0, z];
  const bark = vary(rng, mix(kit.palette.rock, 0x6a4a30, 0.6), 0.1);
  for (let i = 1; i <= PALM_SEGMENTS; i++) {
    const t = i / PALM_SEGMENTS;
    const off = bend * h * t * t;
    const p: V3 = [x + dx * off, h * t, z + dz * off];
    kit.solid.add(beam(prev, p, 0.55 - 0.25 * t, 5), i % 2 ? bark : shade(bark, 0.85));
    prev = p;
  }
  const crown = prev;
  const green = vary(rng, 0x3f8a3a, 0.12);
  const freq = 1.2 + rng() * 0.8;
  for (let i = 0; i < PALM_FRONDS; i++) {
    const a = (i / PALM_FRONDS) * Math.PI * 2 + rng() * 0.4;
    const len = h * (0.38 + rng() * 0.12);
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const mid: V3 = [crown[0] + cx * len * 0.55, crown[1] + len * 0.12, crown[2] + cz * len * 0.55];
    const tip: V3 = [crown[0] + cx * len, crown[1] - len * 0.35, crown[2] + cz * len];
    const w = len * 0.16;
    const side: V3 = [-cz * w, 0, cx * w];
    const motion = { pivot: crown, axisB: [-cz, 0, cx] as V3, swingB: 0.08, freq, phase: i * 0.6 };
    kit.moving.add(quadPts(crown, [mid[0] + side[0], mid[1], mid[2] + side[2]], tip, [mid[0] - side[0], mid[1], mid[2] - side[2]]), i % 2 ? green : shade(green, 0.8), undefined, motion);
  }
  kit.solid.add(ball(0.9, 5, 3), 0x8a4a20, new THREE.Matrix4().makeTranslation(crown[0], crown[1] - 0.8, crown[2]));
}

/**
 * A "dune strider": a six-legged, long-necked pack beast with a cargo hump. Its head nods and
 * its tail swishes; the body stands still (the market is in no hurry).
 */
export function beast(kit: Kit, f: Frame, rng: Rng, cargo: readonly THREE.ColorRepresentation[]): void {
  const hide = vary(rng, mix(kit.palette.rock, 0xb89a70, 0.5), 0.15);
  const dark = shade(hide, 0.7);
  const s = kit.solid;
  s.add(ball(1, 6, 3), hide, f.m(0, 3.4, 0, 0, 0, 0, [1.3, 1.1, 2.8]));
  for (const lz of [-1.7, 0, 1.7]) {
    for (const lx of [-0.75, 0.75]) s.add(beam(f.p(lx, 3, lz), f.p(lx * 1.25, 0, lz + 0.2), 0.22, 4), dark);
  }
  // Cargo: bundles and a striped blanket over the hump.
  s.add(box(2.9, 0.25, 2.4), cargo[0], f.m(0, 4.25, 0.2));
  s.add(box(1.2, 1.0, 1.4), cargo[1 % cargo.length], f.m(-0.9, 4.0, 0.2, 0.1));
  s.add(box(1.1, 0.9, 1.3), cargo[2 % cargo.length], f.m(0.9, 4.0, 0.3, -0.1));
  s.add(prism(0.5, 0.5, 1.6, 6), cargo[3 % cargo.length], f.m(0, 4.6, 0.1, 0, 0, Math.PI / 2));
  const freq = 1.4 + rng();
  const neckBase = f.p(0, 3.9, -2.4);
  const nod = { pivot: neckBase, axisB: f.dir(1, 0, 0), swingB: 0.12, freq, phase: rng() * 6 };
  kit.moving.add(beam(neckBase, f.p(0, 6.4, -3.6), 0.35, 5), hide, undefined, nod);
  kit.moving.add(box(0.7, 0.7, 1.5), hide, f.m(0, 6.2, -4.1, 0, 0.3), nod);
  for (const ex of [-0.35, 0.35]) kit.moving.add(quad(0.3, 0.9), dark, f.m(ex, 6.6, -3.7, 0, -0.6, ex * 2), nod);
  const tailBase = f.p(0, 3.6, 2.7);
  kit.moving.add(cone(0.25, 2.2, 4), dark, f.m(0, 3.6, 2.7, 0, 2.4), { pivot: tailBase, axisB: [0, 1, 0], swingB: 0.5, freq: freq * 1.7, phase: rng() * 6 });
}
