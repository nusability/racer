// The frozen falls: a great waterfall caught mid-plunge down a dark cliff. Tiers of bulging ice
// and curtains of icicles hang from the lip; down the middle a core still runs, its water pulsing
// down in bright bands into a half-frozen plunge pool that breathes mist. By day a rainbow stands
// in the spray; at night the open water and the core glow cold blue.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { T, box, mix, shade, vary } from '../b/shapes.ts';
import { quadPts } from '../b/props.ts';
import type { V3 } from '../b/motion.ts';
import { smoke } from '../c/kit.ts';
import { DARK, ICE, ICE_DEEP, IceKit, WATER } from './kit.ts';

const SALT = 0xfa115;
const RADIUS = 210;
/** The cliff face runs along X at this z, rising to LIP_H; the falls take the middle FALL_W. */
const CLIFF_Z = RADIUS * 0.15;
const LIP_H = 150;
const CLIFF_W = RADIUS * 0.95;
const FALL_W = 120;
const CLIFF_COLS = { high: 30, low: 18 } as const;
const CLIFF_ROWS = 6;
const TIERS = 5;
const ICICLES = { high: 160, low: 80 } as const;
const CORE_W = 16;
const CORE_BANDS = { high: 34, low: 20 } as const;
const POOL = { z: CLIFF_Z - 55, r: 62 } as const;
const MIST = { high: 120, low: 60 } as const;
const RAINBOW = { r: 70, band: 2.6, y: -18 } as const;
const RAINBOW_COLOURS = [0xff3030, 0xff9a20, 0xffee30, 0x40e060, 0x30a0ff, 0x7040e0];
const SPARKLES = { high: 70, low: 30 } as const;
const LEDGE_CHANCE = 0.3;
/** Self-lit ice brightness by day, and how much of it fades by night. */
const ICE_GLOW = 0.85;
const ICE_GLOW_DUSK = 0.5;

/** The cliff's front face at (x, y): bulging and buttressed, set back over the falls. */
function cliffZ(x: number, y: number): number {
  const fall = Math.exp(-((x / (FALL_W * 0.6)) ** 2));
  return CLIFF_Z + 8 * Math.sin(x * 0.07 + y * 0.03) + 5 * Math.sin(x * 0.19) + fall * 22 - (y / LIP_H) * 6;
}

