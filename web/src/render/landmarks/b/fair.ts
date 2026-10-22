// The fair: an over-the-top desert carnival. A ferris wheel facing the track, a spinning
// crown carousel with tilting pod arms, a swing tower whose chair ring rides up and down, a
// pendulum that nearly loops, a coaster loop, striped big tops, light strings everywhere,
// a milling crowd and fireworks overhead.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from './kit.ts';
import type { Bucket } from './bucket.ts';
import type { Motion, V3 } from './motion.ts';
import { sphereDir } from './points.ts';
import { Frame, ball, beam, box, cone, lathe, mix, pick, prism, shade, vary } from './shapes.ts';
import { bunting, lampString, quadPts, stripedAwning } from './props.ts';

const SALT = 0xfa17;
const RADIUS = 150;

const WHEEL = { x: -72, z: 45, hubY: 42, r: 35, spokes: 16, cabins: 16, spin: 0.14 } as const;
const CAROUSEL = { x: 8, z: 0, armY: 15, arms: 10, reach: 27, spin: 0.75, tilt: 0.42, tiltFreq: 0.9 } as const;
const SWING = { x: 88, z: 38, height: 64, chairs: 16, rim: 7, chain: 9, lean: 0.8, rideY: 32, rideRange: 14, spin: 1.35 } as const;
const PENDULUM = { x: 2, z: 74, pivotY: 46, arm: 32, swing: 2.25, freq: 0.55, spin: 1.6 } as const;
const LOOP = { x: -110, z: -38, r: 16, cars: 4, spin: 1.7 } as const;
const TENTS: readonly { x: number; z: number; r: number }[] = [
  { x: 62, z: -32, r: 17 },
  { x: 112, z: -48, r: 11 },
  { x: -38, z: 92, r: 14 },
  { x: -40, z: -52, r: 10 },
];
const GATE_Z = -84;
const CROWD = { high: 520, low: 200 } as const;
const FIREWORK_BURSTS = { high: 7, low: 4 } as const;
const FIREWORK_SPARKS = { high: 60, low: 40 } as const;
const BULB = 0.32;
const BOOTHS = { high: 14, low: 7 } as const;

/** A seated rider: just a coloured torso and head (seen from tens of metres away). */
function rider(b: Bucket, m: THREE.Matrix4, color: THREE.ColorRepresentation, motion: Motion): void {
  b.add(box(0.6, 0.8, 0.5), color, m, motion);
  b.add(new THREE.OctahedronGeometry(0.25), 0xc08a62, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.05, 0)), motion);
}

