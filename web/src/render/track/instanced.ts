import * as THREE from 'three';
import { mulberry32, range, type Rng } from '../../core/rng.ts';
import type { TrackScenery } from '../../data/tracks/scenery.ts';
import { FlatBuilder, type P3 } from './builder.ts';
import { RIDGE_RISE, RUNOFF_MIN, type Quality } from './config.ts';
import { sideIndex } from './shape.ts';
import type { Corridor } from './corridor.ts';
import { quadFacing } from './paint.ts';

// Repeated props as InstancedMesh: one draw call per kind however many stand around the lap.

/** Icosahedron facets sit inside the vertex radius; scale out so the rock covers the cylinder. */
const ICO_COVER = 1.26;
/** Scatter never lands closer than this past the corridor's reach. */
const SCATTER_CLEAR = 6;
const SCATTER_SPREAD = 220;
/** Low quality keeps this share of the decorative scatter (gameplay boulders always stay). */
const LOW_SCATTER = 0.5;
const PALMS_PER_OASIS = 26;
const POOL_RADIUS = 34;
/** Oasis pools sit this far past the road edge. */
const POOL_SETBACK = 55;

interface Placement {
  pos: P3;
  yaw: number;
  scale: P3;
  color?: THREE.Color;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: Placement[], name: string): THREE.InstancedMesh | null {
  if (list.length === 0) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  list.forEach((p, i) => {
    q.setFromAxisAngle(up, p.yaw);
    m.compose(new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z), q, new THREE.Vector3(p.scale.x, p.scale.y, p.scale.z));
    mesh.setMatrixAt(i, m);
    if (p.color) mesh.setColorAt(i, p.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = name;
  return mesh;
}

/** Spots off the corridor (clear of every part of the lap) for decorative props. */
function scatterSpots(cor: Corridor, count: number, rng: Rng, minOut: number, spread: number): { pos: P3; k: number }[] {
  const out: { pos: P3; k: number }[] = [];
  const n = cor.n;
  for (let tries = 0; out.length < count && tries < count * 6; tries++) {
    const k = Math.floor(rng() * n);
    const side = rng() < 0.5 ? -1 : 1;
    const reach = cor.shape.outer[sideIndex(side)][k] - cor.edge(k, side);
    const p = cor.beside(k, side, reach + minOut + rng() * rng() * spread, 0);
    if (!cor.ground.clearOfCourse(p.x, p.z, SCATTER_CLEAR)) continue;
    p.y = cor.ground.meshHeight(p.x, p.z);
    out.push({ pos: p, k });
  }
  return out;
}

export function buildInstanced(cor: Corridor, scenery: TrackScenery, quality: Quality, mat: THREE.Material, seed: number): THREE.InstancedMesh[] {
  const rng = mulberry32(seed ^ 0x1ce);
  const track = cor.ribbon;
  const meshes: THREE.InstancedMesh[] = [];
  const keep = quality === 'high' ? 1 : LOW_SCATTER;
  const scatterCount = Math.round((scenery.scatterPerKm * track.length * keep) / 1000);

  // Boulders: the gameplay ones on the road, plus loose rocks off it when the theme is rocks.
  const rocks: Placement[] = [];
  const rockCol = new THREE.Color();
  for (const o of track.obstacles) {
    if (o.kind !== 'boulder') continue;
    const r = o.radius * ICO_COVER;
    const pos = track.toWorld(o.s, o.x, o.height / 2 - o.radius * 0.1);
    rocks.push({ pos, yaw: rng() * 6.3, scale: { x: r, y: o.height * 0.62, z: r }, color: cor.paint.strata(pos.y + rng() * 9, 0.9, rockCol).clone() });
  }
  if (scenery.scatter === 'rocks') {
    for (const spot of scatterSpots(cor, scatterCount, rng, SCATTER_CLEAR, SCATTER_SPREAD)) {
      const r = range(rng, 1.5, 9) * (rng() < 0.1 ? 2.2 : 1);
      rocks.push({ pos: { ...spot.pos, y: spot.pos.y + r * 0.2 }, yaw: rng() * 6.3, scale: { x: r, y: r * range(rng, 0.5, 0.9), z: r * range(rng, 0.8, 1.3) }, color: cor.paint.strata(spot.pos.y + rng() * 9, 0.9, rockCol).clone() });
    }
  }
  const ico = new THREE.IcosahedronGeometry(1, quality === 'high' ? 1 : 0);
  ico.setAttribute('color', new THREE.Float32BufferAttribute(new Array(ico.attributes.position.count * 3).fill(1), 3));
  const rockMesh = instanced(ico, mat, rocks, 'boulders');
  if (rockMesh) meshes.push(rockMesh);

  if (scenery.scatter !== 'rocks') {
    const geo = scenery.scatter === 'cacti' ? cactus() : scenery.scatter === 'bones' ? rib() : shard();
    const list: Placement[] = scatterSpots(cor, scatterCount, rng, SCATTER_CLEAR, SCATTER_SPREAD).map((spot) => {
      const sc = range(rng, 0.7, 1.4);
      const k = track.samples[spot.k];
      // Ribs lean in toward the road like a ribcage the course runs through.
      const yaw = scenery.scatter === 'bones' ? Math.atan2(k.right.x, k.right.z) + (rng() < 0.5 ? 0 : Math.PI) : rng() * 6.3;
      return { pos: { ...spot.pos, y: spot.pos.y - 1 }, yaw, scale: { x: sc, y: sc * range(rng, 0.8, 1.3), z: sc } };
    });
    const m = instanced(geo, mat, list, `scatter-${scenery.scatter}`);
    if (m) meshes.push(m);
  }

  // Palm groves round a pool beside the road.
  const palms: Placement[] = [];
  for (const o of scenery.oases) {
    const s = track.paramToS(o.at);
    const k = Math.round(s / track.step) % track.samples.length;
    const pool = cor.beside(k, o.side, POOL_SETBACK, 0);
    for (let i = 0; i < PALMS_PER_OASIS; i++) {
      const ang = rng() * Math.PI * 2;
      const rr = POOL_RADIUS + 4 + rng() * 40;
      const x = pool.x + Math.cos(ang) * rr;
      const z = pool.z + Math.sin(ang) * rr;
      if (!cor.ground.clearOfCourse(x, z, 2)) continue;
      const sc = range(rng, 0.8, 1.25);
      palms.push({ pos: { x, y: cor.ground.meshHeight(x, z) - 0.5, z }, yaw: rng() * 6.3, scale: { x: sc, y: sc, z: sc } });
    }
    // A line of palms along the road edge too, so the oasis is felt at speed.
    for (let d = -150; d <= 150; d += 22) {
      const kk = (k + Math.round(d / track.step) + track.samples.length) % track.samples.length;
      if (track.samples[kk].gap || cor.tunnel(kk) || cor.shape.run[sideIndex(o.side)][kk] < RUNOFF_MIN) continue;
      const p = cor.beside(kk, o.side, RIDGE_RISE + 4 + rng() * 6, 0);
      palms.push({ pos: { ...p, y: cor.ground.meshHeight(p.x, p.z) }, yaw: rng() * 6.3, scale: { x: 1, y: range(rng, 0.9, 1.2), z: 1 } });
    }
  }
  const palmMesh = instanced(palm(), mat, palms, 'palms');
  if (palmMesh) meshes.push(palmMesh);
  return meshes;
}

// --- Prop geometry (built once, instanced) ---------------------------------------------------

/** Tapered tube through a list of centres, `sides` facets, radii per centre. */
function tube(b: FlatBuilder, centres: P3[], radii: number[], sides: number, col: THREE.Color, tip?: THREE.Color) {
  const rings = centres.map((c, i) =>
    Array.from({ length: sides }, (_, j) => {
      const a = (j / sides) * Math.PI * 2;
      return { x: c.x + Math.cos(a) * radii[i], y: c.y, z: c.z + Math.sin(a) * radii[i] };
    }),
  );
  for (let i = 0; i + 1 < rings.length; i++) {
    const cc = tip && i === rings.length - 2 ? tip : col;
    for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides;
      const mid = centres[i];
      const A = rings[i][j];
      quadFacing(b, A, rings[i][k], rings[i + 1][k], rings[i + 1][j], { x: A.x - mid.x, y: 0, z: A.z - mid.z }, col, col, cc, cc);
    }
  }
}

function finish(b: FlatBuilder): THREE.BufferGeometry {
  const g = b.build();
  if (!g) throw new Error('prop geometry is empty');
  return g;
}

function cactus(): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const green = new THREE.Color(0x4f7a34);
  const pale = new THREE.Color(0x7a9a48);
  tube(b, [{ x: 0, y: -1, z: 0 }, { x: 0, y: 6, z: 0 }, { x: 0, y: 9, z: 0 }, { x: 0, y: 9.8, z: 0 }], [0.75, 0.7, 0.62, 0.2], 6, green, pale);
  for (const side of [-1, 1]) {
    const x = side * 2.1;
    const y0 = side < 0 ? 3.2 : 4.4;
    tube(b, [{ x: side * 0.5, y: y0, z: 0 }, { x, y: y0 + 0.3, z: 0 }], [0.45, 0.45], 5, green);
    tube(b, [{ x, y: y0, z: 0 }, { x, y: y0 + 3.2, z: 0 }, { x, y: y0 + 3.8, z: 0 }], [0.48, 0.42, 0.12], 5, green, pale);
  }
  return finish(b);
}

