// The pier: a long amusement pier on stilts striding out to sea. A lit arch on the beach, a
// boardwalk lined with food stalls and lamp posts, and out on the end platform a ferris wheel
// facing the track, a spinning wave-swinger, a coaster loop with a train, flags and crowds.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import type { Bucket } from '../b/bucket.ts';
import type { Motion, V3 } from '../b/motion.ts';
import { Frame, T, beam, box, cone, lathe, mix, prism, shade, vary } from '../b/shapes.ts';
import { bunting, lampString, stripedAwning } from '../b/props.ts';
import { DARK, RED_LIGHT, WHITE, finishCoast, foamRing } from './kit.ts';

const SALT = 0x91e7;
const RADIUS = 165;
const SEA_FLOOR = -5;
const DECK_Y = 7;
const DECK_T = 0.8;
const NECK = { w: 24, z0: -160, z1: 42 } as const;
const PLAT = { x0: -58, x1: 58, z0: 42, z1: 150 } as const;
const STILT_STEP = 13;
const WHEEL = { x: -26, z: 116, r: 34, spokes: 14, spin: 0.16 } as const;
const SWING = { x: 34, z: 122, h: 30, rim: 6.5, chain: 8, chairs: 14, spin: 1.3, lean: 0.85 } as const;
/** A drop tower: the ring of seats rests at the base, then rides the full height and back. */
const DROP = { x: -46, z: 58, h: 62, ring: 4.2, rise: 46, freq: 0.42 } as const;
const LOOP = { x: 22, z: 66, r: 12, cars: 4, spin: 1.9 } as const;
const STALLS = { high: 8, low: 5 } as const;
const CROWD = { high: 300, low: 120 } as const;
const BULB = 0.3;
const WOOD = 0x9a7450;

function rider(b: Bucket, m: THREE.Matrix4, color: THREE.ColorRepresentation, motion: Motion): void {
  b.add(box(0.6, 0.8, 0.5), color, m, motion);
  b.add(new THREE.OctahedronGeometry(0.25), 0xc08a62, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.05, 0)), motion);
}

function deck(kit: Kit): void {
  const wood = vary(kit.rng, WOOD, 0.05);
  const under = shade(wood, 0.55);
  kit.solid.add(box(NECK.w, DECK_T, NECK.z1 - NECK.z0), wood, T(0, DECK_Y - DECK_T, (NECK.z0 + NECK.z1) / 2));
  kit.solid.add(box(PLAT.x1 - PLAT.x0, DECK_T, PLAT.z1 - PLAT.z0), wood, T((PLAT.x0 + PLAT.x1) / 2, DECK_Y - DECK_T, (PLAT.z0 + PLAT.z1) / 2));
  // Stilts with cross braces: the deck stands on a forest of legs.
  const stilt = (x: number, z: number): void => {
    const foot = z < -110 ? 0 : SEA_FLOOR;
    kit.solid.add(beam([x, foot, z], [x, DECK_Y - DECK_T, z], 0.45, 4), under);
  };
  for (let z = NECK.z0 + 6; z < NECK.z1; z += STILT_STEP) {
    for (const x of [-NECK.w / 2 + 1, NECK.w / 2 - 1]) stilt(x, z);
    kit.solid.add(beam([-NECK.w / 2 + 1, 1, z], [NECK.w / 2 - 1, DECK_Y - 1.5, z], 0.2, 3), under);
  }
  for (let x = PLAT.x0 + 2; x <= PLAT.x1 - 2; x += STILT_STEP) {
    for (let z = PLAT.z0 + 4; z <= PLAT.z1 - 2; z += STILT_STEP * 1.6) stilt(x, z);
  }
  // Railings: a white top rail along both sides of the neck and round the platform.
  const rail = (a: V3, b: V3): void => kit.solid.add(beam(a, b, 0.18, 3), WHITE);
  const ry = DECK_Y + 1.2;
  rail([-NECK.w / 2, ry, NECK.z0], [-NECK.w / 2, ry, NECK.z1]);
  rail([NECK.w / 2, ry, NECK.z0], [NECK.w / 2, ry, NECK.z1]);
  const corners: V3[] = [[PLAT.x0, ry, PLAT.z0], [PLAT.x0, ry, PLAT.z1], [PLAT.x1, ry, PLAT.z1], [PLAT.x1, ry, PLAT.z0]];
  for (let i = 0; i < 3; i++) rail(corners[i], corners[i + 1]);
  rail([PLAT.x0, ry, PLAT.z0], [-NECK.w / 2, ry, PLAT.z0]);
  rail([NECK.w / 2, ry, PLAT.z0], [PLAT.x1, ry, PLAT.z0]);
}