function ferrisWheel(kit: Kit): void {
  const { x, z, hubY, r } = WHEEL;
  const hub: V3 = [x, hubY, z];
  const spin: Motion = { hub, axisA: [0, 0, 1], spinA: WHEEL.spin };
  const steel = mix(0xf2efe6, kit.palette.accent, 0.15);
  const rimPt = (a: number, dz: number): V3 => [x + Math.cos(a) * r, hubY + Math.sin(a) * r, z + dz];
  for (const dz of [-6, 6]) {
    for (const dx of [-17, 17]) kit.solid.add(beam([x + dx, 0, z + dz * 1.4], [x, hubY, z + dz * 0.4], 0.7, 4), shade(steel, 0.8));
  }
  kit.solid.add(prism(2.2, 2.2, 6, 8).rotateX(Math.PI / 2).translate(x, hubY, z + 3), shade(steel, 0.6));
  const n = WHEEL.spokes * 2;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    for (const dz of [-2.4, 2.4]) kit.moving.add(beam(rimPt(a0, dz), rimPt(a1, dz), 0.35, 3), steel, undefined, spin);
    if (i % 2 === 0) {
      for (const dz of [-2.4, 2.4]) kit.moving.add(beam([x, hubY, z + dz * 0.5], rimPt(a0, dz), 0.18, 3), steel, undefined, spin);
      kit.lamp(new THREE.OctahedronGeometry(BULB * 1.4), rimPt(a0 + Math.PI / n, -2.8), kit.lamps[i % kit.lamps.length], 2.4, spin, { depth: 0.7, freq: 4, phase: i * 0.8, sharp: 2 });
    }
    kit.lamp(new THREE.OctahedronGeometry(BULB), rimPt(a0, -2.8), kit.lamps[(i + 3) % kit.lamps.length], 1.6, spin, { depth: 0.5, freq: 2, phase: -i * 0.4 });
  }
  for (let i = 0; i < WHEEL.cabins; i++) {
    const a = (i / WHEEL.cabins) * Math.PI * 2;
    const pivot = rimPt(a, 0);
    const motion: Motion = { hub, axisA: [0, 0, 1], spinA: WHEEL.spin, pivot, upright: true, axisB: [0, 0, 1], swingB: 0.1, freq: 1.3, phase: i };
    const color = kit.festiveColor();
    const m = new THREE.Matrix4().makeTranslation(pivot[0], pivot[1] - 4.6, pivot[2]);
    kit.moving.add(beam(pivot, [pivot[0], pivot[1] - 1.6, pivot[2]], 0.12, 3), 0x333333, undefined, motion);
    kit.moving.add(prism(1.6, 1.8, 2.8, 6), color, m, motion);
    kit.moving.add(cone(2.1, 1.3, 6), shade(color, 0.7), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 2.8, 0)), motion);
  }
  kit.lamp(new THREE.OctahedronGeometry(1.4), [x, hubY, z - 3.6], kit.palette.accent, 9, spin, { depth: 0.4, freq: 1.5, phase: 0 });
}

function carousel(kit: Kit): void {
  const { x, z, armY, reach } = CAROUSEL;
  const s = kit.solid;
  const gold = 0xe0b040;
  s.add(prism(31, 31, 1.4, 16), shade(kit.palette.sand, 0.85), new THREE.Matrix4().makeTranslation(x, 0, z));
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    kit.lamp(new THREE.OctahedronGeometry(BULB), [x + Math.cos(a) * 31.2, 1.2, z + Math.sin(a) * 31.2], kit.lamps[i % 3], 1.4, undefined, { depth: 0.85, freq: 5, phase: i * 1.2, sharp: 3 });
  }
  s.add(prism(4, 2.8, 34, 8), kit.festiveColor(), new THREE.Matrix4().makeTranslation(x, 0, z));
  const spin: Motion = { hub: [x, armY, z], axisA: [0, 1, 0], spinA: CAROUSEL.spin };
  // Striped spinning canopy and a crown of spikes on top.
  const gores = 12;
  const umbrella = [[0.2, 10], [11, 6], [13.5, 5], [13.5, 3.8]] as const;
  for (let i = 0; i < gores; i++) {
    kit.moving.add(lathe(umbrella, 1, (i / gores) * Math.PI * 2, (Math.PI * 2) / gores), i % 2 ? 0xf7efe0 : kit.festive[i % kit.festive.length], new THREE.Matrix4().makeTranslation(x, 25, z), spin);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    kit.moving.add(cone(0.7, 4, 4), gold, new THREE.Matrix4().makeTranslation(x + Math.cos(a) * 2.6, 35, z + Math.sin(a) * 2.6), spin);
  }
  kit.lamp(new THREE.OctahedronGeometry(1.8), [x, 41, z], kit.palette.accent, 12, spin, { depth: 0.4, freq: 2, phase: 1 });
  kit.moving.add(prism(5, 5, 2.4, 10), gold, new THREE.Matrix4().makeTranslation(x, armY - 1.2, z), spin);
  for (let i = 0; i < CAROUSEL.arms; i++) {
    const a = (i / CAROUSEL.arms) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const root: V3 = [x + c * 4.5, armY, z + sn * 4.5];
    const tip: V3 = [x + c * reach, armY + 3, z + sn * reach];
    const motion: Motion = { ...spin, pivot: root, axisB: [-sn, 0, c], swingB: CAROUSEL.tilt, freq: CAROUSEL.tiltFreq, phase: i * (Math.PI / 2) };
    const color = kit.festive[i % kit.festive.length];
    kit.moving.add(beam(root, tip, 0.5, 4), gold, undefined, motion);
    kit.moving.add(ball(1, 7, 4), color, new THREE.Matrix4().compose(new THREE.Vector3(tip[0], tip[1] - 2, tip[2]), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a), new THREE.Vector3(3, 1.8, 4.2)), motion);
    kit.moving.add(cone(1.6, 2.2, 5), shade(color, 0.7), new THREE.Matrix4().makeTranslation(tip[0], tip[1] - 0.4, tip[2]), motion);
    for (const side of [-0.7, 0.7]) rider(kit.moving, new THREE.Matrix4().makeTranslation(tip[0] - sn * side, tip[1] - 0.9, tip[2] + c * side), kit.festiveColor(), motion);
    for (let k = 1; k <= 4; k++) {
      const t = k / 5;
      kit.lamp(new THREE.OctahedronGeometry(BULB), [root[0] + (tip[0] - root[0]) * t, root[1] + (tip[1] - root[1]) * t + 0.6, root[2] + (tip[2] - root[2]) * t], kit.lamps[(i + k) % kit.lamps.length], 1.5, motion, { depth: 0.6, freq: 6, phase: k + i, sharp: 2 });
    }
  }
}

