import * as THREE from 'three';

// Asteroid surfaces, drawn on the GPU so every rock is its own shape and the polygons never
// show. One height function (noise lumps and a field of craters with raised rims, on the unit
// sphere, keyed by the rock's seed) shapes the near rocks' meshes in the vertex shader (smooth
// normals from the same function, so every level of detail has the same silhouette) and lights
// the far rocks' sprites as if they were those meshes. The fragment shader adds what geometry
// cannot: a fine bump, cavity darkening in hollows and crater floors, a regolith that shifts
// between dark carbon, rust and pale silicate, and grain sampled triplanar in metres.

/** How far the surface swells and dents (share of the radius). spaceRocks.ts clears rocks by it. */
export const LUMP = 0.28;
/** Noise lumps: base frequency on the unit sphere, and each octave's weight. */
const LUMP_FREQ = 1.4;
const OCTAVES = [0.55, 0.25, 0.12] as const;
/** Craters: cells per unit of the sphere, share of cells with one, radius range (share of a cell), rim height and depth (share of LUMP). */
const CRATER_CELLS = 2.6;
const CRATER_SHARE = 0.5;
const CRATER_RADIUS: readonly [number, number] = [0.25, 0.55];
const CRATER_RIM = 0.3;
const CRATER_DEPTH = 0.55;
/** Craters' weight against the lumps. */
const CRATER_WEIGHT = 0.75;
/** Finite-difference step (radians) for the near rocks' normals. */
const NORMAL_STEP = 0.02;
/** Fragment detail: bump frequency (per metre) and strength, cavity darkening, grain tile (m). */
const BUMP_FREQ = 0.35;
const BUMP = 0.35;
/** The bump gradient's finite-difference step, in units of its noise. */
const BUMP_STEP = 0.15;
const CAVITY = 0.45;
const GRAIN_TILE = 9;
/** The grain texture's mean (spaceRocks.ts paints it round this): what the far sprites take instead of sampling it. */
export const GRAIN_MEAN = 0.82;
/** Regolith tones (linear): carbon dark, rust, pale silicate, and how coarse their patches are on the sphere. */
const CARBON = new THREE.Color(0.06, 0.055, 0.05);
const RUST = new THREE.Color(0.105, 0.078, 0.058);
const SILICATE = new THREE.Color(0.16, 0.15, 0.135);
const PATCHES = 2.2;
/**
 * Lighting of the far sprites, matched to what the near rocks get from the scene's lights
 * (render/track/spaceSky.ts: a key of 3.6 from the star, a cool fill from the planet, both
 * through Lambert's 1/π), and the grain's mean the near rocks carry: the belt and the field
 * are one population. A soft wrap at the terminator.
 */
const SPRITE_KEY = 3.6 / Math.PI;
const SPRITE_FILL = new THREE.Color(0.05, 0.08, 0.13);
const SPRITE_FILL_GAIN = 1.5;

const TERMINATOR = 0.08;

const f = (n: number) => n.toFixed(4);
const vec3 = (c: THREE.Color) => `vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)})`;

/** The shared height function (see the header). `arHeight(p, seed)` on the unit sphere, in units of the radius. */
export const ROCK_HEIGHT = /* glsl */ `
float arHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float arNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 q = fract(x);
  q = q * q * (3.0 - 2.0 * q);
  return mix(mix(mix(arHash(i), arHash(i + vec3(1, 0, 0)), q.x), mix(arHash(i + vec3(0, 1, 0)), arHash(i + vec3(1, 1, 0)), q.x), q.y),
             mix(mix(arHash(i + vec3(0, 0, 1)), arHash(i + vec3(1, 0, 1)), q.x), mix(arHash(i + vec3(0, 1, 1)), arHash(i + vec3(1, 1, 1)), q.x), q.y), q.z) * 2.0 - 1.0;
}
vec3 arOffset(float seed) {
  return vec3(fract(seed * 0.1307) * 97.0, fract(seed * 0.2711) * 89.0, fract(seed * 0.0533) * 83.0);
}
// Lumps: three octaves; one rock in three is ridged (angular), one in three stretched into two lobes.
float arLumps(vec3 p, float seed) {
  vec3 o = arOffset(seed);
  float n = arNoise(p * ${f(LUMP_FREQ)} + o) * ${f(OCTAVES[0])}
          + arNoise(p * ${f(LUMP_FREQ * 2.2)} + o) * ${f(OCTAVES[1])}
          + arNoise(p * ${f(LUMP_FREQ * 4.7)} + o) * ${f(OCTAVES[2])};
  float family = fract(seed * 0.618);
  if (family < 0.333) n = mix(n, 0.75 - 1.6 * abs(n), 0.6);
  else if (family < 0.667) n = mix(n, abs(p.x) * 1.2 - 0.45, 0.45);
  return n;
}
// Craters: a cell field; a cell may hold a bowl with a raised rim. Negative in the bowl.
float arCraters(vec3 p, float seed) {
  vec3 q = p * ${f(CRATER_CELLS)} + arOffset(seed + 3.0);
  vec3 i = floor(q);
  vec3 fq = fract(q);
  float h = 0.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 c = vec3(float(x), float(y), float(z));
    vec3 id = i + c;
    if (arHash(id + 5.7) > ${f(CRATER_SHARE)}) continue;
    vec3 o = vec3(arHash(id), arHash(id + 11.3), arHash(id + 27.1));
    float rad = mix(${f(CRATER_RADIUS[0])}, ${f(CRATER_RADIUS[1])}, arHash(id + 3.1));
    float d = length(c + o - fq) / rad;
    h += d < 1.0 ? (d * d - 1.0) * ${f(CRATER_DEPTH)} : 0.0;
    float t = (d - 1.0) / 0.35;
    h += ${f(CRATER_RIM)} * exp(-t * t);
  }
  return h;
}
float arHeight(vec3 p, float seed) {
  return clamp(arLumps(p, seed) + arCraters(p, seed) * ${f(CRATER_WEIGHT)}, -1.0, 1.0) * ${f(LUMP)};
}
// The fine bump's height (two octaves), in noise units.
float arBump(vec3 m) {
  return arNoise(m) * 0.6 + arNoise(m * 2.7) * 0.3;
}
// Regolith: dark carbon, rust and pale silicate in broad patches.
vec3 arRegolith(vec3 p, float seed) {
  vec3 o = arOffset(seed + 7.0);
  float a = arNoise(p * ${f(PATCHES)} + o) * 0.5 + 0.5;
  float b = arNoise(p * ${f(PATCHES * 2.3)} - o) * 0.5 + 0.5;
  vec3 col = mix(${vec3(CARBON)}, ${vec3(RUST)}, smoothstep(0.35, 0.75, a));
  return mix(col, ${vec3(SILICATE)}, smoothstep(0.55, 0.85, b));
}`;

