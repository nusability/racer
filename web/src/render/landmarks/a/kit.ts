// Shared building kit for the set-A landmarks.
//
// Every landmark is a *rig*: all its parts, static or moving, are merged into one skinned mesh
// per material layer, each vertex rigidly bound to a single bone. Static parts ride the root
// bone; a ship, a leg or a radar dish rides its own. So a whole spaceport with ships taking
// off is one opaque draw, one emissive draw and one additive-beam draw, and animating it is
// just moving bones (three uploads the bone matrices as one float texture per frame).
// Particles (fire, smoke, dust, glow halos) are one point cloud per blend mode.

import * as THREE from 'three';
import type { TrackPalette } from '../../../core/types.ts';

export { mulberry32, range, type Rng } from '../../../core/rng.ts';

// --- Colour ---

export function col(hex: THREE.ColorRepresentation): THREE.Color {
  return new THREE.Color(hex);
}

export function mix(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

/** Multiplies brightness; >1 lightens (clamped per channel by the display, not here). */
export function shade(c: THREE.ColorRepresentation, k: number): THREE.Color {
  return new THREE.Color(c).multiplyScalar(k);
}

/** How much brighter lights and glows should read on this palette (1 at midday). */
export function glowBoost(p: TrackPalette): number {
  return 1 + p.dusk * DUSK_GLOW_GAIN;
}
const DUSK_GLOW_GAIN = 1.2;

// --- Transforms ---

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** A placement matrix: translate, then Euler XYZ rotation (radians), then scale. */
export function T(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  _q.setFromEuler(_e.set(rx, ry, rz));
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** A matrix that stretches a unit +Y primitive (height 1, base at origin) from a to b. */
export function between(a: THREE.Vector3, b: THREE.Vector3, thickness: number): THREE.Matrix4 {
  const d = _v.subVectors(b, a);
  const len = d.length();
  _q.setFromUnitVectors(UP, d.normalize());
  return new THREE.Matrix4().compose(a, _q, _s.set(thickness, len, thickness));
}
const UP = new THREE.Vector3(0, 1, 0);

// --- Primitives (all centred on the origin unless noted) ---

export const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);
/** Box whose base sits on y = 0. */
export const block = (w: number, h: number, d: number): THREE.BufferGeometry =>
  new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
/** Cylinder along +Y with its base on y = 0. */
export const cyl = (rTop: number, rBot: number, h: number, seg = 8, open = false): THREE.BufferGeometry =>
  new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open).translate(0, h / 2, 0);
export const ball = (r: number, w = 8, h = 6): THREE.BufferGeometry => new THREE.SphereGeometry(r, w, h);
export const rock = (r: number, detail = 0): THREE.BufferGeometry => new THREE.IcosahedronGeometry(r, detail);
/** Unit strut: a square column of height 1 along +Y, for `between`. */
export const strut = (): THREE.BufferGeometry => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
/** A ring of `n` boxes standing on a circle: crenellations, light rings, pad markings. */
export function ringOf(n: number, r: number, w: number, h: number, d: number, y = 0): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(new THREE.BoxGeometry(w, h, d).applyMatrix4(T(Math.cos(a) * r, y, Math.sin(a) * r, 0, -a)));
  }
  return out;
}

// --- The rig ---

export type Layer = 'solid' | 'glow' | 'beam';
const LAYERS: readonly Layer[] = ['solid', 'glow', 'beam'];

interface Part {
  geo: THREE.BufferGeometry;
  color: THREE.Color;
  alpha: number;
  alphas: Float32Array | null;
  bone: number;
}

export interface AddOpts {
  m?: THREE.Matrix4;
  bone?: THREE.Bone;
  layer?: Layer;
  /** Beam layer only: opacity of this part (vertex alpha). */
  alpha?: number;
  /** Beam layer only: per-vertex opacity of a non-indexed geometry (overrides `alpha`). */
  alphas?: Float32Array;
}

export class Rig {
  readonly root = new THREE.Bone();
  readonly bones: THREE.Bone[] = [this.root];
  private readonly index = new Map<THREE.Bone, number>([[this.root, 0]]);
  private readonly parts: Record<Layer, Part[]> = { solid: [], glow: [], beam: [] };
  private readonly invRoot = new THREE.Matrix4();
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private skeleton: THREE.Skeleton | null = null;

  /** A new bone parented to `parent` (default the root), at a local offset. */
  bone(parent: THREE.Bone = this.root, x = 0, y = 0, z = 0): THREE.Bone {
    const b = new THREE.Bone();
    b.position.set(x, y, z);
    parent.add(b);
    this.index.set(b, this.bones.length);
    this.bones.push(b);
    return b;
  }