function swingTower(kit: Kit): void {
  const { x, z, height, rim, chain, lean } = SWING;
  const s = kit.solid;
  s.add(prism(4, 2.2, height, 8), mix(0xf2efe6, kit.palette.accent, 0.3), new THREE.Matrix4().makeTranslation(x, 0, z));
  for (let i = 0; i < 12; i++) {
    kit.lamp(new THREE.OctahedronGeometry(BULB * 1.3), [x, 6 + i * 4.8, z - 3.4 + i * 0.1], kit.lamps[i % kit.lamps.length], 2, undefined, { depth: 0.9, freq: 3, phase: -i * 0.5, sharp: 4 });
  }
  s.add(cone(4.5, 7, 8), kit.festiveColor(), new THREE.Matrix4().makeTranslation(x, height, z));
  kit.lamp(new THREE.OctahedronGeometry(1.5), [x, height + 9, z], 0xff4040, 8, undefined, { depth: 0.8, freq: 2, phase: 0, sharp: 6 });
  const ride: Motion = { hub: [x, 0, z], axisA: [0, 1, 0], spinA: SWING.spin, drift: [0, SWING.rideRange, 0], driftFreq: 0.2 };
  const y = SWING.rideY;
  const gores = 16;
  const roof = [[2.5, 4.5], [rim + 1.5, 0], [rim + 1.5, -1]] as const;
  for (let i = 0; i < gores; i++) kit.moving.add(lathe(roof, 1, (i / gores) * Math.PI * 2, (Math.PI * 2) / gores), i % 2 ? 0xf7efe0 : 0xe8443a, new THREE.Matrix4().makeTranslation(x, y, z), ride);
  for (let i = 0; i < SWING.chairs; i++) {
    const a = (i / SWING.chairs) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const top: V3 = [x + c * rim, y - 1, z + sn * rim];
    const out = rim + Math.sin(lean) * chain;
    const seat: V3 = [x + c * out, y - 1 - Math.cos(lean) * chain, z + sn * out];
    kit.moving.add(beam(top, seat, 0.06, 3), 0x333333, undefined, ride);
    kit.moving.add(box(0.9, 0.3, 0.9), kit.festiveColor(), new THREE.Matrix4().makeTranslation(seat[0], seat[1] - 0.3, seat[2]), ride);
    rider(kit.moving, T3(seat[0], seat[1], seat[2], -a, lean), kit.festiveColor(), ride);
    kit.lamp(new THREE.OctahedronGeometry(BULB), [x + c * (rim + 1.5), y - 0.6, z + sn * (rim + 1.5)], kit.lamps[i % kit.lamps.length], 1.6, ride, { depth: 0.6, freq: 8, phase: i, sharp: 2 });
  }
}

