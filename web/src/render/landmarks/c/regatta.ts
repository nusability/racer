// The regatta: a fleet of racing yachts and flying catamarans under bright sails, rounding
// marker buoys on a course out at sea. Boats heel and weave as they tack, throw spray off
// their bows and leave white wakes; a committee boat dressed in flags fires a start gun.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import type { Motion, V3 } from '../b/motion.ts';
import { T, beam, box, cone, lathe, mix, prism, shade } from '../b/shapes.ts';
import { bunting } from '../b/props.ts';
import { DARK, FOAM, GREEN_LIGHT, RED_LIGHT, WHITE, finishCoast, hull, sail, wake, FOAM_Y } from './kit.ts';

const SALT = 0x4e6a77a;
const RADIUS = 200;
/** Each boat sails its own lane round the hub, so faster boats pass without colliding. */
const LANES = { yacht0: 84, yachtGap: 7, catGap: 16 } as const;
const BUOYS = 4;
const BUOY_R = 175;
const YACHTS = { high: 11, low: 6 } as const;
/** Boats are drawn larger than life so the fleet reads from the track and across the bay. */
const BOAT_SCALE = 1.7;
const SPINNAKER_GORES = 6;
const CATS = { high: 4, low: 2 } as const;
/** Boat speed round the course, m/s (racing yachts flat out). */
const SPEED = { min: 9, max: 13 } as const;
/** Tacking: the boat swings about an axis between its keel line and the vertical. */
const TACK = { swing: 0.28, freq: 0.45, lean: 0.6 } as const;
const COMMITTEE = { x: -30, z: -150 } as const;
const GUN = { period: 18, puffs: { high: 26, low: 14 } } as const;

interface Boat {
  /** Position on the course (rest pose) and its angle round the hub. */
  at: V3;
  a: number;
  spin: number;
  phase: number;
}

/** The boat's own frame: bow along +X, rotated to sail tangent to its circle. */
function frame(b: Boat, heel: number): THREE.Matrix4 {
  return T(b.at[0], b.at[1], b.at[2], Math.PI / 2 - b.a, heel, 0, BOAT_SCALE);
}

function motionFor(b: Boat, fwd: V3): Motion {
  const len = Math.hypot(fwd[0] * TACK.lean, 1);
  const axis: V3 = [(fwd[0] * TACK.lean) / len, 1 / len, (fwd[2] * TACK.lean) / len];
  return { hub: [0, 0, 0], axisA: [0, 1, 0], spinA: b.spin, pivot: b.at, axisB: axis, swingB: TACK.swing, freq: TACK.freq, phase: b.phase };
}

function forward(b: Boat): V3 {
  return [Math.sin(b.a), 0, -Math.cos(b.a)];
}

function local(m: THREE.Matrix4, x: number, y: number, z: number): V3 {
  const v = new THREE.Vector3(x, y, z).applyMatrix4(m);
  return [v.x, v.y, v.z];
}

/** Bow spray and a wake, carried round with the boat but not heeled with it. */
function water(kit: Kit, b: Boat, length: number, width: number): void {
  const orbit: Motion = { hub: [0, 0, 0], axisA: [0, 1, 0], spinA: b.spin };
  const flat = T(b.at[0], FOAM_Y, b.at[2], Math.PI / 2 - b.a, 0, 0, BOAT_SCALE);
  kit.moving.add(wake(length * 2.6, width * 2.6), mix(FOAM, 0x5ab8d0, 0.35), flat.clone().multiply(T(-length * 0.4, 0, 0)), orbit);
  for (const side of [-1, 1]) {
    const spray: Motion = { ...orbit, hop: 1.6, freq: 3.2 + kit.rng(), phase: b.phase + side };
    kit.moving.add(new THREE.OctahedronGeometry(0.9).scale(1.4, 0.8, 1), FOAM, flat.clone().multiply(T(length * 0.38, 0.4, side * width * 0.5)), spray);
  }
}

