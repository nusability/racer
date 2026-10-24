import * as THREE from 'three';
import { mulberry32 } from '../../core/rng.ts';
import type { Obstacle } from '../../core/types.ts';
import type { FlatBuilder, P3 } from './builder.ts';
import { RUNOFF_MIN } from './config.ts';
import type { Corridor } from './corridor.ts';
import { quadFacing } from './paint.ts';
import type { PillarLook } from './biomes/kit.ts';

// What stands on the road: arches and pillars (rock, or in a forest giant trunks). Their visual
// radius matches the collision cylinders in core/track.ts so a racer never clips what it can't
// see, or hits air. Drawn here for every kit, so no kit can leave an obstacle undrawn.

/** Thickness of an arch span (vertical) and its depth along the road. */
const ARCH_THICKNESS = 6.5;
export const ARCH_DEPTH = 7;
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

export function buildRockFeatures(cor: Corridor, seed: number, pillar: PillarLook): void {
  const rng = mulberry32(seed ^ 0x51ab);
  const track = cor.ribbon;
  for (const o of track.obstacles) {
    if (o.kind !== 'pillar') continue;
    if (pillar.kind === 'trunk') trunk(cor, cor.chunkAt(o.s).rock, o, pillar, rng);
    else column(cor, cor.chunkAt(o.s).rock, o, PILLAR_RINGS, rng);
  }
  for (const a of track.arches) {
    const legs = track.obstacles.filter((o) => o.kind === 'archLeg' && Math.abs(track.delta(o.s, a.s)) < 0.01);
    const env = cor.chunkAt(a.s).rock;
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
  const track = cor.ribbon;
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
  const track = cor.ribbon;
  // The span ties into the walls where the course is walled; over open run-off it ends just
  // past the legs, so the sand round the outside stays open sky.
  const walled = (x: number) => (x < 0 ? -track.minXAt(s) : track.maxXAt(s)) - track.widthAt(s) / 2 < RUNOFF_MIN;
  const legMin = Math.min(...legs.map((l) => l.x - l.radius));
  const legMax = Math.max(...legs.map((l) => l.x + l.radius));
  const xMin = walled(-1) ? Math.min(legMin, track.minXAt(s) - ARCH_OVERHANG) : legMin - 1;
  const xMax = walled(1) ? Math.max(legMax, track.maxXAt(s) + ARCH_OVERHANG) : legMax + 1;
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

// --- Giant trunks (a forest's pillars) ---------------------------------------------------------

/**
 * The colliding part of a trunk: ring heights (share of the obstacle's height) and radius
 * multipliers, all ≥ 1 so the bark covers the cylinder wherever a racer can be. The root flare
 * at the foot is kept low and slight: a hovering craft must never sink into roots it can't hit.
 */
const TRUNK_LOW: [number, number][] = [
  [-0.06, 1.3],
  [0, 1.24],
  [0.035, 1.08],
  [0.12, 1.02],
  [0.5, 1.0],
  [1.0, 1.0],
];
/** Above what collides the trunk tapers on up to its crown: share of the rest of its height, radius. */
const TRUNK_HIGH: [number, number][] = [
  [0.4, 0.86],
  [0.8, 0.68],
  [1.0, 0.56],
];
/** Facets round a trunk: alternate ones are bark ridges and furrows. */
const TRUNK_SIDES = 14;
/** Furrows spiral this far (radians) per ring. */
const TRUNK_TWIST = 0.05;
/** Bark ridge / furrow shades, and how much moss climbs the shaded side up to this share of the height. */
const RIDGE_SHADE = 1.12;
const FURROW_SHADE = 0.62;
const MOSS_REACH = 0.35;
/** Crown clumps at the top: how many, their size (× the trunk radius) and how far out they hang. */
const CROWN_CLUMPS = 5;
const CROWN_SIZE = 3.2;
const CROWN_OUT = 2.6;
const CROWN_GREEN = 0x2f4a22;

/** A giant living trunk round a pillar obstacle, following the banked road frame, crowned far above. */
function trunk(cor: Corridor, b: FlatBuilder, o: Obstacle, look: Extract<PillarLook, { kind: 'trunk' }>, rng: () => number) {
  const track = cor.ribbon;
  const top = Math.max(look.height, o.height);
  const rings: [number, number][] = [...TRUNK_LOW.map(([f, m]): [number, number] => [f * o.height, m]), ...TRUNK_HIGH.map(([f, m]): [number, number] => [o.height + f * (top - o.height), m])];
  const bark = new THREE.Color(look.bark);
  const moss = new THREE.Color(look.moss);
  const twist0 = rng() * Math.PI;
  const shades = Array.from({ length: TRUNK_SIDES }, (_, i) => (i % 2 ? FURROW_SHADE : RIDGE_SHADE) * (0.92 + rng() * 0.16));
  // Moss climbs one side of each trunk, thickest at the foot.
  const mossSide = Math.floor(rng() * TRUNK_SIDES);
  const ringPts: P3[][] = rings.map(([y, m], ri) =>
    Array.from({ length: TRUNK_SIDES }, (_, i) => {
      const ang = twist0 + ri * TRUNK_TWIST + (i / TRUNK_SIDES) * Math.PI * 2;
      // Facet centres sit at r·cos(π/n): push out so even flat faces cover the radius.
      const r = (o.radius * m) / Math.cos(Math.PI / TRUNK_SIDES);
      return track.toWorld(o.s + Math.cos(ang) * r, o.x + Math.sin(ang) * r, y);
    }),
  );
  const ca = new THREE.Color();
  const cb = new THREE.Color();
  const tint = (out: THREE.Color, i: number, y: number) => {
    out.copy(bark).multiplyScalar(shades[i]);
    const d = Math.min(Math.abs(i - mossSide), TRUNK_SIDES - Math.abs(i - mossSide));
    const climb = 1 - Math.min(1, Math.max(0, y) / (top * MOSS_REACH));
    if (d <= 2) out.lerp(moss, climb * (1 - d / 3));
    return out;
  };
  for (let r = 0; r + 1 < ringPts.length; r++) {
    const A = ringPts[r];
    const B = ringPts[r + 1];
    for (let i = 0; i < TRUNK_SIDES; i++) {
      const j = (i + 1) % TRUNK_SIDES;
      const c = track.toWorld(o.s, o.x, (rings[r][0] + rings[r + 1][0]) / 2);
      const mid = { x: (A[i].x + A[j].x) / 2, z: (A[i].z + A[j].z) / 2 };
      quadFacing(b, A[i], A[j], B[j], B[i], { x: mid.x - c.x, y: 0, z: mid.z - c.z }, tint(ca, i, rings[r][0]), ca, tint(cb, i, rings[r + 1][0]), cb);
    }
  }
  // Crown: leafy clumps round the top, hanging out over the road.
  const green = new THREE.Color(CROWN_GREEN);
  for (let k = 0; k < CROWN_CLUMPS; k++) {
    const a = (k / CROWN_CLUMPS) * Math.PI * 2 + rng();
    const out = o.radius * CROWN_OUT * (k === 0 ? 0.3 : 1);
    const c = track.toWorld(o.s + Math.cos(a) * out, o.x + Math.sin(a) * out, top - o.radius * (k === 0 ? -1 : 1.5 + rng()));
    clump(b, c, o.radius * CROWN_SIZE * (0.8 + rng() * 0.4), green.clone().multiplyScalar(0.8 + rng() * 0.4), rng);
  }
}

/** An irregular, flattened leafy clump (an icosahedron, squashed and jittered) round c. */
function clump(b: FlatBuilder, c: P3, r: number, col: THREE.Color, rng: () => number) {
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const p = ico.getAttribute('position');
  const jit = Array.from({ length: 12 }, () => 0.8 + rng() * 0.4);
  // Shared corners get the same jitter, so the clump stays closed.
  const key = (x: number, y: number, z: number) => Math.round(x * 97 + y * 31 + z * 7) % 12;
  const at = (i: number): P3 => {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = jit[(key(x, y, z) + 12) % 12];
    return { x: c.x + x * r * k, y: c.y + y * r * k * CLUMP_SQUASH, z: c.z + z * r * k };
  };
  const top = col.clone().multiplyScalar(1.25);
  for (let i = 0; i < p.count; i += 3) {
    const lit = p.getY(i) + p.getY(i + 1) + p.getY(i + 2) > 0;
    b.tri(at(i), at(i + 1), at(i + 2), lit ? top : col);
  }
  ico.dispose();
}
/** Crown clumps are this much flatter than they are wide. */
const CLUMP_SQUASH = 0.55;