function T3(x: number, y: number, z: number, ry: number, rz: number): THREE.Matrix4 {
  return new Frame(x, y, z, ry).m(0, 0, 0, 0, 0, rz);
}

function pendulum(kit: Kit): void {
  const { x, z, pivotY, arm } = PENDULUM;
  const pivot: V3 = [x, pivotY, z];
  const steel = shade(kit.palette.accent, 0.8);
  for (const dz of [-7, 7]) {
    for (const dx of [-16, 16]) kit.solid.add(beam([x + dx, 0, z + dz], [x, pivotY + 2, z + dz * 0.5], 0.8, 4), steel);
  }
  const g: V3 = [x, pivotY - arm, z];
  const swing: Motion = { hub: pivot, axisA: [0, 0, 1], swingA: PENDULUM.swing, freq: PENDULUM.freq };
  kit.moving.add(beam(pivot, [g[0], g[1] + 2, g[2]], 1, 4), 0xf2efe6, undefined, swing);
  kit.moving.add(box(4, 6, 4).translate(0, -3, 0), shade(steel, 0.7), new THREE.Matrix4().makeTranslation(x, pivotY + 6, z), swing);
  const ring: Motion = { ...swing, pivot: g, axisB: [0, 1, 0], spinB: PENDULUM.spin };
  kit.moving.add(prism(6, 6, 1.6, 12), 0xf4d03f, new THREE.Matrix4().makeTranslation(g[0], g[1] - 0.8, g[2]), ring);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rider(kit.moving, new Frame(g[0] + Math.cos(a) * 5.2, g[1] + 0.8, g[2] + Math.sin(a) * 5.2, -a).m(), kit.festiveColor(), ring);
    kit.lamp(new THREE.OctahedronGeometry(BULB), [g[0] + Math.cos(a) * 6.3, g[1] - 0.8, g[2] + Math.sin(a) * 6.3], kit.lamps[i % kit.lamps.length], 1.8, ring, { depth: 0.6, freq: 7, phase: i, sharp: 2 });
  }
}

function coasterLoop(kit: Kit): void {
  const { x, z, r } = LOOP;
  const cy = r + 3;
  const rail = 0xe8443a;
  const n = 24;
  const at = (a: number, dz: number): V3 => [x + Math.cos(a) * r, cy + Math.sin(a) * r, z + dz];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    for (const dz of [-1.2, 1.2]) kit.solid.add(beam(at(a0, dz), at(a1, dz), 0.3, 3), rail);
    if (i % 3 === 0) kit.lamp(new THREE.OctahedronGeometry(BULB), at(a0, -1.9), kit.lamps[i % kit.lamps.length], 1.5, undefined, { depth: 0.8, freq: 6, phase: -i * 0.8, sharp: 3 });
  }
  for (const dx of [-0.6, 0.6]) kit.solid.add(beam([x + dx * r, 0, z], [x + dx * r * 0.9, cy - r * 0.6, z], 0.5, 4), 0xf2efe6);
  for (const dz of [-1.2, 1.2]) kit.solid.add(beam([x - 60, 3, z + dz], [x + 60, 3, z + dz], 0.3, 3), rail);
  const train: Motion = { hub: [x, cy, z], axisA: [0, 0, 1], spinA: LOOP.spin };
  for (let i = 0; i < LOOP.cars; i++) {
    const a = -Math.PI / 2 + i * 0.32;
    const p = at(a, 0);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a + Math.PI / 2), new THREE.Vector3(1, 1, 1));
    kit.moving.add(box(4.6, 1.4, 2.6), i === 0 ? 0xf4d03f : 0x2f8fd8, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.3, 0)), train);
    for (const side of [-0.6, 0.6]) rider(kit.moving, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.6, side)), kit.festiveColor(), train);
  }
}

