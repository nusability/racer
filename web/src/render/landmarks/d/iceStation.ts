// The polar station: orange-and-white domes linked by tube corridors, a radome and a turning
// radar dish, lattice masts blinking red, a drilling derrick with its head turning and a flare,
// snowmobiles lined up by the hangar, and a twin-rotor supply lifter on its pad. Bound as a gust,
// the lifter takes off before each on-window, hovers low over the road while its rotor wash
// blasts sheets of snow across it (toward the gust's push), and flies home when it ends.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { gustStrength } from '../../../core/hazards.ts';
import { Frame, T, beam, box, dome, mix, prism, shade, vary } from '../b/shapes.ts';
import type { Motion, V3 } from '../b/motion.ts';
import { lightCone } from '../c/kit.ts';
import { addBeam, brush, col } from '../a/kit.ts';
import { DARK, ICE, INDUSTRIAL, IceKit, RED_LIGHT, RoadFrame, SAFETY, STEEL, WARM_LIGHT, bindHazard, smooth01 } from './kit.ts';

const SALT = 0x57a71;
const RADIUS = 170;
const DOMES: readonly (readonly [number, number, number])[] = [[-40, 30, 22], [10, 55, 28], [55, 20, 18], [-85, 70, 16]];
const PAD: V3 = [80, 0, -70];
const RADOME = { x: 28, z: 75, r: 17, tower: 34 } as const;
const PAD_R = 22;
const RADAR: V3 = [-30, 0, -40];
const DERRICK: V3 = [-110, 0, -10];
const DERRICK_H = 52;
const MASTS: readonly (readonly [number, number, number])[] = [[30, 110, 60], [-130, 60, 44], [120, 80, 50]];
/** Lifter hover height over the road, metres, and its transit time to and from the pad. */
const HOVER_H = 20;
const TRANSIT = 5;
const ROTOR_SPIN = 22;
const IDLE_SPIN = 3;
const WASH = { high: 380, low: 190 } as const;
const WASH_RATE = 0.016;
const WASH_SPEED = 28;
const VENT_RATE = 0.12;

/** Seconds into the gust's cycle. */
function cycle(time: number, period: number, phase: number): number {
  const t = (time + phase) % period;
  return t < 0 ? t + period : t;
}

