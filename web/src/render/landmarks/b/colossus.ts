// The colossus: the ruin of a gigantic robed guardian, sunk to the waist and leaning, one
// arm still raised to a broken elbow. Its crowned head lies toppled on its cheek facing the
// track, eyes faintly alight; a fallen hand lies palm-up in a dig. Scaffolding climbs the
// chest, a tower crane slews over the site, tiny archaeologists work under lamps and dust
// motes drift in the light.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from './kit.ts';
import type { Motion, V3 } from './motion.ts';
import { T, ball, beam, box, cone, dome, lathe, mix, prism, shade, vary } from './shapes.ts';

const SALT = 0xc0105;
const RADIUS = 125;
/** The torso's base transform: where it sinks into the sand and how it leans. */
const TORSO = { x: 8, y: -10, z: 34, yaw: 0.25, pitch: -0.08, roll: 0.12 } as const;
const ROBE: readonly (readonly [number, number])[] = [
  [36, 0],
  [31, 22],
  [27, 42],
  [25, 58],
  [29, 70],
  [24, 78],
  [9, 84],
];
const HEAD = { x: -78, y: 11, z: -30, scale: 1.5 } as const;
const HAND = { x: 72, z: -18 } as const;
const CRANE = { x: 52, z: 52, height: 96, jib: 62, counter: 22, slew: 0.75, slewFreq: 0.11 } as const;
const SCAFFOLD = { levels: 9, levelHeight: 6.5, bays: 7, bay: 6.5, z: 0 } as const;
const CROWD = { high: 140, low: 60 } as const;
const ROBE_FOLDS = 10;
const MOTES = { high: 260, low: 110 } as const;

function torso(kit: Kit, stone: THREE.Color, patina: THREE.Color, gold: THREE.Color): void {
  const base = T(TORSO.x, TORSO.y, TORSO.z, TORSO.yaw, TORSO.pitch, TORSO.roll);
  const at = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s: number | V3 = 1) => base.clone().multiply(T(x, y, z, ry, rx, rz, s));
  const s = kit.solid;
  s.add(lathe(ROBE, 16), stone, base);
  // Deep robe folds: ridges running down the drape.
  for (let i = 0; i < ROBE_FOLDS; i++) {
    const a = (i / ROBE_FOLDS) * Math.PI * 2 + 0.2;
    s.add(beam(toV3(at(Math.cos(a) * 35, 0, Math.sin(a) * 35)), toV3(at(Math.cos(a) * 25.5, 60, Math.sin(a) * 25.5)), 2.2, 3), shade(stone, 0.9));
  }
  // The empty hood behind the broken neck makes the robed silhouette from far off.
  s.add(dome(17, 10, 5), shade(stone, 0.92), at(0, 80, 7, 0, -1.25, 0, [1.05, 1.25, 1]));
  s.add(lathe([[30, 0], [35, 5], [21, 10]], 16), gold, at(0, 72, 0));
  s.add(box(36, 20, 8), patina, at(0, 52, -22, 0, 0.12));
  s.add(box(38, 2.4, 9), gold, at(0, 62, -22.5, 0, 0.12));
  // A patina sash across the chest and a gilded belt, both chipped.
  s.add(prism(27.5, 26.2, 5, 12, true), patina, at(0, 46, 0));
  s.add(box(10, 52, 3), shade(patina, 0.9), at(-4, 30, -24, 0, 0.12, -0.55));
  s.add(prism(30.5, 30.5, 3, 12, true), gold, at(0, 24, 0));
  // Shoulders, the broken neck and a carved chest emblem.
  for (const sx of [-1, 1]) s.add(ball(13, 10, 6), shade(stone, 1.06), at(sx * 24, 74, 0, 0, 0, 0, [1, 0.75, 1]));
  s.add(prism(11, 9, 8, 9), shade(stone, 0.95), at(0, 82, 0));
  s.add(cone(9.5, 6, 9), shade(stone, 0.8), at(0, 89.5, 0, 0.4, Math.PI, 0, [1, 0.5, 1]));
  s.add(new THREE.OctahedronGeometry(6), gold, at(0, 62, -26.5, 0, 0, 0, [1, 1.3, 0.35]));
  kit.lamp(new THREE.OctahedronGeometry(2.2).scale(1, 1.3, 0.4), toV3(at(0, 62, -28.5)), mix(kit.palette.accent, 0x7ae8ff, 0.4), 10, undefined, { depth: 0.6, freq: 0.8, phase: 0 });
  // The raised right arm: upper arm up and out, forearm snapped at the elbow.
  const shoulder: V3 = toV3(at(26, 72, 0));
  const elbow: V3 = toV3(at(44, 108, -6));
  s.add(beam(shoulder, elbow, 9, 8), stone);
  s.add(ball(9.5, 8, 5), shade(stone, 1.04), T(...elbow));
  s.add(beam(elbow, toV3(at(46, 120, -14)), 7.5, 8), stone);
  s.add(cone(7.8, 7, 8), shade(stone, 0.78), at(46.5, 123.5, -15.5, 0.3, 0.5, 0.2));
  s.add(prism(8.5, 8.5, 4, 8, true), gold, T(...toV3(at(45, 112, -9))).multiply(new THREE.Matrix4().makeRotationZ(-0.45)));
  // The left arm hangs into the sand.
  s.add(beam(toV3(at(-27, 72, 0)), toV3(at(-38, 20, -8)), 8.5, 8), shade(stone, 0.96));
}