  /** Adds a part in its bone's local frame. The geometry is consumed. */
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, o: AddOpts = {}): void {
    if (o.m) {
      geo.applyMatrix4(o.m);
      if (o.m.determinant() < 0) geo = flipWinding(geo);
    }
    const bone = this.index.get(o.bone ?? this.root);
    if (bone === undefined) throw new Error('Rig.add: bone does not belong to this rig');
    if (o.alphas && (geo.index || o.alphas.length !== geo.getAttribute('position').count)) {
      throw new Error('Rig.add: per-vertex alphas need a non-indexed geometry of matching size');
    }
    this.parts[o.layer ?? 'solid'].push({
      geo,
      color: new THREE.Color(color),
      alpha: o.alpha ?? 1,
      alphas: o.alphas ?? null,
      bone,
    });
  }

  addAll(geos: THREE.BufferGeometry[], color: THREE.ColorRepresentation, o: AddOpts = {}): void {
    for (const g of geos) this.add(g, color, o);
  }

  /** Triangle count per layer so far (for budgets in the viewer and in tests of taste). */
  triangles(): number {
    let n = 0;
    for (const l of LAYERS) for (const p of this.parts[l]) n += triCount(p.geo);
    return n;
  }

  /**
   * Merges each layer into one skinned mesh and adds them (with the bone tree) to `group`.
   * `radius`/`height` bound everything that moves, for frustum culling.
   */
  build(group: THREE.Group, radius: number, height: number): void {
    // Identity inverses: every part is authored in its own bone's frame, so the skinned
    // position is simply bone.matrixWorld × vertex.
    const skeleton = new THREE.Skeleton(this.bones, this.bones.map(() => new THREE.Matrix4()));
    this.skeleton = skeleton;
    group.add(this.root);
    const sphere = new THREE.Sphere(new THREE.Vector3(0, height / 2, 0), Math.hypot(radius, height / 2));
    for (const layer of LAYERS) {
      const parts = this.parts[layer];
      if (parts.length === 0) continue;
      const geo = mergeParts(parts, layer === 'beam');
      const mat = layerMaterial(layer);
      const mesh = new THREE.SkinnedMesh(geo, mat);
      mesh.bind(skeleton, new THREE.Matrix4());
      mesh.boundingSphere = sphere;
      mesh.name = `rig-${layer}`;
      if (layer === 'beam') mesh.renderOrder = BEAM_RENDER_ORDER;
      group.add(mesh);
      this.materials.push(mat);
      this.geometries.push(geo);
    }
    for (const l of LAYERS) this.parts[l].length = 0;
  }

  /**
   * Brings bone world matrices up to date (call after posing, before reading points), so
   * particle emitters attached to moving bones don't trail a frame behind.
   */
  sync(): void {
    this.root.updateMatrixWorld(true);
    this.invRoot.copy(this.root.matrixWorld).invert();
  }

  /** A point given in `bone`'s frame, expressed in the landmark's local frame. Call sync() first. */
  local(bone: THREE.Bone, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(x, y, z).applyMatrix4(bone.matrixWorld).applyMatrix4(this.invRoot);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.skeleton?.dispose();
  }
}

/** Beams draw after the opaque world and the smoke so they glow through dust. */
const BEAM_RENDER_ORDER = 5;

/** A mirroring transform turns faces inside out; swap two corners of every triangle back. */
function flipWinding(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  if (flat !== geo) geo.dispose();
  for (const name of ['position', 'normal']) {
    const a = flat.getAttribute(name);
    if (!a) continue;
    for (let t = 0; t < a.count; t += 3) {
      const x = a.getX(t + 1), y = a.getY(t + 1), z = a.getZ(t + 1);
      a.setXYZ(t + 1, a.getX(t + 2), a.getY(t + 2), a.getZ(t + 2));
      a.setXYZ(t + 2, x, y, z);
    }
  }
  return flat;
}

