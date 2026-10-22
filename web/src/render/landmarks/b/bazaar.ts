// The bazaar: a sprawling frontier market. Rows of striped stalls along lanes full of
// shoppers, a domed trade hall with two wind-catcher towers for the far silhouette, bunting
// and lantern strings over the lanes, pack beasts and smoking cook fires.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from './kit.ts';
import type { V3 } from './motion.ts';
import { Frame, ball, beam, box, cone, dome, mix, pick, prism, quad, shade, vary } from './shapes.ts';
import { beast, bunting, lampString, palm, stripedAwning } from './props.ts';

const SALT = 0xba2aa7;
/** Market extent along the road (x) and the row layout across it (z, front row nearest −Z). */
const HALF_LENGTH = 132;
const STALL_WIDTH = 7.2;
/** Each row: z of the stall's centre and which way it opens (−1 toward −Z). */
const ROWS: readonly { z: number; face: 1 | -1 }[] = [
  { z: -48, face: -1 },
  { z: -38, face: 1 },
  { z: -14, face: -1 },
  { z: -4, face: 1 },
  { z: 20, face: -1 },
];
/** Lanes between the rows: centre z and half width (where the crowd walks). */
const LANES: readonly { z: number; half: number }[] = [
  { z: -60, half: 5 },
  { z: -26, half: 6 },
  { z: 8, half: 6 },
];
/** Cross alleys break the rows so the market reads as streets, not a wall. */
const ALLEY_EVERY = 5;
const FOOD_STALL_CHANCE = 0.14;
/** Wares piled on each counter. */
const GOODS = 3;
const HALL = { z: 56, radius: 27, drum: 17 } as const;
const TOWER = { x: 44, z: 52, height: 60 } as const;
const CROWD = { high: 300, low: 150 } as const;
const BEASTS = { high: 12, low: 6 } as const;
const BANNER_POLE = 20;
const SMOKE_PER_FIRE = { high: 22, low: 12 } as const;
const SMOKE_PERIOD = 7;
const RADIUS = 170;

function stall(kit: Kit, f: Frame, food: boolean, smoke: (at: V3) => void): void {
  const { rng } = kit;
  const wood = vary(rng, 0x7a5236, 0.12);
  const cloth = kit.festiveColor();
  const cream = vary(rng, 0xf3e6c8, 0.05);
  const w = STALL_WIDTH - 1;
  const s = kit.solid;
  // Front posts only: the back wall cloth carries the awning's rear edge.
  for (const x of [-w / 2, w / 2]) s.add(beam(f.p(x, 0, -2.6), f.p(x, 3.1, -2.6), 0.12, 3), wood);
  s.add(box(w, 1.05, 1.1), shade(wood, 1.15), f.m(0, 0, -2.2));
  s.add(quad(w + 0.6, 3.8), vary(rng, cloth, 0.2), f.m(0, 1.9, 2.5));
  stripedAwning(kit.moving, f, w + 0.6, [3.8, 2.5], [2.9, -3.4], 6, cloth, cream, { amp: 0.035, freq: 3 + rng() * 2, phase: rng() * 6 });
  // Goods piled on the counter and stacked at the sides.
  for (let i = 0; i < GOODS; i++) {
    const x = -w / 2 + 1 + i * ((w - 2) / (GOODS - 1));
    const good = kit.festiveColor();
    const kind = Math.floor(rng() * 4);
    if (kind === 0) s.add(cone(0.55, 0.7, 5), good, f.m(x, 1.05, -2.2));
    else if (kind === 1) s.add(new THREE.OctahedronGeometry(0.45), good, f.m(x, 1.5, -2.2));
    else if (kind === 2) s.add(prism(0.35, 0.25, 0.9, 4, true), shade(good, 0.8), f.m(x, 1.05, -2.2));
    else s.add(box(0.8, 0.5, 0.7), good, f.m(x, 1.05, -2.2, rng()));
  }
  const crates = Math.floor(rng() * 3);
  for (let i = 0; i < crates; i++) s.add(box(1.1, 1.0, 1.1), vary(rng, 0xa07a50, 0.15), f.m(w / 2 + 0.9, i * 1.0, 1 - i * 0.2, rng() * 0.4));
  // A rug hung on a rail, stirring.
  if (rng() < 0.5) {
    const top = f.p(-w / 2 - 0.4, 3.2, 0);
    kit.moving.add(quad(1.8, 2.6), kit.festiveColor(), f.m(-w / 2 - 0.4, 1.9, 0, Math.PI / 2), { pivot: top, axisB: f.dir(0, 0, 1), swingB: 0.08, freq: 2.2, phase: rng() * 6 });
  }
  const lanternAt = f.p(w / 2 - 0.3, 2.5, -3.1);
  kit.lights.add(beam(f.p(w / 2 - 0.3, 3.0, -3.1), lanternAt, 0.03, 3), 0x2a1a10);
  kit.lamp(new THREE.OctahedronGeometry(0.32).scale(1, 1.4, 1), lanternAt, pick(rng, kit.lamps), 2.6, undefined, { depth: 0.25, freq: 2 + rng() * 3, phase: rng() * 6 });
  if (food) {
    s.add(prism(0.9, 0.7, 1.0, 7), 0x2a2220, f.m(-1.2, 0, -4.2));
    kit.lamp(cone(0.7, 0.9, 5), f.p(-1.2, 0.95, -4.2), 0xff7a2a, 3, undefined, { depth: 0.4, freq: 9, phase: rng() * 6 });
    smoke(f.p(-1.2, 1.6, -4.2));
  }
}

