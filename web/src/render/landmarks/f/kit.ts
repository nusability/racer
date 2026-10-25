// Forest kit for the set-F landmarks (Elderwood). They are built with the ice world's rig kit
// (set-B buckets for static and GPU-animated parts, a set-A rig for anything posed from a
// hazard, CPU point clouds for event-driven dust and leaves): that machinery is biome-neutral.
// This adds the forest's colours and the pieces every Elderwood landmark is made of: giant
// trees, crowns of foliage, ferns, mossy stones, lanterns.

import * as THREE from 'three';
import type { Rng } from '../../../core/rng.ts';
import type { Bucket } from '../b/bucket.ts';
import type { Kit } from '../b/kit.ts';
import { T, mix, prism, shade, vary } from '../b/shapes.ts';
import type { Motion, V3 } from '../b/motion.ts';

export { IceKit as RigKit, RoadFrame, bindHazard, blockedSpans, hide, smooth01, type Def } from '../d/kit.ts';

// --- Palette ------------------------------------------------------------------------------

/** The giants' bark: deep red-brown, like the oldest real trees; a dead giant's is silver-grey. */
export const BARK = 0x6e4630;
export const DEAD_BARK = 0x9a948a;
export const MOSS = 0x4f7a2a;
export const LEAVES: readonly number[] = [0x2f5a26, 0x3a6a2a, 0x2a4a22, 0x46702e, 0x355e30];
export const FERN = 0x3e6a26;
/** Old stone under moss, and the dark of wet rock. */
export const STONE = 0x7a7e72;
export const STONE_DARK = 0x4a4e46;
/** Worked timber: fresh-sawn, weathered, and the dark of tarred rope and old planks. */
export const TIMBER = 0xb08a5a;
export const WEATHERED = 0x7a6248;
export const ROPE = 0x3a2c20;
export const LANTERN = 0xffc070;
/** The forest's own light: bioluminescent caps, spores and glyphs. */
export const GLOW: readonly number[] = [0x5ff0d0, 0x60c8ff, 0xa080ff, 0xb0ff80];
export const WATER = 0x3a6a6a;
export const FOAM = 0xe8f4f0;

// --- Pieces -------------------------------------------------------------------------------

/**
 * Trunk segments of a landmark giant: [share of height, radius multiplier] from the buried foot
 * up. Straight columns barely tapering, like the woods' own trunks round them (biomes/forest.ts):
 * redwoods, not spreading oaks.
 */
const TRUNK: readonly (readonly [number, number])[] = [
  [-0.05, 1.7],
  [0, 1.5],
  [0.04, 1.1],
  [0.3, 0.96],
  [0.65, 0.88],
  [1, 0.78],
];
const TRUNK_SIDES = { high: 10, low: 7 } as const;
/** Buttress roots round a giant's foot: how many, their reach (× radius) and height (× radius). */
const ROOTS = 5;
const ROOT_REACH = 2.6;
const ROOT_HEIGHT = 1.2;
/**
 * A giant's crown: clumps (high, low), where they hang (height share: only at the very top, up
 * in the canopy's shade, mostly out of a racer's frame), their size (× radius) and how dark they
 * are under the canopy.
 */
const CROWN_CLUMPS = { high: 5, low: 3 } as const;
const CROWN_FROM = 0.88;
const CLUMP_SIZE: readonly [number, number] = [3, 5];
const CROWN_SHADE = 0.6;
const CLUMP_SQUASH = 0.38;

export interface GiantOpts {
  /** Bark colour (default the living giants'). */
  bark?: THREE.ColorRepresentation;
  /** Leave the crown off (a snag, or a trunk whose crown is out of view). */
  crown?: boolean;
  /** How far the trunk leans (radians) and toward which bearing. */
  lean?: number;
  leanDir?: number;
  /** Height of the ground it stands on (default 0). */
  base?: number;
}

/**
 * A giant tree standing at (x, z) on y = 0 in a bucket: a tapering trunk from a root flare,
 * buttress roots, and a crown of foliage clumps up its top third. `h` is its height, `r` the
 * trunk radius above the flare.
 */
