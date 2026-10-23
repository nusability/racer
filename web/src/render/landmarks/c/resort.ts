// The resort: three curved hotel towers in a crescent, stacked with balconies, cupping a pool
// terrace with infinity pools and cabanas. A palm-lined promenade along the front, a glowing
// sun sign on the crown, guests round the pools, umbrellas on the beach behind, and a
// helicopter that lifts off the roof pad, circles up and settles back.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import type { Motion, V3 } from '../b/motion.ts';
import { Frame, T, beam, box, lathe, mix, prism, shade, vary } from '../b/shapes.ts';
import { lampString, palm, stripedAwning } from '../b/props.ts';
import { DARK, GLASS, RED_LIGHT, WARM_LIGHT, WHITE, finishCoast } from './kit.ts';

const SALT = 0x2e5027;
const RADIUS = 160;
/** The crescent's centre lies out toward the track, so the towers' concave faces look at it. */
const ARC = { z: -150, r: 200 } as const;
const FLOOR_H = 3.4;
const DEPTH = 15;
const TOWERS: readonly { a0: number; a1: number; floors: number; segs: number }[] = [
  { a0: 1.98, a1: 2.42, floors: 13, segs: 6 },
  { a0: 1.4, a1: 1.74, floors: 19, segs: 5 },
  { a0: 0.72, a1: 1.16, floors: 15, segs: 6 },
];
const TERRACE = { y: 2.2, z0: -62, z1: 8, x: 118 } as const;
const POOLS: readonly { x: number; z: number; w: number; d: number }[] = [
  { x: -46, z: -30, w: 46, d: 18 },
  { x: 40, z: -24, w: 52, d: 16 },
  { x: -2, z: -48, w: 26, d: 10 },
];
const PROMENADE_Z = -84;
const PALMS = { high: 16, low: 9 } as const;
const GUESTS = { high: 160, low: 70 } as const;
const UMBRELLAS = { high: 22, low: 10 } as const;
const HELI = { rise: 46, freq: 0.24, rotor: 14 } as const;
const LIT_WINDOW = 0.35;
const POOL_BLUE = 0x3ad8f0;

function arcPoint(a: number, r: number = ARC.r): V3 {
  return [Math.cos(a) * r, 0, ARC.z + Math.sin(a) * r];
}

function towers(kit: Kit): { roof: V3 } {
  const { rng } = kit;
  const pastel = [0x8fd8d0, 0xffb0a0, 0xffe08a, kit.palette.accent].map((c) => new THREE.Color(c));
  let roof: V3 = [0, 0, 0];
  TOWERS.forEach((t, ti) => {
    const h = t.floors * FLOOR_H;
    const wall = vary(rng, mix(WHITE, kit.palette.sand, 0.2), 0.04);
    const rail = pastel[ti % pastel.length];
    const segLen = ((t.a1 - t.a0) * ARC.r) / t.segs + 0.6;
    for (let s = 0; s < t.segs; s++) {
      const a = t.a0 + ((s + 0.5) / t.segs) * (t.a1 - t.a0);
      const c = arcPoint(a, ARC.r + DEPTH / 2);
      // Frame: local −Z faces the crescent's centre (the track), +X runs along the arc.
      const f = new Frame(c[0], 0, c[2], Math.PI / 2 - a);
      const stepped = s === 0 || s === t.segs - 1 ? FLOOR_H * 2 : 0;
      kit.solid.add(box(segLen, h - stepped, DEPTH), wall, f.m());
      kit.solid.add(box(segLen - 0.4, h - stepped - 2, 0.3), GLASS, f.m(0, 1.5, -DEPTH / 2 - 0.05));
      for (let k = 1; k < t.floors - stepped / FLOOR_H; k++) {
        const y = k * FLOOR_H;
        kit.solid.add(box(segLen - 0.2, 0.35, 2.2), shade(WHITE, 0.92), f.m(0, y - 0.35, -DEPTH / 2 - 1.1));
        kit.solid.add(box(segLen - 0.2, 1.0, 0.12), k % 2 ? rail : shade(rail, 0.85), f.m(0, y, -DEPTH / 2 - 2.15));
        if (rng() < LIT_WINDOW) kit.lamp(box(segLen * (0.3 + rng() * 0.4), 1.6, 0.1), f.p((rng() - 0.5) * segLen * 0.5, y + 1.2, -DEPTH / 2 - 0.2), mix(WARM_LIGHT, 0xffffff, rng() * 0.5), 0, undefined, { depth: 0.15, freq: 0.3, phase: k });
      }
      // Seaward face: plain with window rows.
      kit.solid.add(box(segLen - 0.4, h - stepped - 4, 0.3), shade(GLASS, 1.2), f.m(0, 2, DEPTH / 2 + 0.05));
    }
    // Rooftop crown: a fin of the tower's rail colour, a beacon on top.
    const mid = (t.a0 + t.a1) / 2;
    const c = arcPoint(mid, ARC.r + DEPTH / 2);
    const f = new Frame(c[0], h, c[2], Math.PI / 2 - mid);
    kit.solid.add(box(8, 6, DEPTH - 3), shade(WHITE, 0.88), f.m(-12));
    kit.solid.add(box(1.4, 14, 10), rail, f.m(14, 0, 0));
    kit.lamp(new THREE.OctahedronGeometry(0.5), f.p(14, 14.6, 0), RED_LIGHT, 4, undefined, { depth: 0.9, freq: 2, phase: ti, sharp: 6 });
    if (ti === 1) roof = f.p(0, 0, 0);
  });
  return { roof };
}