function toV3(m: THREE.Matrix4): V3 {
  const v = new THREE.Vector3().setFromMatrixPosition(m);
  return [v.x, v.y, v.z];
}

/** The fallen head: a long crowned helm lying on its right cheek, face to the track. */
function head(kit: Kit, stone: THREE.Color, patina: THREE.Color, gold: THREE.Color): void {
  const base = T(HEAD.x, HEAD.y, HEAD.z, 0.2, 0, Math.PI / 2 - 0.12, HEAD.scale);
  const at = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s: number | V3 = 1) => base.clone().multiply(T(x, y, z, ry, rx, rz, s));
  const s = kit.solid;
  s.add(ball(10, 12, 8), stone, at(0, 0, 0, 0, 0, 0, [1, 1.4, 1.05]));
  s.add(box(15, 15, 3), patina, at(0, -9, -9.5, 0, 0.18));
  s.add(prism(1.6, 1, 9, 4), shade(stone, 1.1), at(0, -6, -12, Math.PI / 4, -0.15));
  s.add(box(13, 3, 2), shade(stone, 0.7), at(0, 2.5, -10.4));
  for (const ex of [-3.4, 3.4]) {
    kit.lamp(box(4.6, 0.9, 0.4), toV3(at(ex, 2.2, -11.6)), mix(kit.palette.accent, 0x7ae8ff, 0.5), 7, undefined, { depth: 0.55, freq: 0.6, phase: ex });
  }
  // The sun crown: a fan of gilded spikes over the brow, two of them snapped.
  const spikes = 11;
  for (let i = 0; i < spikes; i++) {
    const a = -1.25 + (i / (spikes - 1)) * 2.5;
    const len = i === 3 || i === 8 ? 6 : 14 + (i % 2) * 5;
    s.add(cone(1.8, len, 5), i % 2 ? gold : shade(gold, 0.85), at(Math.sin(a) * 9, 10 + Math.cos(a) * 9, 1, 0, 0, -a));
  }
  s.add(prism(9.5, 9.5, 3, 12, true), gold, at(0, 7, 0));
  s.add(prism(7, 6, 7, 9), shade(stone, 0.85), at(0, -19, 2));
}

/** The fallen hand, palm up, fingers curled, broken off at the wrist. */
function hand(kit: Kit, stone: THREE.Color, gold: THREE.Color): void {
  const base = T(HAND.x, 1, HAND.z, -0.6, 0, 0.08);
  const at = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => base.clone().multiply(T(x, y, z, ry, rx, rz));
  const s = kit.solid;
  s.add(box(18, 5, 20), stone, at(0, -1, 0));
  for (let f = 0; f < 4; f++) {
    let p: V3 = toV3(at(-6.6 + f * 4.4, 2.5, -10));
    let pitch = 0.3 + f * 0.08;
    for (let k = 0; k < 3; k++) {
      const len = 7 - k * 1.2;
      const next = toV3(at(-6.6 + f * 4.4, 2.5 + Math.sin(pitch) * len * (k + 1) * 0.8, -10 - Math.cos(pitch) * len * (k + 1) * 0.7));
      s.add(beam(p, next, 1.9 - k * 0.2, 6), k % 2 ? shade(stone, 0.95) : stone);
      p = next;
      pitch += 0.55;
    }
  }
  s.add(beam(toV3(at(9, 1, -2)), toV3(at(15, 6, -8)), 2.2, 6), stone);
  s.add(prism(10, 10, 4, 10, true), gold, at(0, -1, 12, 0, Math.PI / 2));
  s.add(cone(9, 6, 9), shade(stone, 0.78), at(0, -1, 15, 0, Math.PI / 2));
  // The dig round it.
  kit.solid.add(prism(1, 1, 0.3, 14).scale(28, 1, 26), shade(kit.palette.sand, 0.8), T(HAND.x, -0.25, HAND.z));
}