export function createFrozenFalls(opts: LandmarkOptions): Landmark {
  const ik = new IceKit(opts, SALT);
  const { rng } = ik;
  const kit = ik.b;
  const dusk = opts.palette.dusk;
  const snow = ik.snow;
  const rock = mix(opts.palette.rock, DARK, 0.25);
  const ice = mix(ICE, 0xffffff, 0.4);
  const blue = mix(ICE_DEEP, ICE, 0.35);
  const iceGlow = ICE_GLOW * (1 - ICE_GLOW_DUSK * dusk);

  // --- The cliff: a jagged face, snow on its ledges, height falling away to either side ---
  const nx = ik.q(CLIFF_COLS.high, CLIFF_COLS.low);
  const top = (x: number) => LIP_H * (1 - 0.55 * (Math.abs(x) / CLIFF_W) ** 2) + 10 * Math.sin(x * 0.11);
  const at = (i: number, j: number): V3 => {
    const x = -CLIFF_W + (2 * CLIFF_W * i) / nx;
    const y = (top(x) * j) / CLIFF_ROWS;
    return [x, y, cliffZ(x, y)];
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < CLIFF_ROWS; j++) {
      // Rock in vertical streaks (darker where water has stained it), snow lying on ledges.
      const stain = Math.exp(-((at(i, j)[0] / (FALL_W * 0.9)) ** 2)) * 0.35;
      kit.solid.add(quadPts(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)), vary(rng, shade(rock, 1 - stain + 0.15 * Math.sin(i * 1.7)), 0.06));
      if (j > 0 && rng() < LEDGE_CHANCE) {
        const [x, y, z] = at(i, j);
        kit.solid.add(box((2 * CLIFF_W) / nx + 2, 1.4, 5), vary(rng, snow, 0.03), T(x + CLIFF_W / nx, y - 0.6, z - 2, (rng() - 0.5) * 0.2));
      }
    }
    // The plateau above, snowbound, running back from the lip.
    const a = at(i, CLIFF_ROWS);
    const b = at(i + 1, CLIFF_ROWS);
    kit.solid.add(quadPts(a, b, [b[0], b[1] + 6, b[2] + 120], [a[0], a[1] + 6, a[2] + 120]), vary(rng, snow, 0.03));
  }

  // --- The falls: tiers of bulging ice, each fringed with icicles ---
  for (let t = 0; t < TIERS; t++) {
    const y0 = LIP_H * (1 - t / TIERS);
    const w = FALL_W * (0.55 + 0.45 * (1 - t / TIERS) ** 0.5) * (0.9 + rng() * 0.2);
    const blobs = ik.q(9, 5);
    for (let k = 0; k < blobs; k++) {
      const x = -w / 2 + (k + 0.5) * (w / blobs) + (rng() - 0.5) * 6;
      const s = 7 + rng() * 6;
      // Every other bulge is self-lit: ice holds light even when the sun is behind the cliff.
      const m = T(x, y0 - s * 1.2, cliffZ(x, y0) - s * 0.5, rng() * 3, 0, 0, [s, s * 1.8, s * 0.8]);
      if (k % 2) kit.lights.add(new THREE.IcosahedronGeometry(1, 1), vary(rng, shade(ice, iceGlow), 0.04), m);
      else kit.solid.add(new THREE.IcosahedronGeometry(1, 1), vary(rng, blue, 0.04), m);
    }
    // A sheet behind the blobs so the tier reads as one frozen pour.
    kit.solid.add(box(w, LIP_H / TIERS + 4, 3), mix(ice, blue, 0.5), T(0, y0 - LIP_H / TIERS - 2, cliffZ(0, y0) - 3));
  }
  const nIce = ik.q(ICICLES.high, ICICLES.low);
  for (let k = 0; k < nIce; k++) {
    // Most hang from the falls' tiers; some fringe the lip either side.
    const onFalls = k < nIce * 0.7;
    const x = onFalls ? (rng() - 0.5) * FALL_W : (rng() < 0.5 ? -1 : 1) * (FALL_W * 0.5 + rng() * CLIFF_W * 0.5);
    const y = onFalls ? LIP_H * (1 - Math.floor(rng() * TIERS) / TIERS) - 4 : top(x) - 1;
    const len = 6 + rng() * (onFalls ? 26 : 16);
    const r = 0.8 + rng() * 1.6;
    kit.solid.add(new THREE.ConeGeometry(r, len, 5).rotateX(Math.PI).translate(0, -len / 2, 0), vary(rng, rng() < 0.6 ? ice : blue, 0.05), T(x, y, cliffZ(x, y) - (onFalls ? 12 + rng() * 6 : 3)));
  }

  // --- The running core: bands of light marching down the middle of the falls ---
  const nBands = ik.q(CORE_BANDS.high, CORE_BANDS.low);
  for (let i = 0; i < nBands; i++) {
    const y = LIP_H * (1 - (i + 0.5) / nBands);
    const z = cliffZ(0, y) - 16;
    const color = mix(0xd8f8ff, 0x60c8ff, (i % 4) / 4);
    kit.lights.add(box(CORE_W * (0.8 + 0.3 * Math.sin(i)), LIP_H / nBands + 0.6, 1), color, T(0, y - LIP_H / nBands / 2, z), undefined, { depth: 0.55, freq: 5, phase: i * 0.7, sharp: 2 });
  }
  kit.solid.add(box(CORE_W + 6, LIP_H, 2), mix(WATER, ICE_DEEP, 0.5), T(0, 0, cliffZ(0, LIP_H / 2) - 14));

  // --- Plunge pool: an ice shelf ring round open water that glows at night ---
  kit.solid.add(new THREE.CircleGeometry(POOL.r, 20).rotateX(-Math.PI / 2), mix(ice, snow, 0.5), T(0, 0.15, POOL.z));
  kit.lamp(new THREE.CircleGeometry(POOL.r * 0.45, 16).rotateX(-Math.PI / 2), [0, 0.3, POOL.z + 12], shade(mix(ICE_DEEP, 0x30e0ff, 0.4), 0.45 + 0.55 * dusk), 0, undefined, { depth: 0.25, freq: 1.4, phase: 0 });
  for (let k = 0; k < ik.q(18, 9); k++) {
    const a = rng() * Math.PI * 2;
    const r = POOL.r * (0.55 + rng() * 0.35);
    const s = 3 + rng() * 5;
    kit.moving.add(new THREE.CylinderGeometry(s, s, 1, 5), vary(rng, ice, 0.04), T(Math.cos(a) * r, 0.3, POOL.z + Math.sin(a) * r, rng() * 3), { drift: [Math.cos(a) * 0.6, 0.15, Math.sin(a) * 0.6], driftFreq: 0.7 + rng() * 0.4, phase: k });
  }
  // A frozen river winding out of the pool toward the front of the footprint.
  let prev: V3 = [0, 0.2, POOL.z - POOL.r * 0.8];
  for (let i = 1; i <= 8; i++) {
    const z = POOL.z - POOL.r * 0.8 - i * 20;
    const p: V3 = [Math.sin(i * 0.8) * 18, 0.2, z];
    const w = 14 + i;
    kit.solid.add(quadPts([prev[0] - w, 0.2, prev[2]], [prev[0] + w, 0.2, prev[2]], [p[0] + w, 0.2, p[2]], [p[0] - w, 0.2, p[2]]), mix(ice, blue, 0.3));
    prev = p;
  }

  // --- Mist boiling off the pool and the core, and spray from the lip ---
  const mist = kit.particles(false, 0.8);
  smoke(mist, rng, [0, 2, POOL.z + 18], { count: ik.q(MIST.high, MIST.low) * 0.5, color: mix(0xffffff, opts.palette.horizon, 0.2), size: 11, rise: 6, wind: [3, 0, -6], period: 7, spread: 50, grow: 0.4 });
  smoke(mist, rng, [0, LIP_H - 6, cliffZ(0, LIP_H) - 12], { count: ik.q(MIST.high, MIST.low) * 0.3, color: 0xffffff, size: 9, rise: -3, wind: [2, 0, -3], period: 5, spread: 14, grow: 0.5 });

  // --- The rainbow: concentric additive bands standing in the spray, fading out at dusk ---
  const bow = Math.max(0, 1 - dusk * 1.3) * RAINBOW_STRENGTH;
  if (bow > 0) {
    RAINBOW_COLOURS.forEach((c, i) => {
      const r = RAINBOW.r - i * RAINBOW.band;
      kit.beams.add(new THREE.RingGeometry(r - RAINBOW.band, r, 28, 1, 0, Math.PI), shade(c, bow), T(0, RAINBOW.y, POOL.z - 10, 0.2), undefined, { depth: 0.3, freq: 0.5, phase: i * 0.2 });
    });
  }

  // --- Sparkle on the ice ---
  for (let k = 0; k < ik.q(SPARKLES.high, SPARKLES.low); k++) {
    const x = (rng() - 0.5) * FALL_W * 1.1;
    const y = rng() * LIP_H;
    kit.halos.point([x, y, cliffZ(x, y) - 18], mix(0xffffff, ICE, rng() * 0.4), 1.5 + rng() * 2.5, undefined, { depth: 1, freq: 2 + rng() * 4, phase: rng() * 20, sharp: 14 });
  }

  return ik.finish(RADIUS, RADIUS, LIP_H + 40, () => {});
}

const RAINBOW_STRENGTH = 0.32;