function hall(kit: Kit, wall: THREE.Color): void {
  const s = kit.solid;
  const tile = mix(kit.palette.accent, 0x2a8a9a, 0.45);
  s.add(prism(HALL.radius + 2, HALL.radius + 1, 1.5, 12), shade(wall, 0.85), new THREE.Matrix4().makeTranslation(0, 0, HALL.z));
  s.add(prism(HALL.radius, HALL.radius, HALL.drum, 12), wall, new THREE.Matrix4().makeTranslation(0, 1.5, HALL.z));
  s.add(prism(HALL.radius + 1.2, HALL.radius + 1.2, 1.2, 12), shade(wall, 1.12), new THREE.Matrix4().makeTranslation(0, HALL.drum + 1.5, HALL.z));
  s.add(dome(HALL.radius * 0.96, 14, 7, 1.15), tile, new THREE.Matrix4().makeTranslation(0, HALL.drum + 2.7, HALL.z));
  const top = HALL.drum + 2.7 + HALL.radius * 1.1;
  s.add(prism(1.6, 0.5, 6, 6), 0xd8b040, new THREE.Matrix4().makeTranslation(0, top - 0.5, HALL.z));
  kit.lamp(new THREE.OctahedronGeometry(1.4), [0, top + 6.5, HALL.z], kit.palette.accent, 16, undefined, { depth: 0.3, freq: 1.2, phase: 0 });
  // Arched doorways round the drum (dark recesses) with a lamp above each.
  const doors = 8;
  for (let i = 0; i < doors; i++) {
    const a = (i / doors) * Math.PI * 2 + Math.PI / doors;
    const r = HALL.radius + 0.05;
    const f = new Frame(Math.sin(a) * r, 0, HALL.z - Math.cos(a) * r, -a);
    s.add(box(5, 7, 0.4), 0x2a1a14, f.m(0, 1.5, 0));
    s.add(cone(2.5, 2.6, 4), 0x2a1a14, f.m(0, 8.5, 0, Math.PI / 4, 0, 0, [1, 1, 0.16]));
    kit.lamp(new THREE.OctahedronGeometry(0.5), f.p(0, 12.5, -0.5), 0xffc070, 5, undefined, { depth: 0.2, freq: 2, phase: i });
  }
}

