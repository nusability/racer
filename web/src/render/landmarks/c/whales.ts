// The whales: a pod of giant reef leviathans, long-winged and ridge-backed, with glowing
// flank spots. Two breach clean out of the sea in huge arcs and crash back in a burst of
// white; the others roll along the surface blowing tall spouts, calves at their sides. A
// whale-watching boat full of people waits near the track.
//
// Each creature swims a big vertical circle about a hub below the surface, so it rises, arcs
// and dives on a fixed loop; the sea hides the rest of the circle.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import type { Particles } from '../b/points.ts';
import type { Motion, V3 } from '../b/motion.ts';
import { T, beam, box, lathe, mix, shade, vary } from '../b/shapes.ts';
import { bunting } from '../b/props.ts';
import { DARK, FOAM, GLASS, WHITE, finishCoast, hull, splash } from './kit.ts';

const SALT = 0x3e41e5;
const RADIUS = 190;
const SEG = 10;

interface Swimmer {
  /** Hub of the swim circle (below the water) and its radius. */
  x: number;
  z: number;
  depth: number;
  r: number;
  /** Swim heading (yaw, radians) and loop period, s. */
  yaw: number;
  period: number;
  /** Where on the circle it starts (radians from the top, + is ahead). */
  start: number;
  length: number;
  /** Peak roll (radians) as it falls back in: breachers twist onto their sides. */
  roll: number;
  spout: boolean;
}

const POD: readonly Swimmer[] = [
  { x: -50, z: 50, depth: 52, r: 108, yaw: 0.35, period: 20, start: 2.2, length: 54, roll: 1.4, spout: false },
  { x: 80, z: 110, depth: 56, r: 112, yaw: Math.PI - 0.5, period: 24, start: -2.6, length: 56, roll: -1.2, spout: false },
  { x: 30, z: -10, depth: 172, r: 190, yaw: Math.PI + 0.15, period: 25, start: 0.9, length: 48, roll: 0.2, spout: true },
  { x: 18, z: 12, depth: 172, r: 190, yaw: Math.PI + 0.15, period: 25, start: 0.8, length: 22, roll: 0.25, spout: false },
  { x: -110, z: 120, depth: 166, r: 182, yaw: -0.2, period: 22, start: 2.8, length: 46, roll: -0.2, spout: true },
  { x: -124, z: 142, depth: 166, r: 182, yaw: -0.2, period: 22, start: 2.68, length: 21, roll: -0.2, spout: false },
];
const POD_LOW = 4;
const BOAT = { x: -30, z: -110, yaw: 0.2 } as const;
const SPOUT = { high: 26, low: 14 } as const;
const SPLASH = { high: 70, low: 36 } as const;
const BACK = 0x2a4a6a;
const BELLY = 0xd8e4e8;
const SPOTS = 0x60f0e0;

