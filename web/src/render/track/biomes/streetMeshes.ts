import * as THREE from 'three';
import { mulberry32, range, type Rng } from '../../../core/rng.ts';
import { ANISOTROPY } from '../config.ts';
import { canvas, css } from '../canvasPaint.ts';
import type { Corridor } from '../corridor.ts';
import { sideIndex } from '../shape.ts';
import { BARRIER_H, BASIN, FENCE_TOP, QUAY, WATER_DROP, streetFrame } from '../street.ts';
import type { StreetLayout } from './cityStreets.ts';

// The street sections' own meshes, one draw each for the whole track: the street markings
// painted on the road (zebra crossings, stop lines, lane arrows, a gutter of setts along each
// kerb in place of the racetrack's kerbs, manhole covers and patched asphalt), the debris fence
// standing on the barriers, and the harbour's water.

/** Atlas cells across the decal texture, and their contents. */
const CELLS = 8;
const CELL = { paint: 0, arrow: 1, split: 2, manhole: 3, patch: 4, gutter: 5, hatch: 6, tar: 7 } as const;
/** Decals ride this far over the road (the material's polygon offset does the rest). */
const LIFT = 0.03;
/**
 * The gutter covers this share of the road's width at each edge: the racetrack kerb and edge
 * line the road texture paints there (textures.ts), so a street's edge reads as a kerb's gutter.
 */
const GUTTER = 0.056;
/** The gutter's setts repeat every this many metres along the road. */
const GUTTER_TILE = 6;
/** A zebra crossing: its depth along the road, its bars' width and the gaps between them, metres. */
const ZEBRA_DEPTH = 5;
const ZEBRA_BAR = 0.9;
const ZEBRA_GAP = 0.8;
/** The stop line stands this far before the crossing, this deep; the lane arrows this far before it, this big. */
const STOP_BACK = 4;
const STOP_DEPTH = 0.6;
const ARROW_BACK = 16;
const ARROW: readonly [number, number] = [1.6, 7];
/** Lanes of a city road (the road texture's own lane lines sit at thirds). */
const LANES = [-1 / 3, 0, 1 / 3];
/** Manholes and patches per 100 m of street, and their sizes (m). */
const MANHOLES = 2.5;
const MANHOLE = 1.3;
const PATCHES = 1.6;
const PATCH: readonly [number, number] = [1.5, 5];
/** Road light on the paint, as the road's own (the city's road light). */
const PAINT_GLOW = 0.3;
/** The debris fence: the length one mesh tile covers, and where it stands across the barrier's top. */
const FENCE_TILE = 3;
const FENCE_AT = 0.4;
/** Water: tile of its ripple texture (m) and its glow. */
const WATER_TILE = 40;
const WATER_GLOW = 1;
const WATER = 0x07101c;

export interface StreetMeshes {
  objects: THREE.Object3D[];
  dispose(): void;
}

export function streetMeshes(cor: Corridor, layouts: StreetLayout[], seed: number): StreetMeshes {
  const objects: THREE.Object3D[] = [];
  const owned: { dispose(): void }[] = [];
  if (layouts.length === 0) return { objects, dispose() {} };
  const rng = mulberry32(seed ^ 0xdeca1);
  const dec = new Quads();
  for (const l of layouts) markings(cor, l, dec, rng);
  const atlas = decalAtlas(mulberry32(seed ^ 0xa71a5));
  const decMat = new THREE.MeshLambertMaterial({ map: atlas, transparent: true, depthWrite: false, vertexColors: true, emissive: new THREE.Color().setScalar(PAINT_GLOW), emissiveMap: atlas, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  owned.push(atlas, decMat);
  const decals = dec.mesh(decMat, 'streetMarkings');
  owned.push(decals.geometry);
  objects.push(decals);

  const fence = new Quads();
  const water = new Quads();
  for (const l of layouts) sides(cor, l, fence, water);
  const fenceTex = fenceTexture();
  // Blended, not alpha-tested: far off the mesh's mipmaps fade it to a haze instead of breaking it into sparkling dots.
  const fenceMat = new THREE.MeshLambertMaterial({ map: fenceTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, emissive: new THREE.Color().setScalar(PAINT_GLOW), emissiveMap: fenceTex });
  owned.push(fenceTex, fenceMat);
  const fm = fence.mesh(fenceMat, 'debrisFence');
  owned.push(fm.geometry);
  objects.push(fm);
  if (water.count > 0) {
    const waterTex = waterTexture(mulberry32(seed ^ 0x3a7e));
    const waterMat = new THREE.MeshLambertMaterial({ color: WATER, emissive: new THREE.Color().setScalar(WATER_GLOW), emissiveMap: waterTex });
    owned.push(waterTex, waterMat);
    const wm = water.mesh(waterMat, 'harbourWater');
    owned.push(wm.geometry);
    objects.push(wm);
  }
  return {
    objects,
    dispose() {
      for (const o of owned) o.dispose();
    },
  };
}

/** Textured, vertex-coloured quads gathered into one mesh. */
class Quads {
  private readonly pos: number[] = [];
  private readonly uv: number[] = [];
  private readonly col: number[] = [];
  private readonly idx: number[] = [];
  count = 0;

  /** Corners a → b → c → d counter-clockwise from the side that shows, with their uvs. */
  quad(p: THREE.Vector3Like[], uv: number[], c: THREE.Color): void {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i].x, p[i].y, p[i].z);
      this.uv.push(uv[i * 2], uv[i * 2 + 1]);
      this.col.push(c.r, c.g, c.b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.count++;
  }

  mesh(mat: THREE.Material, name: string): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.matrixAutoUpdate = false;
    return m;
  }
}