export function giant(kit: Kit, bucket: Bucket, x: number, z: number, h: number, r: number, rng: Rng, o: GiantOpts = {}): void {
  const sides = kit.q(TRUNK_SIDES.high, TRUNK_SIDES.low);
  const bark = new THREE.Color(o.bark ?? BARK);
  const lean = o.lean ?? 0;
  const dir = o.leanDir ?? 0;
  const y0 = o.base ?? 0;
  const at = (f: number): V3 => [x + Math.cos(dir) * Math.sin(lean) * h * f, y0 + h * f * Math.cos(lean), z + Math.sin(dir) * Math.sin(lean) * h * f];
  // Turning +Y toward the lean's bearing: about the horizontal axis square to it.
  const tilt = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(Math.sin(dir), 0, -Math.cos(dir)), lean);
  for (let i = 0; i + 1 < TRUNK.length; i++) {
    const [f0, m0] = TRUNK[i];
    const [f1, m1] = TRUNK[i + 1];
    const a = at(f0);
    const len = (f1 - f0) * h;
    const m = new THREE.Matrix4().makeTranslation(a[0], a[1], a[2]).multiply(tilt).multiply(new THREE.Matrix4().makeRotationY(rng() * Math.PI));
    // Each segment a shade off its neighbours: the bark's ridges read without a texture.
    bucket.add(prism(r * m0, r * m1, len, sides), vary(rng, shade(bark, i % 2 ? 0.86 : 1), 0.05), m);
  }
  // Moss up one side of the foot.
  bucket.add(prism(r * 1.55, r * 1.05, h * 0.06, 5, true), mix(bark, MOSS, 0.6), T(x, y0, z, rng() * Math.PI, 0, 0, [1.02, 1, 1.02]));
  for (let k = 0; k < ROOTS; k++) {
    const a = (k / ROOTS) * Math.PI * 2 + rng();
    const reach = r * ROOT_REACH * (0.8 + rng() * 0.4);
    bucket.add(root(r * 1.05, reach, r * ROOT_HEIGHT), shade(bark, 0.8), T(x, y0, z, a));
  }
  if (o.crown === false) return;
  const top = at(1);
  const n = kit.q(CROWN_CLUMPS.high, CROWN_CLUMPS.low);
  for (let i = 0; i < n; i++) {
    const tier = i / Math.max(1, n - 1);
    const a = rng() * Math.PI * 2;
    const out = r * (1.2 + rng() * 2) * (1 - tier * 0.5);
    const y = y0 + h * (CROWN_FROM + (1 - CROWN_FROM) * tier);
    const size = r * (CLUMP_SIZE[0] + rng() * (CLUMP_SIZE[1] - CLUMP_SIZE[0])) * (1 - tier * 0.4);
    clump(bucket, [top[0] + Math.cos(a) * out, y, top[2] + Math.sin(a) * out], size, shade(leafColour(rng), CROWN_SHADE), rng);
  }
}

/** A buttress root: a thin wedge from the trunk (at radius r0) out to the ground at `reach`, rising to `height`. */
function root(r0: number, reach: number, height: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const p = [r0, height, 0, r0, -0.5, 0, reach, -0.3, 0];
  // Both faces, so the fin reads from either side.
  g.setAttribute('position', new THREE.Float32BufferAttribute([...p, p[0], p[1], p[2], p[6], p[7], p[8], p[3], p[4], p[5]], 3));
  return g;
}

export function leafColour(rng: Rng): THREE.Color {
  return vary(rng, LEAVES[Math.floor(rng() * LEAVES.length)], 0.06);
}

/** A clump of foliage: a squashed, jittered icosahedron round `c`. */
export function clump(bucket: Bucket, c: V3, size: number, colour: THREE.ColorRepresentation, rng: Rng, motion?: Motion): void {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position');
  const push = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = push.get(key);
    if (k === undefined) {
      k = 0.8 + rng() * 0.4;
      push.set(key, k);
    }
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * CLUMP_SQUASH, p.getZ(i) * k);
  }
  bucket.add(g, colour, T(c[0], c[1], c[2], rng() * Math.PI, 0, 0, size), motion);
}

/** A fern: fronds arching out from a crown at (x, y, z), `s` metres across. */
export function fern(bucket: Bucket, x: number, z: number, s: number, rng: Rng, colour: THREE.ColorRepresentation = FERN, motion?: Motion, y = 0): void {
  const fronds = 6;
  for (let k = 0; k < fronds; k++) {
    const a = (k / fronds) * Math.PI * 2 + rng() * 0.5;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const l = s * 0.5;
    const w = s * 0.12;
    const g = new THREE.BufferGeometry();
    const base: V3 = [x, y + 0.1, z];
    const mid1: V3 = [x + dx * l * 0.5 - dz * w, y + s * 0.28, z + dz * l * 0.5 + dx * w];
    const mid2: V3 = [x + dx * l * 0.5 + dz * w, y + s * 0.28, z + dz * l * 0.5 - dx * w];
    const tip: V3 = [x + dx * l, y + s * 0.06, z + dz * l];
    g.setAttribute('position', new THREE.Float32BufferAttribute([...base, ...mid1, ...mid2, ...mid1, ...tip, ...mid2], 3));
    bucket.add(g, vary(rng, colour, 0.08), undefined, motion);
  }
}

/** A mossy boulder at (x, z): stone with a green cap. */
export function mossyRock(bucket: Bucket, x: number, z: number, r: number, rng: Rng): void {
  const ry = rng() * Math.PI;
  bucket.add(new THREE.IcosahedronGeometry(r, 0), vary(rng, STONE, 0.08), T(x, r * 0.3, z, ry, 0, 0, [1.2, 0.75, 1]));
  bucket.add(new THREE.IcosahedronGeometry(r * 0.92, 0), vary(rng, MOSS, 0.08), T(x, r * 0.55, z, ry + 0.3, 0, 0, [1.1, 0.4, 0.92]));
}

/** A hanging lantern at `at`: a glowing bulb with a halo that blooms at dusk. */
export function lantern(kit: Kit, at: V3, size: number, halo: number, phase: number): void {
  kit.lamp(new THREE.OctahedronGeometry(size), at, LANTERN, halo, undefined, { depth: 0.15, freq: 2.3, phase, sharp: 1 });
}
