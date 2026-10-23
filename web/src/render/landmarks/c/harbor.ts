// The harbour: a working container port. Gantry cranes shuttle boxes between the quay and a
// container ship stacked high with colour; two tugs shove at her side in a boil of white water,
// reach-stackers trundle round the yard and a rubble breakwater runs out to a little light.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import type { Motion, V3 } from '../b/motion.ts';
import { T, beam, box, mix, prism, shade, vary } from '../b/shapes.ts';
import { bindingOf, withBound } from './hazard.ts';
import { roadCrane } from './roadCrane.ts';
import { DARK, FOAM, GLASS, GREEN_LIGHT, RED_LIGHT, WARM_LIGHT, WHITE, finishCoast, hull, smoke, splash } from './kit.ts';

const SALT = 0x4a7b07;
const RADIUS = 210;
const QUAY = { x: 175, z0: -95, z1: 20, top: 2.5, floor: -7 } as const;
const SHIP = { len: 236, beam: 36, z: 42, draft: 8, deck: 13, bridgeX: -92 } as const;
const BOX = { l: 12, w: 4, h: 3.2 } as const;
const BAYS = { x0: -74, n: 13 } as const;
const ROWS = 8;
const CRANES: readonly number[] = [-46, 14, 72];
const CRANE = { legA: -6, legB: 16, legH: 40, boomY: 47, back: -38, out: 78, apex: 64 } as const;
/** Trolley run between the quay lane and the ship, and the lift on the way. */
const TROLLEY = { zQuay: 8, zShip: 50, low: 16.6, lift: 22 } as const;
const YARD = { z0: -84, z1: -16, rows: 6 } as const;
const TUGS: readonly number[] = [-30, 50];
const STACKERS = { high: 5, low: 3 } as const;
const BOX_COLOURS = [0xc8402a, 0x2f6fb8, 0xf2a33a, 0x3f9a5f, 0xe8e2d4, 0x8a3a8a, 0x1fa5a0, 0xd8c040, 0x5a6a7a];

function containerColour(kit: Kit): THREE.Color {
  return vary(kit.rng, BOX_COLOURS[Math.floor(kit.rng() * BOX_COLOURS.length)], 0.08);
}

/** A stack of `n` boxes; on low quality one tall box in a single colour stands in for it. */
function stack(kit: Kit, x: number, y: number, z: number, n: number): void {
  if (!kit.high) {
    kit.solid.add(box(BOX.l, n * BOX.h - 0.15, BOX.w - 0.2), containerColour(kit), T(x, y, z));
    return;
  }
  for (let k = 0; k < n; k++) kit.solid.add(box(BOX.l, BOX.h - 0.15, BOX.w - 0.2), containerColour(kit), T(x, y + k * BOX.h, z));
}

function quay(kit: Kit): void {
  const concrete = mix(kit.palette.road, 0xc8c4bc, 0.5);
  kit.solid.add(box(QUAY.x * 2, QUAY.top - QUAY.floor, QUAY.z1 - QUAY.z0), concrete, T(0, QUAY.floor, (QUAY.z0 + QUAY.z1) / 2));
  // Crane rails, a yellow edge line and black rubber fenders along the face.
  for (const z of [CRANE.legA, CRANE.legB]) kit.solid.add(box(QUAY.x * 2, 0.15, 0.6), DARK, T(0, QUAY.top, z));
  kit.solid.add(box(QUAY.x * 2, 0.08, 0.5), 0xf4d03f, T(0, QUAY.top, QUAY.z1 - 1));
  for (let x = -QUAY.x + 10; x < QUAY.x; x += 16) kit.solid.add(box(2, 2.4, 1), DARK, T(x, -1.5, QUAY.z1 + 0.5));
  for (let x = -QUAY.x + 8; x < QUAY.x; x += 24) {
    kit.solid.add(prism(0.5, 0.4, 1, 6), DARK, T(x, QUAY.top, QUAY.z1 - 2));
  }
  // Floodlight masts with halos.
  for (let x = -QUAY.x + 20; x < QUAY.x; x += 70) {
    const top: V3 = [x, 24, QUAY.z0 + 8];
    kit.solid.add(beam([x, QUAY.top, top[2]], top, 0.3, 4), shade(concrete, 0.7));
    kit.lamp(box(3, 0.8, 1.2), top, 0xfff4d0, 10 * kit.dusk + 2, undefined, { depth: 0.05, freq: 1, phase: x });
  }
}

