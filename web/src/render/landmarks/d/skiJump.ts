// The ski jump: a giant hill arena. A concrete start tower carries the in-run high over the
// road on a lit truss bridge, so racers flash beneath it; on the far side the take-off table
// throws jumpers into long flights down a landing hill lined with flags and crowds, into an
// outrun ringed by grandstands, floodlight masts and a big scoreboard. Snow cannons mist the hill.
//
// Placement: the road is meant to pass under the in-run at local z = 0 along X (straddle, with
// distance = −(RADIUS + road half-width + run-off)); the span |z| ≤ CLEAR_HALF is kept clear to
// CLEAR_HEIGHT above the ground. Placed beside the road instead, it is simply an arena.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { T, beam, box, mix, prism, quad, shade } from '../b/shapes.ts';
import type { V3 } from '../b/motion.ts';
import { lightCone } from '../c/kit.ts';
import { DARK, ICE_DEEP, IceKit, RED_LIGHT, STEEL } from './kit.ts';

const SALT = 0x5c1a7;
const RADIUS = 280;
/** The in-run: from the start gate (z, y) down to the take-off lip (z, y). */
const GATE: readonly [number, number] = [210, 150];
const LIP: readonly [number, number] = [-85, 38];
const INRUN_CURVE = 1.7;
const INRUN_W = 9;
const INRUN_SEGS = 18;
/** Clear span under the in-run where the road runs, and its guaranteed clearance. */
export const CLEAR_HALF = 42;
export const CLEAR_HEIGHT = 34;
const PYLONS: readonly number[] = [-62, 55, 110, 160];
/** Landing hill: knoll just below the lip down to the outrun floor. */
const HILL_TOP: readonly [number, number] = [-92, 31];
const HILL_FOOT = -235;
const HILL_W = 36;
const HILL_SEGS = 16;
const OUTRUN_Z = -265;
const STANDS = { arc: 1.9, r: 70, rows: 6 } as const;
const JUMPERS = 3;
const JUMP_CYCLE = 12;
const FLIGHT = { z: -180, t: 3.2 } as const;
const T_INRUN = 4.2;
const T_OUTRUN = 2.4;
const JUMPER_SIZE = 1.6;
/** Floodlights lean in over the arena by this much from straight down. */
const FLOOD_TILT = 2.3;

/** In-run height at z (concave: steep at the gate, flattening into the take-off). */
function inrunY(z: number): number {
  const u = (z - LIP[0]) / (GATE[0] - LIP[0]);
  return LIP[1] + (GATE[1] - LIP[1]) * Math.max(0, u) ** INRUN_CURVE;
}
/** Landing-hill height at z: a smooth fall from the knoll to the outrun floor. */
function hillY(z: number): number {
  const u = Math.min(1, Math.max(0, (HILL_TOP[0] - z) / (HILL_TOP[0] - HILL_FOOT)));
  return HILL_TOP[1] * (1 - u * u * (3 - 2 * u));
}

/** A box spanning a → b (its long axis), `w` wide and `t` thick, top face up. */
function slab(a: V3, b: V3, w: number, t: number): THREE.BufferGeometry {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const len = from.distanceTo(to);
  const g = new THREE.BoxGeometry(w, t, len).translate(0, -t / 2, len / 2);
  const m = new THREE.Matrix4().lookAt(to, from, new THREE.Vector3(0, 1, 0)).setPosition(from);
  return g.applyMatrix4(m);
}

