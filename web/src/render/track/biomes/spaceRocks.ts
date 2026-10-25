import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, range, type Rng } from '../../../core/rng.ts';
import { canvas, finish, periodicNoise } from '../canvasPaint.ts';
import type { Quality } from '../config.ts';
import type { Corridor } from '../corridor.ts';
import type { Ground } from '../ground.ts';
import { GRAIN_MEAN, LUMP, farRockMaterial, nearRockMaterial } from './asteroidShader.ts';

// Asteroids. Near the road they are real rock: an icosphere the vertex shader shapes into each
// rock's own lumps and craters (asteroidShader.ts), smooth-shaded, instanced in three levels of
// detail by how big the rock is on screen, crossfading by dither between levels so nothing
// pops: a whole field is three draws. Far off they are sprites the same height function lights
// as rock from where the camera is, so the belt beyond the field runs to the horizon at one
// more draw and two triangles a rock.

/** Levels of detail: icosphere subdivision per level (fine, mid, coarse) at each quality. */
const LOD_DETAIL = { low: [6, 3, 2], high: [10, 5, 3] } as const;
/**
 * A rock takes the finer level while its radius over its distance is above these, crossfading
 * over this much of a doubling either side of each: swaps happen while the coarser level's
 * triangles are still a few pixels, so the two levels shade alike through the dither.
 */
const LOD_SIZE = [0.08, 0.022] as const;
/** Under this size a rock is a few pixels and the far belt's sprites carry the field: it fades out (same band). */
const CULL_SIZE = 0.004;
const LOD_BAND = 0.4;
/** Grain texture: its size (px) and lattice. */
const GRAIN_SIZE = 256;
const GRAIN_CELLS = 32;

/** The surface never swells past this share of the nominal radius: what clearance tests use. */
const LUMP_MAX = 1 + LUMP;
/** Near rocks: radius range (most small, a few big), squash range, how far out from the boundary. */
const NEAR_RADIUS: readonly [number, number] = [5, 48];
const NEAR_SQUASH: readonly [number, number] = [0.6, 1];
const NEAR_GAP: readonly [number, number] = [3, 60];
/** Rock surfaces keep at least this far outside the hard boundary. */
const ROCK_CLEAR = 3;
/** A rock over the road keeps its underside this high above it; one under the road, its top this deep. */
const OVERHEAD_CLEAR = 24;
const UNDER_CLEAR = 14;
/** Shares of the field's rocks hung over the road and sunk under it. */
const OVERHEAD_SHARE = 0.18;
const UNDER_SHARE = 0.2;
/** A few giants stand back from the road: their share, radius range and distance out. */
const GIANT_SHARE = 0.08;
const GIANT_RADIUS: readonly [number, number] = [90, 220];
const GIANT_GAP: readonly [number, number] = [150, 520];
/** Low quality keeps this share of the near rocks. */
const LOW_SHARE = 0.6;
/** Rock tints (sRGB, near white): the regolith carries the colour, these vary it rock to rock. */
const ROCK_TINTS = [0xffffff, 0xf0e4d8, 0xe0e0e0, 0xfff4e6];

/** Far rocks: how far from any road (m), the belt's spread, and their radius range. */
const FAR_CLEAR = 600;
const FAR_REACH: readonly [number, number] = [900, 6500];
const FAR_HEIGHT = 1200;
const FAR_RADIUS: readonly [number, number] = [4, 70];
/** Share of the far rocks crowded round the asteroid fields (the rest are spread round the whole course). */
const FAR_FIELD_SHARE = 0.65;
const FAR_FIELD_REACH: readonly [number, number] = [600, 3500];
/** Low quality keeps this share of the far rocks. */
const FAR_LOW_SHARE = 0.5;
/** Seeds are spread over this range: the shader hashes them into each rock's shape. */
const SEED_RANGE = 1000;