function yacht(kit: Kit, b: Boat): void {
  const L = 13;
  const W = 3.6;
  const fwd = forward(b);
  const motion = motionFor(b, fwd);
  const m = frame(b, -0.22);
  const hullCol = kit.rng() < 0.5 ? WHITE : kit.festiveColor();
  kit.moving.add(hull(L, W, 2.2, 0.4, 0.75), hullCol, m.clone().multiply(T(0, -1.1, 0)), motion);
  kit.moving.add(box(L * 0.5, 0.25, W * 0.7), 0xc8a878, m.clone().multiply(T(-L * 0.12, 1.1, 0)), motion);
  const mastFoot = local(m, L * 0.08, 1.1, 0);
  const mastTop = local(m, L * 0.08, 18, 0);
  kit.moving.add(beam(mastFoot, mastTop, 0.12, 3), DARK, undefined, motion);
  const sailCol = kit.festiveColor();
  // Mainsail sheeted out a little to leeward, jib forward of the mast.
  kit.moving.add(sail(local(m, L * 0.08, 2.2, 0), mastTop, local(m, -L * 0.42, 2.4, 0.9)), sailCol, undefined, motion);
  kit.moving.add(sail(local(m, L * 0.46, 1.4, 0), local(m, L * 0.08, 15.5, 0), local(m, L * 0.02, 1.8, 1.2)), WHITE, undefined, motion);
  // A sail number band across the main.
  kit.moving.add(sail(local(m, L * 0.06, 9, 0.05), local(m, L * 0.06, 11, 0.05), local(m, -L * 0.2, 7.6, 0.6)), shade(sailCol, 0.6), undefined, motion);
  if (kit.rng() < 0.45) {
    // A bellying spinnaker out ahead of the bow.
    const colA = kit.festiveColor();
    const colB = kit.festiveColor();
    const belly = m.clone().multiply(T(L * 0.5, 9.5, 0, 0, 0, -Math.PI / 2, [6.5, 3, 5]));
    for (let g = 0; g < SPINNAKER_GORES; g++) {
      kit.moving.add(lathe([[0.01, 1], [0.7, 0.72], [1, 0]], 3, (g / SPINNAKER_GORES) * Math.PI * 2, (Math.PI * 2) / SPINNAKER_GORES), g % 2 ? colA : colB, belly, motion);
    }
  }
  for (let i = 0; i < 2; i++) kit.moving.add(box(0.5, 0.8, 0.5), kit.festiveColor(), m.clone().multiply(T(-L * 0.3 + i * 1.2, 1.2, 1.2)), motion);
  water(kit, b, L, W);
}

function catamaran(kit: Kit, b: Boat): void {
  const L = 15;
  const fwd = forward(b);
  const motion = motionFor(b, fwd);
  // Heeled hard so the windward hull flies clear of the water.
  const m = frame(b, -0.2);
  const col = kit.festiveColor();
  for (const side of [-1, 1]) kit.moving.add(hull(L, 1.5, 1.6, 0.5, 0.6), side > 0 ? col : shade(col, 0.85), m.clone().multiply(T(0, -0.6, side * 3.6)), motion);
  kit.moving.add(box(L * 0.45, 0.2, 7.2), 0x2a2a30, m.clone().multiply(T(-L * 0.05, 0.8, 0)), motion);
  const mastFoot = local(m, L * 0.05, 1, 0);
  const mastTop = local(m, L * 0.05, 24, 0);
  kit.moving.add(beam(mastFoot, mastTop, 0.16, 3), DARK, undefined, motion);
  // A tall wing sail: two panels so it reads from far away.
  const wing = kit.palette.accent;
  kit.moving.add(sail(local(m, L * 0.05, 1.6, 0), mastTop, local(m, -L * 0.36, 2, 0)), wing, undefined, motion);
  kit.moving.add(sail(mastTop, local(m, -L * 0.36, 2, 0), local(m, -L * 0.1, 18, 0)), shade(wing, 0.75), undefined, motion);
  kit.moving.add(sail(local(m, L * 0.48, 1.2, 0), local(m, L * 0.05, 19, 0), local(m, L * 0.0, 1.4, 0)), 0xf4d03f, undefined, motion);
  water(kit, b, L, 8);
}

function buoys(kit: Kit): void {
  for (let i = 0; i < BUOYS; i++) {
    const a = (i / BUOYS) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * BUOY_R;
    const z = Math.sin(a) * BUOY_R;
    const bob: Motion = { pivot: [x, 0, z], axisB: [1, 0, 0], swingB: 0.12, freq: 1.1, phase: i * 1.7, hop: 0.4 };
    const col = i % 2 ? 0xff7a1a : 0xf4d03f;
    kit.moving.add(prism(2.4, 2.4, 3, 8), col, T(x, -1, z), bob);
    kit.moving.add(cone(2.4, 4.5, 8), col, T(x, 2, z), bob);
    kit.moving.add(beam([x, 6, z], [x, 9, z], 0.08, 3), DARK, undefined, bob);
    kit.moving.add(box(1.8, 1.1, 0.1).translate(0.9, 0, 0), WHITE, T(x, 8.4, z), bob);
    kit.lamp(new THREE.OctahedronGeometry(0.35), [x, 9.2, z], i % 2 ? RED_LIGHT : GREEN_LIGHT, 3, bob, { depth: 0.9, freq: 2, phase: i, sharp: 5 });
    kit.moving.add(prism(4, 4, 0.1, 10), FOAM, T(x, FOAM_Y, z), { drift: [0, 0.05, 0], driftFreq: 1.1, phase: i * 1.7 });
  }
}

