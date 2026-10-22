// GPU-side motion for the set-B landmarks: every part carries its own hub, pivot, axes and
// rates as vertex attributes, so a fair full of spinning rides costs one time uniform per frame.

import * as THREE from 'three';

export type V3 = readonly [number, number, number];

// --- Motion -------------------------------------------------------------------------------

/**
 * Two-level rigid motion evaluated on the GPU. The inner rotation turns the part about its
 * pivot (axisB); the outer one carries pivot and part round the hub (axisA). Angles are
 * `spin * t + swing * sin(freq * t + phase)`. `upright` keeps the part's own orientation
 * while it orbits (ferris-wheel cabins). Hop and drift are translations added last.
 */
export interface Motion {
  hub?: V3;
  axisA?: V3;
  spinA?: number;
  swingA?: number;
  pivot?: V3;
  axisB?: V3;
  spinB?: number;
  swingB?: number;
  freq?: number;
  phase?: number;
  upright?: boolean;
  /** Upward pulse, metres, shaped by the shared oscillation. */
  hop?: number;
  drift?: V3;
  driftFreq?: number;
}

/** Light flicker: brightness dips by `depth`; `sharp` > 1 turns a pulse into a blink. */
export interface Twinkle {
  depth: number;
  freq: number;
  phase: number;
  sharp?: number;
}

export const KINETIC_GLSL = /* glsl */ `
attribute vec4 aHub;
attribute vec4 aAxisA;
attribute vec4 aPivot;
attribute vec4 aAxisB;
attribute vec4 aOsc;
attribute vec4 aDrift;
uniform float uTime;
vec3 mrRotate(vec3 v, vec3 k, float a) {
  float c = cos(a);
  float s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
vec3 mrKinetic(vec3 v) {
  float osc = sin(aOsc.y * uTime + aOsc.z);
  float angA = aAxisA.w * uTime + aOsc.x * osc;
  float angB = aPivot.w * uTime + aAxisB.w * osc;
  vec3 local = mrRotate(v - aPivot.xyz, aAxisB.xyz, angB);
  vec3 body = aHub.w > 0.5 ? local : mrRotate(local, aAxisA.xyz, angA);
  vec3 p = aHub.xyz + mrRotate(aPivot.xyz - aHub.xyz, aAxisA.xyz, angA) + body;
  p.y += aOsc.w * pow(max(osc, 0.0), 3.0);
  p += aDrift.xyz * sin(aDrift.w * uTime + aOsc.z);
  return p;
}`;

const TWINKLE_GLSL = /* glsl */ `
attribute vec4 aTwinkle;
uniform float uGlow;
float mrTwinkle() {
  float f = 0.5 + 0.5 * sin(aTwinkle.y * uTime + aTwinkle.z);
  return 1.0 - aTwinkle.x * (1.0 - pow(f, aTwinkle.w));
}`;

export interface SharedUniforms {
  uTime: { value: number };
  uGlow: { value: number };
}

function injectKinetic(shader: THREE.WebGLProgramParametersWithUniforms, u: SharedUniforms, twinkle: boolean): void {
  shader.uniforms.uTime = u.uTime;
  shader.uniforms.uGlow = u.uGlow;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${KINETIC_GLSL}\n${twinkle ? TWINKLE_GLSL : ''}`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = mrKinetic(transformed);');
  if (twinkle) {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      '#include <color_vertex>\nvColor.rgb *= uGlow * mrTwinkle();',
    );
  }
}

export function solidMaterial(u: SharedUniforms, kinetic: boolean): THREE.MeshLambertMaterial {
  // Double-sided so awnings, sails and flags can be single quads; flat shading derives the
  // normal from screen derivatives, so both faces light correctly without a normal buffer.
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  if (kinetic) {
    mat.onBeforeCompile = (shader) => injectKinetic(shader, u, false);
    mat.customProgramCacheKey = () => 'mrb-solid-kinetic';
  }
  return mat;
}

export function glowMaterial(u: SharedUniforms): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => injectKinetic(shader, u, true);
  mat.customProgramCacheKey = () => 'mrb-glow';
  return mat;
}

/** Additive, depth-tested but not depth-writing glow (light beams); same motion and twinkle. */
export function beamMaterial(u: SharedUniforms): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  mat.onBeforeCompile = (shader) => {
    injectKinetic(shader, u, true);
    // Fog must fade an additive surface to nothing; mixing toward the fog colour would add it.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      '#ifdef USE_FOG\ngl_FragColor.rgb *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);\n#endif',
    );
  };
  mat.customProgramCacheKey = () => 'mrb-beam';
  return mat;
}

export const KINETIC_ATTRS = ['aHub', 'aAxisA', 'aPivot', 'aAxisB', 'aOsc', 'aDrift'] as const;
