import * as THREE from 'three';
import type { TrackPalette } from '../../../core/types.ts';
import { SEA_LEVEL, TERRAIN_MARGIN, type Quality } from '../config.ts';
import { sunDirection } from '../environment.ts';
import type { Ground } from '../ground.ts';
import type { SeaLook } from '../../look/lookTuning.ts';

// The sea: one opaque mesh, one draw. Depth under the surface comes from a small baked
// texture of the terrain, so the shader can shade shallow turquoise to deep blue, paint coral
// through the shallows, and run foam along every shore — no transparency, no reflections.
// With a world look (LOOK) the water mirrors the sky's gradient through a Fresnel term on
// rippled normals, and the sun's glints run brighter than white (HDR) so the bloom catches them,
// plus a sparkle of single facets near the sun's path.

/** Depth texture resolution over the terrain area. */
const DEPTH_RES = { low: 160, high: 320 } as const;
/** Depth stored in a byte, 0..MAX_DEPTH metres. */
const MAX_DEPTH = 24;
/** Water grid cells per side over the terrain area; the apron runs on to the horizon. */
const GRID = { low: 48, high: 96 } as const;
const APRON = 9000;
const SHALLOW = 0x3fe0d8;
const DEEP = 0x0b4f8a;
const FOAM = 0xf4fbff;
/** Sparkle facets per metre, how often they re-roll (1/s) and the distance band they fade out over (m). */
const SPARKLE_CELLS = 1.5;
const SPARKLE_RATE = 6;
const SPARKLE_FADE: readonly [number, number] = [30, 200];
/** Sparkle shows only this close to the sun's mirror path (Phong power): elsewhere facets read as noise. */
const SPARKLE_LOBE = 48;
/** The fine ripples fade over this distance band (m): beyond it they alias into speckle. */
const FINE_RIPPLE_FADE: readonly [number, number] = [25, 140];
/**
 * The sky is mirrored off the ripples flattened to this share: at grazing angles full ripples
 * swing the mirrored ray between horizon and zenith and blotch the sea; glints keep them whole.
 */
const SKY_RIPPLE = 0.3;

const VERTEX = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  // Long, low swells: visible as moving glints, never tall enough to cover a causeway.
  world.y += 0.18 * sin(world.x * 0.021 + uTime * 0.9) + 0.12 * sin(world.z * 0.033 - uTime * 1.3);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform sampler2D uDepth;
uniform vec4 uArea;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uSky;
uniform vec3 uSunDir;
uniform vec3 uSun;
uniform vec3 uZenith;
uniform float uReflect;
uniform float uGlint;
uniform float uGlintPower;
uniform float uSparkle;
uniform float uSparkleGain;
varying vec3 vWorld;
#include <fog_pars_fragment>

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 uv = (vWorld.xz - uArea.xy) / uArea.zw;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float depth = mix(${MAX_DEPTH.toFixed(1)}, texture2D(uDepth, uv).r * ${MAX_DEPTH.toFixed(1)}, inside);
  float n = noise(vWorld.xz * 0.045 + uTime * 0.05);
  float wob = depth + (n - 0.5) * 0.9;
  vec3 col = mix(uShallow, uDeep, smoothstep(0.4, 11.0, wob));
  // Coral and weed patches showing through the shallows.
  float reef = smoothstep(0.55, 0.75, noise(vWorld.xz * 0.018)) * (1.0 - smoothstep(1.0, 6.0, depth)) * step(0.8, depth);
  vec3 coral = mix(vec3(0.95, 0.45, 0.42), vec3(0.62, 0.35, 0.75), noise(vWorld.xz * 0.05));
  col = mix(col, coral, reef * 0.45);
  // Foam: a frothy edge on every shore, and swash lines rolling in.
  float edge = 1.0 - smoothstep(0.0, 0.7, wob);
  float swash = smoothstep(0.85, 1.0, sin(depth * 2.2 - uTime * 1.6 + n * 3.0)) * (1.0 - smoothstep(0.5, 3.5, depth));
  col = mix(col, uFoam, clamp(edge + swash * 0.7, 0.0, 1.0));
  vec3 view = normalize(cameraPosition - vWorld);
#ifdef LOOK
  // Ripples at two scales (the fine ones only near); the sky they mirror is graded horizon to zenith like the sky dome.
  float dist = length(cameraPosition - vWorld);
  float fine = 0.25 * (1.0 - smoothstep(${FINE_RIPPLE_FADE[0].toFixed(1)}, ${FINE_RIPPLE_FADE[1].toFixed(1)}, dist));
  vec3 nrm = normalize(vec3(
    (noise(vWorld.xz * 0.6 + uTime * 0.7) - 0.5) * 0.5 + (noise(vWorld.xz * 2.3 - uTime * 1.1) - 0.5) * fine,
    1.0,
    (noise(vWorld.zx * 0.6 - uTime * 0.6) - 0.5) * 0.5 + (noise(vWorld.zx * 2.1 + uTime * 0.9) - 0.5) * fine));
  vec3 calm = normalize(vec3(nrm.x * ${SKY_RIPPLE.toFixed(2)}, nrm.y, nrm.z * ${SKY_RIPPLE.toFixed(2)}));
  vec3 rc = reflect(-view, calm);
  vec3 sky = mix(uSky, uZenith, pow(clamp(rc.y, 0.0, 1.0), 0.4));
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(view, calm), 0.0), 5.0);
  vec3 r = reflect(-view, nrm);
  col = mix(col, sky, clamp(fres * uReflect, 0.0, 1.0));
  float toSun = max(dot(r, uSunDir), 0.0);
  col += uSun * (uGlint * pow(toSun, uGlintPower));
  // Sparkle: a few facets per patch flash as their random tilt catches the sun, near the sun's path.
  float facet = step(1.0 - uSparkle, hash(floor(vWorld.xz * ${SPARKLE_CELLS.toFixed(2)}) + floor(uTime * ${SPARKLE_RATE.toFixed(1)})));
  col += uSun * (facet * uSparkleGain * pow(toSun, ${SPARKLE_LOBE.toFixed(1)}) * (1.0 - smoothstep(${SPARKLE_FADE[0].toFixed(1)}, ${SPARKLE_FADE[1].toFixed(1)}, dist)));