/** Ordered 4×4 dither threshold of this pixel (0..1): crossfades between levels of detail without blending. */
const DITHER = /* glsl */ `
const float AR_BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
float arDither() {
  ivec2 p = ivec2(mod(gl_FragCoord.xy, 4.0));
  return (AR_BAYER[p.x + p.y * 4] + 0.5) / 16.0;
}`;

/**
 * The near rocks' material: a unit icosphere per instance, displaced and normalled in the
 * vertex shader; per instance a seed and a fade (> 0: drawn where the dither is under it, the
 * level fading in; < 0: drawn where it is over -fade, the level fading out).
 */
export function nearRockMaterial(low: boolean, grain: THREE.Texture): THREE.MeshLambertMaterial {
  // The tint is per instance (instanceColor): the icosphere has no vertex colours.
  const mat = new THREE.MeshLambertMaterial();
  if (low) mat.defines = { ROCK_LOW: '' };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrain = { value: grain };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aSeed;
attribute float aFade;
varying vec3 vRock;
varying vec3 vRockN;
varying float vRockH;
varying float vRockSeed;
varying float vRockFade;
varying float vRockRadius;
varying mat3 vRockToView;
${ROCK_HEIGHT}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 arP = normalize(position);
float arH = arHeight(arP, aSeed);
vec3 arT1 = normalize(cross(arP, abs(arP.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
vec3 arT2 = cross(arP, arT1);
vec3 arA = normalize(arP + arT1 * ${f(NORMAL_STEP)});
vec3 arB = normalize(arP + arT2 * ${f(NORMAL_STEP)});
vec3 arP0 = arP * (1.0 + arH);
vec3 objectNormal = normalize(cross(arA * (1.0 + arHeight(arA, aSeed)) - arP0, arB * (1.0 + arHeight(arB, aSeed)) - arP0));
vRock = arP;
vRockN = objectNormal;
vRockH = arH / ${f(LUMP)};
vRockSeed = aSeed;
vRockFade = aFade;
vRockRadius = length(instanceMatrix[0].xyz);
// Object normals to view space through the instance's squash (inverse transpose) and the view.
vRockToView = normalMatrix * transpose(inverse(mat3(instanceMatrix)));`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = arP0;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `varying vec3 vRock;
varying vec3 vRockN;
varying float vRockH;
varying float vRockSeed;
varying float vRockFade;
varying float vRockRadius;
varying mat3 vRockToView;
uniform sampler2D uGrain;
${ROCK_HEIGHT}
${DITHER}
void main() {`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float th = arDither();
  if (vRockFade > 0.0 ? th >= vRockFade : th < -vRockFade) discard;
  vec3 m = vRock * vRockRadius;
  // Grain sampled triplanar in metres: no stretching, no seams over the lumps.
  vec3 w = pow(abs(normalize(vRockN)), vec3(4.0));
  w /= w.x + w.y + w.z;
  float grain = texture2D(uGrain, m.yz / ${f(GRAIN_TILE)}).r * w.x + texture2D(uGrain, m.xz / ${f(GRAIN_TILE)}).r * w.y + texture2D(uGrain, m.xy / ${f(GRAIN_TILE)}).r * w.z;
  float cavity = mix(${f(CAVITY)}, 1.0, smoothstep(-0.7, 0.35, vRockH));
  diffuseColor.rgb *= arRegolith(vRock, vRockSeed) * grain * cavity;
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
#ifndef ROCK_LOW
{
  // Fine bump: the noise's own gradient (central differences in metres), bending the rock's
  // object-space normal, so it is smooth at any distance; it fades out once under a pixel.
  vec3 m = vRock * vRockRadius * ${f(BUMP_FREQ)};
  float keep = 1.0 - smoothstep(0.15, 0.5, length(fwidth(m)));
  if (keep > 0.0) {
    vec3 n = normalize(vRockN);
    float e = ${f(BUMP_STEP)};
    vec3 g = vec3(arBump(m + vec3(e, 0.0, 0.0)) - arBump(m - vec3(e, 0.0, 0.0)), arBump(m + vec3(0.0, e, 0.0)) - arBump(m - vec3(0.0, e, 0.0)), arBump(m + vec3(0.0, 0.0, e)) - arBump(m - vec3(0.0, 0.0, e))) / (2.0 * e);
    n = normalize(n - (g - dot(g, n) * n) * ${f(BUMP)} * keep);
    normal = normalize(vRockToView * n);
  }
}
#endif`,
      );
  };
  mat.customProgramCacheKey = () => `near-rock-${low ? 'low' : 'high'}`;
  return mat;
}

const SPRITE_VERTEX = /* glsl */ `
attribute float aSeed;
uniform vec3 uSunDir;
varying vec2 vUv;
varying float vSeed;
varying vec3 vSun;
varying vec3 vUp;
varying mat3 vSpin;
void main() {
  vec3 centre = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float radius = length(instanceMatrix[0].xyz);
  vec4 mv = viewMatrix * vec4(centre, 1.0);
  // Facing the camera; the quad is a little wider than the rock so the lumps fit inside it.
  mv.xy += position.xy * radius * ${f(2 * (1 + LUMP) * 1.02)};
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * ${f(2 * (1 + LUMP) * 1.02)};
  vSeed = aSeed;
  vSun = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  vUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  // View space to the rock's own frame: the camera's inverse turn, then the rock's own spin.
  float a = aSeed * 1.7;
  float b = aSeed * 2.9;
  mat3 spin = mat3(cos(a), sin(a), 0.0, -sin(a), cos(a), 0.0, 0.0, 0.0, 1.0) * mat3(1.0, 0.0, 0.0, 0.0, cos(b), sin(b), 0.0, -sin(b), cos(b));
  vSpin = spin * transpose(mat3(viewMatrix));
}`;

const SPRITE_FRAGMENT = /* glsl */ `
uniform vec3 uFill;
uniform vec3 uKey;
varying vec2 vUv;
varying float vSeed;
varying vec3 vSun;
varying vec3 vUp;
varying mat3 vSpin;
${ROCK_HEIGHT}
void main() {
  float r = length(vUv);
  if (r > ${f(1 + LUMP)}) discard;
  // The silhouette: the height of the rock where its limb lies in this direction.
  vec3 limb = vSpin * normalize(vec3(vUv, 0.0));
  float edge = 1.0 + clamp(arLumps(limb, vSeed), -1.0, 1.0) * ${f(LUMP)};
  if (r > edge) discard;
  // The surface under this pixel, lit as the near rocks' mesh would be: the sphere point, its
  // height, and a normal from the height's slope.
  float z = sqrt(max(0.0, 1.0 - min(1.0, (r * r) / (edge * edge))));
  vec3 nv = normalize(vec3(vUv / edge, z));
  vec3 p = vSpin * nv;
  float e = 0.05;
  vec3 t1 = normalize(cross(p, abs(p.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(p, t1);
  float h0 = arHeight(p, vSeed);
  float ha = arHeight(normalize(p + t1 * e), vSeed);
  float hb = arHeight(normalize(p + t2 * e), vSeed);
  vec3 n = normalize(p - (t1 * (ha - h0) + t2 * (hb - h0)) / e);
  vec3 nView = transpose(vSpin) * n;
  float key = smoothstep(-${f(TERMINATOR)}, ${f(TERMINATOR)}, dot(nView, vSun)) * max(dot(nView, vSun), 0.0);
  float fill = 0.5 + 0.5 * dot(nView, -vUp);
  float cavity = mix(${f(CAVITY)}, 1.0, smoothstep(-0.7, 0.35, h0 / ${f(LUMP)}));
  vec3 col = arRegolith(p, vSeed) * ${f(GRAIN_MEAN)} * cavity * (key * uKey + fill * uFill * ${f(SPRITE_FILL_GAIN)});
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** The far rocks' material: camera-facing quads, each drawn and lit as a rock seen from where the camera is. */
export function farRockMaterial(sunDir: THREE.Vector3, sun: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SPRITE_VERTEX,
    fragmentShader: SPRITE_FRAGMENT,
    uniforms: {
      uSunDir: { value: sunDir.clone() },
      uKey: { value: sun.clone().multiplyScalar(SPRITE_KEY) },
      uFill: { value: SPRITE_FILL.clone() },
    },
  });
}
