// The lumber town: Elderwood's racing town in a logged-out clearing, where the street circuit
// runs. Along the trail, a long timber grandstand under a shingle roof, packed with a crowd on
// its feet; behind it the town's high street of gabled timber houses with lamplit windows and
// smoking chimneys, a water tower, and the sawmill: a great open shed whose blade spins, a
// waterwheel turning in the millrace, a log pond and stacks of sawn timber. Race banners on
// tall poles and strings of pennants dress the front; lanterns light it at dusk.
//
// Placement: scenery (no hazard), along a straight of a 'town' clearing (ForestScenery.clearings),
// side either, distance 4–15 (the grandstand's front rail stands at the footprint's near edge),
// scale 1. Pairs with the scenery's 'logging' road.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import { T, beam, box, mix, prism, shade, vary } from '../b/shapes.ts';
import { quadPts, bunting } from '../b/props.ts';
import type { V3 } from '../b/motion.ts';
import { finishCoast, smoke } from '../c/kit.ts';
import { BARK, LANTERN, STONE_DARK, TIMBER, WATER, WEATHERED, lantern } from './kit.ts';

const SALT = 0x1b3e7;
const RADIUS = 150;
/** The grandstand: its length along the trail, tiers rising away from it, tread and rise (m). */
const STAND_LEN = 150;
const TIERS = 8;
const TREAD = 2.6;
const RISE = 1.6;
const STAND_Z = -RADIUS * 0.9;
/** Spectators every this many metres along a tier (high, low), every n-th tier, drawn larger than life. */
const SEAT = { high: 2.6, low: 4 } as const;
const TIER_STRIDE = { high: 1, low: 2 } as const;
const SPECTATOR_SCALE = 1.4;
const OCCUPANCY = 0.85;
/** The crowd's wave rolls along the stand at this speed (m/s), a new one every WAVE_PERIOD s. */
const WAVE_SPEED = 40;
const WAVE_PERIOD = 9;
/** The high street: houses per side (high, low), its z, house size ranges (m). */
const HOUSES = { high: 9, low: 5 } as const;
const STREET_Z = 20;
const STREET_W = 16;
/** The sawmill: shed, blade and waterwheel (m). */
const MILL: V3 = [70, 0, 60];
const BLADE_R = 4;
const WHEEL_R = 8;
const WHEEL_RATE = 0.6;
const BLADE_RATE = 14;
/** Banner poles along the front, and lamps. */
const BANNERS = 7;
const POLE_H = 22;
const LANTERN_HALO = 4;
/** Paint the town is dressed in: muted dyes and whitewash. */
const PAINT: readonly number[] = [0x8a3a2a, 0x2a4a6a, 0x4a6a3a, 0xc8b890, 0x6a4a2a];
const ROOF = 0x4a3a30;
const WINDOW_DAY = 0.25;

