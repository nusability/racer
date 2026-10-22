// The balloon flotilla: hot-air balloons in bold gores and bands and a pair of airships
// drift and bob high over the desert, slowly turning, burners flaring now and then, some
// trailing banners. Beneath them a launch field: a balloon inflating on the sand, a
// tethered one swaying on its line, a crew and their trucks.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from './kit.ts';
import type { Motion, V3 } from './motion.ts';
import { T, ball, beam, box, cone, lathe, mix, pick, prism, shade } from './shapes.ts';
import { quadPts } from './props.ts';

const SALT = 0xba11;
const RADIUS = 220;
const BALLOONS = { high: 16, low: 8 } as const;
const AIRSHIPS = { high: 2, low: 1 } as const;
/** Flotilla spread over the ground (x, z half extents) and altitude band, metres. */
const SPREAD = { x: 200, z: 150 } as const;
const ALTITUDE = { min: 70, max: 300 } as const;
const GORES = 14;
const ENVELOPE: readonly (readonly [number, number])[] = [
  [1.2, 0],
  [5, 2.2],
  [10.5, 8],
  [13.6, 15],
  [14.2, 21],
  [12.6, 27],
  [8.4, 31.5],
  [0.6, 33.5],
];
/** Profile indices where a balloon's contrasting band starts and ends. */
const BAND = [3, 5] as const;
const AIRSHIP: readonly (readonly [number, number])[] = [
  [0.3, -31],
  [5, -27],
  [8.6, -17],
  [9.6, -4],
  [9.2, 9],
  [6.8, 21],
  [3, 28.5],
  [0.3, 31],
];
const BANNER_CHANCE = 0.35;
const CROWD = { high: 40, low: 18 } as const;

function envelopeSlice(from: number, to: number): (readonly [number, number])[] {
  return ENVELOPE.slice(from, to + 1);
}

/** A hot-air balloon: gored envelope, skirt, basket on ropes, a flaring burner. */
function balloon(kit: Kit, at: V3, size: number): void {
  const { rng } = kit;
  const colA = kit.festiveColor();
  const colB = rng() < 0.5 ? new THREE.Color(0xf7efe0) : kit.festiveColor();
  const band = rng() < 0.5 ? kit.festiveColor() : null;
  const axis: V3 = [at[0], at[1], at[2]];
  const motion: Motion = {
    hub: axis,
    axisA: [0, 1, 0],
    spinA: (rng() - 0.5) * 0.12,
    drift: [(rng() - 0.5) * 30, 4 + rng() * 5, (rng() - 0.5) * 20],
    driftFreq: 0.08 + rng() * 0.08,
    phase: rng() * 6,
  };
  const place = T(at[0], at[1], at[2], 0, 0, 0, size);
  for (let g = 0; g < GORES; g++) {
    const phi = (g / GORES) * Math.PI * 2;
    const dphi = (Math.PI * 2) / GORES;
    const gore = g % 2 ? colA : colB;
    if (band) {
      kit.moving.add(lathe(envelopeSlice(0, BAND[0]), 1, phi, dphi), gore, place, motion);
      kit.moving.add(lathe(envelopeSlice(BAND[0], BAND[1]), 1, phi, dphi), g % 2 ? band : shade(band, 0.8), place, motion);
      kit.moving.add(lathe(envelopeSlice(BAND[1], ENVELOPE.length - 1), 1, phi, dphi), gore, place, motion);
    } else {
      kit.moving.add(lathe(ENVELOPE, 1, phi, dphi), gore, place, motion);
    }
  }
  const s = size;
  kit.moving.add(cone(1.4, 4, 8).rotateX(Math.PI), shade(colA, 0.7), T(at[0], at[1] + 0.5 * s, at[2], 0, 0, 0, s), motion);
  const basketY = at[1] - 6.5 * s;
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    kit.moving.add(beam([at[0] + dx * 1.3 * s, at[1] + 0.6 * s, at[2] + dz * 1.3 * s], [at[0] + dx * 0.9 * s, basketY + 1.3 * s, at[2] + dz * 0.9 * s], 0.05 * s, 3), 0x3a2a20, undefined, motion);
  }
  kit.moving.add(box(2 * s, 1.3 * s, 2 * s), 0x8a6038, T(at[0], basketY, at[2]), motion);
  // The burner: mostly a low pilot, now and then a big flare.
  const flame: V3 = [at[0], at[1] - 2 * s, at[2]];
  const flare = { depth: 0.85, freq: 0.6 + rng() * 0.6, phase: rng() * 6, sharp: 6 };
  kit.lights.add(cone(0.7 * s, 2.6 * s, 6), 0xffb040, T(flame[0], flame[1] - 1.3 * s, flame[2]), motion, flare);
  kit.halos.point(flame, 0xff9a40, 9 * s, motion, flare);
  if (rng() < BANNER_CHANCE) {
    const hang: V3 = [at[0], basketY, at[2]];
    const col = kit.festiveColor();
    const length = 22 * s;
    const sway: Motion = { ...motion, pivot: hang, axisB: [1, 0, 0], swingB: 0.12, freq: 1.1 };
    kit.moving.add(beam(hang, [hang[0], hang[1] - 6, hang[2]], 0.04, 3), 0x3a2a20, undefined, sway);
    kit.moving.add(quadPts([hang[0] - length / 2, hang[1] - 6, hang[2]], [hang[0] + length / 2, hang[1] - 6, hang[2]], [hang[0] + length / 2, hang[1] - 11, hang[2]], [hang[0] - length / 2, hang[1] - 11, hang[2]]), col, undefined, sway);
    kit.moving.add(quadPts([hang[0] - length / 2 + 1, hang[1] - 7.8, hang[2] - 0.05], [hang[0] + length / 2 - 1, hang[1] - 7.8, hang[2] - 0.05], [hang[0] + length / 2 - 1, hang[1] - 9.2, hang[2] - 0.05], [hang[0] - length / 2 + 1, hang[1] - 9.2, hang[2] - 0.05]), 0xf7efe0, undefined, sway);
  }
}

