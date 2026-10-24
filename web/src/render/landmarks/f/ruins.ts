// The ruins: the stones of whoever lived here before the giants grew. A stepped platform of
// great blocks, its terraces heaved apart by roots; a ring of standing stones, some fallen; a
// broken colonnade; a gate arch half swallowed by a giant that grew through it, its roots
// poured over the masonry like wax. Moss lies thick on every top, ferns grow from the joints,
// and on the tallest stones carved bands of glyphs breathe with a slow, faint light that by
// dusk is the brightest thing in the woods.
//
// Placement: scenery (no hazard), side either, distance 10–50, scale 0.8–1.4.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import { T, beam, box, mix, prism, shade, vary } from '../b/shapes.ts';
import type { V3 } from '../b/motion.ts';
import { finishCoast } from '../c/kit.ts';
import { BARK, FERN, GLOW, MOSS, STONE, fern, giant, mossyRock } from './kit.ts';

const SALT = 0x2a14e;
const RADIUS = 100;
/** The platform: terraces, their half-size and height (m), and the block size they are laid in. */
const TERRACES = 3;
const BASE_HALF = 34;
const TERRACE_STEP = 7;
const TERRACE_H = 3.2;
const BLOCK = 4.5;
/** Blocks shoved out of line by roots: share, and how far (m) and how much they tip (radians). */
const HEAVED = 0.18;
const HEAVE = 0.8;
const TIP = 0.12;
/** The ring of standing stones: radius, how many, their height range (m), share fallen. */
const RING_R = 62;
const RING = { high: 14, low: 9 } as const;
const STONE_H: readonly [number, number] = [9, 16];
const FALLEN = 0.3;
/** The colonnade: columns, spacing, height (m). */
const COLUMNS = 8;
const COLUMN_GAP = 9;
const COLUMN_H = 14;
/** The gate arch the giant grew through: span, height, and the giant's size. */
const GATE_SPAN = 14;
const GATE_H = 18;
/** Glyph bands: how bright by day and at dusk, how slowly they breathe (rad/s). */
const GLYPH_DAY = 0.35;
const GLYPH_DUSK = 1;
const GLYPH_RATE = 0.6;

