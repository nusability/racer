// The cargo airship: a heavy-lift dirigible moored to a lattice mast on a freight yard, a
// container slung under its gondola, four ducted fans on outriggers and a neon ad band down its
// flanks. Bound as a gust, it casts off before each on-window, swings out to hang low over the
// course lengthways, tilts its fans down and blasts the road (litter and grit skating across it
// toward the push), then motors back to the mast when the window ends.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { gustStrength } from '../../../core/hazards.ts';
import { T, beam, box, mix, prism, shade, vary } from '../b/shapes.ts';
import { addBeam, brush, col, glowBoost } from '../a/kit.ts';
import { AMBER, CONCRETE_DARK, CYAN, DARK, MAGENTA, RED_LIGHT, RigKit, RoadFrame, SAFETY, STEEL, WHITE, bindHazard, smooth01 } from './kit.ts';

const SALT = 0xa125e;
const RADIUS = 140;
/** The ship: envelope length and radius, metres. */
const LENGTH = 96;
const GIRTH = 14;
/** The mooring mast: where it stands (local) and its height; the nose docks at its head. */
const MAST: readonly [number, number] = [0, RADIUS * 0.35];
const MAST_H = 46;
/** Hover height of the envelope's axis over the road, and seconds to and from the mast. */
const HOVER_H = 34;
const TRANSIT = 6;
/** Fans: outrigger stations along the hull (x) and out to the side (z), and spin rates (rad/s). */
const FANS: readonly (readonly [number, number])[] = [[22, 17], [22, -17], [-24, 17], [-24, -17]];
const FAN_SPIN = 18;
const FAN_IDLE = 4;
/** How far the fans tilt down to blast the road, radians. */
const FAN_TILT = 1.2;
/** Litter and grit blown across the road: emission per second at full push, speed. */
const WASH_RATE = 0.012;
const WASH_SPEED = 26;
/** Container yard: stacks by quality. */
const STACKS = { high: 10, low: 5 } as const;
const BOXES: readonly number[] = [0x8a2a22, 0x2e4a66, 0x5e6244, 0xa07a34, 0x3a3a48, 0x6a3a6a];

