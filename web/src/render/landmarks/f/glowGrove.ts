// The glow grove: a hollow among the giants where mushrooms grow to the size of trees. Pale
// stems rise to broad caps whose gills and speckles glow teal, blue and violet; smaller ones
// crowd round their feet and climb the trunks in shelves; glowing threads hang from the
// boughs, and spores drift up through the air in slow sparks. By day it is a strange pale
// garden; at dusk it is the brightest place in the woods, every cap breathing light.
//
// Placement: scenery (no hazard), side either, distance 5–40, scale 0.8–1.3. Pairs well with
// a dusk palette; close to the trail so the light spills onto it.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import { T, beam, dome, mix, prism, shade, vary } from '../b/shapes.ts';
import type { V3 } from '../b/motion.ts';
import { finishCoast } from '../c/kit.ts';
import { FERN, GLOW, MOSS, fern, giant, mossyRock } from './kit.ts';

const SALT = 0x6107e;
const RADIUS = 90;
/** Giant mushrooms (high, low): stem height and cap radius ranges (m). */
const GIANTS = { high: 9, low: 5 } as const;
const STEM_H: readonly [number, number] = [6, 18];
const CAP_R: readonly [number, number] = [4, 11];
/** Small mushrooms round their feet and up the trunks (high, low). */
const SMALL = { high: 70, low: 30 } as const;
const SHELVES = { high: 24, low: 10 } as const;
/** Glowing threads hanging from the boughs (high, low), their length (m). */
const THREADS = { high: 30, low: 12 } as const;
const THREAD_LEN: readonly [number, number] = [8, 24];
/** Spores drifting up (high, low): how high they rise (m) and how long they live (s). */
const SPORES = { high: 220, low: 90 } as const;
const SPORE_RISE = 30;
const SPORE_LIFE = 9;
/** Light by day and at deep dusk: the caps' undersides, speckles and halos. */
const GLOW_DAY = 0.55;
const GLOW_DUSK = 1;
const HALO_DAY = 1;
const HALO_DUSK = 6;
const STEM = 0xd8d0c0;
const CAP_TOP = 0x8a7a8a;
/** The caps breathe: brightness dips this much, this slowly (rad/s). */
const BREATHE = { depth: 0.35, freq: 0.5 } as const;

