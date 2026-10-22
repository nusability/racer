// Wreck: a colossal crashed starship hulk, half buried. The stern section rears out of the
// dunes with its dead engine bells; the spine is snapped and the bow ploughed nose-down into
// the sand, with bare ribs bridging the break. Smoke still leaks from the wound, scavenger
// crawlers creep over the plating with work lights and welding sparks, a salvage crane turns
// at their camp and drones circle the hulk under a slow-sweeping distress beacon.

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
  type Rng,
} from './kit.ts';

const RADIUS = 250;
const HEIGHT = 150;
/** Hull cross-section: sides, and how much wider than tall it is. */
const HULL_SIDES = 10;
const HULL_SY = 0.72;
/** Stern section (local x from stern to break) and bow section (break to nose). */
const STERN_LEN = 220;
const BOW_LEN = 170;
const HULL_R = 44;

const CRAWLER_SPEED = 0.05;
const DRONE_ALT = 70;
const DRONE_ORBIT = 180;
const BEACON_SPIN = 0.6;
const CRANE_SPIN = 0.12;
const SMOKE_FOG = 0.65;

interface Section {
  /** Local hull frame (x along the hull, y up the cross-section) to landmark space. */
  m: THREE.Matrix4;
  q: THREE.Quaternion;
  len: number;
  /** Radius profile 0..1 along the section. */
  r: (u: number) => number;
}