function triCount(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

function mergeParts(parts: Part[], withAlpha: boolean): THREE.BufferGeometry {
  const flat = parts.map((p) => (p.geo.index ? p.geo.toNonIndexed() : p.geo));
  let total = 0;
  for (const g of flat) total += g.getAttribute('position').count;
  const cs = withAlpha ? 4 : 3;
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const colr = new Float32Array(total * cs);
  const skinIndex = new Uint16Array(total * 4);
  const skinWeight = new Float32Array(total * 4);
  let o = 0;
  flat.forEach((g, i) => {
    const p = parts[i];
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const gp = g.getAttribute('position');
    const gn = g.getAttribute('normal');
    for (let v = 0; v < gp.count; v++, o++) {
      pos[o * 3] = gp.getX(v);
      pos[o * 3 + 1] = gp.getY(v);
      pos[o * 3 + 2] = gp.getZ(v);
      nrm[o * 3] = gn.getX(v);
      nrm[o * 3 + 1] = gn.getY(v);
      nrm[o * 3 + 2] = gn.getZ(v);
      colr[o * cs] = p.color.r;
      colr[o * cs + 1] = p.color.g;
      colr[o * cs + 2] = p.color.b;
      if (withAlpha) colr[o * cs + 3] = p.alphas ? p.alphas[v] : p.alpha;
      skinIndex[o * 4] = p.bone;
      skinWeight[o * 4] = 1;
    }
    if (g !== p.geo) g.dispose();
    p.geo.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colr, cs));
  out.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  return out;
}

function layerMaterial(layer: Layer): THREE.Material {
  switch (layer) {
    case 'solid':
      return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    case 'glow':
      return new THREE.MeshBasicMaterial({ vertexColors: true });
    case 'beam':
      // Light shafts are light, not matter: fog would add the haze colour on top instead of
      // dimming them, so they stay unfogged and fade by their own vertex alpha.
      return new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
  }
}

/**
 * A cone of light from the origin down −Y (lamp at the origin), `alpha` at the lamp fading to
 * nothing at the far end. `o.m` places it in its bone's frame.
 */
export function addBeam(
  rig: Rig,
  length: number,
  radius: number,
  color: THREE.ColorRepresentation,
  alpha: number,
  o: AddOpts,
): void {
  const cone = new THREE.CylinderGeometry(radius * BEAM_TIP_RATIO, radius, length, BEAM_SEGMENTS, 1, true);
  const g = cone.translate(0, -length / 2, 0).toNonIndexed();
  cone.dispose();
  const p = g.getAttribute('position');
  const alphas = new Float32Array(p.count);
  for (let v = 0; v < p.count; v++) alphas[v] = alpha * (1 + p.getY(v) / length);
  rig.add(g, color, { ...o, layer: 'beam', alphas });
}
const BEAM_SEGMENTS = 10;
const BEAM_TIP_RATIO = 0.08;

// --- Particles ---

const POINT_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 color;
uniform float uHalfHeight;
varying vec3 vColor;
varying float vAlpha;
varying float vFogDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vColor = color;
  vAlpha = aAlpha;
  vFogDepth = -mv.z;
  // World-size sprites that also follow the landmark's placement scale.
  float worldScale = length(modelMatrix[0].xyz);
  float depth = -mv.z;
  gl_PointSize = (depth > 0.5 && aAlpha > 0.002) ? aSize * worldScale * projectionMatrix[1][1] * uHalfHeight / depth : 0.0;
}`;

const POINT_FRAGMENT = /* glsl */ `
uniform float uHardness;
uniform float uFogScale;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec3 vColor;
varying float vAlpha;
varying float vFogDepth;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(p, p);
  if (d2 > 1.0) discard;
  float a = pow(1.0 - d2, uHardness) * vAlpha;
  float f = smoothstep(fogNear, fogFar, vFogDepth) * uFogScale;
  #ifdef ADDITIVE
  // Light fades into haze rather than turning into haze.
  gl_FragColor = vec4(vColor, a * (1.0 - f));
  #else
  gl_FragColor = vec4(mix(vColor, fogColor, f), a);
  #endif
  #include <colorspace_fragment>
}`;

/** What a family of particles looks like and how it moves. Built once, reused per emit. */
export interface Brush {
  life: number;
  size0: number;
  size1: number;
  c0: THREE.Color;
  c1: THREE.Color;
  alpha: number;
  /** Fraction of velocity kept per second (1 = no drag). */
  keep: number;
  /** Vertical acceleration, m/s² (negative falls, positive rises like hot smoke). */
  lift: number;
}

export function brush(b: Partial<Brush> & Pick<Brush, 'life' | 'size0' | 'size1'>): Brush {
  return {
    c0: b.c0 ?? new THREE.Color(1, 1, 1),
    c1: b.c1 ?? b.c0 ?? new THREE.Color(1, 1, 1),
    alpha: b.alpha ?? 1,
    keep: b.keep ?? 1,
    lift: b.lift ?? 0,
    ...b,
  } as Brush;
}

/** Fade-in share of a particle's life (the rest fades out). */
const FADE_IN = 0.12;

/**
 * One point cloud: the first `fixed` slots are lamps the owner places each frame (beacons,
 * halos); the rest is a ring buffer of short-lived particles.
 */
export class Particles {
  readonly points: THREE.Points;
  /** Constant drift added to every live particle, m/s (wind). */
  readonly wind = new THREE.Vector3();
  private readonly pos: Float32Array;
  private readonly colr: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly brushOf: (Brush | null)[];
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private next: number;

  constructor(
    readonly capacity: number,
    readonly fixed: number,
    additive: boolean,
    hardness: number,
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.colr = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity);
    this.brushOf = new Array<Brush | null>(capacity).fill(null);
    this.next = fixed;
    this.geometry.setAttribute('position', dyn(this.pos, 3));
    this.geometry.setAttribute('color', dyn(this.colr, 3));
    this.geometry.setAttribute('aSize', dyn(this.size, 1));
    this.geometry.setAttribute('aAlpha', dyn(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: POINT_VERTEX,
      fragmentShader: POINT_FRAGMENT,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uHalfHeight: { value: 400 }, uHardness: { value: hardness }, uFogScale: { value: 1 } },
      ]),
      defines: additive ? { ADDITIVE: '' } : {},
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    // Particles roam anywhere in the landmark; a stale bounding sphere would cull live ones.
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? ADDITIVE_ORDER : SMOKE_ORDER;
    const half = this.material.uniforms.uHalfHeight;
    const scratch = new THREE.Vector2();
    this.points.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(scratch);
      half.value = scratch.y * 0.5;
    };
  }

  /**
   * How much of the scene fog this cloud takes (1 = all). Tall smoke and dust rise out of the
   * ground haze the fog stands for, so they may take less and stay readable from afar.
   */
  setFogScale(k: number): void {
    this.material.uniforms.uFogScale.value = k;
  }

  /** Places fixed lamp `i` for this frame. */
  lamp(i: number, x: number, y: number, z: number, size: number, c: THREE.Color, a: number): void {
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.colr[i * 3] = c.r;
    this.colr[i * 3 + 1] = c.g;
    this.colr[i * 3 + 2] = c.b;
    this.size[i] = size;
    this.alpha[i] = a;
  }

  emit(b: Brush, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    if (this.capacity === this.fixed) return;
    const i = this.next;
    this.next = i + 1 >= this.capacity ? this.fixed : i + 1;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.age[i] = 0;
    this.brushOf[i] = b;
    this.alpha[i] = 0;
  }

  update(dt: number): void {
    const wx = this.wind.x * dt;
    const wy = this.wind.y * dt;
    const wz = this.wind.z * dt;
    for (let i = this.fixed; i < this.capacity; i++) {
      const b = this.brushOf[i];
      if (!b) continue;
      const age = (this.age[i] += dt);
      const t = age / b.life;
      if (t >= 1) {
        this.brushOf[i] = null;
        this.alpha[i] = 0;
        continue;
      }
      const k = Math.pow(b.keep, dt);
      const i3 = i * 3;
      this.vel[i3] *= k;
      this.vel[i3 + 1] = this.vel[i3 + 1] * k + b.lift * dt;
      this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt + wx;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt + wy;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt + wz;
      this.size[i] = b.size0 + (b.size1 - b.size0) * t;
      this.alpha[i] = b.alpha * (t < FADE_IN ? t / FADE_IN : (1 - t) / (1 - FADE_IN));
      this.colr[i3] = b.c0.r + (b.c1.r - b.c0.r) * t;
      this.colr[i3 + 1] = b.c0.g + (b.c1.g - b.c0.g) * t;
      this.colr[i3 + 2] = b.c0.b + (b.c1.b - b.c0.b) * t;
    }
    for (const name of ['position', 'color', 'aSize', 'aAlpha']) {
      (this.geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Smoke draws before the additive glows so fire reads on top of its own smoke. */
const SMOKE_ORDER = 2;
const ADDITIVE_ORDER = 3;

function dyn(a: Float32Array, n: number): THREE.BufferAttribute {
  const attr = new THREE.BufferAttribute(a, n);
  attr.setUsage(THREE.DynamicDrawUsage);
  return attr;
}

// --- Small maths for animation ---

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** 0..1 ramp of `x` across [a, b]. */
export const ramp = (x: number, a: number, b: number): number => clamp01((x - a) / (b - a));
export const fract = (x: number): number => x - Math.floor(x);

/** Cubic Bézier, written into `out`. */
export function bezier(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return out.set(
    a.x * w0 + b.x * w1 + c.x * w2 + d.x * w3,
    a.y * w0 + b.y * w1 + c.y * w2 + d.y * w3,
    a.z * w0 + b.z * w1 + c.z * w2 + d.z * w3,
  );
}

/** A landmark's shared parts, disposed together. */
export interface Kit {
  group: THREE.Group;
  rig: Rig;
  glow: Particles;
  smoke: Particles;
}

export function makeKit(glowCapacity: number, glowFixed: number, smokeCapacity: number): Kit {
  const group = new THREE.Group();
  const rig = new Rig();
  const glow = new Particles(glowCapacity, glowFixed, true, GLOW_HARDNESS);
  const smoke = new Particles(smokeCapacity, 0, false, SMOKE_HARDNESS);
  group.add(smoke.points, glow.points);
  return { group, rig, glow, smoke };
}
const GLOW_HARDNESS = 1.6;
const SMOKE_HARDNESS = 0.7;

export function disposeKit(k: Kit): void {
  k.rig.dispose();
  k.glow.dispose();
  k.smoke.dispose();
}
