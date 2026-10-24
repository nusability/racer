// The skyscrapers: a cluster of towers on a podium plaza, each its own shape (a plain slab, a
// stepped setback tower, twins joined by a sky bridge, a slim needle), lit floor by floor by the
// facade shader. Neon tubes run up their corners, aviation lights blink on the crowns, and
// searchlights sweep the clouds from the tallest roof. One instanced draw for every tower, the
// rest is merged set-B buckets animated on the GPU.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import { T, box, cone, mix, pick, prism, shade } from '../b/shapes.ts';
import { lightCone } from '../c/kit.ts';
import { finishCoast } from '../c/kit.ts';
import { CONCRETE, CONCRETE_DARK, DARK, Facades, NEON, RED_LIGHT, STEEL, WALLS, WARM_LIGHT } from './kit.ts';

const SALT = 0x5c7a9;
const RADIUS = 120;
const TOWERS = { high: 9, low: 6 } as const;
/** Tower heights, metres, and footprints. */
const HEIGHT: readonly [number, number] = [90, 260];
const FOOT: readonly [number, number] = [18, 34];
/** Towers stand within this share of the radius, off the track-facing edge. */
const SPREAD = 0.72;
const PODIUM_H = 7;
/** Corner neon tubes: thickness, and their slow breathing. */
const TUBE = 0.7;
const TUBE_PULSE = { depth: 0.35, freq: 1.3 } as const;
/** Aviation lights: blink rate and sharpness. */
const BLINK = { depth: 0.95, freq: 2.2, sharp: 8 } as const;
/** Searchlights on the tallest roof: how many, beam length, spread, sweep rate (rad/s). */
const SEARCHLIGHTS = { high: 3, low: 0 } as const;
const BEAM_LENGTH = 420;
const BEAM_RADIUS = 14;
const BEAM_SWEEP = 0.35;
const BEAM_TILT = 0.45;
/** Beam strength by day and at deep dusk. */
const BEAM_DAY = 0.05;
const BEAM_DUSK = 0.18;
const BEAM_SEGMENTS = 6;

type Form = 'slab' | 'setback' | 'twin' | 'needle';
const FORMS: readonly Form[] = ['slab', 'setback', 'twin', 'needle', 'setback', 'slab'];

export function createSkyscrapers(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const rng = kit.rng;
  const facades = new Facades();
  const dusk = opts.palette.dusk;

  // The podium: a plaza deck the towers stand on, its edge lit.
  kit.solid.add(new THREE.CylinderGeometry(RADIUS * 0.95, RADIUS, PODIUM_H, 10).translate(0, PODIUM_H / 2, 0), CONCRETE_DARK);
  kit.lights.add(new THREE.TorusGeometry(RADIUS * 0.96, 0.4, 3, 40).rotateX(Math.PI / 2), shade(opts.palette.accent, 0.9), T(0, PODIUM_H - 0.4, 0));

  const n = kit.q(TOWERS.high, TOWERS.low);
  let tallest = { x: 0, z: 0, h: 0 };
  const spots: { x: number; z: number; r: number }[] = [];
  for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * RADIUS * SPREAD;
    const x = Math.cos(a) * d;
    // Keep the track-facing edge (−Z) lower: the tall ones stand toward the back.
    const z = Math.sin(a) * d;
    const foot = FOOT[0] + rng() * (FOOT[1] - FOOT[0]);
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < (s.r + foot) * 0.75)) continue;
    spots.push({ x, z, r: foot });
    const back = (z / RADIUS + 1) / 2;
    const h = HEIGHT[0] + (HEIGHT[1] - HEIGHT[0]) * (0.3 + 0.7 * back) * (0.6 + 0.4 * rng());
    const yaw = (rng() - 0.5) * 0.5;
    const tint = mix(pick(rng, WALLS), opts.palette.rock, 0.15);
    const form = FORMS[i % FORMS.length];
    const top = tower(kit, facades, form, x, z, foot, h, yaw, tint, rng);
    if (top > tallest.h) tallest = { x, z, h: top };
    i++;
  }

  // Searchlights sweeping from the tallest roof.
  const beams = kit.q(SEARCHLIGHTS.high, SEARCHLIGHTS.low);
  const beamCol = shade(0xdfe8ff, BEAM_DAY + (BEAM_DUSK - BEAM_DAY) * dusk);
  for (let b = 0; b < beams; b++) {
    const hub: [number, number, number] = [tallest.x, tallest.h, tallest.z];
    const m = T(hub[0], hub[1], hub[2], (b / beams) * Math.PI * 2, BEAM_TILT, 0);
    lightCone(kit.beams, m, BEAM_LENGTH, 1.2, BEAM_RADIUS, BEAM_SEGMENTS, beamCol, { hub, axisA: [0, 1, 0], spinA: BEAM_SWEEP * (b % 2 ? 1 : -1) });
  }
  facades.build(kit, opts);
  return finishCoast(kit, RADIUS);
}