/** The resort's emblem on the tallest tower: a sunburst of lamps with a rising neon wave. */
function sign(kit: Kit): void {
  const t = TOWERS[1];
  const mid = (t.a0 + t.a1) / 2;
  const c = arcPoint(mid, ARC.r - 4);
  const f = new Frame(c[0], t.floors * FLOOR_H - 9, c[2], Math.PI / 2 - mid);
  kit.solid.add(box(30, 14, 1.2), DARK, f.m(0, -3, 1.5));
  kit.lamp(new THREE.CircleGeometry(4.2, 14), f.p(-8, 4, 0.7), 0xffb030, 12, undefined, { depth: 0.25, freq: 1.4, phase: 0 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    kit.lamp(new THREE.OctahedronGeometry(0.5).scale(1, 1, 0.4), f.p(-8 + Math.cos(a) * 6.2, 4 + Math.sin(a) * 6.2, 0.6), 0xffd060, 1.4, undefined, { depth: 0.9, freq: 3, phase: -i * 0.6, sharp: 3 });
  }
  for (let i = 0; i < 16; i++) {
    const x = -1 + i * 1.2;
    kit.lamp(box(1.3, 0.5, 0.2), f.p(x, 2 + Math.sin(i * 0.7) * 2, 0.6), kit.palette.accent, 1.2, undefined, { depth: 0.8, freq: 4, phase: -i * 0.5, sharp: 2 });
  }
}

function helicopter(kit: Kit, roof: V3): void {
  const [x, y, z] = roof;
  kit.solid.add(prism(9, 9, 0.6, 16), 0x3a3e46, T(x, y, z));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    kit.lamp(new THREE.OctahedronGeometry(0.3), [x + Math.cos(a) * 8.6, y + 0.8, z + Math.sin(a) * 8.6], 0x80ff90, 1.2, undefined, { depth: 0.6, freq: 3, phase: i, sharp: 2 });
  }
  kit.solid.add(prism(6.4, 6.4, 0.1, 16, true), 0xf4d03f, T(x, y + 0.62, z));
  // Lifts off, climbs, hangs and settles: the hop pulse is zero (parked) half the cycle.
  const fly: Motion = { hop: HELI.rise, freq: HELI.freq, phase: 0 };
  const body = y + 1.8;
  const col = kit.palette.accent;
  kit.moving.add(new THREE.SphereGeometry(1, 8, 5).scale(3, 1.7, 1.7), col, T(x, body, z), fly);
  kit.moving.add(beam([x - 2, body + 0.4, z], [x - 9, body + 1, z], 0.35, 4), col, undefined, fly);
  kit.moving.add(box(0.3, 2.2, 1.4), shade(col, 0.7), T(x - 9, body + 0.2, z), fly);
  for (const s of [-1, 1]) kit.moving.add(beam([x - 2.4, body - 1.6, z + s * 1.4], [x + 2.4, body - 1.6, z + s * 1.4], 0.12, 3), DARK, undefined, fly);
  kit.moving.add(box(1.6, 0.9, 2.6), GLASS, T(x + 1.8, body + 0.1, z), fly);
  const rotor: Motion = { hop: HELI.rise, freq: HELI.freq, phase: 0, pivot: [x, body, z], axisB: [0, 1, 0], spinB: HELI.rotor };
  kit.moving.add(box(14, 0.12, 0.6), DARK, T(x, body + 2, z), rotor);
  kit.moving.add(box(0.6, 0.12, 14), DARK, T(x, body + 2, z), rotor);
  kit.lamp(new THREE.OctahedronGeometry(0.3), [x, body - 1.8, z], RED_LIGHT, 2.5, fly, { depth: 0.9, freq: 4, phase: 0, sharp: 6 });
}