export function createWreck(opts: LandmarkOptions): Landmark {
  const { palette, quality } = opts;
  const hi = quality === 'high';
  const rng = mulberry32(opts.seed ^ 0x3eec);
  const boost = glowBoost(palette);
  const nCrawlers = hi ? 9 : 4;
  const nDrones = hi ? 6 : 3;
  const lampCount = nCrawlers * 2 + nDrones + 12;
  const kit = makeKit(lampCount + (hi ? 160 : 80), lampCount, hi ? 260 : 120);
  const { rig, glow, smoke } = kit;
  smoke.wind.set(5, 0, 2);
  smoke.setFogScale(SMOKE_FOG);

  const hull = mix(0x9c988e, palette.rock, 0.22);
  const hullDark = shade(hull, 0.72);
  const hullLight = shade(hull, 1.12);
  const rust = mix(palette.rock, 0x5a3018, 0.5);
  const interior = col(0x1c1a1a);
  const stripe = mix(palette.accent, hull, 0.45);
  const sand = col(palette.sand);
  const warm = col(0xffcf80);
  const red = col(0xff3020);
  const weld = col(0xc8e8ff);

  // Stern rears up out of the sand toward −X; the bow kinks off the break and dives.
  const stern: Section = {
    m: T(20, 0, 10, 0.16, 0.06, -0.3),
    q: new THREE.Quaternion(),
    len: STERN_LEN,
    r: (u) => HULL_R * (0.82 + 0.18 * Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5)),
  };
  const bow: Section = {
    m: T(62, -2, 0, -0.1, -0.3, -0.16),
    q: new THREE.Quaternion(),
    len: BOW_LEN,
    r: (u) => HULL_R * 0.95 * Math.pow(1 - u * 0.92, 0.6),
  };
  for (const s of [stern, bow]) s.q.setFromRotationMatrix(s.m);

  // --- Hull shells ---
  rig.add(loft(stern, -STERN_LEN, 0, 12, rng), hull, { m: stern.m });
  rig.add(loft(bow, 0, BOW_LEN, 10, rng), hull, { m: bow.m });
  // Dark interiors showing at the torn ends, and armour belts.
  rig.add(new THREE.CircleGeometry(stern.r(1) * 0.94, HULL_SIDES).rotateY(Math.PI / 2).scale(1, HULL_SY, 1), interior, { m: mul(stern.m, T(-0.5)) });
  rig.add(new THREE.CircleGeometry(bow.r(0) * 0.94, HULL_SIDES).rotateY(-Math.PI / 2).scale(1, HULL_SY, 1), interior, { m: mul(bow.m, T(0.5)) });
  for (const [s, x0, x1] of [[stern, -STERN_LEN, 0], [bow, 0, BOW_LEN * 0.8]] as const) {
    for (let x = x0 + 20; x < x1 - 10; x += 34) {
      const u = (x - x0) / (x1 - x0);
      const r = s.r(s === stern ? (x + STERN_LEN) / STERN_LEN : x / BOW_LEN) * 1.04;
      rig.add(new THREE.CylinderGeometry(r, r, 5, HULL_SIDES, 1, true).rotateZ(Math.PI / 2).scale(1, HULL_SY, 1), u > 0.5 ? hullDark : stripe, { m: mul(s.m, T(x)) });
    }
  }

  // --- Jagged plates around the break, and exposed ribs bridging it ---
  for (let k = 0; k < (hi ? 16 : 9); k++) {
    const a = rng() * Math.PI * 2;
    const r = stern.r(1);
    const p = new THREE.Vector3(-2 + rng() * 10, Math.cos(a) * r * HULL_SY, Math.sin(a) * r);
    rig.add(box(14 + rng() * 10, 1.5, 8 + rng() * 6), rng() < 0.5 ? hullDark : rust, { m: mul(stern.m, T(p.x, p.y, p.z, a, rng() - 0.5, 0.4 + rng() * 0.6)) });
  }
  const ribStart = new THREE.Vector3();
  for (let k = 0; k < 6; k++) {
    // Rib hoops standing out of the break, part-arcs of the old frame.
    const x = 4 + k * 8;
    const arc = Math.PI * (0.55 + rng() * 0.35);
    const g = new THREE.TorusGeometry(HULL_R * (0.92 - k * 0.04), 1.4, 4, 9, arc).rotateY(Math.PI / 2).rotateX(-arc / 2 + Math.PI / 2 + (rng() - 0.5) * 0.4);
    g.scale(1, HULL_SY, 1);
    rig.add(g, k % 2 ? hullDark : rust, { m: mul(stern.m, T(x)) });
  }
  ribStart.set(0, HULL_R * HULL_SY * 0.6, 0).applyMatrix4(stern.m);
  const ribEnd = new THREE.Vector3(0, HULL_R * HULL_SY * 0.4, 0).applyMatrix4(bow.m);
  rig.add(strut(), hullDark, { m: between(ribStart, ribEnd, 5) });
  rig.add(strut(), rust, { m: between(ribStart.clone().setZ(ribStart.z + 14), ribEnd.clone().setZ(ribEnd.z + 10), 3) });

  // --- Stern: dead engine bells and a snapped dorsal fin ---
  for (const [y, z, r] of [[0, 0, 15], [-6, -22, 10], [-6, 22, 10], [14, -14, 8], [14, 14, 8]] as const) {
    rig.add(cyl(r, r * 1.35, 22, 10, true).rotateZ(Math.PI / 2), hullDark, { m: mul(stern.m, T(-STERN_LEN - 20, y, z)) });
    rig.add(new THREE.CircleGeometry(r * 0.9, 10).rotateY(-Math.PI / 2), interior, { m: mul(stern.m, T(-STERN_LEN - 6, y, z)) });
  }
  rig.add(cyl(HULL_R * 0.8, HULL_R * 0.95, 12, HULL_SIDES).rotateZ(Math.PI / 2).scale(1, HULL_SY, 1), hullDark, { m: mul(stern.m, T(-STERN_LEN + 2)) });
  rig.add(box(70, 46, 3), hullLight, { m: mul(stern.m, T(-150, HULL_R * HULL_SY + 18, 0, 0, 0, 0.35)) });
  rig.add(box(30, 8, 3.4), stripe, { m: mul(stern.m, T(-162, HULL_R * HULL_SY + 30, 0, 0, 0, 0.35)) });
  rig.add(box(20, 30, 2.4), hullLight, { m: mul(stern.m, T(-108, HULL_R * HULL_SY + 4, 0, 0.6, 0, -0.5)) });

  // --- Command tower on the stern's back and the armoured side sponsons that break the tube ---
  const top = HULL_R * HULL_SY;
  rig.add(block(34, 16, 24), hullLight, { m: mul(stern.m, T(-62, top - 4, 0)) });
  rig.add(block(22, 12, 18), hull, { m: mul(stern.m, T(-58, top + 12, 0)) });
  rig.add(box(23, 1.6, 18.4), interior, { m: mul(stern.m, T(-58, top + 19, 0)) });
  rig.add(block(10, 6, 10), hullDark, { m: mul(stern.m, T(-60, top + 24, 0)) });
  rig.add(cyl(0.5, 0.8, 26, 4), hullDark, { m: mul(stern.m, T(-62, top + 30, 3, 0.3, 0, 0.2)) });
  for (const side of [-1, 1]) {
    const len = side < 0 ? 150 : 90;
    const sponson = cyl(0.55, 1, 1, 4).rotateY(Math.PI / 4).rotateZ(Math.PI / 2).scale(len, 16, 22);
    rig.add(sponson, side < 0 ? hullDark : hull, { m: mul(stern.m, T(-200 + len / 2, -HULL_R * 0.18, side * HULL_R * 0.98, side * -0.1)) });
    rig.add(box(len * 0.9, 2, 3), stripe, { m: mul(stern.m, T(-200 + len / 2, -HULL_R * 0.05, side * (HULL_R * 0.98 + 10.5))) });
  }
  // The starboard sponson snapped off: its torn half lies in the sand beside the hull.
  rig.add(cyl(0.55, 1, 1, 4).rotateY(Math.PI / 4).rotateZ(Math.PI / 2).scale(56, 16, 22), hull, { m: T(-40, 6, 78, 0.5, 0.35, 0.12) });

  // --- Greebles: panels, gun blisters, broken masts on the upper hull ---
  for (const s of [stern, bow]) {
    const len = s === stern ? STERN_LEN : BOW_LEN;
    const x0 = s === stern ? -STERN_LEN : 0;
    for (let k = 0; k < (hi ? 46 : 22); k++) {
      const u = 0.05 + rng() * 0.85;
      const x = x0 + u * len;
      const a = (rng() - 0.5) * 2.2;
      const r = s.r(u) * 1.0;
      const y = Math.cos(a) * r * HULL_SY;
      const z = Math.sin(a) * r;
      const kind = rng();
      const tint = kind < 0.2 ? rust : kind < 0.5 ? hullDark : hullLight;
      if (kind < 0.75) rig.add(box(6 + rng() * 18, 2 + rng() * 3, 4 + rng() * 10), tint, { m: mul(s.m, T(x, y, z, a)) });
      else if (kind < 0.9) rig.add(new THREE.SphereGeometry(4 + rng() * 3, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), hullDark, { m: mul(s.m, T(x, y, z, a)) });
      else rig.add(cyl(0.6, 0.9, 12 + rng() * 22, 5), hullDark, { m: mul(s.m, T(x, y, z, a + (rng() - 0.5) * 0.8, 0, (rng() - 0.5) * 0.8)) });
    }
  }

  // --- Sand drifts banked against the hull and spilled debris ---
  for (let k = 0; k < (hi ? 20 : 12); k++) {
    const x = -200 + rng() * 400;
    const z = (rng() < 0.5 ? -1 : 1) * (28 + rng() * 22);
    const r = 16 + rng() * 22;
    rig.add(rock(1, 1), shade(sand, 0.94 + rng() * 0.1), { m: T(x, -r * 0.2, z, 0, rng() * 3, 0, r * 1.8, r * 0.62, r) });
  }
  for (let k = 0; k < (hi ? 30 : 14); k++) {
    rig.add(box(3 + rng() * 9, 1 + rng() * 3, 2 + rng() * 6), rng() < 0.5 ? hullDark : rust, { m: T(-200 + rng() * 420, 0.5, (rng() - 0.5) * 220, rng(), rng() * 3, rng()) });
  }

  // --- Scavenger camp by the stern: domes, tents, a salvage crane ---
  const campX = -150;
  const campZ = -80;
  for (let k = 0; k < (hi ? 7 : 4); k++) {
    const a = (k / 7) * Math.PI * 1.6;
    const x = campX + Math.cos(a) * 28;
    const z = campZ + Math.sin(a) * 18;
    if (k % 2) rig.add(new THREE.ConeGeometry(5, 6, 6).translate(0, 3, 0), mix(palette.accent, 0xe8dcc8, 0.6), { m: T(x, 0, z) });
    else rig.add(new THREE.SphereGeometry(6, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), shade(sand, 1.1), { m: T(x, 0, z) });
  }
  rig.add(block(10, 3, 6), hullDark, { m: T(campX + 10, 0, campZ - 4) });
  rig.add(block(2.6, 52, 2.6), rust, { m: T(campX, 0, campZ + 8) });
  const crane = rig.bone(rig.root, campX, 52, campZ + 8);
  rig.add(box(54, 2, 2), rust, { bone: crane, m: T(16, 0, 0) });
  rig.add(box(8, 5, 4), hullDark, { bone: crane, m: T(-12, -1, 0) });
  rig.add(box(0.3, 22, 0.3), interior, { bone: crane, m: T(40, -11, 0) });
  rig.add(box(10, 1.2, 7), rust, { bone: crane, m: T(40, -22, 0, 0, 0.4) });

  // --- Distress beacon on the stern's high point, with a lighthouse sweep ---
  const beaconPos = new THREE.Vector3(-150, HULL_R * HULL_SY + 44, 0).applyMatrix4(stern.m);
  rig.add(cyl(1.5, 2, 6, 6), hullDark, { m: T(beaconPos.x, beaconPos.y - 6, beaconPos.z) });
  const beacon = rig.bone(rig.root, beaconPos.x, beaconPos.y, beaconPos.z);
  addBeam(rig, 260, 30, mix(0xff6040, palette.sun, 0.3), 0.18, { bone: beacon, m: T(0, 0, 0, 0, 0, Math.PI / 2 + 0.12) });

  // --- Crawlers: six-wheeled scavengers with a boom arm ---
  const crawlers: { bone: THREE.Bone; s: Section; u0: number; a: number; span: number; speed: number }[] = [];
  for (let k = 0; k < nCrawlers; k++) {
    const bone = rig.bone();
    rig.add(box(4.5, 2, 7), mix(palette.accent, 0xc8b898, 0.5), { bone, m: T(0, 1.6, 0) });
    rig.add(box(3.6, 1.6, 2.6), interior, { bone, m: T(0, 3.2, 2) });
    for (const sx of [-1, 1]) for (const sz of [-2.6, 0, 2.6]) rig.add(cyl(0.9, 0.9, 0.8, 6).rotateZ(Math.PI / 2), interior, { bone, m: T(sx * 2.6, 0.9, sz) });
    rig.add(box(0.6, 0.6, 6), hullDark, { bone, m: T(1.4, 3.6, 4.5, -0.4) });
    const s = k % 3 === 2 ? bow : stern;
    crawlers.push({ bone, s, u0: 0.15 + rng() * 0.6, a: (rng() - 0.5) * 1.4, span: 0.06 + rng() * 0.12, speed: CRAWLER_SPEED * (0.6 + rng()) });
  }

  rig.build(kit.group, RADIUS, HEIGHT);

  const wisp = brush({ life: 10, size0: 8, size1: 46, c0: col(0x8a8480), c1: mix(0xd8d0c8, palette.horizon, 0.5), alpha: 0.5, keep: 0.7, lift: 2 });
  const darkWisp = brush({ life: 12, size0: 10, size1: 60, c0: col(0x3a3430), c1: mix(0x6a625a, palette.horizon, 0.4), alpha: 0.55, keep: 0.7, lift: 2.5 });
  const spark = brush({ life: 0.45, size0: 2.5, size1: 0.8, c0: col(0xffffff), c1: col(0xffa040), alpha: boost, keep: 0.4, lift: -18 });
  const vents = [
    new THREE.Vector3(2, HULL_R * HULL_SY * 0.5, 0).applyMatrix4(stern.m),
    new THREE.Vector3(-6, HULL_R * HULL_SY * 0.2, 14).applyMatrix4(stern.m),
    new THREE.Vector3(6, HULL_R * HULL_SY * 0.6, -8).applyMatrix4(bow.m),
    new THREE.Vector3(-STERN_LEN - 25, 0, 0).applyMatrix4(stern.m),
  ];

  const evt = mulberry32(opts.seed ^ 0x3a1);
  const L = new THREE.Vector3();
  const N = new THREE.Vector3();
  const F = new THREE.Vector3();
  const R = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  let smokeAcc = 0;
  let lampI = 0;
  const lamp = (x: number, y: number, z: number, size: number, c: THREE.Color, a: number) => glow.lamp(lampI++, x, y, z, size, c, a);
  const white = col(0xffffff);

  function update(time: number, dt: number): void {
    lampI = 0;
    crane.rotation.y = Math.sin(time * CRANE_SPIN) * 1.2;
    beacon.rotation.y = time * BEACON_SPIN;

    // Crawlers creep back and forth along the plating, standing on the hull's surface.
    for (const c of crawlers) {
      const len = c.s.len;
      const ph = Math.sin(time * c.speed * 6 + c.u0 * 10);
      const u = c.u0 + c.span * ph;
      const x = c.s === stern ? -STERN_LEN + u * len : u * len;
      const r = c.s.r(u);
      const a = c.a + 0.15 * Math.sin(time * 0.1 + c.u0 * 20);
      L.set(x, Math.cos(a) * r * HULL_SY, Math.sin(a) * r);
      N.set(0, Math.cos(a) * HULL_SY, Math.sin(a)).normalize();
      F.set(Math.cos(time * c.speed * 6 + c.u0 * 10) >= 0 ? 1 : -1, 0, 0);
      R.crossVectors(N, F).normalize();
      F.crossVectors(R, N);
      basis.makeBasis(R, N, F);
      c.bone.quaternion.setFromRotationMatrix(basis).premultiply(c.s.q);
      c.bone.position.copy(L).applyMatrix4(c.s.m);
    }
    rig.sync();

    crawlers.forEach((c, k) => {
      rig.local(c.bone, 0, 3.4, 4.2, L);
      lamp(L.x, L.y, L.z, 4, warm, 0.9 * boost);
      // Welding: a hard blue-white flicker in bursts, throwing sparks.
      const welding = fract(time * 0.13 + k * 0.37) < 0.35;
      rig.local(c.bone, 1.4, 2.6, 7.4, L);
      const flick = welding ? (evt() < 0.6 ? 1 : 0.2) : 0;
      lamp(L.x, L.y, L.z, 7 * flick, weld, flick * boost);
      if (welding && dt > 0 && evt() < 0.5) glow.emit(spark, L.x, L.y, L.z, (evt() - 0.5) * 14, 6 + evt() * 8, (evt() - 0.5) * 14);
    });
    for (let k = 0; k < nDrones; k++) {
      const a = time * (0.12 + k * 0.015) + k * 1.9;
      const y = DRONE_ALT + Math.sin(time * 0.3 + k) * 20 + k * 6;
      lamp(Math.cos(a) * DRONE_ORBIT * (0.7 + k * 0.08), y, Math.sin(a) * DRONE_ORBIT * 0.5, 4, k % 2 ? white : warm, (fract(time * 1.3 + k * 0.4) < 0.2 ? 1 : 0.35) * boost);
    }
    lamp(beaconPos.x, beaconPos.y + 2, beaconPos.z, 10, red, (fract(time * 0.6) < 0.25 ? 1 : 0.3) * boost);
    for (let k = 0; k < 4; k++) lamp(campX + Math.cos(k * 1.4) * 22, 4, campZ + Math.sin(k * 1.4) * 14, 6, warm, 0.7 * boost);
    lamp(campX + 40 * Math.cos(crane.rotation.y), 30, campZ + 8 - 40 * Math.sin(crane.rotation.y), 5, red, fract(time) < 0.5 ? boost : 0.2);
    while (lampI < glow.fixed) lamp(0, -1000, 0, 0, white, 0);

    if (dt > 0) {
      smokeAcc += dt;
      while (smokeAcc > WISP_STEP) {
        smokeAcc -= WISP_STEP;
        const v = vents[Math.floor(evt() * vents.length)];
        smoke.emit(evt() < 0.4 ? darkWisp : wisp, v.x + (evt() - 0.5) * 8, v.y, v.z + (evt() - 0.5) * 8, 0, 4 + evt() * 4, 0);
      }
    }
    glow.update(dt);
    smoke.update(dt);
  }

  return { group: kit.group, radius: RADIUS, update, dispose: () => disposeKit(kit) };
}