function ship(kit: Kit): void {
  const { len, beam: bw, z, draft, deck } = SHIP;
  kit.solid.add(hull(len, bw, draft + deck, 0.2, 0.92), 0x1e3a5a, T(0, -draft, z));
  kit.solid.add(hull(len + 0.5, bw + 0.4, draft + 1, 0.2, 0.92, 1), 0x9a2a24, T(0, -draft - 0.2, z));
  kit.solid.add(hull(len + 0.6, bw + 0.5, 1, 0.2, 0.92, 1), WHITE, T(0, deck - 1.5, z));
  // Bridge house aft: tall white block, glazed band, funnel.
  const bx = SHIP.bridgeX;
  kit.solid.add(box(16, 22, bw - 6), WHITE, T(bx, deck, z));
  kit.solid.add(box(18, 2, bw + 4), WHITE, T(bx + 1, deck + 22, z));
  kit.solid.add(box(18.4, 1.4, bw + 4.4), GLASS, T(bx + 1, deck + 20.4, z));
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) kit.lamp(box(10, 1, 0.2), [bx, deck + 3 + i * 3.6, z + s * ((bw - 6) / 2 + 0.1)], WARM_LIGHT, 0, undefined, { depth: 0.1, freq: 0.4, phase: i });
  kit.solid.add(prism(3.4, 3, 10, 8).scale(1.4, 1, 1), kit.palette.accent, T(bx - 10, deck + 12, z));
  kit.solid.add(prism(3, 3, 1.6, 8).scale(1.4, 1, 1), DARK, T(bx - 10, deck + 22, z));
  kit.solid.add(beam([bx + 2, deck + 24, z], [bx + 2, deck + 34, z], 0.25, 3), DARK);
  kit.lamp(new THREE.OctahedronGeometry(0.5), [bx + 2, deck + 34.5, z], RED_LIGHT, 4, undefined, { depth: 0.9, freq: 2, phase: 0, sharp: 6 });
  // Forecastle and a mast at the bow.
  kit.solid.add(box(16, 3, bw - 10), shade(WHITE, 0.9), T(len / 2 - 18, deck, z));
  kit.lamp(new THREE.OctahedronGeometry(0.4), [len / 2 - 10, deck + 9, z], WARM_LIGHT, 4, undefined, { depth: 0.1, freq: 1, phase: 1 });
  kit.solid.add(beam([len / 2 - 10, deck, z], [len / 2 - 10, deck + 8.6, z], 0.2, 3), DARK);
  // Containers: bays along the deck, rows across, stacked to a ragged skyline.
  const { rng } = kit;
  for (let b = 0; b < BAYS.n; b++) {
    const x = BAYS.x0 + b * (BOX.l + 1.2);
    // The bays under the cranes are the ones being worked: one tier high.
    const worked = CRANES.some((cx) => Math.abs(cx - x) < BOX.l / 2);
    const tall = worked ? 1 : 2 + Math.floor(rng() * 4);
    for (let r = 0; r < ROWS; r++) {
      const zz = z - ((ROWS - 1) / 2) * BOX.w + r * BOX.w;
      const n = worked ? 1 : Math.max(1, tall - (r === 0 || r === ROWS - 1 ? 1 : 0) - (rng() < 0.2 ? 1 : 0));
      stack(kit, x, deck, zz, n);
    }
  }
}