export function createCargoAirship(opts: LandmarkOptions): Landmark {
  const ik = new RigKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('cargoAirship', opts, ['gust'] as const, {
    def: { type: 'gust', id: 'free', from: 0, to: 0, strength: 9, on: 6, period: 20, phase: 0 },
    roadZ: -RADIUS * 0.85,
    lateral: -1,
    minX: -10,
    maxX: 10,
    span: 140,
  });
  const def = bound.def;
  const boost = glowBoost(opts.palette);
  const dusk = opts.palette.dusk;

  // --- The freight yard: a pad, container stacks, the lattice mooring mast ---
  kit.solid.add(box(RADIUS * 1.6, 0.3, RADIUS * 1.2), CONCRETE_DARK, T(0, 0, RADIUS * 0.1));
  for (let i = 0; i < ik.q(STACKS.high, STACKS.low); i++) {
    const x = -RADIUS * 0.7 + rng() * RADIUS * 1.4;
    const z = -RADIUS * 0.3 + rng() * RADIUS * 0.4;
    const levels = 1 + Math.floor(rng() * 4);
    for (let l = 0; l < levels; l++) kit.solid.add(box(12, 2.6, 2.5), vary(rng, BOXES[Math.floor(rng() * BOXES.length)], 0.08), T(x, l * 2.6, z, Math.round(rng()) * Math.PI / 2));
  }
  const [mx, mz] = MAST;
  for (const [ox, oz] of [[-3, -3], [3, -3], [3, 3], [-3, 3]] as const) kit.solid.add(beam([mx + ox, 0, mz + oz], [mx + ox * 0.3, MAST_H, mz + oz * 0.3], 0.35), STEEL);
  for (let y = 6; y < MAST_H; y += 8) kit.solid.add(new THREE.TorusGeometry(3 * (1 - (0.7 * y) / MAST_H), 0.18, 3, 8).rotateX(Math.PI / 2), STEEL, T(mx, y, mz));
  kit.solid.add(prism(1.6, 1.2, 3, 8), SAFETY, T(mx, MAST_H, mz));
  kit.lamp(new THREE.OctahedronGeometry(0.8), [mx, MAST_H + 4, mz], RED_LIGHT, 5, undefined, { depth: 0.95, freq: 3, phase: 0, sharp: 7 });

  // --- The ship: +X is the nose ---
  const ship = rig.bone();
  const S = { bone: ship };
  const hull = mix(0xc8c4bc, opts.palette.sky, 0.1);
  rig.add(new THREE.SphereGeometry(1, 20, 12), hull, { ...S, m: T(0, 0, 0, 0, 0, 0, [LENGTH / 2, GIRTH, GIRTH]) });
  // Panel bands round the envelope.
  for (let b = -3; b <= 3; b++) rig.add(new THREE.TorusGeometry(1, 0.012, 3, 20).rotateY(Math.PI / 2), shade(hull, 0.8), { ...S, m: T((b * LENGTH) / 9, 0, 0, 0, 0, 0, [1, GIRTH * Math.sqrt(1 - ((b * 2) / 9) ** 2), GIRTH * Math.sqrt(1 - ((b * 2) / 9) ** 2)]) });
  // Tail fins (four), the ad band down each flank and its cyan trim.
  for (let f = 0; f < 4; f++) rig.add(box(16, 0.6, 12).translate(0, 0, 6 + GIRTH * 0.5), shade(hull, 0.85), { ...S, m: T(-LENGTH * 0.4, 0, 0, 0, (f * Math.PI) / 2 + Math.PI / 4, 0) });
  for (const side of [-1, 1]) {
    for (let seg = 0; seg < 6; seg++) {
      const c = [MAGENTA, MAGENTA, CYAN, AMBER, MAGENTA, CYAN][seg];
      rig.add(box(LENGTH * 0.08, GIRTH * 0.35, 0.3), c, { ...S, layer: 'glow', m: T(-LENGTH * 0.24 + seg * LENGTH * 0.095, 1, side * (GIRTH - 0.2)) });
    }
    rig.add(box(LENGTH * 0.62, 0.4, 0.3), CYAN, { ...S, layer: 'glow', m: T(0, -GIRTH * 0.3, side * (GIRTH * 0.95)) });
  }
  // Gondola and the slung container.
  rig.add(box(26, 5, 8), WHITE, { ...S, m: T(8, -GIRTH - 3, 0) });
  rig.add(box(10, 1.4, 8.2), mix(0x3a5a78, 0xffd890, 0.25 * dusk), { ...S, layer: 'glow', m: T(16, -GIRTH - 2, 0) });
  for (const z of [-2, 2]) rig.add(box(0.2, 8, 0.2), DARK, { ...S, m: T(4, -GIRTH - 13, z) });
  rig.add(box(14, 3, 3.2), BOXES[0], { ...S, m: T(4, -GIRTH - 16, 0) });
  rig.add(box(14.2, 0.4, 3.4), SAFETY, { ...S, m: T(4, -GIRTH - 13.4, 0) });
  // Searchlight under the gondola.
  addBeam(rig, 50, 10, 0xfff2d0, 0.02 + 0.2 * dusk, { bone: ship, m: T(20, -GIRTH - 6, 0, 0, 0, 0.35) });
  // Ducted fans on outriggers: duct, hub and blades on their own bones (they tilt and spin).
  const fans: { tilt: THREE.Bone; rotor: THREE.Bone }[] = [];
  for (const [fx, fz] of FANS) {
    rig.add(box(1, 1, Math.abs(fz)).translate(0, 0, Math.sign(fz) * Math.abs(fz) / 2), STEEL, { ...S, m: T(fx, -GIRTH * 0.5, 0) });
    const tilt = rig.bone(ship, fx, -GIRTH * 0.5, fz);
    const rotor = rig.bone(tilt);
    rig.add(new THREE.TorusGeometry(4.2, 0.7, 4, 14), DARK, { bone: tilt });
    rig.add(new THREE.TorusGeometry(4.2, 0.12, 3, 14), shade(AMBER, 1), { bone: tilt, layer: 'glow', m: T(0, 0, 0.75) });
    for (let b = 0; b < 3; b++) rig.add(box(7.6, 0.6, 0.15), STEEL, { bone: rotor, m: T(0, 0, 0, 0, 0, (b * Math.PI) / 3) });
    fans.push({ tilt, rotor });
  }

  const LAMPS = 4;
  const glow = ik.cloud(LAMPS, LAMPS, true, 1.6);
  const wash = ik.cloud(ik.q(360, 180), 0, false, 0.7);
  const grit = brush({ life: 1.6, size0: 1.2, size1: 3.5, c0: col(0xe8e4f0), c1: mix(0x9a989a, opts.palette.horizon, 0.5), alpha: 0.75, keep: 0.75, lift: -1 });
  const red = col(RED_LIGHT);
  const green = col(0x40ff80);
  const white = col(0xffffff);

  const h = bound.hazard;
  const road = new RoadFrame(bound.binding);
  const hover = new THREE.Vector3();
  const moor = new THREE.Vector3(mx - LENGTH / 2 - 2, MAST_H, mz);
  const P = new THREE.Vector3();
  const V = new THREE.Vector3();
  const travel = Math.min(TRANSIT, (def.period - def.on) / 2);
  let washAcc = 0;

  function update(time: number, dt: number): void {
    road.at((h.s0 + h.s1) / 2);
    const k = road.unit;
    const sideways = Math.sign(def.strength) || 1;
    // Hang a little upwind of the road so the blast comes off its lee side.
    road.point(-sideways * GIRTH * 0.5, HOVER_H + GIRTH + 16, hover);
    const ct = (((time + def.phase) % def.period) + def.period) % def.period;
    let u: number;
    if (ct < def.on) u = 1;
    else if (ct < def.on + travel) u = 1 - (ct - def.on) / travel;
    else if (ct > def.period - travel) u = (ct - (def.period - travel)) / travel;
    else u = 0;
    const e = smooth01(u);
    ship.position.lerpVectors(moor, hover, e);
    // A little sag mid-transit, and a slow bob all the time.
    ship.position.y += -Math.sin(e * Math.PI) * 10 + Math.sin(time * 0.6) * 0.8;
    // Moored it lies nose-on to the mast (local +X); over the course it lies along the road.
    const parked = 0;
    const over = RoadFrame.yaw(road.along);
    const d = Math.atan2(Math.sin(over - parked), Math.cos(over - parked));
    const push = gustStrength(def, time) / def.strength;
    ship.rotation.order = 'YXZ';
    ship.rotation.set(-sideways * 0.06 * push, parked + d * e, Math.sin(time * 0.4) * 0.015);
    ship.scale.setScalar(k);
    const spin = u > 0 ? FAN_SPIN : FAN_IDLE;
    fans.forEach((f, i) => {
      // Fans face aft (thrust) in transit, then tilt down and toward the push over the road.
      f.tilt.rotation.set(0, Math.PI / 2, 0);
      f.tilt.rotateOnAxis(AXIS_X, FAN_TILT * push * sideways * (i % 2 ? -1 : 1));
      f.rotor.rotation.z = time * spin * (i % 2 ? 1 : -1);
    });
    rig.sync();

    // Navigation lights: red port, green starboard, white tail strobe, red belly beacon.
    let li = 0;
    rig.local(ship, 0, 0, GIRTH, P);
    glow.lamp(li++, P.x, P.y, P.z, 4, green, 0.8 * boost);
    rig.local(ship, 0, 0, -GIRTH, P);
    glow.lamp(li++, P.x, P.y, P.z, 4, red, 0.8 * boost);
    rig.local(ship, -LENGTH / 2, 2, 0, P);
    glow.lamp(li++, P.x, P.y, P.z, 6, white, Math.sin(time * 5) > 0.85 ? boost : 0);
    rig.local(ship, 8, -GIRTH - 6, 0, P);
    glow.lamp(li++, P.x, P.y, P.z, 4, red, (Math.sin(time * 3) > 0 ? 0.9 : 0.1) * boost);

    if (dt <= 0) return;
    // The blast: grit and litter skating across the whole gust span toward its push.
    washAcc += dt * Math.abs(push);
    while (washAcc > WASH_RATE) {
      washAcc -= WASH_RATE;
      road.at(h.s0 + (h.s1 - h.s0) * rng());
      road.point(h.minX + (h.maxX - h.minX) * rng() - sideways * 8, 0.4 + rng() * 2.5, P);
      V.copy(road.across).multiplyScalar(sideways * WASH_SPEED * (0.7 + rng() * 0.6) * road.unit);
      wash.emit(grit, P.x, P.y, P.z, V.x + (rng() - 0.5) * 4, 1 + rng() * 4, V.z + (rng() - 0.5) * 4);
    }
  }

  return ik.finish(RADIUS, RADIUS * 2, MAST_H + 60, update);
}

const AXIS_X = new THREE.Vector3(1, 0, 0);