function scaffold(kit: Kit): void {
  const wood = 0x6a5038;
  const plank = 0x8a6a48;
  const x0 = TORSO.x - ((SCAFFOLD.bays - 1) * SCAFFOLD.bay) / 2 - 4;
  for (let b = 0; b < SCAFFOLD.bays; b++) {
    const x = x0 + b * SCAFFOLD.bay;
    // Bays further out stand forward of the robe's curve.
    const z = TORSO.z - 36 - Math.abs(b - (SCAFFOLD.bays - 1) / 2) * -2.4;
    const levels = SCAFFOLD.levels - Math.abs(b - 3);
    const top = levels * SCAFFOLD.levelHeight;
    for (const dz of [0, 3]) kit.solid.add(beam([x, 0, z + dz], [x, top, z + dz], 0.2, 3), wood);
    for (let l = 1; l <= levels; l++) {
      const y = l * SCAFFOLD.levelHeight;
      if (b < SCAFFOLD.bays - 1) {
        kit.solid.add(beam([x, y, z], [x + SCAFFOLD.bay, y, z + (b < 3 ? -2.4 : 2.4)], 0.14, 3), wood);
        kit.solid.add(box(SCAFFOLD.bay, 0.25, 3), plank, T(x + SCAFFOLD.bay / 2, y, z + 1.5, 0, 0, 0));
        if (l % 2 === b % 2) kit.solid.add(beam([x, y - SCAFFOLD.levelHeight, z], [x + SCAFFOLD.bay, y, z + (b < 3 ? -2.4 : 2.4)], 0.1, 3), wood);
      }
      if (l % 3 === 0 && b % 2 === 0) kit.lamp(box(1, 0.7, 0.4), [x + 0.6, y + 1.6, z - 0.4], 0xfff0c8, 4.5, undefined, { depth: 0.2, freq: 1.5, phase: b + l });
      if (kit.rng() < 0.35) kit.crowd({ x: x + 2 + kit.rng() * 2, y, z: z + 1.5, ry: Math.PI, color: kit.rng() < 0.5 ? 0xf2a33a : 0xf7efe0, hop: 0.08, freq: 3, phase: kit.rng() * 50, walk: 1.5, walkFreq: 0.2, scale: 0.9 });
    }
  }
}

function crane(kit: Kit): void {
  const { x, z, height, jib, counter } = CRANE;
  const yellow = 0xf2b830;
  const w = 2.2;
  const corners: readonly [number, number][] = [[-w, -w], [w, -w], [w, w], [-w, w]];
  for (const [dx, dz] of corners) kit.solid.add(beam([x + dx, 0, z + dz], [x + dx, height, z + dz], 0.25, 3), yellow);
  for (let y = 0; y < height; y += 6) {
    kit.solid.add(beam([x - w, y, z - w], [x + w, y + 6, z - w], 0.12, 3), yellow);
    kit.solid.add(beam([x + w, y, z + w], [x - w, y + 6, z + w], 0.12, 3), yellow);
  }
  kit.solid.add(box(7, 2, 7), 0x3a3a3a, T(x, -0.5, z));
  const hub: V3 = [x, height, z];
  const slew: Motion = { hub, axisA: [0, 1, 0], swingA: CRANE.slew, freq: CRANE.slewFreq };
  // Jib pointing toward the statue at rest (−X), counter-jib behind, cab and mast cap.
  const m = kit.moving;
  m.add(box(5, 4, 5), yellow, T(x, height, z), slew);
  m.add(box(3.4, 3, 3.4), 0x2a2a2a, T(x + 3.6, height + 0.5, z - 1), slew);
  for (const dz of [-1.1, 1.1]) {
    m.add(beam([x, height + 4, z + dz], [x - jib, height + 3.4, z + dz], 0.2, 3), yellow, undefined, slew);
    m.add(beam([x, height + 4, z + dz], [x + counter, height + 4, z + dz], 0.2, 3), yellow, undefined, slew);
  }
  for (let i = 0; i < jib; i += 5) m.add(beam([x - i, height + 4, z - 1.1], [x - i - 5, height + 4, z + 1.1], 0.1, 3), yellow, undefined, slew);
  m.add(box(5, 4, 4), 0x6a6a70, T(x + counter - 2, height + 1.5, z), slew);
  m.add(beam([x, height + 4, z], [x, height + 16, z], 0.3, 4), yellow, undefined, slew);
  m.add(beam([x, height + 16, z], [x - jib * 0.7, height + 4.4, z], 0.08, 3), 0x2a2a2a, undefined, slew);
  m.add(beam([x, height + 16, z], [x + counter, height + 4.4, z], 0.08, 3), 0x2a2a2a, undefined, slew);
  // Hook and load: a carved stone fragment swinging gently under the trolley.
  const trolley: V3 = [x - jib * 0.72, height + 3.4, z];
  const load: Motion = { ...slew, pivot: trolley, axisB: [1, 0, 0], swingB: 0.05, freq: 0.9 };
  m.add(beam(trolley, [trolley[0], trolley[1] - 34, trolley[2]], 0.08, 3), 0x2a2a2a, undefined, load);
  m.add(box(5, 4, 3), mix(kit.palette.rock, 0xd8c8a8, 0.55), T(trolley[0], trolley[1] - 39, trolley[2], 0.3), load);
  kit.lamp(new THREE.OctahedronGeometry(0.8), [x, height + 17, z], 0xff3030, 5, slew, { depth: 1, freq: 2.2, phase: 0, sharp: 8 });
  kit.lamp(new THREE.OctahedronGeometry(0.7), [x - jib, height + 4, z], 0xff3030, 4, slew, { depth: 1, freq: 2.2, phase: 1, sharp: 8 });
}