function terrace(kit: Kit): void {
  const { x, y, z0, z1 } = TERRACE;
  const stone = mix(kit.palette.sand, 0xf0e6d4, 0.5);
  kit.solid.add(box(x * 2, y, z1 - z0), stone, T(0, 0, (z0 + z1) / 2));
  for (const p of POOLS) {
    // Infinity edge: the water runs right to the terrace front and spills down a glowing lip.
    kit.lamp(prism(1, 1, 0.12, 14).scale(p.w / 2, 1, p.d / 2), [p.x, y + 0.02, p.z], POOL_BLUE, 0);
    kit.solid.add(prism(1, 1, 0.5, 14).scale(p.w / 2 + 1.2, 1, p.d / 2 + 1.2), shade(stone, 1.08), T(p.x, y - 0.45, p.z));
  }
  kit.lamp(box(POOLS[2].w, y, 0.2), [POOLS[2].x, 0, z0 - 0.1], mix(POOL_BLUE, WHITE, 0.3), 0);
  // Steps down to the promenade.
  for (let i = 0; i < 3; i++) kit.solid.add(box(20, y - i * 0.7, 1.4), shade(stone, 0.95), T(-2 + 40, 0, z0 - 0.7 - i * 1.4));
  // Cabanas: white boxes with striped canopies along the terrace back.
  for (let i = 0; i < 8; i++) {
    const cx = -84 + i * 24;
    const f = new Frame(cx, y, -2 + (i % 2) * 2, 0);
    const col = kit.festive[i % kit.festive.length];
    for (const dx of [-2.6, 2.6]) kit.solid.add(beam(f.p(dx, 0, -2.4), f.p(dx, 3.2, -2.4), 0.1, 3), WHITE);
    kit.solid.add(box(5.6, 3.2, 0.3), WHITE, f.m(0, 0, 2.4));
    stripedAwning(kit.moving, f, 6, [3.4, 2.5], [3.0, -2.6], 5, col, WHITE, { amp: 0.03, freq: 2.5, phase: i });
    kit.solid.add(box(3.6, 0.5, 2.2), WHITE, f.m(0, 0, 0.6));
  }
  // Loungers along the pool sides.
  for (const p of POOLS.slice(0, 2)) {
    for (let k = 0; k < 7; k++) kit.solid.add(box(1, 0.45, 2.3), k % 2 ? WHITE : kit.palette.accent, T(p.x - p.w / 2 + 3 + k * ((p.w - 6) / 6), y, p.z - p.d / 2 - 3.2));
  }
}

function promenade(kit: Kit): void {
  const { rng } = kit;
  kit.solid.add(box(300, 0.3, 10), mix(kit.palette.road, 0xe8d8c0, 0.6), T(0, 0, PROMENADE_Z));
  const n = kit.q(PALMS.high, PALMS.low);
  const posts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const x = -140 + (i * 280) / (n - 1);
    palm(kit, x, PROMENADE_Z - 6, 13 + rng() * 5, rng);
    if (i % 2 === 0) {
      const top: V3 = [x + 8, 6, PROMENADE_Z + 4];
      kit.solid.add(beam([top[0], 0, top[2]], top, 0.14, 4), DARK);
      kit.lamp(new THREE.OctahedronGeometry(0.45), [top[0], top[1] + 0.4, top[2]], 0xfff0c0, 3, undefined, { depth: 0.1, freq: 1, phase: i });
      posts.push(top);
    }
  }
  for (let i = 1; i < posts.length; i++) lampString(kit, posts[i - 1], posts[i], 1.2, kit.q(6, 3), 0.2, 1.3);
}

function beachAndGuests(kit: Kit): void {
  const { rng } = kit;
  const n = kit.q(UMBRELLAS.high, UMBRELLAS.low);
  for (let i = 0; i < n; i++) {
    const x = -130 + (i % 11) * 26 + rng() * 6;
    const z = 92 + Math.floor(i / 11) * 18 + rng() * 6;
    const colA = kit.festiveColor();
    kit.solid.add(beam([x, 0, z], [x, 3.4, z], 0.08, 3), WHITE);
    for (let g = 0; g < 8; g++) kit.solid.add(lathe([[0.05, 0.9], [2.6, 0]], 1, (g / 8) * Math.PI * 2, Math.PI / 4), g % 2 ? WHITE : colA, T(x, 3.0, z));
    kit.solid.add(box(1, 0.4, 2.2), WHITE, T(x + 1.6, 0, z + 0.5));
  }
  const g = kit.q(GUESTS.high, GUESTS.low);
  for (let i = 0; i < g; i++) {
    const where = rng();
    const pool = POOLS[i % 2];
    const onTerrace = where < 0.55;
    const x = onTerrace ? pool.x + (rng() - 0.5) * (pool.w + 8) : -130 + rng() * 260;
    const z = onTerrace ? pool.z + (rng() < 0.5 ? -1 : 1) * (pool.d / 2 + 1.5 + rng() * 3) : where < 0.8 ? PROMENADE_Z + (rng() - 0.5) * 6 : 90 + rng() * 40;
    const y = onTerrace ? TERRACE.y : 0;
    const strolling = !onTerrace && where < 0.8;
    kit.crowd({ x, y, z, ry: strolling ? Math.PI / 2 : rng() * 6, color: vary(rng, kit.festiveColor(), 0.2), hop: 0.06, freq: 2 + rng(), phase: rng() * 9, walk: strolling ? 4 + rng() * 10 : 0, walkFreq: 0.1 + rng() * 0.1 });
  }
}

export function createResort(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const { roof } = towers(kit);
  sign(kit);
  helicopter(kit, roof);
  terrace(kit);
  promenade(kit);
  beachAndGuests(kit);
  return finishCoast(kit, RADIUS);
}
