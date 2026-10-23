// Mine: an open-cut mining rig chewing into a terraced mesa. A giant bucket-wheel excavator
// slews its boom across the bench face with the wheel turning and dust spilling; ore rides
// trestle conveyors up to steaming sorting towers and on to a stacker over the stockpile; haul
// trucks run a loop road and tip their beds; floodlight masts rake the cut.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import {
  T,
  addBeam,
  between,
  block,
  box,
  brush,
  col,
  cyl,
  disposeKit,
  fract,
  glowBoost,
  makeKit,
  mix,
  mulberry32,
  rock,
  shade,
  strut,
} from './kit.ts';
import { boundHazard, boundReach } from './bound.ts';
import { BoundDigger } from './mineBound.ts';

const RADIUS = 300;
const HEIGHT = 90;

// --- Excavator ---
const BWE_X = 0;
const BWE_Z = -70;
const BWE_SCALE = 1.6;
const BOOM_PIVOT = new THREE.Vector3(0, 16, 8);
const BOOM_TIP = new THREE.Vector3(0, 30, 86);
const WHEEL_R = 13;
const WHEEL_BUCKETS = 12;
const WHEEL_SPIN = 0.55;
const SLEW_RATE = 0.07;
const SLEW_ARC = 0.38;

// --- Mesa being cut ---
const MESA_Z = 195;
const MESA_TIERS = 5;
const MESA_R0 = 110;
const MESA_STEP = 16;
const MESA_TIER_H = 16;

// --- Conveyors (ore chunks per belt, speed m/s) ---
const BELT_SPEED = 7;
const ORE_PER_BELT = 16;

// --- Haul road ---
const ROAD_CX = 130;
const ROAD_CZ = -60;
const ROAD_RX = 95;
const ROAD_RZ = 55;
const TRUCK_SPEED = 11;
const ROAD_SEGMENTS = 24;

const STEAM_FOG = 0.75;

