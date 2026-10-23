// Coast kit for the set-C landmarks. They are built with the set-B kit (merged vertex-coloured
// buckets, GPU motion, instanced crowds, GPU particles); this adds what the sea needs: hulls,
// sails, spray and smoke, and particle sprites that follow the placement's scale.

import * as THREE from 'three';
import type { Landmark } from '../types.ts';
import type { Kit } from '../b/kit.ts';
import type { Particles } from '../b/points.ts';
import type { Motion, V3 } from '../b/motion.ts';
import type { Rng } from '../../../core/rng.ts';

export const WHITE = 0xf4f1ea;
export const FOAM = 0xf8fbff;
export const STEEL = 0x5a6470;
export const DARK = 0x2a2d34;
export const GLASS = 0x3a5a78;
export const WARM_LIGHT = 0xffd890;
export const RED_LIGHT = 0xff3030;
export const GREEN_LIGHT = 0x40ff70;

/** The set-B sprite size line, which ignores the landmark's placement scale. */
const SPRITE_SIZE = 'size * projectionMatrix[1][1]';
const SPRITE_SIZE_SCALED = 'size * length(modelMatrix[0].xyz) * projectionMatrix[1][1]';

/**
 * Finishes the kit and makes every sprite (halos, particles) grow with the placement scale,
 * so a landmark placed at 1.5× keeps its spray and smoke in proportion.
 */
export function finishCoast(kit: Kit, radius: number): Landmark {
  const lm = kit.finish(radius);
  lm.group.traverse((o) => {
    if (!(o instanceof THREE.Points)) return;
    const mat = o.material as THREE.ShaderMaterial;
    if (!mat.vertexShader.includes(SPRITE_SIZE)) throw new Error('set-B sprite shader changed: coast kit cannot scale sprites');
    mat.vertexShader = mat.vertexShader.replace(SPRITE_SIZE, SPRITE_SIZE_SCALED);
  });
  return lm;
}

/**
 * A boat hull, bow toward +X, keel at y = 0, deck at y = `height`. The waterline is the
 * caller's business (sink it by translating). `bow` is the fraction of the length that
 * narrows to the stem, `stern` the transom's share of the width, `taper` the keel's share.
 */
export function hull(length: number, width: number, height: number, bow = 0.3, stern = 0.85, taper = 0.55): THREE.BufferGeometry {
  const L = length / 2;
  const W = width / 2;
  const s = new THREE.Shape();
  const bowStart = L - length * bow;
  s.moveTo(-L, -W * stern);
  s.lineTo(bowStart, -W);
  s.quadraticCurveTo(L * 0.92, -W * 0.9, L, 0);
  s.quadraticCurveTo(L * 0.92, W * 0.9, bowStart, W);
  s.lineTo(-L, W * stern);
  s.lineTo(-L, -W * stern);
  const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2);
  // Taper the bottom so the hull reads as a hull, not a raft.
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < height * 0.5) p.setXYZ(i, p.getX(i) * (1 - (1 - taper) * 0.13), p.getY(i), p.getZ(i) * taper);
  }
  g.computeVertexNormals();
  return g;
}

/** A triangular sail between three points (luff along the mast, foot along the boom). */
export function sail(a: V3, b: V3, c: V3): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  return g;
}

/** A soft rising column of smoke from `at`, drifting downwind. */
export function smoke(p: Particles, rng: Rng, at: V3, opts: { count: number; color: THREE.ColorRepresentation; size: number; rise: number; wind: V3; period: number; spread: number; grow?: number }): void {
  for (let i = 0; i < opts.count; i++) {
    const phase = (i / opts.count) * opts.period;
    const o: V3 = [at[0] + (rng() - 0.5) * opts.spread, at[1], at[2] + (rng() - 0.5) * opts.spread];
    const v: V3 = [opts.wind[0] + (rng() - 0.5) * opts.spread * 0.2, opts.rise * (0.8 + rng() * 0.4) + opts.wind[1], opts.wind[2] + (rng() - 0.5) * opts.spread * 0.2];
    p.add(o, v, opts.color, opts.size * (0.7 + rng() * 0.6), { period: opts.period, lifetime: opts.period, phase, grow: opts.grow ?? 0.25 }, { drag: 0.15, jitter: opts.spread * 0.3, fadeIn: 0.12 });
  }
}

/**
 * A burst of spray from `at` (a wave on rocks, a splash): white droplets thrown up and out,
 * falling back. `time` is when (within its loop) the burst happens.
 */