function committeeBoat(kit: Kit): void {
  const { rng } = kit;
  const { x, z } = COMMITTEE;
  const m = T(x, 0, z, 0.15);
  kit.solid.add(hull(26, 7.5, 4.5, 0.32, 0.85), WHITE, m.clone().multiply(T(0, -2, 0)));
  kit.solid.add(hull(26.3, 7.7, 0.8, 0.32, 0.85, 1), 0x1a3a6a, m.clone().multiply(T(0, 1.6, 0)));
  kit.solid.add(box(10, 3, 5.4), WHITE, m.clone().multiply(T(-2, 2.5, 0)));
  kit.solid.add(box(10.2, 1, 5.6), 0x2a3a50, m.clone().multiply(T(-2, 4, 0)));
  kit.solid.add(box(6, 2.2, 4.4), WHITE, m.clone().multiply(T(-3, 5.5, 0)));
  const mastFoot = local(m, -1, 7.7, 0);
  const mastTop = local(m, -1, 17, 0);
  kit.solid.add(beam(mastFoot, mastTop, 0.15, 4), DARK);
  // Dressed overall: bunting from bow to masthead to stern.
  bunting(kit, local(m, 12.5, 2.6, 0), mastTop, 0.6, kit.q(9, 5), 0.9);
  bunting(kit, mastTop, local(m, -12.5, 2.6, 0), 0.6, kit.q(9, 5), 0.9);
  kit.lamp(new THREE.OctahedronGeometry(0.45), [mastTop[0], mastTop[1] + 0.6, mastTop[2]], 0xffffff, 3, undefined, { depth: 0.3, freq: 1, phase: 0 });
  // Start line to a pin buoy, and the gun's smoke puff.
  const pin: V3 = [x + 120, 0, z + 10];
  kit.moving.add(prism(1.2, 1.2, 3.5, 6), 0xff7a1a, T(pin[0], -0.8, pin[2]), { hop: 0.3, freq: 1.3 });
  kit.lamp(new THREE.OctahedronGeometry(0.3), [pin[0], 3.2, pin[2]], 0xff9a30, 2, { hop: 0.3, freq: 1.3 }, { depth: 0.9, freq: 2.5, phase: 0, sharp: 5 });
  const gun = kit.particles(false, 1.2);
  const muzzle = local(m, 12, 3, 0);
  for (let i = 0; i < kit.q(GUN.puffs.high, GUN.puffs.low); i++) {
    gun.add(muzzle, [-6 + rng() * 12, 3 + rng() * 4, -8 - rng() * 6], 0xf4f4f0, 3 + rng() * 2, { period: GUN.period, lifetime: 4, phase: 0, grow: 0.7 }, { drag: 1.4, fadeIn: 0.02 });
  }
}

export function createRegatta(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const { rng } = kit;
  const nY = kit.q(YACHTS.high, YACHTS.low);
  const nC = kit.q(CATS.high, CATS.low);
  const yachtLanes = Array.from({ length: nY }, (_, k) => LANES.yacht0 + k * LANES.yachtGap);
  for (let k = nY - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [yachtLanes[k], yachtLanes[j]] = [yachtLanes[j], yachtLanes[k]];
  }
  const catLane0 = LANES.yacht0 + nY * LANES.yachtGap + LANES.catGap / 2;
  for (let i = 0; i < nY + nC; i++) {
    const r = i < nY ? yachtLanes[i] : catLane0 + (i - nY) * LANES.catGap;
    // Bunched into a pack with stragglers, like a real race.
    const a = (i / (nY + nC)) * Math.PI * 1.4 + rng() * 0.3;
    const speed = SPEED.min + rng() * (SPEED.max - SPEED.min) + (i >= nY ? 3 : 0);
    const b: Boat = { at: [Math.cos(a) * r, 0, Math.sin(a) * r], a, spin: speed / r, phase: rng() * Math.PI * 2 };
    if (i < nY) yacht(kit, b);
    else catamaran(kit, b);
  }
  buoys(kit);
  committeeBoat(kit);
  return finishCoast(kit, RADIUS);
}
