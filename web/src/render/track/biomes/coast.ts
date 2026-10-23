import * as THREE from 'three';
import { mulberry32, range, type Rng } from '../../../core/rng.ts';
import type { BeachScenery } from '../../../data/tracks/scenery.ts';
import { FlatBuilder, type P3 } from '../builder.ts';
import { HORIZON_MAX, HORIZON_MIN, RIDGE_RISE, SEA_LEVEL, type Quality } from '../config.ts';
import type { Corridor } from '../corridor.ts';
import type { Ground } from '../ground.ts';
import { instanced, palm, type Placement } from '../instanced.ts';
import { quadFacing } from '../paint.ts';

// The coast's dressing: islands and headlands on the horizon, sea stacks near the course,
// beach life along it (palms, huts, lifeguard towers, surf flags, dune grass), buoys on the
// lagoon boundaries and gulls wheeling overhead.

const ISLAND_GREEN = new THREE.Color(0x4f8a3e);
const GRASS = new THREE.Color(0x8aa64a);
const BUOY_RED = new THREE.Color(0xf0402a);
/** Props stand on land between these heights over the sea (beach and dune, not cliff). */
const BEACH_Y: [number, number] = [0.6, 9];
/** Sea stacks stand in water at least this deep, and this far from the course. */
const STACK_DEPTH = 2;
const STACK_CLEAR = 60;
const GULLS = { low: 18, high: 48 } as const;
const GULL_RING: [number, number] = [40, 140];
const GULL_HEIGHT: [number, number] = [25, 70];
const LOW_PROPS = 0.5;

/** Stacked rings (radius, height) round a centre, colours per ring from `tone`. */
function lathe(b: FlatBuilder, c: P3, rings: [number, number][], sides: number, rng: Rng, tone: (y: number, ring: number) => THREE.Color) {
  const jit = Array.from({ length: sides }, () => range(rng, 0.75, 1.25));
  const rot = rng() * Math.PI;
  const pts = rings.map(([r, h]) =>
    jit.map((j, i) => {
      const a = rot + (i / sides) * Math.PI * 2;
      return { x: c.x + Math.cos(a) * r * j, y: c.y + h, z: c.z + Math.sin(a) * r * j };
    }),
  );
  for (let r = 0; r + 1 < pts.length; r++) {
    for (let i = 0; i < sides; i++) {
      const k = (i + 1) % sides;
      const A = pts[r][i];
      quadFacing(b, A, pts[r][k], pts[r + 1][k], pts[r + 1][i], { x: A.x - c.x, y: 0, z: A.z - c.z }, tone(A.y, r), tone(A.y, r), tone(pts[r + 1][i].y, r + 1), tone(pts[r + 1][i].y, r + 1));
    }
  }
  const top = pts[pts.length - 1];
  const topC = { x: c.x, y: c.y + rings[rings.length - 1][1] + 1, z: c.z };
  const col = tone(topC.y, rings.length);
  for (let i = 0; i < sides; i++) b.tri(top[(i + 1) % sides], top[i], topC, col);
}

