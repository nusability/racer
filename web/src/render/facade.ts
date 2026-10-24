import * as THREE from 'three';
import type { TrackPalette } from '../core/types.ts';

// Lit city facades drawn by the shader, not by geometry: a building is one box, and the window
// grid, the lit offices, the shopfronts at street level and the neon band round some crowns
// are worked out per pixel from where the pixel sits on its face. So a whole district (the
// blocks beside the course, the skyline on the horizon, a tower cluster) is one instanced draw
// of twelve-triangle boxes, whatever the quality. Each instance's index seeds its own pattern;
// its instance colour tints the wall (concrete, glass, brick).
//
// Geometry contract: a box with axis-aligned normals and its base on y = 0, scaled per instance
// (the scale is read back from the instance matrix, so windows keep their size on any tower).

/** One window bay and one storey, metres. */
const BAY = 3.4;
const STOREY = 3.7;
/** Glass inside each bay, as fractions of the bay (left/right and sill/head). */
const GLASS_X: readonly [number, number] = [0.16, 0.84];
const GLASS_Y: readonly [number, number] = [0.24, 0.8];
/** Glass is darker than the wall by this share (it reflects the dark sky). */
const GLASS_DARK = 0.5;
/** Share of offices lit at midday and at deep dusk. */
const LIT_DAY = 0.12;
const LIT_DUSK = 0.42;
/** Window light at midday and at deep dusk (emissive, before fog). */
const GLOW_DAY = 0.15;
const GLOW_DUSK = 0.95;
/** Office light: warm tungsten and cool fluorescent, and the share that is cool. */
const WARM = 0xffc070;
const COOL = 0xbfe4ff;
const COOL_SHARE = 0.4;
/**
 * The pattern fades to its average once a bay covers less than this many pixels across
 * (fwidth of the cell coordinate between these), so far towers never shimmer.
 */
const FILTER: readonly [number, number] = [0.3, 0.75];
/** Neon band under the roofline: its depth below the top and its height, metres. */
const CROWN_TOP = 1.2;
const CROWN_HEIGHT = 2.6;
/** Share of buildings wearing a neon crown, and its strength. */
const CROWN_SHARE = 0.45;
const CROWN_GLOW = 1.1;
/** Shopfronts: lit glass along the ground storey, this tall, on this share of bays. */
const SHOP_HEIGHT = 4.2;
const SHOP_SHARE = 0.55;
const SHOP_GLOW = 0.55;

/** The city's neon accents: magenta, cyan, amber. */
export const CITY_NEON: readonly [number, number, number] = [0xff3fb4, 0x3ff0ff, 0xffb02e];

export interface FacadeOptions {
  palette: TrackPalette;
  /** The three neon colours a crown may take (sRGB hex). */
  neon: readonly [number, number, number];
  /** Baked occlusion at the street: walls darken by `amount` toward their base over `height` metres; null for none. */
  baseShade: { amount: number; height: number } | null;
}

const VERTEX_PARS = /* glsl */ `
varying vec4 vFacade;
varying float vFacadeWall;`;

const VERTEX = /* glsl */ `
#ifdef USE_INSTANCING
vec3 fcScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
float fcSeed = float(gl_InstanceID);
#else
vec3 fcScale = vec3(1.0);
float fcSeed = 0.0;
#endif
vec3 fcP = position * fcScale;
// Along the face (whichever horizontal axis the face spans), up it, the seed, the full height.
vFacade = vec4(abs(normal.x) > 0.5 ? fcP.z : fcP.x, fcP.y, fcSeed, fcScale.y);
vFacadeWall = 1.0 - step(0.5, abs(normal.y));`;

const FRAGMENT_PARS = /* glsl */ `
varying vec4 vFacade;
varying float vFacadeWall;
uniform float uLit;
uniform float uGlow;
uniform vec3 uWarm;
uniform vec3 uCool;
uniform vec3 uNeon[3];
uniform vec2 uBaseShade;
float fcHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}`;