export function createGlowGrove(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const rng = kit.rng;
  const dusk = opts.palette.dusk;
  const light = GLOW_DAY + (GLOW_DUSK - GLOW_DAY) * dusk;
  const halo = HALO_DAY + (HALO_DUSK - HALO_DAY) * dusk;
  const glowOf = (i: number) => shade(GLOW[i % GLOW.length], light);
  const breathe = (phase: number) => ({ depth: BREATHE.depth, freq: BREATHE.freq, phase, sharp: 1.5 });

  // The hollow's giants, whose trunks the shelves climb and whose boughs the threads hang from.
  const trunks: [number, number, number][] = [
    [-55, 30, 6],
    [48, 40, 6.5],
    [10, 70, 5.5],
  ];
  for (const [x, z, r] of trunks) giant(kit, kit.solid, x, z, 90 + rng() * 20, r, rng);

  // --- The giant mushrooms: pale stems, domed caps, glowing gills and speckles ---
  const nG = kit.q(GIANTS.high, GIANTS.low);
  for (let i = 0; i < nG; i++) {
    const a = (i / nG) * Math.PI * 2 + rng() * 0.5;
    const d = 12 + rng() * RADIUS * 0.45;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = STEM_H[0] + rng() * (STEM_H[1] - STEM_H[0]);
    const cr = CAP_R[0] + ((h - STEM_H[0]) / (STEM_H[1] - STEM_H[0])) * (CAP_R[1] - CAP_R[0]) * (0.8 + rng() * 0.4);
    const lean = (rng() - 0.5) * 0.2;
    const tip: V3 = [x + Math.sin(lean) * h, h, z];
    kit.solid.add(beam([x, 0, z], tip, cr * 0.16, 8), vary(rng, STEM, 0.04));
    kit.solid.add(prism(cr * 0.3, cr * 0.18, h * 0.12, 8), vary(rng, STEM, 0.04), T(x, 0, z));
    kit.solid.add(dome(cr, 12, 5, 0.5), vary(rng, mix(CAP_TOP, GLOW[i % GLOW.length], 0.15), 0.05), T(tip[0], tip[1], tip[2], 0, 0, lean));
    // The gills under the cap: a glowing disc, and a halo that blooms at dusk.
    kit.lamp(new THREE.CircleGeometry(cr * 0.95, 12).rotateX(Math.PI / 2), [tip[0], tip[1] - 0.05, tip[2]], glowOf(i), halo * cr * 0.5, undefined, breathe(i * 1.3));
    // Speckles on the cap.
    for (let s = 0; s < kit.q(8, 4); s++) {
      const sa = rng() * Math.PI * 2;
      const sr = cr * (0.2 + rng() * 0.6);
      const sy = tip[1] + cr * 0.5 * Math.sqrt(Math.max(0, 1 - (sr / cr) ** 2));
      kit.lights.add(new THREE.CircleGeometry(cr * 0.06, 5).rotateX(-Math.PI / 2), shade(glowOf(i + 1), 1.1), T(tip[0] + Math.cos(sa) * sr, sy + 0.05, tip[2] + Math.sin(sa) * sr), undefined, breathe(i + s));
    }
  }

  // --- Small ones crowding the floor, and shelves climbing the giants' trunks ---
  for (let i = 0; i < kit.q(SMALL.high, SMALL.low); i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * RADIUS * 0.8;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = 0.5 + rng() * 2;
    const cr = h * (0.5 + rng() * 0.4);
    kit.solid.add(prism(cr * 0.18, cr * 0.15, h, 5), STEM, T(x, 0, z));
    kit.lights.add(dome(cr, 6, 2, 0.5), glowOf(i), T(x, h, z), undefined, breathe(i * 0.37));
  }
  for (let i = 0; i < kit.q(SHELVES.high, SHELVES.low); i++) {
    const [tx, tz, tr] = trunks[i % trunks.length];
    const a = rng() * Math.PI * 2;
    const y = 2 + rng() * 25;
    const r = tr * (1.05 - (y / 100) * 0.4);
    kit.lights.add(new THREE.CylinderGeometry(1.6 + rng(), 1.6 + rng(), 0.4, 8, 1, false, 0, Math.PI), glowOf(i + 2), T(tx + Math.cos(a) * r, y, tz + Math.sin(a) * r, -a + Math.PI / 2), undefined, breathe(i * 0.7));
  }

  // --- Glowing threads hanging from the boughs, swaying ---
  for (let i = 0; i < kit.q(THREADS.high, THREADS.low); i++) {
    const [tx, tz] = trunks[i % trunks.length];
    const a = rng() * Math.PI * 2;
    const out = 10 + rng() * 18;
    const top: V3 = [tx + Math.cos(a) * out, 40 + rng() * 25, tz + Math.sin(a) * out];
    const len = THREAD_LEN[0] + rng() * (THREAD_LEN[1] - THREAD_LEN[0]);
    kit.lights.add(beam(top, [top[0], top[1] - len, top[2]], 0.08, 3), glowOf(i), undefined, { pivot: top, axisB: [1, 0, 0], swingB: 0.05, freq: 0.4 + rng() * 0.3, phase: i }, breathe(i));
    kit.halos.point([top[0], top[1] - len, top[2]], glowOf(i), halo * 1.5, { pivot: top, axisB: [1, 0, 0], swingB: 0.05, freq: 0.4, phase: i }, breathe(i));
  }

  // --- Spores drifting up through the hollow ---
  const spores = kit.particles(true, 1.6);
  for (let i = 0; i < kit.q(SPORES.high, SPORES.low); i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * RADIUS * 0.7;
    spores.add([Math.cos(a) * d, 1 + rng() * 6, Math.sin(a) * d], [(rng() - 0.5) * 0.8, SPORE_RISE / SPORE_LIFE, (rng() - 0.5) * 0.8], glowOf(i), 0.5 + rng() * 0.8, { period: SPORE_LIFE, lifetime: SPORE_LIFE, phase: rng() * SPORE_LIFE, grow: 0 }, { drag: 0, jitter: 3, fadeIn: 0.25 });
  }

  // --- The floor: moss, ferns, stones ---
  kit.solid.add(new THREE.CircleGeometry(RADIUS * 0.85, 16).rotateX(-Math.PI / 2), mix(opts.palette.sand, MOSS, 0.5), T(0, 0.08, 0));
  for (let i = 0; i < kit.q(36, 16); i++) {
    const a = rng() * Math.PI * 2;
    const d = RADIUS * (0.3 + rng() * 0.6);
    fern(kit.solid, Math.cos(a) * d, Math.sin(a) * d, 2.5 + rng() * 3, rng, FERN);
  }
  for (let i = 0; i < kit.q(8, 4); i++) mossyRock(kit.solid, (rng() - 0.5) * RADIUS * 1.4, (rng() - 0.5) * RADIUS * 1.4, 1.2 + rng() * 2, rng);

  return finishCoast(kit, RADIUS);
}
