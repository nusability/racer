// The waterfall: a river pours off a cliff of mossy dark stone in two leaps, first into a
// rock basin halfway down, then in a wider curtain into a green plunge pool, mist boiling off
// it and drifting through the trees. Ferns crowd every ledge, moss hangs in beards from the
// lip, giants stand on the clifftop with their roots over the edge, and a stream winds out of
// the pool toward the trail. By day a rainbow stands in the spray.
//
// Placement: scenery (no hazard), side either, distance 20–60, scale 0.8–1.3. Best on the
// outside of a bend, where the approach looks straight at the falls.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import { T, box, mix, shade, vary } from '../b/shapes.ts';
import { quadPts } from '../b/props.ts';
import type { V3 } from '../b/motion.ts';
import { finishCoast, smoke } from '../c/kit.ts';
import { FERN, FOAM, MOSS, STONE_DARK, WATER, fern, giant, mossyRock } from './kit.ts';

const SALT = 0x3a7e7;
const RADIUS = 140;
/** The cliff face runs along X at this z, rising to LIP_H; the falls take the middle FALL_W. */
const CLIFF_Z = RADIUS * 0.2;
const LIP_H = 82;
const CLIFF_W = RADIUS * 0.95;
const COLS = { high: 26, low: 14 } as const;
const ROWS = 6;
/** The basin halfway down where the upper fall lands: its height and how far it juts out (m). */
const BASIN_H = 38;
const BASIN_OUT = 14;
/** The upper and lower falls' widths, and the bands of running water in each (high, low). */
const UPPER_W = 16;
const LOWER_W = 30;
const BANDS = { high: 26, low: 14 } as const;
/** Spray: droplets pouring off each lip (high, low). */
const DROPS = { high: 220, low: 90 } as const;
const POOL = { z: CLIFF_Z - 42, r: 40 } as const;
const MIST = { high: 36, low: 16 } as const;
const RAINBOW = { r: 34, band: 1.6, y: -6, strength: 0.2 } as const;
const RAINBOW_COLOURS = [0xff3030, 0xff9a20, 0xffee30, 0x40e060, 0x30a0ff, 0x7040e0];
/** Running water's brightness by day and at dusk (it holds the sky's light). */
const WATER_DAY = 0.85;
const WATER_DUSK = 0.55;

/** The cliff's front face at (x, y): buttressed, set back where the water has cut it. */
function cliffZ(x: number, y: number): number {
  const cut = Math.exp(-((x / (LOWER_W * 0.9)) ** 2));
  return CLIFF_Z + 6 * Math.sin(x * 0.08 + y * 0.04) + 4 * Math.sin(x * 0.21) + cut * 10 + (y < BASIN_H ? 0 : BASIN_OUT * cut);
}