function crane(kit: Kit, x: number, i: number): void {
  const col = i % 2 ? 0x2f6fb8 : 0xe8603a;
  const dark = shade(col, 0.7);
  const { legA, legB, legH, boomY, back, out, apex } = CRANE;
  const y0 = QUAY.top;
  for (const dx of [-7, 7]) {
    for (const z of [legA, legB]) kit.solid.add(box(1.6, legH, 1.6), col, T(x + dx, y0, z));
    kit.solid.add(beam([x + dx, y0 + 12, legA], [x + dx, y0 + 12, legB], 0.6, 4), dark);
    kit.solid.add(beam([x + dx, y0 + 1, legA], [x + dx, y0 + legH - 2, legB], 0.4, 4), dark);
  }
  for (const z of [legA, legB]) kit.solid.add(box(16, 2.2, 1.8), col, T(x, y0 + legH, z));
  // The boom: two girders reaching from the backreach out over the ship.
  for (const dx of [-3, 3]) kit.solid.add(box(1.4, 2.6, out - back), col, T(x + dx, boomY, (out + back) / 2));
  kit.solid.add(box(12, 6, 10), WHITE, T(x, boomY - 2, back + 6));
  kit.solid.add(box(5, 4, 4), GLASS, T(x, boomY - 4, legB + 4));
  // A-frame and stays.
  for (const dx of [-3, 3]) {
    kit.solid.add(beam([x + dx, y0 + legH, legA], [x + dx * 0.6, apex, (legA + legB) / 2], 0.5, 4), col);
    kit.solid.add(beam([x + dx, y0 + legH, legB], [x + dx * 0.6, apex, (legA + legB) / 2], 0.5, 4), col);
    kit.solid.add(beam([x + dx * 0.6, apex, (legA + legB) / 2], [x + dx, boomY + 1.3, out - 4], 0.15, 3), DARK);
    kit.solid.add(beam([x + dx * 0.6, apex, (legA + legB) / 2], [x + dx, boomY + 1.3, back + 2], 0.15, 3), DARK);
  }
  kit.lamp(new THREE.OctahedronGeometry(0.6), [x, apex + 1, (legA + legB) / 2], RED_LIGHT, 5, undefined, { depth: 0.9, freq: 1.6, phase: i, sharp: 6 });
  kit.lamp(new THREE.OctahedronGeometry(0.5), [x, boomY + 2, out], RED_LIGHT, 3, undefined, { depth: 0.9, freq: 1.6, phase: i + 0.5, sharp: 6 });
  // Trolley and its box. Drift runs the trolley quay ↔ ship; the hop (twice the drift rate,
  // in step with it) lifts the box mid-run and sets it down at either end.
  const run = (TROLLEY.zShip - TROLLEY.zQuay) / 2;
  const mid = (TROLLEY.zShip + TROLLEY.zQuay) / 2;
  const w = 0.32 + i * 0.05;
  const phase = -Math.PI / 2;
  const trolley: Motion = { drift: [0, 0, run], driftFreq: w, phase };
  const load: Motion = { drift: [0, 0, run], driftFreq: w, phase, hop: TROLLEY.lift, freq: 2 * w };
  kit.moving.add(box(8, 2.4, 6), DARK, T(x, boomY - 2.4, mid), trolley);
  kit.moving.add(box(BOX.l + 1, 0.6, BOX.w), 0xf4d03f, T(x, TROLLEY.low + BOX.h, mid), load);
  kit.moving.add(box(BOX.l, BOX.h - 0.15, BOX.w - 0.2), containerColour(kit), T(x, TROLLEY.low, mid), load);
}

function yard(kit: Kit): void {
  const { rng } = kit;
  for (let r = 0; r < YARD.rows; r++) {
    const z = YARD.z0 + (r * (YARD.z1 - YARD.z0)) / (YARD.rows - 1);
    for (let x = -QUAY.x + 14; x < QUAY.x - 10; x += BOX.l + 1) {
      if (rng() < 0.12) continue;
      const n = 1 + Math.floor(rng() * 4);
      stack(kit, x, QUAY.top, z, n);
    }
  }
}

/** Reach-stackers: chunky yellow machines trundling back and forth with a box on their arm. */
function stackers(kit: Kit): void {
  const { rng } = kit;
  const n = kit.q(STACKERS.high, STACKERS.low);
  for (let i = 0; i < n; i++) {
    const x = -QUAY.x + 30 + (i * (QUAY.x * 2 - 60)) / Math.max(1, n - 1);
    const z = i % 2 ? -8 : YARD.z0 - 6;
    const drive: Motion = { drift: [16 + rng() * 10, 0, 0], driftFreq: 0.18 + rng() * 0.08, phase: rng() * 6 };
    const y = QUAY.top;
    kit.moving.add(box(8, 2.6, 4.2), 0xf4c020, T(x, y + 0.8, z), drive);
    kit.moving.add(box(2.6, 2.2, 3.4), GLASS, T(x - 1, y + 3.4, z), drive);
    for (const dx of [-2.8, 2.8]) for (const dz of [-2.2, 2.2]) kit.moving.add(prism(0.9, 0.9, 0.7, 6).rotateX(Math.PI / 2), DARK, T(x + dx, y + 0.9, z + dz), drive);
    kit.moving.add(beam([x - 3, y + 3, z], [x + 7, y + 9, z], 0.5, 4), shade(0xf4c020, 0.8), undefined, drive);
    kit.moving.add(box(BOX.l, BOX.h - 0.15, BOX.w - 0.2), containerColour(kit), T(x + 8, y + 9.6, z, Math.PI / 2), drive);
    kit.lamp(new THREE.OctahedronGeometry(0.3), [x - 1, y + 4.8, z], 0xff9a20, 2, drive, { depth: 0.9, freq: 5, phase: i, sharp: 4 });
  }
}

