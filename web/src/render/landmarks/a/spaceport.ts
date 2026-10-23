// Spaceport: three launch pads with gantries, a control tower with a turning radar, fuel
// farm and hangars. Each pad cycles its own ship: it lifts off on its lift jets in a burst of
// dust, pitches over and climbs away on a smoke trail; later another comes home down the
// approach lights, hovers and settles. Two more craft cross the sky high above.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { buildHauler, buildLancer, craftColours, type Craft } from './craft.ts';
import { boundHazard, boundReach } from './bound.ts';
import { GUST_LAMPS, GustShip } from './spaceportBound.ts';
import { GANTRY_H, PAD_H, PAD_R, RAIL_RINGS, buildPad, buildRail, railPoint, railSlope } from './spaceportParts.ts';
import {
  T,
  between,
  bezier,
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
  ramp,
  shade,
  smooth,
  strut,
} from './kit.ts';

const RADIUS = 240;
const HEIGHT = 200;
const PAD_X = [-140, 0, 140];
const PAD_Z = 40;

/** One pad's ship cycle, seconds: parked → ignition → climb out → away → approach → settle. */
const CYCLE = 42;
const T_ARM = 3;
const T_IGNITE = 6;
const T_LIFT = 8.5;
const T_CLIMB_END = 22;
const T_APPROACH = 25;
const T_HOVER = 34;
const T_TOUCH = 38;
/** Hover height before the vertical descent, and how far out the departures go. */
const HOVER_Y = 38;
const DEPART_DIST = 2600;
const DEPART_ALT = 1300;
const ARRIVE_DIST = 2400;
const ARRIVE_ALT = 1000;

/** Sky traffic: two craft on wide loops high behind the port. */
const TRANSIT_R = 1300;
const TRANSIT_ALT = 520;
const TRANSIT_PERIOD = 140;

/** Mag-launch sled cycle: wait in the breech, run the ramp, fly on. */
const RAIL_CYCLE = 26;
const RAIL_RUN = 4;
const RAIL_FLY = 12;
const TOWER_H = 100;
const SHIP_SCALE = 1.4;
const TRAIL_FOG = 0.6;

const APPROACH_LAMPS = 9;
const APPROACH_SPACING = 14;
const PAD_LAMPS = 10;

