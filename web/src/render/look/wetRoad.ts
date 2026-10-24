import * as THREE from 'three';
import type { WetRoadLook } from './lookTuning.ts';

// The road's surface in a world's look, without a reflection render pass:
//  - a Fresnel sheen at grazing angles (the far road glows with the sky), and a glare where
//    the road mirrors the sun, in the material, so they cost a few ALU per pixel;
//  - a wetness mask written to alpha (1 − wet, faded by fog), which the post composite reads to
//    lay mirrored, smeared lights onto road pixels only (postShaders.ts, WET).
// How wet is per world (`baseWet`) and per vertex: the corridor marks slick stretches (ice)
// in a `slick` attribute (0..1), which are fully wet and glossier, so they read as slippery.
// Lines and kerbs are in the road texture, under the sheen: they stay as crisp as before.

export interface WetRoadOptions {
  sheen: boolean;
  /** Write the mask; only meaningful when the post pipeline will read it. */
  mask: boolean;
}

export function makeRoadWet(mat: THREE.MeshLambertMaterial, look: WetRoadLook, sunDir: readonly [number, number, number], sunColor: number, opts: WetRoadOptions): void {
  const uniforms = {
    uSheen: { value: opts.sheen ? look.sheen : 0 },
    uSheenPower: { value: look.sheenPower },
    uSheenColor: { value: new THREE.Color(look.sheenColor) },
    uSlickSheen: { value: look.slickSheen },
    uBaseWet: { value: look.baseWet },
    uGlint: { value: opts.sheen ? look.sunGlint : 0 },
    uGlintPower: { value: look.sunGlintPower },
    uSunDir: { value: new THREE.Vector3(...sunDir).normalize() },
    uSunColor: { value: new THREE.Color(sunColor) },
    uWetMask: { value: opts.mask ? 1 : 0 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float slick;\nvarying float vSlick;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSlick = slick;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uSheen;
uniform float uSheenPower;
uniform vec3 uSheenColor;
uniform float uSlickSheen;
uniform float uBaseWet;
uniform float uGlint;
uniform float uGlintPower;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uWetMask;
varying float vSlick;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `vec3 toEye = normalize(vViewPosition);
float grazing = 1.0 - saturate(dot(toEye, normal));
outgoingLight += uSheenColor * (uSheen * mix(1.0, uSlickSheen, vSlick) * pow(grazing, uSheenPower));
// The sun's mirror image on the road, in view space (viewMatrix carries the world direction there).
vec3 sunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
outgoingLight += uSunColor * (uGlint * pow(max(dot(reflect(-toEye, normal), sunView), 0.0), uGlintPower));
#include <opaque_fragment>`,
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
float wet = uWetMask * mix(uBaseWet, 1.0, vSlick);
#ifdef USE_FOG
gl_FragColor.a = 1.0 - wet * (1.0 - fogFactor);
#else
gl_FragColor.a = 1.0 - wet;
#endif`,
      );
  };
  mat.customProgramCacheKey = () => 'wet-road';
}