function tugs(kit: Kit): void {
  const { rng } = kit;
  const wash = kit.particles(false, 1.1);
  const zSide = SHIP.z + SHIP.beam / 2;
  for (const [i, x] of TUGS.entries()) {
    // Bow pressed to the hull, stern out to sea, pushing hard.
    const z = zSide + 13;
    const m = T(x, 0, z, -Math.PI / 2);
    const rock: Motion = { pivot: [x, 0, z], axisB: [0, 0, 1], swingB: 0.04, freq: 1.4, phase: i, hop: 0.3 };
    kit.moving.add(hull(24, 9, 5.5, 0.35, 0.9), 0xb8302a, m.clone().multiply(T(0, -3, 0)), rock);
    kit.moving.add(hull(24.6, 9.4, 1.2, 0.35, 0.9, 1), DARK, m.clone().multiply(T(0, 1.8, 0)), rock);
    kit.moving.add(box(7, 4, 6), WHITE, m.clone().multiply(T(1, 2.5, 0)), rock);
    kit.moving.add(box(7.4, 1.2, 6.4), GLASS, m.clone().multiply(T(1, 5.4, 0)), rock);
    kit.moving.add(prism(1, 1, 4, 6), DARK, m.clone().multiply(T(-3, 3, 0)), rock);
    kit.moving.add(box(3, 3.4, 9.6), DARK, m.clone().multiply(T(11.6, 0, 0)), rock);
    // Prop wash boiling up astern and drifting off.
    for (let k = 0; k < kit.q(36, 18); k++) {
      const period = 2.4 + rng() * 1.2;
      wash.add([x + (rng() - 0.5) * 6, 0.3, z + 13], [(rng() - 0.5) * 4, 1.8 + rng() * 2, 4 + rng() * 5], FOAM, 2.5 + rng() * 2, { period, lifetime: period, phase: rng() * period, grow: 0.6 }, { gravity: 1.2, drag: 0.6, fadeIn: 0.1 });
    }
    smoke(wash, rng, [x, 8, z + 3], { count: kit.q(10, 5), color: 0x606068, size: 3, rise: 4, wind: [-3, 0, 2], period: 6, spread: 1 });
  }
  smoke(wash, rng, [SHIP.bridgeX - 10, SHIP.deck + 24, SHIP.z], { count: kit.q(18, 9), color: 0x7a7a80, size: 6, rise: 5, wind: [-5, 0, 2], period: 8, spread: 2 });
  splash(wash, rng, [TUGS[0] + 4, 0.5, zSide + 2], { count: kit.q(14, 8), speed: 2, up: 4, size: 1.8, period: 3.2, time: 0 });
}

function breakwater(kit: Kit): void {
  const { rng } = kit;
  const n = kit.q(26, 15);
  let end: V3 = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = -200 + t * 270;
    const z = 175 - Math.sin(t * Math.PI * 0.8) * 30;
    const s = 6 + rng() * 3;
    kit.solid.add(new THREE.DodecahedronGeometry(1, 0), vary(rng, shade(kit.palette.rock, 0.9 + rng() * 0.3), 0.06), T(x, -2, z, rng() * 6, 0, 0, [s * 1.4, 4 + rng() * 2, s]));
    end = [x + 6, 0, z];
  }
  const [x, , z] = end;
  kit.solid.add(prism(4, 4, 4, 8), shade(WHITE, 0.85), T(x, 0, z));
  for (let k = 0; k < 4; k++) kit.solid.add(prism(1.8 - k * 0.1, 1.7 - k * 0.1, 3, 8), k % 2 ? WHITE : 0x3f9a5f, T(x, 4 + k * 3, z));
  kit.lamp(new THREE.OctahedronGeometry(0.9), [x, 17, z], GREEN_LIGHT, 7, undefined, { depth: 0.95, freq: 1.3, phase: 0, sharp: 8 });
}

export function createHarbor(opts: LandmarkOptions): Landmark {
  const bound = bindingOf(opts, 'harbor', ['sweeper'] as const);
  const kit = new Kit(opts, SALT);
  quay(kit);
  ship(kit);
  CRANES.forEach((x, i) => crane(kit, x, i));
  yard(kit);
  stackers(kit);
  tugs(kit);
  breakwater(kit);
  // Bound to a sweeper: a gantry over the road swings a container across it on the schedule.
  const drive = bound && roadCrane(kit, bound);
  const lm = finishCoast(kit, RADIUS);
  return drive ? withBound(lm, drive) : lm;
}
