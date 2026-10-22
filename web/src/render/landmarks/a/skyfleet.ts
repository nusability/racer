// Sky fleet: a spectator armada parked over the course. Two long pavilion airships and two
// terrace barges drift on slow loops at 150–400 m, hung with banners and strings of lights,
// their searchlights sweeping the sand below. Runabouts dart between them, and the barges
// send up fireworks. The group origin is on the ground beneath the fleet.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { buildSkiff, craftColours, type Craft } from './craft.ts';
import {
  T,
  addBeam,
  bezier,
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
  shade,
  smooth,
  type Rig,
} from './kit.ts';

const RADIUS = 320;
const HEIGHT = 440;

const AIRSHIP_LEN = 170;
const AIRSHIP_R = 24;
const BARGE_W = 56;
const BARGE_L = 120;

const DRIFT_PERIOD = 260;
const HOP_TIME = 7;
const HOP_PAUSE = 1.5;
const FIREWORK_EVERY = 2.6;
const FIREWORK_RISE = 1.6;
const FIREWORK_SPARKS = 36;
/** Rockets that can be climbing at once. */
const MAX_ROCKETS = 4;
const SEARCH_SWEEP = 0.25;
const SEARCH_ALPHA = 0.09;
const PROP_SPIN = 9;
const LIGHT_STRING = 10;
/** Ships kept on low quality (the first of the layout). */
const LOW_SHIPS = 3;

interface Ship {
  holder: THREE.Bone;
  cx: number;
  cz: number;
  alt: number;
  orbit: number;
  phase: number;
  /** Local offsets where runabouts touch down. */
  dock: THREE.Vector3;
  props: THREE.Bone[];
  banners: THREE.Bone[];
  searches: THREE.Bone[];
  /** Local light-string points and fixed lamp offsets. */
  lights: THREE.Vector3[];
  barge: boolean;
}