/** An airship cruising along x: banded hull, tail fins, lit gondola, spinning propellers. */
function airship(kit: Kit, at: V3, size: number): void {
  const { rng } = kit;
  const colA = kit.festiveColor();
  const colB = new THREE.Color(0xf2efe6);
  const motion: Motion = { drift: [40 + rng() * 30, 6, 0], driftFreq: 0.02 + rng() * 0.01, phase: rng() * 6 };
  // The lathe runs along y; lay it along x (nose toward +x).
  const place = T(at[0], at[1], at[2], 0, 0, -Math.PI / 2, size);
  for (let g = 0; g < GORES; g++) {
    const phi = (g / GORES) * Math.PI * 2;
    kit.moving.add(lathe(AIRSHIP.slice(0, 4), 1, phi, (Math.PI * 2) / GORES), g % 2 ? colA : shade(colA, 0.88), place, motion);
    kit.moving.add(lathe(AIRSHIP.slice(3, 5), 1, phi, (Math.PI * 2) / GORES), colB, place, motion);
    kit.moving.add(lathe(AIRSHIP.slice(4), 1, phi, (Math.PI * 2) / GORES), g % 2 ? colA : shade(colA, 0.88), place, motion);
  }
  const s = size;
  const tail = at[0] - 26 * s;
  for (let f = 0; f < 4; f++) {
    const a = (f / 4) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const root = (r: number): V3 => [0, at[1] + c * r * s, at[2] + sn * r * s];
    const p0 = root(3);
    const p1 = root(11);
    kit.moving.add(quadPts([tail + 6 * s, p0[1], p0[2]], [tail - 2 * s, p0[1], p0[2]], [tail - 3 * s, p1[1], p1[2]], [tail + 2 * s, p1[1], p1[2]]), f % 2 ? colB : shade(colA, 0.7), undefined, motion);
  }
  const gy = at[1] - 11 * s;
  kit.moving.add(box(14 * s, 3.4 * s, 4 * s), shade(colA, 0.55), T(at[0] + 2 * s, gy, at[2]), motion);
  kit.lights.add(box(11 * s, 1.1 * s, 4.1 * s), 0xffd890, T(at[0] + 2 * s, gy + 1.6 * s, at[2]), motion, { depth: 0.1, freq: 1, phase: 0 });
  for (const side of [-1, 1]) {
    const hub: V3 = [at[0] - 4 * s, gy + 2 * s, at[2] + side * 4.5 * s];
    kit.moving.add(box(4 * s, 1 * s, 1 * s), shade(colA, 0.5), T(hub[0] + 1.5 * s, hub[1], hub[2]), motion);
    const prop: Motion = { ...motion, pivot: hub, axisB: [1, 0, 0], spinB: 9 };
    kit.moving.add(box(0.2 * s, 6 * s, 0.6 * s), 0x2a2a2a, T(hub[0] - 0.8 * s, hub[1], hub[2]), prop);
    kit.lamp(new THREE.OctahedronGeometry(0.5 * s), [hub[0] + 3.5 * s, hub[1], hub[2]], side < 0 ? 0xff3030 : 0x30ff60, 3 * s, motion, { depth: 0.9, freq: 2, phase: side, sharp: 5 });
  }
  // A long banner streaming from the tail.
  const anchor: V3 = [tail - 3 * s, at[1], at[2]];
  const wave: Motion = { ...motion, pivot: anchor, axisB: [0, 1, 0], swingB: 0.1, freq: 1.4 };
  kit.moving.add(quadPts(anchor, [anchor[0] - 34 * s, anchor[1] + 1, anchor[2]], [anchor[0] - 34 * s, anchor[1] - 6 * s, anchor[2]], [anchor[0], anchor[1] - 5 * s, anchor[2]]), kit.festiveColor(), undefined, wave);
}

