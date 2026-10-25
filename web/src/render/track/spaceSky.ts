import * as THREE from 'three';
import { mulberry32, range } from '../../core/rng.ts';
import type { TrackPalette } from '../../core/types.ts';
import { sunDirection } from './environment.ts';

// Space at infinity: deep black with a faint nebula, one hard star, a banded gas giant (streaked
// belts, eddies along their edges, a great storm and a string of white ovals) under
// and beside the course (lit by the star, its night side barely there, a thin bright rim of
// atmosphere on the day side) and crisp stars. Depth comes from light, not fog:
// the planet's lit face and the star carry the far field. The light matches it: a hard key from
// the star and a cool fill from below, the planet's bounce.

/** Sky sphere radius: drawn at infinity (xyww), so any radius inside the near plane works. */
const SKY_RADIUS = 10;
/**
 * The planet, placed from the star so its phase always reads: its centre turns this far round
 * from the star's azimuth (toward +azimuth) and sits this far below the horizon (radians). Half
 * a turn off the star, a little less, lights about half its face: a crisp terminator across it.
 */
const PLANET_AZIMUTH_FROM_STAR = 1.5;
const PLANET_ELEVATION = -0.55;
/** Angular radius of the disc (radians): big enough that its limb stands above the horizon ahead. */
const PLANET_RADIUS = 0.7;
/** Its pole tilts this far off world up toward the star side, so the bands lie at an angle. */
const PLANET_TILT = 0.45;
/** Band colours of the gas giant (sRGB): pale ice-blue zones, deep blue belts, a cream zone. */
const PLANET_ZONE = 0xa9d8ea;
const PLANET_BELT = 0x3c5f9e;
const PLANET_CREAM = 0xe4dcc2;
/** Banding: belts across the latitudes, and how hard the turbulence bends them. */
const BANDS = 9;
const BAND_WARP = 1.4;
/**
 * Fine banding: many thin streaks of slightly different tone inside the belts, the turbulence
 * stretched along the longitudes this many times (how far a streak runs before it breaks), and
 * how strongly the streaks shift the tone.
 */
const STREAKS = 46;
const STREAK_STRETCH = 9;
const STREAK_TONE = 0.16;
/** Shear eddies along the belt edges: their size (cells round the planet) and how far they curl the bands. */
const EDDIES = 14;
const EDDY_CURL = 0.035;
/** The great storm: latitude and longitude (radians), half extent (lon, lat), its swirl and colours (sRGB). */
const STORM_AT: readonly [number, number] = [-0.32, 0.9];
const STORM_SIZE: readonly [number, number] = [0.3, 0.13];
const STORM_SWIRL = 5;
const STORM_CORE = 0xf2e6d0;
const STORM_RING = 0x2d4d86;
/** Small white ovals strung along one belt: how many, their latitude and size (radians). */
const OVALS = 7;
const OVAL_LAT = 0.42;
const OVAL_SIZE = 0.045;
/** The disc darkens toward its limb (the light crosses more haze there): power of the cosine and floor. */
const LIMB_DARK: readonly [number, number] = [0.45, 0.35];
/**
 * Lit face brightness (linear): the brightest broad thing in the frame, but its zones stay under
 * the bloom's threshold once exposed (look/worldLooks.ts), so it reads as a surface, not a glare.
 */