/** UVs of an atlas cell, shrunk half a texel's worth so mipmaps never bleed a neighbour in, v from v0 to v1. */
function cellUv(cell: number, v0 = 0, v1 = 1): number[] {
  const pad = 0.004;
  const u0 = cell / CELLS + pad;
  const u1 = (cell + 1) / CELLS - pad;
  return [u0, v0, u1, v0, u1, v1, u0, v1];
}

const WHITE = new THREE.Color(1, 1, 1);
const YELLOW = new THREE.Color(1, 0.82, 0.25);

/** A decal on the road: across x0..x1 (lateral) and along s0..s1, flat on the banked road. */
function onRoad(cor: Corridor, q: Quads, s0: number, s1: number, x0: number, x1: number, uv: number[], c: THREE.Color = WHITE): void {
  const r = cor.ribbon;
  const p = (s: number, x: number) => r.toWorld(r.wrap(s), x, LIFT);
  q.quad([p(s0, x0), p(s0, x1), p(s1, x1), p(s1, x0)], uv, c);
}

function markings(cor: Corridor, l: StreetLayout, q: Quads, rng: Rng): void {
  const r = cor.ribbon;
  const s = (u: number) => l.s0 + u;
  const half = (u: number) => r.sampleAt(r.wrap(s(u))).width / 2;
  // Gutters along both kerbs, in short pieces so they follow the bend.
  const step = r.step * 2;
  for (let u = 0; u < l.length; u += step) {
    const k = Math.round(r.wrap(s(u)) / r.step);
    const w = r.samples[cor.idx(k)].width;
    for (const side of [-1, 1]) {
      if (cor.open(k, side)) continue;
      const a = side * (w / 2);
      const b = side * (w / 2 - w * GUTTER);
      const v0 = (u % GUTTER_TILE) / GUTTER_TILE;
      // Left kerb's strip mirrored, so the setts sit on the outer side on both.
      onRoad(cor, q, s(u), s(u + step), side < 0 ? a : b, side < 0 ? b : a, side < 0 ? cellUv(CELL.gutter, v0, v0 + step / GUTTER_TILE) : flipU(cellUv(CELL.gutter, v0, v0 + step / GUTTER_TILE)));
    }
  }
  // A crossing at every side street (the side street's mouth on either side), with its stop line and lane arrows.
  const crossings = l.fronts.filter((f) => f.kind === 'side' || f.kind === 'metro').map((f) => (f.u0 + f.u1) / 2);
  for (const u of crossings) {
    const h = half(u) * (1 - 2 * GUTTER);
    const z0 = u - ZEBRA_DEPTH / 2;
    for (let x = -h + ZEBRA_GAP / 2; x + ZEBRA_BAR < h; x += ZEBRA_BAR + ZEBRA_GAP) onRoad(cor, q, s(z0), s(z0 + ZEBRA_DEPTH), x, x + ZEBRA_BAR, cellUv(CELL.paint));
    const stop = z0 - STOP_BACK;
    if (stop - ARROW_BACK - ARROW[1] < 0) continue;
    onRoad(cor, q, s(stop - STOP_DEPTH), s(stop), -h, h, cellUv(CELL.paint));
    for (const lane of LANES) {
      const x = lane * 2 * half(u);
      const a0 = stop - ARROW_BACK - ARROW[1];
      onRoad(cor, q, s(a0), s(a0 + ARROW[1]), x - ARROW[0] / 2, x + ARROW[0] / 2, cellUv(rng() < 0.3 ? CELL.split : CELL.arrow));
    }
  }
  // Manholes, patched asphalt and sealed cracks, clear of the crossings.
  const clearOf = (u: number) => crossings.every((c) => Math.abs(c - u) > ZEBRA_DEPTH + STOP_BACK + ARROW_BACK + ARROW[1]);
  for (let i = 0; i < (l.length / 100) * MANHOLES; i++) {
    const u = rng() * l.length;
    if (!clearOf(u)) continue;
    const x = range(rng, -0.8, 0.8) * half(u);
    onRoad(cor, q, s(u - MANHOLE / 2), s(u + MANHOLE / 2), x - MANHOLE / 2, x + MANHOLE / 2, cellUv(CELL.manhole));
  }
  for (let i = 0; i < (l.length / 100) * PATCHES; i++) {
    const u = rng() * l.length;
    const len = range(rng, PATCH[0], PATCH[1]);
    const wid = range(rng, PATCH[0], PATCH[1]) * 0.6;
    const x = range(rng, -0.75, 0.75) * half(u);
    onRoad(cor, q, s(u), s(u + len), x - wid / 2, x + wid / 2, cellUv(rng() < 0.6 ? CELL.patch : CELL.tar));
  }
  // A yellow box junction under the metro: keep clear.
  for (const f of l.fronts) {
    if (f.kind !== 'metro' || f.side !== 1) continue;
    const h = half(f.u0) * (1 - 2 * GUTTER);
    onRoad(cor, q, s(f.u0 + 2), s(f.u1 - 2), -h, h, cellUv(CELL.hatch), YELLOW);
  }
}

