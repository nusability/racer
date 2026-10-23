// The ice palace: a citadel grown from crystal. Hexagonal spires cluster round a soaring keep,
// their seams lit from within; a crown of shards turns slowly above the tallest spire; walls of
// raw crystal ring terraces of ice; shafts of coloured light sweep the sky and pool on the snow
// around it; glitter sparks across every facet and motes drift upward. Built to blaze at night.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import type { Motion, V3 } from '../b/motion.ts';
import { T, box, mix, prism, shade, vary } from '../b/shapes.ts';
import { ICE, ICE_DEEP, IceKit } from './kit.ts';

const SALT = 0x1ce9a;
const RADIUS = 200;
const KEEP_H = 165;
const TERRACES: readonly (readonly [number, number])[] = [[150, 6], [118, 14], [88, 24]];
const RING_SPIRES = { high: 14, low: 8 } as const;
const WALL_SHARDS = { high: 46, low: 24 } as const;
const CROWN = { y: KEEP_H + 32, r: 22, shards: 12 } as const;
const SHAFTS = { high: 6, low: 4 } as const;
const GLITTER = { high: 110, low: 50 } as const;
const MOTES = { high: 90, low: 40 } as const;
/** Light shafts reach this high, and sweep this far (rad) at this rate. */
const SHAFT_LEN = 900;
const SHAFT_SWING = 0.18;
const SHAFT_DAY = 0.03;
const SHAFT_NIGHT = 0.12;
/** Brightness of the glow pooled on the snow at full night, and of the self-lit spire caps. */
const POOL_GLOW = 0.18;
const CAP_GLOW = 0.92;

