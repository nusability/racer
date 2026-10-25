import * as THREE from 'three';

// Space-station hull drawn by the shader, not by geometry (the facade trick of render/facade.ts,
// in a station's language): a box's faces are tiled with plates of slightly different tone and
// dark seams, and along some plate rows run strips of lit portholes and, rarely, a band of guide
// light. Plates and portholes are metres across, so a spine a kilometre long reads as huge, and
// the pattern fades to its average once a plate is under a pixel, so far hull never shimmers.
//
// Geometry contract: a unit box with axis-aligned normals and its base on y = 0, scaled (and
// turned) per instance; the scale is read back from the instance matrix.

/** One plate, metres along and up a face. */
const PLATE: readonly [number, number] = [9, 4.5];
/** Seam width as a share of a plate, and how dark it is. */
const SEAM = 0.05;
const SEAM_DARK = 0.45;
/** Plates vary this much in tone. */
const PLATE_TONE: readonly [number, number] = [0.72, 1.12];
/** Every n-th plate row carries a porthole strip; its height as a share of the row; porthole pitch (m) and fill. */
const WINDOW_ROW = 3;
const WINDOW_BAND: readonly [number, number] = [0.38, 0.62];
const PORTHOLE = 2.2;
const PORTHOLE_FILL = 0.55;
/** Strips are lit in runs of this many plates; this share of runs is lit. */
const RUN = 4;
const LIT_SHARE = 0.4;
/** Porthole light (linear HDR emissive, cool and warm, share warm) and the guide band's. */
const WINDOW_COOL = new THREE.Color(1.1, 1.3, 1.6);
const WINDOW_WARM = new THREE.Color(1.6, 1.15, 0.7);
const WARM_SHARE = 0.3;
/** Share of plate rows that carry a guide band of the accent colour, and its strength. */
const BAND_SHARE = 0.05;
const BAND_GLOW = 1.4;
/** The pattern fades to its average between these plate-cell sizes per pixel (fwidth). */
const FILTER: readonly [number, number] = [0.25, 0.7];

const VERTEX_PARS = /* glsl */ `
varying vec3 vHull;
varying float vHullWall;
varying float vHullSeed;`;

const VERTEX = /* glsl */ `
#ifdef USE_INSTANCING
vec3 hlScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vHullSeed = float(gl_InstanceID);
#else
vec3 hlScale = vec3(1.0);
vHullSeed = 0.0;
#endif
vec3 hlP = position * hlScale;
vHullWall = 1.0 - step(0.5, abs(normal.y));
// Along the face and up it on walls; across the top on roofs and undersides.
vHull = vHullWall > 0.5 ? vec3(abs(normal.x) > 0.5 ? hlP.z : hlP.x, hlP.y, 0.0) : vec3(hlP.x, hlP.z, 0.0);`;

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vHull;
varying float vHullWall;
varying float vHullSeed;
uniform vec3 uCool;
uniform vec3 uWarm;
uniform vec3 uBand;
float hlHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}`;

const FRAGMENT = /* glsl */ `
{
  vec2 cell = vHull.xy / vec2(${PLATE[0].toFixed(2)}, ${PLATE[1].toFixed(2)});
  vec2 id = floor(cell);
  vec2 f = fract(cell);
  vec2 fw = fwidth(cell);
  float detail = 1.0 - smoothstep(${FILTER[0].toFixed(2)}, ${FILTER[1].toFixed(2)}, max(fw.x, fw.y));
  float seed = vHullSeed * 13.7;
  float tone = mix(${PLATE_TONE[0].toFixed(2)}, ${PLATE_TONE[1].toFixed(2)}, hlHash(id + seed));
  vec2 s = smoothstep(vec2(0.0), vec2(${SEAM.toFixed(3)}), f) * smoothstep(vec2(0.0), vec2(${SEAM.toFixed(3)}), 1.0 - f);
  float seam = mix(1.0 - ${((1 - SEAM_DARK) * SEAM * 4).toFixed(3)}, mix(${SEAM_DARK.toFixed(2)}, 1.0, s.x * s.y), detail);
  diffuseColor.rgb *= mix(${((PLATE_TONE[0] + PLATE_TONE[1]) / 2).toFixed(3)}, tone, detail) * seam;
  if (vHullWall > 0.5) {
    float row = step(mod(id.y, ${WINDOW_ROW.toFixed(1)}), 0.5);
    float band = step(${WINDOW_BAND[0].toFixed(2)}, f.y) * step(f.y, ${WINDOW_BAND[1].toFixed(2)});
    float hole = step(fract(vHull.x / ${PORTHOLE.toFixed(2)}), ${PORTHOLE_FILL.toFixed(2)});
    float lit = step(hlHash(vec2(floor(id.x / ${RUN.toFixed(1)}), id.y) + seed * 3.1), ${LIT_SHARE.toFixed(2)});
    float avg = ${((WINDOW_BAND[1] - WINDOW_BAND[0]) * PORTHOLE_FILL * LIT_SHARE).toFixed(4)} / ${WINDOW_ROW.toFixed(1)};
    float win = mix(avg, row * band * hole * lit, detail);
    vec3 tint = mix(uCool, uWarm, step(1.0 - ${WARM_SHARE.toFixed(2)}, hlHash(vec2(id.y, seed + 5.0))));
    totalEmissiveRadiance += tint * win;
    diffuseColor.rgb *= 1.0 - win;
    // A rare row carries a band of guide light along its whole length.
    float guide = step(hlHash(vec2(id.y * 0.37, seed + 9.0)), ${BAND_SHARE.toFixed(3)}) * step(0.45, f.y) * step(f.y, 0.55);
    totalEmissiveRadiance += uBand * mix(${(BAND_SHARE * 0.1).toFixed(4)}, guide, detail) * ${BAND_GLOW.toFixed(2)};
  }
}`;

/** Lambert hull plating with shader-drawn seams, porthole strips and guide bands (see the header). */
export function hullMaterial(accent: number): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const uniforms = {
    uCool: { value: WINDOW_COOL.clone() },
    uWarm: { value: WINDOW_WARM.clone() },
    uBand: { value: new THREE.Color(accent) },
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
  mat.customProgramCacheKey = () => 'hull-panels';
  return mat;
}