/** Body built along +X (head forward), centred on its middle, back up. */
function creature(kit: Kit, m: THREE.Matrix4, L: number, motion: Motion): void {
  const r = L * 0.11;
  // Lathe runs along +Y; turned so +Y becomes +X (forward). Belly is phi 0..π after the turn.
  const profile: readonly (readonly [number, number])[] = [[0.25, 0], [0.4, 0.12], [0.85, 0.35], [1, 0.58], [0.95, 0.76], [0.7, 0.9], [0.32, 0.98], [0.05, 1]].map(([pr, py]) => [pr * r, py * L - L / 2] as const);
  const turn = m.clone().multiply(T(0, 0, 0, 0, 0, -Math.PI / 2, [1, 1, 0.85]));
  const back = vary(kit.rng, BACK, 0.08);
  kit.moving.add(lathe(profile, SEG / 2, Math.PI, Math.PI), back, turn, motion);
  kit.moving.add(lathe(profile, SEG / 2, 0, Math.PI), BELLY, turn, motion);
  // Long pectoral wings, swept back, pale on the leading edge.
  for (const s of [-1, 1]) {
    const root: V3 = [L * 0.14, -r * 0.4, s * r * 0.7];
    const tip: V3 = [-L * 0.12, -r * 0.7, s * L * 0.42];
    const trail: V3 = [-L * 0.02, -r * 0.5, s * r * 0.8];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...root, ...tip, ...trail], 3));
    kit.moving.add(g, mix(BELLY, back, 0.3), m, motion);
    // Tail flukes.
    const f = new THREE.BufferGeometry();
    f.setAttribute('position', new THREE.Float32BufferAttribute([-L * 0.46, 0, 0, -L * 0.62, 0, s * L * 0.2, -L * 0.55, 0, s * L * 0.03], 3));
    kit.moving.add(f, shade(back, 0.8), m, motion);
  }
  // A ridge of dorsal fins and two rows of glowing flank spots.
  for (let i = 0; i < 4; i++) {
    const x = L * (0.05 - i * 0.12);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([x + L * 0.05, r * 0.9, 0, x - L * 0.05, r * 0.9, 0, x - L * 0.06, r * (1.5 - i * 0.12), 0], 3));
    kit.moving.add(g, kit.palette.accent, m, motion);
  }
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) {
      const at = new THREE.Vector3(L * (0.3 - i * 0.1), r * 0.15, s * r * 0.86).applyMatrix4(m);
      kit.lights.add(new THREE.OctahedronGeometry(L * 0.012).scale(1.6, 1, 1), SPOTS, T(at.x, at.y, at.z), motion, { depth: 0.6, freq: 2, phase: i, sharp: 2 });
    }
  }
}

function swimmer(kit: Kit, w: Swimmer, splashes: Particles): void {
  const { rng } = kit;
  const d = new THREE.Vector3(Math.cos(w.yaw), 0, Math.sin(w.yaw));
  const axis = new THREE.Vector3(0, 1, 0).cross(d);
  const hub: V3 = [w.x, -w.depth, w.z];
  const spin = (Math.PI * 2) / w.period;
  // Rest pose: on top of the circle facing d, then turned `start` round the circle.
  const m = new THREE.Matrix4().makeTranslation(...hub).multiply(new THREE.Matrix4().makeRotationAxis(axis, w.start)).multiply(T(0, w.r, 0, -w.yaw));
  const centre = new THREE.Vector3().applyMatrix4(m);
  const fwd = d.clone().applyAxisAngle(axis, w.start);
  // Above the water for θ in [−α, α]; time it leaves the water and dives back in.
  const alpha = Math.acos(w.depth / w.r);
  const wrap = (t: number): number => ((t % w.period) + w.period) % w.period;
  const tOut = wrap((-alpha - w.start) / spin);
  const tIn = wrap((alpha - w.start) / spin);
  const motion: Motion = { hub, axisA: [axis.x, axis.y, axis.z], spinA: spin, pivot: [centre.x, centre.y, centre.z], axisB: [fwd.x, fwd.y, fwd.z], swingB: w.roll, freq: spin, phase: Math.PI / 2 - spin * tIn };
  creature(kit, m, w.length, motion);
  const onCircle = (theta: number): V3 => {
    const p = new THREE.Vector3(0, w.r, 0).applyAxisAngle(axis, theta);
    return [hub[0] + p.x, 0.5, hub[2] + p.z];
  };
  const big = w.length > 30;
  const breacher = w.r < 150;
  const count = Math.round(kit.q(SPLASH.high, SPLASH.low) * (breacher ? 1 : 0.35) * (big ? 1 : 0.5));
  splash(splashes, rng, onCircle(-alpha), { count: Math.round(count * 0.6), speed: 5, up: breacher ? 14 : 5, size: breacher ? 4 : 2.6, period: w.period, time: tOut, spread: w.length * 0.2, dir: [d.x * 6, 0, d.z * 6] });
  splash(splashes, rng, onCircle(alpha), { count, speed: breacher ? 12 : 4, up: breacher ? 34 : 7, size: breacher ? 6 : 3.4, period: w.period, time: tIn + w.length / (w.r * spin) * 0.3, spread: w.length * 0.3 });
  if (w.spout) {
    // A tall misty blow just after the head breaks the surface.
    const head = onCircle(-alpha * 0.4);
    const blowAt: V3 = [head[0] + d.x * w.length * 0.3, 2, head[2] + d.z * w.length * 0.3];
    const tBlow = wrap(tOut + (alpha * 0.6) / spin);
    for (let i = 0; i < kit.q(SPOUT.high, SPOUT.low); i++) {
      splashes.add(blowAt, [(rng() - 0.5) * 3 + d.x * 4, 22 + rng() * 10, (rng() - 0.5) * 3 + d.z * 4], 0xf8fcff, 2.2 + rng() * 1.5, { period: w.period, lifetime: 2.8, phase: wrap(-tBlow - i * 0.02), grow: 1.4 }, { gravity: 5, drag: 0.8, fadeIn: 0.02 });
    }
  }
}

