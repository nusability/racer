// The air show: a display team over the sea. Five delta jets loop in a V formation facing
// the track, painting a ring of coloured smoke; a pair of soloists cross head-on in knife-edge
// passes; another barrel-rolls round the whole display; a ring of light drones turns high
// above. Below, the team's support carrier with a painted deck, parked jets and a crowd.
// The group origin is on the water beneath the display.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import type { Motion, V3 } from '../b/motion.ts';
import type { Particles } from '../b/points.ts';
import { T, beam, box, prism, shade, tri, vary } from '../b/shapes.ts';
import { bunting } from '../b/props.ts';
import { DARK, FOAM, FOAM_Y, GLASS, RED_LIGHT, WHITE, finishCoast, hull, trail, wake } from './kit.ts';

const SALT = 0xa125;
const RADIUS = 240;
const JET_LEN = 14;
/** Jets are drawn larger than life so the display reads from the track and across the bay. */
const JET_SCALE = 1.7;
const LOOP = { hub: [0, 190, 60] as V3, r: 130, spin: 0.42 } as const;
const FORMATION: readonly { lag: number; dz: number }[] = [
  { lag: 0, dz: 0 },
  { lag: 0.07, dz: -14 },
  { lag: 0.07, dz: 14 },
  { lag: 0.14, dz: -28 },
  { lag: 0.14, dz: 28 },
];
const CROSS = { hub: [0, 95, 60] as V3, r: 170, spin: 0.33 } as const;
const ROLL = { hub: [0, 60, 60] as V3, r: 225, spin: -0.22, roll: 1.6 } as const;
const DRONES = { hub: [0, 330, 80] as V3, r: 45, n: { high: 36, low: 18 }, spin: 0.25 } as const;
const SMOKE = { loop: { high: 110, low: 56 }, cross: { high: 90, low: 46 }, roll: { high: 120, low: 60 } } as const;
/** Puff size as a multiple of the gap between puffs, so a trail reads as one ribbon. */
const PUFF_OVERLAP = 1.5;
const TRAIL_SHARE = 0.55;
const CARRIER = { len: 150, beam: 34, deck: 11, z: 20 } as const;
const SMOKE_COLOURS = [0xe8443a, 0xf4f1ea, 0x2f6fd8, 0xf4d03f, 0x3fc0a0];

interface Pose {
  at: V3;
  fwd: THREE.Vector3;
  up: THREE.Vector3;
}

function jet(kit: Kit, pose: Pose, body: THREE.ColorRepresentation, motion: Motion): void {
  const side = new THREE.Vector3().crossVectors(pose.fwd, pose.up);
  const m = new THREE.Matrix4().makeBasis(pose.fwd, pose.up, side).setPosition(...pose.at).multiply(new THREE.Matrix4().makeScale(JET_SCALE, JET_SCALE, JET_SCALE));
  const L = JET_LEN;
  const add = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation): void => kit.moving.add(g, c, m, motion);
  add(new THREE.OctahedronGeometry(1).scale(L / 2, 0.9, 0.95), body);
  add(new THREE.OctahedronGeometry(1).scale(2.2, 0.6, 0.55).translate(L * 0.18, 0.55, 0), GLASS);
  add(tri([L * 0.2, 0, 0], [-L * 0.42, 0, 6], [-L * 0.42, 0, -6]), WHITE);
  for (const s of [-1, 1]) add(tri([-L * 0.3, 0, s * 4.6], [-L * 0.42, 0, s * 6], [-L * 0.42, 0, s * 4]), body);
  for (const s of [-1, 1]) add(tri([-L * 0.25, 0.4, s * 0.5], [-L * 0.48, 0.4, s * 0.6], [-L * 0.46, 3.6, s * 1.4]), shade(body, 0.8));
  add(prism(0.6, 0.6, 0.5, 6).rotateZ(Math.PI / 2).translate(-L / 2, 0, 0), DARK);
}

/** Pose on a circle round `hub` about `axis`, `theta` round from `top` (radius vector at 0). */
function poseOn(hub: V3, axis: THREE.Vector3, top: THREE.Vector3, r: number, theta: number, dir: number): { at: V3; fwd: THREE.Vector3; out: THREE.Vector3 } {
  const out = top.clone().applyAxisAngle(axis, theta);
  const fwd = new THREE.Vector3().crossVectors(axis, out).multiplyScalar(dir).normalize();
  return { at: [hub[0] + out.x * r, hub[1] + out.y * r, hub[2] + out.z * r], fwd, out };
}

