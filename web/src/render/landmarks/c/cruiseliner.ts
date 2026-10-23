// The cruise liner: a 320 m floating city steaming slowly along the coast, broadside to the
// track. Tiered white decks strung with tiny lights, two raked funnels trailing smoke, pools
// glowing on the sun deck, a corkscrew water slide, a turning radar, a horn that bursts steam
// now and then, and a bow wave and wake churning white along the hull.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import type { Motion, V3 } from '../b/motion.ts';
import { T, ball, beam, box, mix, prism, shade } from '../b/shapes.ts';
import { DARK, FOAM, GLASS, RED_LIGHT, WARM_LIGHT, WHITE, finishCoast, hull, smoke, splash, wake } from './kit.ts';

const SALT = 0xc205e;
const RADIUS = 170;
const LENGTH = 320;
const BEAM_W = 40;
const DRAFT = 9;
const FREEBOARD = 17;
const TIERS = 7;
const TIER_H = 4.2;
const TIER_STEP = 20;
const DECK0 = FREEBOARD;
const TOP_Y = DECK0 + TIERS * TIER_H;
const FUNNELS: readonly number[] = [-62, -98];
const FUNNEL_H = 20;
const SLIDE = { x: -128, z: 6, r: 5.5, turns: 3, h: 18, segs: 36 } as const;
const POOLS: readonly { x: number; w: number }[] = [{ x: 2, w: 22 }, { x: -30, w: 14 }];
const RADAR = { x: 56, spin: 1.6 } as const;
const HORN = { period: 13, lifetime: 2.6 } as const;
const DECK_LIGHTS = { high: 46, low: 22 } as const;
const WINDOWS = { high: 34, low: 16 } as const;
const SMOKE = { high: 40, low: 20 } as const;
const WAKE = { high: 70, low: 34 } as const;
/** The ship sails toward +X; the water streams past toward −X at this speed (m/s). */
const WATER_SPEED = 7;
const HULL = 0x17284a;

/** Length of tier i along the ship and where its centre sits (it steps back from the bow). */
function tier(i: number): { len: number; cx: number; w: number } {
  const len = 248 - i * TIER_STEP;
  return { len, cx: -14 - i * 4, w: BEAM_W - 4 - i * 1.6 };
}

function shipHull(kit: Kit): void {
  kit.solid.add(hull(LENGTH, BEAM_W, DRAFT + FREEBOARD, 0.24, 0.86), HULL, T(0, -DRAFT, 0));
  // Bands: red boot-top at the waterline, white upper hull with the line's accent stripe.
  kit.solid.add(hull(LENGTH + 0.6, BEAM_W + 0.5, 2.2, 0.24, 0.86, 1), 0xb83a30, T(0, -1.2, 0));
  kit.solid.add(hull(LENGTH + 0.6, BEAM_W + 0.5, 6.5, 0.24, 0.86, 1), WHITE, T(0, FREEBOARD - 6.5, 0));
  kit.solid.add(hull(LENGTH + 0.8, BEAM_W + 0.7, 1.1, 0.24, 0.86, 1), kit.palette.accent, T(0, FREEBOARD - 4.5, 0));
  // Portholes along the dark hull.
  for (const side of [-1, 1]) {
    for (let i = 0; i < kit.q(26, 12); i++) {
      const x = -LENGTH / 2 + 30 + i * ((LENGTH - 90) / kit.q(26, 12));
      kit.lamp(box(1.4, 0.9, 0.2), [x, 5.5, side * (BEAM_W / 2 + 0.05)], WARM_LIGHT, 0, undefined, { depth: 0.15, freq: 0.3, phase: i });
    }
  }
  // An anchor-chain bow emblem: a gold chevron on each bow.
  for (const side of [-1, 1]) kit.solid.add(box(10, 1.2, 0.3), 0xe0b040, T(LENGTH / 2 - 26, FREEBOARD - 9, side * (BEAM_W / 2 - 1.2), side * 0.18, 0, 0.25));
}

