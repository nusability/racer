// Neon billboards: a corner of the entertainment district where every surface sells something.
// Low lit buildings carry giant animated ad boards on their roofs and walls (the made-up brands
// of render/neonSigns.ts, cycling, sweeping, chasing bulbs round their frames), a tall blade
// sign spells its letters out one at a time, and steel frames lift the biggest boards over the
// street. The boards are one instanced draw; the blade's chase and the tubes twinkle on the GPU.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import { T, beam, box, mix, pick, shade } from '../b/shapes.ts';
import { finishCoast } from '../c/kit.ts';
import { neonSigns, signBoards } from '../../neonSigns.ts';
import { DARK, Facades, NEON, STEEL, WALLS } from './kit.ts';

const SALT = 0xb111b;
const RADIUS = 75;
/** The buildings: count by quality, footprint and height ranges. */
const BLOCKS = { high: 5, low: 3 } as const;
const BLOCK_FOOT: readonly [number, number] = [18, 30];
const BLOCK_H: readonly [number, number] = [14, 34];
/** Ad boards (2:1): rooftop board size, wall board size, and the big framed board. */
const ROOF_BOARD = 18;
const WALL_BOARD = 11;
const BIG_BOARD = 34;
const BIG_LIFT = 26;
/** The blade sign: letters, letter height, and the chase (letters per second). */
const BLADE_LETTERS = 7;
const BLADE_LETTER = 4.2;
const BLADE_CHASE = 2.5;
/** Sign light by day and at deep dusk. */
const SIGN_DAY = 0.55;
const SIGN_DUSK = 1.05;

export function createNeonBillboards(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const rng = kit.rng;
  const facades = new Facades();
  const boards: THREE.Matrix4[] = [];
  const board = (x: number, y: number, z: number, yaw: number, w: number) => boards.push(T(x, y, z, yaw, 0, 0, [w, w / 2, 1]));

  // Buildings round a little square, faces toward the track (−Z) carrying wall boards.
  const n = kit.q(BLOCKS.high, BLOCKS.low);
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.15 + (0.7 * i) / Math.max(1, n - 1)) + Math.PI;
    const x = -Math.cos(a) * RADIUS * 0.55;
    const z = -Math.sin(a) * RADIUS * 0.45;
    const w = BLOCK_FOOT[0] + rng() * (BLOCK_FOOT[1] - BLOCK_FOOT[0]);
    const h = BLOCK_H[0] + rng() * (BLOCK_H[1] - BLOCK_H[0]);
    // Turned to look into the square and out toward the track.
    const yaw = Math.atan2(x, z) * 0.35;
    facades.add(x, 0, z, w, h, w * 0.8, yaw, mix(pick(rng, WALLS), opts.palette.rock, 0.2));
    // A board on the roof on a little steel stand, and one on the track-facing wall.
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const fx = x - (w * 0.4 + 0.3) * s;
    const fz = z - (w * 0.4 + 0.3) * c;
    board(fx, h * 0.35, fz, yaw + Math.PI, WALL_BOARD);
    for (const side of [-1, 1]) kit.solid.add(beam([x + side * ROOF_BOARD * 0.35 * c, h, z - side * ROOF_BOARD * 0.35 * s], [x + side * ROOF_BOARD * 0.35 * c, h + 4, z - side * ROOF_BOARD * 0.35 * s], 0.3), STEEL);
    board(x, h + 4, z, yaw + Math.PI, ROOF_BOARD);
    // Neon tubes along the roofline.
    kit.lights.add(box(w, 0.5, 0.5), pick(rng, NEON), T(fx, h - 0.8, fz, yaw), undefined, { depth: 0.3, freq: 1 + rng(), phase: rng() * 6 });
  }

  // The big board on a lattice frame, high over the square.
  const bz = RADIUS * 0.25;
  for (const side of [-1, 1]) {
    const x = side * BIG_BOARD * 0.4;
    kit.solid.add(box(1.4, BIG_LIFT, 1.4), DARK, T(x, 0, bz));
    for (let k = 0; k < 4; k++) kit.solid.add(beam([x, (k * BIG_LIFT) / 4, bz], [x - side * 3, ((k + 1) * BIG_LIFT) / 4, bz + 3], 0.25), STEEL);
  }
  kit.solid.add(box(BIG_BOARD + 2, BIG_BOARD / 2 + 2, 1), DARK, T(0, BIG_LIFT - 1, bz + 0.6));
  board(0, BIG_LIFT, bz - 0.1, Math.PI, BIG_BOARD);

  // The blade sign: a tall slab on the corner whose letters light one after another.
  const bladeX = RADIUS * 0.62;
  const bladeH = BLADE_LETTERS * BLADE_LETTER + 6;
  kit.solid.add(box(1.2, bladeH, 6), DARK, T(bladeX, 4, -RADIUS * 0.2));
  kit.solid.add(box(1.6, 4, 1.6), STEEL, T(bladeX, 0, -RADIUS * 0.2));
  const bladeCol = pick(rng, NEON);
  for (let i = 0; i < BLADE_LETTERS; i++) {
    const y = 4 + bladeH - 3 - (i + 1) * BLADE_LETTER;
    for (const face of [-1, 1]) {
      kit.lights.add(box(0.3, BLADE_LETTER * 0.75, 4.2), bladeCol, T(bladeX + face * 0.7, y, -RADIUS * 0.2), undefined, { depth: 0.85, freq: (BLADE_CHASE * Math.PI * 2) / BLADE_LETTERS, phase: (-i / BLADE_LETTERS) * Math.PI * 2, sharp: 4 });
    }
  }
  for (const face of [-1, 1]) kit.lights.add(box(0.2, bladeH, 0.3), shade(bladeCol, 0.8), T(bladeX + face * 0.7, 4, -RADIUS * 0.2 - 3));

  // Strings of bulbs across the square.
  for (let k = 0; k < kit.q(4, 2); k++) {
    const x0 = -RADIUS * 0.5 + rng() * RADIUS;
    const col = pick(rng, NEON);
    for (let b = 0; b < 12; b++) {
      const t = b / 11;
      const x = x0 + (rng() - 0.5) * 4;
      kit.lamp(new THREE.OctahedronGeometry(0.35), [x, 10 - 4 * t * (1 - t) * 4 + t * 3, -RADIUS * 0.4 + t * RADIUS * 0.8], col, 1.6, undefined, { depth: 0.6, freq: 3, phase: b * 0.7, sharp: 2 });
    }
  }

  const signs = neonSigns(SIGN_DAY + (SIGN_DUSK - SIGN_DAY) * opts.palette.dusk);
  const mesh = signBoards(signs, boards, opts.seed ^ SALT, 'boards');
  kit.addObject(mesh, mesh.geometry, signs);
  facades.build(kit, opts);
  const lm = finishCoast(kit, RADIUS);
  return {
    ...lm,
    update(time, dt) {
      lm.update(time, dt);
      signs.update(time);
    },
  };
}
