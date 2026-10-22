// Original flying craft shared by the set-A landmarks (spaceport traffic, the invasion's
// dropship, the sky fleet's tenders). Each is built into a rig bone with its nose along +Z,
// belly at y = 0, and returns the bones and nozzle points its owner animates.

import * as THREE from 'three';
import { T, ball, box, cyl, mix, shade, type Rig } from './kit.ts';

export interface CraftColours {
  hull: THREE.Color;
  trim: THREE.Color;
  dark: THREE.Color;
  canopy: THREE.Color;
  flame: THREE.Color;
}

export function craftColours(hull: THREE.ColorRepresentation, trim: THREE.ColorRepresentation): CraftColours {
  return {
    hull: new THREE.Color(hull),
    trim: new THREE.Color(trim),
    dark: new THREE.Color(DARK_METAL),
    canopy: new THREE.Color(CANOPY),
    flame: new THREE.Color(FLAME),
  };
}
const DARK_METAL = 0x34363e;
const CANOPY = 0x9fe8ff;
const FLAME = 0xffc870;

export interface Craft {
  body: THREE.Bone;
  /** Downward lift jets: scale.y is throttle. */
  lift: THREE.Bone;
  /** Rear main engines: scale.z is throttle. */
  main: THREE.Bone;
  /** Nozzle exits in body space, for glows and exhaust. */
  liftNozzles: THREE.Vector3[];
  mainNozzles: THREE.Vector3[];
  /** Wingtip navigation lights (port, starboard) in body space. */
  navLights: [THREE.Vector3, THREE.Vector3];
  length: number;
}

/** A lift-jet flame: a cone hanging down from the nozzle, unit length at throttle 1. */
function liftFlame(rig: Rig, bone: THREE.Bone, x: number, z: number, r: number, len: number, c: CraftColours): void {
  const g = new THREE.ConeGeometry(r, len, 6).rotateX(Math.PI).translate(x, -len / 2, z);
  rig.add(g, c.flame, { bone, layer: 'glow' });
  const core = new THREE.ConeGeometry(r * 0.5, len * 0.6, 5).rotateX(Math.PI).translate(x, -len * 0.3, z);
  rig.add(core, FLAME_CORE, { bone, layer: 'glow' });
}
const FLAME_CORE = 0xfffbe8;

function mainFlame(rig: Rig, bone: THREE.Bone, x: number, y: number, r: number, len: number, c: CraftColours): void {
  const g = new THREE.ConeGeometry(r, len, 6).rotateX(-Math.PI / 2).translate(x, y, -len / 2);
  rig.add(g, c.flame, { bone, layer: 'glow' });
  const core = new THREE.ConeGeometry(r * 0.5, len * 0.6, 5).rotateX(-Math.PI / 2).translate(x, y, -len * 0.3);
  rig.add(core, FLAME_CORE, { bone, layer: 'glow' });
}

/**
 * Heavy cargo hauler: a blunt slab hull on two outrigger engine pods, a rack of containers on
 * its back and four lift jets. About `scale` × 50 m long.
 */