export function createSkyfleet(opts: LandmarkOptions): Landmark {
  const { palette, quality } = opts;
  const hi = quality === 'high';
  const rng = mulberry32(opts.seed ^ 0x5c1f);
  const boost = glowBoost(palette);
  const nSkiffs = hi ? 6 : 3;
  const lampCount = 4 * LIGHT_STRING + nSkiffs * 2 + 8;
  const kit = makeKit(lampCount + (hi ? 320 : 150), lampCount, hi ? 60 : 30);
  const { rig, glow, smoke } = kit;

  const envelope = mix(0xf2ece0, palette.sand, 0.15);
  const envelopeAlt = mix(palette.accent, 0xf2ece0, 0.35);
  const hullCol = mix(0x6a6460, palette.rock, 0.3);
  const brass = col(0xd8a850);
  const accent = col(palette.accent);
  const cream = col(0xfff4e0);
  const dark = col(0x2e2c30);
  const windowCol = col(0xffe0a0);
  const beamCol = mix(0xfff6e0, palette.sun, 0.3);
  const crowd = [col(0xe84a3a), col(0x3a8ae8), col(0xf0d040), col(0xf0f0f0), col(0x40c080), accent];

  const ships: Ship[] = [];
  const layout = [
    { barge: false, x: -150, z: 80, alt: 330 },
    { barge: true, x: 90, z: -20, alt: 190 },
    { barge: false, x: 170, z: 170, alt: 390 },
    { barge: true, x: -60, z: 230, alt: 250 },
  ];
  for (const L of layout.slice(0, hi ? layout.length : LOW_SHIPS)) {
    const holder = rig.bone();
    const ship: Ship = {
      holder,
      cx: L.x + (rng() - 0.5) * 40,
      cz: L.z + (rng() - 0.5) * 40,
      alt: L.alt + (rng() - 0.5) * 30,
      orbit: 30 + rng() * 40,
      phase: rng() * Math.PI * 2,
      dock: new THREE.Vector3(),
      props: [],
      banners: [],
      searches: [],
      lights: [],
      barge: L.barge,
    };
    if (L.barge) buildBarge(rig, ship, { hullCol, brass, accent, cream, dark, windowCol, beamCol, crowd }, rng);
    else buildAirship(rig, ship, { envelope, envelopeAlt, hullCol, brass, accent, cream, dark, windowCol, beamCol }, rng);
    ships.push(ship);
  }

  const barges = ships.filter((s) => s.barge);
  const skiffs: { holder: THREE.Bone; craft: Craft; from: number; to: number; offset: number }[] = [];
  for (let i = 0; i < nSkiffs; i++) {
    const holder = rig.bone();
    const craft = buildSkiff(rig, holder, 1.6, craftColours(i % 2 ? cream : mix(palette.accent, 0xffffff, 0.2), i % 2 ? accent : brass));
    skiffs.push({ holder, craft, from: i % ships.length, to: (i + 1 + (i % 2)) % ships.length, offset: (i / nSkiffs) * (HOP_TIME + HOP_PAUSE) * 2 });
  }

  rig.build(kit.group, RADIUS, HEIGHT);

  const sparkCols = [col(0xffd060), col(0xff5080), col(0x60e0ff), mix(palette.accent, 0xffffff, 0.3), col(0xffffff)];
  const sparkBrushes = sparkCols.map((c) => brush({ life: 2.2, size0: 7, size1: 3, c0: shade(c, 1.2), c1: c, alpha: boost, keep: 0.35, lift: -9 }));
  const rocket = brush({ life: 0.35, size0: 4, size1: 2, c0: col(0xfff0c0), c1: col(0xff9040), alpha: boost });
  const puff = brush({ life: 4, size0: 6, size1: 26, c0: col(0xf0ece8), c1: mix(0xffffff, palette.horizon, 0.6), alpha: 0.35, keep: 0.6, lift: 0.5 });

  const evt = mulberry32(opts.seed ^ 0xf1e);
  const V = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  const D = new THREE.Vector3();
  const prev = skiffs.map(() => new THREE.Vector3());
  const dockWorld = ships.map(() => new THREE.Vector3());
  const yawOf = new Float32Array(ships.length);
  let lampI = 0;
  const lamp = (x: number, y: number, z: number, size: number, c: THREE.Color, a: number) => glow.lamp(lampI++, x, y, z, size, c, a);
  let fireworkT = 1;
  const rockets: { x: number; y: number; z: number; t: number; c: number }[] = Array.from({ length: MAX_ROCKETS }, () => ({ x: 0, y: 0, z: 0, t: -1, c: 0 }));
  const white = col(0xffffff);
  const green = col(0x60ff90);
  const red = col(0xff4030);

  function update(time: number, dt: number): void {
    lampI = 0;
    ships.forEach((s, i) => {
      const a = (time / DRIFT_PERIOD) * Math.PI * 2 * (i % 2 ? 1 : -1) + s.phase;
      const x = s.cx + Math.cos(a) * s.orbit;
      const z = s.cz + Math.sin(a) * s.orbit;
      // Nose follows the loop's tangent, turned gently so the fleet seems to hold formation.
      const yaw = Math.atan2(-Math.sin(a), Math.cos(a)) * (i % 2 ? 1 : -1) * 0.35 + (s.barge ? 0.4 : -0.3);
      s.holder.position.set(x, s.alt + Math.sin(time * 0.4 + i) * 2.5, z);
      s.holder.rotation.set(Math.sin(time * 0.3 + i) * 0.015, yaw, Math.sin(time * 0.23 + i * 2) * 0.02);
      yawOf[i] = yaw;
      for (const p of s.props) p.rotation.z = time * PROP_SPIN;
      s.banners.forEach((b, k) => {
        b.rotation.x = Math.sin(time * 1.1 + k * 0.7 + i) * 0.08;
        b.rotation.z = Math.sin(time * 0.8 + k) * 0.05;
      });
      s.searches.forEach((b, k) => {
        b.rotation.set(Math.sin(time * SEARCH_SWEEP + k * 2 + i) * 0.45, 0, Math.cos(time * SEARCH_SWEEP * 0.8 + k + i) * 0.45);
      });
      V.copy(s.dock).applyAxisAngle(UP, yaw).add(s.holder.position);
      dockWorld[i].copy(V);
    });

    // Runabouts: hop dock to dock on a lofted arc, pause, then fly the next leg back.
    skiffs.forEach((sk, i) => {
      const leg = HOP_TIME + HOP_PAUSE;
      const t = (time + sk.offset) % (leg * 2);
      const out = t < leg;
      const lt = out ? t : t - leg;
      const u = smooth(Math.min(1, lt / HOP_TIME));
      const a = dockWorld[out ? sk.from : sk.to];
      const b = dockWorld[out ? sk.to : sk.from];
      A.copy(a);
      D.copy(b);
      B.copy(a).lerp(b, 0.25).setY(Math.max(a.y, b.y) + 50 + i * 6);
      C.copy(a).lerp(b, 0.75).setY(Math.max(a.y, b.y) + 30);
      bezier(A, B, C, D, u, V);
      const body = sk.holder;
      body.position.copy(V);
      const p = prev[i];
      const dx = V.x - p.x;
      const dz = V.z - p.z;
      if (dx * dx + dz * dz > 0.01) body.rotation.set(-Math.atan2(V.y - p.y, Math.hypot(dx, dz)) * 0.6, Math.atan2(dx, dz), 0, 'YXZ');
      p.copy(V);
      const thrust = lt < HOP_TIME ? 1 : 0;
      sk.craft.main.scale.set(1, 1, Math.max(0.001, thrust * (0.8 + 0.2 * Math.sin(time * 40 + i))));
    });

    rig.sync();

    ships.forEach((s) => {
      s.lights.forEach((l, k) => {
        rig.local(s.holder, l.x, l.y, l.z, V);
        const chase = fract(time * 0.5 - k / s.lights.length) < 0.5;
        lamp(V.x, V.y, V.z, 4, k % 3 === 0 ? windowCol : k % 3 === 1 ? accent : cream, (chase ? 0.95 : 0.4) * boost);
      });
    });
    skiffs.forEach((sk, i) => {
      rig.local(sk.craft.body, 0, 2, -5, V);
      lamp(V.x, V.y, V.z, 7 * sk.craft.main.scale.z, windowCol, 0.9 * boost);
      rig.local(sk.craft.body, 0, 4, -4, V);
      lamp(V.x, V.y, V.z, 3.5, i % 2 ? green : red, fract(time * 1.4 + i * 0.3) < 0.2 ? boost : 0.3);
      if (sk.craft.main.scale.z > 0.5 && dt > 0 && evt() < 0.2) smoke.emit(puff, V.x, V.y, V.z, 0, 0, 0);
    });

    // Fireworks from the barges' decks.
    if (dt > 0) {
      fireworkT -= dt;
      if (fireworkT <= 0) {
        fireworkT = FIREWORK_EVERY * (0.4 + evt());
        const r = rockets.find((k) => k.t < 0);
        if (r && barges.length) {
          const s = barges[Math.floor(evt() * barges.length)];
          rig.local(s.holder, (evt() - 0.5) * BARGE_W, 14, (evt() - 0.5) * BARGE_L * 0.6, V);
          r.x = V.x;
          r.y = V.y;
          r.z = V.z;
          r.t = 0;
          r.c = Math.floor(evt() * sparkBrushes.length);
        }
      }
    }
    for (const r of rockets) {
      if (r.t < 0) {
        lamp(0, -1000, 0, 0, white, 0);
        continue;
      }
      r.t += dt;
      const y = r.y + (r.t / FIREWORK_RISE) * FIREWORK_HEIGHT * (2 - r.t / FIREWORK_RISE);
      lamp(r.x, y, r.z, 5, windowCol, boost);
      if (dt > 0) glow.emit(rocket, r.x, y, r.z, 0, -10, 0);
      if (r.t >= FIREWORK_RISE) {
        const b = sparkBrushes[r.c];
        for (let k = 0; k < FIREWORK_SPARKS; k++) {
          // Even burst: points on a sphere from a golden-angle spiral, plus a little jitter.
          const zf = 1 - (2 * (k + 0.5)) / FIREWORK_SPARKS;
          const rr = Math.sqrt(1 - zf * zf);
          const phi = k * GOLDEN_ANGLE;
          const sp = FIREWORK_SPEED * (0.9 + evt() * 0.2);
          glow.emit(b, r.x, y, r.z, Math.cos(phi) * rr * sp, zf * sp, Math.sin(phi) * rr * sp);
        }
        r.t = -1;
      }
    }
    while (lampI < glow.fixed) lamp(0, -1000, 0, 0, white, 0);
    glow.update(dt);
    smoke.update(dt);
  }

  return { group: kit.group, radius: RADIUS, update, dispose: () => disposeKit(kit) };
}

