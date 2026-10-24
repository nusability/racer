// The stadium: an oval bowl wrapped in an LED skin that ripples with colour, a cantilevered
// roof ring, a floodlit pitch, tiers packed with a crowd doing the wave, four floodlight masts
// throwing beams down onto the game, a giant screen at one end running ads, and fireworks
// bursting over the roof. Merged set-B buckets animated on the GPU, the screen one board.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import { T, box, mix, pick, prism, shade, vary } from '../b/shapes.ts';
import { sphereDir } from '../b/points.ts';
import type { V3 } from '../b/motion.ts';
import { finishCoast, lightCone } from '../c/kit.ts';
import { neonSigns, signBoards } from '../../neonSigns.ts';
import { CONCRETE, CONCRETE_DARK, DARK, NEON, STEEL } from './kit.ts';

const SALT = 0x57ad1;
const RADIUS = 130;
/** The bowl's half-length (x) and half-width (z) at its outer wall, and its height. */
const BOWL_X = 120;
const BOWL_Z = 90;
const BOWL_H = 34;
/** Segments round the oval (high, low). */
const SEGMENTS = { high: 40, low: 24 } as const;
/** Pitch half-size, and the tiers between pitch and wall. */
const PITCH_X = 52;
const PITCH_Z = 34;
const TIERS = 8;
/** LED skin: bands up the wall and the colour wave's speed (rad/s) round the bowl. */
const LED_BANDS = 3;
const LED_WAVE = 1.6;
/** The LED skin stands this far proud of the wall's centre line (past its half-thickness). */
const LED_PROUD = 1.8;
/** Spectators per tier step round the bowl, every n-th tier (high, low), drawn larger than life. */
const SEAT_STEP = { high: 5, low: 9 } as const;
const TIER_STRIDE = { high: 1, low: 2 } as const;
const SPECTATOR_SCALE = 1.6;
const WAVE_PERIOD = 7;
/** Floodlight masts: height; beams by day and at deep dusk. */
const MAST_H = 62;
const BEAM_DAY = 0.04;
const BEAM_DUSK = 0.1;
/** Fireworks (high quality only): bursts and sparks per burst. */
const BURSTS = { high: 5, low: 0 } as const;
const SPARKS = 34;
const SCREEN_W = 40;
const SIGN_DAY = 0.6;
const SIGN_DUSK = 1;