/** The launch field: an envelope inflating on the sand, a tethered balloon, crew and trucks. */
function launchField(kit: Kit): void {
  const { rng } = kit;
  const s = kit.solid;
  s.add(prism(1, 1, 0.25, 20).scale(60, 1, 40), mix(kit.palette.sand, 0xe8dcc4, 0.35), T(0, -0.12, 0));
  // Half-filled envelope lying on its side, breathing as the fan blows.
  const col = kit.festiveColor();
  const breathe: Motion = { pivot: [-18, 0, 4], axisB: [0, 0, 1], swingB: 0.05, freq: 0.8 };
  for (let g = 0; g < GORES; g++) {
    kit.moving.add(lathe(ENVELOPE, 1, (g / GORES) * Math.PI * 2, (Math.PI * 2) / GORES), g % 2 ? col : 0xf7efe0, T(-18, 9, 4, 0, 0, Math.PI / 2 - 0.25, [0.75, 1.1, 0.75]), breathe);
  }
  s.add(prism(2.2, 2.2, 2, 10).rotateZ(Math.PI / 2), 0x3a3a40, T(-26, 1.4, 4));
  s.add(box(2, 1.3, 2), 0x8a6038, T(-24, 0, 9));
  // Tethered balloon swaying on its line above a winch truck.
  const anchor: V3 = [24, 2, -10];
  const top: V3 = [24, 86, -10];
  const sway: Motion = { pivot: anchor, axisB: [1, 0, 0.4], swingB: 0.06, freq: 0.35 };
  kit.moving.add(beam(anchor, [top[0], top[1] - 6.5, top[2]], 0.08, 3), 0x2a2a2a, undefined, sway);
  const colA = kit.festiveColor();
  for (let g = 0; g < GORES; g++) kit.moving.add(lathe(ENVELOPE, 1, (g / GORES) * Math.PI * 2, (Math.PI * 2) / GORES), g % 2 ? colA : 0xf7efe0, T(...top), sway);
  kit.moving.add(box(2, 1.3, 2), 0x8a6038, T(top[0], top[1] - 6.5, top[2]), sway);
  for (const [x, z, c] of [[24, -10, 0xe8443a], [6, 18, 0xf2a33a], [36, 14, 0x2f8fd8]] as const) {
    s.add(box(9, 3, 4), c, T(x, 0.8, z));
    s.add(box(3, 2.5, 3.8), shade(c, 0.8), T(x + 5, 0.8, z));
    for (const wx of [-3, 3]) s.add(prism(0.8, 0.8, 0.6, 8).rotateX(Math.PI / 2), 0x1a1a1a, T(x + wx, 0.8, z - 2));
  }
  s.add(ball(0.9, 6, 4), 0xff3030, T(0, 0.3, -30));
  for (let i = 0; i < kit.q(CROWD.high, CROWD.low); i++) {
    const a = rng() * Math.PI * 2;
    const r = 8 + rng() * 26;
    kit.crowd({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r * 0.7, ry: rng() * Math.PI * 2, color: pick(rng, [0xe8443a, 0xf2a33a, 0xf7efe0, 0x2f8fd8]), hop: 0.25, freq: 5, phase: rng() * 100, sharp: 2, raise: rng() < 0.3 ? 0.9 : 0, walk: rng() < 0.5 ? 3 : 0, walkFreq: 0.2 });
  }
}

export function createBalloons(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const { rng } = kit;
  const n = kit.q(BALLOONS.high, BALLOONS.low);
  for (let i = 0; i < n; i++) {
    // Stratified across x so the flotilla spreads along the track rather than clumping.
    const x = -SPREAD.x + ((i + rng()) / n) * SPREAD.x * 2;
    const z = (rng() * 2 - 1) * SPREAD.z;
    const y = ALTITUDE.min + rng() * (ALTITUDE.max - ALTITUDE.min);
    balloon(kit, [x, y, z], 1.2 + rng() * 0.8);
  }
  for (let i = 0; i < kit.q(AIRSHIPS.high, AIRSHIPS.low); i++) {
    airship(kit, [(i - 0.5) * 180, 150 + rng() * 120, (rng() - 0.5) * 160], 1.3 + rng() * 0.5);
  }
  launchField(kit);
  return kit.finish(RADIUS);
}
