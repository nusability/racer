// Course-hazard plumbing for the set-C landmarks: the parts of a landmark that ARE a course
// hazard (a lava bomb, a ship across a channel, a leviathan across the causeway) are driven on
// the CPU from the hazard's schedule and placed with the binding's track → local mapping, so
// what players see is exactly what they collide with.

import * as THREE from 'three';
import type { HazardDef } from '../../../core/types.ts';
import type { CourseHazard } from '../../../core/hazards.ts';
import type { HazardBinding, Landmark, LandmarkOptions } from '../types.ts';

export type HazardOf<T extends HazardDef['type']> = CourseHazard & { def: Extract<HazardDef, { type: T }> };

/** The binding, checked to be of a type this landmark can play; anything else fails loud. */
export function bindingOf<T extends HazardDef['type']>(opts: LandmarkOptions, kind: string, types: readonly T[]): { binding: HazardBinding; hazard: HazardOf<T> } | undefined {
  const b = opts.hazard;
  if (!b) return undefined;
  if (!(types as readonly string[]).includes(b.hazard.def.type)) {
    throw new Error(`landmark ${kind} cannot play a ${b.hazard.def.type} hazard (${b.hazard.def.id}); it supports ${types.join(', ')}`);
  }
  return { binding: b, hazard: b.hazard as HazardOf<T> };
}

/**
 * The road's local axes at (s, x): one track metre along x (lateral), y (up) and s, as local
 * vectors. They are deliberately not normalised: geometry built in track metres and placed
 * with this basis comes out the right size whatever scale the landmark is placed at.
 */
export function roadBasis(b: HazardBinding, s: number, x: number, out = new THREE.Matrix4()): THREE.Matrix4 {
  const o = b.toLocal(s, x, 0, new THREE.Vector3());
  const ex = b.toLocal(s, x + 1, 0, new THREE.Vector3()).sub(o);
  const ey = b.toLocal(s, x, 1, new THREE.Vector3()).sub(o);
  const es = b.toLocal(s + 1, x, 0, new THREE.Vector3()).sub(o);
  return out.makeBasis(ex, ey, es);
}

/** Wraps a finished landmark so its update also drives the bound parts. */
export function withBound(lm: Landmark, drive: (time: number) => void): Landmark {
  return {
    group: lm.group,
    radius: lm.radius,
    update(time, dt) {
      lm.update(time, dt);
      drive(time);
    },
    dispose: lm.dispose,
  };
}

/** A mesh moved every frame; it travels far off its rest bounds, so it is never frustum-culled. */
export function mover(geo: THREE.BufferGeometry, mat: THREE.Material, name: string): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.matrixAutoUpdate = false;
  m.frustumCulled = false;
  return m;
}

const SPRITE_VERTEX = /* glsl */ `
attribute vec3 color;
attribute float aSize;
attribute float aAlpha;
uniform float uHalfHeight;
varying vec3 vColor;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float depth = -mvPosition.z;
  float scale = length(modelMatrix[0].xyz);
  gl_PointSize = (depth > 0.05 && aAlpha > 0.002) ? aSize * scale * projectionMatrix[1][1] * uHalfHeight / depth : 0.0;
  vColor = color;
  vAlpha = aAlpha;
  #include <fog_vertex>
}`;

const SPRITE_FRAGMENT = /* glsl */ `
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

/** CPU-placed point sprites (smoke and fire trails behind bound parts), one draw call. */
export class Sprites {
  readonly points: THREE.Points;
  private readonly pos: THREE.BufferAttribute;
  private readonly alpha: THREE.BufferAttribute;
  private readonly size: THREE.BufferAttribute;
  private readonly col: THREE.BufferAttribute;

  constructor(readonly count: number, additive: boolean, hardness: number, name: string) {
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.alpha = new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
    this.size = new THREE.BufferAttribute(new Float32Array(count), 1);
    this.col = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    g.setAttribute('position', this.pos);
    g.setAttribute('aAlpha', this.alpha);
    g.setAttribute('aSize', this.size);
    g.setAttribute('color', this.col);
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uHalfHeight: { value: 400 }, uHardness: { value: hardness } }]);
    const mat = new THREE.ShaderMaterial({
      vertexShader: SPRITE_VERTEX,
      fragmentShader: SPRITE_FRAGMENT,
      uniforms,
      defines: additive ? { ADDITIVE: '' } : {},
      fog: true,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.name = name;
    this.points.frustumCulled = false;
    // Its shader already follows the placement scale (see finishCoast).
    this.points.userData.scalesWithPlacement = true;
    this.points.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(scratchSize);
      uniforms.uHalfHeight.value = scratchSize.y * 0.5;
    };
  }

  /** Fixed look of sprite i. */
  style(i: number, color: THREE.ColorRepresentation, size: number): void {
    const c = new THREE.Color(color);
    this.col.setXYZ(i, c.r, c.g, c.b);
    this.size.setX(i, size);
  }

  place(i: number, p: THREE.Vector3, alpha: number): void {
    this.pos.setXYZ(i, p.x, p.y, p.z);
    this.alpha.setX(i, alpha);
  }

  hide(i: number): void {
    this.alpha.setX(i, 0);
  }

  commit(): void {
    this.pos.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** A matrix that hides an instance or mover (zero scale). */
export const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