function tent(kit: Kit, x: number, z: number, r: number): void {
  const gores = 14;
  const profile = [[r, 0], [r, r * 0.4], [r * 0.15, r * 1.05], [0.05, r * 1.15]] as const;
  const a = kit.festiveColor();
  for (let i = 0; i < gores; i++) kit.solid.add(lathe(profile, 1, (i / gores) * Math.PI * 2, (Math.PI * 2) / gores), i % 2 ? 0xf7efe0 : a, new THREE.Matrix4().makeTranslation(x, 0, z));
  const top: V3 = [x, r * 1.15, z];
  kit.solid.add(beam(top, [x, r * 1.15 + 5, z], 0.15, 3), 0x3a2a20);
  kit.moving.add(quadPts([x, top[1] + 5, z], [x + 3.4, top[1] + 4.3, z], [x + 3.4, top[1] + 3.2, z], [x, top[1] + 3.6, z]), kit.festiveColor(), undefined, { pivot: top, axisB: [0, 1, 0], swingB: 0.5, freq: 2.2, phase: x });
  // Door flap toward the track.
  kit.solid.add(quadPts([x - 2.4, 0.05, z - r - 0.05], [x + 2.4, 0.05, z - r - 0.05], [x + 1.4, r * 0.38, z - r - 0.05], [x - 1.4, r * 0.38, z - r - 0.05]), 0x2a1a14);
}

/** Game and snack booths ringing the midway, each with a striped awning and lit counter. */
function booth(kit: Kit, i: number): void {
  const { rng } = kit;
  const a = -Math.PI * 0.95 + (i / (BOOTHS.high - 1)) * Math.PI * 0.9 + (rng() - 0.5) * 0.08;
  const f = new Frame(Math.cos(a) * 64, 0, 4 + Math.sin(a) * 52, Math.PI / 2 - a);
  const color = kit.festiveColor();
  kit.solid.add(box(6, 2.6, 4), shade(color, 0.75), f.m(0, 0, 1));
  kit.solid.add(box(6.4, 1.1, 0.8), 0xf7efe0, f.m(0, 0, -1.4));
  stripedAwning(kit.moving, f, 7, [3.6, 1.6], [2.8, -2.8], 6, color, 0xf7efe0, { amp: 0.04, freq: 3, phase: i });
  for (let k = 0; k < 4; k++) kit.lamp(new THREE.OctahedronGeometry(BULB), f.p(-2.4 + k * 1.6, 2.45, -2.9), kit.lamps[(i + k) % kit.lamps.length], 1.4, undefined, { depth: 0.8, freq: 5, phase: k + i, sharp: 3 });
  kit.solid.add(ball(0.5, 5, 3), kit.festiveColor(), f.m(-1.5, 1.6, -1.4));
  kit.solid.add(ball(0.5, 5, 3), kit.festiveColor(), f.m(1.2, 1.6, -1.4));
}

function gate(kit: Kit): void {
  const s = kit.solid;
  const colA = kit.festiveColor();
  for (const dx of [-14, 14]) {
    s.add(prism(1.6, 1.3, 18, 6), colA, new THREE.Matrix4().makeTranslation(dx, 0, GATE_Z));
    s.add(ball(2.2, 8, 5), 0xe0b040, new THREE.Matrix4().makeTranslation(dx, 19.5, GATE_Z));
  }
  s.add(box(34, 6, 1.2), shade(colA, 0.5), new THREE.Matrix4().makeTranslation(0, 16, GATE_Z));
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    kit.lamp(new THREE.OctahedronGeometry(0.45), [-16 + 32 * t, 16.4 + (i % 2) * 5, GATE_Z - 0.8], kit.lamps[i % kit.lamps.length], 2.2, undefined, { depth: 0.9, freq: 6, phase: -i * 0.7, sharp: 3 });
  }
  // A star sign: three bold diamonds.
  for (const dx of [-7, 0, 7]) kit.lamp(new THREE.OctahedronGeometry(1.8).scale(1, 1.3, 0.3), [dx, 19, GATE_Z - 1], kit.festiveColor(), 7, undefined, { depth: 0.5, freq: 2, phase: dx });
}