function gateArch(kit: Kit): void {
  const z = NECK.z0 + 4;
  const col = kit.palette.accent;
  for (const x of [-NECK.w / 2, NECK.w / 2]) {
    kit.solid.add(prism(1.4, 1.1, 16, 6), WHITE, T(x, DECK_Y, z));
    kit.solid.add(cone(1.9, 3.5, 6), col, T(x, DECK_Y + 16, z));
  }
  kit.solid.add(box(NECK.w + 2, 4.5, 1), shade(col, 0.55), T(0, DECK_Y + 10, z));
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    kit.lamp(new THREE.OctahedronGeometry(0.42), [-NECK.w / 2 + NECK.w * t, DECK_Y + 10.4 + (i % 2) * 3.6, z - 0.7], kit.lamps[i % kit.lamps.length], 2, undefined, { depth: 0.9, freq: 6, phase: -i * 0.7, sharp: 3 });
  }
  // A sunburst sign in the middle of the arch.
  kit.lamp(new THREE.CircleGeometry(2.6, 10), [0, DECK_Y + 12.4, z - 0.8], 0xffc040, 8, undefined, { depth: 0.3, freq: 2, phase: 0 });
}

function stalls(kit: Kit): void {
  const n = kit.q(STALLS.high, STALLS.low);
  for (let i = 0; i < n; i++) {
    for (const side of [-1, 1]) {
      const z = NECK.z0 + 24 + (i * (NECK.z1 - NECK.z0 - 40)) / n;
      const f = new Frame(side * (NECK.w / 2 - 2.6), DECK_Y, z, (side * Math.PI) / 2);
      const color = kit.festiveColor();
      kit.solid.add(box(5.5, 2.8, 3.6), shade(color, 0.75), f.m(0, 0, 0.6));
      kit.solid.add(box(5.8, 1.1, 0.7), WHITE, f.m(0, 0, -1.4));
      stripedAwning(kit.moving, f, 6.4, [3.6, 1.9], [2.7, -2.6], 6, color, WHITE, { amp: 0.04, freq: 3, phase: i + side });
      for (let k = 0; k < 3; k++) kit.lamp(new THREE.OctahedronGeometry(BULB), f.p(-2 + k * 2, 2.5, -2.7), kit.lamps[(i + k) % kit.lamps.length], 1.4, undefined, { depth: 0.8, freq: 5, phase: k + i, sharp: 3 });
    }
  }
  // Lamp posts with strings of bulbs looping between them, both sides of the boardwalk.
  for (const side of [-1, 1]) {
    let prev: V3 | undefined;
    for (let z = NECK.z0 + 10; z <= NECK.z1 + 2; z += 24) {
      const top: V3 = [side * (NECK.w / 2 - 0.4), DECK_Y + 7, z];
      kit.solid.add(beam([top[0], DECK_Y, z], top, 0.15, 4), DARK);
      kit.lamp(new THREE.OctahedronGeometry(0.5), [top[0], top[1] + 0.5, z], 0xfff0c0, 3, undefined, { depth: 0.1, freq: 1, phase: z });
      if (prev) lampString(kit, prev, top, 1.6, kit.q(7, 4), 0.2, 1.4);
      prev = top;
    }
  }
}