export function splash(p: Particles, rng: Rng, at: V3, opts: { count: number; speed: number; up: number; size: number; period: number; time: number; spread?: number; color?: THREE.ColorRepresentation; dir?: V3 }): void {
  const lifetime = Math.min(opts.period, (2 * opts.up) / 9.8 + 0.6);
  const phase = (((-opts.time % opts.period) + opts.period) % opts.period);
  const d = opts.dir ?? [0, 0, 0];
  for (let i = 0; i < opts.count; i++) {
    const a = rng() * Math.PI * 2;
    const out = opts.speed * (0.3 + rng() * 0.7);
    const v: V3 = [Math.cos(a) * out + d[0], opts.up * (0.5 + rng() * 0.6), Math.sin(a) * out + d[2]];
    const o: V3 = [at[0] + (rng() - 0.5) * (opts.spread ?? 0), at[1], at[2] + (rng() - 0.5) * (opts.spread ?? 0)];
    p.add(o, v, opts.color ?? FOAM, opts.size * (0.6 + rng() * 0.8), { period: opts.period, lifetime, phase, grow: 0.5 }, { gravity: 9.8, drag: 0.4, fadeIn: 0.03 });
  }
}

/**
 * A trail of puffs laid along a moving part's path: puff i sits where the part is at time
 * `when(i)` and appears exactly then, so the trail is drawn behind it as it goes.
 */
export function trail(p: Particles, rng: Rng, points: readonly V3[], when: (i: number) => number, opts: { color: THREE.ColorRepresentation; size: number; period: number; lifetime: number; drift?: V3; grow?: number; jitter?: number }): void {
  const drift = opts.drift ?? [0, 0, 0];
  points.forEach((pt, i) => {
    const t = when(i);
    const phase = (((-t % opts.period) + opts.period) % opts.period);
    p.add(pt, [drift[0] + (rng() - 0.5), drift[1] + (rng() - 0.5), drift[2] + (rng() - 0.5)], opts.color, opts.size * (0.8 + rng() * 0.4), { period: opts.period, lifetime: opts.lifetime, phase, grow: opts.grow ?? 0.12 }, { drag: 0.3, jitter: opts.jitter ?? 0, fadeIn: 0.02 });
  });
}

/** A ring of flat foam shards on the water round a point, breathing in and out. */
export function foamRing(kit: Kit, at: V3, r: number, shards: number, width: number, breathe: number, freq: number): void {
  for (let i = 0; i < shards; i++) {
    const a0 = (i / shards) * Math.PI * 2 + kit.rng() * 0.2;
    const a1 = a0 + (Math.PI * 2) / shards * (0.6 + kit.rng() * 0.5);
    const rr = r * (0.9 + kit.rng() * 0.25);
    const g = new THREE.BufferGeometry();
    const p = (a: number, rad: number): V3 => [at[0] + Math.cos(a) * rad, at[1], at[2] + Math.sin(a) * rad];
    const am = (a0 + a1) / 2;
    g.setAttribute('position', new THREE.Float32BufferAttribute([...p(a0, rr), ...p(am, rr + width), ...p(a1, rr), ...p(a0, rr), ...p(am, rr - width * 0.4), ...p(a1, rr)], 3));
    const motion: Motion = { drift: [Math.cos(am) * breathe, 0, Math.sin(am) * breathe], driftFreq: freq, phase: i * 0.9 };
    kit.moving.add(g, FOAM, undefined, motion);
  }
}

/** A flat V of foam behind a boat moving toward +X (in its own frame `m`), as a wake. */
export function wake(length: number, width: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const w = width / 2;
  const arm = (side: number): number[] => [0, 0, side * w * 0.3, -length, 0, side * w, -length, 0, side * (w - width * 0.3)];
  g.setAttribute('position', new THREE.Float32BufferAttribute([...arm(1), ...arm(-1)], 3));
  return g;
}

/** Where a point at `p` ends up after turning `angle` about the axis through `hub`. */
export function orbit(p: V3, hub: V3, axis: V3, angle: number): V3 {
  const v = new THREE.Vector3(p[0] - hub[0], p[1] - hub[1], p[2] - hub[2]).applyAxisAngle(new THREE.Vector3(...axis).normalize(), angle);
  return [hub[0] + v.x, hub[1] + v.y, hub[2] + v.z];
}