export function createRuins(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const rng = kit.rng;
  const dusk = opts.palette.dusk;
  const stone = mix(STONE, opts.palette.rock, 0.4);
  const moss = mix(opts.palette.sand, MOSS, 0.65);
  const glyph = (i: number) => shade(GLOW[i % 2 ? 0 : 3], GLYPH_DAY + (GLYPH_DUSK - GLYPH_DAY) * dusk);
  const breathe = (phase: number) => ({ depth: 0.6, freq: GLYPH_RATE, phase, sharp: 1.5 });

  /** A masonry block with moss on its top, maybe heaved out of line. */
  const block = (x: number, y: number, z: number, w: number, h: number, d: number, heave: boolean) => {
    const dx = heave ? (rng() - 0.5) * HEAVE * 2 : 0;
    const tip = heave ? (rng() - 0.5) * TIP * 2 : 0;
    const m = T(x + dx, y + (heave ? rng() * HEAVE : 0), z, (rng() - 0.5) * 0.04, tip, tip * 0.5);
    kit.solid.add(box(w * 0.97, h, d * 0.97), vary(rng, stone, 0.06), m);
    kit.solid.add(box(w * 0.98, h * 0.12, d * 0.98), vary(rng, moss, 0.06), m.clone().multiply(T(0, h * 0.94, 0)));
  };

  // --- The stepped platform ---
  for (let t = 0; t < TERRACES; t++) {
    const half = BASE_HALF - t * TERRACE_STEP;
    const y = t * TERRACE_H;
    const n = Math.max(1, Math.round((half * 2) / BLOCK));
    const step = (half * 2) / n;
    for (let i = 0; i < n; i++) {
      for (const [x, z, w, d] of [
        [-half + (i + 0.5) * step, -half + BLOCK / 2, step, BLOCK],
        [-half + (i + 0.5) * step, half - BLOCK / 2, step, BLOCK],
        [-half + BLOCK / 2, -half + (i + 0.5) * step, BLOCK, step],
        [half - BLOCK / 2, -half + (i + 0.5) * step, BLOCK, step],
      ] as const) {
        if (kit.high || i % 2 === 0) block(x, y, z, w, TERRACE_H, d, rng() < HEAVED);
      }
    }
    // The terrace's fill, mossed over.
    kit.solid.add(box(half * 2 - BLOCK, TERRACE_H * 0.9, half * 2 - BLOCK), vary(rng, moss, 0.05), T(0, y, 0));
  }
  // Steps up the front (toward the trail).
  for (let s = 0; s < TERRACES * 2; s++) block(0, s * TERRACE_H * 0.5, -BASE_HALF - 3 + s * (TERRACE_STEP / 2), 12, TERRACE_H * 0.5, TERRACE_STEP / 2, rng() < HEAVED);

  // --- The gate on the top terrace, a giant grown through it, roots poured over the stones ---
  const topY = TERRACES * TERRACE_H;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) block((s * GATE_SPAN) / 2, topY + k * (GATE_H / 4), 0, 4, GATE_H / 4, 4, false);
    kit.lights.add(box(0.2, GATE_H * 0.5, 1.4), glyph(s), T(s * (GATE_SPAN / 2 - 2.05), topY + GATE_H * 0.2, 0), undefined, breathe(s));
  }
  kit.solid.add(box(GATE_SPAN + 6, 4, 5), vary(rng, stone, 0.05), T(0, topY + GATE_H, 0));
  kit.solid.add(box(GATE_SPAN + 6.2, 0.6, 5.2), moss, T(0, topY + GATE_H + 4, 0));
  giant(kit, kit.solid, 2, 6, 96, 5.5, rng, { base: topY - 2, lean: 0.04, leanDir: 1.2 });
  for (let r = 0; r < kit.q(10, 6); r++) {
    // Roots poured down the terraces: chains of thick segments from the trunk to the ground.
    const a = (r / kit.q(10, 6)) * Math.PI * 2 + rng() * 0.3;
    let p: V3 = [2 + Math.cos(a) * 6, topY + 2, 6 + Math.sin(a) * 6];
    for (let k = 0; k < 5; k++) {
      const out = 6 + k * 6;
      const next: V3 = [2 + Math.cos(a) * out, Math.max(0, topY - k * TERRACE_H * 0.8), 6 + Math.sin(a) * out];
      kit.solid.add(beam(p, next, 1.6 - k * 0.25, 5), shade(BARK, 0.85), T(0, 0, 0));
      p = next;
    }
  }

  // --- The ring of standing stones round the platform, glyph bands on the tall ones ---
  const nRing = kit.q(RING.high, RING.low);
  for (let i = 0; i < nRing; i++) {
    const a = (i / nRing) * Math.PI * 2;
    const x = Math.cos(a) * RING_R;
    const z = Math.sin(a) * RING_R;
    const hgt = STONE_H[0] + rng() * (STONE_H[1] - STONE_H[0]);
    const face = Math.atan2(x, z);
    if (rng() < FALLEN) {
      // Fallen, broken in two, half sunk in moss.
      kit.solid.add(box(3.2, 2.6, hgt * 0.55), vary(rng, stone, 0.06), T(x, -0.4, z, face + 0.3, 0, 0.1));
      kit.solid.add(box(3, 2.4, hgt * 0.4), vary(rng, stone, 0.06), T(x + 4, -0.5, z + 3, face - 0.4, 0.05, -0.1));
      continue;
    }
    kit.solid.add(prism(1.9, 1.5, hgt, 5), vary(rng, stone, 0.06), T(x, -1, z, face, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08));
    kit.solid.add(new THREE.ConeGeometry(1.6, 1.4, 5), moss, T(x, hgt - 1, z, face));
    if (i % 2 === 0) kit.lights.add(prism(1.72, 1.68, 1, 5, true), glyph(i), T(x, hgt * 0.62, z, face), undefined, breathe(i * 0.9));
  }

  // --- The broken colonnade along one side ---
  for (let c = 0; c < COLUMNS; c++) {
    const x = -BASE_HALF + c * COLUMN_GAP;
    const z = BASE_HALF + 12;
    const broken = rng() < 0.45;
    const hgt = broken ? COLUMN_H * (0.3 + rng() * 0.4) : COLUMN_H;
    kit.solid.add(prism(1.5, 1.35, hgt, kit.q(10, 7)), vary(rng, stone, 0.05), T(x, 0, z));
    kit.solid.add(prism(1.6, 1.6, 0.4, kit.q(10, 7)), moss, T(x, hgt, z));
    if (!broken && c + 1 < COLUMNS) kit.solid.add(box(COLUMN_GAP + 1, 1.8, 2.6), vary(rng, stone, 0.05), T(x + COLUMN_GAP / 2, COLUMN_H, z));
    if (broken) kit.solid.add(prism(1.4, 1.4, COLUMN_H * 0.4, kit.q(10, 7)).rotateZ(Math.PI / 2), vary(rng, stone, 0.05), T(x + 3, 1.4, z - 5, rng() * 3));
  }

  // --- The woods taking it back: ferns in every joint, boulders, a giant or two ---
  for (let i = 0; i < kit.q(50, 22); i++) {
    const a = rng() * Math.PI * 2;
    const r = BASE_HALF * 0.6 + rng() * RADIUS * 0.6;
    fern(kit.solid, Math.cos(a) * r, Math.sin(a) * r, 2.5 + rng() * 3, rng, FERN);
  }
  for (let t = 0; t < TERRACES; t++) {
    const half = BASE_HALF - t * TERRACE_STEP;
    for (let i = 0; i < kit.q(8, 4); i++) fern(kit.solid, (rng() - 0.5) * half * 1.6, (rng() - 0.5) * half * 1.6, 2 + rng() * 2, rng, FERN, undefined, (t + 1) * TERRACE_H - 0.2);
  }
  for (let i = 0; i < kit.q(10, 5); i++) mossyRock(kit.solid, (rng() - 0.5) * RADIUS * 1.6, (rng() - 0.5) * RADIUS * 1.6, 1.5 + rng() * 2.5, rng);
  for (const [x, z] of [[-75, 30], [70, 45], [-60, -55]] as const) giant(kit, kit.solid, x, z, 85 + rng() * 20, 5 + rng(), rng);

  return finishCoast(kit, RADIUS);
}
