// Invasion: a ground battle across the dunes. Four-legged siege striders and hover tanks
// advance from the far side; a shielded line of bunkers with turrets holds the near side.
// Bolts streak both ways, shells burst in fireballs, burning wrecks pour smoke columns that
// lean with the wind, and a dropship hangs overhead lowering drop pods.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { buildHauler, craftColours } from './craft.ts';
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
  type Rig,
} from './kit.ts';

const RADIUS = 270;
const HEIGHT = 140;

// --- Striders ---
const HIP_Y = 30;
const THIGH_X = 15;
const THIGH_Y = 12;
const SHIN_X = 11;
const STRIDE = 22;
const STRIDER_SPEED = 3.2;
const HIP_SWING = 0.32;
const LEG_LIFT = 0.22;

// --- Hover tanks ---
const TANK_SPEED = 9;
const TANK_HOVER = 2.2;

// --- Fire ---
const BOLT_SPEED = 320;
const BOLT_LEN = 18;
const SHELL_EVERY = 2.2;
const FIRE_EVERY = 0.45;
const SHIELD_R = 48;
const SHIELD_Z = -150;

// --- Dropship and pods ---
const DROP_Y = 95;
const POD_CYCLE = 7;
const POD_FALL = 2.4;
/** Trail puffs per second behind a falling pod. */
const POD_TRAIL_RATE = 12;

const WIND_X = 6;
const WIND_Z = 1.5;
/** Share of scene fog the smoke columns take, so they still mark the battle from afar. */
const SMOKE_FOG = 0.6;

interface Strider {
  holder: THREE.Bone;
  head: THREE.Bone;
  hips: THREE.Bone[];
  shins: THREE.Bone[];
  cx: number;
  cz: number;
  ax: number;
  az: number;
  phase: number;
  dir: number;
}

interface Tank {
  holder: THREE.Bone;
  turret: THREE.Bone;
  cx: number;
  cz: number;
  ax: number;
  az: number;
  phase: number;
}

interface Bolt {
  bone: THREE.Bone;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t0: number;
  dur: number;
  live: boolean;
  colour: THREE.Color;
}