function ferrisWheel(kit: Kit): void {
  const { x, z, r } = WHEEL;
  const hubY = DECK_Y + r + 5;
  const hub: V3 = [x, hubY, z];
  const spin: Motion = { hub, axisA: [0, 0, 1], spinA: WHEEL.spin };
  const steel = mix(WHITE, kit.palette.accent, 0.2);
  const rimPt = (a: number, dz: number): V3 => [x + Math.cos(a) * r, hubY + Math.sin(a) * r, z + dz];
  for (const dz of [-5, 5]) for (const dx of [-14, 14]) kit.solid.add(beam([x + dx, DECK_Y, z + dz * 1.3], [x, hubY, z + dz * 0.4], 0.6, 4), shade(steel, 0.8));
  kit.solid.add(prism(2, 2, 5, 8).rotateX(Math.PI / 2).translate(x, hubY, z + 2.5), shade(steel, 0.6));
  const n = WHEEL.spokes * 2;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    for (const dz of [-2, 2]) kit.moving.add(beam(rimPt(a0, dz), rimPt(a1, dz), 0.3, 3), steel, undefined, spin);
    if (i % 2 === 0) for (const dz of [-2, 2]) kit.moving.add(beam([x, hubY, z + dz * 0.5], rimPt(a0, dz), 0.16, 3), steel, undefined, spin);
    kit.lamp(new THREE.OctahedronGeometry(BULB * 1.3), rimPt(a0, -2.5), kit.lamps[i % kit.lamps.length], 2, spin, { depth: 0.6, freq: 3, phase: -i * 0.5, sharp: 2 });
  }
  for (let i = 0; i < WHEEL.spokes; i++) {
    const a = (i / WHEEL.spokes) * Math.PI * 2;
    const pivot = rimPt(a, 0);
    const motion: Motion = { hub, axisA: [0, 0, 1], spinA: WHEEL.spin, pivot, upright: true, axisB: [0, 0, 1], swingB: 0.1, freq: 1.3, phase: i };
    const color = kit.festiveColor();
    const m = new THREE.Matrix4().makeTranslation(pivot[0], pivot[1] - 4.2, pivot[2]);
    kit.moving.add(beam(pivot, [pivot[0], pivot[1] - 1.5, pivot[2]], 0.1, 3), DARK, undefined, motion);
    kit.moving.add(prism(1.5, 1.7, 2.6, 6), color, m, motion);
    kit.moving.add(cone(2, 1.2, 6), shade(color, 0.7), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 2.6, 0)), motion);
  }
  kit.lamp(new THREE.OctahedronGeometry(1.3), [x, hubY, z - 3.2], kit.palette.accent, 8, spin, { depth: 0.4, freq: 1.5, phase: 0 });
}

function waveSwinger(kit: Kit): void {
  const { x, z, h, rim, chain, lean } = SWING;
  kit.solid.add(prism(2.6, 1.6, h, 8), mix(WHITE, kit.palette.accent, 0.35), T(x, DECK_Y, z));
  kit.solid.add(prism(6, 6, 1, 12), shade(kit.palette.accent, 0.6), T(x, DECK_Y, z));
  const hub: V3 = [x, 0, z];
  // The crown spins and tilts like a wobbling plate: the "wave" in wave-swinger.
  const top: V3 = [x, DECK_Y + h - 6, z];
  const ride: Motion = { hub, axisA: [0, 1, 0], spinA: SWING.spin, pivot: top, axisB: [1, 0, 0], swingB: 0.16, freq: 0.7 };
  const gores = 14;
  const roof = [[2, 5], [rim + 1.4, 0], [rim + 1.4, -1]] as const;
  for (let i = 0; i < gores; i++) kit.moving.add(lathe(roof, 1, (i / gores) * Math.PI * 2, (Math.PI * 2) / gores), i % 2 ? WHITE : kit.festive[i % kit.festive.length], T(top[0], top[1], top[2]), ride);
  kit.lamp(new THREE.OctahedronGeometry(1.1), [x, top[1] + 6, z], kit.palette.accent, 6, ride, { depth: 0.6, freq: 3, phase: 0 });
  for (let i = 0; i < SWING.chairs; i++) {
    const a = (i / SWING.chairs) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const anchor: V3 = [x + c * rim, top[1] - 1, z + sn * rim];
    const out = rim + Math.sin(lean) * chain;
    const seat: V3 = [x + c * out, top[1] - 1 - Math.cos(lean) * chain, z + sn * out];
    kit.moving.add(beam(anchor, seat, 0.06, 3), DARK, undefined, ride);
    kit.moving.add(box(0.9, 0.3, 0.9), kit.festiveColor(), T(seat[0], seat[1] - 0.3, seat[2]), ride);
    rider(kit.moving, new Frame(seat[0], seat[1], seat[2], -a).m(0, 0, 0, 0, 0, lean), kit.festiveColor(), ride);
    kit.lamp(new THREE.OctahedronGeometry(BULB), [x + c * (rim + 1.4), top[1] - 0.6, z + sn * (rim + 1.4)], kit.lamps[i % kit.lamps.length], 1.6, ride, { depth: 0.6, freq: 8, phase: i, sharp: 2 });
  }
}

