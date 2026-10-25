import * as THREE from 'three';
import { mulberry32, range, type Rng } from '../../../core/rng.ts';
import type { Quality } from '../config.ts';
import type { Corridor } from '../corridor.ts';
import type { Ground } from '../ground.ts';

// Asteroids. Near the road they are real rock: one faceted, noise-lumped icosahedron, instanced
// with its own size, squash and spin, so a whole field is one draw call and the star rakes hard
// lit facets across them. Far off they are impostors: camera-facing quads whose shader draws a
// lumpy disc lit as a sphere from the same star, so the field and the belt beyond it run out
// to the horizon at one more draw call and four triangles a rock.

/** Icosahedron subdivision of the near rock: its silhouette, faceted, at either quality. */
const ROCK_DETAIL = { low: 2, high: 3 } as const;
/** Lumps: how far the surface swells and dents (share of the radius) and how coarse the noise is. */
const LUMP = 0.28;
const LUMP_SCALE = 1.7;
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
/** Rock tones (sRGB): dark carbonaceous grey, rust, pale silicate. */
const ROCK_TONES = [0x5a5652, 0x6a5848, 0x7a7670, 0x4a4846];

/** Far rocks: how far from any road (m), the belt's spread, and their radius range. */
const FAR_CLEAR = 260;
const FAR_REACH: readonly [number, number] = [300, 5500];
const FAR_HEIGHT = 900;
const FAR_RADIUS: readonly [number, number] = [6, 140];
/** Share of the far rocks crowded round the asteroid fields (the rest are spread round the whole course). */
const FAR_FIELD_SHARE = 0.65;
const FAR_FIELD_REACH: readonly [number, number] = [250, 2600];
/** Low quality keeps this share of the far rocks. */
const FAR_LOW_SHARE = 0.5;
/** Impostor lighting: key from the star, a cool fill from the planet below, and the rock's albedo (linear). */
const IMPOSTOR_KEY = 2.6;
const IMPOSTOR_FILL = new THREE.Color(0.05, 0.08, 0.13);
const IMPOSTOR_ALBEDO = new THREE.Color(0.13, 0.12, 0.11);

/** One lumpy rock of unit radius, faceted, with darker hollows. */
function rockGeometry(quality: Quality, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, ROCK_DETAIL[quality]);
  const rng = mulberry32(seed);
  const o = [range(rng, 0, 50), range(rng, 0, 50), range(rng, 0, 50)];
  const p = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = lumps(v.x * LUMP_SCALE + o[0], v.y * LUMP_SCALE + o[1], v.z * LUMP_SCALE + o[2]);
    const r = 1 + LUMP * (n * 2 - 1);
    p.setXYZ(i, v.x * r, v.y * r, v.z * r);
    // Hollows a shade darker: dust settles in them and the light reaches them last.
    const shade = 0.7 + 0.3 * n;
    col.set([shade, shade, shade], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Smooth 3D value noise, 0..1, two octaves (deterministic: a hash of the lattice). */
function lumps(x: number, y: number, z: number): number {
  const hash = (i: number, j: number, k: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const octave = (x: number, y: number, z: number) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const k = Math.floor(z);
    const f = (t: number) => t * t * (3 - 2 * t);
    const u = f(x - i);
    const w = f(y - j);
    const q = f(z - k);
    const l = (a: number, b: number, t: number) => a + (b - a) * t;
    return l(
      l(l(hash(i, j, k), hash(i + 1, j, k), u), l(hash(i, j + 1, k), hash(i + 1, j + 1, k), u), w),
      l(l(hash(i, j, k + 1), hash(i + 1, j, k + 1), u), l(hash(i, j + 1, k + 1), hash(i + 1, j + 1, k + 1), u), w),
      q,
    );
  };
  return octave(x, y, z) * 0.7 + octave(x * 2.3 + 9, y * 2.3 + 9, z * 2.3 + 9) * 0.3;
}

/** A near rock: where, how big and turned (unit rock scaled), and its tone. */
export interface Placed {
  m: THREE.Matrix4;
  tint: THREE.Color;
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
    out.push({ m: rockMatrix(rng, p.x, p.y, p.z, r), tint: new THREE.Color(ROCK_TONES[Math.floor(rng() * ROCK_TONES.length)]).multiplyScalar(range(rng, 0.85, 1.15)) });
    i++;
  }
}

/** The near rocks as one instanced, faceted, lit mesh. */
export function nearRockMesh(rocks: Placed[], quality: Quality, seed: number): { mesh: THREE.InstancedMesh; dispose(): void } | null {
  if (rocks.length === 0) return null;
  const geo = rockGeometry(quality, seed);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, rocks.length);
  rocks.forEach((r, i) => {
    mesh.setMatrixAt(i, r.m);
    mesh.setColorAt(i, r.tint);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = 'asteroids';
  return { mesh, dispose: () => (geo.dispose(), mat.dispose()) };
}

const IMPOSTOR_VERTEX = /* glsl */ `
uniform vec3 uSunDir;
varying vec2 vUv;
varying float vSeed;
varying vec3 vSun;
varying vec3 vUp;
void main() {
  vec3 centre = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float radius = length(instanceMatrix[0].xyz);
  vec4 mv = viewMatrix * vec4(centre, 1.0);
  // Facing the camera; the quad is a little wider than the rock so the lumps fit inside it.
  mv.xy += position.xy * radius * 2.6;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * 2.6;
  vSeed = float(gl_InstanceID);
  vSun = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  vUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
}`;

const IMPOSTOR_FRAGMENT = /* glsl */ `
uniform vec3 uFill;
uniform vec3 uAlbedo;
uniform vec3 uKey;
varying vec2 vUv;
varying float vSeed;
varying vec3 vSun;
varying vec3 vUp;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float a = atan(vUv.y, vUv.x);
  float s = vSeed * 7.31;
  float edge = 1.0 + ${LUMP.toFixed(2)} * (0.45 * sin(a * 2.0 + s) + 0.3 * sin(a * 5.0 + s * 1.7) + 0.15 * sin(a * 11.0 + s * 2.9));
  float r = length(vUv) / edge;
  if (r > 1.0) discard;
  // Lit as a sphere, the normal bent by the same lumps so the terminator is ragged.
  vec3 n = normalize(vec3(vUv / edge, sqrt(max(0.0, 1.0 - r * r)) + 0.2 * sin(a * 3.0 + s)));
  float key = smoothstep(-0.05, 0.6, dot(n, vSun));
  float fill = 0.5 + 0.5 * dot(n, -vUp);
  vec3 col = uAlbedo * (0.6 + 0.4 * hash(vSeed)) * (key * uKey + fill * uFill * 4.0);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Far rocks round the course and crowded round the fields, as one draw of camera-facing impostors. */
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
  const mat = new THREE.ShaderMaterial({
    vertexShader: IMPOSTOR_VERTEX,
    fragmentShader: IMPOSTOR_FRAGMENT,
    uniforms: {
      uSunDir: { value: sunDir.clone() },
      uKey: { value: sun.clone().multiplyScalar(IMPOSTOR_KEY) },
      uFill: { value: IMPOSTOR_FILL.clone() },
      uAlbedo: { value: IMPOSTOR_ALBEDO.clone() },
    },
  });
  const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((x, i) => mesh.setMatrixAt(i, x));
  mesh.instanceMatrix.needsUpdate = true;
  // The bounds three computes from the unit quad miss the billboard's reach; the whole belt is one draw anyway.
  mesh.frustumCulled = false;
  mesh.name = 'farAsteroids';
  return { mesh, dispose: () => (geo.dispose(), mat.dispose()) };
}