function rib(): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const bone = new THREE.Color(0xeee4cc);
  const tip = new THREE.Color(0xcfc0a0);
  const centres: P3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    // A curved rib rising out of the sand and hooking over.
    centres.push({ x: 0, y: -2 + Math.sin(t * Math.PI * 0.62) * 26, z: -12 * (1 - Math.cos(t * Math.PI * 0.62)) });
    radii.push(1.6 * (1 - t * 0.7));
  }
  for (let i = 0; i + 1 < centres.length; i++) {
    tube(b, [centres[i], centres[i + 1]], [radii[i], radii[i + 1]], 5, bone, i === centres.length - 2 ? tip : bone);
  }
  return finish(b);
}

function shard(): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const glass = new THREE.Color(0x9ff0ff);
  const deep = new THREE.Color(0x3a6ad8);
  const rng = mulberry32(77);
  for (let c = 0; c < 3; c++) {
    const lean = { x: range(rng, -0.35, 0.35), z: range(rng, -0.35, 0.35) };
    const h = range(rng, 5, 14);
    const r = range(rng, 0.8, 1.8);
    const ox = range(rng, -2, 2);
    const oz = range(rng, -2, 2);
    const base = Array.from({ length: 5 }, (_, j) => {
      const a = (j / 5) * Math.PI * 2;
      return { x: ox + Math.cos(a) * r, y: -1, z: oz + Math.sin(a) * r };
    });
    const top = { x: ox + lean.x * h, y: h, z: oz + lean.z * h };
    for (let j = 0; j < 5; j++) b.tri(base[j], top, base[(j + 1) % 5], deep, glass, deep);
  }
  return finish(b);
}

function palm(): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const bark = new THREE.Color(0x7a5434);
  const frond = new THREE.Color(0x3f8a3a);
  const frondTip = new THREE.Color(0x8fb84a);
  const centres: P3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    centres.push({ x: 2.4 * t * t, y: -0.5 + 13 * t, z: 0 });
    radii.push(0.55 - 0.25 * t);
  }
  tube(b, centres, radii, 5, bark);
  const crown = centres[centres.length - 1];
  for (let f = 0; f < 9; f++) {
    const a = (f / 9) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const len = 6.5;
    const mid = { x: crown.x + dx * len * 0.5, y: crown.y + 1.2, z: crown.z + dz * len * 0.5 };
    const end = { x: crown.x + dx * len, y: crown.y - 2.2, z: crown.z + dz * len };
    const w = { x: -dz * 0.9, z: dx * 0.9 };
    const l = { x: mid.x + w.x, y: mid.y, z: mid.z + w.z };
    const r = { x: mid.x - w.x, y: mid.y, z: mid.z - w.z };
    for (const [p, q] of [[l, r], [r, l]] as const) {
      b.tri(crown, p, q, frond);
      b.tri(p, end, q, frond, frondTip, frond);
    }
  }
  return finish(b);
}