export function buildHauler(rig: Rig, parent: THREE.Bone, scale: number, c: CraftColours): Craft {
  const s = scale;
  const body = rig.bone(parent);
  const B = { bone: body };
  // Main hull: a long octagonal slab with a chamfered nose.
  rig.add(cyl(1, 1, 30 * s, 8).rotateX(Math.PI / 2).scale(7 * s, 4.2 * s, 1).translate(0, 4.5 * s, -14 * s), c.hull, B);
  rig.add(cyl(0.35, 1, 12 * s, 8).rotateX(Math.PI / 2).scale(7 * s, 4.2 * s, 1).translate(0, 4.5 * s, 16 * s), c.hull, B);
  rig.add(box(5 * s, 1.4 * s, 4 * s), c.canopy, { bone: body, layer: 'glow', m: T(0, 7 * s, 18 * s, -0.35) });
  // Belly keel and the trim stripe.
  rig.add(box(8 * s, 1.6 * s, 34 * s), c.dark, { bone: body, m: T(0, 1.2 * s, 0) });
  rig.add(box(14.4 * s, 1.2 * s, 6 * s), c.trim, { bone: body, m: T(0, 5 * s, 8 * s) });
  // Container rack.
  for (let i = 0; i < 4; i++) {
    const tint = i % 2 === 0 ? c.trim : shade(c.hull, 0.8);
    rig.add(box(8 * s, 5 * s, 6 * s), tint, { bone: body, m: T(0, 10.5 * s, (-12 + i * 6.6) * s) });
  }
  // Stub wings and outrigger engine pods.
  for (const side of [-1, 1]) {
    rig.add(box(12 * s, 1.4 * s, 10 * s), c.hull, { bone: body, m: T(side * 12 * s, 4.5 * s, -6 * s, 0, 0, side * -0.12) });
    rig.add(cyl(3.2 * s, 3.6 * s, 22 * s, 8).rotateX(Math.PI / 2).translate(side * 18 * s, 5 * s, -18 * s), c.dark, B);
    rig.add(cyl(3.3 * s, 3.3 * s, 2 * s, 8).rotateX(Math.PI / 2).translate(side * 18 * s, 5 * s, 2 * s), c.trim, B);
    rig.add(box(1 * s, 7 * s, 8 * s), c.hull, { bone: body, m: T(side * 18 * s, 10 * s, -16 * s) });
  }
  const lift = rig.bone(body, 0, 0.4 * s, 0);
  const liftNozzles: THREE.Vector3[] = [];
  for (const [x, z] of [[-18, -6], [18, -6], [-4, 10], [4, -12]] as const) {
    liftFlame(rig, lift, x * s, z * s, 2.2 * s, 14 * s, c);
    liftNozzles.push(new THREE.Vector3(x * s, 0.4 * s, z * s));
  }
  const main = rig.bone(body, 0, 0, -18.5 * s);
  const mainNozzles: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    mainFlame(rig, main, side * 18 * s, 5 * s, 3 * s, 26 * s, c);
    mainNozzles.push(new THREE.Vector3(side * 18 * s, 5 * s, -18.5 * s));
  }
  return {
    body,
    lift,
    main,
    liftNozzles,
    mainNozzles,
    navLights: [new THREE.Vector3(-21 * s, 5 * s, -6 * s), new THREE.Vector3(21 * s, 5 * s, -6 * s)],
    length: 50 * s,
  };
}

/** Wing planform: a swept delta, extruded thin, in the XZ plane (root along the hull). */
function deltaWing(side: number, span: number, root: number, tip: number, sweep: number, thick: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, root / 2);
  shape.lineTo(side * span, root / 2 - sweep);
  shape.lineTo(side * span, root / 2 - sweep - tip);
  shape.lineTo(0, -root / 2);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, thick / 2, 0);
}

/**
 * Sleek passenger lancer: a needle hull, cranked delta wings, a tall split tail and three rear
 * engines. About `scale` × 40 m long.
 */