#else
  // Sky reflection at grazing angles and sun glints on the ripples.
  float fres = pow(1.0 - max(view.y, 0.0), 4.0);
  col = mix(col, uSky, fres * 0.55);
  vec3 nrm = normalize(vec3((noise(vWorld.xz * 0.6 + uTime * 0.7) - 0.5) * 0.5, 1.0, (noise(vWorld.zx * 0.6 - uTime * 0.6) - 0.5) * 0.5));
  float glint = pow(max(dot(nrm, normalize(uSunDir + view)), 0.0), 220.0);
  col += uSun * glint * 1.6;
#endif
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

export interface Sea {
  mesh: THREE.Mesh;
  update(time: number): void;
  dispose(): void;
}

/** Bakes the sea depth over the terrain area and builds the water surface; `look` is the world look's water, or null. */
export function buildSea(ground: Ground, palette: TrackPalette, quality: Quality, look: SeaLook | null): Sea {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const v of ground.views) {
    for (const p of v.ribbon.samples) {
      minX = Math.min(minX, p.pos.x);
      maxX = Math.max(maxX, p.pos.x);
      minZ = Math.min(minZ, p.pos.z);
      maxZ = Math.max(maxZ, p.pos.z);
    }
  }
  const x0 = minX - TERRAIN_MARGIN;
  const z0 = minZ - TERRAIN_MARGIN;
  const w = maxX - minX + 2 * TERRAIN_MARGIN;
  const d = maxZ - minZ + 2 * TERRAIN_MARGIN;

  const res = DEPTH_RES[quality];
  const data = new Uint8Array(res * res * 4);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = x0 + ((i + 0.5) / res) * w;
      const z = z0 + ((j + 0.5) / res) * d;
      const depth = SEA_LEVEL - ground.meshHeight(x, z);
      const o = (j * res + i) * 4;
      data[o] = Math.round(Math.max(0, Math.min(1, depth / MAX_DEPTH)) * 255);
      data[o + 3] = 255;
    }
  }
  const depthTex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
  depthTex.magFilter = THREE.LinearFilter;
  depthTex.minFilter = THREE.LinearFilter;
  depthTex.needsUpdate = true;

  // An inner grid over the terrain and a coarse apron out to the horizon.
  const g = GRID[quality];
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= g; j++) for (let i = 0; i <= g; i++) pos.push(x0 + (i / g) * w, SEA_LEVEL, z0 + (j / g) * d);
  const at = (i: number, j: number) => j * (g + 1) + i;
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
  }
  const ring = [at(0, 0), at(g, 0), at(g, g), at(0, g)];
  const outer = [
    [x0 - APRON, z0 - APRON],
    [x0 + w + APRON, z0 - APRON],
    [x0 + w + APRON, z0 + d + APRON],
    [x0 - APRON, z0 + d + APRON],
  ].map(([x, z]) => {
    pos.push(x, SEA_LEVEL, z);
    return pos.length / 3 - 1;
  });
  for (let q = 0; q < 4; q++) {
    const r = (q + 1) % 4;
    idx.push(ring[q], ring[r], outer[q], ring[r], outer[r], outer[q]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDepth: { value: depthTex },
        uArea: { value: new THREE.Vector4(x0, z0, w, d) },
        uShallow: { value: new THREE.Color(SHALLOW).lerp(new THREE.Color(palette.sky), 0.1) },
        uDeep: { value: new THREE.Color(DEEP).lerp(new THREE.Color(palette.sky), 0.15) },
        uFoam: { value: new THREE.Color(FOAM) },
        uSky: { value: new THREE.Color(palette.horizon) },
        uSunDir: { value: sunDirection(palette) },
        uSun: { value: new THREE.Color(palette.sun) },
        uZenith: { value: new THREE.Color(palette.sky) },
        uReflect: { value: look ? look.reflection : 0 },
        uGlint: { value: look ? look.glint : 0 },
        uGlintPower: { value: look ? look.glintPower : 1 },
        uSparkle: { value: look ? look.sparkle : 0 },
        uSparkleGain: { value: look ? look.sparkleGain : 0 },
      },
    ]),
    defines: look ? { LOOK: 1 } : {},
    fog: true,
  });
  // UniformsUtils.merge clones textures; bind the baked one itself so disposal frees it.
  mat.uniforms.uDepth.value = depthTex;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sea';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return {
    mesh,
    update(time) {
      mat.uniforms.uTime.value = time;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      depthTex.dispose();
    },
  };
}
