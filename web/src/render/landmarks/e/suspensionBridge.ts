// The suspension bridge: two towers with leaning legs and lit crowns, main cables sweeping
// between them strung with lights, suspenders down to a deck streaming with traffic (headlights
// one way, tail lights the other), over a dark canal that throws back the lights. It runs along
// the course a little way off. Merged set-B buckets; the traffic is GPU particles.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import { T, beam, box, catenary, mix, shade } from '../b/shapes.ts';
import type { V3 } from '../b/motion.ts';
import { finishCoast } from '../c/kit.ts';
import { CONCRETE, CONCRETE_DARK, CYAN, DARK, RED_LIGHT, STEEL } from './kit.ts';

const SALT = 0xb41d6;
const RADIUS = 210;
/** Main span between the towers, the side spans out to the anchorages, metres. */
const MAIN = 250;
const SIDE = 75;
/** Deck height, width and depth. */
const DECK_H = 30;
const DECK_W = 22;
const DECK_D = 3;
/** Towers: height, leg spread at the foot and at the top. */
const TOWER_H = 118;
const LEG_FOOT = 17;
const LEG_TOP = 12;
/** The cables sag to this height over the deck at midspan; segments per span (high, low). */
const SAG_LOW = 6;
const CABLE_SEGS = { high: 24, low: 12 } as const;
/** Suspenders every this many metres (high, low). */
const HANGER = { high: 10, low: 20 } as const;
/** Lights strung along each cable, every n-th cable point. */
const CABLE_LIGHT_EVERY = 2;
/** Traffic: cars per lane direction (high, low) and their speed, m/s. */
const CARS = { high: 26, low: 12 } as const;
const CAR_SPEED = 22;
const CANAL_W = 90;