/**
 * Smoke behind a jet on a circle: puffs at points round the circle, each appearing as the jet
 * passes it and lasting a share of the lap. `theta0` is the jet's rest angle, `spin` signed.
 */
function smokeRing(p: Particles, kit: Kit, hub: V3, axis: THREE.Vector3, top: THREE.Vector3, r: number, theta0: number, spin: number, n: number, color: THREE.ColorRepresentation): void {
  const size = (PUFF_OVERLAP * Math.PI * 2 * r) / n;
  const period = (Math.PI * 2) / Math.abs(spin);
  const points: V3[] = [];
  const angles: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    angles.push(a);
    const o = top.clone().applyAxisAngle(axis, a);
    points.push([hub[0] + o.x * r, hub[1] + o.y * r, hub[2] + o.z * r]);
  }
  trail(p, kit.rng, points, (i) => (angles[i] - theta0) / spin, { color, size, period, lifetime: period * TRAIL_SHARE, drift: [0, -0.6, 0], grow: 0.14, jitter: 1.5 });
}

function formationLoop(kit: Kit, smoke: Particles): void {
  const axis = new THREE.Vector3(0, 0, 1);
  const top = new THREE.Vector3(0, 1, 0);
  const body = kit.palette.accent;
  FORMATION.forEach((f, i) => {
    const theta0 = -f.lag;
    const hub: V3 = [LOOP.hub[0], LOOP.hub[1], LOOP.hub[2] + f.dz];
    const { at, fwd, out } = poseOn(hub, axis, top, LOOP.r, theta0, 1);
    // Inside a loop the pilot's head points at the centre.
    const motion: Motion = { hub, axisA: [0, 0, 1], spinA: LOOP.spin };
    jet(kit, { at, fwd, up: out.clone().negate() }, i === 0 ? 0xe8443a : body, motion);
    smokeRing(smoke, kit, hub, axis, top, LOOP.r, theta0, LOOP.spin, kit.q(SMOKE.loop.high, SMOKE.loop.low), SMOKE_COLOURS[i % SMOKE_COLOURS.length]);
  });
}

function crossover(kit: Kit, smoke: Particles): void {
  const axis = new THREE.Vector3(0, 1, 0);
  // Both start at the point nearest the track, flying opposite ways: they cross there and
  // again at the back of the circle every half lap.
  const top = new THREE.Vector3(0, 0, -1);
  for (const dir of [1, -1]) {
    const spin = CROSS.spin * dir;
    const hub: V3 = [CROSS.hub[0], CROSS.hub[1] + dir * 4, CROSS.hub[2]];
    const { at, fwd, out } = poseOn(hub, axis, top, CROSS.r, 0, dir);
    // Knife edge: wings vertical, canopies facing outward, opposite for each jet.
    const motion: Motion = { hub, axisA: [0, 1, 0], spinA: spin };
    jet(kit, { at, fwd, up: out.clone().multiplyScalar(dir) }, dir > 0 ? 0x2f6fd8 : 0xf4d03f, motion);
    smokeRing(smoke, kit, hub, axis, top, CROSS.r, 0, spin, kit.q(SMOKE.cross.high, SMOKE.cross.low), dir > 0 ? 0x2f6fd8 : 0xf4d03f);
  }
}

function barrelRoll(kit: Kit, smoke: Particles): void {
  const axis = new THREE.Vector3(0, 1, 0);
  const top = new THREE.Vector3(1, 0, 0);
  const dir = Math.sign(ROLL.spin);
  const { at, fwd } = poseOn(ROLL.hub, axis, top, ROLL.r, 0, dir);
  const motion: Motion = { hub: ROLL.hub, axisA: [0, 1, 0], spinA: ROLL.spin, pivot: at, axisB: [fwd.x, fwd.y, fwd.z], spinB: ROLL.roll };
  jet(kit, { at, fwd, up: new THREE.Vector3(0, 1, 0) }, 0xe8443a, motion);
  smokeRing(smoke, kit, ROLL.hub, axis, top, ROLL.r, 0, ROLL.spin, kit.q(SMOKE.roll.high, SMOKE.roll.low), 0xff6a9a);
}