/** Islands and headlands on the horizon; sea stacks (some joined by an arch) near the course. */
export function buildCoastHorizon(cor: Corridor, scenery: BeachScenery, quality: Quality, seed: number): FlatBuilder {
  const b = new FlatBuilder();
  const rng = mulberry32(seed ^ 0x51a7);
  const ground = cor.ground;
  const S = ground.views.flatMap((v) => v.ribbon.samples);
  let cx = 0;
  let cz = 0;
  for (const s of S) {
    cx += s.pos.x / S.length;
    cz += s.pos.z / S.length;
  }
  const radius = Math.max(...S.map((s) => Math.hypot(s.pos.x - cx, s.pos.z - cz)));
  const paint = cor.paint;
  const rock = (y: number) => paint.strata(y, 1, new THREE.Color());
  const sides = quality === 'high' ? 10 : 7;
  // Islands: sand skirt, rock cliffs, green crown.
  for (let i = 0, tries = 0; i < scenery.islands && tries < scenery.islands * 20; tries++) {
    const a = rng() * Math.PI * 2;
    const dist = radius + range(rng, HORIZON_MIN, HORIZON_MAX);
    const c = { x: cx + Math.cos(a) * dist, y: SEA_LEVEL - 4, z: cz + Math.sin(a) * dist };
    const r = range(rng, 120, 380);
    if (!ground.clearOfCourse(c.x, c.z, r * 1.5)) continue;
    const h = range(rng, 30, 140);
    lathe(b, c, [[r * 1.5, 0], [r * 1.25, 5], [r * 1.05, h * 0.25], [r * 0.85, h * 0.7], [r * 0.55, h], [r * 0.3, h * 1.08]], sides, rng, (y, ring) =>
      ring <= 1 ? paint.sand.clone() : ring >= 4 ? ISLAND_GREEN.clone().multiplyScalar(0.9 + 0.2 * rng()) : rock(y),
    );
    i++;
  }
  // Sea stacks: tall eroded pillars in open water near the course.
  const stacks: P3[] = [];
  for (let i = 0, tries = 0; i < scenery.stacks && tries < scenery.stacks * 40; tries++) {
    const k = Math.floor(rng() * S.length);
    const a = rng() * Math.PI * 2;
    const dist = STACK_CLEAR + 40 + rng() * 500;
    const x = S[k].pos.x + Math.cos(a) * dist;
    const z = S[k].pos.z + Math.sin(a) * dist;
    if (SEA_LEVEL - ground.meshHeight(x, z) < STACK_DEPTH || !ground.clearOfCourse(x, z, STACK_CLEAR)) continue;
    const r = range(rng, 8, 22);
    const h = range(rng, 25, 70);
    const c = { x, y: SEA_LEVEL - 6, z };
    lathe(b, c, [[r * 1.4, 0], [r * 1.1, 7], [r, h * 0.5], [r * 0.85, h * 0.85], [r * 1.05, h * 0.93], [r * 0.7, h]], 7, rng, (y, ring) => (ring >= 5 ? GRASS.clone() : rock(y)));
    stacks.push({ x, y: h, z });
    i++;
  }
  // Join the odd pair of close stacks with a rock arch.
  for (let i = 0; i + 1 < stacks.length; i += 3) {
    const p = stacks[i];
    const q = stacks.find((o, j) => j !== i && Math.hypot(o.x - p.x, o.z - p.z) < 90 && Math.hypot(o.x - p.x, o.z - p.z) > 30);
    if (!q) continue;
    const y = Math.min(p.y, q.y) * 0.75;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const l = Math.hypot(dx, dz);
    const nx = (-dz / l) * 6;
    const nz = (dx / l) * 6;
    const col = rock(y);
    const c = (o: P3, yy: number, s: number): P3 => ({ x: o.x + nx * s, y: yy, z: o.z + nz * s });
    const lo = y - 7;
    for (const s of [-1, 1]) quadFacing(b, c(p, lo, s), c(q, lo, s), c(q, y, s), c(p, y, s), { x: nx * s, y: 0, z: nz * s }, col);
    quadFacing(b, c(p, y, -1), c(q, y, -1), c(q, y, 1), c(p, y, 1), { x: 0, y: 1, z: 0 }, col);
    quadFacing(b, c(p, lo, -1), c(q, lo, -1), c(q, lo, 1), c(p, lo, 1), { x: 0, y: -1, z: 0 }, col);
  }
  return b;
}

// --- Beach props (instanced) -------------------------------------------------------------

function hut(): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const wall = new THREE.Color(0xf2e6cc);
  const roof = new THREE.Color(0xc8504a);
  const stilt = new THREE.Color(0x7a5434);
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: THREE.Color) => {
    const p = (i: number): P3 => ({ x: i & 1 ? x1 : x0, y: i & 4 ? y1 : y0, z: i & 2 ? z1 : z0 });
    const m = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 };
    for (const [a, bb, cc, d] of [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]) {
      const f = { x: (p(a).x + p(cc).x) / 2 - m.x, y: (p(a).y + p(cc).y) / 2 - m.y, z: (p(a).z + p(cc).z) / 2 - m.z };
      quadFacing(b, p(a), p(bb), p(cc), p(d), f, c);
    }
  };
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) box(x - 0.15, -1, z - 0.15, x + 0.15, 1.2, z + 0.15, stilt);
  box(-2.4, 1.2, -2.4, 2.4, 4, 2.4, wall);
  // Pitched roof.
  const r = (x: number, y: number, z: number): P3 => ({ x, y, z });
  quadFacing(b, r(-3, 4, -3), r(3, 4, -3), r(3, 6, 0), r(-3, 6, 0), { x: 0, y: 1, z: -1 }, roof);
  quadFacing(b, r(-3, 4, 3), r(3, 4, 3), r(3, 6, 0), r(-3, 6, 0), { x: 0, y: 1, z: 1 }, roof);
  b.tri(r(-3, 4, -3), r(-3, 6, 0), r(-3, 4, 3), wall);
  b.tri(r(3, 4, -3), r(3, 4, 3), r(3, 6, 0), wall);
  return finish(b);
}