export function buildLancer(rig: Rig, parent: THREE.Bone, scale: number, c: CraftColours): Craft {
  const s = scale;
  const body = rig.bone(parent);
  const B = { bone: body };
  rig.add(cyl(1, 1, 34 * s, 8).rotateX(Math.PI / 2).scale(3.6 * s, 3 * s, 1).translate(0, 3.5 * s, -22 * s), c.hull, B);
  rig.add(new THREE.ConeGeometry(1, 16 * s, 8).rotateX(Math.PI / 2).scale(3.6 * s, 3 * s, 1).translate(0, 3.5 * s, 20 * s), c.hull, B);
  rig.add(box(3.4 * s, 1.2 * s, 7 * s), c.canopy, { bone: body, layer: 'glow', m: T(0, 6 * s, 9 * s, -0.12) });
  rig.add(box(1.2 * s, 0.6 * s, 34 * s), c.trim, { bone: body, m: T(0, 6.6 * s, -2 * s) });
  for (const side of [-1, 1]) {
    const w = deltaWing(side, 15 * s, 20 * s, 5 * s, 15 * s, 0.9 * s);
    rig.add(w, c.hull, { bone: body, m: T(side * 2.5 * s, 2.2 * s, -6 * s, 0, 0, side * 0.06) });
    rig.add(box(1.6 * s, 0.4 * s, 5.2 * s), c.trim, { bone: body, m: T(side * 17 * s, 3.4 * s, -12 * s) });
    rig.add(box(0.8 * s, 9 * s, 7 * s), c.hull, { bone: body, m: T(side * 2.6 * s, 9 * s, -19 * s, -0.35, 0, side * 0.25) });
  }
  rig.add(cyl(1.6 * s, 2 * s, 5 * s, 8).rotateX(Math.PI / 2).translate(0, 3.5 * s, -26 * s), c.dark, B);
  const lift = rig.bone(body, 0, 1 * s, 0);
  const liftNozzles: THREE.Vector3[] = [];
  for (const [x, z] of [[-9, -10], [9, -10], [0, 10]] as const) {
    liftFlame(rig, lift, x * s, z * s, 1.6 * s, 10 * s, c);
    liftNozzles.push(new THREE.Vector3(x * s, 1 * s, z * s));
  }
  const main = rig.bone(body, 0, 0, -26 * s);
  const mainNozzles: THREE.Vector3[] = [];
  for (const [x, y] of [[0, 3.5], [-3.6, 2.4], [3.6, 2.4]] as const) {
    if (x !== 0) rig.add(cyl(1.3 * s, 1.5 * s, 7 * s, 8).rotateX(Math.PI / 2).translate(x * s, y * s, -25 * s), c.dark, B);
    mainFlame(rig, main, x * s, y * s, 1.4 * s, 18 * s, c);
    mainNozzles.push(new THREE.Vector3(x * s, y * s, -26 * s));
  }
  return {
    body,
    lift,
    main,
    liftNozzles,
    mainNozzles,
    navLights: [new THREE.Vector3(-17.5 * s, 3.4 * s, -13 * s), new THREE.Vector3(17.5 * s, 3.4 * s, -13 * s)],
    length: 40 * s,
  };
}

/** Little runabout: a pod with a canopy bubble, two ducted fans and a tail light. ~10 m. */
export function buildSkiff(rig: Rig, parent: THREE.Bone, scale: number, c: CraftColours): Craft {
  const s = scale;
  const body = rig.bone(parent);
  rig.add(ball(1, 8, 5).scale(2.4 * s, 1.8 * s, 5 * s).translate(0, 1.8 * s, 0), c.hull, { bone: body });
  rig.add(ball(1.5 * s, 6, 4).translate(0, 3 * s, 1.8 * s), c.canopy, { bone: body, layer: 'glow' });
  for (const side of [-1, 1]) {
    rig.add(cyl(1.4 * s, 1.4 * s, 2.4 * s, 8, true).rotateX(Math.PI / 2).translate(side * 3.6 * s, 2 * s, -2 * s), c.trim, { bone: body });
    rig.add(box(2 * s, 0.4 * s, 1 * s), c.dark, { bone: body, m: T(side * 2.4 * s, 2 * s, -2 * s) });
  }
  rig.add(box(0.4 * s, 2.4 * s, 2 * s), mix(c.hull, c.dark, 0.4), { bone: body, m: T(0, 3.6 * s, -4 * s, -0.4) });
  const lift = rig.bone(body);
  const main = rig.bone(body, 0, 2 * s, -3.2 * s);
  for (const side of [-1, 1]) mainFlame(rig, main, side * 3.6 * s, 0, 1 * s, 5 * s, c);
  return {
    body,
    lift,
    main,
    liftNozzles: [],
    mainNozzles: [new THREE.Vector3(-3.6 * s, 2 * s, -3.2 * s), new THREE.Vector3(3.6 * s, 2 * s, -3.2 * s)],
    navLights: [new THREE.Vector3(-5 * s, 2 * s, -2 * s), new THREE.Vector3(5 * s, 2 * s, -2 * s)],
    length: 10 * s,
  };
}