/** Slender wind-catcher tower: tapering shaft, vented head, onion cap and a beacon. */
function tower(kit: Kit, x: number, z: number, wall: THREE.Color): void {
  const s = kit.solid;
  const h = TOWER.height;
  s.add(prism(4.2, 3.0, h, 8), wall, new THREE.Matrix4().makeTranslation(x, 0, z));
  s.add(prism(4.6, 4.6, 1.2, 8), shade(wall, 1.1), new THREE.Matrix4().makeTranslation(x, h * 0.62, z));
  s.add(box(7, 6, 7), shade(wall, 1.05), new THREE.Matrix4().makeTranslation(x, h, z));
  for (const r of [0, Math.PI / 2]) s.add(box(7.2, 4, 1.2), 0x2a1a14, new THREE.Matrix4().makeRotationY(r).setPosition(x, h + 1, z));
  s.add(dome(4.2, 8, 4, 1.6), mix(kit.palette.accent, 0x2a8a9a, 0.45), new THREE.Matrix4().makeTranslation(x, h + 6, z));
  kit.lamp(new THREE.OctahedronGeometry(0.9), [x, h + 14, z], 0xffd27a, 10, undefined, { depth: 0.5, freq: 2.4, phase: x });
}

export function createBazaar(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const { rng } = kit;
  const wall = mix(kit.palette.sand, 0xf2e2c4, 0.55);
  const smoke = kit.particles(false, 1.2);
  const smokeCol = mix(0x8a8078, kit.palette.horizon, 0.3);
  const perFire = kit.q(SMOKE_PER_FIRE.high, SMOKE_PER_FIRE.low);
  const addSmoke = (at: V3) => {
    for (let i = 0; i < perFire; i++) {
      smoke.add(at, [0.6 + rng() * 0.6, 2.4 + rng(), (rng() - 0.5) * 0.6], vary(rng, smokeCol, 0.08), 1.6, { period: SMOKE_PERIOD, lifetime: SMOKE_PERIOD, phase: (i / perFire) * SMOKE_PERIOD, grow: 0.55 }, { fadeIn: 0.15 });
    }
  };

  // Packed-earth floor so the market sits on its own ground.
  kit.solid.add(box(HALF_LENGTH * 2 + 20, 0.3, 140), mix(kit.palette.sand, kit.palette.road, 0.5), new THREE.Matrix4().makeTranslation(0, -0.15, -2));

  const highStep = kit.high ? 1 : 2;
  for (const row of ROWS) {
    let slot = 0;
    for (let x = -HALF_LENGTH; x <= HALF_LENGTH; x += STALL_WIDTH, slot++) {
      if (slot % ALLEY_EVERY === ALLEY_EVERY - 1) continue;
      if (slot % highStep !== 0) continue;
      // The back row gives way to the trade hall's plaza.
      if (row.z > 0 && Math.abs(x) < HALL.radius + 6) continue;
      const f = new Frame(x, 0, row.z, row.face === -1 ? 0 : Math.PI);
      stall(kit, f, rng() < FOOD_STALL_CHANCE, addSmoke);
    }
  }
  hall(kit, wall);
  tower(kit, -TOWER.x, TOWER.z, wall);
  tower(kit, TOWER.x, TOWER.z, wall);

  // Poles along the lanes carry bunting across them and lantern strings down them.
  for (const lane of LANES) {
    const zA = lane.z - lane.half - 0.5;
    const zB = lane.z + lane.half + 0.5;
    for (let x = -HALF_LENGTH; x <= HALF_LENGTH; x += STALL_WIDTH * ALLEY_EVERY) {
      for (const z of [zA, zB]) kit.solid.add(beam([x, 0, z], [x, 7.5, z], 0.14, 4), 0x5a3a24);
      bunting(kit, [x, 7.3, zA], [x, 7.3, zB], 1.2, 7, 0.9);
      if (x + STALL_WIDTH * ALLEY_EVERY <= HALF_LENGTH) {
        const nx = x + STALL_WIDTH * ALLEY_EVERY;
        lampString(kit, [x, 7.0, zA], [nx, 7.0, zA], 2.2, kit.q(8, 4), 0.2, 1.6);
        bunting(kit, [x, 7.2, zB], [nx, 7.2, zB], 2.6, kit.q(12, 6), 0.8);
      }
    }
  }

  // Tall banner poles at both market gates: the read from the road at speed.
  for (const gx of [-HALF_LENGTH - 12, HALF_LENGTH + 12]) {
    for (const gz of [-58, -20, 14]) {
      kit.solid.add(beam([gx, 0, gz], [gx, BANNER_POLE, gz], 0.25, 5), 0x4a3020);
      kit.solid.add(ball(0.6, 5, 3), 0xd8b040, new THREE.Matrix4().makeTranslation(gx, BANNER_POLE + 0.4, gz));
      const top: V3 = [gx, BANNER_POLE - 0.6, gz];
      kit.moving.add(quad(3.2, 11), kit.festiveColor(), new THREE.Matrix4().makeTranslation(gx + Math.sign(gx) * 1.8, BANNER_POLE - 6.2, gz), { pivot: top, axisB: [0, 1, 0], swingB: 0.35, freq: 1.3, phase: gz });
    }
  }

  // Palms round the hall plaza.
  for (let i = 0; i < kit.q(10, 6); i++) {
    const a = (i / kit.q(10, 6)) * Math.PI - Math.PI;
    palm(kit, Math.cos(a) * (HALL.radius + 12), HALL.z + Math.sin(a) * (HALL.radius + 12) * 0.6 - 6, 11 + rng() * 6, rng);
  }

  // Pack beasts tethered at the gates and resting by the hall.
  const cargo = [kit.festiveColor(), 0x9a7a50, 0x6a5040, kit.festiveColor()];
  for (let i = 0; i < kit.q(BEASTS.high, BEASTS.low); i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (HALF_LENGTH + 4 + (i % 3) * 6);
    const z = -50 + Math.floor(i / 2) * 13 + rng() * 3;
    beast(kit, new Frame(x, 0, z, Math.PI / 2 + side * (Math.PI / 2) + (rng() - 0.5) * 0.8), rng, cargo);
  }

  // Shoppers: most stroll up and down the lanes, some linger at the counters.
  const crowd = kit.q(CROWD.high, CROWD.low);
  for (let i = 0; i < crowd; i++) {
    const lane = pick(rng, LANES);
    const lingering = rng() < 0.3;
    const x = (rng() * 2 - 1) * HALF_LENGTH;
    const z = lane.z + (rng() * 2 - 1) * lane.half * (lingering ? 1 : 0.7);
    kit.crowd({
      x,
      y: 0,
      z,
      ry: lingering ? (z < lane.z ? Math.PI : 0) : rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2,
      color: vary(rng, kit.festiveColor(), 0.25),
      hop: lingering ? 0.04 : 0.12,
      freq: lingering ? 1.5 : 7 + rng() * 2,
      phase: rng() * 100,
      walk: lingering ? 0 : 3 + rng() * 7,
      walkFreq: 0.12 + rng() * 0.12,
      scale: 0.9 + rng() * 0.2,
    });
  }
  // The plaza in front of the hall is busier still, with a few cheering a street act.
  for (let i = 0; i < kit.q(60, 30); i++) {
    const a = rng() * Math.PI * 2;
    const r = 4 + rng() * 10;
    kit.crowd({ x: Math.cos(a) * r, y: 0, z: 20 + Math.sin(a) * r * 0.6, ry: -a - Math.PI / 2, color: kit.festiveColor(), hop: 0.3, freq: 5 + rng() * 2, phase: rng() * 100, sharp: 2, raise: 0.7 });
  }
  return kit.finish(RADIUS);
}