function tower(): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const wood = new THREE.Color(0xe8e0d0);
  const red = new THREE.Color(0xe8402e);
  const leg = (x: number, z: number) => quadFacing(b, { x: x - 0.12, y: -1, z }, { x: x + 0.12, y: -1, z }, { x: x * 0.6 + 0.12, y: 5, z: z * 0.6 }, { x: x * 0.6 - 0.12, y: 5, z: z * 0.6 }, { x: 0, y: 0, z: -1 }, wood);
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) leg(x, z);
  const box = (y0: number, y1: number, s: number, c: THREE.Color) => {
    const p = (x: number, y: number, z: number): P3 => ({ x, y, z });
    for (const [a, bb, n] of [
      [p(-s, y0, -s), p(s, y0, -s), { x: 0, y: 0, z: -1 }],
      [p(s, y0, -s), p(s, y0, s), { x: 1, y: 0, z: 0 }],
      [p(s, y0, s), p(-s, y0, s), { x: 0, y: 0, z: 1 }],
      [p(-s, y0, s), p(-s, y0, -s), { x: -1, y: 0, z: 0 }],
    ] as const) {
      quadFacing(b, a, bb, { ...bb, y: y1 }, { ...a, y: y1 }, n, c);
    }
    quadFacing(b, p(-s, y1, -s), p(s, y1, -s), p(s, y1, s), p(-s, y1, s), { x: 0, y: 1, z: 0 }, c);
  };
  box(5, 7.5, 1.4, wood);
  box(7.5, 8, 1.8, red);
  // Flag.
  quadFacing(b, { x: 0, y: 8, z: 0 }, { x: 0.1, y: 8, z: 0 }, { x: 0.1, y: 11, z: 0 }, { x: 0, y: 11, z: 0 }, { x: 0, y: 0, z: -1 }, wood);
  quadFacing(b, { x: 0, y: 9.8, z: 0 }, { x: 1.8, y: 10.2, z: 0 }, { x: 1.8, y: 11, z: 0 }, { x: 0, y: 11, z: 0 }, { x: 0, y: 0, z: -1 }, red);
  quadFacing(b, { x: 0, y: 9.8, z: 0 }, { x: 1.8, y: 10.2, z: 0 }, { x: 1.8, y: 11, z: 0 }, { x: 0, y: 11, z: 0 }, { x: 0, y: 0, z: 1 }, red);
  return finish(b);
}

function grass(): THREE.BufferGeometry {
  const b = new FlatBuilder();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const tip = { x: Math.cos(a) * 1.3, y: 1.6 + (i % 3) * 0.4, z: Math.sin(a) * 1.3 };
    const w = { x: -Math.sin(a) * 0.25, z: Math.cos(a) * 0.25 };
    for (const s of [1, -1]) b.tri({ x: w.x * s, y: -0.2, z: w.z * s }, { x: -w.x * s, y: -0.2, z: -w.z * s }, tip, GRASS.clone().multiplyScalar(0.8), GRASS.clone().multiplyScalar(0.8), GRASS.clone().multiplyScalar(1.15));
  }
  return finish(b);
}

function surfFlag(): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const pole = new THREE.Color(0xf4f0e8);
  const cloth = [new THREE.Color(0xffd23a), new THREE.Color(0xe8402e)];
  quadFacing(b, { x: -0.08, y: -0.5, z: 0 }, { x: 0.08, y: -0.5, z: 0 }, { x: 0.08, y: 7, z: 0 }, { x: -0.08, y: 7, z: 0 }, { x: 0, y: 0, z: -1 }, pole);
  // A tall teardrop beach banner, two colours.
  b.tri({ x: 0, y: 2.2, z: 0 }, { x: 1.2, y: 4.5, z: 0 }, { x: 0, y: 7, z: 0 }, cloth[0]);
  b.tri({ x: 0, y: 2.2, z: 0 }, { x: 0, y: 7, z: 0 }, { x: 1.2, y: 4.5, z: 0 }, cloth[1]);
  return finish(b);
}

function buoy(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.9, 2.4, 8);
  g.translate(0, 1, 0);
  const colors: number[] = [];
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const c = pos.getY(i) > 1.4 ? new THREE.Color(0xf4f0e8) : BUOY_RED;
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g.toNonIndexed();
}