/** A ring of light drones high above, turning and rippling like a necklace. */
function drones(kit: Kit): void {
  const n = kit.q(DRONES.n.high, DRONES.n.low);
  const [hx, hy, hz] = DRONES.hub;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const at: V3 = [hx + Math.cos(a) * DRONES.r, hy + Math.sin(a) * DRONES.r, hz];
    const motion: Motion = { hub: DRONES.hub, axisA: [0, 0, 1], spinA: DRONES.spin, drift: [0, 0, 8], driftFreq: 1.2, phase: a * 3 };
    kit.moving.add(box(1.6, 0.3, 1.6), DARK, T(at[0], at[1] - 0.6, at[2]), motion);
    kit.lamp(new THREE.OctahedronGeometry(0.7), at, kit.lamps[i % kit.lamps.length], 5 + 5 * kit.dusk, motion, { depth: 0.6, freq: 3, phase: a * 2, sharp: 2 });
  }
}

function carrier(kit: Kit): void {
  const { rng } = kit;
  const { len, beam: bw, deck, z } = CARRIER;
  kit.solid.add(hull(len, bw * 0.8, deck + 6, 0.25, 0.9), 0x8a94a0, T(0, -6, z));
  kit.solid.add(box(len * 0.98, 1, bw), 0x50555e, T(-2, deck - 0.5, z));
  // Deck paint: a centreline, the team's chevrons and edge lights.
  kit.solid.add(box(len * 0.9, 0.05, 0.8), WHITE, T(-2, deck + 0.5, z));
  for (let i = 0; i < 3; i++) kit.solid.add(tri([len * 0.3 - i * 10, deck + 0.55, z], [len * 0.3 - i * 10 - 6, deck + 0.55, z - 6], [len * 0.3 - i * 10 - 6, deck + 0.55, z + 6]), kit.palette.accent);
  for (let i = 0; i < 16; i++) for (const s of [-1, 1]) kit.halos.point([-len / 2 + 6 + i * ((len - 12) / 15), deck + 0.7, z + s * (bw / 2 - 0.5)], i % 2 ? 0x80ff90 : 0xffffff, 1.6, undefined, { depth: 0.8, freq: 4, phase: -i * 0.5, sharp: 3 });
  // Island with a turning radar and a mast flying the team's flags.
  kit.solid.add(box(20, 12, 7), shade(0x5a6470, 1.15), T(-10, deck, z + bw / 2 - 4));
  kit.solid.add(box(20.4, 1.4, 7.4), GLASS, T(-10, deck + 9, z + bw / 2 - 4));
  kit.solid.add(beam([-10, deck + 12, z + bw / 2 - 4], [-10, deck + 24, z + bw / 2 - 4], 0.3, 4), DARK);
  kit.moving.add(box(6, 0.5, 0.8), DARK, T(-10, deck + 20, z + bw / 2 - 4), { hub: [-10, 0, z + bw / 2 - 4], axisA: [0, 1, 0], spinA: 1.4 });
  kit.lamp(new THREE.OctahedronGeometry(0.5), [-10, deck + 24.6, z + bw / 2 - 4], RED_LIGHT, 4, undefined, { depth: 0.9, freq: 2, phase: 0, sharp: 6 });
  bunting(kit, [-10, deck + 24, z + bw / 2 - 4], [len / 2 - 4, deck + 2, z], 2, kit.q(12, 6), 1.2);
  bunting(kit, [-10, deck + 24, z + bw / 2 - 4], [-len / 2 + 4, deck + 2, z], 2, kit.q(12, 6), 1.2);
  // Parked jets and a crowd of crew and guests along the deck edge facing the display.
  for (let i = 0; i < 3; i++) {
    jet(kit, { at: [20 + i * 18, deck + 2.2, z - 6], fwd: new THREE.Vector3(-0.5, 0, -0.86).normalize(), up: new THREE.Vector3(0, 1, 0) }, i === 1 ? 0xe8443a : kit.palette.accent, {});
  }
  for (let i = 0; i < kit.q(60, 26); i++) {
    kit.crowd({ x: -len / 2 + 10 + rng() * (len - 30), y: deck, z: z - bw / 2 + 2 + rng() * 4, ry: Math.PI, color: vary(rng, kit.festiveColor(), 0.2), hop: 0.3, freq: 4 + rng() * 2, phase: rng() * 9, sharp: 3, raise: rng() < 0.5 ? 0.9 : 0 });
  }
  kit.moving.add(wake(30, 30), FOAM, T(len / 2 - 6, FOAM_Y, z), { drift: [1, 0, 0], driftFreq: 1 });
}

export function createAirshow(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const smoke = kit.particles(false, 1.2);
  formationLoop(kit, smoke);
  crossover(kit, smoke);
  barrelRoll(kit, smoke);
  drones(kit);
  carrier(kit);
  return finishCoast(kit, RADIUS);
}