export function createWaterfall(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const rng = kit.rng;
  const dusk = opts.palette.dusk;
  const rock = mix(opts.palette.rock, STONE_DARK, 0.5);
  const moss = mix(opts.palette.sand, MOSS, 0.6);
  const water = mix(FOAM, WATER, 0.25).multiplyScalar(WATER_DAY + (WATER_DUSK - WATER_DAY) * dusk);

  // --- The cliff: jagged dark stone, moss on its ledges, lower to either side ---
  const nx = kit.q(COLS.high, COLS.low);
  const top = (x: number) => LIP_H * (1 - 0.5 * (Math.abs(x) / CLIFF_W) ** 2) + 6 * Math.sin(x * 0.13);
  const at = (i: number, j: number): V3 => {
    const x = -CLIFF_W + (2 * CLIFF_W * i) / nx;
    const y = (top(x) * j) / ROWS;
    return [x, y, cliffZ(x, y)];
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ROWS; j++) {
      const wet = Math.exp(-((at(i, j)[0] / LOWER_W) ** 2)) * 0.4;
      kit.solid.add(quadPts(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)), vary(rng, shade(rock, 1 - wet + 0.12 * Math.sin(i * 1.9)), 0.06));
      if (j > 0 && rng() < 0.4) {
        const [x, y, z] = at(i, j);
        kit.solid.add(box((2 * CLIFF_W) / nx + 2, 1.2, 4), vary(rng, moss, 0.06), T(x + CLIFF_W / nx, y - 0.5, z - 1.5));
        if (rng() < 0.5) fern(kit.solid, x + CLIFF_W / nx, z - 2, 3 + rng() * 2, rng, FERN, undefined, y + 0.2);
      }
      // Beards of moss hanging off the lip.
      if (j === ROWS - 1 && rng() < 0.6) {
        const [x, y, z] = at(i, j + 1);
        kit.solid.add(new THREE.ConeGeometry(1.2, 6 + rng() * 6, 4).rotateX(Math.PI).translate(0, -4, 0), vary(rng, moss, 0.08), T(x, y, z - 1));
      }
    }
    // The wooded plateau above, running back from the lip.
    const a = at(i, ROWS);
    const b = at(i + 1, ROWS);
    kit.solid.add(quadPts(a, b, [b[0], b[1] + 4, b[2] + 90], [a[0], a[1] + 4, a[2] + 90]), vary(rng, moss, 0.05));
  }
  for (let t = 0; t < kit.q(6, 3); t++) {
    const x = (t % 2 ? 1 : -1) * (LOWER_W + rng() * CLIFF_W * 0.6);
    const z = cliffZ(x, top(x)) + 10 + rng() * 40;
    giant(kit, kit.solid, x, z, 70 + rng() * 30, 4 + rng() * 2, rng, { base: top(x) - 2 });
  }

  // --- The basin halfway down, and the river's channel at the lip ---
  kit.solid.add(new THREE.CylinderGeometry(UPPER_W, UPPER_W * 0.8, 6, 10), rock, T(0, BASIN_H - 6, cliffZ(0, BASIN_H) - BASIN_OUT * 0.6));
  kit.solid.add(new THREE.CircleGeometry(UPPER_W * 0.9, 10).rotateX(-Math.PI / 2), mix(WATER, FOAM, 0.3), T(0, BASIN_H + 0.1, cliffZ(0, BASIN_H) - BASIN_OUT * 0.6));
  kit.solid.add(box(UPPER_W + 4, 2, 40), mix(WATER, opts.palette.sky, 0.3), T(0, LIP_H - 3, cliffZ(0, LIP_H) + 20));

  // --- Running water: bands of light marching down each fall (the twinkle's phase runs down) ---
  const falls: { y0: number; y1: number; w: number; z: (y: number) => number }[] = [
    { y0: LIP_H - 2, y1: BASIN_H, w: UPPER_W, z: (y) => cliffZ(0, y) - 3 },
    { y0: BASIN_H - 2, y1: 0, w: LOWER_W, z: (y) => cliffZ(0, y) - 3 - (BASIN_H - y) * 0.15 },
  ];
  const nB = kit.q(BANDS.high, BANDS.low);
  for (const f of falls) {
    const step = (f.y0 - f.y1) / nB;
    for (let i = 0; i < nB; i++) {
      const y = f.y0 - (i + 1) * step;
      const w = f.w * (1 + (i / nB) * 0.25);
      kit.lights.add(box(w, step + 0.4, 0.8), vary(rng, water, 0.04), T(0, y, f.z(y)), undefined, { depth: 0.45, freq: 6, phase: i * 0.8, sharp: 2 });
      // Streaks at the curtain's edges, broken and shorter.
      for (const s of [-1, 1]) kit.lights.add(box(1.6, step * 0.8, 0.8), shade(water, 1.05), T(s * (w / 2 + 0.4), y, f.z(y) - 0.3), undefined, { depth: 0.8, freq: 6, phase: i * 0.8 + 1, sharp: 3 });
    }
    kit.solid.add(box(f.w + 4, f.y0 - f.y1, 1.5), mix(WATER, rock, 0.3), T(0, f.y1, f.z((f.y0 + f.y1) / 2) + 1.5));
  }
  // Droplets pouring off both lips and spray bursting up at the feet of the falls.
  const drops = kit.particles(false, 1.2);
  for (const [f, i] of falls.map((f, i) => [f, i] as const)) {
    for (let k = 0; k < kit.q(DROPS.high, DROPS.low) / 2; k++) {
      const x = (rng() - 0.5) * f.w;
      const fallT = Math.sqrt((2 * (f.y0 - f.y1)) / 9.8);
      drops.add([x, f.y0, f.z(f.y0) - 1], [(rng() - 0.5) * 1.5, 0, -1.5 - rng()], mix(FOAM, water, rng() * 0.4), 1.2 + rng() * 1.2, { period: fallT, lifetime: fallT, phase: rng() * fallT, grow: 0.3 }, { gravity: 9.8, drag: 0.05, fadeIn: 0.05 });
    }
    const foot: V3 = [0, f.y1 + 1, f.z(f.y1) - 4 - i * 4];
    for (let k = 0; k < kit.q(20, 10); k++) {
      const a = rng() * Math.PI * 2;
      drops.add(foot, [Math.cos(a) * 4, 4 + rng() * 4, Math.sin(a) * 4 - 2], mix(FOAM, water, 0.3), 1.2 + rng() * 1.2, { period: 1.4, lifetime: 1.4, phase: rng() * 1.4, grow: 0.5 }, { gravity: 9.8, drag: 0.4, fadeIn: 0.05 });
    }
  }

  // --- The plunge pool, its foam, and the stream toward the trail ---
  kit.solid.add(new THREE.CircleGeometry(POOL.r, 20).rotateX(-Math.PI / 2), mix(WATER, opts.palette.sky, 0.2), T(0, 0.2, POOL.z));
  for (let k = 0; k < kit.q(16, 8); k++) {
    const a = rng() * Math.PI * 2;
    const r = 6 + rng() * POOL.r * 0.6;
    kit.moving.add(new THREE.CircleGeometry(1.5 + rng() * 2.5, 6).rotateX(-Math.PI / 2), FOAM, T(Math.cos(a) * r, 0.35, POOL.z + Math.sin(a) * r), { drift: [Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5], driftFreq: 0.6 + rng() * 0.4, phase: k });
  }
  for (let k = 0; k < kit.q(18, 9); k++) mossyRock(kit.solid, Math.cos(k * 0.7) * POOL.r * (1 + rng() * 0.15), POOL.z + Math.sin(k * 0.7) * POOL.r * (1 + rng() * 0.15), 2 + rng() * 3, rng);
  let prev: V3 = [0, 0.25, POOL.z - POOL.r * 0.9];
  for (let i = 1; i <= 6; i++) {
    const p: V3 = [Math.sin(i * 0.9) * 10, 0.25, POOL.z - POOL.r * 0.9 - i * 14];
    const w = 7 - i * 0.4;
    kit.solid.add(quadPts([prev[0] - w, 0.25, prev[2]], [prev[0] + w, 0.25, prev[2]], [p[0] + w, 0.25, p[2]], [p[0] - w, 0.25, p[2]]), mix(WATER, opts.palette.sky, 0.25));
    prev = p;
  }
  for (let i = 0; i < kit.q(36, 16); i++) fern(kit.solid, (rng() - 0.5) * RADIUS * 1.6, POOL.z - POOL.r - rng() * 40 + (rng() < 0.5 ? 0 : 50), 3 + rng() * 3, rng);

  // --- Mist off the pool, drifting toward the trail ---
  const mist = kit.particles(false, 0.8);
  smoke(mist, rng, [0, 2, POOL.z + 10], { count: kit.q(MIST.high, MIST.low), color: mix(0xffffff, opts.palette.horizon, 0.6), size: 7, rise: 3, wind: [2, 0, -5], period: 8, spread: 40, grow: 0.3 });

  // --- The rainbow in the spray, by day ---
  const bow = Math.max(0, 1 - dusk * 1.3) * RAINBOW.strength;
  if (bow > 0) {
    RAINBOW_COLOURS.forEach((c, i) => {
      const r = RAINBOW.r - i * RAINBOW.band;
      kit.beams.add(new THREE.RingGeometry(r - RAINBOW.band, r, 24, 1, 0, Math.PI), shade(c, bow), T(0, RAINBOW.y, POOL.z - 6, 0.15), undefined, { depth: 0.3, freq: 0.5, phase: i * 0.2 });
    });
  }

  return finishCoast(kit, RADIUS);
}