export function createIceStation(opts: LandmarkOptions): Landmark {
  const ik = new IceKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('iceStation', opts, ['gust'] as const, {
    def: { type: 'gust', id: 'free', from: 0, to: 0, strength: 8, on: 6, period: 22, phase: 0 },
    roadZ: -RADIUS * 0.75,
    lateral: -1,
    minX: -10,
    maxX: 10,
    span: 120,
  });
  const def = bound.def;
  const dusk = opts.palette.dusk;
  const white = mix(0xf4f4f0, ik.snow, 0.2);
  const orange = col(SAFETY);
  const accent = opts.palette.accent;

  // --- Domes and tube corridors ---
  for (const [x, z, r] of DOMES) {
    kit.solid.add(prism(r * 1.02, r * 1.02, 3, 14), STEEL, T(x, 0, z));
    kit.solid.add(dome(r, 12, 5, 0.75), rng() < 0.5 ? orange : white, T(x, 3, z));
    // Panel ribs and a ring of lit windows round the base.
    for (let k = 0; k < 6; k++) kit.solid.add(box(0.5, r * 0.75, 0.5), shade(white, 0.85), T(x, 3, z, (k / 6) * Math.PI, 0.6, 0).multiply(T(0, 0, r * 0.62)));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      kit.lamp(box(2.2, 1.1, 0.3), [x + Math.cos(a) * (r * 1.02 + 0.1), 1.8, z + Math.sin(a) * (r * 1.02 + 0.1)], WARM_LIGHT, k % 2 ? 0 : 3 * dusk, undefined, { depth: 0.2, freq: 0.3, phase: k });
    }
  }
  for (let i = 0; i + 1 < DOMES.length; i++) {
    const [ax, az] = DOMES[i];
    const [bx, bz] = DOMES[i + 1];
    kit.solid.add(beam([ax, 3, az], [bx, 3, bz], 2.4, 8), shade(white, 0.92));
  }
  // Hangar, fuel tanks and a row of snowmobiles in festive colours.
  kit.solid.add(box(40, 12, 24), shade(white, 0.9), T(40, 0, -25));
  kit.solid.add(new THREE.CylinderGeometry(12, 12, 40, 8).rotateZ(Math.PI / 2).scale(1, 0.35, 1).translate(0, 12, 0), STEEL, T(40, 0, -25));
  kit.lamp(box(18, 9, 0.3), [40, 0.2, -37.2], mix(WARM_LIGHT, 0xffffff, 0.3), 0);
  for (let k = 0; k < 3; k++) kit.solid.add(prism(4, 4, 9, 10), k ? white : orange, T(-60 + k * 10, 0, -50));
  for (let k = 0; k < ik.q(7, 4); k++) {
    const f = new Frame(10 + k * 5.5, 0, -45, 0.15);
    const c = vary(rng, INDUSTRIAL[k % INDUSTRIAL.length], 0.05);
    kit.solid.add(box(1.8, 1, 3.6), c, f.m(0, 0.4, 0));
    kit.solid.add(box(1.4, 0.7, 1.4), DARK, f.m(0, 1.3, 0.4));
    kit.solid.add(box(2.4, 0.2, 1), DARK, f.m(0, 0.1, -1.6));
    kit.solid.add(box(0.15, 0.15, 3.8), DARK, f.m(-0.9, 0.05, 0.2));
    kit.solid.add(box(0.15, 0.15, 3.8), DARK, f.m(0.9, 0.05, 0.2));
  }

  // --- Radar: a radome and an open dish turning on its pedestal ---
  kit.solid.add(prism(5, 6, 14, 8), white, T(RADAR[0], 0, RADAR[2]));
  const spin: Motion = { hub: [RADAR[0], 0, RADAR[2]], axisA: [0, 1, 0], spinA: 0.9 };
  kit.moving.add(new THREE.SphereGeometry(9, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45).rotateX(-Math.PI / 2).scale(1, 1, 0.45), white, T(RADAR[0], 20, RADAR[2] + 2), spin);
  kit.moving.add(box(1, 1, 7), STEEL, T(RADAR[0], 20, RADAR[2] + 3.5), spin);
  kit.moving.add(box(0.6, 0.6, 3), DARK, T(RADAR[0], 20, RADAR[2] + 7), spin);
  // The tracking radome: a white ball on a tower, the station's mark on the skyline.
  kit.solid.add(new THREE.IcosahedronGeometry(RADOME.r, 1), white, T(RADOME.x, RADOME.tower + RADOME.r * 0.8, RADOME.z));
  kit.solid.add(prism(7, 9, RADOME.tower, 8), shade(white, 0.85), T(RADOME.x, 0, RADOME.z));
  kit.lamp(new THREE.OctahedronGeometry(1), [RADOME.x, RADOME.tower + RADOME.r * 1.8 + 1, RADOME.z], RED_LIGHT, 9, undefined, { depth: 0.95, freq: 2, phase: 1, sharp: 7 });

  // --- Lattice masts with blinking red lights ---
  for (const [x, z, h] of MASTS) {
    const legs: V3[] = [[x - 2, 0, z - 2], [x + 2, 0, z - 2], [x, 0, z + 2]];
    for (const l of legs) kit.solid.add(beam(l, [x, h, z], 0.35, 4), shade(white, 0.85));
    for (let y = 6; y < h - 4; y += 7) {
      const k = 1 - y / h;
      kit.solid.add(beam([x - 2 * k, y, z - 2 * k], [x + 2 * k, y, z - 2 * k], 0.15, 3), orange);
    }
    for (let y = h * 0.5; y <= h; y += h * 0.5) kit.lamp(new THREE.OctahedronGeometry(0.8), [x, y + 0.6, z], RED_LIGHT, 7, undefined, { depth: 0.95, freq: 2.4, phase: x * 0.1 + y * 0.03, sharp: 7 });
  }

  // --- The drilling derrick: lattice tower, turning drill head, gas flare ---
  const [dx, , dz] = DERRICK;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) kit.solid.add(beam([dx + sx * 7, 0, dz + sz * 7], [dx + sx * 1.5, DERRICK_H, dz + sz * 1.5], 0.45, 4), orange);
  for (let y = 8; y < DERRICK_H; y += 8) {
    const w = 7 - (5.5 * y) / DERRICK_H;
    kit.solid.add(box(w * 2, 0.4, 0.4), orange, T(dx, y, dz - w));
    kit.solid.add(box(w * 2, 0.4, 0.4), orange, T(dx, y, dz + w));
    kit.solid.add(box(0.4, 0.4, w * 2), orange, T(dx - w, y, dz));
    kit.solid.add(box(0.4, 0.4, w * 2), orange, T(dx + w, y, dz));
  }
  kit.solid.add(box(18, 5, 18), STEEL, T(dx, 0, dz));
  kit.moving.add(prism(1.2, 1.2, 14, 6), DARK, T(dx, 5, dz), { hub: [dx, 0, dz], axisA: [0, 1, 0], spinA: 3 });
  kit.moving.add(box(5, 1.5, 1.5), 0xffd020, T(dx, 16, dz), { hub: [dx, 0, dz], axisA: [0, 1, 0], spinA: 3, hop: 2, freq: 0.5 });
  kit.solid.add(beam([dx + 9, 0, dz + 9], [dx + 20, 30, dz + 20], 0.5, 4), STEEL);
  kit.lamp(new THREE.ConeGeometry(1.6, 6, 6).translate(0, 3, 0), [dx + 20, 30, dz + 20], 0xffa030, 10, { pivot: [dx + 20, 30, dz + 20], axisB: [1, 0, 0], swingB: 0.15, freq: 4 }, { depth: 0.5, freq: 9, phase: 0, sharp: 2 });
  kit.lamp(new THREE.OctahedronGeometry(0.8), [dx, DERRICK_H + 1, dz], RED_LIGHT, 6, undefined, { depth: 0.95, freq: 1.7, phase: 0.5, sharp: 7 });

  // --- The pad: a lit ring with an H, flood towers for the night ---
  kit.solid.add(prism(PAD_R, PAD_R + 1, 0.6, 20), STEEL, T(PAD[0], 0, PAD[2]));
  kit.solid.add(box(2, 0.1, 12), 0xffd020, T(PAD[0] - 4, 0.62, PAD[2]));
  kit.solid.add(box(2, 0.1, 12), 0xffd020, T(PAD[0] + 4, 0.62, PAD[2]));
  kit.solid.add(box(8, 0.1, 2), 0xffd020, T(PAD[0], 0.62, PAD[2]));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    kit.lamp(new THREE.OctahedronGeometry(0.5), [PAD[0] + Math.cos(a) * (PAD_R - 1), 0.9, PAD[2] + Math.sin(a) * (PAD_R - 1)], 0x40ff80, 2.5, undefined, { depth: 0.7, freq: 3, phase: -k * 0.5, sharp: 3 });
  }
  for (const [fx, fz] of [[-20, -20], [60, -60], [-90, 30]]) {
    kit.solid.add(prism(0.5, 0.6, 18, 5), STEEL, T(fx, 0, fz));
    kit.lamp(box(3, 1.5, 1.5), [fx, 18, fz], 0xfff4dc, 6);
    lightCone(kit.beams, T(fx, 18, fz, 0, Math.PI * 0.75, 0), 26, 1, 14, 4, mix(0xfff0d0, 0x000000, 0.97 - 0.72 * dusk));
  }
  // Fuel drums and snowdrifts scattered round the camp.
  for (let k = 0; k < ik.q(18, 9); k++) {
    const a = rng() * Math.PI * 2;
    const r = RADIUS * (0.4 + rng() * 0.5);
    kit.solid.add(new THREE.SphereGeometry(1, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), vary(rng, ik.snow, 0.03), T(Math.cos(a) * r, 0, Math.sin(a) * r, rng() * 3, 0, 0, [10 + rng() * 14, 2 + rng() * 3, 5 + rng() * 6]));
  }

  // --- The supply lifter: body, two rotors, a searchlight; flown from the gust ---
  const craft = rig.bone();
  const rotors = [rig.bone(craft, 9, 5.2, 0), rig.bone(craft, -9, 6.2, 0)];
  rig.add(box(22, 6, 7).translate(0, -3, 0), mix(INDUSTRIAL[0], accent, 0.2), { bone: craft, m: T(0, 3, 0) });
  rig.add(box(10, 2, 7.2), white, { bone: craft, m: T(4, 3.2, 0) });
  rig.add(box(3, 2.2, 6), DARK, { bone: craft, m: T(10.5, 1.5, 0) });
  rig.add(box(3, 2.5, 2.5), STEEL, { bone: craft, m: T(9, 4, 0) });
  rig.add(box(3, 3.5, 2.5), STEEL, { bone: craft, m: T(-9, 4, 0) });
  for (const z of [-3, 3]) rig.add(box(14, 0.4, 0.4), DARK, { bone: craft, m: T(0, -1.4, z) });
  rig.add(box(8, 3, 5), orange, { bone: craft, m: T(0, -5, 0) });
  for (const r of rotors) {
    for (let k = 0; k < 3; k++) rig.add(box(16, 0.2, 1), DARK, { bone: r, m: T(0, 0, 0, (k / 3) * Math.PI) });
    rig.add(new THREE.CircleGeometry(8, 16).rotateX(-Math.PI / 2), mix(STEEL, ICE, 0.5), { bone: r, layer: 'beam', alpha: 0.18 });
  }
  rig.add(new THREE.OctahedronGeometry(0.5), RED_LIGHT, { bone: craft, layer: 'glow', m: T(-12, 3, 0) });
  rig.add(new THREE.OctahedronGeometry(0.5), 0x40ff80, { bone: craft, layer: 'glow', m: T(10, 3, 3.6) });
  addBeam(rig, 30, 6, 0xfff2d0, 0.02 + 0.25 * dusk, { bone: craft, m: T(11, 0, 0, 0, 0, 0.5) });

  const snow = ik.cloud(ik.q(WASH.high, WASH.low), 0, false, 0.8);
  const sheet = brush({ life: 1.6, size0: 4, size1: 16, c0: mix(ik.snow, 0xffffff, 0.5), c1: mix(ik.snow, opts.palette.horizon, 0.5), alpha: 0.7, keep: 0.75, lift: -1 });
  const steam = brush({ life: 4, size0: 3, size1: 14, c0: col(0xffffff), c1: mix(0xffffff, opts.palette.horizon, 0.6), alpha: 0.55, keep: 0.6, lift: 2 });

  const h = bound.hazard;
  const road = new RoadFrame(bound.binding);
  const hover = new THREE.Vector3();
  const pad = new THREE.Vector3(PAD[0], 3, PAD[2]);
  const P = new THREE.Vector3();
  const V = new THREE.Vector3();
  const travel = Math.min(TRANSIT, (def.period - def.on) / 2);
  let washAcc = 0;
  let ventAcc = 0;

  function update(time: number, dt: number): void {
    const sMid = (h.s0 + h.s1) / 2;
    road.at(sMid);
    road.point(0, HOVER_H, hover);
    const ct = cycle(time, def.period, def.phase);
    // Out over the road just before the on-window, back to the pad straight after it.
    let u: number;
    if (ct < def.on) u = 1;
    else if (ct < def.on + travel) u = 1 - (ct - def.on) / travel;
    else if (ct > def.period - travel) u = (ct - (def.period - travel)) / travel;
    else u = 0;
    const e = smooth01(u);
    craft.position.lerpVectors(pad, hover, e);
    craft.position.y += Math.sin(Math.PI * e) * 18 + (u > 0 ? Math.sin(time * 1.3) * 0.6 : 0);
    const push = gustStrength(def, time) / def.strength;
    const sideways = Math.sign(def.strength);
    // Nose toward the road on the way out, then bank against its own wash while hovering.
    V.subVectors(hover, pad).setY(0);
    craft.rotation.order = 'YXZ';
    craft.rotation.set(sideways * -0.12 * push, RoadFrame.yaw(V), (u > 0 && u < 1 ? -0.12 : 0) + Math.sin(time * 0.9) * 0.02);
    craft.scale.setScalar(road.unit);
    const spin = u > 0 ? ROTOR_SPIN : IDLE_SPIN;
    rotors[0].rotation.y = time * spin;
    rotors[1].rotation.y = -time * spin;
    rig.sync();

    if (dt <= 0) return;
    // The wash: sheets of snow skating across the whole gust span toward its push.
    washAcc += dt * Math.abs(push);
    while (washAcc > WASH_RATE) {
      washAcc -= WASH_RATE;
      road.at(h.s0 + (h.s1 - h.s0) * rng());
      road.point(h.minX + (h.maxX - h.minX) * rng() - sideways * 10, 0.5 + rng() * 2, P);
      V.copy(road.across).multiplyScalar(sideways * WASH_SPEED * (0.7 + rng() * 0.6) * road.unit);
      snow.emit(sheet, P.x, P.y, P.z, V.x + (rng() - 0.5) * 4, 2 + rng() * 4, V.z + (rng() - 0.5) * 4);
    }
    // Heater vents steaming on the domes, and the derrick's exhaust.
    ventAcc += dt;
    while (ventAcc > VENT_RATE) {
      ventAcc -= VENT_RATE;
      const [x, z, r] = DOMES[Math.floor(rng() * DOMES.length)];
      snow.emit(steam, x, r * 0.75 + 3, z, (rng() - 0.5) * 2, 3, (rng() - 0.5) * 2);
      snow.emit(steam, dx + 6, 6, dz, 1, 4, 0);
    }
  }

  return ik.finish(RADIUS, RADIUS * 2, 80, update);
}