function camp(kit: Kit): void {
  const { rng } = kit;
  const canvas = [0xe8dcc4, 0x6a8a5a, 0xc8a070];
  for (let i = 0; i < 7; i++) {
    const x = -30 + i * 13 + rng() * 4;
    const z = -48 - rng() * 14;
    kit.solid.add(cone(4.2, 4.4, 4), canvas[i % canvas.length], T(x, 0, z, Math.PI / 4 + rng() * 0.3, 0, 0, [1, 1, 1.5]));
  }
  for (let i = 0; i < 14; i++) kit.solid.add(box(1.6, 1.2, 1.6), vary(rng, 0x8a6a48, 0.15), T(-40 + rng() * 90, 0, -36 - rng() * 30, rng()));
  // Floodlights on tripods around the head and the hand.
  for (const [x, z] of [[-92, -46], [-52, -48], [50, -40], [92, -34], [-20, 4]] as const) {
    kit.solid.add(beam([x - 1, 0, z], [x, 7, z], 0.1, 3), 0x2a2a2a);
    kit.solid.add(beam([x + 1, 0, z], [x, 7, z], 0.1, 3), 0x2a2a2a);
    kit.lamp(box(1.6, 1.2, 0.5), [x, 7, z], 0xfff4d8, 9, undefined, { depth: 0.1, freq: 2, phase: x });
  }
}

export function createColossus(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const { rng } = kit;
  const stone = mix(kit.palette.rock, 0xd8c8a8, 0.55);
  const patina = mix(0x4a9a88, kit.palette.accent, 0.15);
  const gold = new THREE.Color(0xc8a040);
  torso(kit, stone, patina, gold);
  head(kit, stone, patina, gold);
  hand(kit, stone, gold);
  scaffold(kit);
  crane(kit);
  camp(kit);

  // Archaeologists: busy round the head, the hand and the camp.
  const sites: readonly [number, number, number][] = [[HEAD.x, HEAD.z - 18, 16], [HAND.x, HAND.z - 4, 16], [10, -50, 30], [TORSO.x, TORSO.z - 44, 18]];
  for (let i = 0; i < kit.q(CROWD.high, CROWD.low); i++) {
    const [sx, sz, r] = sites[i % sites.length];
    const a = rng() * Math.PI * 2;
    const digging = rng() < 0.5;
    kit.crowd({ x: sx + Math.cos(a) * r * rng(), y: 0, z: sz + Math.sin(a) * r * rng() * 0.6, ry: rng() * Math.PI * 2, color: rng() < 0.6 ? 0xf2a33a : rng() < 0.5 ? 0xf7efe0 : 0x3a6ab0, hop: digging ? 0.35 : 0.1, freq: digging ? 3 : 7, phase: rng() * 100, sharp: digging ? 4 : 1, raise: digging ? 0.6 : 0, walk: digging ? 0 : 2 + rng() * 4, walkFreq: 0.18 });
  }

  // Dust motes hanging in the light round the statue.
  const motes = kit.particles(true, 1.5);
  // Linear and additive after sRGB encoding, so very small values read as soft specks.
  const dust = shade(mix(kit.palette.sun, kit.palette.sand, 0.4), 0.012 + 0.02 * kit.dusk);
  for (let i = 0; i < kit.q(MOTES.high, MOTES.low); i++) {
    const origin: V3 = [(rng() - 0.5) * 180, 2 + rng() * 80, (rng() - 0.5) * 120];
    motes.add(origin, [(rng() - 0.3) * 1.2, (rng() - 0.4) * 0.6, (rng() - 0.5) * 1.2], dust, 0.6 + rng() * 0.8, { period: 12, lifetime: 12, phase: rng() * 12 }, { fadeIn: 0.3 });
  }
  return kit.finish(RADIUS);
}