function coaster(kit: Kit): void {
  const { x, z, r } = LOOP;
  const cy = DECK_Y + r + 3;
  const rail = 0x2f8fd8;
  const n = 22;
  const at = (a: number, dz: number): V3 => [x + Math.cos(a) * r, cy + Math.sin(a) * r, z + dz];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    for (const dz of [-1.1, 1.1]) kit.solid.add(beam(at(a0, dz), at(a1, dz), 0.28, 3), rail);
    if (i % 2 === 0) kit.lamp(new THREE.OctahedronGeometry(BULB), at(a0, -1.8), kit.lamps[i % kit.lamps.length], 1.5, undefined, { depth: 0.8, freq: 6, phase: -i * 0.8, sharp: 3 });
  }
  for (const dx of [-0.6, 0.6]) kit.solid.add(beam([x + dx * r, DECK_Y, z], [x + dx * r * 0.9, cy - r * 0.6, z], 0.45, 4), WHITE);
  // Run-in and run-out track along the platform edge.
  for (const dz of [-1.1, 1.1]) kit.solid.add(beam([PLAT.x0 + 30, cy - r, z + dz], [PLAT.x1 - 2, cy - r, z + dz], 0.28, 3), rail);
  const train: Motion = { hub: [x, cy, z], axisA: [0, 0, 1], spinA: LOOP.spin };
  for (let i = 0; i < LOOP.cars; i++) {
    const a = -Math.PI / 2 + i * 0.34;
    const p = at(a, 0);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a + Math.PI / 2), new THREE.Vector3(1, 1, 1));
    kit.moving.add(box(4.2, 1.3, 2.5), i === 0 ? 0xe8443a : 0xf4d03f, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.3, 0)), train);
    for (const side of [-0.6, 0.6]) rider(kit.moving, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.5, side)), kit.festiveColor(), train);
  }
}