export function createIcePalace(opts: LandmarkOptions): Landmark {
  const ik = new IceKit(opts, SALT);
  const { rng } = ik;
  const kit = ik.b;
  const dusk = opts.palette.dusk;
  const accent = new THREE.Color(opts.palette.accent);
  const crystal = mix(ICE, 0xffffff, 0.35);
  const facet = mix(ICE_DEEP, ICE, 0.45);
  const seam = mix(0xbff8ff, accent, 0.35);
  const night = 0.15 + 0.85 * dusk;

  /** A hexagonal crystal: column, pointed cap, a lit seam up one edge and a glitter at the tip. */
  function spire(x: number, y: number, z: number, r: number, h: number, lean = 0, yaw = 0): void {
    const m = T(x, y, z, yaw, lean, 0);
    kit.solid.add(prism(r, r * 0.92, h, 6), vary(rng, rng() < 0.5 ? crystal : facet, 0.05), m);
    // The cap is self-lit: ice catches light at its tips whatever the sun is doing.
    kit.lights.add(new THREE.ConeGeometry(r * 0.92, h * 0.32, 6).translate(0, h + h * 0.16, 0), vary(rng, shade(crystal, CAP_GLOW), 0.04), m);
    kit.lights.add(box(r * 0.12, h * 0.95, r * 0.12).translate(r * 0.93, 0, 0), seam, m, undefined, { depth: 0.45, freq: 0.8 + rng() * 0.6, phase: rng() * 6, sharp: 2 });
    const tip = new THREE.Vector3(0, h * 1.3, 0).applyMatrix4(m);
    kit.halos.point([tip.x, tip.y, tip.z], mix(seam, 0xffffff, 0.5), r * 1.6, undefined, { depth: 0.9, freq: 1.5 + rng() * 2, phase: rng() * 9, sharp: 6 });
  }

  // --- Terraces of ice and the reflected glow pooled on the snow ---
  TERRACES.forEach(([r, y], i) => {
    kit.solid.add(prism(r, r * 1.04, y - (i ? TERRACES[i - 1][1] : 0), 6), i % 2 ? facet : crystal, T(0, i ? TERRACES[i - 1][1] : 0, 0, Math.PI / 6));
    kit.lights.add(prism(r * 1.005, r * 1.005, 0.6, 6, true), seam, T(0, y - 0.8, 0, Math.PI / 6), undefined, { depth: 0.3, freq: 0.6, phase: i });
  });
  kit.beams.add(new THREE.CircleGeometry(RADIUS * 1.15, 24).rotateX(-Math.PI / 2), shade(mix(accent, ICE, 0.5), POOL_GLOW * dusk ** 1.5), T(0, 0.3, 0), undefined, { depth: 0.25, freq: 0.4, phase: 0 });

  // --- The keep: a cluster of the tallest spires ---
  const top = TERRACES[TERRACES.length - 1][1];
  spire(0, top + 20, 0, 13, KEEP_H - top - 20, 0, 0);
  kit.solid.add(prism(26, 30, 30, 6), crystal, T(0, top, 0));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    spire(Math.cos(a) * 22, top + 10, Math.sin(a) * 22, 7 + rng() * 3, (KEEP_H - top) * (0.45 + rng() * 0.3), 0.12, -a);
  }
  // Ring spires on the lower terraces, leaning out like a geode's crystals.
  const nRing = ik.q(RING_SPIRES.high, RING_SPIRES.low);
  for (let k = 0; k < nRing; k++) {
    const a = (k / nRing) * Math.PI * 2;
    const r = TERRACES[1][0] * (0.82 + rng() * 0.1);
    spire(Math.cos(a) * r, TERRACES[0][1], Math.sin(a) * r, 5 + rng() * 3, 30 + rng() * 45, 0.18, Math.PI / 2 - a);
  }
  // Walls of raw crystal shards round the outer terrace, broken by a great gate facing the road.
  const nShard = ik.q(WALL_SHARDS.high, WALL_SHARDS.low);
  for (let k = 0; k < nShard; k++) {
    const a = (k / nShard) * Math.PI * 2;
    if (Math.abs(a - Math.PI * 1.5) < 0.18) continue;
    const r = TERRACES[0][0] * 0.95;
    const h = 14 + rng() * 22;
    kit.solid.add(new THREE.ConeGeometry(4 + rng() * 3, h, 5).translate(0, h / 2, 0), vary(rng, rng() < 0.5 ? crystal : facet, 0.05), T(Math.cos(a) * r, TERRACES[0][1], Math.sin(a) * r, rng() * 3, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.4));
  }
  const gateZ = -TERRACES[0][0] * 0.95;
  for (const side of [-1, 1]) spire(side * 14, 0, gateZ, 4.5, 42, side * 0.1, 0);
  kit.lights.add(new THREE.TorusGeometry(14, 1.2, 4, 16, Math.PI), seam, T(0, 40, gateZ), undefined, { depth: 0.4, freq: 1.2, phase: 0, sharp: 2 });

  // --- The crown: shards circling slowly above the keep, bobbing ---
  for (let k = 0; k < CROWN.shards; k++) {
    const a = (k / CROWN.shards) * Math.PI * 2;
    const p: V3 = [Math.cos(a) * CROWN.r, CROWN.y, Math.sin(a) * CROWN.r];
    const motion: Motion = { hub: [0, 0, 0], axisA: [0, 1, 0], spinA: 0.25, hop: 3, freq: 0.8, phase: k * 0.5, pivot: p, axisB: [0, 1, 0], spinB: 1.2 };
    kit.moving.add(new THREE.OctahedronGeometry(1).scale(2.4, 7, 2.4), crystal, T(p[0], p[1], p[2]), motion);
    kit.lights.add(new THREE.OctahedronGeometry(1).scale(0.8, 3.5, 0.8), seam, T(p[0], p[1], p[2]), motion, { depth: 0.6, freq: 2, phase: k, sharp: 3 });
  }
  kit.lamp(new THREE.OctahedronGeometry(5).scale(1, 1.6, 1), [0, CROWN.y, 0], mix(seam, 0xffffff, 0.5), 60 * night, { hub: [0, CROWN.y, 0], axisA: [0, 1, 0], spinA: -0.6 }, { depth: 0.35, freq: 1.1, phase: 0 });

  // --- Light shafts into the sky, sweeping slowly; strong at night, a hint by day ---
  const nShaft = ik.q(SHAFTS.high, SHAFTS.low);
  for (let k = 0; k < nShaft; k++) {
    const a = (k / nShaft) * Math.PI * 2;
    const base: V3 = [Math.cos(a) * 30, KEEP_H * 0.4, Math.sin(a) * 30];
    const tint = mix(k % 2 ? accent : new THREE.Color(0x80e8ff), 0xffffff, 0.3).multiplyScalar(SHAFT_DAY + SHAFT_NIGHT * dusk);
    // Each shaft leans outward from the keep: direction ≈ (−rz, 1, rx) for small angles.
    const tilt = 0.12 + rng() * 0.1;
    const motion: Motion = { pivot: base, axisB: [-Math.sin(a), 0, Math.cos(a)], swingB: SHAFT_SWING, freq: 0.25 + rng() * 0.15, phase: k * 1.7 };
    const segs = 4;
    for (let s = 0; s < segs; s++) {
      const h0 = (SHAFT_LEN * s) / segs;
      const g = new THREE.CylinderGeometry(4 + (s + 1) * 2.5, 4 + s * 2.5, SHAFT_LEN / segs, 8, 1, true).translate(0, h0 + SHAFT_LEN / segs / 2, 0);
      kit.beams.add(g, tint.clone().multiplyScalar((1 - s / segs) ** 1.4), T(base[0], base[1], base[2], 0, Math.sin(a) * tilt, -Math.cos(a) * tilt), motion, { depth: 0.3, freq: 0.7, phase: k });
    }
  }

  // --- Glitter across the facets and motes rising off the palace ---
  for (let k = 0; k < ik.q(GLITTER.high, GLITTER.low); k++) {
    const a = rng() * Math.PI * 2;
    const r = 15 + rng() * TERRACES[0][0] * 0.9;
    const y = TERRACES[0][1] + rng() * (r < 40 ? KEEP_H : 50);
    kit.halos.point([Math.cos(a) * r, y, Math.sin(a) * r], mix(0xffffff, seam, rng() * 0.5), 2 + rng() * 3, undefined, { depth: 1, freq: 2 + rng() * 4, phase: rng() * 20, sharp: 14 });
  }
  const motes = kit.particles(true, 1.8);
  for (let k = 0; k < ik.q(MOTES.high, MOTES.low); k++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * TERRACES[1][0];
    const period = 9 + rng() * 6;
    motes.add([Math.cos(a) * r, TERRACES[0][1] + rng() * 20, Math.sin(a) * r], [(rng() - 0.5) * 3, 6 + rng() * 6, (rng() - 0.5) * 3], mix(seam, 0xffffff, rng() * 0.6), 1.5 + rng() * 2, { period, lifetime: period, phase: rng() * period }, { drag: 0.05, fadeIn: 0.2 });
  }

  return ik.finish(RADIUS, RADIUS, KEEP_H + 60, () => {});
}