function gull(): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const white = new THREE.Color(0xf8f8f4);
  const tip = new THREE.Color(0x3a3a40);
  for (const s of [1, -1]) {
    b.tri({ x: 0, y: 0, z: -0.3 }, { x: s * 1.6, y: 0.5, z: 0 }, { x: 0, y: 0, z: 0.4 }, white, tip, white);
    b.tri({ x: 0, y: 0, z: -0.3 }, { x: 0, y: 0, z: 0.4 }, { x: s * 1.6, y: 0.5, z: 0 }, white, white, tip);
  }
  return finish(b);
}

function finish(b: FlatBuilder): THREE.BufferGeometry {
  const g = b.build();
  if (!g) throw new Error('coast prop geometry is empty');
  return g;
}

export interface CoastLife {
  meshes: THREE.InstancedMesh[];
  update(time: number): void;
  dispose(): void;
}

/** Beach life along the course plus lagoon buoys and gulls. */
export function buildCoastLife(
  main: Corridor,
  buoys: P3[],
  ground: Ground,
  scenery: BeachScenery,
  quality: Quality,
  lit: THREE.Material,
  seed: number,
): CoastLife {
  const rng = mulberry32(seed ^ 0xbea7);
  const track = main.ribbon;
  const keep = quality === 'high' ? 1 : LOW_PROPS;
  const spots = (perKm: number, minOut: number, spread: number): Placement[] => {
    const out: Placement[] = [];
    const want = Math.round((perKm * track.length * keep) / 1000);
    for (let tries = 0; out.length < want && tries < want * 8; tries++) {
      const k = Math.floor(rng() * track.samples.length);
      const side = rng() < 0.5 ? -1 : 1;
      const p = main.beside(k, side, RIDGE_RISE + minOut + rng() * spread, 0);
      const y = ground.meshHeight(p.x, p.z);
      if (y < SEA_LEVEL + BEACH_Y[0] || y > SEA_LEVEL + BEACH_Y[1] || !ground.clearOfCourse(p.x, p.z, 3)) continue;
      const yaw = Math.atan2(main.shape.rx[k] * side, main.shape.rz[k] * side) + (rng() - 0.5) * 0.6;
      out.push({ pos: { x: p.x, y, z: p.z }, yaw, scale: { x: 1, y: range(rng, 0.85, 1.2), z: 1 } });
    }
    return out;
  };
  const geos = [palm(), hut(), tower(), surfFlag(), grass(), buoy(), gull()];
  const meshes = [
    instanced(geos[0], lit, spots(scenery.palmsPerKm, 4, 90), 'palms'),
    instanced(geos[1], lit, spots(scenery.hutsPerKm, 12, 60), 'huts'),
    instanced(geos[2], lit, spots(scenery.hutsPerKm * 0.4, 6, 30), 'lifeguardTowers'),
    instanced(geos[3], lit, spots(scenery.hutsPerKm * 0.8, 2, 20), 'surfFlags'),
    instanced(geos[4], lit, spots(scenery.palmsPerKm * 3, 2, 70), 'duneGrass'),
  ].filter((m): m is THREE.InstancedMesh => m !== null);
  const buoyMesh = instanced(geos[5], lit, buoys.map((p) => ({ pos: { ...p }, yaw: 0, scale: { x: 1, y: 1, z: 1 } })), 'buoys');
  if (buoyMesh) meshes.push(buoyMesh);
  // Gulls circle over beaches near the course.
  const flock = Array.from({ length: GULLS[quality] }, () => {
    const k = Math.floor(rng() * track.samples.length);
    const c = track.samples[k].pos;
    return { cx: c.x, cz: c.z, r: range(rng, GULL_RING[0], GULL_RING[1]), y: range(rng, GULL_HEIGHT[0], GULL_HEIGHT[1]) + c.y, w: range(rng, 0.25, 0.5) * (rng() < 0.5 ? -1 : 1), a: rng() * 6.3 };
  });
  const gulls = new THREE.InstancedMesh(geos[6], lit, flock.length);
  gulls.name = 'gulls';
  gulls.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  meshes.push(gulls);
  const update = (time: number) => {
    flock.forEach((g, i) => {
      const a = g.a + time * g.w;
      pos.set(g.cx + Math.cos(a) * g.r, g.y + Math.sin(time * 1.3 + g.a) * 2, g.cz + Math.sin(a) * g.r);
      // Bank into the circle; flap by tilting the wings.
      e.set(Math.sin(time * 6 + g.a) * 0.25, -a - (g.w > 0 ? 0 : Math.PI), g.w > 0 ? -0.35 : 0.35);
      q.setFromEuler(e);
      m.compose(pos, q, one);
      gulls.setMatrixAt(i, m);
    });
    gulls.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return {
    meshes,
    update,
    dispose() {
      for (const g of geos) g.dispose();
    },
  };
}