export function createStadium(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const rng = kit.rng;
  const dusk = opts.palette.dusk;
  const n = kit.q(SEGMENTS.high, SEGMENTS.low);
  const oval = (t: number, s: number): [number, number] => [Math.cos(t) * BOWL_X * s, Math.sin(t) * BOWL_Z * s];

  // --- The bowl: outer wall in segments, its LED skin, the roof ring ---
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * Math.PI * 2;
    const t1 = ((i + 1) / n) * Math.PI * 2;
    const [x0, z0] = oval(t0, 1);
    const [x1, z1] = oval(t1, 1);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(-(z1 - z0), x1 - x0);
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    kit.solid.add(box(len + 0.4, BOWL_H, 3), i % 2 ? CONCRETE : shade(CONCRETE, 0.9), T(mx, 0, mz, yaw));
    // LED bands: colour runs round the bowl as a wave (twinkle phase follows the angle).
    for (let b = 0; b < LED_BANDS; b++) {
      const col = NEON[(b + i) % NEON.length];
      const out = Math.hypot(mx, mz);
      kit.lights.add(box(len + 0.4, 2.2, 0.4), col, T(mx + (mx / out) * LED_PROUD, 8 + b * 8, mz + (mz / out) * LED_PROUD, yaw), undefined, { depth: 0.7, freq: LED_WAVE, phase: -t0 * 3 + b, sharp: 1.5 });
    }
    // The roof ring: a cantilevered band leaning in over the stands, lit underneath.
    const [rx0, rz0] = oval(t0, 0.86);
    const [rx1, rz1] = oval(t1, 0.86);
    kit.solid.add(box(Math.hypot(rx1 - rx0, rz1 - rz0) + 1, 1.2, BOWL_Z * 0.3), DARK, T((rx0 + rx1) / 2, BOWL_H + 2, (rz0 + rz1) / 2, yaw, -0.08));
    kit.lights.add(box(Math.hypot(rx1 - rx0, rz1 - rz0), 0.3, 1), shade(0xf4f8ff, 0.85), T((rx0 + rx1) / 2 * 0.86, BOWL_H + 1.4, (rz0 + rz1) / 2 * 0.86, yaw));
  }

  // --- Stands: tiers stepping up from the pitch to the wall, with the crowd ---
  const waveFreq = (Math.PI * 2) / WAVE_PERIOD;
  const seat = kit.q(SEAT_STEP.high, SEAT_STEP.low);
  for (let tr = 0; tr < TIERS; tr++) {
    const s = 0.5 + (0.45 * (tr + 0.5)) / TIERS;
    const y = 2 + (tr * (BOWL_H - 6)) / TIERS;
    const seatCol = vary(rng, tr % 3 === 0 ? 0x8a2a42 : 0x2a3a6a, 0.05);
    kit.solid.add(new THREE.CylinderGeometry(1, 1, 3, n, 1, true).scale(BOWL_X * s, 1, BOWL_Z * s), seatCol, T(0, y, 0));
    kit.solid.add(new THREE.RingGeometry(1, 1 + 0.45 / TIERS / s, n).rotateX(-Math.PI / 2).scale(BOWL_X * s, 1, BOWL_Z * s), shade(CONCRETE_DARK, 1.2), T(0, y + 3, 0));
    if (tr % kit.q(TIER_STRIDE.high, TIER_STRIDE.low)) continue;
    const perim = Math.PI * (BOWL_X + BOWL_Z) * s;
    for (let d = 0; d < perim; d += seat) {
      const t = (d / perim) * Math.PI * 2 + rng() * 0.01;
      const [x, z] = oval(t, s + 0.02);
      kit.crowd({ x, y: y + 3, z, ry: Math.atan2(x, z) + Math.PI, color: vary(rng, pick(rng, kit.festive), 0.3), scale: SPECTATOR_SCALE, hop: 0.9, freq: waveFreq, phase: -t * 3, sharp: 10, raise: 1 });
    }
  }

  // --- The pitch, floodlit: stripes of green and its white lines ---
  for (let st = 0; st < 10; st++) {
    kit.lights.add(box((PITCH_X * 2) / 10, 0.2, PITCH_Z * 2), shade(st % 2 ? 0x2a8a3a : 0x34a046, 0.45 + 0.25 * dusk), T(-PITCH_X + ((st + 0.5) * PITCH_X * 2) / 10, 0, 0));
  }
  for (const [w, d, x, z] of [[PITCH_X * 2, 0.5, 0, -PITCH_Z], [PITCH_X * 2, 0.5, 0, PITCH_Z], [0.5, PITCH_Z * 2, -PITCH_X, 0], [0.5, PITCH_Z * 2, PITCH_X, 0], [0.5, PITCH_Z * 2, 0, 0]]) {
    kit.lights.add(box(w, 0.22, d), shade(0xffffff, 0.75), T(x, 0, z));
  }
  kit.solid.add(new THREE.CylinderGeometry(BOWL_X * 0.52, BOWL_X * 0.52, 0.3, n).scale(1, 1, BOWL_Z / BOWL_X), CONCRETE_DARK, T(0, -0.2, 0));

  // --- Floodlight masts at the four corners, beams down onto the pitch ---
  const beam = shade(0xf4f8ff, BEAM_DAY + (BEAM_DUSK - BEAM_DAY) * dusk);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const [x, z] = oval(Math.atan2(sz * BOWL_Z, sx * BOWL_X), 1.04);
    kit.solid.add(prism(1.2, 2, MAST_H, 6), STEEL, T(x, 0, z));
    kit.solid.add(box(14, 8, 1.2), DARK, T(x, MAST_H, z, Math.atan2(x, z)));
    for (let l = 0; l < 6; l++) kit.lamp(box(1.8, 1.6, 0.6), [x - sx * 0.6 + Math.cos(Math.atan2(x, z)) * (-5 + l * 2), MAST_H + 4, z - sz * 0.6 - Math.sin(Math.atan2(x, z)) * (-5 + l * 2)], 0xf4f8ff, 9);
    // Aim at the pitch centre: a cone along +Y turned to point down and in.
    const toward = Math.atan2(-x, -z);
    const tilt = Math.PI - Math.atan2(Math.hypot(x, z), MAST_H);
    lightCone(kit.beams, T(x, MAST_H + 4, z, toward, tilt, 0), Math.hypot(x, z, MAST_H) * 0.95, 1.5, 22, 5, beam);
  }

  // --- The giant screen above the stands at the far end, and fireworks over the roof ---
  const signs = neonSigns(SIGN_DAY + (SIGN_DUSK - SIGN_DAY) * dusk);
  const screens = signBoards(signs, [T(0, BOWL_H + 4, BOWL_Z * 0.8, Math.PI, 0, 0, [SCREEN_W, SCREEN_W / 2, 1]), T(0, BOWL_H + 4, BOWL_Z * 0.8 + 0.6, 0, 0, 0, [SCREEN_W, SCREEN_W / 2, 1])], opts.seed ^ SALT, 'screen');
  kit.addObject(screens, screens.geometry, signs);
  kit.solid.add(box(SCREEN_W + 2, SCREEN_W / 2 + 2, 0.5), DARK, T(0, BOWL_H + 3, BOWL_Z * 0.8 + 0.3));
  const bursts = kit.q(BURSTS.high, BURSTS.low);
  if (bursts > 0) {
    const fw = kit.particles(true, 1.6);
    for (let b = 0; b < bursts; b++) {
      const origin: V3 = [(rng() - 0.5) * BOWL_X, BOWL_H + 60 + rng() * 40, (rng() - 0.5) * BOWL_Z];
      const period = 4 + rng() * 3;
      const phase = rng() * period;
      const c = mix(pick(rng, NEON), 0xffffff, 0.2);
      const speed = 20 + rng() * 8;
      for (let i = 0; i < SPARKS; i++) {
        const d = sphereDir(rng);
        fw.add(origin, [d[0] * speed, d[1] * speed, d[2] * speed], c, 3, { period, lifetime: 2, phase }, { gravity: 7, drag: 1.4, jitter: 60, fadeIn: 0.02 });
      }
    }
  }
  const lm = finishCoast(kit, RADIUS);
  return {
    ...lm,
    update(time, dt) {
      lm.update(time, dt);
      signs.update(time);
    },
  };
}