/** Seconds between smoke puffs from the hull's wounds. */
const WISP_STEP = 0.1;

function mul(a: THREE.Matrix4, b: THREE.Matrix4): THREE.Matrix4 {
  return a.clone().multiply(b);
}

/**
 * A hull shell lofted along +X from x0 to x1 through `rings` cross-sections of the section's
 * radius profile, each vertex dented a little so the plating reads battered.
 */
function loft(s: Section, x0: number, x1: number, rings: number, rng: Rng): THREE.BufferGeometry {
  const n = HULL_SIDES;
  const pts: THREE.Vector3[][] = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const r = s.r(u);
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const dent = 1 + (rng() - 0.5) * DENT;
      ring.push(new THREE.Vector3(x0 + (x1 - x0) * u + (rng() - 0.5) * 3, Math.cos(a) * r * HULL_SY * dent, Math.sin(a) * r * dent));
    }
    pts.push(ring);
  }
  const pos: number[] = [];
  const push = (v: THREE.Vector3) => pos.push(v.x, v.y, v.z);
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < n; k++) {
      const a = pts[i][k];
      const b = pts[i][(k + 1) % n];
      const c = pts[i + 1][k];
      const d = pts[i + 1][(k + 1) % n];
      push(a);
      push(b);
      push(c);
      push(b);
      push(d);
      push(c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
const DENT = 0.08;