const UP = new THREE.Vector3(0, 1, 0);
const FIREWORK_HEIGHT = 110;
const FIREWORK_SPEED = 38;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface ShipColours {
  hullCol: THREE.Color;
  brass: THREE.Color;
  accent: THREE.Color;
  cream: THREE.Color;
  dark: THREE.Color;
  windowCol: THREE.Color;
  beamCol: THREE.Color;
}

/** A banner: a bone at the hanging point, a long cloth strip with a chevron and a weight bar. */
function addBanner(rig: Rig, ship: Ship, x: number, y: number, z: number, len: number, c: THREE.Color, trim: THREE.Color): void {
  const b = rig.bone(ship.holder, x, y, z);
  rig.add(box(10, len, 0.4), c, { bone: b, m: T(0, -len / 2, 0) });
  rig.add(box(10.2, 3, 0.5), trim, { bone: b, m: T(0, -len * 0.3, 0) });
  rig.add(new THREE.ConeGeometry(5.6, 7, 3).rotateZ(Math.PI).scale(1, 1, 0.1), c, { bone: b, m: T(0, -len - 3, 0) });
  ship.banners.push(b);
}

function addSearchlight(rig: Rig, ship: Ship, x: number, y: number, z: number, c: ShipColours): void {
  const b = rig.bone(ship.holder, x, y, z);
  rig.add(cyl(2, 1.4, 3, 6).rotateX(Math.PI), c.dark, { bone: b, m: T(0, 1.5, 0) });
  rig.add(cyl(1.6, 1.6, 0.3, 6), c.windowCol, { bone: b, m: T(0, -1.6, 0), layer: 'glow' });
  addBeam(rig, ship.alt * 1.15, 26, c.beamCol, SEARCH_ALPHA, { bone: b, m: T(0, -1.6, 0) });
  ship.searches.push(b);
}

