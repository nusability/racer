// The demolition: a condemned block being taken down beside the road. A wrecking-ball crane
// swings at the back, a high-reach excavator gnaws at a gutted shell, floodlights rake the dust
// and amber beacons turn on the hoarding. Bound as a blocker, the facade of the building at the
// roadside goes: charges blink along its foot through the warning, it leans out, then topples
// across the road to land exactly as 'down' begins. The stretch over the opening shatters on
// impact; the rest lies there as the bar until it is cleared in a cloud of dust, and the next
// facade of the condemned row stands up again behind the hoarding.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { blockerStage } from '../../../core/hazards.ts';
import { T, beam, box, mix, prism, shade, vary } from '../b/shapes.ts';
import { lightCone } from '../c/kit.ts';
import { brush, col } from '../a/kit.ts';
import { CONCRETE, CONCRETE_DARK, DARK, GLASS, RigKit, RoadFrame, SAFETY, STEEL, WALLS, WARM_LIGHT, bindHazard, hide, smooth01 } from './kit.ts';

const SALT = 0xde301;
const RADIUS = 100;
/** The condemned row behind: buildings along local X at this z. */
const ROW_Z = RADIUS * 0.15;
const ROW = { high: 6, low: 4 } as const;
/** The facade's hinge stands this far past the road edge on the site's side. */
const HINGE_OUT = 2.5;
/** Facade width along the road, chunks along its height. */
const SLAB_W = 9;
const CHUNKS = 12;
/** A part shorter than this (metres) is not worth a chunk. */
const MIN_PART = 0.5;
/** The gutted shell behind the facade: depth and share of the facade's height. */
const SHELL_D = 16;
const SHELL_H = 0.85;
/** Share of the warning spent on the charges; then the lean and the fall. */
const CHARGE_SHARE = 0.65;
const LEAN = 0.05;
/** Share of the idle time clearing the rubble, then the next facade rises from this share. */
const CLEAR = 0.15;
const REGROW_FROM = 0.3;
const DUST_RATE = 0.05;
const CHARGES = 6;
/** Wrecking ball: swing amplitude (rad) and rate (rad/s), cable length. */
const BALL_SWING = 0.5;
const BALL_RATE = 1.1;
const BALL_CABLE = 30;
/** Floodlight beams by day and at deep dusk. */
const BEAM_DAY = 0.04;
const BEAM_DUSK = 0.22;
/** Old brick, lighter than the city's new towers: the condemned block reads as a different age. */
const BRICK = 0x8a5a48;

