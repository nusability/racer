import * as THREE from 'three';
import { SmoothBuilder } from './builder.ts';
import {
  TERRAIN_CELL_FAR,
  TERRAIN_CELL_NEAR,
  TERRAIN_MARGIN,
  TERRAIN_NEAR_DIST,
  TERRAIN_SKIRT,
  TERRAIN_TILE,
  type Quality,
} from './config.ts';
import type { Ground } from './ground.ts';

/** The flat apron past the terrain edge reaches this far out, into full fog. */
const APRON = 7000;

/**
 * Desert heightfield in tiles: tiles the course passes near get fine cells and their own mesh
 * (so they cull), the rest share one coarse mesh. Every tile hangs a skirt so resolution
 * changes between neighbours never open a crack.
 */
export function buildTerrain(ground: Ground, quality: Quality, material: THREE.Material): THREE.Mesh[] {
  const samples = ground.track.samples;
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
      const cell = isNear ? TERRAIN_CELL_NEAR[quality] : TERRAIN_CELL_FAR[quality];
      addTile(b, ground, x0 + i * TERRAIN_TILE, z0 + j * TERRAIN_TILE, cell, col);
      if (isNear) meshes.push(toMesh(b, material));
    }
  }
  addApron(far, ground, x0, z0, nx * TERRAIN_TILE, nz * TERRAIN_TILE, TERRAIN_CELL_FAR[quality], col);
  meshes.push(toMesh(far, material));
  return meshes;
}

function toMesh(b: SmoothBuilder, material: THREE.Material): THREE.Mesh {
  const g = b.build(false);
  if (!g) throw new Error('terrain tile produced no geometry');
  const m = new THREE.Mesh(g, material);
  m.matrixAutoUpdate = false;
  m.name = 'terrain';
  return m;
}

function addTile(b: SmoothBuilder, ground: Ground, tx: number, tz: number, cell: number, col: THREE.Color) {
  const n = Math.round(TERRAIN_TILE / cell);
  const step = TERRAIN_TILE / n;
  const hs = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) hs[j * (n + 1) + i] = ground.meshHeight(tx + i * step, tz + j * step);
  }
  const first = b.vertexCount;
  const h = (i: number, j: number) => hs[Math.min(n, Math.max(0, j)) * (n + 1) + Math.min(n, Math.max(0, i))];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = tx + i * step;
      const z = tz + j * step;
      const y = h(i, j);
      const slope = Math.hypot(h(i + 1, j) - h(i - 1, j), h(i, j + 1) - h(i, j - 1)) / (2 * step);
      b.vertex({ x, y, z }, ground.color(x, z, y, slope, col));
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
  // Skirts on all four edges, hanging straight down.
  const edges: [number, number, number, number][] = [];
  for (let q = 0; q < n; q++) {
    edges.push([q, 0, q + 1, 0], [q + 1, n, q, n], [0, q + 1, 0, q], [n, q, n, q + 1]);
  }
  for (const [ia, ja, ib, jb] of edges) {
    const a = at(ia, ja);
    const bb = at(ib, jb);
    const pa = { x: tx + ia * step, y: h(ia, ja) - TERRAIN_SKIRT, z: tz + ja * step };
    const pb = { x: tx + ib * step, y: h(ib, jb) - TERRAIN_SKIRT, z: tz + jb * step };
    const c = ground.color(pa.x, pa.z, pa.y + TERRAIN_SKIRT, 0, col);
    const da = b.vertex(pa, c);
    const db = b.vertex(pb, c);
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
    inner.push(b.vertex({ x: p.x, y, z: p.z }, ground.color(p.x, p.z, y, 0, col)));
    const dx = p.x - cx;
    const dz = p.z - cz;
    const l = Math.hypot(dx, dz);
    const ox = p.x + (dx / l) * APRON;
    const oz = p.z + (dz / l) * APRON;
    outer.push(b.vertex({ x: ox, y: ground.base, z: oz }, ground.color(ox, oz, ground.base, 0, col)));
  }
  for (let q = 0; q < ring.length; q++) {
    const r = (q + 1) % ring.length;
    b.tri(inner[q], inner[r], outer[q]);
    b.tri(inner[r], outer[r], outer[q]);
  }
}