/** A long pavilion airship: lathed envelope, cruciform tail, gondola, prop pods and banners. */
function buildAirship(
  rig: Rig,
  ship: Ship,
  c: ShipColours & { envelope: THREE.Color; envelopeAlt: THREE.Color },
  rng: () => number,
): void {
  const H = { bone: ship.holder };
  const L = AIRSHIP_LEN;
  const prof: THREE.Vector2[] = [];
  const N = 12;
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    // Blunt nose, long taper to the tail.
    const r = AIRSHIP_R * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.7);
    prof.push(new THREE.Vector2(Math.max(0.01, r), -L / 2 + t * L));
  }
  rig.add(new THREE.LatheGeometry(prof, 10).rotateX(Math.PI / 2), c.envelope, H);
  // Painted bands around the envelope.
  for (const z of [-L * 0.28, L * 0.05, L * 0.3]) {
    const t = (z + L / 2) / L;
    const r = AIRSHIP_R * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.7) * 1.02;
    rig.add(new THREE.CylinderGeometry(r, r, 7, 10, 1, true).rotateX(Math.PI / 2), c.envelopeAlt, { bone: ship.holder, m: T(0, 0, z) });
  }
  for (let k = 0; k < 4; k++) {
    rig.add(box(1.2, 26, 22), c.envelopeAlt, { bone: ship.holder, m: T(0, 0, -L / 2 + 18, 0, 0, (k * Math.PI) / 2).multiply(T(0, AIRSHIP_R * 0.6, 0)) });
  }
  // Gondola with lit windows.
  const gy = -AIRSHIP_R - 5;
  rig.add(cyl(0.7, 1, 9, 6).rotateX(Math.PI / 2).scale(9, 1, 1), c.hullCol, { bone: ship.holder, m: T(0, gy - 4.5, -25) });
  rig.add(box(10, 6, 52), c.hullCol, { bone: ship.holder, m: T(0, gy, 0) });
  rig.add(box(10.4, 1.6, 46), c.windowCol, { bone: ship.holder, m: T(0, gy + 0.6, 0), layer: 'glow' });
  rig.add(box(12, 1, 54), c.brass, { bone: ship.holder, m: T(0, gy + 3.4, 0) });
  // Prop pods on outriggers.
  for (const side of [-1, 1]) {
    for (const z of [-20, 30]) {
      rig.add(box(18, 1.4, 3), c.dark, { bone: ship.holder, m: T(side * 18, -AIRSHIP_R * 0.5, z) });
      rig.add(cyl(3, 3.6, 12, 8).rotateX(-Math.PI / 2), c.hullCol, { bone: ship.holder, m: T(side * 27, -AIRSHIP_R * 0.5, z + 6) });
      const prop = rig.bone(ship.holder, side * 27, -AIRSHIP_R * 0.5, z - 6.5);
      rig.add(box(16, 1.4, 0.4), c.dark, { bone: prop });
      rig.add(box(1.4, 16, 0.4), c.dark, { bone: prop });
      ship.props.push(prop);
    }
  }
  for (let k = 0; k < 5; k++) addBanner(rig, ship, (k % 2 ? 1 : -1) * 7, gy - 3, -20 + k * 10, 36 + rng() * 14, k % 2 ? c.accent : c.cream, k % 2 ? c.cream : c.accent);
  addSearchlight(rig, ship, 0, gy - 4, 24, c);
  addSearchlight(rig, ship, 0, gy - 4, -26, c);
  for (let k = 0; k < LIGHT_STRING; k++) {
    const t = 0.08 + (k / (LIGHT_STRING - 1)) * 0.84;
    const r = AIRSHIP_R * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.7);
    ship.lights.push(new THREE.Vector3(0, r + 0.5, -L / 2 + t * L));
  }
  ship.dock.set(0, AIRSHIP_R + 2, 10);
}

