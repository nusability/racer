// Point sprites for the set-B landmarks: halos round lights and looping GPU particles.

import * as THREE from 'three';
import { KINETIC_GLSL, type SharedUniforms, type V3 } from './motion.ts';
import type { Rng } from '../../../core/rng.ts';

// --- Point sprites: halos and looping particles -------------------------------------------

const POINTS_VERTEX = /* glsl */ `
attribute vec3 color;
attribute float aSize;
#ifdef KINETIC
${KINETIC_GLSL}
attribute vec4 aTwinkle;
#else
uniform float uTime;
#endif
#ifdef BALLISTIC
attribute vec3 aVel;
attribute vec4 aLife;
attribute vec4 aPhys;
#endif
uniform float uHalfHeight;
uniform float uStrength;
varying vec3 vColor;
varying float vAlpha;
#include <fog_pars_vertex>
float mrHash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  vec3 p = position;
  float alpha = uStrength;
  float size = aSize;
#ifdef KINETIC
  p = mrKinetic(p);
  float tw = 0.5 + 0.5 * sin(aTwinkle.y * uTime + aTwinkle.z);
  alpha *= 1.0 - aTwinkle.x * (1.0 - pow(tw, aTwinkle.w));
#endif
#ifdef BALLISTIC
  // aLife: period, lifetime, phase, growth/s. aPhys: gravity, drag, per-cycle jitter, fade-in.
  float t = uTime + aLife.z;
  float age = mod(t, aLife.x);
  float seed = floor(t / aLife.x) * 17.17 + aLife.z * 3.31;
  p += (vec3(mrHash(seed), mrHash(seed + 1.7), mrHash(seed + 3.1)) - 0.5) * aPhys.z;
  float drag = max(aPhys.y, 0.001);
  p += aVel * (1.0 - exp(-drag * age)) / drag;
  p.y -= 0.5 * aPhys.x * age * age;
  float life = age / aLife.y;
  alpha *= step(life, 1.0) * min(1.0, life / max(aPhys.w, 0.001)) * max(1.0 - life, 0.0);
  size *= 1.0 + aLife.w * age;
#endif
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float depth = -mvPosition.z;
  gl_PointSize = (depth > 0.05 && alpha > 0.002) ? size * projectionMatrix[1][1] * uHalfHeight / depth : 0.0;
  vColor = color;
  vAlpha = alpha;
  #include <fog_vertex>
}`;

const POINTS_FRAGMENT = /* glsl */ `
uniform float uHardness;
varying vec3 vColor;
varying float vAlpha;
#include <fog_pars_fragment>
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(q, q);
  if (d2 > 1.0) discard;
  float a = pow(1.0 - d2, uHardness) * vAlpha;
  vec3 c = vColor;
#ifdef USE_FOG
  float fogF = smoothstep(fogNear, fogFar, vFogDepth);
#ifdef ADDITIVE
  a *= 1.0 - fogF;
#else
  c = mix(c, fogColor, fogF);
#endif
#endif
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;

const scratchSize = new THREE.Vector2();

export function pointsMaterial(u: SharedUniforms, opts: { additive: boolean; kinetic: boolean; ballistic: boolean; hardness: number; strength: number }): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (opts.additive) defines.ADDITIVE = '';
  if (opts.kinetic) defines.KINETIC = '';
  if (opts.ballistic) defines.BALLISTIC = '';
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uHalfHeight: { value: 400 }, uStrength: { value: opts.strength }, uHardness: { value: opts.hardness } }]);
  uniforms.uTime = u.uTime;
  return new THREE.ShaderMaterial({
    vertexShader: POINTS_VERTEX,
    fragmentShader: POINTS_FRAGMENT,
    uniforms,
    defines,
    fog: true,
    transparent: true,
    depthWrite: false,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

export function trackDrawingBuffer(points: THREE.Points, mat: THREE.ShaderMaterial): void {
  const uniform = mat.uniforms.uHalfHeight;
  points.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(scratchSize);
    uniform.value = scratchSize.y * 0.5;
  };
}

export interface ParticleLife {
  /** Loop period, s. */
  period: number;
  /** Visible part of the period, s. */
  lifetime: number;
  phase: number;
  /** Size growth per second (relative). */
  grow?: number;
}
export interface ParticlePhys {
  gravity?: number;
  drag?: number;
  /** Random offset of the emitter each cycle, metres (fireworks burst in new places). */
  jitter?: number;
  /** Fraction of the lifetime spent fading in. */
  fadeIn?: number;
}

/** Looping ballistic particles evaluated entirely on the GPU. */
export class Particles {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];
  private readonly size: number[] = [];
  private readonly vel: number[] = [];
  private readonly life: number[] = [];
  private readonly phys: number[] = [];
  private readonly c = new THREE.Color();

  constructor(readonly additive: boolean, readonly hardness: number) {}

  get count(): number {
    return this.size.length;
  }

  add(origin: V3, vel: V3, color: THREE.ColorRepresentation, size: number, life: ParticleLife, phys: ParticlePhys = {}): void {
    this.c.set(color);
    this.pos.push(origin[0], origin[1], origin[2]);
    this.col.push(this.c.r, this.c.g, this.c.b);
    this.size.push(size);
    this.vel.push(vel[0], vel[1], vel[2]);
    this.life.push(life.period, life.lifetime, life.phase, life.grow ?? 0);
    this.phys.push(phys.gravity ?? 0, phys.drag ?? 0, phys.jitter ?? 0, phys.fadeIn ?? 0.05);
  }

  build(u: SharedUniforms): THREE.Points {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(this.size, 1));
    g.setAttribute('aVel', new THREE.Float32BufferAttribute(this.vel, 3));
    g.setAttribute('aLife', new THREE.Float32BufferAttribute(this.life, 4));
    g.setAttribute('aPhys', new THREE.Float32BufferAttribute(this.phys, 4));
    const mat = pointsMaterial(u, { additive: this.additive, kinetic: false, ballistic: true, hardness: this.hardness, strength: 1 });
    const pts = new THREE.Points(g, mat);
    // Particles fly well past their emitters; the landmark as a whole is culled by distance.
    pts.frustumCulled = false;
    trackDrawingBuffer(pts, mat);
    return pts;
  }
}

/** Uniform random unit vector (for bursts). */
export function sphereDir(rng: Rng): V3 {
  const z = rng() * 2 - 1;
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), z, r * Math.sin(a)];
}