export function createDemolition(opts: LandmarkOptions): Landmark {
  const ik = new RigKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('demolition', opts, ['blocker'] as const, {
    def: { type: 'blocker', id: 'free', at: 0, opening: 8, offset: 3, height: 6, warn: 4, up: 5, period: 16, phase: 0 },
    roadZ: -RADIUS * 0.95,
    lateral: -1,
    minX: -10,
    maxX: 10,
  });
  const def = bound.def;
  const dusk = opts.palette.dusk;
  const brick = mix(BRICK, opts.palette.rock, 0.15);

  // --- The condemned row: dark, boarded, half its windows gone ---
  const n = ik.q(ROW.high, ROW.low);
  for (let i = 0; i < n; i++) {
    const x = -RADIUS * 0.8 + ((i + 0.5) * RADIUS * 1.6) / n;
    const w = (RADIUS * 1.6) / n - 2;
    const hgt = 18 + rng() * 22;
    const c = vary(rng, i % 2 ? brick : WALLS[0], 0.08);
    kit.solid.add(box(w, hgt, 22), c, T(x, 0, ROW_Z));
    for (let f = 1; f * 4 < hgt - 2; f++) {
      for (let b = 0; b < 4; b++) {
        const lit = rng() < 0.06;
        const wx = x - w / 2 + ((b + 0.5) * w) / 4;
        (lit ? kit.lights : kit.solid).add(box(w / 6, 2, 0.3), lit ? shade(WARM_LIGHT, 0.6) : rng() < 0.5 ? DARK : mix(0x8a6a40, DARK, 0.4), T(wx, f * 4 - 0.5, ROW_Z - 11.1));
      }
    }
  }
  // Hoarding with beacons, rubble heaps.
  for (let i = 0; i < 14; i++) kit.solid.add(box((RADIUS * 1.7) / 14, 2.8, 0.3), i % 2 ? SAFETY : DARK, T(-RADIUS * 0.85 + ((i + 0.5) * RADIUS * 1.7) / 14, 0, -RADIUS * 0.45));
  for (let i = 0; i < 4; i++) kit.lamp(new THREE.OctahedronGeometry(0.5), [-RADIUS * 0.7 + i * RADIUS * 0.45, 3.4, -RADIUS * 0.45], 0xffa020, 3, undefined, { depth: 0.95, freq: 5, phase: i * 1.7, sharp: 6 });
  for (let i = 0; i < ik.q(10, 5); i++) {
    const s = 3 + rng() * 6;
    kit.solid.add(new THREE.IcosahedronGeometry(s, 0), vary(rng, CONCRETE_DARK, 0.15), T(-RADIUS * 0.6 + rng() * RADIUS * 1.2, 0, -RADIUS * 0.2 + rng() * 20, rng() * 3, 0, 0, [1.3, 0.5, 1]));
  }
  // The wrecking-ball crane: a crawler with a lattice boom, the ball swinging on its cable.
  const cx = -RADIUS * 0.45;
  const cz = -RADIUS * 0.05;
  kit.solid.add(box(14, 4, 10), SAFETY, T(cx, 0, cz));
  kit.solid.add(box(5, 4, 5), DARK, T(cx + 3, 4, cz));
  const tip: [number, number, number] = [cx + 22, 46, cz - 6];
  kit.solid.add(beam([cx, 6, cz], tip, 0.8), SAFETY);
  kit.solid.add(beam([cx - 6, 4, cz], tip, 0.12), DARK);
  const swing = { hub: tip, axisA: [0, 0, 1] as const, swingA: BALL_SWING, freq: BALL_RATE, phase: 0 };
  kit.moving.add(box(0.2, BALL_CABLE, 0.2), DARK, T(tip[0], tip[1] - BALL_CABLE, tip[2]), swing);
  kit.moving.add(new THREE.IcosahedronGeometry(2.4, 1), DARK, T(tip[0], tip[1] - BALL_CABLE - 2, tip[2]), swing);
  // The high-reach excavator at a gutted shell.
  const ex = RADIUS * 0.45;
  kit.solid.add(box(10, 3.5, 7), SAFETY, T(ex, 0, -RADIUS * 0.1));
  kit.solid.add(beam([ex, 4, -RADIUS * 0.1], [ex - 6, 26, -RADIUS * 0.1 + 6], 0.7), SAFETY);
  kit.solid.add(beam([ex - 6, 26, -RADIUS * 0.1 + 6], [ex - 9, 20, -RADIUS * 0.1 + 13], 0.5), SAFETY);
  kit.solid.add(box(2.4, 2, 2), DARK, T(ex - 9, 18, -RADIUS * 0.1 + 13));
  // Floodlight masts, beams down onto the site.
  for (const fx of [-RADIUS * 0.75, RADIUS * 0.75]) {
    kit.solid.add(prism(0.4, 0.5, 24, 6), STEEL, T(fx, 0, -RADIUS * 0.35));
    kit.lamp(box(3, 1.4, 0.6), [fx, 24.5, -RADIUS * 0.35], 0xf4f8ff, 5);
    lightCone(kit.beams, T(fx, 24, -RADIUS * 0.35, fx > 0 ? -0.5 : 0.5, Math.PI - 0.7, 0), 34, 0.8, 9, 5, shade(0xf4f8ff, BEAM_DAY + (BEAM_DUSK - BEAM_DAY) * dusk));
  }
  kit.solid.add(box(RADIUS * 1.8, 0.3, RADIUS * 0.9), CONCRETE_DARK, T(0, 0, -RADIUS * 0.1));

  // --- The facade: chunks on bones, a window strip on each; the gutted shell behind; charges ---
  const chunks: THREE.Bone[] = [];
  for (let i = 0; i < CHUNKS; i++) {
    const bone = rig.bone();
    // Unit block behind the hinge plane (−X), rising (+Y) and centred across its width (Z).
    rig.add(box(1, 1, 1).translate(-0.5, -1, 0), i % 4 === 0 ? shade(brick, 0.9) : brick, { bone });
    for (const z of [-0.25, 0.25]) rig.add(box(0.04, 0.45, 0.3).translate(0.02, -0.55, z), rng() < 0.3 ? mix(GLASS, WARM_LIGHT, 0.15) : DARK, { bone });
    chunks.push(bone);
  }
  const shell = rig.bone();
  rig.add(box(1, 1, 1).translate(-0.5, 0.5, 0), shade(CONCRETE, 0.7), { bone: shell });
  for (let f = 1; f < 6; f++) rig.add(box(1.02, 0.03, 1.02).translate(-0.5, f / 6, 0), DARK, { bone: shell });
  rig.add(box(0.02, 0.98, 0.96).translate(0.005, 0.5, 0), mix(DARK, WARM_LIGHT, 0.05), { bone: shell });
  const charges = rig.bone();
  for (let c = 0; c < CHARGES; c++) rig.add(box(0.4, 0.4, 0.4), 0xffb040, { bone: charges, layer: 'glow', m: T(0.3, 0.6 + (c % 2) * 2, -0.5 + (c + 0.5) / CHARGES) });

  const cloud = ik.cloud(ik.q(480, 240), 0, false, 0.75);
  cloud.setFogScale(0.6);
  const dust = brush({ life: 3.2, size0: 5, size1: 24, c0: col(0xa8a49c), c1: mix(0xa8a49c, opts.palette.horizon, 0.5), alpha: 0.8, keep: 0.4, lift: 0.5 });
  const debris = brush({ life: 1.4, size0: 1.6, size1: 0.8, c0: col(0x6a6660), c1: col(0x4a4844), alpha: 1, keep: 0.85, lift: -14 });
  const flash = brush({ life: 0.35, size0: 6, size1: 12, c0: col(0xffe0a0), c1: col(0xff8020), alpha: 1, keep: 0.5, lift: 2 });
  const sparks = ik.cloud(ik.q(80, 40), 0, true, 1.8);

  const h = bound.hazard;
  const road = new RoadFrame(bound.binding);
  const hinge = new THREE.Vector3();
  const fall = new THREE.Vector3();
  const P = new THREE.Vector3();
  let wasDown = false;
  let wasCharged = false;
  let dustAcc = 0;
  let fallen = false;
  const pose = { theta: 0, sink: 0, length: 0, yaw: 0 };

  /** Poses `count` chunks (from index `first`) over [a, b] metres from the hinge; returns the next index. */
  function layPart(a: number, b: number, count: number, first: number, opening: boolean): number {
    const k = road.unit;
    const thick = def.height;
    for (let j = 0; j < count; j++) {
      const bone = chunks[first + j];
      const top = a + ((b - a) * (j + 1)) / count;
      const len = (b - a) / count;
      if (len <= 0 || pose.sink >= 1 || (opening && fallen)) {
        hide(bone);
        continue;
      }
      bone.position.copy(hinge).addScaledVector(fall, top * Math.sin(pose.theta) * k);
      bone.position.y = hinge.y + (top * Math.cos(pose.theta) - pose.sink * (fallen ? thick : pose.length)) * k;
      bone.rotation.order = 'YXZ';
      bone.rotation.set(0, pose.yaw, -pose.theta);
      bone.scale.set(thick * k, len * k, SLAB_W * k);
    }
    return first + count;
  }

  function update(time: number, dt: number): void {
    road.at(h.s0);
    const k = road.unit;
    const home = road.origin.dot(road.across) > 0 ? -1 : 1;
    const edge = home > 0 ? h.maxX : h.minX;
    const hingeX = edge + home * HINGE_OUT;
    road.point(hingeX, 0, hinge);
    fall.copy(road.across).multiplyScalar(-home);
    const farX = home > 0 ? h.minX : h.maxX;
    const length = Math.abs(hingeX - farX) + 1;
    const openA = def.offset - def.opening / 2;
    const openB = def.offset + def.opening / 2;

    const st = blockerStage(def, time);
    let theta = 0;
    let sink = 0;
    let charge = 0;
    if (st.stage === 'warn') {
      if (st.progress < CHARGE_SHARE) {
        charge = st.progress / CHARGE_SHARE;
        theta = LEAN * smooth01((st.progress - CHARGE_SHARE * 0.8) / (CHARGE_SHARE * 0.2));
      } else {
        const u = (st.progress - CHARGE_SHARE) / (1 - CHARGE_SHARE);
        theta = LEAN + (Math.PI / 2 - LEAN) * u * u;
      }
    } else if (st.stage === 'down') {
      theta = Math.PI / 2;
    } else if (st.progress < CLEAR) {
      theta = Math.PI / 2;
      sink = smooth01(st.progress / CLEAR);
    } else {
      sink = 1 - smooth01((st.progress - REGROW_FROM) / (1 - REGROW_FROM));
    }
    fallen = theta >= Math.PI / 2 - 1e-6;
    pose.theta = theta;
    pose.sink = sink;
    pose.length = length;
    pose.yaw = RoadFrame.yaw(fall);
    // Cut where the opening's edges fall, so the piece over it shatters and the rest covers the
    // blocked spans exactly.
    const nearEdge = home > 0 ? Math.max(openA, openB) : Math.min(openA, openB);
    const farEdge = home > 0 ? Math.min(openA, openB) : Math.max(openA, openB);
    const dNear = THREE.MathUtils.clamp(Math.abs(hingeX - nearEdge), 0, length);
    const dFar = THREE.MathUtils.clamp(Math.abs(hingeX - farEdge), dNear, length);
    const nFar = length - dFar > MIN_PART ? Math.max(1, Math.round(((length - dFar) / length) * (CHUNKS - 1))) : 0;
    let ci = layPart(0, dNear, CHUNKS - 1 - nFar, 0, false);
    ci = layPart(dNear, dFar, 1, ci, true);
    layPart(dFar, length, nFar, ci, false);
    // The shell the facade stood on stays: gutted floors open to the road once it is down.
    shell.position.copy(hinge).addScaledVector(fall, -def.height * k);
    shell.rotation.set(0, pose.yaw, 0);
    shell.scale.set(SHELL_D * k, length * SHELL_H * k, SLAB_W * k);
    // Charges blink faster as the fall nears.
    if (charge > 0 && Math.sin(time * (6 + 30 * charge)) > 0) {
      charges.position.copy(hinge);
      charges.rotation.set(0, pose.yaw, 0);
      charges.scale.set(k, k, SLAB_W * k);
    } else hide(charges);
    rig.sync();

    if (dt <= 0) return;
    const charged = st.stage === 'warn' && st.progress >= CHARGE_SHARE;
    if (charged && !wasCharged) {
      // The charges fire: flashes along the foot and a skirt of dust.
      for (let i = 0; i < 16; i++) {
        road.point(hingeX, 1 + rng() * 3, P).addScaledVector(road.along, (rng() - 0.5) * SLAB_W * k);
        sparks.emit(flash, P.x, P.y, P.z, (rng() - 0.5) * 6, 2 + rng() * 4, (rng() - 0.5) * 6);
        cloud.emit(dust, P.x, P.y, P.z, (rng() - 0.5) * 10, 2 + rng() * 3, (rng() - 0.5) * 10);
      }
    }
    wasCharged = charged;
    if (st.stage === 'down' && !wasDown) {
      for (let i = 0; i < 44; i++) {
        road.point(hingeX - home * rng() * length, 1, P).addScaledVector(road.along, (rng() - 0.5) * SLAB_W * k);
        cloud.emit(dust, P.x, P.y, P.z, (rng() - 0.5) * 16, 3 + rng() * 9, (rng() - 0.5) * 16);
      }
      for (let i = 0; i < 26; i++) {
        road.point(def.offset + (rng() - 0.5) * def.opening, 2, P);
        cloud.emit(debris, P.x, P.y, P.z, (rng() - 0.5) * 16, 5 + rng() * 9, (rng() - 0.5) * 16);
      }
    }
    wasDown = st.stage === 'down';
    dustAcc += dt;
    while (dustAcc > DUST_RATE) {
      dustAcc -= DUST_RATE;
      if (st.stage === 'idle' && st.progress < CLEAR) {
        road.point(hingeX - home * rng() * length, 1, P);
        cloud.emit(dust, P.x, P.y, P.z, (rng() - 0.5) * 6, 2 + rng() * 3, (rng() - 0.5) * 6);
      }
    }
  }

  return ik.finish(RADIUS, RADIUS * 1.6, 60, update);
}