function flipU(uv: number[]): number[] {
  return [uv[2], uv[1], uv[0], uv[3], uv[6], uv[5], uv[4], uv[7]];
}

/** The fence over each barrier, and the water off each quay. */
function sides(cor: Corridor, l: StreetLayout, fence: Quads, water: Quads): void {
  const r = cor.ribbon;
  const step = r.step * 2;
  for (const side of [-1, 1] as const) {
    for (let u = 0; u < l.length; u += step) {
      const ka = Math.round(r.wrap(l.s0 + u) / r.step);
      const kb = Math.round(r.wrap(l.s0 + Math.min(l.length, u + step)) / r.step);
      if (cor.open(ka, side) || cor.open(kb, side)) continue;
      const A = streetFrame(cor, ka, side);
      const B = streetFrame(cor, kb, side);
      const v0 = u / FENCE_TILE;
      const v1 = (u + step) / FENCE_TILE;
      fence.quad([A.at(FENCE_AT, BARRIER_H), B.at(FENCE_AT, BARRIER_H), B.at(FENCE_AT, FENCE_TOP), A.at(FENCE_AT, FENCE_TOP)], [v0, 0, v1, 0, v1, 1, v0, 1], WHITE);
      const i = sideIndex(side);
      if (cor.shape.quay[i][cor.idx(ka)] && cor.shape.quay[i][cor.idx(kb)]) {
        const y = -WATER_DROP;
        const pts = [A.at(QUAY, y), A.at(BASIN, y), B.at(BASIN, y), B.at(QUAY, y)];
        // Counter-clockwise from above whichever side of the road the quay is on.
        if (side < 0) pts.reverse();
        water.quad(pts, pts.flatMap((p) => [p.x / WATER_TILE, p.z / WATER_TILE]), WHITE);
      }
    }
  }
}