/** A near rock: where, how big and turned (unit rock scaled), and its tone. */
export interface Placed {
  m: THREE.Matrix4;
  tint: THREE.Color;
  /** Its shape (asteroidShader.ts). */
  seed: number;
  /** Its largest radius (m) and centre, for choosing its level of detail. */
  r: number;
  at: THREE.Vector3;
}

/** A rock of radius r centred at (x, y, z): whether its surface keeps clear of every road. */
function clearRock(g: Ground, x: number, y: number, z: number, r: number): boolean {
  const near = g.nearest(x, z);
  if (!near) return true;
  const smp = g.views[near.v].ribbon.samples[near.k];
  const reach = r * LUMP_MAX;
  if (y - reach > smp.pos.y + OVERHEAD_CLEAR || y + reach < smp.pos.y - UNDER_CLEAR) return true;
  return Math.abs(near.d) - reach > (near.d < 0 ? smp.edgeL : smp.edgeR) + ROCK_CLEAR;
}

function rockMatrix(rng: Rng, x: number, y: number, z: number, r: number): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 6.3, rng() * 6.3, rng() * 6.3));
  const s = new THREE.Vector3(r, r * range(rng, NEAR_SQUASH[0], NEAR_SQUASH[1]), r * range(rng, NEAR_SQUASH[0], NEAR_SQUASH[1]));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, s);
}

/** Rocks crowding the road's edges between s0 and s1 of the main road, hung over and sunk under it, giants behind. */
export function fieldRocks(cor: Corridor, s0: number, s1: number, perKm: number, quality: Quality, rng: Rng, out: Placed[]): void {
  const keep = quality === 'high' ? 1 : LOW_SHARE;
  const count = Math.round(((s1 - s0) / 1000) * perKm * keep);
  const g = cor.ground;
  for (let i = 0, tries = 0; i < count && tries < count * 8; tries++) {
    const s = range(rng, s0, s1);
    const k = cor.idx(Math.round(s / cor.ribbon.step));
    const smp = cor.ribbon.samples[k];
    const side = rng() < 0.5 ? -1 : 1;
    const roll = rng();
    let r: number;
    let p: { x: number; y: number; z: number };
    if (roll < OVERHEAD_SHARE) {
      r = range(rng, NEAR_RADIUS[0], NEAR_RADIUS[1] * 0.6);
      p = cor.banked(k, range(rng, -smp.edgeL - r, smp.edgeR + r), 0);
      p.y += OVERHEAD_CLEAR + r * LUMP_MAX + range(rng, 2, 40);
    } else if (roll < OVERHEAD_SHARE + UNDER_SHARE) {
      r = range(rng, NEAR_RADIUS[0], NEAR_RADIUS[1]);
      p = cor.banked(k, range(rng, -smp.edgeL - r, smp.edgeR + r), 0);
      p.y -= UNDER_CLEAR + r * LUMP_MAX + range(rng, 2, 60);
    } else if (roll < OVERHEAD_SHARE + UNDER_SHARE + GIANT_SHARE) {
      r = range(rng, GIANT_RADIUS[0], GIANT_RADIUS[1]);
      p = cor.beside(k, side, r + range(rng, GIANT_GAP[0], GIANT_GAP[1]), smp.pos.y + range(rng, -r, r * 0.5));
    } else {
      // Most rocks small, a few big: the radius falls as the square of a uniform draw.
      r = NEAR_RADIUS[0] + (NEAR_RADIUS[1] - NEAR_RADIUS[0]) * rng() ** 2;
      p = cor.beside(k, side, r * LUMP_MAX + ROCK_CLEAR + range(rng, NEAR_GAP[0], NEAR_GAP[1]), smp.pos.y + range(rng, -1.2 * r, 0.8 * r));
    }
    if (!clearRock(g, p.x, p.y, p.z, r)) continue;
    out.push({ m: rockMatrix(rng, p.x, p.y, p.z, r), tint: new THREE.Color(ROCK_TINTS[Math.floor(rng() * ROCK_TINTS.length)]).multiplyScalar(range(rng, 0.85, 1.15)), seed: rng() * SEED_RANGE, r, at: new THREE.Vector3(p.x, p.y, p.z) });
    i++;
  }
}