function boat(kit: Kit, splashes: Particles): void {
  const { rng } = kit;
  const m = T(BOAT.x, 0, BOAT.z, BOAT.yaw);
  kit.solid.add(hull(24, 7, 4.5, 0.32, 0.85), WHITE, m.clone().multiply(T(0, -2.6, 0)));
  kit.solid.add(hull(24.3, 7.3, 0.9, 0.32, 0.85, 1), 0x2f6fb8, m.clone().multiply(T(0, 0.8, 0)));
  kit.solid.add(box(11, 2.6, 5.6), WHITE, m.clone().multiply(T(-1, 1.9, 0)));
  kit.solid.add(box(11.2, 1.1, 5.8), GLASS, m.clone().multiply(T(-1, 3, 0)));
  kit.solid.add(box(12, 0.3, 6.4), shade(WHITE, 0.9), m.clone().multiply(T(-1, 4.5, 0)));
  for (const s of [-1, 1]) kit.solid.add(box(12, 0.9, 0.12), kit.palette.accent, m.clone().multiply(T(-1, 4.8, s * 3.1)));
  const mastFoot = new THREE.Vector3(3, 4.8, 0).applyMatrix4(m);
  const mastTop = new THREE.Vector3(3, 11, 0).applyMatrix4(m);
  kit.solid.add(beam([mastFoot.x, mastFoot.y, mastFoot.z], [mastTop.x, mastTop.y, mastTop.z], 0.1, 3), DARK);
  const bow = new THREE.Vector3(11.5, 2, 0).applyMatrix4(m);
  bunting(kit, [mastTop.x, mastTop.y, mastTop.z], [bow.x, bow.y, bow.z], 0.5, kit.q(6, 4), 0.8);
  // Passengers along the rails, pointing and cheering at the whales.
  for (let i = 0; i < kit.q(22, 10); i++) {
    const upper = i % 2 === 0;
    const lx = -6 + rng() * 11;
    const lz = (rng() < 0.7 ? 1 : -1) * (upper ? 2.6 : 3);
    const p = new THREE.Vector3(lx, upper ? 4.65 : 1.3, lz).applyMatrix4(m);
    kit.crowd({ x: p.x, y: p.y, z: p.z, ry: BOAT.yaw + (lz > 0 ? 0 : Math.PI), color: vary(rng, kit.festiveColor(), 0.2), hop: 0.25, freq: 5 + rng() * 2, phase: rng() * 9, sharp: 3, raise: 0.6 + rng() * 0.4 });
  }
  splash(splashes, rng, [BOAT.x - 12, 0.4, BOAT.z], { count: 6, speed: 1, up: 1.5, size: 2, period: 2.5, time: 0, color: FOAM });
}

export function createWhales(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const splashes = kit.particles(false, 1.1);
  const pod = kit.high ? POD : POD.slice(0, POD_LOW);
  for (const w of pod) swimmer(kit, w, splashes);
  boat(kit, splashes);
  return finishCoast(kit, RADIUS);
}