export function createLumberTown(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const rng = kit.rng;
  const dusk = opts.palette.dusk;
  const halo = LANTERN_HALO * (0.3 + 0.7 * dusk);
  const ground = mix(opts.palette.road, TIMBER, 0.25);

  // --- The yard: packed earth and sawdust under the whole town ---
  kit.solid.add(box(RADIUS * 1.9, 0.2, RADIUS * 1.7), ground, T(0, -0.1, 0));

  // --- The grandstand: timber tiers rising from the rail, a shingle roof on posts ---
  for (let i = 0; i < TIERS; i++) {
    const z = STAND_Z + i * TREAD;
    kit.solid.add(box(STAND_LEN, RISE * (i + 1), TREAD), shade(TIMBER, 0.75 + (i % 2) * 0.1), T(0, 0, z + TREAD / 2));
  }
  const backZ = STAND_Z + TIERS * TREAD;
  const roofY = TIERS * RISE + 9;
  for (let p = 0; p <= 10; p++) {
    const x = -STAND_LEN / 2 + (p / 10) * STAND_LEN;
    kit.solid.add(prism(0.5, 0.4, roofY, 6), WEATHERED, T(x, 0, backZ));
    kit.solid.add(beam([x, roofY, backZ], [x, roofY - 3, STAND_Z - 2], 0.35, 4), WEATHERED);
  }
  kit.solid.add(quadPts([-STAND_LEN / 2 - 2, roofY - 3.2, STAND_Z - 3], [STAND_LEN / 2 + 2, roofY - 3.2, STAND_Z - 3], [STAND_LEN / 2 + 2, roofY + 0.4, backZ + 2], [-STAND_LEN / 2 - 2, roofY + 0.4, backZ + 2]), ROOF);
  kit.solid.add(box(STAND_LEN, 1.1, 0.3), shade(TIMBER, 0.6), T(0, 0, STAND_Z - 0.3));
  // The crowd, on its feet, the wave rolling along the stand.
  const waveFreq = (Math.PI * 2) / WAVE_PERIOD;
  for (let i = 0; i < TIERS; i += kit.q(TIER_STRIDE.high, TIER_STRIDE.low)) {
    const y = RISE * (i + 1);
    const z = STAND_Z + i * TREAD + TREAD * 0.45;
    for (let x = -STAND_LEN / 2 + 1; x < STAND_LEN / 2 - 1; x += kit.q(SEAT.high, SEAT.low)) {
      if (rng() > OCCUPANCY) continue;
      const waving = rng() < 0.8;
      kit.crowd({ x: x + (rng() - 0.5) * 0.6, y: y - 0.9, z, ry: Math.PI + (rng() - 0.5) * 0.4, color: vary(rng, kit.festiveColor(), 0.3), scale: SPECTATOR_SCALE, hop: waving ? 1.2 : 0.3, freq: waving ? waveFreq : 4 + rng() * 3, phase: waving ? (-x * waveFreq) / WAVE_SPEED : rng() * 100, sharp: waving ? 6 : 2, raise: waving ? 1 : 0.5 });
    }
  }

  // --- Banners on poles along the front, pennants strung between them, lanterns ---
  for (let b = 0; b < BANNERS; b++) {
    const x = -STAND_LEN / 2 + (b / (BANNERS - 1)) * STAND_LEN;
    const z = STAND_Z - 6;
    kit.solid.add(prism(0.3, 0.22, POLE_H, 6), WEATHERED, T(x, 0, z));
    const cloth = b % 2 ? opts.palette.accent : PAINT[b % PAINT.length];
    kit.moving.add(box(0.1, 9, 3), cloth, T(x, POLE_H - 10, z + 1.6), { pivot: [x, POLE_H - 1, z], axisB: [1, 0, 0], swingB: 0.08, freq: 1.4, phase: b });
    if (b + 1 < BANNERS) bunting(kit, [x, POLE_H - 1, z], [x + STAND_LEN / (BANNERS - 1), POLE_H - 1, z], 3, kit.q(12, 6), 1.3);
    lantern(kit, [x, POLE_H - 12, z - 0.6], 0.5, halo, b);
  }

  // --- The high street: gabled houses either side of it, lamplit windows, chimney smoke ---
  const smokes = kit.particles(false, 0.8);
  const nH = kit.q(HOUSES.high, HOUSES.low);
  for (const side of [-1, 1]) {
    let x = -RADIUS * 0.85;
    for (let i = 0; i < nH && x < RADIUS * 0.4; i++) {
      const w = 10 + rng() * 6;
      const d = 10 + rng() * 5;
      const hgt = 7 + rng() * 6;
      const z = STREET_Z + side * (STREET_W / 2 + d / 2);
      const wall = vary(rng, PAINT[Math.floor(rng() * PAINT.length)], 0.08);
      house(kit, x + w / 2, z, w, d, hgt, wall, side, dusk);
      if (rng() < 0.5) smoke(smokes, rng, [x + w * 0.3, hgt + d * 0.45 + 2, z], { count: kit.q(10, 5), color: mix(0xc8c4b8, opts.palette.horizon, 0.3), size: 2.5, rise: 2.5, wind: [1, 0, 0.6], period: 7, spread: 1.2 });
      lantern(kit, [x + w + 1, 5, STREET_Z - side * (STREET_W / 2 - 1)], 0.4, halo * 0.6, i * 2 + side);
      x += w + 2 + rng() * 3;
    }
  }
  // The water tower over the street's end.
  kit.solid.add(prism(5, 5, 7, 12), shade(TIMBER, 0.8), T(-RADIUS * 0.75, 18, STREET_Z + 30));
  kit.solid.add(new THREE.ConeGeometry(5.6, 3, 12), ROOF, T(-RADIUS * 0.75, 25 + 1.5, STREET_Z + 30));
  for (let l = 0; l < 4; l++) {
    const a = (l / 4) * Math.PI * 2 + 0.4;
    kit.solid.add(beam([-RADIUS * 0.75 + Math.cos(a) * 6, 0, STREET_Z + 30 + Math.sin(a) * 6], [-RADIUS * 0.75 + Math.cos(a) * 4, 18, STREET_Z + 30 + Math.sin(a) * 4], 0.4, 4), WEATHERED);
  }

  // --- The sawmill: an open shed, the spinning blade, the waterwheel, log pond and timber stacks ---
  const [mx, , mz] = MILL;
  kit.solid.add(box(40, 1, 22), shade(TIMBER, 0.65), T(mx, 0, mz));
  for (let p = 0; p < 5; p++) for (const s of [-1, 1]) kit.solid.add(box(0.8, 12, 0.8), WEATHERED, T(mx - 18 + p * 9, 0, mz + s * 10));
  kit.solid.add(quadPts([mx - 21, 12, mz - 11], [mx + 21, 12, mz - 11], [mx + 21, 17, mz], [mx - 21, 17, mz]), ROOF);
  kit.solid.add(quadPts([mx + 21, 12, mz + 11], [mx - 21, 12, mz + 11], [mx - 21, 17, mz], [mx + 21, 17, mz]), ROOF);
  const blade: V3 = [mx, 3 + BLADE_R, mz];
  kit.moving.add(new THREE.CylinderGeometry(BLADE_R, BLADE_R, 0.15, 24).rotateX(Math.PI / 2), 0xb8bcc0, T(blade[0], blade[1], blade[2]), { hub: blade, axisA: [0, 0, 1], spinA: BLADE_RATE });
  kit.solid.add(box(16, 1.2, 3), shade(TIMBER, 0.6), T(mx, 2.2, mz));
  kit.solid.add(prism(1.3, 1.3, 14, 8).rotateZ(Math.PI / 2).translate(-7, 0, 0), BARK, T(mx - 4, 4.6, mz));
  // The millrace and its wheel at the shed's end.
  const wheel: V3 = [mx + 24, WHEEL_R, mz];
  for (let s = 0; s < kit.q(12, 8); s++) {
    const a = (s / kit.q(12, 8)) * Math.PI * 2;
    kit.moving.add(beam(wheel, [wheel[0] + Math.cos(a) * WHEEL_R, wheel[1] + Math.sin(a) * WHEEL_R, wheel[2]], 0.25, 4), shade(TIMBER, 0.6), undefined, { hub: wheel, axisA: [0, 0, 1], spinA: -WHEEL_RATE });
    kit.moving.add(box(2.4, 0.3, 3), shade(TIMBER, 0.7), T(wheel[0] + Math.cos(a) * WHEEL_R, wheel[1] + Math.sin(a) * WHEEL_R, wheel[2], 0, 0, a), { hub: wheel, axisA: [0, 0, 1], spinA: -WHEEL_RATE });
  }
  kit.solid.add(box(6, 1.5, 60), WATER, T(mx + 24, 0, mz + 20));
  kit.solid.add(box(36, 0.6, 26), WATER, T(mx + 10, 0, mz + 45));
  for (let l = 0; l < kit.q(8, 4); l++) kit.moving.add(prism(1.2, 1.2, 14, 7).rotateZ(Math.PI / 2), BARK, T(mx + rng() * 28 - 4, 0.6, mz + 36 + rng() * 18, rng() * Math.PI), { drift: [1.2, 0, 0.8], driftFreq: 0.2, phase: l });
  // Stacks of sawn timber and of logs waiting.
  for (let st = 0; st < kit.q(6, 3); st++) {
    const sx = 10 + rng() * 40;
    const sz = 45 + rng() * 40;
    for (let k = 0; k < 4; k++) kit.solid.add(box(12, 1.2, 4), vary(rng, TIMBER, 0.06), T(sx, k * 1.25, sz, (k % 2) * 0.05));
  }
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 4 - r; k++) kit.solid.add(prism(1.5, 1.5, 20, 8).rotateZ(Math.PI / 2).translate(-10, 0, 0), vary(rng, BARK, 0.08), T(-30, 1.5 + r * 2.6, 70 + k * 3.1 + r * 1.55));
  }
  // A stone well in the square.
  kit.solid.add(prism(2.4, 2.4, 1.2, 10), STONE_DARK, T(-40, 0, STREET_Z));
  kit.lamp(new THREE.OctahedronGeometry(0.5), [-40, 4, STREET_Z], LANTERN, halo * 0.6);

  return finishCoast(kit, RADIUS);
}

