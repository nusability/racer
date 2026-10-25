import * as THREE from 'three';
import { SmoothBuilder } from './builder.ts';
import {
  SAND_TILE,
  TERRAIN_CELLS_FAR,
  TERRAIN_MARGIN,
  TERRAIN_NEAR_DIST,
  TERRAIN_SKIRT,
  TERRAIN_TILE,
  type Quality,
} from './config.ts';
import type { Ground } from './ground.ts';

/** Skirts are only glimpsed through hairline cracks; keep them close to the sand's tone. */
const SKIRT_SHADE = 0.95;
/** The flat apron past the terrain edge reaches this far out, into full fog. */
const APRON = 7000;
const UP = { x: 0, y: 1, z: 0 };

/**
 * Desert heightfield in tiles: tiles the course passes near get fine cells and their own mesh
 * (so they cull), the rest share one coarse mesh. Every tile hangs a skirt so resolution
 * changes between neighbours never open a crack.
 */
export function buildTerrain(ground: Ground, quality: Quality, nearCells: number, material: THREE.Material): THREE.Mesh[] {
  // Tile borders share vertices only when the coarse count divides the fine one.
  if (nearCells % TERRAIN_CELLS_FAR[quality] !== 0) throw new Error(`terrain: ${nearCells} near cells is not a multiple of ${TERRAIN_CELLS_FAR[quality]}`);
  const samples = ground.views.flatMap((v) => v.ribbon.samples);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of samples) {
    minX = Math.min(minX, p.pos.x);
    maxX = Math.max(maxX, p.pos.x);
    minZ = Math.min(minZ, p.pos.z);
    maxZ = Math.max(maxZ, p.pos.z);
  }
  const x0 = minX - TERRAIN_MARGIN;
  const z0 = minZ - TERRAIN_MARGIN;
  const nx = Math.ceil((maxX + TERRAIN_MARGIN - x0) / TERRAIN_TILE);
  const nz = Math.ceil((maxZ + TERRAIN_MARGIN - z0) / TERRAIN_TILE);

  const near = new Uint8Array(nx * nz);
  for (let k = 0; k < samples.length; k += 10) {
    const p = samples[k].pos;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const tx = Math.max(x0 + i * TERRAIN_TILE, Math.min(p.x, x0 + (i + 1) * TERRAIN_TILE));
        const tz = Math.max(z0 + j * TERRAIN_TILE, Math.min(p.z, z0 + (j + 1) * TERRAIN_TILE));
        if (Math.hypot(tx - p.x, tz - p.z) < TERRAIN_NEAR_DIST) near[j * nx + i] = 1;
      }
    }
  }

  const meshes: THREE.Mesh[] = [];
  const far = new SmoothBuilder();
  const col = new THREE.Color();
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const isNear = near[j * nx + i] === 1;
      const b = isNear ? new SmoothBuilder() : far;
      const cells = isNear ? nearCells : TERRAIN_CELLS_FAR[quality];
      addTile(b, ground, x0 + i * TERRAIN_TILE, z0 + j * TERRAIN_TILE, cells, col);
      if (isNear) meshes.push(toMesh(b, material));
    }
  }
  addApron(far, ground, x0, z0, nx * TERRAIN_TILE, nz * TERRAIN_TILE, TERRAIN_TILE / TERRAIN_CELLS_FAR[quality], col);
  meshes.push(toMesh(far, material));
  return meshes;
}

function toMesh(b: SmoothBuilder, material: THREE.Material): THREE.Mesh {
  const g = b.build(true);
  if (!g) throw new Error('terrain tile produced no geometry');
  const m = new THREE.Mesh(g, material);
  m.matrixAutoUpdate = false;
  m.name = 'terrain';
  return m;
}