export function createMine(opts: LandmarkOptions): Landmark {
  const { palette, quality } = opts;
  const hi = quality === 'high';
  const rng = mulberry32(opts.seed ^ 0x313e);
  const bound = boundHazard(opts, 'mine', ['dropper'] as const);
  const boost = glowBoost(palette);
  const nTrucks = hi ? 4 : 2;
  const nMasts = hi ? 4 : 2;
  const orePerBelt = hi ? ORE_PER_BELT : ORE_PER_BELT / 2;
  const lampCount = nMasts + nTrucks * 2 + 10;
  const kit = makeKit(lampCount + 40, lampCount, hi ? 320 : 150);
  const { rig, glow, smoke } = kit;
  smoke.wind.set(3, 0, 1.5);
  smoke.setFogScale(STEAM_FOG);

  const rockCol = col(palette.rock);
  const band = mix(palette.rock, palette.sand, 0.45);
  const ore = mix(palette.rock, 0x40302a, 0.4);
  const yellow = mix(0xf0b020, palette.accent, 0.2);
  const steel = col(0x5c6068);
  const dark = col(0x2a2c30);
  const rust = mix(0x8a4a2a, palette.rock, 0.3);
  const white = col(0xf2efe8);
  const warm = col(0xffe2a0);
  const lampHot = col(0xfff4d8);
  const red = col(0xff4030);
  const accent = col(palette.accent);

  // --- The terraced mesa: stacked jittered rings, alternating strata ---
  for (let t = 0; t < MESA_TIERS; t++) {
    const r = MESA_R0 - t * MESA_STEP;
    const g = new THREE.CylinderGeometry(r - 6, r, MESA_TIER_H, 14, 1);
    const p = g.getAttribute('position');
    for (let v = 0; v < p.count; v++) {
      const k = 1 + (Math.sin(p.getX(v) * 0.05 + t) * 0.5 + (rng() - 0.5) * 0.4) * 0.08;
      p.setXYZ(v, p.getX(v) * k, p.getY(v), p.getZ(v) * k);
    }
    rig.add(g, t % 2 ? band : rockCol, { m: T(0, MESA_TIER_H * (t + 0.5), MESA_Z) });
  }
  // Benches' haul ramps and the fresh-cut face where the wheel works.
  rig.add(box(26, 1.5, 120), shade(band, 0.9), { m: T(-90, 18, 150, 0.28, 0.5) });
  rig.add(rock(1, 1), shade(ore, 1.1), { m: T(10, 4, MESA_Z - MESA_R0 - 4, 0, 0.3, 0, 46, 12, 18) });

  // --- Bucket-wheel excavator ---
  // Authored at working scale, then grown to its hero size on one bone.
  const bwe = rig.bone(rig.root, BWE_X, 0, BWE_Z);
  bwe.scale.setScalar(BWE_SCALE);
  // Bound: it stands at the road edge facing the course (and is sized in track metres).
  const digger = bound ? new BoundDigger(rig, bound.binding, bound.hazard, ore) : null;
  if (digger) {
    bwe.position.copy(digger.base);
    bwe.rotation.y = digger.yaw;
    bwe.scale.setScalar(BWE_SCALE * digger.frame.k);
  }
  // Crawler base (fixed).
  for (const side of [-1, 1]) {
    rig.add(block(10, 6, 36), dark, { bone: bwe, m: T(side * 14, 0, 0) });
    for (let k = 0; k < 6; k++) rig.add(cyl(2.6, 2.6, 10.4, 6).rotateZ(Math.PI / 2), steel, { bone: bwe, m: T(side * 14, 3, -15 + k * 6) });
  }
  rig.add(block(30, 6, 26), yellow, { bone: bwe, m: T(0, 5, 0) });
  rig.add(cyl(11, 12, 3, 12), steel, { bone: bwe, m: T(0, 11, 0) });
  const slew = rig.bone(bwe, 0, 14, 0);
  rig.add(block(22, 10, 30), yellow, { bone: slew, m: T(0, 0, -2) });
  rig.add(block(12, 6, 10), white, { bone: slew, m: T(8, 10, 6) });
  rig.add(box(12.2, 1.6, 7), warm, { bone: slew, m: T(8, 14, 6), layer: 'glow' });
  // A-frame mast and the boom truss.
  const mastTop = new THREE.Vector3(0, 46, -6);
  for (const sx of [-6, 6]) {
    rig.add(strut(), yellow, { m: between(new THREE.Vector3(sx, 6, 6), mastTop, 2.2), bone: slew });
    rig.add(strut(), yellow, { m: between(new THREE.Vector3(sx, 6, -16), mastTop, 2.2), bone: slew });
  }
  // The boom hinges at P0 on the superstructure so it can luff; its parts are authored
  // relative to the hinge.
  const P0 = BOOM_PIVOT.clone().sub(new THREE.Vector3(0, 14, 0));
  const P1 = BOOM_TIP.clone().sub(BOOM_PIVOT);
  const boom = rig.bone(slew, P0.x, P0.y, P0.z);
  const O = new THREE.Vector3();
  const corners = [[-3, -2], [3, -2], [-2, 3], [2, 3]] as const;
  for (const [cx, cy] of corners) {
    rig.add(strut(), yellow, { bone: boom, m: between(new THREE.Vector3(cx, cy, 0), P1.clone().add(new THREE.Vector3(cx * 0.6, cy * 0.6, 0)), 1.2) });
  }
  const SEG = hi ? 8 : 5;
  for (let k = 0; k < SEG; k++) {
    const a = O.clone().lerp(P1, k / SEG);
    const b = O.clone().lerp(P1, (k + 1) / SEG);
    const s = k % 2 ? 1 : -1;
    rig.add(strut(), yellow, { bone: boom, m: between(a.clone().add(new THREE.Vector3(s * 3, -2, 0)), b.clone().add(new THREE.Vector3(-s * 3, 3, 0)), 0.7) });
  }
  // Belt along the boom.
  rig.add(strut(), dark, { bone: boom, m: between(new THREE.Vector3(0, 3.6, 0), P1.clone().setY(P1.y + 2.6), 2.4) });
  // Counterweight boom and its weight, and stay cables from the mast top.
  const CW = new THREE.Vector3(0, 18, -52);
  rig.add(strut(), yellow, { bone: slew, m: between(new THREE.Vector3(0, 4, -14), CW, 3) });
  rig.add(box(14, 9, 10), steel, { bone: slew, m: T(CW.x, CW.y - 4, CW.z) });
  for (const sx of [-1.4, 1.4]) rig.add(strut(), dark, { bone: slew, m: between(mastTop.clone().setX(sx), CW.clone().setX(sx), 0.35) });
  // The boom stays: a unit strut re-aimed from the mast top at the boom tip every frame.
  const stay = rig.bone(slew, mastTop.x, mastTop.y, mastTop.z);
  for (const sx of [-1.4, 1.4]) rig.add(strut(), dark, { bone: stay, m: T(sx, 0, 0, 0, 0, 0, 0.35, 1, 0.35) });
  const boomLen = P1.length();
  const boomRest = Math.atan2(P1.y, P1.z);
  /** Luff (radians, + raises the tip) that puts the wheel over the road centre when bound. */
  const dumpLuff = digger ? Math.max(0, Math.acos(THREE.MathUtils.clamp((digger.reachToCentre() / BWE_SCALE - P0.z - 2) / boomLen, -1, 1)) - boomRest) : 0;
  // The bucket wheel: rim, spokes, toothed buckets. Its axle runs across the boom tip.
  const wheel = rig.bone(boom, P1.x, P1.y, P1.z + 2);
  rig.add(new THREE.TorusGeometry(WHEEL_R, 1.1, 4, 16).rotateY(Math.PI / 2), yellow, { bone: wheel });
  for (let k = 0; k < WHEEL_BUCKETS; k++) {
    const a = (k / WHEEL_BUCKETS) * Math.PI * 2;
    rig.add(box(4.4, 3.2, 3.6), k % 2 ? steel : dark, { bone: wheel, m: T(0, Math.cos(a) * (WHEEL_R + 1.4), Math.sin(a) * (WHEEL_R + 1.4), -a) });
    if (k % 3 === 0) rig.add(box(0.8, WHEEL_R * 2, 0.8), steel, { bone: wheel, m: T(0, 0, 0, -a) });
  }
  rig.add(cyl(2, 2, 6, 8).rotateZ(Math.PI / 2), dark, { bone: wheel, m: T(-3, 0, 0) });

  // --- Conveyors on trestles: excavator → sorting towers → stacker over the stockpile ---
  const towers = [
    new THREE.Vector3(-125, 0, -75),
    new THREE.Vector3(-152, 0, -50),
    new THREE.Vector3(-170, 0, -82),
  ];
  const towerH = [48, 40, 34];
  towers.forEach((p, i) => {
    rig.add(block(20, towerH[i], 18), i === 0 ? rust : steel, { m: T(p.x, 0, p.z) });
    rig.add(block(14, 8, 12), i === 1 ? accent : white, { m: T(p.x, towerH[i], p.z) });
    rig.add(cyl(2, 2.4, 14, 6), dark, { m: T(p.x + 5, towerH[i] + 4, p.z + 4) });
    rig.add(box(20.4, 1.2, 0.4), warm, { m: T(p.x, towerH[i] * 0.7, p.z - 9.1), layer: 'glow' });
    rig.add(strut(), dark, { m: between(new THREE.Vector3(p.x - 8, towerH[i] * 0.5, p.z), new THREE.Vector3(p.x - 18, 4, p.z), 3) });
  });
  const pile = new THREE.Vector3(-215, 0, 65);
  bwe.updateMatrix();
  const beltStart = new THREE.Vector3(0, 11, -25).applyMatrix4(bwe.matrix);
  rig.add(new THREE.ConeGeometry(46, 30, 10).translate(0, 15, 0), ore, { m: T(pile.x, 0, pile.z) });
  rig.add(new THREE.ConeGeometry(30, 18, 9).translate(0, 9, 0), shade(ore, 1.15), { m: T(70, 0, 95) });
  const belts: THREE.Vector3[][] = [
    [beltStart, new THREE.Vector3(-55, 26, -62), new THREE.Vector3(towers[0].x + 8, towerH[0] + 4, towers[0].z)],
    [new THREE.Vector3(towers[1].x, towerH[1] + 6, towers[1].z + 8), new THREE.Vector3(-195, 40, 10), new THREE.Vector3(pile.x, 42, pile.z - 6)],
  ];
  for (const path of belts) {
    for (let k = 0; k < path.length - 1; k++) {
      const a = path[k];
      const b = path[k + 1];
      rig.add(strut(), dark, { m: between(a.clone().setY(a.y - 1.4), b.clone().setY(b.y - 1.4), 3.2) });
      rig.add(strut(), steel, { m: between(a.clone().setY(a.y - 2.8), b.clone().setY(b.y - 2.8), 1.4) });
      const n = Math.max(1, Math.floor(a.distanceTo(b) / 18));
      for (let j = 1; j <= n; j++) {
        const p = a.clone().lerp(b, j / (n + 1));
        rig.add(strut(), steel, { m: between(new THREE.Vector3(p.x, 0, p.z), p.clone().setY(p.y - 2.8), 1.2) });
      }
    }
  }
  // Stacker head over the pile.
  rig.add(block(6, 42, 6), yellow, { m: T(pile.x + 4, 0, pile.z - 14) });
  const ores: { bone: THREE.Bone; belt: number; s0: number }[] = [];
  const beltLen = belts.map((p) => p.reduce((acc, v, k) => (k ? acc + v.distanceTo(p[k - 1]) : 0), 0));
  belts.forEach((_, bi) => {
    for (let k = 0; k < orePerBelt; k++) {
      const bone = rig.bone();
      rig.add(rock(1.6 + rng() * 0.8), shade(ore, 0.9 + rng() * 0.3), { bone, m: T(0, 1.6, 0) });
      ores.push({ bone, belt: bi, s0: (k / orePerBelt) * beltLen[bi] });
    }
  });

  // --- Haul trucks ---
  const trucks: { holder: THREE.Bone; bed: THREE.Bone; phase: number }[] = [];
  for (let i = 0; i < nTrucks; i++) {
    const holder = rig.bone();
    const tint = i % 2 ? yellow : mix(yellow, accent, 0.5);
    for (const sx of [-1, 1]) {
      for (const z of [-5, 1, 6]) rig.add(cyl(2.4, 2.4, 2, 8).rotateZ(Math.PI / 2), dark, { bone: holder, m: T(sx * 4.4, 2.4, z) });
    }
    rig.add(box(7, 2, 16), dark, { bone: holder, m: T(0, 3.4, 0) });
    rig.add(block(8, 4, 4), tint, { bone: holder, m: T(0, 4, 6.4) });
    rig.add(box(5, 1.2, 0.3), warm, { bone: holder, m: T(-1, 7, 8.5), layer: 'glow' });
    const bed = rig.bone(holder, 0, 5, -7);
    rig.add(block(9, 4.6, 13), tint, { bone: bed, m: T(0, 0, 6.2) });
    rig.add(rock(1, 0), ore, { bone: bed, m: T(0, 4.4, 6, 0, 0.4, 0, 4, 1.6, 5.5) });
    trucks.push({ holder, bed, phase: (i / nTrucks) * Math.PI * 2 });
  }
  // Road surface.
  for (let k = 0; k < ROAD_SEGMENTS; k++) {
    const a = (k / ROAD_SEGMENTS) * Math.PI * 2;
    const b = ((k + 1) / ROAD_SEGMENTS) * Math.PI * 2;
    const x0 = ROAD_CX + Math.cos(a) * ROAD_RX;
    const z0 = ROAD_CZ + Math.sin(a) * ROAD_RZ;
    const x1 = ROAD_CX + Math.cos(b) * ROAD_RX;
    const z1 = ROAD_CZ + Math.sin(b) * ROAD_RZ;
    const len = Math.hypot(x1 - x0, z1 - z0) + 2;
    rig.add(box(12, 0.3, len), shade(palette.road, 0.9), { m: T((x0 + x1) / 2, 0.15, (z0 + z1) / 2, 0, Math.atan2(x1 - x0, z1 - z0)) });
  }

  // --- Site cabins, a water tank, and the floodlight masts ---
  for (let k = 0; k < (hi ? 6 : 3); k++) {
    const x = 60 + k * 16;
    rig.add(block(12, 4, 6), k % 2 ? white : accent, { m: T(x, 0, -150 + (k % 2) * 3) });
    rig.add(box(8, 1, 0.3), warm, { m: T(x, 2.4, -153.1 + (k % 2) * 3), layer: 'glow' });
  }
  rig.add(cyl(7, 7, 10, 10), white, { m: T(170, 16, -150) });
  for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]] as const) rig.add(block(1, 16, 1), steel, { m: T(170 + dx, 0, -150 + dz) });
  const masts: THREE.Vector3[] = [];
  const mastSpots = [[-70, -130], [110, 60], [-110, 70], [60, -125]] as const;
  for (let i = 0; i < nMasts; i++) {
    const [x, z] = mastSpots[i];
    const top = new THREE.Vector3(x, 42, z);
    masts.push(top);
    rig.add(cyl(0.9, 1.4, 42, 5), steel, { m: T(x, 0, z) });
    rig.add(box(8, 3, 1.6), dark, { m: T(x, 42, z, 0, Math.atan2(-x, MESA_Z * 0.4 - z)) });
    rig.add(box(7.6, 2.4, 0.4), lampHot, { m: T(x, 42, z, 0, Math.atan2(-x, MESA_Z * 0.4 - z)).multiply(T(0, 0, 0.8)), layer: 'glow' });
    // Beam aimed at the cut face.
    const aim = new THREE.Vector3(0, 0, MESA_Z * 0.4).sub(top).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), aim);
    addBeam(rig, 160, 34, mix(0xfff6e0, palette.sun, 0.3), 0.07 + palette.dusk * 0.08, { m: new THREE.Matrix4().compose(top, q, new THREE.Vector3(1, 1, 1)) });
  }

  const cullRadius = digger ? Math.max(RADIUS, boundReach(digger.frame, 150)) : RADIUS;
  rig.build(kit.group, cullRadius, HEIGHT);

  const dust = brush({ life: 5, size0: 8, size1: 34, c0: mix(palette.rock, palette.sand, 0.6), c1: mix(palette.sand, palette.horizon, 0.5), alpha: 0.6, keep: 0.5, lift: 0.8 });
  const steam = brush({ life: 7, size0: 8, size1: 40, c0: col(0xffffff), c1: mix(0xffffff, palette.horizon, 0.6), alpha: 0.6, keep: 0.6, lift: 3 });
  const roadDust = brush({ life: 3, size0: 5, size1: 20, c0: mix(palette.road, palette.sand, 0.5), c1: mix(palette.sand, palette.horizon, 0.5), alpha: 0.4, keep: 0.5, lift: 0.4 });

  const kLocal = digger ? digger.frame.k : 1;
  const impact = brush({ life: 3, size0: 6 * kLocal, size1: 26 * kLocal, c0: mix(palette.rock, palette.sand, 0.5), c1: mix(palette.sand, palette.horizon, 0.5), alpha: 0.75, keep: 0.4, lift: 1 });
  // Grit pouring off the wheel while it dumps: falls fast, so it streaks down to the road.
  const spill = brush({ life: 3.2, size0: 4 * kLocal, size1: 14 * kLocal, c0: mix(palette.rock, palette.sand, 0.4), c1: mix(palette.sand, palette.horizon, 0.5), alpha: 0.7, keep: 0.9, lift: -25 * kLocal });
  const evt = mulberry32(opts.seed ^ 0x7e);
  const V = new THREE.Vector3();
  const W = new THREE.Vector3();
  let acc = 0;
  let lampI = 0;
  const lamp = (x: number, y: number, z: number, size: number, c: THREE.Color, a: number) => glow.lamp(lampI++, x, y, z, size, c, a);

  function beltPoint(bi: number, s: number, out: THREE.Vector3): THREE.Vector3 {
    const path = belts[bi];
    let d = s;
    for (let k = 0; k < path.length - 1; k++) {
      const seg = path[k].distanceTo(path[k + 1]);
      if (d <= seg) return out.copy(path[k]).lerp(path[k + 1], d / seg);
      d -= seg;
    }
    return out.copy(path[path.length - 1]);
  }

  function update(time: number, dt: number): void {
    lampI = 0;
    let dumping = false;
    if (digger) {
      // Bound: swing out over the road and raise the boom to the dump, on the dropper's clock.
      const p = digger.pose(time);
      slew.rotation.y = digger.slewFor(p.out);
      boom.rotation.x = -dumpLuff * smooth(p.out);
      dumping = p.dumping;
    } else slew.rotation.y = Math.sin(time * SLEW_RATE) * SLEW_ARC;
    // Re-aim the stays from the mast top to the boom tip.
    TIP.copy(P1).applyAxisAngle(X_AXIS, boom.rotation.x).add(P0).sub(mastTop);
    stay.quaternion.setFromUnitVectors(Y_AXIS, TIP.clone().normalize());
    stay.scale.set(1, TIP.length(), 1);
    wheel.rotation.x = -time * WHEEL_SPIN;
    for (const o of ores) {
      const L = beltLen[o.belt];
      beltPoint(o.belt, (o.s0 + time * BELT_SPEED) % L, V);
      o.bone.position.copy(V);
      o.bone.rotation.y = o.s0;
    }
    trucks.forEach((t) => {
      const w = TRUCK_SPEED / ((ROAD_RX + ROAD_RZ) / 2);
      const a = time * w + t.phase;
      const x = ROAD_CX + Math.cos(a) * ROAD_RX;
      const z = ROAD_CZ + Math.sin(a) * ROAD_RZ;
      t.holder.position.set(x, 0, z);
      t.holder.rotation.y = Math.atan2(-Math.sin(a) * ROAD_RX, Math.cos(a) * ROAD_RZ);
      // Tip the bed on the far side of the loop, by the second pile.
      const dump = Math.max(0, Math.cos(a - DUMP_ANGLE));
      t.bed.rotation.x = -Math.pow(dump, 6) * 0.9;
    });
    rig.sync();

    // Lamps: the floodlights, truck headlights and roof beacons, tower warning lights.
    masts.forEach((m) => lamp(m.x, m.y, m.z, 14, lampHot, 0.8 * boost));
    trucks.forEach((t, i) => {
      rig.local(t.holder, 0, 6, 8.8, V);
      lamp(V.x, V.y, V.z, 6, warm, 0.8 * boost);
      rig.local(t.holder, 2.5, 8.4, 6, V);
      lamp(V.x, V.y, V.z, 3, i % 2 ? red : warm, fract(time * 1.6 + i * 0.3) < 0.3 ? boost : 0.2);
    });
    towers.forEach((p, i) => lamp(p.x, towerH[i] + 9, p.z, 5, red, (fract(time * 0.7 + i * 0.3) < 0.5 ? 0.9 : 0.2) * boost));
    rig.local(slew, 0, 48, -6, V);
    lamp(V.x, V.y, V.z, 6, red, fract(time * 0.9) < 0.4 ? boost : 0.2);
    rig.local(wheel, 0, 0, 0, W);
    lamp(W.x, W.y, W.z, 10, warm, 0.6 * boost);
    while (lampI < glow.fixed) lamp(0, -1000, 0, 0, warm, 0);
    if (digger) {
      rig.local(wheel, 0, -WHEEL_R, 0, V);
      digger.updateRocks(time, V, (at) => {
        // Impact: a burst of grit and dust where each rock lands.
        for (let k = 0; k < 8; k++) smoke.emit(impact, at.x, at.y + 1, at.z, (evt() - 0.5) * 30 * kLocal, (4 + evt() * 10) * kLocal, (evt() - 0.5) * 30 * kLocal);
      });
    }

    if (dt > 0) {
      acc += dt;
      while (acc > EMIT_STEP) {
        acc -= EMIT_STEP;
        // Spill from the buckets biting the face, steam off the sorting towers, road dust.
        if (!digger || dumping) {
          rig.local(wheel, (evt() - 0.5) * 10, -WHEEL_R + evt() * 6, (evt() - 0.5) * 10, V);
          smoke.emit(digger ? spill : dust, V.x, V.y, V.z, (evt() - 0.5) * 6, -1, (evt() - 0.5) * 6);
        }
        const i = Math.floor(evt() * towers.length);
        const p = towers[i];
        smoke.emit(steam, p.x + 5, towerH[i] + 18, p.z + 4, 0, 6 + evt() * 3, 0);
        if (evt() < 0.5) {
          const t = trucks[Math.floor(evt() * trucks.length)];
          rig.local(t.holder, (evt() - 0.5) * 8, 1, -9, V);
          smoke.emit(roadDust, V.x, V.y, V.z, 0, 1, 0);
        }
      }
    }
    glow.update(dt);
    smoke.update(dt);
  }

  return { group: kit.group, radius: cullRadius, update, dispose: () => disposeKit(kit) };
}

/** Particle emission tick, seconds. */
const EMIT_STEP = 0.12;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const TIP = new THREE.Vector3();
/** Where on the loop (radians) trucks tip their load. */
const DUMP_ANGLE = 1.2;