const PLANET_GAIN = 0.5;
/** The night side is not black: a faint blue from starlight and the station's glow. */
const PLANET_NIGHT = 0x060a16;
/** Atmosphere rim: colour, how thin (power of the grazing term) and how strong. */
const RIM = 0x8fd2ff;
const RIM_POWER = 4;
const RIM_GAIN = 0.45;
/** Glow outside the limb, as a share of the disc's radius, and its strength. */
const HALO_WIDTH = 0.03;
const HALO_GAIN = 0.3;
/** The star: disc size (cosine of its angular radius), its HDR gain (blooms) and a tight halo. */
const STAR_DISC = 0.99993;
const STAR_GAIN = 12;
const STAR_HALO: readonly [number, number] = [900, 0.9];
const STAR_GLOW: readonly [number, number] = [24, 0.05];
/** Nebula: two faint colours, how large its clouds are, and how strong (linear, near black). */
const NEBULA_A = 0x5a2a7a;
const NEBULA_B = 0x1c4a6a;
const NEBULA_SCALE = 1.8;
const NEBULA_GAIN = 0.07;
/** Background stars: how many, their size in pixels, and the brightness spread (power law). */
const STARS = 2600;
const STAR_SIZE: readonly [number, number] = [1.4, 2.6];
const STAR_POWER = 5;
const STAR_BRIGHT = 2.2;
/** Star colours by temperature: blue-white, white, warm. */
const STAR_TINTS = [0xbcd4ff, 0xffffff, 0xfff0d8, 0xffd2a8];
/** The key light from the star and the fill from the planet below (intensity, colour). */
const KEY = 3.6;
const FILL_SKY = 0x0c1020;
const FILL_PLANET = 0x4a78a8;
const FILL = 1.1;

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}`;

const NOISE = /* glsl */ `
float h3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float n3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * n3(p);
    p = p * 2.03 + 11.7;
    a *= 0.5;
  }
  return s;
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform vec3 uPlanet;
uniform vec3 uPole;
uniform vec3 uZone;
uniform vec3 uBelt;
uniform vec3 uCream;
uniform vec3 uStormCore;
uniform vec3 uStormRing;
uniform vec3 uNight;
uniform vec3 uRim;
uniform vec3 uNebA;
uniform vec3 uNebB;
varying vec3 vDir;
${NOISE}
const float R = ${Math.sin(PLANET_RADIUS).toFixed(5)};
void main() {
  vec3 d = normalize(vDir);
  // Nebula: two soft cloud layers, only where the first is dense, so most of the sky stays black.
  float n = fbm3(d * ${NEBULA_SCALE.toFixed(2)});
  float m = fbm3(d * ${(NEBULA_SCALE * 2.3).toFixed(2)} + 5.0);
  vec3 col = mix(uNebA, uNebB, m) * smoothstep(0.42, 0.8, n) * (0.4 + m) * ${NEBULA_GAIN.toFixed(3)};
  // The star.
  float toSun = max(dot(d, uSunDir), 0.0);
  col += uSun * (pow(toSun, ${STAR_HALO[0].toFixed(1)}) * ${STAR_HALO[1].toFixed(2)} + pow(toSun, ${STAR_GLOW[0].toFixed(1)}) * ${STAR_GLOW[1].toFixed(3)});
  col = mix(col, uSun * ${STAR_GAIN.toFixed(1)}, smoothstep(${STAR_DISC.toFixed(5)}, ${(STAR_DISC + 0.00003).toFixed(5)}, toSun));

  // The planet: a sphere of radius R round the unit vector uPlanet, seen from the origin.
  float b = dot(d, uPlanet);
  float h = b * b - (1.0 - R * R);
  float tP = h > 0.0 && b > 0.0 ? b - sqrt(h) : -1.0;
  if (tP > 0.0) {
    vec3 N = (d * tP - uPlanet) / R;
    float lat = dot(N, uPole);
    vec3 e1 = normalize(cross(uPole, abs(uPole.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 e2 = cross(uPole, e1);
    float lon = atan(dot(N, e2), dot(N, e1));
    float la = asin(clamp(lat, -1.0, 1.0));
    // Eddies curl the bands along their edges: a turbulence that shifts the latitude it reads.
    float eddy = fbm3(vec3(cos(lon), sin(lon), la * 3.0) * ${(EDDIES / 3).toFixed(2)}) - 0.5;
    float warp = fbm3(N * 3.1) - 0.5;
    float swirl = fbm3(N * 9.0 + 3.0) - 0.5;
    float l2 = lat + warp * ${(BAND_WARP * 0.1).toFixed(3)} + swirl * 0.02 + eddy * ${EDDY_CURL.toFixed(3)};
    float bands = sin(l2 * ${(BANDS * Math.PI).toFixed(3)});
    vec3 surf = mix(uBelt, uZone, smoothstep(-0.6, 0.6, bands));
    surf = mix(surf, uCream, smoothstep(0.75, 0.95, sin(l2 * ${(BANDS * 0.5 * Math.PI).toFixed(3)} + 0.7)) * 0.7);
    // Streaks: thin bands of tone, their turbulence stretched along the longitudes.
    float streak = fbm3(vec3(cos(lon) * 2.0, sin(lon) * 2.0, l2 * ${STREAK_STRETCH.toFixed(1)}) * 1.6) - 0.5;
    surf *= 1.0 + ${STREAK_TONE.toFixed(2)} * (sin(l2 * ${(STREAKS * Math.PI).toFixed(3)} + streak * 6.0) * 0.6 + streak * 1.4);
    // The great storm: an oval of pale cloud wound into a spiral, ringed by a dark collar.
    vec2 sq = vec2(sin(lon - ${STORM_AT[1].toFixed(3)}) / ${STORM_SIZE[0].toFixed(3)}, (la - ${STORM_AT[0].toFixed(3)}) / ${STORM_SIZE[1].toFixed(3)});
    float sr = length(sq);
    float sa = atan(sq.y, sq.x) + sr * ${STORM_SWIRL.toFixed(1)};
    float spiral = 0.5 + 0.5 * sin(sa * 2.0 + fbm3(vec3(sq * 2.0, 1.0)) * 4.0);
    float stormIn = (1.0 - smoothstep(0.55, 1.0, sr)) * step(0.0, cos(lon - ${STORM_AT[1].toFixed(3)}));
    float collar = exp(-pow((sr - 1.05) / 0.18, 2.0)) * step(0.0, cos(lon - ${STORM_AT[1].toFixed(3)}));
    surf = mix(surf, uStormRing, collar * 0.65);
    surf = mix(surf, mix(uStormCore * 0.8, uStormCore, spiral), stormIn);
    // Small white ovals along one belt, spaced round it.
    float slot = floor((lon + 3.14159) / 6.28318 * ${OVALS.toFixed(1)});
    float slon = (slot + 0.5) / ${OVALS.toFixed(1)} * 6.28318 - 3.14159 + (fract(sin(slot * 12.9) * 437.5) - 0.5) * 0.4;
    vec2 oq = vec2(sin(lon - slon) / ${(OVAL_SIZE * 1.8).toFixed(3)}, (la - ${OVAL_LAT.toFixed(3)}) / ${OVAL_SIZE.toFixed(3)});
    surf = mix(surf, uStormCore, (1.0 - smoothstep(0.6, 1.0, length(oq))) * 0.85 * step(0.0, cos(lon - slon)));
    // Limb darkening: the haze thickens toward the edge of the disc.
    float mu = max(dot(N, -d), 0.0);
    surf *= mix(${LIMB_DARK[1].toFixed(2)}, 1.0, pow(mu, ${LIMB_DARK[0].toFixed(2)}));
    float ndl = dot(N, uSunDir);
    float lit = smoothstep(-0.06, 0.35, ndl);
    float graze = pow(1.0 - max(dot(N, -d), 0.0), ${RIM_POWER.toFixed(1)});
    vec3 planet = uNight + surf * lit * ${PLANET_GAIN.toFixed(2)} + uRim * graze * smoothstep(-0.2, 0.3, ndl) * ${RIM_GAIN.toFixed(2)};
    // Anti-aliased limb: the edge softens over about a pixel.
    float edge = smoothstep(0.0, fwidth(h) * 1.5, h);
    col = mix(col, planet, edge);
  } else {
    // A thin glow of atmosphere just outside the lit limb.
    if (b > 0.0) {
      float miss = sqrt(max(0.0, 1.0 - b * b)) / R - 1.0;
      vec3 limb = normalize(d * b - uPlanet);
      col += uRim * exp(-miss / ${HALO_WIDTH.toFixed(3)}) * smoothstep(-0.1, 0.4, dot(limb, uSunDir)) * ${HALO_GAIN.toFixed(2)};
    }
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const STAR_VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform vec3 uPlanet;
uniform float uPx;
varying vec3 vColor;
const float R = ${Math.sin(PLANET_RADIUS).toFixed(5)};
void main() {
  vec3 d = normalize(position);
  vColor = aColor;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
  // Stars behind the planet's disc are hidden (the sky is drawn without depth).
  float b = dot(d, uPlanet);
  gl_PointSize = b > 0.0 && b * b > 1.0 - R * R ? 0.0 : aSize * uPx;
}`;

const STAR_FRAGMENT = /* glsl */ `
varying vec3 vColor;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.25, 0.5, r);
  gl_FragColor = vec4(vColor * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** World direction toward the planet's centre, placed from the star (see PLANET_AZIMUTH_FROM_STAR). */
export function planetDirection(palette: TrackPalette): THREE.Vector3 {
  const sun = sunDirection(palette);
  const az = Math.atan2(sun.z, sun.x) + PLANET_AZIMUTH_FROM_STAR;
  return new THREE.Vector3(Math.cos(PLANET_ELEVATION) * Math.cos(az), Math.sin(PLANET_ELEVATION), Math.cos(PLANET_ELEVATION) * Math.sin(az));
}

/** Space round the course (see the header): the sky, the stars and the light. */
export function applySpaceSky(scene: THREE.Scene, palette: TrackPalette): { sun: THREE.DirectionalLight; dispose(): void } {
  const sunDir = sunDirection(palette);
  const planet = planetDirection(palette);
  const pole = new THREE.Vector3(0, 1, 0).lerp(new THREE.Vector3(sunDir.x, 0, sunDir.z).normalize(), PLANET_TILT).normalize();
  scene.background = new THREE.Color(0x000000);
  scene.fog = null;

  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: {
      uSun: { value: new THREE.Color(palette.sun) },
      uSunDir: { value: sunDir.clone() },
      uPlanet: { value: planet.clone() },
      uPole: { value: pole },
      uZone: { value: new THREE.Color(PLANET_ZONE) },
      uBelt: { value: new THREE.Color(PLANET_BELT) },
      uCream: { value: new THREE.Color(PLANET_CREAM) },
      uStormCore: { value: new THREE.Color(STORM_CORE) },
      uStormRing: { value: new THREE.Color(STORM_RING) },
      uNight: { value: new THREE.Color(PLANET_NIGHT) },
      uRim: { value: new THREE.Color(RIM) },
      uNebA: { value: new THREE.Color(NEBULA_A) },
      uNebB: { value: new THREE.Color(NEBULA_B) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 48, 24), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.name = 'sky';

  const rng = mulberry32(0x57a4);
  const pos = new Float32Array(STARS * 3);
  const size = new Float32Array(STARS);
  const colour = new Float32Array(STARS * 3);
  const c = new THREE.Color();
  for (let i = 0; i < STARS; i++) {
    // Uniform on the sphere.
    const z = range(rng, -1, 1);
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    pos.set([Math.cos(a) * r * SKY_RADIUS * 0.5, z * SKY_RADIUS * 0.5, Math.sin(a) * r * SKY_RADIUS * 0.5], i * 3);
    // Most stars faint, a few bright: brightness falls as a power of a uniform draw.
    const bright = rng() ** STAR_POWER * STAR_BRIGHT + 0.12;
    size[i] = STAR_SIZE[0] + (STAR_SIZE[1] - STAR_SIZE[0]) * Math.min(1, bright / STAR_BRIGHT);
    c.set(STAR_TINTS[Math.floor(rng() * STAR_TINTS.length)]).multiplyScalar(bright);
    colour.set([c.r, c.g, c.b], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(colour, 3));
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    uniforms: { uPlanet: { value: planet.clone() }, uPx: { value: 1 } },
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -999;
  stars.name = 'stars';
  // Point sizes are in drawing-buffer pixels: keep the stars the same size at any pixel ratio.
  stars.onBeforeRender = (renderer) => {
    starMat.uniforms.uPx.value = renderer.getPixelRatio();
  };
  scene.add(sky, stars);

  const sun = new THREE.DirectionalLight(new THREE.Color(palette.sun), KEY);
  sun.position.copy(sunDir).multiplyScalar(1000);
  sun.target.position.set(0, 0, 0);
  const fill = new THREE.HemisphereLight(FILL_SKY, FILL_PLANET, FILL);
  scene.add(sun, sun.target, fill);

  return {
    sun,
    dispose() {
      scene.remove(sky, stars, sun, sun.target, fill);
      sky.geometry.dispose();
      skyMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      sun.dispose();
      fill.dispose();
      scene.background = null;
    },
  };
}