function superstructure(kit: Kit): void {
  const { rng } = kit;
  for (let i = 0; i < TIERS; i++) {
    const { len, cx, w } = tier(i);
    const y = DECK0 + i * TIER_H;
    kit.solid.add(box(len, TIER_H, w), i % 2 ? WHITE : shade(WHITE, 0.95), T(cx, y, 0));
    // A rounded front to every tier: a half-cylinder nose.
    kit.solid.add(new THREE.CylinderGeometry(w / 2, w / 2, TIER_H, 10, 1, false, 0, Math.PI).translate(0, TIER_H / 2, 0), shade(WHITE, 0.97), T(cx + len / 2, y, 0));
    // Balcony glass and a rail line along both sides.
    for (const side of [-1, 1]) {
      kit.solid.add(box(len - 6, 1.7, 0.4), GLASS, T(cx, y + 1.6, side * (w / 2 + 0.1)));
      kit.solid.add(box(len - 4, 0.25, 0.5), shade(WHITE, 0.8), T(cx, y + 0.9, side * (w / 2 + 0.4)));
      const nWin = kit.q(WINDOWS.high, WINDOWS.low);
      for (let k = 0; k < nWin; k++) {
        if (rng() < 0.45) continue;
        const x = cx - len / 2 + 6 + (k + rng() * 0.4) * ((len - 12) / nWin);
        kit.lamp(box(2.2, 1.3, 0.2), [x, y + 1.8, side * (w / 2 + 0.35)], mix(WARM_LIGHT, 0xffffff, rng() * 0.4), 0, undefined, { depth: 0.2, freq: 0.2 + rng() * 0.3, phase: k });
      }
      // Tiny deck lights strung along the rail: the liner's necklace at dusk.
      const nl = kit.q(DECK_LIGHTS.high, DECK_LIGHTS.low);
      for (let k = 0; k < nl; k++) {
        const x = cx - len / 2 + 3 + (k * (len - 6)) / (nl - 1);
        kit.halos.point([x, y + TIER_H - 0.2, side * (w / 2 + 0.3)], kit.lamps[(i + k) % 3], 1.3, undefined, { depth: 0.4, freq: 2, phase: k * 0.6 + i, sharp: 2 });
      }
    }
  }
  // Bridge: a wide glazed band with wings out past the hull sides.
  const b = tier(4);
  const by = DECK0 + 4 * TIER_H;
  kit.solid.add(box(5, 2, BEAM_W + 6), WHITE, T(b.cx + b.len / 2 - 8, by + 0.4, 0));
  kit.solid.add(box(1, 1.6, BEAM_W + 2), DARK, T(b.cx + b.len / 2 - 5.3, by + 0.6, 0));
  // Lifeboats: orange pods slung along tier 1.
  for (const side of [-1, 1]) {
    for (let k = 0; k < kit.q(12, 7); k++) {
      const x = -110 + k * (190 / kit.q(12, 7));
      kit.solid.add(ball(1, 6, 4), 0xff7a1a, T(x, DECK0 + TIER_H + 1.2, side * (BEAM_W / 2 - 0.5), 0, 0, 0, [4.2, 1.4, 1.6]));
    }
  }
}

function sunDeck(kit: Kit): void {
  const { rng } = kit;
  for (const p of POOLS) {
    kit.solid.add(box(p.w + 3, 0.6, 16), 0xe8dcc4, T(p.x, TOP_Y, 0));
    kit.lamp(box(p.w, 0.1, 12), [p.x, TOP_Y + 0.62, 0], 0x40d8f0, 0);
    // Loungers in rows either side of the pool.
    for (const side of [-1, 1]) for (let k = 0; k < 5; k++) kit.solid.add(box(1, 0.5, 2.4), kit.festive[(k + (side > 0 ? 2 : 0)) % kit.festive.length], T(p.x - p.w / 2 + 1 + k * (p.w / 4.5), TOP_Y + 0.6, side * 10.5));
  }
  // Corkscrew water slide twisting down beside the funnels.
  const { x, z, r, turns, h, segs } = SLIDE;
  kit.solid.add(prism(0.9, 0.9, h + 4, 6), WHITE, T(x, TOP_Y, z));
  const colA = kit.palette.accent;
  let prev: V3 | undefined;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = t * turns * Math.PI * 2;
    const p: V3 = [x + Math.cos(a) * r, TOP_Y + h + 2 - t * h, z + Math.sin(a) * r];
    if (prev) kit.solid.add(beam(prev, p, 1.1, 5), i % 4 < 2 ? colA : 0xf4d03f);
    prev = p;
  }
  kit.solid.add(box(5, 1.4, 5), WHITE, T(x, TOP_Y + h + 2.6, z));
  // Funnels: raked, oval, the line's accent with a black crown.
  for (const fx of FUNNELS) {
    const m = T(fx, TOP_Y, 0, 0, 0, 0.16, [1.5, 1, 0.8]);
    kit.solid.add(prism(5.6, 5.2, 6, 10), WHITE, m);
    kit.solid.add(prism(5.2, 4.6, FUNNEL_H - 6, 10).translate(0, 6, 0), kit.palette.accent, m);
    kit.solid.add(prism(5.25, 5.25, 1.2, 10).translate(0, FUNNEL_H - 7, 0), WHITE, m);
    kit.solid.add(prism(4.6, 4.5, 2, 10).translate(0, FUNNEL_H - 2, 0), DARK, m);
  }
  // Mast and a turning radar bar, red light on top.
  kit.solid.add(beam([RADAR.x, TOP_Y, 0], [RADAR.x - 3, TOP_Y + 16, 0], 0.4, 4), WHITE);
  const radar: Motion = { hub: [RADAR.x - 2.6, 0, 0], axisA: [0, 1, 0], spinA: RADAR.spin };
  kit.moving.add(box(7, 0.6, 0.8), DARK, T(RADAR.x - 2.6, TOP_Y + 12, 0), radar);
  kit.lamp(new THREE.OctahedronGeometry(0.5), [RADAR.x - 3, TOP_Y + 16.6, 0], RED_LIGHT, 4, undefined, { depth: 0.9, freq: 2.5, phase: 0, sharp: 6 });
  // Guests along the sun deck rails.
  for (let i = 0; i < kit.q(70, 30); i++) {
    const x = -100 + rng() * 170;
    kit.crowd({ x, y: TOP_Y, z: (rng() < 0.5 ? -1 : 1) * (tier(TIERS - 1).w / 2 - 1.5), ry: rng() * 6, color: kit.festiveColor(), hop: 0.08, freq: 3, phase: rng() * 9, walk: rng() * 3, walkFreq: 0.2 });
  }
}