export function createSuspensionBridge(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const rng = kit.rng;
  const accent = opts.palette.accent;
  const half = MAIN / 2;
  const end = half + SIDE;

  // --- The canal under it: dark water with the lights' reflections shimmering in it ---
  kit.solid.add(box(end * 2 + 40, 0.2, CANAL_W), mix(0x0a1424, opts.palette.sky, 0.25), T(0, 0.1, 0));
  for (const side of [-1, 1]) kit.solid.add(box(end * 2 + 40, 3, 4), CONCRETE_DARK, T(0, 0, side * (CANAL_W / 2 + 2)));
  for (let i = 0; i < kit.q(30, 14); i++) {
    const x = (rng() - 0.5) * end * 2;
    kit.lights.add(box(0.8 + rng() * 2, 0.05, 6 + rng() * 14), shade(rng() < 0.5 ? CYAN : 0xffd890, 0.35), T(x, 0.3, (rng() - 0.5) * CANAL_W * 0.7), undefined, { depth: 0.8, freq: 2 + rng() * 3, phase: rng() * 6, sharp: 2 });
  }

  // --- Deck, edge lights, approach piers and anchorages ---
  kit.solid.add(box(end * 2, DECK_D, DECK_W), CONCRETE, T(0, DECK_H - DECK_D, 0));
  for (const side of [-1, 1]) {
    kit.solid.add(box(end * 2, 1.2, 0.5), STEEL, T(0, DECK_H, side * (DECK_W / 2 - 0.25)));
    kit.lights.add(box(end * 2, 0.3, 0.3), shade(accent, 0.9), T(0, DECK_H - DECK_D - 0.2, side * (DECK_W / 2 + 0.1)));
  }
  for (const x of [-end + 10, -half - SIDE / 2, half + SIDE / 2, end - 10]) kit.solid.add(box(6, DECK_H - DECK_D, DECK_W * 0.6), CONCRETE_DARK, T(x, 0, 0));
  for (const s of [-1, 1]) kit.solid.add(box(24, DECK_H + 6, DECK_W + 10), CONCRETE_DARK, T(s * (end + 12), 0, 0));

  // --- Towers: leaning legs, cross beams, a lit crown ---
  const tops: V3[][] = [];
  for (const tx of [-half, half]) {
    const legTops: V3[] = [];
    for (const side of [-1, 1]) {
      const foot: V3 = [tx, 0, side * LEG_FOOT];
      const top: V3 = [tx, TOWER_H, side * LEG_TOP];
      kit.solid.add(beam(foot, top, 2.2, 6), CONCRETE);
      legTops.push(top);
      kit.lamp(new THREE.OctahedronGeometry(0.9), [tx, TOWER_H + 2, side * LEG_TOP], RED_LIGHT, 5, undefined, { depth: 0.95, freq: 2.4, phase: tx, sharp: 7 });
    }
    for (const y of [DECK_H - DECK_D - 2, TOWER_H * 0.62, TOWER_H - 4]) {
      const w = LEG_FOOT + (LEG_TOP - LEG_FOOT) * (y / TOWER_H);
      kit.solid.add(box(4, 4, w * 2), CONCRETE, T(tx, y - 2, 0));
    }
    // The crown: a lit arch between the leg tops.
    kit.lights.add(box(1, 2, LEG_TOP * 2 - 2), CYAN, T(tx - 2.1, TOWER_H - 7, 0), undefined, { depth: 0.3, freq: 0.8, phase: tx });
    kit.lights.add(box(1, 2, LEG_TOP * 2 - 2), CYAN, T(tx + 2.1, TOWER_H - 7, 0), undefined, { depth: 0.3, freq: 0.8, phase: tx });
    tops.push(legTops);
  }

  // --- Main cables, side cables to the anchorages, suspenders, cable lights ---
  const segs = kit.q(CABLE_SEGS.high, CABLE_SEGS.low);
  const hanger = kit.q(HANGER.high, HANGER.low);
  for (const k of [0, 1]) {
    const z = k ? LEG_TOP : -LEG_TOP;
    const a: V3 = [-half, TOWER_H, z];
    const b: V3 = [half, TOWER_H, z];
    const main = catenary(a, b, TOWER_H - DECK_H - SAG_LOW, segs);
    const runs = [main, catenary([-end - 12, DECK_H + 4, z], a, 8, Math.ceil(segs / 3)), catenary(b, [end + 12, DECK_H + 4, z], 8, Math.ceil(segs / 3))];
    for (const run of runs) {
      for (let i = 0; i + 1 < run.length; i++) kit.solid.add(beam(run[i], run[i + 1], 0.6, 4), DARK);
      run.forEach((p, i) => {
        if (i % CABLE_LIGHT_EVERY === 0) kit.lamp(new THREE.OctahedronGeometry(0.5), p, mix(CYAN, 0xffffff, 0.3), 2.4, undefined, { depth: 0.4, freq: 1.5, phase: p[0] * 0.05, sharp: 1 });
      });
    }
    // Suspenders hang from the main cable to the deck edge.
    for (let x = -half + hanger; x < half; x += hanger) {
      const t = (x + half) / MAIN;
      const y = TOWER_H - (TOWER_H - DECK_H - SAG_LOW) * 4 * t * (1 - t);
      kit.solid.add(beam([x, y, z], [x, DECK_H, z * ((DECK_W / 2 - 0.5) / LEG_TOP)], 0.15, 3), STEEL);
    }
  }

  // --- Traffic: headlights one way, tail lights the other, looping along the deck ---
  const traffic = kit.particles(true, 1.4);
  const length = end * 2;
  const period = length / CAR_SPEED;
  for (const [dir, lane, color] of [[1, -DECK_W * 0.22, 0xfff4e0], [-1, DECK_W * 0.22, 0xff3020]] as const) {
    for (let c = 0; c < kit.q(CARS.high, CARS.low); c++) {
      // Both lamps of a car share its phase, so they travel as a pair.
      const phase = rng() * period;
      for (const dz of [-0.8, 0.8]) traffic.add([-dir * end, DECK_H + 1, lane + dz], [dir * CAR_SPEED, 0, 0], color, 1.6, { period, lifetime: period, phase }, { fadeIn: 0.01 });
    }
  }
  return finishCoast(kit, RADIUS);
}