export function createFair(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const { rng } = kit;
  kit.solid.add(prism(125, 125, 0.3, 24).scale(1, 1, 0.75), mix(kit.palette.sand, 0xc8b490, 0.18), new THREE.Matrix4().makeTranslation(0, -0.15, 5));
  for (let i = 0; i < kit.q(BOOTHS.high, BOOTHS.low); i++) booth(kit, i);
  ferrisWheel(kit);
  carousel(kit);
  swingTower(kit);
  pendulum(kit);
  coasterLoop(kit);
  for (const t of TENTS) tent(kit, t.x, t.z, t.r);
  gate(kit);

  // Light strings radiating from the carousel crown and the swing tower, plus a ring of poles.
  const poles: V3[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    poles.push([Math.cos(a) * 118, 9, 5 + Math.sin(a) * 84]);
  }
  for (const p of poles) kit.solid.add(beam([p[0], 0, p[2]], p, 0.18, 4), 0x4a3020);
  for (let i = 0; i < poles.length; i++) {
    const next = poles[(i + 1) % poles.length];
    if (i % 2) lampString(kit, poles[i], next, 3, kit.q(10, 5), 0.24, 1.8);
    else bunting(kit, poles[i], next, 3.5, kit.q(12, 6), 1.1);
  }
  for (let i = 0; i < 8; i++) {
    const p = poles[(i * 2 + 9) % poles.length];
    lampString(kit, [CAROUSEL.x, 37, CAROUSEL.z], [p[0] * 0.55, 8, p[2] * 0.55], 2, kit.q(14, 7), 0.26, 1.8);
  }
  for (const p of [poles[1], poles[2], poles[3]]) lampString(kit, [SWING.x, SWING.height - 2, SWING.z], [p[0], p[1], p[2]], 3, kit.q(16, 8), 0.26, 1.8);

  // Fireworks: each burst loops on its own period and jumps to a new spot every time.
  const fireworks = kit.particles(true, 1.6);
  for (let b = 0; b < kit.q(FIREWORK_BURSTS.high, FIREWORK_BURSTS.low); b++) {
    const origin: V3 = [(rng() - 0.5) * 160, 100 + rng() * 50, 30 + (rng() - 0.5) * 80];
    const period = 4.5 + rng() * 3;
    const phase = rng() * period;
    const colA = pick(rng, kit.lamps);
    const colB = pick(rng, kit.festive);
    const speed = 22 + rng() * 10;
    for (let i = 0; i < kit.q(FIREWORK_SPARKS.high, FIREWORK_SPARKS.low); i++) {
      const d = sphereDir(rng);
      fireworks.add(origin, [d[0] * speed, d[1] * speed, d[2] * speed], i % 3 ? colA : colB, 3.2, { period, lifetime: 2.2, phase }, { gravity: 7, drag: 1.4, jitter: 70, fadeIn: 0.02 });
    }
  }

  // The crowd: strolling between rides, queueing, and cheering at the carousel.
  for (let i = 0; i < kit.q(CROWD.high, CROWD.low); i++) {
    const a = rng() * Math.PI * 2;
    const r = 28 + rng() * 80;
    const x = Math.cos(a) * r * 1.1;
    const z = 5 + Math.sin(a) * r * 0.75;
    const cheering = rng() < 0.25;
    kit.crowd({
      x,
      y: 0,
      z,
      ry: rng() * Math.PI * 2,
      color: vary(rng, kit.festiveColor(), 0.2),
      hop: cheering ? 0.45 : 0.12,
      freq: cheering ? 6 + rng() * 2 : 7 + rng() * 2,
      phase: rng() * 100,
      sharp: cheering ? 2 : 1,
      raise: cheering ? 0.8 : 0,
      walk: cheering ? 0 : 2 + rng() * 6,
      walkFreq: 0.15 + rng() * 0.1,
    });
  }
  return kit.finish(RADIUS);
}