/** A gabled timber house facing the street (its front toward −side·Z), windows lit at dusk. */
function house(kit: Kit, x: number, z: number, w: number, d: number, h: number, wall: THREE.Color, side: number, dusk: number): void {
  kit.solid.add(box(w, h, d), wall, T(x, 0, z));
  const ridge = h + d * 0.45;
  const roof = shade(ROOF, 0.9 + kit.rng() * 0.2);
  kit.solid.add(quadPts([x - w / 2 - 0.6, h - 0.3, z - d / 2 - 0.8], [x + w / 2 + 0.6, h - 0.3, z - d / 2 - 0.8], [x + w / 2 + 0.6, ridge, z], [x - w / 2 - 0.6, ridge, z]), roof);
  kit.solid.add(quadPts([x + w / 2 + 0.6, h - 0.3, z + d / 2 + 0.8], [x - w / 2 - 0.6, h - 0.3, z + d / 2 + 0.8], [x - w / 2 - 0.6, ridge, z], [x + w / 2 + 0.6, ridge, z]), roof);
  for (const end of [-1, 1]) {
    const g = new THREE.BufferGeometry();
    const ex = x + (end * w) / 2;
    g.setAttribute('position', new THREE.Float32BufferAttribute([ex, h, z - d / 2, ex, h, z + d / 2, ex, ridge, z], 3));
    kit.solid.add(g, wall);
  }
  kit.solid.add(box(1.2, 3, 1.2), STONE_DARK, T(x - w * 0.3, ridge - 1.5, z));
  // Windows on the street front: warm at dusk, dark panes by day.
  const front = z - side * (d / 2 + 0.05);
  const lit = mix(0x2a2622, LANTERN, WINDOW_DAY + (1 - WINDOW_DAY) * dusk);
  for (let k = 0; k < Math.floor(w / 4); k++) {
    const wx = x - w / 2 + 2 + k * 4;
    kit.lights.add(box(1.4, 1.6, 0.1), lit, T(wx, h * 0.55, front));
  }
  kit.solid.add(box(1.8, 2.8, 0.15), shade(TIMBER, 0.5), T(x + w * 0.25, 0, front));
}