function dropTower(kit: Kit): void {
  const { x, z, h, ring } = DROP;
  kit.solid.add(prism(2.2, 1.6, h, 8), WHITE, T(x, DECK_Y, z));
  kit.solid.add(prism(3.4, 3.4, 4, 8), kit.palette.accent, T(x, DECK_Y + h, z));
  kit.lamp(new THREE.OctahedronGeometry(0.8), [x, DECK_Y + h + 5.2, z], RED_LIGHT, 5, undefined, { depth: 0.9, freq: 2, phase: 0, sharp: 6 });
  kit.solid.add(beam([x, DECK_Y + h + 4, z], [x, DECK_Y + h + 5, z], 0.12, 3), DARK);
  for (let i = 0; i < 14; i++) kit.lamp(new THREE.OctahedronGeometry(BULB * 1.2), [x, DECK_Y + 6 + i * 4, z - 2.3], kit.lamps[i % kit.lamps.length], 1.8, undefined, { depth: 0.9, freq: 4, phase: i * 0.6, sharp: 4 });
  // The hop pulse is zero half the time (boarding) and peaks at the top of the tower.
  const lift: Motion = { hop: DROP.rise, freq: DROP.freq, phase: 0 };
  const y = DECK_Y + 2;
  kit.moving.add(prism(ring, ring, 2.2, 10), 0xf4d03f, T(x, y, z), lift);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    rider(kit.moving, new Frame(x + Math.cos(a) * (ring + 0.4), y + 0.6, z + Math.sin(a) * (ring + 0.4), -a + Math.PI / 2).m(), kit.festiveColor(), lift);
    kit.lamp(new THREE.OctahedronGeometry(BULB), [x + Math.cos(a) * (ring + 0.1), y - 0.2, z + Math.sin(a) * (ring + 0.1)], kit.lamps[i % kit.lamps.length], 1.5, lift, { depth: 0.5, freq: 6, phase: i, sharp: 2 });
  }
}

function flagsAndPeople(kit: Kit): void {
  const { rng } = kit;
  const fy = DECK_Y + 9;
  const poles: V3[] = [[PLAT.x0 + 1, fy, PLAT.z0 + 1], [PLAT.x0 + 1, fy, PLAT.z1 - 1], [PLAT.x1 - 1, fy, PLAT.z1 - 1], [PLAT.x1 - 1, fy, PLAT.z0 + 1]];
  for (const p of poles) kit.solid.add(beam([p[0], DECK_Y, p[2]], p, 0.16, 4), DARK);
  for (let i = 0; i < 4; i++) {
    const a = poles[i];
    const b = poles[(i + 1) % 4];
    if (i % 2) bunting(kit, a, b, 2.5, kit.q(16, 8), 1.2);
    else lampString(kit, a, b, 2, kit.q(16, 8), 0.24, 1.6);
  }
  for (const p of poles) bunting(kit, p, [WHEEL.x, DECK_Y + WHEEL.r * 2 + 4, WHEEL.z], 3, kit.q(10, 5), 1.1);
  const n = kit.q(CROWD.high, CROWD.low);
  for (let i = 0; i < n; i++) {
    const onNeck = i < n * 0.45;
    const x = onNeck ? (rng() - 0.5) * (NECK.w - 10) : PLAT.x0 + 4 + rng() * (PLAT.x1 - PLAT.x0 - 8);
    const z = onNeck ? NECK.z0 + 12 + rng() * (NECK.z1 - NECK.z0 - 12) : PLAT.z0 + 4 + rng() * (PLAT.z1 - PLAT.z0 - 8);
    const queue = !onNeck && rng() < 0.3;
    kit.crowd({
      x, y: DECK_Y, z,
      ry: onNeck ? (rng() < 0.5 ? 0 : Math.PI) : rng() * Math.PI * 2,
      color: vary(rng, kit.festiveColor(), 0.2),
      hop: queue ? 0.35 : 0.1, freq: queue ? 6 : 7 + rng() * 2, phase: rng() * 100,
      sharp: queue ? 2 : 1, raise: queue ? 0.7 : 0,
      walk: onNeck ? 3 + rng() * 9 : queue ? 0 : 1 + rng() * 3, walkFreq: 0.12 + rng() * 0.1,
    });
  }
}

export function createPier(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  deck(kit);
  gateArch(kit);
  stalls(kit);
  ferrisWheel(kit);
  waveSwinger(kit);
  coaster(kit);
  dropTower(kit);
  flagsAndPeople(kit);
  // Surf curling round the outermost stilts.
  for (const [x, z] of [[PLAT.x0, PLAT.z1], [PLAT.x1, PLAT.z1], [0, PLAT.z1 + 4]] as const) foamRing(kit, [x, 0.12, z], 5, kit.q(8, 5), 1.6, 1.2, 0.8);
  return finishCoast(kit, RADIUS);
}