export function createSkiJump(opts: LandmarkOptions): Landmark {
  const ik = new IceKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const dusk = opts.palette.dusk;
  const snow = ik.snow;
  const concrete = mix(0xb8bcc4, opts.palette.rock, 0.25);
  const accent = opts.palette.accent;

  // --- Tower and in-run bridge ---
  kit.solid.add(prism(11, 14, GATE[1], 6), concrete, T(0, 0, GATE[0] + 8));
  kit.solid.add(box(18, 10, 18), shade(concrete, 1.1), T(0, GATE[1], GATE[0] + 6));
  kit.solid.add(box(18.4, 3, 18.4), DARK, T(0, GATE[1] + 4, GATE[0] + 6));
  kit.solid.add(new THREE.ConeGeometry(14, 8, 4).translate(0, 4, 0), accent, T(0, GATE[1] + 10, GATE[0] + 6, Math.PI / 4));
  kit.lamp(box(18.6, 1.5, 18.6), [0, GATE[1] + 5, GATE[0] + 6], mix(0xfff0c0, accent, 0.3), 0);
  kit.lamp(new THREE.OctahedronGeometry(1.2), [0, GATE[1] + 19.5, GATE[0] + 6], RED_LIGHT, 10, undefined, { depth: 0.95, freq: 1.8, phase: 0, sharp: 6 });
  kit.solid.add(prism(0.3, 0.3, 9, 4), DARK, T(0, GATE[1] + 10, GATE[0] + 6));
  let prev: V3 | undefined;
  for (let i = 0; i <= INRUN_SEGS; i++) {
    const z = GATE[0] + ((LIP[0] - GATE[0]) * i) / INRUN_SEGS;
    const p: V3 = [0, inrunY(z), z];
    if (prev) {
      kit.solid.add(slab(prev, p, INRUN_W, 1.2), snow);
      kit.solid.add(slab([prev[0], prev[1] - 1.2, prev[2]], [p[0], p[1] - 1.2, p[2]], INRUN_W + 1, 4.5), shade(concrete, 0.9));
      for (const side of [-1, 1]) {
        kit.solid.add(slab([side * (INRUN_W / 2 + 0.3), prev[1] + 1, prev[2]], [side * (INRUN_W / 2 + 0.3), p[1] + 1, p[2]], 0.5, 1), accent);
        kit.lamp(new THREE.OctahedronGeometry(0.4), [side * (INRUN_W / 2 + 0.5), p[1] + 1.4, p[2]], 0xfff4dc, 2 + 4 * dusk, undefined, { depth: 0.4, freq: 4, phase: -i * 0.6, sharp: 2 });
      }
      // Truss under the bridge: diagonal braces.
      kit.solid.add(beam([0, prev[1] - 5.7, prev[2]], [0, p[1] - 9, (prev[2] + p[2]) / 2], 0.35, 4), STEEL);
    }
    prev = p;
  }
  // Pylons outside the clear span carry the bridge; under the road span it flies free.
  for (const z of PYLONS) {
    if (Math.abs(z) < CLEAR_HALF) throw new Error('skiJump: a pylon stands in the clear span');
    const y = inrunY(z) - 5.7;
    for (const side of [-1, 1]) kit.solid.add(beam([side * 7, 0, z], [side * 3, y, z], 1.4, 6), concrete);
    kit.solid.add(box(16, 2.5, 3), concrete, T(0, y - 2.5, z));
  }
  // A banner across the bridge right over the road, facing the oncoming racers.
  const bannerY = inrunY(0) - 7;
  for (const sz of [-1, 1]) kit.solid.add(box(INRUN_W + 3, 3, 0.4), sz < 0 ? accent : 0xf4f0e8, T(0, bannerY, sz * 1));
  kit.lamp(box(INRUN_W + 3.2, 0.5, 0.5), [0, bannerY + 3.1, 0], mix(0xffffff, accent, 0.4), 0, undefined, { depth: 0.5, freq: 3, phase: 0, sharp: 2 });

  // --- Take-off, landing hill, outrun ---
  kit.solid.add(box(INRUN_W + 2, LIP[1] - 1.2, 10), concrete, T(0, 0, LIP[0] + 3));
  const hillPt = (side: number, z: number): V3 => [side * HILL_W * (1 + (HILL_TOP[0] - z) / 400), hillY(z), z];
  for (let i = 0; i < HILL_SEGS; i++) {
    const za = HILL_TOP[0] + ((HILL_FOOT - HILL_TOP[0]) * i) / HILL_SEGS;
    const zb = HILL_TOP[0] + ((HILL_FOOT - HILL_TOP[0]) * (i + 1)) / HILL_SEGS;
    const g = new THREE.BufferGeometry();
    const a0 = hillPt(-1, za);
    const a1 = hillPt(1, za);
    const b0 = hillPt(-1, zb);
    const b1 = hillPt(1, zb);
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a0, ...b1, ...a1, ...a0, ...b0, ...b1], 3));
    kit.solid.add(g, i % 2 ? snow : shade(snow, 0.97));
    // Sides of the hill falling to the ground, and distance lines across it.
    for (const [p, q] of [[a0, b0], [a1, b1]] as const) {
      const s = new THREE.BufferGeometry();
      s.setAttribute('position', new THREE.Float32BufferAttribute([...p, p[0] * 1.3, 0, p[2], q[0] * 1.3, 0, q[2], ...p, q[0] * 1.3, 0, q[2], ...q], 3));
      kit.solid.add(s, shade(snow, 0.9));
    }
    if (i % 3 === 1) kit.solid.add(box(a1[0] * 2, 0.06, 0.6), i === 7 ? 0xff3030 : ICE_DEEP, T(0, a0[1] + 0.05, za, 0, -Math.atan2(a0[1] - b0[1], za - zb)));
  }
  kit.solid.add(prism(STANDS.r - 8, STANDS.r - 8, 0.3, 24), snow, T(0, 0, OUTRUN_Z));

  // Flags down both sides of the hill and a crowd behind them.
  for (let i = 0; i < ik.q(14, 8); i++) {
    const z = HILL_TOP[0] - 10 - i * ((HILL_TOP[0] - HILL_FOOT - 20) / ik.q(14, 8));
    for (const side of [-1, 1]) {
      const p = hillPt(side, z);
      const x = p[0] + side * 3;
      kit.solid.add(prism(0.15, 0.15, 8, 4), DARK, T(x, p[1], z));
      kit.moving.add(quad(3.2, 2).translate(1.6, 0, 0), kit.festiveColor(), T(x, p[1] + 7, z, side > 0 ? 0 : Math.PI), { pivot: [x, p[1] + 7, z], axisB: [0, 1, 0], swingB: 0.35, freq: 2 + rng(), phase: i });
      for (let k = 0; k < ik.q(5, 2); k++) kit.crowd({ x: x + side * (3 + rng() * 6), y: p[1] - 2 * k * 0.3, z: z + (rng() - 0.5) * 8, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2, color: kit.festiveColor(), hop: 0.2, freq: 3 + rng() * 3, phase: rng() * 9, sharp: 4, raise: 0.8 });
    }
  }
  // Grandstands round the outrun.
  for (let r = 0; r < STANDS.rows; r++) {
    const rad = STANDS.r + r * 4;
    const segs = 14;
    for (let s = 0; s < segs; s++) {
      const a = -Math.PI / 2 - STANDS.arc / 2 + (STANDS.arc * (s + 0.5)) / segs;
      const x = Math.cos(a) * rad;
      const z = OUTRUN_Z + Math.sin(a) * rad;
      kit.solid.add(box((STANDS.arc * rad) / segs + 0.4, 2.2 + r * 2.2, 4), r % 2 ? concrete : shade(concrete, 0.9), T(x, 0, z, -a - Math.PI / 2));
      for (let k = 0; k < ik.q(4, 2); k++) {
        const aa = a + ((k - 1.5) / 4) * (STANDS.arc / segs);
        kit.crowd({ x: Math.cos(aa) * rad, y: 2.2 + r * 2.2, z: OUTRUN_Z + Math.sin(aa) * rad, ry: -aa + Math.PI / 2, color: kit.festiveColor(), hop: 0.3, freq: 2.5, phase: -s * 0.5 - r * 0.3, sharp: 6, raise: 1 });
      }
    }
  }
  // Scoreboard and floodlight masts.
  kit.solid.add(box(40, 18, 3), DARK, T(0, 26, OUTRUN_Z - STANDS.r - 30));
  kit.solid.add(prism(1.2, 1.2, 26, 6), STEEL, T(-14, 0, OUTRUN_Z - STANDS.r - 30));
  kit.solid.add(prism(1.2, 1.2, 26, 6), STEEL, T(14, 0, OUTRUN_Z - STANDS.r - 30));
  for (let k = 0; k < 4; k++) kit.lamp(box(34, 2.4, 0.3), [0, 29 + k * 3.6, OUTRUN_Z - STANDS.r - 28.4], k % 2 ? 0xffd040 : mix(accent, 0xffffff, 0.3), 0, undefined, { depth: 0.6, freq: 1.5, phase: k, sharp: 3 });
  for (const [x, z] of [[-80, OUTRUN_Z + 20], [80, OUTRUN_Z + 20], [-60, -150], [60, -150]] as const) {
    kit.solid.add(prism(1.2, 1.6, 50, 6), STEEL, T(x, 0, z));
    kit.solid.add(box(10, 5, 1.5), DARK, T(x, 50, z));
    kit.lamp(box(9, 4, 0.3), [x, 50.5, z + Math.sign(-z) * 0.8], 0xfff8e8, 14 + 16 * dusk);
    lightCone(kit.beams, T(x, 52, z, 0, 0, Math.sign(x) * FLOOD_TILT), 90, 2, 26, 5, mix(0xfff0d0, 0x000000, 0.97 - 0.72 * dusk));
  }
  // Snow cannons misting the hill.
  const mist = kit.particles(false, 0.9);
  for (let k = 0; k < 4; k++) {
    const side = k % 2 ? 1 : -1;
    const z = -110 - k * 30;
    const p = hillPt(side, z);
    kit.solid.add(prism(0.3, 0.3, 5, 4), STEEL, T(p[0] + side * 6, p[1], z));
    kit.solid.add(prism(1.4, 1.2, 2.6, 8).rotateX(Math.PI / 2), 0xffd020, T(p[0] + side * 6, p[1] + 5, z, side > 0 ? -1 : 1));
    for (let i = 0; i < ik.q(26, 12); i++) {
      const period = 2.6 + rng();
      mist.add([p[0] + side * 6, p[1] + 5, z], [-side * (9 + rng() * 6), 3 + rng() * 3, (rng() - 0.5) * 4], 0xffffff, 1.6 + rng() * 2, { period, lifetime: period, phase: rng() * period, grow: 1.2 }, { gravity: 2.5, drag: 0.6, fadeIn: 0.1 });
    }
  }

  // --- Jumpers: crouched on the in-run, flying in a V, landing, gliding out ---
  const jumpers: THREE.Bone[] = [];
  for (let j = 0; j < JUMPERS; j++) {
    const b = rig.bone();
    const suit = kit.festiveColor();
    rig.add(box(0.5, 1.6, 0.4).translate(0, 0.2, 0), suit, { bone: b, m: T(0, 0.8, 0, 0, -1.2) });
    rig.add(new THREE.SphereGeometry(0.28, 6, 4), suit, { bone: b, m: T(0, 1.4, -1.2) });
    for (const side of [-1, 1]) rig.add(box(0.12, 0.05, 2.4), DARK, { bone: b, m: T(side * 0.25, 0, -0.4, side * 0.22) });
    jumpers.push(b);
  }
  const takeoff = new THREE.Vector3(0, LIP[1], LIP[0]);
  const landing = new THREE.Vector3(0, hillY(FLIGHT.z), FLIGHT.z);
  const outrun = new THREE.Vector3(0, 0, OUTRUN_Z + 20);

  function update(time: number): void {
    jumpers.forEach((b, j) => {
      const t = ((((time + (j * JUMP_CYCLE) / JUMPERS) % JUMP_CYCLE) + JUMP_CYCLE) % JUMP_CYCLE);
      b.scale.setScalar(JUMPER_SIZE);
      b.rotation.order = 'YXZ';
      if (t < T_INRUN) {
        // Accelerating down the in-run.
        const u = (t / T_INRUN) ** 2;
        const z = GATE[0] - 6 + (LIP[0] - GATE[0] + 6) * u;
        b.position.set(0, inrunY(z) + 0.1, z);
        b.rotation.set(-Math.atan((inrunY(z - 1) - inrunY(z)) / 1), Math.PI, 0);
      } else if (t < T_INRUN + FLIGHT.t) {
        // The flight: a long flat arc just above the hill.
        const u = (t - T_INRUN) / FLIGHT.t;
        b.position.lerpVectors(takeoff, landing, u);
        b.position.y += 14 * Math.sin(Math.PI * u) * (1 - u * 0.4);
        b.rotation.set(-0.25, Math.PI, 0);
      } else if (t < T_INRUN + FLIGHT.t + T_OUTRUN) {
        const u = (t - T_INRUN - FLIGHT.t) / T_OUTRUN;
        const e = 1 - (1 - u) * (1 - u);
        b.position.lerpVectors(landing, outrun, e);
        b.position.y = hillY(b.position.z) + 0.1;
        b.rotation.set(-0.3 * (1 - u), Math.PI, 0);
      } else b.scale.setScalar(0);
    });
  }

  return ik.finish(RADIUS, RADIUS, GATE[1] + 30, update);
}
