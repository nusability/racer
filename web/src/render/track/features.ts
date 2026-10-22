import * as THREE from 'three';
import { mulberry32 } from '../../core/rng.ts';
import type { Obstacle } from '../../core/types.ts';
import type { FlatBuilder, P3 } from './builder.ts';
import type { Corridor } from './corridor.ts';
import { quadFacing } from './paint.ts';

// Rock that stands on the road: arches and pillars. Their visual radius matches the collision
// cylinders in core/track.ts so a racer never clips rock it can't see, or hits air.

/** Thickness of an arch span (vertical) and its depth along the road. */
const ARCH_THICKNESS = 6.5;
const ARCH_DEPTH = 7;
/** How far the underside of an arch bows up over its opening. */
const ARCH_BOW = 5;
/** How steeply the underside drops into the legs either side of the opening. */
const ARCH_HAUNCH = 1.1;
/** Extra height of the span's crown over its ends. */
const ARCH_DOME = 6;
/** Arch spans run past the road edge into the walls by this much. */
const ARCH_OVERHANG = 8;
/** Legs and pillars are buried this far so they never float on a banked road. */
const BURY = 3;
/** Pillar silhouette: ring heights (fraction of PILLAR_HEIGHT) and radius multipliers. The
 * first two rings are ≥ 1 so the rock always covers the collision radius at racer height. */
const PILLAR_RINGS: [number, number][] = [
  [-0.08, 1.14],
  [0.12, 1.04],
  [0.3, 0.94],
  [0.5, 1.02],
  [0.7, 0.86],
  [0.86, 1.18],
  [1.0, 1.28],
  [1.06, 0.9],
];
/** Polygon sides of legs and pillars. */
const ROCK_SIDES = 9;

export function buildRockFeatures(cor: Corridor, seed: number): void {
  const rng = mulberry32(seed ^ 0x51ab);
  const track = cor.track;
  for (const o of track.obstacles) {
    if (o.kind === 'pillar') column(cor, cor.envAt(o.s), o, PILLAR_RINGS, rng);
  }
  for (const a of track.arches) {
    const legs = track.obstacles.filter((o) => o.kind === 'archLeg' && Math.abs(track.delta(o.s, a.s)) < 0.01);
    const env = cor.envAt(a.s);
    const top = a.height + ARCH_THICKNESS;
    for (const leg of legs) {
      // Legs: straight-sided columns up into the span.
      const rings: [number, number][] = [
        [-BURY / top, 1.06],
        [0.35, 1.02],
        [0.75, 1.08],
        [1.05, 1.18],
      ];
      column(cor, env, { ...leg, height: top }, rings, rng);
    }
    span(cor, env, a.s, a.openMin, a.openMax, a.height, legs, rng);
  }
}

/** A rock column around an obstacle cylinder, following the banked road frame. */
function column(cor: Corridor, b: FlatBuilder, o: Obstacle, rings: [number, number][], rng: () => number) {
  const track = cor.track;
  const col = new THREE.Color();
  const col2 = new THREE.Color();
  const twist = rng() * Math.PI;
  const ringPts: P3[][] = rings.map(([f, m], ri) => {
    const pts: P3[] = [];
    for (let i = 0; i < ROCK_SIDES; i++) {
      const ang = twist + (i / ROCK_SIDES) * Math.PI * 2;
      // Facet centres sit at r·cos(π/n); push out so even flat faces cover the radius.
      const jitter = ri < 2 ? 1 + rng() * 0.05 : 0.9 + rng() * 0.22;
      const r = (o.radius * m * jitter) / Math.cos(Math.PI / ROCK_SIDES);
      pts.push(track.toWorld(o.s + Math.cos(ang) * r, o.x + Math.sin(ang) * r, f * o.height));
    }
    return pts;
  });
  const centre = (y: number) => track.toWorld(o.s, o.x, y);
  for (let r = 0; r + 1 < ringPts.length; r++) {
    const A = ringPts[r];
    const B = ringPts[r + 1];
    for (let i = 0; i < ROCK_SIDES; i++) {
      const j = (i + 1) % ROCK_SIDES;
      const mid = { x: (A[i].x + A[j].x) / 2, y: (A[i].y + B[i].y) / 2, z: (A[i].z + A[j].z) / 2 };
      const c = centre(mid.y - track.elevationAt(o.s));
      const out = { x: mid.x - c.x, y: 0, z: mid.z - c.z };
      cor.paint.strata(A[i].y, r === 0 ? 0.7 : 0.95, col);
      cor.paint.strata(B[i].y, 1, col2);
      quadFacing(b, A[i], A[j], B[j], B[i], out, col, col, col2, col2);
    }
  }
  const last = ringPts[ringPts.length - 1];
  const capC = centre(rings[rings.length - 1][0] * o.height + 1.5);
  cor.paint.strata(capC.y, 1.05, col);
  for (let i = 0; i < ROCK_SIDES; i++) {
    const j = (i + 1) % ROCK_SIDES;
    b.tri(last[j], last[i], capC, col);
  }
}