/** Near-white grain, tiling: the rocks sample it triplanar (asteroidShader.ts). */
function grainTexture(seed: number): THREE.CanvasTexture {
  const [cv, ctx] = canvas(GRAIN_SIZE, GRAIN_SIZE);
  const rng = mulberry32(seed ^ 0x6a1);
  const coarse = periodicNoise(rng, GRAIN_CELLS / 4);
  const fine = periodicNoise(rng, GRAIN_CELLS);
  const img = ctx.createImageData(GRAIN_SIZE, GRAIN_SIZE);
  for (let y = 0; y < GRAIN_SIZE; y++) {
    for (let x = 0; x < GRAIN_SIZE; x++) {
      const u = x / GRAIN_SIZE;
      const v = y / GRAIN_SIZE;
      const value = GRAIN_MEAN + coarse(u * (GRAIN_CELLS / 4), v * (GRAIN_CELLS / 4)) * 0.1 + fine(u * GRAIN_CELLS, v * GRAIN_CELLS) * 0.08 + (rng() - 0.5) * 0.08;
      const i = (y * GRAIN_SIZE + x) * 4;
      const c = Math.max(0, Math.min(255, value * 255));
      img.data.set([c, c, c, 255], i);
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(cv, THREE.RepeatWrapping);
}

/** An indexed unit icosphere: shared vertices, so the vertex shader shapes each once. */
function icosphere(detail: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const merged = mergeVertices(g);
  g.dispose();
  // The shader displaces by up to LUMP: bounds must hold the swollen rock.
  merged.boundingSphere = new THREE.Sphere(new THREE.Vector3(), LUMP_MAX);
  return merged;
}

/**
 * The near rocks (see the header): three instanced levels of detail, refilled each frame from
 * where the camera is; a rock near a level's edge is drawn in both, crossfading by dither.
 */
export function nearRocks(rocks: Placed[], quality: Quality, seed: number): { meshes: THREE.InstancedMesh[]; update(camera: THREE.Vector3): void; dispose(): void } | null {
  if (rocks.length === 0) return null;
  const grain = grainTexture(seed);
  const mat = nearRockMaterial(quality === 'low', grain);
  const levels = LOD_DETAIL[quality].map((detail, i) => {
    const geo = icosphere(detail);
    const seeds = new THREE.InstancedBufferAttribute(new Float32Array(rocks.length), 1).setUsage(THREE.DynamicDrawUsage);
    const fades = new THREE.InstancedBufferAttribute(new Float32Array(rocks.length), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSeed', seeds);
    geo.setAttribute('aFade', fades);
    const mesh = new THREE.InstancedMesh(geo, mat, rocks.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Colours are set per slot as rocks are filled in; created up front so the program has them.
    mesh.setColorAt(0, rocks[0].tint);
    mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.name = `asteroids${i}`;
    return { mesh, geo, seeds, fades, held: [] as Placed[], bounds: new THREE.Sphere() };
  });
  const box = new THREE.Box3();
  const reach = new THREE.Vector3();
  const add = (level: number, rock: Placed, fade: number) => {
    const l = levels[level];
    const i = l.mesh.count++;
    l.held[i] = rock;
    l.mesh.setMatrixAt(i, rock.m);
    l.mesh.setColorAt(i, rock.tint);
    l.seeds.setX(i, rock.seed);
    l.fades.setX(i, fade);
  };
  return {
    meshes: levels.map((l) => l.mesh),
    update(camera) {
      for (const l of levels) l.mesh.count = 0;
      for (const rock of rocks) {
        const q = rock.r / Math.max(1, rock.at.distanceTo(camera));
        // Finer levels first: the first boundary the rock is over (or within the band of) decides.
        let level: number = LOD_SIZE.length;
        let fade = 1;
        for (let b = 0; b < LOD_SIZE.length; b++) {
          const x = Math.log2(q / LOD_SIZE[b]) / LOD_BAND;
          if (x > 0.5) {
            level = b;
            break;
          }
          if (x > -0.5) {
            level = b;
            fade = x + 0.5;
            break;
          }
        }
        if (level === LOD_SIZE.length) {
          // The coarsest level fades out as the rock shrinks to a few pixels.
          const x = Math.log2(q / CULL_SIZE) / LOD_BAND;
          if (x < -0.5) continue;
          if (x < 0.5) fade = x + 0.5;
          add(level, rock, fade);
        } else if (fade < 1) {
          add(level, rock, fade);
          add(level + 1, rock, -fade);
        } else add(level, rock, 1);
      }
      for (const l of levels) {
        l.mesh.instanceMatrix.needsUpdate = true;
        if (l.mesh.instanceColor) l.mesh.instanceColor.needsUpdate = true;
        l.seeds.needsUpdate = true;
        l.fades.needsUpdate = true;
        // Bounds of what this level now holds, so a level with nothing in view is culled whole.
        box.makeEmpty();
        for (let i = 0; i < l.mesh.count; i++) {
          const rock = l.held[i];
          reach.setScalar(rock.r * LUMP_MAX);
          box.expandByPoint(reach.clone().add(rock.at)).expandByPoint(reach.negate().add(rock.at));
        }
        l.mesh.boundingSphere = box.getBoundingSphere(l.bounds);
        // An empty level is no draw at all.
        l.mesh.visible = l.mesh.count > 0;
      }
    },
    dispose() {
      for (const l of levels) l.geo.dispose();
      mat.dispose();
      grain.dispose();
    },
  };
}

/** Far rocks round the course and crowded round the fields, as one draw of sprites lit as rock. */
export function farRockMesh(g: Ground, fields: { x: number; y: number; z: number }[], count: number, quality: Quality, sunDir: THREE.Vector3, sun: THREE.Color, seed: number): { mesh: THREE.InstancedMesh; dispose(): void } | null {
  const rng = mulberry32(seed ^ 0xfa2);
  const n = Math.round(count * (quality === 'high' ? 1 : FAR_LOW_SHARE));
  const S = g.views[0].ribbon.samples;
  const mats: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  for (let tries = 0; mats.length < n && tries < n * 6; tries++) {
    const inField = fields.length > 0 && rng() < FAR_FIELD_SHARE;
    const at = inField ? fields[Math.floor(rng() * fields.length)] : S[Math.floor(rng() * S.length)].pos;
    const [lo, hi] = inField ? FAR_FIELD_REACH : FAR_REACH;
    const a = rng() * Math.PI * 2;
    const d = range(rng, lo, hi);
    const x = at.x + Math.cos(a) * d;
    const z = at.z + Math.sin(a) * d;
    const y = at.y + range(rng, -FAR_HEIGHT, FAR_HEIGHT * 0.6);
    const near = g.nearest(x, z);
    if (near && Math.abs(near.d) < FAR_CLEAR && Math.abs(y - g.views[near.v].ribbon.samples[near.k].pos.y) < FAR_CLEAR) continue;
    const r = FAR_RADIUS[0] + (FAR_RADIUS[1] - FAR_RADIUS[0]) * rng() ** 2.5;
    mats.push(m.clone().makeScale(r, r, r).setPosition(x, y, z));
  }
  if (mats.length === 0) return null;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from(mats, () => rng() * SEED_RANGE), 1));
  const mat = farRockMaterial(sunDir, sun);
  const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((x, i) => mesh.setMatrixAt(i, x));
  mesh.instanceMatrix.needsUpdate = true;
  // The bounds three computes from the unit quad miss the sprite's reach; the whole belt is one draw anyway.
  mesh.frustumCulled = false;
  mesh.name = 'farAsteroids';
  return { mesh, dispose: () => (geo.dispose(), mat.dispose()) };
}
