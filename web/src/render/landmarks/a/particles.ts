// Soft point clouds for the set-A landmarks: fixed lamps (beacons, halos) plus a ring buffer
// of short-lived particles (fire, smoke, dust), one draw call per cloud. Like the rest of the
// scene they take the fog, but each cloud can take less of it (see setFogScale).

import * as THREE from 'three';

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