/** A terrace barge: a keeled deck with tiered spectator stands, a canopy, masts and hover pods. */
function buildBarge(
  rig: Rig,
  ship: Ship,
  c: ShipColours & { crowd: THREE.Color[] },
  rng: () => number,
): void {
  const W = BARGE_W;
  const L = BARGE_L;
  rig.add(cyl(0.6, 1, 10, 6).rotateY(Math.PI / 6).scale(W / 2, 1, L / 2), c.hullCol, { bone: ship.holder, m: T(0, -10, 0) });
  rig.add(box(W + 2, 1.5, L + 2), c.brass, { bone: ship.holder, m: T(0, 0.5, 0) });
  rig.add(cyl(0.2, 1, 14, 6).rotateX(Math.PI).rotateY(Math.PI / 6).scale(W / 3, 1, L / 3), c.dark, { bone: ship.holder, m: T(0, -10, 0) });
  // Tiered stands along both long sides, packed with a crowd of colour.
  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 4; tier++) {
      const x = side * (W / 2 - 4 - tier * 4);
      rig.add(box(4, 1.2 + tier * 1.8, L * 0.8), c.hullCol, { bone: ship.holder, m: T(x, 1.2 + tier * 0.9, 0) });
      for (let k = 0; k < 12; k++) {
        const col = c.crowd[Math.floor(rng() * c.crowd.length)];
        rig.add(box(2.6, 1.6, 6.6), col, { bone: ship.holder, m: T(x, 2.4 + tier * 1.8, -L * 0.38 + k * 6.9) });
      }
    }
  }
  // Canopy on poles over the centre deck.
  rig.add(new THREE.ConeGeometry(W * 0.36, 9, 6).scale(1, 1, 2.2).rotateY(Math.PI / 6), c.accent, { bone: ship.holder, m: T(0, 18, 0) });
  for (const [x, z] of [[-10, -28], [10, -28], [-10, 28], [10, 28]] as const) rig.add(cyl(0.5, 0.5, 14, 4), c.dark, { bone: ship.holder, m: T(x, 1, z) });
  // Masts with flags fore and aft.
  for (const z of [-L / 2 + 4, L / 2 - 4]) {
    rig.add(cyl(0.6, 0.8, 30, 5), c.dark, { bone: ship.holder, m: T(0, 1, z) });
    const flag = rig.bone(ship.holder, 0, 27, z);
    rig.add(box(0.3, 7, 14), c.accent, { bone: flag, m: T(0, 0, z > 0 ? -7 : 7) });
    ship.banners.push(flag);
  }
  // Hover pods glowing underneath.
  for (const [x, z] of [[-W / 2, -L / 3], [W / 2, -L / 3], [-W / 2, L / 3], [W / 2, L / 3]] as const) {
    rig.add(cyl(6, 7, 6, 8), c.dark, { bone: ship.holder, m: T(x, -8, z) });
    rig.add(cyl(5, 5, 0.4, 8), c.windowCol, { bone: ship.holder, m: T(x, -8.3, z), layer: 'glow' });
  }
  for (let k = 0; k < 4; k++) addBanner(rig, ship, (k % 2 ? 1 : -1) * (W / 2 + 1), 0, -30 + k * 20, 30 + rng() * 12, k % 2 ? c.accent : c.cream, k % 2 ? c.cream : c.accent);
  addSearchlight(rig, ship, 0, -20, 0, c);
  for (let k = 0; k < LIGHT_STRING; k++) {
    const t = k / (LIGHT_STRING - 1);
    const side = k % 2 ? 1 : -1;
    ship.lights.push(new THREE.Vector3(side * (W / 2 + 1), 2, -L / 2 + t * L));
  }
  ship.dock.set(0, 3, L / 2 - 14);
}
