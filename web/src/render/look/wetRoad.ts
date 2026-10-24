import * as THREE from 'three';
import type { WetRoadLook } from './lookTuning.ts';

// Wet asphalt on the road material, without a reflection render pass:
//  - a Fresnel sheen at grazing angles (the far road glows with the night haze), in the
//    material, so it costs a few ALU per pixel and needs no render target;
//  - a wetness mask written to alpha (1 − wet, faded by fog), which the post composite reads to
//    lay mirrored, smeared neon onto road pixels only (postShaders.ts, WET).
// Lines and kerbs are in the road texture, under the sheen: they stay as crisp as before.

export interface WetRoadOptions {
  sheen: boolean;
  /** Write the mask; only meaningful when the post pipeline will read it. */
  mask: boolean;
}

export function makeRoadWet(mat: THREE.MeshLambertMaterial, look: WetRoadLook, opts: WetRoadOptions): void {
  const uniforms = {
    uSheen: { value: opts.sheen ? look.sheen : 0 },
    uSheenPower: { value: look.sheenPower },
    uSheenColor: { value: new THREE.Color(look.sheenColor) },
    uWetMask: { value: opts.mask ? 1 : 0 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSheen;\nuniform float uSheenPower;\nuniform vec3 uSheenColor;\nuniform float uWetMask;')
      .replace(
        '#include <opaque_fragment>',
        `outgoingLight += uSheenColor * (uSheen * pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), uSheenPower));
#include <opaque_fragment>`,
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
#ifdef USE_FOG
gl_FragColor.a = 1.0 - uWetMask * (1.0 - fogFactor);
#else
gl_FragColor.a = 1.0 - uWetMask;
#endif`,
      );
  };
  mat.customProgramCacheKey = () => 'wet-road';
}