export function createInvasion(opts: LandmarkOptions): Landmark {
  const { palette, quality } = opts;
  const hi = quality === 'high';
  const rng = mulberry32(opts.seed ^ 0x1a5e2);
  const boost = glowBoost(palette);
  const nStriders = hi ? 3 : 2;
  const nTanks = hi ? 8 : 4;
  const nTurrets = hi ? 6 : 4;
  const nBolts = hi ? 30 : 14;
  const nWrecks = hi ? 3 : 2;
  const nPods = hi ? 3 : 2;
  const lampCount = nStriders * 2 + nTanks + nTurrets + nBolts + 4 + 6;
  const kit = makeKit(lampCount + (hi ? 360 : 160), lampCount, hi ? 700 : 320);
  const { rig, glow, smoke } = kit;
  smoke.wind.set(WIND_X, 0, WIND_Z);
  smoke.setFogScale(SMOKE_FOG);

  // --- Palette: invaders in dark gunmetal with hot red, defenders in sand-camo with the accent ---
  const sand = col(palette.sand);
  const scorched = mix(palette.sand, 0x2a2420, 0.55);
  const invader = mix(0x3a3c48, palette.rock, 0.2);
  const invaderLight = shade(invader, 1.6);
  const red = col(0xff3030);
  const defender = mix(0xbab09a, palette.sand, 0.4);
  const accent = col(palette.accent);
  const dark = col(0x2a2a30);
  const boltRed = col(0xff4038);
  const boltBlue = mix(palette.accent, 0x60e8ff, 0.6);
  const shieldCol = mix(palette.accent, 0x80d8ff, 0.5);

  // --- Battlefield ground: craters, berms, tank traps, wreckage ---
  for (let i = 0; i < (hi ? 14 : 8); i++) {
    const x = (rng() - 0.5) * 460;
    const z = -70 + rng() * 260;
    const r = 8 + rng() * 14;
    rig.add(new THREE.TorusGeometry(r, r * 0.3, 3, 10).rotateX(Math.PI / 2).scale(1, 0.5, 1), shade(sand, 0.85), { m: T(x, 0, z) });
    rig.add(cyl(r, r, 0.15, 10), scorched, { m: T(x, 0, z) });
  }
  for (let i = 0; i < (hi ? 22 : 10); i++) {
    // Tank traps: three crossed beams.
    const x = (rng() - 0.5) * 480;
    const z = -80 + rng() * 40;
    for (let k = 0; k < 3; k++) {
      rig.add(box(0.8, 7, 0.8), dark, { m: T(x, 2.4, z, k === 0 ? 0.9 : 0, k === 1 ? 0 : k * 1.2, k === 2 ? 0.9 : -0.9) });
    }
  }
  // Defensive berm and trench line.
  rig.add(block(520, 3, 10), shade(sand, 0.9), { m: T(0, 0, -100) });
  for (let i = 0; i < 26; i++) rig.add(box(14, 2.2, 3), defender, { m: T(-250 + i * 20, 3.6, -97, 0, 0, (rng() - 0.5) * 0.1) });

  // Burning wrecks: a toppled strider body and dead tanks.
  const wrecks: THREE.Vector3[] = [];
  for (let i = 0; i < nWrecks; i++) {
    const w = new THREE.Vector3((rng() - 0.5) * 380, 0, -40 + rng() * 160);
    wrecks.push(w);
    rig.add(cyl(6, 9, 6, 4), invader, { m: T(w.x, 0.5, w.z, 0.3, rng() * 3, 0.5) });
    rig.add(box(12, 4, 5), shade(invader, 0.7), { m: T(w.x + 7, 1, w.z + 3, 0, rng() * 3, 0.4) });
    rig.add(strut(), invader, { m: between(new THREE.Vector3(w.x - 4, 2, w.z), new THREE.Vector3(w.x - 22, 14, w.z + 10), 2) });
    rig.add(cyl(14, 14, 0.2, 10), scorched, { m: T(w.x, 0, w.z) });
  }
  for (let i = 0; i < (hi ? 12 : 6); i++) {
    rig.add(rock(2 + rng() * 3), shade(invader, 0.8), { m: T((rng() - 0.5) * 460, 0.5, -60 + rng() * 280, rng(), rng(), rng()) });
  }

  // --- Defender line: bunkers with turrets, and a shield dome over the command post ---
  const turrets: { yaw: THREE.Bone; pos: THREE.Vector3 }[] = [];
  for (let i = 0; i < nTurrets; i++) {
    const x = -220 + (i + 0.5) * (440 / nTurrets);
    const z = -125 + (i % 2) * 18;
    rig.add(cyl(10, 13, 6, 6), defender, { m: T(x, 0, z) });
    rig.add(box(10, 1.2, 0.6), accent, { m: T(x, 4, z - 11) });
    const yaw = rig.bone(rig.root, x, 6, z);
    rig.add(cyl(4, 5, 4, 6), shade(defender, 0.85), { bone: yaw });
    for (const dx of [-1.4, 1.4]) rig.add(cyl(0.5, 0.6, 11, 5).rotateX(Math.PI / 2), dark, { bone: yaw, m: T(dx, 2.4, 2) });
    turrets.push({ yaw, pos: new THREE.Vector3(x, 8.4, z) });
  }
  rig.add(cyl(14, 18, 10, 8), defender, { m: T(0, 0, SHIELD_Z) });
  rig.add(cyl(1, 1, 30, 5), dark, { m: T(0, 10, SHIELD_Z) });
  rig.add(box(4, 4, 4), shieldCol, { m: T(0, 40, SHIELD_Z, 0.6, 0.6), layer: 'glow' });
  const shieldBone = rig.bone(rig.root, 0, 0, SHIELD_Z);
  const dome = new THREE.SphereGeometry(SHIELD_R, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
  const domePos = dome.getAttribute('position');
  const domeAlpha = new Float32Array(domePos.count);
  // Brighter toward the rim, where the eye looks through more of the shell.
  for (let v = 0; v < domePos.count; v++) domeAlpha[v] = SHIELD_ALPHA * (1.6 - domePos.getY(v) / SHIELD_R);
  rig.add(dome, shieldCol, { bone: shieldBone, layer: 'beam', alphas: domeAlpha });

  // --- Striders ---
  const striders: Strider[] = [];
  for (let i = 0; i < nStriders; i++) {
    striders.push(buildStrider(rig, { invader, invaderLight, red, dark }, {
      cx: -140 + i * (280 / Math.max(1, nStriders - 1)) + (rng() - 0.5) * 30,
      cz: 120 + rng() * 50,
      ax: 50 + rng() * 40,
      az: 30 + rng() * 20,
      phase: rng() * Math.PI * 2,
      dir: rng() < 0.5 ? -1 : 1,
    }));
  }

  // --- Hover tanks ---
  const tanks: Tank[] = [];
  for (let i = 0; i < nTanks; i++) {
    const holder = rig.bone();
    rig.add(cyl(0.7, 1, 3.2, 4).rotateY(Math.PI / 4).scale(9, 1, 13), invader, { bone: holder });
    rig.add(box(10, 0.5, 2), red, { bone: holder, m: T(0, 0.2, 7.5), layer: 'glow' });
    rig.add(box(11, 0.4, 14), shade(red, 0.8), { bone: holder, m: T(0, -0.2, 0), layer: 'glow' });
    const turret = rig.bone(holder, 0, 3.2, -1);
    rig.add(cyl(0.6, 1, 2, 6).rotateY(Math.PI / 6).scale(3.5, 1, 4), invaderLight, { bone: turret });
    rig.add(cyl(0.35, 0.45, 9, 5).rotateX(Math.PI / 2), dark, { bone: turret, m: T(0, 1, 1.5) });
    tanks.push({ holder, turret, cx: (rng() - 0.5) * 300, cz: 40 + rng() * 120, ax: 40 + rng() * 60, az: 15 + rng() * 25, phase: rng() * Math.PI * 2 });
  }

  // --- Dropship with its floodlight, and drop pods ---
  const dropHolder = rig.bone(rig.root, 60, DROP_Y, 170);
  const drop = buildHauler(rig, dropHolder, 1.7, craftColours(invader, red));
  addBeam(rig, DROP_Y + 10, 40, mix(0xfff0d0, palette.sun, 0.4), 0.22, { bone: drop.body, m: T(0, 0, 8) });
  const pods: THREE.Bone[] = [];
  for (let i = 0; i < nPods; i++) {
    const pod = rig.bone();
    rig.add(cyl(1.6, 2.2, 6, 6), invaderLight, { bone: pod, m: T(0, -3, 0) });
    rig.add(new THREE.ConeGeometry(2.2, 3, 6).rotateX(Math.PI), dark, { bone: pod, m: T(0, -4.5, 0) });
    pods.push(pod);
  }

  // --- Bolts: half invader red, half defender blue ---
  const bolts: Bolt[] = [];
  for (let i = 0; i < nBolts; i++) {
    const bone = rig.bone();
    const colour = i % 2 === 0 ? boltRed : boltBlue;
    rig.add(box(0.9, 0.9, BOLT_LEN), colour, { bone, layer: 'glow', m: T(0, 0, -BOLT_LEN / 2) });
    bone.scale.setScalar(0);
    bolts.push({ bone, from: new THREE.Vector3(), to: new THREE.Vector3(), t0: 0, dur: 1, live: false, colour });
  }

  rig.build(kit.group, RADIUS, HEIGHT);

  // --- Particles ---
  const fire = brush({ life: 1.3, size0: 10, size1: 30, c0: col(0xfff0b0), c1: col(0xc02810), alpha: boost, keep: 0.25, lift: 8 });
  const spark = brush({ life: 0.5, size0: 6, size1: 2, c0: col(0xffffff), c1: col(0xffa040), alpha: boost, keep: 0.3, lift: -20 });
  const flash = brush({ life: 0.25, size0: 40, size1: 70, c0: col(0xfff4d0), c1: col(0xff8030), alpha: boost * 0.9 });
  const blackSmoke = brush({ life: 16, size0: 14, size1: 120, c0: col(0x1e1a18), c1: mix(0x48423e, palette.horizon, 0.2), alpha: 0.9, keep: 0.6, lift: 5 });
  const shellSmoke = brush({ life: 6, size0: 14, size1: 55, c0: col(0x3a3430), c1: mix(0x6a6058, palette.horizon, 0.5), alpha: 0.7, keep: 0.4, lift: 3 });
  const dust = brush({ life: 3.5, size0: 8, size1: 34, c0: shade(sand, 1.05), c1: mix(palette.sand, palette.horizon, 0.5), alpha: 0.6, keep: 0.35, lift: 1 });

  // --- Animation ---
  const evt = mulberry32(opts.seed ^ 0xba771e);
  const V = new THREE.Vector3();
  const D = new THREE.Vector3();
  const FWD = new THREE.Vector3(0, 0, 1);
  const shooters = new Float32Array(nStriders + nTanks + nTurrets);
  for (let i = 0; i < shooters.length; i++) shooters[i] = evt() * FIRE_EVERY * 4;
  let nextShell = 1;
  let smokeAcc = 0;
  const smokeStep = hi ? SMOKE_STEP : SMOKE_STEP * 2;
  let boltNext = 0;
  const shieldHits = new Float32Array(4 * 4);
  let shieldHitNext = 0;
  const striderPos = striders.map(() => new THREE.Vector3());
  const tankPos = tanks.map(() => new THREE.Vector3());
  const white = col(0xffffff);
  const jet = col(0xffc070);

  function explode(x: number, z: number, big: boolean): void {
    const n = big ? 14 : 6;
    glow.emit(flash, x, 6, z, 0, 0, 0);
    for (let k = 0; k < n; k++) {
      const a = evt() * Math.PI * 2;
      const sp = (big ? 14 : 8) * (0.4 + evt());
      glow.emit(fire, x + Math.cos(a) * 3, 3 + evt() * 4, z + Math.sin(a) * 3, Math.cos(a) * sp, 10 + evt() * 16, Math.sin(a) * sp);
      glow.emit(spark, x, 2, z, Math.cos(a) * sp * 3, 20 + evt() * 30, Math.sin(a) * sp * 3);
    }
    for (let k = 0; k < (big ? 8 : 1); k++) {
      const a = evt() * Math.PI * 2;
      smoke.emit(shellSmoke, x, 6 + k * 3, z, Math.cos(a) * 4, 8 + evt() * 8, Math.sin(a) * 4);
      smoke.emit(dust, x, 1.5, z, Math.cos(a) * 24, 1, Math.sin(a) * 24);
    }
  }

  function fire1(from: THREE.Vector3, to: THREE.Vector3, invaderShot: boolean, time: number): void {
    // Even slots are red, odd are blue: search from the rotating cursor for a free slot of the side.
    for (let k = 0; k < nBolts; k++) {
      const i = (boltNext + k) % nBolts;
      const b = bolts[i];
      if (b.live || (i % 2 === 0) !== invaderShot) continue;
      b.from.copy(from);
      b.to.copy(to);
      b.t0 = time;
      b.dur = from.distanceTo(to) / BOLT_SPEED;
      b.live = true;
      boltNext = i + 1;
      return;
    }
  }

  let lampI = 0;
  const lamp = (x: number, y: number, z: number, size: number, c: THREE.Color, a: number) => glow.lamp(lampI++, x, y, z, size, c, a);

  function update(time: number, dt: number): void {
    lampI = 0;
    // Striders: walk their loops, legs in a diagonal gait locked to distance travelled.
    striders.forEach((s, i) => {
      const w = (STRIDER_SPEED / Math.hypot(s.ax, s.az)) * s.dir;
      const a = time * w + s.phase;
      const x = s.cx + Math.sin(a) * s.ax;
      const z = s.cz + Math.cos(a) * s.az;
      const vx = Math.cos(a) * s.ax * w;
      const vz = -Math.sin(a) * s.az * w;
      const g = ((time * STRIDER_SPEED) / STRIDE) * Math.PI * 2 + i;
      s.holder.position.set(x, Math.abs(Math.sin(g)) * 0.8, z);
      s.holder.rotation.set(0, Math.atan2(vx, vz), Math.sin(g) * 0.02);
      striderPos[i].set(x, HIP_Y + 10, z);
      for (let l = 0; l < 4; l++) {
        const ph = g + (l === 0 || l === 3 ? 0 : Math.PI);
        // Yawing a left leg forward is the opposite sense to yawing a right one.
        const swing = Math.sin(ph) * HIP_SWING * (l % 2 === 0 ? 1 : -1);
        const lift = Math.max(0, Math.cos(ph)) * LEG_LIFT;
        s.hips[l].rotation.set(0, s.hips[l].userData.base + swing, lift);
        s.shins[l].rotation.z = -lift * 1.6;
      }
      // Head tracks the shield dome.
      s.head.rotation.y = Math.atan2(0 - x, SHIELD_Z - z) - s.holder.rotation.y;
    });
    tanks.forEach((t, i) => {
      const w = TANK_SPEED / Math.hypot(t.ax, t.az);
      const a = time * w + t.phase;
      const x = t.cx + Math.sin(a) * t.ax;
      const z = t.cz + Math.sin(a * 2) * t.az * 0.5;
      const vx = Math.cos(a) * t.ax;
      const vz = Math.cos(a * 2) * t.az;
      t.holder.position.set(x, TANK_HOVER + Math.sin(time * 2 + i) * 0.4, z);
      const yaw = Math.atan2(vx, vz);
      t.holder.rotation.set(Math.sin(time * 1.3 + i) * 0.03, yaw, Math.sin(time * 1.7 + i) * 0.04);
      const tgt = turrets[i % turrets.length].pos;
      t.turret.rotation.y = Math.atan2(tgt.x - x, tgt.z - z) - yaw;
      tankPos[i].set(x, TANK_HOVER + 4, z);
    });
    turrets.forEach((tu, i) => {
      const tgt = i % 2 === 0 ? striderPos[i % nStriders] : tankPos[i % nTanks];
      tu.yaw.rotation.y = Math.atan2(tgt.x - tu.pos.x, tgt.z - tu.pos.z);
    });
    // Dropship: hold station with a slow drift and lazy yaw.
    dropHolder.position.set(60 + Math.sin(time * 0.07) * 40, DROP_Y + Math.sin(time * 0.5) * 2.5, 170 + Math.cos(time * 0.05) * 25);
    dropHolder.rotation.set(0, Math.PI + Math.sin(time * 0.05) * 0.5, Math.sin(time * 0.4) * 0.03);
    drop.lift.scale.set(1, 0.7 + 0.1 * Math.sin(time * 31), 1);
    drop.main.scale.set(1, 1, 0.001);
    shieldBone.scale.setScalar(1 + Math.sin(time * 3) * 0.006);

    rig.sync();

    // Pods: dropped from the ship's belly, fall on a smoke streak, slam into the dunes.
    pods.forEach((pod, i) => {
      const pt = fract(time / POD_CYCLE + i / nPods) * POD_CYCLE;
      const startX = 60 + Math.sin((time - pt) * 0.07) * 40 + (i - 1) * 14;
      const startZ = 170 + Math.cos((time - pt) * 0.05) * 25;
      if (pt < POD_FALL) {
        const u = pt / POD_FALL;
        const y = (DROP_Y - 6) * (1 - u * u);
        pod.position.set(startX, y, startZ - u * 30);
        pod.rotation.set(-0.3, 0, 0);
        pod.scale.setScalar(1);
        if (fract(time * POD_TRAIL_RATE) < fract((time - dt) * POD_TRAIL_RATE)) smoke.emit(dust, startX, y + 6, startZ - u * 30, 0, 2, 0);
      } else {
        if (dt > 0 && pt - dt < POD_FALL) explode(startX, startZ - 30, false);
        pod.position.set(startX, 0, startZ - 30);
        pod.rotation.set(0.25, 0, 0.2);
        pod.scale.setScalar(pt < POD_CYCLE - 0.5 ? 1 : 0);
      }
    });

    // Fire control: every shooter fires on its own jittered clock.
    if (dt > 0) {
      for (let s = 0; s < shooters.length; s++) {
        shooters[s] -= dt;
        if (shooters[s] > 0) continue;
        shooters[s] = FIRE_EVERY * (1.5 + evt() * 4);
        if (s < nStriders) {
          const st = striders[s];
          rig.local(st.head, 0, 2, 12, V);
          D.set((evt() - 0.5) * 50, 2 + evt() * 30, SHIELD_Z + (evt() - 0.2) * 40);
          fire1(V, D, true, time);
        } else if (s < nStriders + nTanks) {
          const t = tanks[s - nStriders];
          rig.local(t.turret, 0, 1, 7, V);
          const tg = turrets[(s + 1) % turrets.length].pos;
          D.set(tg.x + (evt() - 0.5) * 30, 0, tg.z + (evt() - 0.5) * 20);
          fire1(V, D, true, time);
        } else {
          const tu = turrets[s - nStriders - nTanks];
          rig.local(tu.yaw, 0, 2.4, 7, V);
          const tg = (s % 2 === 0 ? striderPos : tankPos)[s % (s % 2 === 0 ? nStriders : nTanks)];
          D.set(tg.x + (evt() - 0.5) * 30, Math.max(0, tg.y + (evt() - 0.5) * 20), tg.z + (evt() - 0.5) * 20);
          fire1(V, D, false, time);
        }
        glow.emit(spark, V.x, V.y, V.z, 0, 0, 0);
      }
      nextShell -= dt;
      if (nextShell <= 0) {
        nextShell = SHELL_EVERY * (0.5 + evt());
        explode((evt() - 0.5) * 460, -70 + evt() * 280, true);
      }
      smokeAcc += dt;
      while (smokeAcc > smokeStep) {
        smokeAcc -= smokeStep;
        for (const w of wrecks) {
          smoke.emit(blackSmoke, w.x + (evt() - 0.5) * 6, 6, w.z + (evt() - 0.5) * 6, (evt() - 0.5) * 2, 14 + evt() * 6, (evt() - 0.5) * 2);
          if (evt() < 0.4) glow.emit(fire, w.x + (evt() - 0.5) * 8, 3, w.z + (evt() - 0.5) * 8, 0, 6, 0);
        }
      }
    }

    // Bolts in flight.
    for (const b of bolts) {
      if (!b.live) {
        b.bone.scale.setScalar(0);
        lamp(0, -1000, 0, 0, b.colour, 0);
        continue;
      }
      const u = (time - b.t0) / b.dur;
      if (u >= 1 || u < 0) {
        b.live = false;
        b.bone.scale.setScalar(0);
        lamp(0, -1000, 0, 0, b.colour, 0);
        if (u >= 1 && dt > 0) {
          const onShield = b.colour === boltRed && b.to.distanceTo(V.set(0, 0, SHIELD_Z)) < SHIELD_R + 8;
          if (onShield) {
            // Shots on the dome splash on its surface instead of reaching the ground.
            D.subVectors(b.to, V).setY(Math.abs(b.to.y) + 10).normalize().multiplyScalar(SHIELD_R).add(V);
            const h = shieldHitNext++ % 4;
            shieldHits[h * 4] = D.x;
            shieldHits[h * 4 + 1] = D.y;
            shieldHits[h * 4 + 2] = D.z;
            shieldHits[h * 4 + 3] = 1;
            for (let k = 0; k < 4; k++) glow.emit(spark, D.x, D.y, D.z, (evt() - 0.5) * 30, evt() * 20, (evt() - 0.5) * 30);
          } else explode(b.to.x, b.to.z, false);
        }
        continue;
      }
      V.lerpVectors(b.from, b.to, u);
      D.subVectors(b.to, b.from).normalize();
      b.bone.position.copy(V);
      b.bone.quaternion.setFromUnitVectors(FWD, D);
      b.bone.scale.setScalar(1);
      lamp(V.x, V.y, V.z, 9, b.colour, 0.9 * boost);
    }

    for (let h = 0; h < 4; h++) {
      const a = shieldHits[h * 4 + 3];
      lamp(shieldHits[h * 4], shieldHits[h * 4 + 1], shieldHits[h * 4 + 2], 30 * a + 1, shieldCol, a * boost);
      shieldHits[h * 4 + 3] = Math.max(0, a - dt * 2.5);
    }
    striders.forEach((s) => {
      rig.local(s.head, 0, 2.6, 6.2, V);
      lamp(V.x, V.y, V.z, 5, red, (0.7 + 0.3 * Math.sin(time * 5)) * boost);
      rig.local(s.holder, 0, HIP_Y + 1, -10, V);
      lamp(V.x, V.y, V.z, 6, red, fract(time * 0.8) < 0.2 ? boost : 0.2);
    });
    tanks.forEach((t) => {
      rig.local(t.holder, 0, -0.5, 0, V);
      lamp(V.x, V.y, V.z, 12, red, 0.35 * boost);
    });
    turrets.forEach((tu, i) => lamp(tu.pos.x, tu.pos.y + 2, tu.pos.z, 4, i % 2 ? white : boltBlue, (fract(time + i * 0.21) < 0.3 ? 1 : 0.3) * boost));
    for (const n of drop.liftNozzles) {
      rig.local(drop.body, n.x, n.y - 4, n.z, V);
      lamp(V.x, V.y, V.z, 16, jet, 0.8 * boost);
    }
    while (lampI < glow.fixed) lamp(0, -1000, 0, 0, white, 0);

    glow.update(dt);
    smoke.update(dt);
  }

  return { group: kit.group, radius: RADIUS, update, dispose: () => disposeKit(kit) };
}

/** Wreck smoke emission tick, seconds (low quality emits half as often). */
const SMOKE_STEP = 0.12;
/** Base opacity of the shield dome. */
const SHIELD_ALPHA = 0.1;

interface StriderColours {
  invader: THREE.Color;
  invaderLight: THREE.Color;
  red: THREE.Color;
  dark: THREE.Color;
}

/**
 * A siege strider: an armoured hull slung between four tall arched legs (knees above the
 * hull, like a harvestman), a gun head with a red sensor slit. ~45 m tall.
 */
function buildStrider(
  rig: Rig,
  c: StriderColours,
  path: { cx: number; cz: number; ax: number; az: number; phase: number; dir: number },
): Strider {
  const holder = rig.bone();
  rig.add(cyl(0.75, 1, 8, 6).rotateY(Math.PI / 6).scale(9, 1, 12), c.invader, { bone: holder, m: T(0, HIP_Y - 4, 0) });
  rig.add(cyl(0.5, 0.8, 4, 6).rotateY(Math.PI / 6).scale(7, 1, 9), c.invaderLight, { bone: holder, m: T(0, HIP_Y + 4, -1) });
  rig.add(cyl(3, 5, 6, 6), c.dark, { bone: holder, m: T(0, HIP_Y - 10, 0) });
  rig.add(box(2, 6, 2), c.invaderLight, { bone: holder, m: T(0, HIP_Y + 9, -8, -0.3) });
  const head = rig.bone(holder, 0, HIP_Y + 6, 8);
  rig.add(cyl(0.6, 1, 5, 5).rotateY(Math.PI / 5).scale(5, 1, 7), c.invaderLight, { bone: head });
  rig.add(box(6, 0.8, 0.6), c.red, { bone: head, m: T(0, 2.6, 6.2), layer: 'glow' });
  for (const dx of [-2.2, 2.2]) rig.add(cyl(0.5, 0.7, 12, 5).rotateX(Math.PI / 2), c.dark, { bone: head, m: T(dx, 1.2, 4) });
  const hips: THREE.Bone[] = [];
  const shins: THREE.Bone[] = [];
  const corners = [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const;
  for (const [sx, sz] of corners) {
    const hip = rig.bone(holder, sx * 7, HIP_Y - 2, sz * 8);
    // Each leg's frame points outward and a little forward/back, so the stance is wide.
    hip.userData.base = Math.atan2(-sz * 0.7, sx);
    hip.rotation.y = hip.userData.base;
    const thighA = new THREE.Vector3(0, 0, 0);
    const knee = new THREE.Vector3(THIGH_X, THIGH_Y, 0);
    rig.add(strut(), c.invader, { bone: hip, m: between(thighA, knee, 3.4) });
    rig.add(box(5, 3, 3), c.invaderLight, { bone: hip, m: T(THIGH_X * 0.5, THIGH_Y * 0.5 + 1.5, 0, 0, 0, Math.atan2(THIGH_Y, THIGH_X)) });
    const shin = rig.bone(hip, THIGH_X, THIGH_Y, 0);
    const foot = new THREE.Vector3(SHIN_X, -(HIP_Y - 2 + THIGH_Y), 0);
    rig.add(strut(), c.dark, { bone: shin, m: between(new THREE.Vector3(), foot, 2.8) });
    rig.add(cyl(3, 1.8, 2.5, 5), c.invader, { bone: shin, m: T(foot.x, foot.y, 0) });
    rig.add(rock(2.4), c.invaderLight, { bone: shin });
    hips.push(hip);
    shins.push(shin);
  }
  return { holder, head, hips, shins, ...path };
}