export function createSpaceport(opts: LandmarkOptions): Landmark {
  const { palette, quality } = opts;
  const hi = quality === 'high';
  const rng = mulberry32(opts.seed ^ 0x5bace);
  const boost = glowBoost(palette);
  const nPads = hi ? 3 : 2;
  const nTransit = hi ? 2 : 1;
  const nShips = nPads + nTransit;
  const bound = boundHazard(opts, 'spaceport', ['gust'] as const);
  const lampCount = nPads * (PAD_LAMPS + APPROACH_LAMPS) + 8 + nShips * 4 + RAIL_RINGS + 1 + (bound ? GUST_LAMPS : 0);
  const kit = makeKit(lampCount + (hi ? 420 : 200), lampCount, hi ? 520 : 240);
  const { rig, glow, smoke } = kit;

  // --- Palette ---
  const concrete = mix(0xb8b2a6, palette.road, 0.35);
  const metal = mix(0xd6d2ca, palette.sand, 0.2);
  const steel = col(0x5a5e68);
  const dark = col(0x2c2e36);
  const accent = col(palette.accent);
  const hazard = col(0xf0c030);
  const warm = col(0xffd890);
  const red = col(0xff3a2a);
  const green = col(0x50ff90);
  const white = col(0xffffff);
  const amber = col(0xffb040);
  const accentGlow = mix(palette.accent, 0xffffff, 0.35);

  // --- Ground works ---
  rig.add(block(470, 0.6, 200), concrete, { m: T(0, 0, 40) });
  rig.add(block(90, 0.62, 260), shade(concrete, 0.9), { m: T(0, 0, -20) });
  for (let i = 0; i < 12; i++) rig.add(block(1.2, 0.64, 10), white, { m: T(0, 0, -140 + i * 18) });

  const pads = PAD_X.slice(0, nPads).map((x) => new THREE.Vector3(hi ? x : x * 1.2 - 60 * Math.sign(x), 0, PAD_Z));
  const arms = pads.map((p) => buildPad(rig, p, { concrete, steel, dark, hazard, accent, metal, warm }));

  // --- Control tower (front right, so racers pass under it) with a turning radar ---
  const towerX = 205;
  const towerZ = -40;
  const th = TOWER_H;
  rig.add(cyl(6, 10, th, 8), metal, { m: T(towerX, 0, towerZ) });
  rig.add(cyl(4, 4, th, 6), accent, { m: T(towerX, 0, towerZ - 6) });
  rig.add(cyl(17, 10, 12, 10), metal, { m: T(towerX, th, towerZ) });
  rig.add(cyl(17.3, 15.6, 4, 10, true), warm, { m: T(towerX, th + 5, towerZ), layer: 'glow' });
  rig.add(cyl(13, 17, 3, 10), steel, { m: T(towerX, th + 12, towerZ) });
  rig.add(cyl(0.6, 0.6, 18, 4), steel, { m: T(towerX - 6, th + 15, towerZ) });
  rig.add(cyl(12, 12, 1.5, 8), steel, { m: T(towerX, th * 0.55, towerZ) });
  const radar = rig.bone(rig.root, towerX + 3, th + 15, towerZ);
  rig.add(cyl(1, 1.5, 5, 6), steel, { bone: radar });
  rig.add(new THREE.SphereGeometry(7, 10, 3, 0, Math.PI * 2, 0, 0.9).rotateX(-1.2).translate(0, 7, -2), white, { bone: radar });
  rig.add(box(0.6, 0.6, 7), steel, { bone: radar, m: T(0, 7, 1.5) });

  // --- Fuel farm (left) piped to the pads ---
  const farmX = -215;
  const farmZ = 90;
  for (let i = 0; i < 3; i++) {
    const x = farmX + (i - 1) * 24;
    rig.add(cyl(9, 9, 32, 10), i === 1 ? shade(accent, 0.95) : metal, { m: T(x, 0, farmZ) });
    rig.add(new THREE.SphereGeometry(9, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2), metal, { m: T(x, 32, farmZ) });
    rig.add(block(19, 1, 2), dark, { m: T(x, 12, farmZ - 9) });
  }
  for (const dz of [-40, -14]) {
    rig.add(new THREE.SphereGeometry(11, 10, 6), white, { m: T(farmX + 4, 15, farmZ + dz - 26) });
    rig.addAll([0, 1, 2, 3].map((k) => block(1.4, 6, 1.4).applyMatrix4(T(farmX + 4 + Math.cos(k * 1.57 + 0.78) * 8, 0, farmZ + dz - 26 + Math.sin(k * 1.57 + 0.78) * 8))), steel);
  }
  for (const p of pads) {
    rig.add(strut(), steel, { m: between(new THREE.Vector3(farmX + 12, 2, farmZ - 12), new THREE.Vector3(p.x - 12, 2, p.z + 26), 1.6) });
  }

  // --- Hangars along the back ---
  for (let i = 0; i < (hi ? 3 : 2); i++) {
    const x = -120 + i * 120;
    const z = 175;
    const shell = new THREE.CylinderGeometry(26, 26, 64, 10, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
    rig.add(shell, i === 1 ? shade(accent, 0.85) : metal, { m: T(x, 0, z) });
    rig.add(new THREE.CircleGeometry(23, 8, 0, Math.PI).rotateY(Math.PI), warm, { m: T(x, 0.5, z - 32.3), layer: 'glow' });
    rig.add(box(54, 3, 2), dark, { m: T(x, 1.5, z - 33) });
    for (let k = 0; k < 4; k++) rig.add(box(6, 0.4, 12), shade(white, 0.9), { m: T(x - 20 + k * 13, 0.7, z - 50) });
  }

  // Scattered service sheds and masts, deterministic per seed.
  for (let i = 0; i < (hi ? 10 : 5); i++) {
    const x = -220 + rng() * 440;
    const z = -110 + rng() * 60;
    if (Math.abs(x) < 50) continue;
    const h = 5 + rng() * 8;
    rig.add(block(10 + rng() * 14, h, 8 + rng() * 8), rng() < 0.3 ? accent : metal, { m: T(x, 0, z, 0, rng() * 0.4 - 0.2) });
    rig.add(box(4, 1.2, 0.3), warm, { m: T(x, h * 0.6, z - 6), layer: 'glow' });
  }

  buildRail(rig, hi, { steel, dark, metal, accent, warm });
  const sledHolder = rig.bone();
  const sled = buildLancer(rig, sledHolder, 0.75, craftColours(mix(0xf4f0e8, palette.sand, 0.1), accent));
  /** The rail runs along +X, so the sled flies nose-first toward +X. */
  const sledY = Math.PI / 2;

  // --- Ships ---
  const hullA = mix(0xe8e4dc, palette.sand, 0.15);
  const ships: { craft: Craft; pad: THREE.Vector3 | null; phase: number; yaw: number; depart: number; arrive: number }[] = [];
  for (let i = 0; i < nShips; i++) {
    const holder = rig.bone();
    const colours = craftColours(i % 2 ? hullA : shade(hullA, 0.85), i % 3 === 1 ? hazard : accent);
    const craft = i % 2 === 0 ? buildHauler(rig, holder, SHIP_SCALE, colours) : buildLancer(rig, holder, SHIP_SCALE * 1.1, colours);
    const pad = i < nPads ? pads[i] : null;
    // Ships park nose away from the track and leave/arrive over the desert behind the port.
    const yaw = (rng() - 0.5) * 0.8 + (pad ? pad.x / 400 : 0);
    ships.push({
      craft,
      pad,
      phase: (i / nPads) * CYCLE + rng() * 3,
      yaw,
      depart: yaw + (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.5),
      arrive: yaw + Math.PI + (rng() - 0.5) * 1.2,
    });
  }

  // Bound: a heavy hauler crosses low over the road at the gust, its downdraft the push.
  const gustShip = bound ? new GustShip(rig, bound.binding, bound.hazard, craftColours(shade(hullA, 0.9), accent), palette) : null;
  const cullRadius = gustShip ? Math.max(RADIUS, boundReach(gustShip.frame, 700)) : RADIUS;
  rig.build(kit.group, cullRadius, HEIGHT);

  // --- Particles ---
  const sandCol = mix(palette.sand, 0xffffff, 0.15);
  const dust = brush({ life: 4.5, size0: 12, size1: 46, c0: sandCol, c1: mix(palette.sand, palette.horizon, 0.5), alpha: 0.55, keep: 0.45, lift: 1.2 });
  const steam = brush({ life: 5, size0: 16, size1: 60, c0: col(0xf4f2ee), c1: mix(0xffffff, palette.horizon, 0.6), alpha: 0.6, keep: 0.5, lift: 3 });
  const trail = brush({ life: 6, size0: 8, size1: 30, c0: col(0xffffff), c1: mix(0xffffff, palette.horizon, 0.7), alpha: 0.45, keep: 0.9, lift: 0.5 });
  const exhaust = brush({ life: 0.35, size0: 7, size1: 16, c0: col(0xfff2c0), c1: col(0xff7020), alpha: 0.8 * boost, keep: 0.6 });
  smoke.wind.set(4, 0, 2);
  // Climb-out trails are the port's signature from afar; let them cut through the haze.
  smoke.setFogScale(TRAIL_FOG);

  // --- Animation ---
  const evt = mulberry32(opts.seed ^ 0xe7e7);
  const P = new THREE.Vector3();
  const Q = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  const D = new THREE.Vector3();
  const W = new THREE.Vector3();
  const prevPos = ships.map(() => new THREE.Vector3());
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const emitAcc = new Float32Array(nShips);

  /** Launch path from the pad: straight up, then out along `heading` into the sky. */
  function departPoint(pad: THREE.Vector3, yaw: number, heading: number, s: number, out: THREE.Vector3): THREE.Vector3 {
    A.set(pad.x, PAD_H, pad.z);
    B.set(pad.x, 170, pad.z);
    C.set(pad.x + Math.sin(yaw) * 380, 430, pad.z + Math.cos(yaw) * 380);
    D.set(pad.x + Math.sin(heading) * DEPART_DIST, DEPART_ALT, pad.z + Math.cos(heading) * DEPART_DIST);
    return bezier(A, B, C, D, s, out);
  }
  /** Approach path from far out to the hover point, arriving heading `yaw`. */
  function arrivePoint(pad: THREE.Vector3, yaw: number, from: number, s: number, out: THREE.Vector3): THREE.Vector3 {
    A.set(pad.x + Math.sin(from) * ARRIVE_DIST, ARRIVE_ALT, pad.z + Math.cos(from) * ARRIVE_DIST);
    B.set(pad.x + Math.sin(from) * 900, 420, pad.z + Math.cos(from) * 900);
    C.set(pad.x - Math.sin(yaw) * 320, HOVER_Y + 40, pad.z - Math.cos(yaw) * 320);
    D.set(pad.x, HOVER_Y, pad.z);
    return bezier(A, B, C, D, s, out);
  }

  let lampI = 0;
  const lamp = (x: number, y: number, z: number, size: number, c: THREE.Color, a: number) => glow.lamp(lampI++, x, y, z, size, c, a);

  function update(time: number, dt: number): void {
    lampI = 0;
    radar.rotation.y = time * 0.9;

    ships.forEach((sh, i) => {
      const { craft } = sh;
      const b = craft.body;
      let lift = 0;
      let main = 0;
      let visible = true;
      let landing = false;
      let launching = false;
      let level = 1; // 1 = flat attitude, 0 = follow the flight path
      if (sh.pad) {
        const pad = sh.pad;
        const t = fract((time + sh.phase) / CYCLE) * CYCLE;
        if (t < T_IGNITE) {
          P.set(pad.x, PAD_H, pad.z);
          launching = t > T_ARM;
          lift = t > T_IGNITE - 1.2 ? 0.25 * ramp(t, T_IGNITE - 1.2, T_IGNITE) : 0;
        } else if (t < T_LIFT) {
          const u = ramp(t, T_IGNITE, T_LIFT);
          P.set(pad.x, PAD_H + u * u * 8, pad.z);
          lift = 0.4 + 0.6 * u;
          launching = true;
        } else if (t < T_CLIMB_END) {
          const u = ramp(t, T_LIFT, T_CLIMB_END);
          const s = 0.012 + Math.pow(u, 2.1);
          departPoint(pad, sh.yaw, sh.depart, Math.min(1, s), P);
          lift = 1 - ramp(u, 0.15, 0.45) * 0.8;
          main = ramp(u, 0.06, 0.25);
          level = 1 - smooth(ramp(u, 0.05, 0.3));
          launching = true;
        } else if (t < T_APPROACH) {
          visible = false;
        } else if (t < T_HOVER) {
          const u = ramp(t, T_APPROACH, T_HOVER);
          arrivePoint(pad, sh.yaw, sh.arrive, 1 - (1 - u) * (1 - u), P);
          main = 1 - ramp(u, 0.55, 0.9);
          lift = ramp(u, 0.6, 0.9);
          level = smooth(ramp(u, 0.65, 0.95));
          landing = true;
        } else if (t < T_TOUCH) {
          const u = smooth(ramp(t, T_HOVER, T_TOUCH));
          P.set(pad.x, HOVER_Y + (PAD_H - HOVER_Y) * u, pad.z);
          lift = 1 - 0.4 * u;
          landing = true;
        } else {
          P.set(pad.x, PAD_H, pad.z);
          lift = Math.max(0, 0.6 - (t - T_TOUCH) * 0.6);
        }
        padState[i] = launching ? 1 : landing ? 2 : 0;
        padFlying[i] = t > T_IGNITE && t < T_TOUCH;
      } else {
        // Transit traffic: a wide loop high behind the port, flying nose-first.
        const a = (time / TRANSIT_PERIOD + sh.phase / CYCLE) * Math.PI * 2 * (i % 2 ? -1 : 1);
        P.set(Math.cos(a) * TRANSIT_R, TRANSIT_ALT + i * 140 + Math.sin(a * 3) * 40, TRANSIT_R * 0.6 + Math.sin(a) * TRANSIT_R * 0.6);
        main = 0.6;
        level = 0;
      }
      if (!visible) {
        b.scale.setScalar(0);
        prevPos[i].set(Number.NaN, 0, 0);
        return;
      }
      b.scale.setScalar(1);
      b.position.copy(P);
      // Attitude: heading and pitch from the velocity once moving; bank into the turn.
      const prev = prevPos[i];
      let yaw = sh.yaw;
      let pitch = 0;
      let roll = 0;
      if (dt > 0 && !Number.isNaN(prev.x)) {
        W.subVectors(P, prev);
        const h = Math.hypot(W.x, W.z);
        if (h > dt * 6) {
          const fly = 1 - level;
          const heading = Math.atan2(W.x, W.z);
          let dy = heading - sh.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          yaw = sh.yaw + dy * fly;
          pitch = Math.atan2(W.y, h) * fly * 0.8;
          const prevYaw = b.rotation.y;
          let turn = yaw - prevYaw;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          roll = THREE.MathUtils.clamp(-turn / dt * 1.5, -0.6, 0.6) * fly;
        }
      }
      prev.copy(P);
      euler.set(-pitch, yaw, roll);
      b.rotation.copy(euler);
      const flick = 0.85 + 0.15 * Math.sin(time * 37 + i * 3);
      craft.lift.scale.set(1, Math.max(0.001, lift * flick), 1);
      craft.main.scale.set(1, 1, Math.max(0.001, main * flick));
      shipLift[i] = lift;
      shipMain[i] = main;
    });

    // The rail sled: waits in the breech, runs the ramp, then flies on along the lip's line.
    const rt = fract(time / RAIL_CYCLE + opts.seed * 0.001) * RAIL_CYCLE;
    let sledU = -1;
    if (rt < RAIL_RUN) {
      sledU = Math.pow(rt / RAIL_RUN, 2);
      railPoint(sledU, P);
      P.y += 4;
      const slope = railSlope(sledU);
      sledHolder.rotation.set(-slope, sledY, 0, 'YXZ');
      sledHolder.position.copy(P);
      sledHolder.scale.setScalar(1);
    } else if (rt < RAIL_RUN + RAIL_FLY) {
      const f = rt - RAIL_RUN;
      railPoint(1, P);
      const slope = railSlope(1);
      // Leaves the lip at ramp speed and keeps accelerating along its line.
      const d = RAIL_EXIT_SPEED * f + 0.5 * RAIL_EXIT_ACCEL * f * f;
      P.x += Math.cos(slope) * d;
      P.y += 4 + Math.sin(slope) * d;
      sledHolder.position.copy(P);
      sledHolder.rotation.set(-slope, sledY, 0, 'YXZ');
      sledHolder.scale.setScalar(1);
    } else {
      railPoint(0, P);
      sledHolder.position.set(P.x - 10, P.y + 4, P.z);
      sledHolder.rotation.set(0, sledY, 0, 'YXZ');
      sledHolder.scale.setScalar(rt > RAIL_CYCLE - 3 ? 1 : 0);
    }
    const sledMain = rt < RAIL_RUN + RAIL_FLY && rt >= RAIL_RUN * 0.5 ? 1 : 0;
    sled.main.scale.set(1, 1, Math.max(0.001, sledMain * (0.85 + 0.15 * Math.sin(time * 41))));

    gustShip?.pose(time);
    // Bones are posed; bring their matrices up to date for the glows and emitters.
    rig.sync();

    for (let k = 0; k < RAIL_RINGS; k++) {
      const u = (k + 1) / (RAIL_RINGS + 1);
      railPoint(u, Q);
      // Rings flare as the sled passes and idle with a slow pulse.
      const near = sledU >= 0 ? Math.max(0, 1 - Math.abs(sledU - u) * 8) : 0;
      lamp(Q.x, Q.y + 4, Q.z, 10 + 16 * near, accentGlow, (0.25 + 0.75 * near) * boost);
    }
    if (sledMain > 0 && dt > 0) {
      rig.local(sled.body, 0, 3, -20, Q);
      lamp(Q.x, Q.y, Q.z, 16, warm, boost);
      if (rt > RAIL_RUN * 0.6) smoke.emit(trail, Q.x, Q.y, Q.z, 0, 0, 0);
    } else lamp(0, -1000, 0, 0, warm, 0);

    ships.forEach((sh, i) => {
      const { craft } = sh;
      if (craft.body.scale.x === 0) {
        for (let k = 0; k < 4; k++) lamp(0, -1000, 0, 0, white, 0);
        return;
      }
      const blink = fract(time * 1.1 + i * 0.3) < 0.12 ? 1 : 0.25;
      rig.local(craft.body, craft.navLights[0].x, craft.navLights[0].y, craft.navLights[0].z, Q);
      lamp(Q.x, Q.y, Q.z, 6, red, blink * boost);
      rig.local(craft.body, craft.navLights[1].x, craft.navLights[1].y, craft.navLights[1].z, Q);
      lamp(Q.x, Q.y, Q.z, 6, green, blink * boost);
      const mn = craft.mainNozzles[0];
      rig.local(craft.body, mn.x, mn.y, mn.z, Q);
      lamp(Q.x, Q.y, Q.z, 18 * shipMain[i], warm, 0.9 * boost);
      const ln = craft.liftNozzles[0] ?? mn;
      rig.local(craft.body, ln.x, ln.y - 3, ln.z, Q);
      lamp(Q.x, Q.y, Q.z, 22 * shipLift[i], warm, 0.8 * boost);
      if (dt <= 0) return;
      emitAcc[i] += dt;
      const alt = Q.y;
      while (emitAcc[i] > EMIT_STEP) {
        emitAcc[i] -= EMIT_STEP;
        if (shipLift[i] > 0.3) {
          for (const n of craft.liftNozzles) {
            rig.local(craft.body, n.x, n.y, n.z, Q);
            glow.emit(exhaust, Q.x, Q.y - 2, Q.z, 0, -30, 0);
          }
          if (alt < 60) {
            // Jet wash spreading over the pad, thicker the closer the ship is.
            const a = evt() * Math.PI * 2;
            const sp = 22 + evt() * 18;
            smoke.emit(alt < 15 ? steam : dust, Q.x + Math.cos(a) * 8, 2, Q.z + Math.sin(a) * 8, Math.cos(a) * sp, 2, Math.sin(a) * sp);
          }
        }
        if (shipMain[i] > 0.3) {
          for (const n of craft.mainNozzles) {
            rig.local(craft.body, n.x, n.y, n.z, Q);
            glow.emit(exhaust, Q.x, Q.y, Q.z, 0, 0, 0);
          }
          if (alt > 40 && alt < DEPART_ALT && evt() < 0.6) smoke.emit(trail, Q.x, Q.y, Q.z, 0, 0, 0);
        }
      }
    });

    // Pad lights: amber chase while a ship comes home, red strobe while one launches, green idle.
    pads.forEach((p, i) => {
      const state = padState[i];
      for (let k = 0; k < PAD_LAMPS; k++) {
        const a = (k / PAD_LAMPS) * Math.PI * 2;
        const x = p.x + Math.cos(a) * (PAD_R + 1);
        const z = p.z + Math.sin(a) * (PAD_R + 1);
        if (state === 1) lamp(x, PAD_H + 1, z, 5, red, (fract(time * 2) < 0.5 ? 1 : 0.2) * boost);
        else if (state === 2) lamp(x, PAD_H + 1, z, 5, amber, (fract(time * 1.5 - k / PAD_LAMPS) < 0.25 ? 1 : 0.15) * boost);
        else lamp(x, PAD_H + 1, z, 4, green, 0.55 * boost);
      }
      for (let k = 0; k < APPROACH_LAMPS; k++) {
        const z = p.z - PAD_R - 10 - (APPROACH_LAMPS - k) * APPROACH_SPACING;
        const on = state === 2 ? (fract(time * 1.2 + k / APPROACH_LAMPS) < 0.18 ? 1 : 0.1) : 0.25;
        lamp(p.x, 1.2, z, 4, white, on * boost);
      }
      // Gantry arm swings clear before ignition and back once the ship is down.
      const arm = arms[i];
      arm.rotation.y = padFlying[i] || state === 1 ? Math.min(arm.rotation.y + dt * 0.6, ARM_OPEN) : Math.max(arm.rotation.y - dt * 0.4, 0);
      lamp(p.x + PAD_R + 10, GANTRY_H + 4, p.z + 6, 7, red, (fract(time * 0.8 + i * 0.33) < 0.15 ? 1 : 0.15) * boost);
    });
    const strobe = fract(time * 0.7) < 0.06 ? 1 : 0;
    lamp(towerX - 6, TOWER_H + 34, towerZ, 12, white, strobe * boost);
    lamp(towerX, TOWER_H + 13, towerZ, 9, red, (fract(time * 0.9) < 0.5 ? 0.9 : 0.2) * boost);
    for (let k = 0; k < 6; k++) lamp(farmX - 24 + (k % 3) * 24, 34, farmZ, 4, red, (fract(time * 0.5 + k * 0.17) < 0.5 ? 0.9 : 0.25) * boost);
    if (gustShip) lampI = gustShip.effects(time, dt, rig, glow, smoke, lampI, warm, evt);
    while (lampI < glow.fixed) lamp(0, -1000, 0, 0, white, 0);

    glow.update(dt);
    smoke.update(dt);
  }

  const padState = new Uint8Array(nShips);
  const padFlying = new Array<boolean>(nShips).fill(false);
  const shipLift = new Float32Array(nShips);
  const shipMain = new Float32Array(nShips);

  return {
    group: kit.group,
    radius: cullRadius,
    update,
    dispose: () => disposeKit(kit),
  };
}

/** Exhaust/dust emission tick, seconds (rate independent of frame rate). */
const EMIT_STEP = 1 / 30;
/** Sled speed at the lip, m/s, and its acceleration after it, m/s². */
const RAIL_EXIT_SPEED = 160;
const RAIL_EXIT_ACCEL = 40;
/** Gantry arm swing when open, radians. */
const ARM_OPEN = 1.4;