function addTile(b: SmoothBuilder, ground: Ground, tx: number, tz: number, n: number, col: THREE.Color) {
  const step = TERRAIN_TILE / n;
  // Heights include a one-cell ring outside the tile, so normals at the border are computed
  // exactly as the neighbouring tile computes them and shading runs seamlessly across.
  const w = n + 3;
  const hs = new Float32Array(w * w);
  for (let j = -1; j <= n + 1; j++) {
    for (let i = -1; i <= n + 1; i++) hs[(j + 1) * w + i + 1] = ground.meshHeight(tx + i * step, tz + j * step);
  }
  const h = (i: number, j: number) => hs[(j + 1) * w + i + 1];
  const first = b.vertexCount;
  const nrm = new THREE.Vector3();
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = tx + i * step;
      const z = tz + j * step;
      const y = h(i, j);
      const dx = h(i + 1, j) - h(i - 1, j);
      const dz = h(i, j + 1) - h(i, j - 1);
      nrm.set(-dx, 2 * step, -dz).normalize();
      b.vertex({ x, y, z }, ground.color(x, z, y, Math.hypot(dx, dz) / (2 * step), col), x / SAND_TILE, z / SAND_TILE, nrm);
    }
  }
  const at = (i: number, j: number) => first + j * (n + 1) + i;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // Alternate the diagonal so long ridges don't all lean one way.
      if ((i + j) % 2 === 0) {
        b.tri(at(i, j), at(i, j + 1), at(i + 1, j));
        b.tri(at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
      } else {
        b.tri(at(i, j), at(i, j + 1), at(i + 1, j + 1));
        b.tri(at(i, j), at(i + 1, j + 1), at(i + 1, j));
      }
    }
  }
  // Skirts on all four edges, hanging straight down, on their own vertices so they never
  // bend the surface normals.
  const edges: [number, number, number, number][] = [];
  for (let q = 0; q < n; q++) {
    edges.push([q, 0, q + 1, 0], [q + 1, n, q, n], [0, q + 1, 0, q], [n, q, n, q + 1]);
  }
  for (const [ia, ja, ib, jb] of edges) {
    const pa = { x: tx + ia * step, y: h(ia, ja), z: tz + ja * step };
    const pb = { x: tx + ib * step, y: h(ib, jb), z: tz + jb * step };
    const c = ground.color(pa.x, pa.z, pa.y, 0, col).multiplyScalar(SKIRT_SHADE);
    const out = { x: (pa.x + pb.x) / 2 - (tx + TERRAIN_TILE / 2), y: 0, z: (pa.z + pb.z) / 2 - (tz + TERRAIN_TILE / 2) };
    nrm.set(out.x, 0, out.z).normalize();
    const a = b.vertex(pa, c, 0, 0, nrm);
    const bb = b.vertex(pb, c, 0, 0, nrm);
    const da = b.vertex({ ...pa, y: pa.y - TERRAIN_SKIRT }, c, 0, 0, nrm);
    const db = b.vertex({ ...pb, y: pb.y - TERRAIN_SKIRT }, c, 0, 0, nrm);
    b.tri(a, da, bb);
    b.tri(bb, da, db);
  }
}

/** Flat ring past the terrain so the horizon is sand fading into fog, never a cliff edge. */
function addApron(b: SmoothBuilder, ground: Ground, x0: number, z0: number, w: number, d: number, cell: number, col: THREE.Color) {
  const ring: { x: number; z: number }[] = [];
  const nW = Math.round(w / cell);
  const nD = Math.round(d / cell);
  for (let i = 0; i < nW; i++) ring.push({ x: x0 + (i * w) / nW, z: z0 });
  for (let j = 0; j < nD; j++) ring.push({ x: x0 + w, z: z0 + (j * d) / nD });
  for (let i = nW; i > 0; i--) ring.push({ x: x0 + (i * w) / nW, z: z0 + d });
  for (let j = nD; j > 0; j--) ring.push({ x: x0, z: z0 + (j * d) / nD });
  const cx = x0 + w / 2;
  const cz = z0 + d / 2;
  const inner: number[] = [];
  const outer: number[] = [];
  for (const p of ring) {
    const y = ground.meshHeight(p.x, p.z);
    inner.push(b.vertex({ x: p.x, y, z: p.z }, ground.color(p.x, p.z, y, 0, col), p.x / SAND_TILE, p.z / SAND_TILE, UP));
    const dx = p.x - cx;
    const dz = p.z - cz;
    const l = Math.hypot(dx, dz);
    const ox = p.x + (dx / l) * APRON;
    const oz = p.z + (dz / l) * APRON;
    outer.push(b.vertex({ x: ox, y: ground.base, z: oz }, ground.color(ox, oz, ground.base, 0, col), ox / SAND_TILE, oz / SAND_TILE, UP));
  }
  for (let q = 0; q < ring.length; q++) {
    const r = (q + 1) % ring.length;
    b.tri(inner[q], inner[r], outer[q]);
    b.tri(inner[r], outer[r], outer[q]);
  }
}