/** One tower in its form; returns the height of its roof. */
function tower(kit: Kit, f: Facades, form: Form, x: number, z: number, foot: number, h: number, yaw: number, tint: THREE.Color, rng: () => number): number {
  const neon = pick(rng, NEON);
  const tube = (cx: number, cz: number, w: number, d: number, y0: number, y1: number) => {
    // Neon up two opposite corners of the block (turned with it).
    for (const [u, v] of [[-1, -1], [1, 1]] as const) {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const lx = (u * w) / 2;
      const lz = (v * d) / 2;
      kit.lights.add(box(TUBE, y1 - y0, TUBE), neon, T(cx + lx * c + lz * s, y0, cz - lx * s + lz * c), undefined, { depth: TUBE_PULSE.depth, freq: TUBE_PULSE.freq, phase: rng() * 6 });
    }
  };
  const beacon = (bx: number, by: number, bz: number) => kit.lamp(new THREE.OctahedronGeometry(0.9), [bx, by, bz], RED_LIGHT, 5, undefined, { depth: BLINK.depth, freq: BLINK.freq, phase: rng() * 6, sharp: BLINK.sharp });
  const y0 = PODIUM_H;
  switch (form) {
    case 'slab': {
      f.add(x, y0, z, foot, h, foot * 0.7, yaw, tint);
      tube(x, z, foot, foot * 0.7, y0, y0 + h);
      kit.solid.add(box(foot * 0.5, 4, foot * 0.4), STEEL, T(x, y0 + h, z, yaw));
      beacon(x, y0 + h + 4.8, z);
      return y0 + h;
    }
    case 'setback': {
      let base = y0;
      let w = foot;
      for (let t = 0; t < 3; t++) {
        const th = h * (t === 0 ? 0.5 : 0.25);
        f.add(x, base, z, w, th, w, yaw, tint);
        tube(x, z, w, w, base, base + th);
        // A lit ledge on each setback.
        kit.lights.add(box(w + 1, 0.6, w + 1), shade(WARM_LIGHT, 0.8), T(x, base + th, z, yaw));
        base += th;
        w *= 0.72;
      }
      kit.solid.add(prism(0.6, 0.25, h * 0.18, 4), STEEL, T(x, base, z));
      beacon(x, base + h * 0.18 + 0.6, z);
      return base;
    }
    case 'twin': {
      const gap = foot * 0.9;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      for (const side of [-1, 1]) {
        const tx = x + side * gap * c;
        const tz = z - side * gap * s;
        f.add(tx, y0, tz, foot * 0.7, h * (side < 0 ? 1 : 0.92), foot * 0.7, yaw, tint);
        tube(tx, tz, foot * 0.7, foot * 0.7, y0, y0 + h * (side < 0 ? 1 : 0.92));
        beacon(tx, y0 + h * (side < 0 ? 1 : 0.92) + 1, tz);
      }
      // The sky bridge, glazed and lit.
      kit.solid.add(box(gap * 2, 6, foot * 0.4), CONCRETE, T(x, y0 + h * 0.62, z, yaw));
      kit.lights.add(box(gap * 2 - 2, 2, foot * 0.42), shade(neon, 0.85), T(x, y0 + h * 0.62 + 2, z, yaw));
      return y0 + h;
    }
    case 'needle': {
      f.add(x, y0, z, foot * 0.6, h * 0.8, foot * 0.6, yaw + Math.PI / 4, tint);
      tube(x, z, foot * 0.6, foot * 0.6, y0, y0 + h * 0.8);
      // A crown of fins tapering into a spire.
      kit.solid.add(cone(foot * 0.42, h * 0.3, 4), DARK, T(x, y0 + h * 0.8, z, yaw));
      kit.lights.add(cone(foot * 0.2, h * 0.32, 4), shade(neon, 0.7), T(x, y0 + h * 0.8, z, yaw + Math.PI / 4), undefined, { depth: 0.5, freq: 0.8, phase: rng() * 6 });
      beacon(x, y0 + h * 1.12, z);
      return y0 + h * 1.1;
    }
  }
}