function plumes(kit: Kit): void {
  const { rng } = kit;
  const puff = kit.particles(false, 1.1);
  // Smoke drifts aft: the ship's own way plus a light sea breeze.
  for (const fx of FUNNELS) smoke(puff, rng, [fx - 3, TOP_Y + FUNNEL_H + 1, 0], { count: kit.q(SMOKE.high, SMOKE.low), color: 0x9a9aa0, size: 8, rise: 6, wind: [-9, 0, 2], period: 9, spread: 4, grow: 0.3 });
  // The horn: a sharp white jet of steam from the front funnel, every HORN.period seconds.
  const hornAt: V3 = [FUNNELS[0] + 4, TOP_Y + FUNNEL_H + 1, 0];
  for (let i = 0; i < kit.q(40, 20); i++) {
    puff.add(hornAt, [(rng() - 0.3) * 4, 22 + rng() * 8, (rng() - 0.5) * 4], 0xffffff, 3 + rng() * 2, { period: HORN.period, lifetime: HORN.lifetime, phase: (i / 40) * 0.4, grow: 1.2 }, { drag: 1.2, fadeIn: 0.02 });
  }
  // Bow wave and wake: foam thrown off the stem and streaming aft along both sides.
  const bowX = LENGTH / 2;
  for (const side of [-1, 1]) {
    splash(puff, rng, [bowX - 6, 0.6, side * 4], { count: kit.q(18, 9), speed: 3, up: 5, size: 2.2, period: 1.6, time: side > 0 ? 0 : 0.8, dir: [-2, 0, side * 5] });
    const n = kit.q(WAKE.high, WAKE.low);
    for (let i = 0; i < n; i++) {
      const x = bowX - 10 - rng() * (LENGTH - 10);
      const halfW = BEAM_W / 2 * (x > bowX - 70 ? 0.6 + 0.4 * (bowX - x) / 70 : 1);
      const period = 4 + rng() * 2;
      puff.add([x, 0.4, side * (halfW + 1)], [-WATER_SPEED, 0.6, side * 1.4], FOAM, 3 + rng() * 2, { period, lifetime: period, phase: rng() * period, grow: 0.2 }, { drag: 0.1, fadeIn: 0.15 });
    }
  }
  for (let i = 0; i < kit.q(40, 20); i++) {
    const period = 5;
    puff.add([-LENGTH / 2 - 2, 0.5, (rng() - 0.5) * BEAM_W * 0.6], [-WATER_SPEED - rng() * 3, 0.8, (rng() - 0.5) * 6], FOAM, 4 + rng() * 3, { period, lifetime: period, phase: rng() * period, grow: 0.35 }, { drag: 0.15, fadeIn: 0.1 });
  }
  // A long flat V of churned water behind the stern.
  kit.moving.add(wake(150, 70), mix(FOAM, 0x6ac8d8, 0.25), T(-LENGTH / 2 + 4, 0.12, 0), { drift: [0, 0, 2], driftFreq: 0.4 });
  kit.moving.add(wake(26, 44), FOAM, T(LENGTH / 2 - 4, 0.15, 0), { drift: [1.2, 0, 0], driftFreq: 1.1 });
}

export function createCruiseliner(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  shipHull(kit);
  superstructure(kit);
  sunDeck(kit);
  plumes(kit);
  return finishCoast(kit, RADIUS);
}