/** The span of an arch: a slab across the road whose underside bows up over the opening. */
function span(
  cor: Corridor,
  b: FlatBuilder,
  s: number,
  openMin: number,
  openMax: number,
  height: number,
  legs: Obstacle[],
  rng: () => number,
) {
  const track = cor.track;
  const half = track.widthAt(s) / 2;
  const xMin = Math.min(-half - ARCH_OVERHANG, ...legs.map((l) => l.x - l.radius));
  const xMax = Math.max(half + ARCH_OVERHANG, ...legs.map((l) => l.x + l.radius));
  const steps = 14;
  const xs: number[] = [];
  for (let i = 0; i <= steps; i++) xs.push(xMin + ((xMax - xMin) * i) / steps);
  xs.push(openMin, openMax);
  xs.sort((p, q) => p - q);
  // Underside: a bow over the opening, then curving down into the legs (which hide it), so the
  // span and legs read as one piece of rock.
  const under = (x: number) => {
    if (x <= openMin) return Math.max(0, height - (openMin - x) * ARCH_HAUNCH);
    if (x >= openMax) return Math.max(0, height - (x - openMax) * ARCH_HAUNCH);
    return height + ARCH_BOW * Math.sin((Math.PI * (x - openMin)) / (openMax - openMin));
  };
  const mid = (xMin + xMax) / 2;
  const halfSpan = (xMax - xMin) / 2;
  const crown = height + ARCH_BOW + ARCH_THICKNESS;
  const corners = xs.map((x) => {
    const u = under(x);
    const dome = crown + ARCH_DOME * (1 - ((x - mid) / halfSpan) ** 2) + rng() * 1.2;
    const t = Math.max(u + ARCH_THICKNESS * 0.6, dome);
    const d = ARCH_DEPTH / 2;
    return [track.toWorld(s - d, x, u), track.toWorld(s - d, x, t), track.toWorld(s + d, x, t), track.toWorld(s + d, x, u)];
  });
  const tan = track.frameAt(s).tangent;
  const fwd = { x: tan.x, y: tan.y, z: tan.z };
  const back = { x: -tan.x, y: -tan.y, z: -tan.z };
  const col = new THREE.Color();
  const dark = new THREE.Color();
  for (let i = 0; i + 1 < corners.length; i++) {
    const A = corners[i];
    const B = corners[i + 1];
    cor.paint.strata(A[1].y, 1, col);
    cor.paint.strata(A[0].y, 0.55, dark);
    quadFacing(b, A[0], B[0], B[1], A[1], back, dark, dark, col, col);
    quadFacing(b, A[3], B[3], B[2], A[2], fwd, dark, dark, col, col);
    quadFacing(b, A[1], B[1], B[2], A[2], { x: 0, y: 1, z: 0 }, col);
    quadFacing(b, A[0], B[0], B[3], A[3], { x: 0, y: -1, z: 0 }, dark);
  }
  const ends: [P3[], number][] = [
    [corners[0], -1],
    [corners[corners.length - 1], 1],
  ];
  for (const [E, side] of ends) {
    const r = track.frameAt(s).right;
    quadFacing(b, E[0], E[1], E[2], E[3], { x: r.x * side, y: 0, z: r.z * side }, col);
  }
}