const FRAGMENT = /* glsl */ `
if (vFacadeWall > 0.5) {
  float seed = vFacade.z;
  vec2 cell = vec2(vFacade.x / ${BAY.toFixed(2)}, vFacade.y / ${STOREY.toFixed(2)});
  vec2 id = floor(cell);
  vec2 f = fract(cell);
  vec2 fw = fwidth(cell);
  float detail = 1.0 - smoothstep(${FILTER[0].toFixed(2)}, ${FILTER[1].toFixed(2)}, max(fw.x, fw.y));
  float glass = step(${GLASS_X[0].toFixed(2)}, f.x) * step(f.x, ${GLASS_X[1].toFixed(2)}) * step(${GLASS_Y[0].toFixed(2)}, f.y) * step(f.y, ${GLASS_Y[1].toFixed(2)});
  float glassAvg = ${((GLASS_X[1] - GLASS_X[0]) * (GLASS_Y[1] - GLASS_Y[0])).toFixed(3)};
  // Offices are lit in runs along a floor (one tenant), so hash the floor and a coarse bay.
  float lit = step(fcHash(vec2(floor(id.x / 3.0), id.y) + seed * 17.13), uLit);
  vec3 tone = mix(uWarm, uCool, step(${(1 - COOL_SHARE).toFixed(2)}, fcHash(vec2(id.y, seed) + 9.2)));
  float g = mix(glassAvg, glass, detail);
  float l = mix(uLit, lit, detail);
  diffuseColor.rgb *= 1.0 - g * ${GLASS_DARK.toFixed(2)};
  totalEmissiveRadiance += tone * g * l * uGlow;
  // Shopfronts along the ground storey.
  float shop = step(vFacade.y, ${SHOP_HEIGHT.toFixed(2)}) * step(0.6, vFacade.y) * step(fcHash(vec2(id.x, seed + 3.3)), ${SHOP_SHARE.toFixed(2)});
  totalEmissiveRadiance += uWarm * shop * ${SHOP_GLOW.toFixed(2)} * uGlow;
  // A neon band under the roofline of some buildings.
  float top = vFacade.w - ${CROWN_TOP.toFixed(2)};
  float crown = step(top - ${CROWN_HEIGHT.toFixed(2)}, vFacade.y) * step(vFacade.y, top) * step(fcHash(vec2(seed, 4.1)), ${CROWN_SHARE.toFixed(2)});
  float hue = fcHash(vec2(seed, 7.7));
  vec3 neon = hue < 0.34 ? uNeon[0] : hue < 0.67 ? uNeon[1] : uNeon[2];
  totalEmissiveRadiance += neon * crown * ${CROWN_GLOW.toFixed(2)};
  diffuseColor.rgb *= 1.0 - crown;
  // Occlusion where the wall meets the street (lit shopfronts are emissive, so they stay lit).
  diffuseColor.rgb *= 1.0 - uBaseShade.x * (1.0 - smoothstep(0.0, uBaseShade.y, vFacade.y));
}`;

/** Lambert facades with shader-drawn windows, shopfronts and neon crowns (see the header). */
export function facadeMaterial(o: FacadeOptions): THREE.MeshLambertMaterial {
  const dusk = o.palette.dusk;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const uniforms = {
    uLit: { value: LIT_DAY + (LIT_DUSK - LIT_DAY) * dusk },
    uGlow: { value: GLOW_DAY + (GLOW_DUSK - GLOW_DAY) * dusk },
    uWarm: { value: new THREE.Color(WARM) },
    uCool: { value: new THREE.Color(COOL) },
    uNeon: { value: o.neon.map((c) => new THREE.Color(c)) },
    // amount 0 multiplies by exactly 1: the facade is unchanged where the look is off.
    uBaseShade: { value: o.baseShade ? new THREE.Vector2(o.baseShade.amount, o.baseShade.height) : new THREE.Vector2(0, 1) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAGMENT}`);
  };
  mat.customProgramCacheKey = () => 'city-facade';
  return mat;
}

/** The facade geometry: a unit box with its base on y = 0. */
export function facadeBox(): THREE.BoxGeometry {
  return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
}