/** The markings atlas: paint, arrows, a manhole, patches, the gutter's setts, a hatch, sealed cracks. */
function decalAtlas(rng: Rng): THREE.CanvasTexture {
  const W = 128;
  const H = 256;
  const [cv, ctx] = canvas(W * CELLS, H);
  ctx.clearRect(0, 0, W * CELLS, H);
  const cell = (i: number, draw: () => void) => {
    ctx.save();
    ctx.translate(i * W, 0);
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    draw();
    ctx.restore();
  };
  // Worn paint: white with the asphalt showing through in specks.
  const worn = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = 'rgba(240,238,232,0.95)';
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < (w * h) / 40; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.3 + rng() * 0.6})`;
      ctx.fillRect(x + rng() * w, y + rng() * h, 1 + rng() * 2, 1 + rng() * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  cell(CELL.paint, () => worn(0, 0, W, H));
  const arrow = (turn: boolean) => {
    const path = new Path2D();
    path.moveTo(W * 0.42, H * 0.98);
    path.lineTo(W * 0.58, H * 0.98);
    path.lineTo(W * 0.58, H * 0.35);
    path.lineTo(W * 0.9, H * 0.35);
    path.lineTo(W * 0.5, H * 0.02);
    path.lineTo(W * 0.1, H * 0.35);
    path.lineTo(W * 0.42, H * 0.35);
    path.closePath();
    ctx.save();
    ctx.clip(path);
    worn(0, 0, W, H);
    ctx.restore();
    if (turn) {
      ctx.strokeStyle = 'rgba(240,238,232,0.9)';
      ctx.lineWidth = W * 0.14;
      ctx.beginPath();
      ctx.moveTo(W * 0.5, H * 0.7);
      ctx.quadraticCurveTo(W * 0.2, H * 0.6, W * 0.12, H * 0.42);
      ctx.stroke();
    }
  };
  cell(CELL.arrow, () => arrow(false));
  cell(CELL.split, () => arrow(true));
  cell(CELL.manhole, () => {
    const r = W * 0.46;
    ctx.translate(W / 2, H / 2);
    ctx.scale(1, H / W);
    ctx.fillStyle = 'rgba(52,52,58,1)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,120,128,1)';
    ctx.lineWidth = 3;
    for (const k of [0.95, 0.7, 0.45]) {
      ctx.beginPath();
      ctx.arc(0, 0, r * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let a = 0; a < 8; a++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos((a * Math.PI) / 4) * r * 0.95, Math.sin((a * Math.PI) / 4) * r * 0.95);
      ctx.stroke();
    }
  });
  cell(CELL.patch, () => {
    // Fresh asphalt let into the old: a ragged edge, a little darker, soft at the rim.
    ctx.filter = 'blur(3px)';
    ctx.fillStyle = 'rgba(14,14,20,0.45)';
    ctx.beginPath();
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = 0.22 + rng() * 0.2;
      ctx.lineTo(W / 2 + Math.cos(a) * W * rr, H / 2 + Math.sin(a) * H * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.filter = 'none';
    ctx.strokeStyle = 'rgba(6,6,8,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  cell(CELL.gutter, () => {
    // Setts across the outer two thirds, a solid white line along the inner edge.
    const setts = W * 0.66;
    for (let y = 0; y < H; y += 16) {
      for (let x = 0; x < setts; x += 16) {
        const k = 0.75 + rng() * 0.35;
        ctx.fillStyle = css(0x55545a, k);
        ctx.fillRect(x + 1, y + 1, 14, 14);
      }
    }
    ctx.fillStyle = 'rgba(28,28,32,1)';
    ctx.fillRect(setts, 0, W * 0.1, H);
    worn(W * 0.78, 0, W * 0.16, H);
  });
  cell(CELL.hatch, () => {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    for (let i = -H; i < W + H; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + H, H);
      ctx.moveTo(i + H, 0);
      ctx.lineTo(i, H);
      ctx.stroke();
    }
  });
  cell(CELL.tar, () => {
    ctx.strokeStyle = 'rgba(6,6,8,0.85)';
    ctx.lineWidth = 3;
    for (let c = 0; c < 3; c++) {
      ctx.beginPath();
      let x = W * (0.2 + rng() * 0.6);
      ctx.moveTo(x, 0);
      for (let y = 0; y <= H; y += 12) {
        x = Math.max(4, Math.min(W - 4, x + (rng() - 0.5) * 22));
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = ANISOTROPY;
  return tex;
}

/** Chain-link mesh over the barrier: diamond wires, a top rail, see-through between. */
function fenceTexture(): THREE.CanvasTexture {
  const S = 128;
  const [cv, ctx] = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(200,204,212,1)';
  ctx.lineWidth = 2;
  const pitch = 16;
  for (let i = -S; i < 2 * S; i += pitch) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + S, S);
    ctx.moveTo(i + S, 0);
    ctx.lineTo(i, S);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(210,214,220,1)';
  ctx.fillRect(0, 0, S, 6);
  ctx.fillRect(0, S - 4, S, 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = ANISOTROPY;
  return tex;
}

/** Night water: dark swell, and the city's lights broken into streaks on it. */
function waterTexture(rng: Rng): THREE.CanvasTexture {
  const S = 256;
  const [cv, ctx] = canvas(S, S);
  ctx.fillStyle = 'rgb(10,16,30)';
  ctx.fillRect(0, 0, S, S);
  const lights = [0xff3fb4, 0x3ff0ff, 0xffb02e, 0xffe6b0];
  for (let i = 0; i < 420; i++) {
    const c = lights[Math.floor(rng() * lights.length)];
    ctx.fillStyle = css(c, 0.6 + rng() * 0.4, 0.25 + rng() * 0.5);
    const x = rng() * S;
    const y = rng() * S;
    const w = 6 + rng() * 34;
    // Drawn three times across each edge so the tile wraps.
    const h = 1 + rng() * 1.5;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) ctx.fillRect(x + dx, y + dy, w, h);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = ANISOTROPY;
  return tex;
}
