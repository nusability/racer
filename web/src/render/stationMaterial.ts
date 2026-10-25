import * as THREE from 'three';

// The station's one material (geometry: render/track/biomes/stationMesh.ts). Detail is drawn,
// not modelled: each vertex carries a surface coordinate in metres and a surface kind, and the
// fragment shader paints that kind at three scales, so a structure reads at every distance:
//  - macro (tens of metres): hull sections in different tones, inhabited sections whose lit
//    windows read as glowing patches from kilometres off, livery stripes, dark machinery bays;
//  - plates (metres): bevelled plates whose edges catch the star (a bump normal from the
//    plate profile, analytic, so it never shimmers), dark seams, porthole strips;
//  - micro, fading out first: window frames, solar cells, radiator ribs, foil crumple.
// Each scale fades to its own average once it is under a pixel, so far hull keeps its light
// pattern instead of going grey or flickering. Kinds that emit (glow, sign, hangar) take their
// vertex colour as HDR light.

/** Hull sections (m, along and up): each its own tone and occupancy. */
const SECTION: readonly [number, number] = [48, 24];
/** Share of sections inhabited (their windows lit), and painted dark (machinery bays). */
const INHABITED = 0.55;
const DARK_BAY = 0.1;
const DARK_BAY_TONE = 0.66;
/** Section tones vary between these. */
const SECTION_TONE: readonly [number, number] = [0.92, 1.06];
/** A section row carries a livery stripe one row in this many, this tall (m), in the accent. */
const LIVERY_EVERY = 6;
const LIVERY_HEIGHT = 1.6;
/** Hull plates (m), on a square grid (offset courses read as brickwork at a distance), and how their tone varies. */
const PLATE: readonly [number, number] = [8, 4];
const PLATE_TONE = 0.06;
/** Plate bevel: width as a share of a plate, its height (m) for the bump, and the seam's darkness. */
const BEVEL = 0.07;
const BEVEL_HEIGHT = 0.16;
const SEAM_DARK = 0.5;
/** Window rows: one deck every DECK metres, the window band's share of it, pitch along (m) and fill. */
const DECK = 4;
const WINDOW_BAND: readonly [number, number] = [0.38, 0.66];
const WINDOW_PITCH = 2;
const WINDOW_FILL = 0.55;
/** Of a section row's decks (SECTION[1] / DECK of them) these two carry windows; the rest are floors, tanks and plant. */
const WINDOW_DECKS: readonly [number, number] = [1, 4];
/** Window light: warm interiors mostly, some cool; their HDR gain; lit share in an inhabited section. */
const WARM = new THREE.Color(1.0, 0.62, 0.3);
const COOL = new THREE.Color(0.55, 0.78, 1.0);
const COOL_SHARE = 0.25;
const WINDOW_GAIN = 2.6;
const WINDOW_LIT: readonly [number, number] = [0.45, 0.9];
/** Window glass darkens the hull this much where it is (lit or not): dark strips by day, glowing by night. */
const GLASS_DARK = 0.8;
/** Structural steel's plates are smaller, and its bump finer. */
const STEEL_PLATE: readonly [number, number] = [3, 1.5];
/** Radiator ribs (m apart), and their share of light. */
const RIB = 1.6;
/** Solar cells (m) and the panel frame grid (m); the cell colour and a glint off the glass. */
const CELL = 1.1;
const SOLAR_FRAME = 9;
const GLINT_POWER = 28;
const SOLAR_GLINT = 0.9;
const HULL_GLINT = 0.12;
/** Glass panes (m): mullion width share, lit share, interior gain. */
const PANE: readonly [number, number] = [3.2, 2.4];
const MULLION = 0.12;
const PANE_LIT = 0.65;
const PANE_GAIN = 1.7;
/** Hazard stripes: their period (m) and yellow. */
const STRIPE = 2.4;
const HAZARD = new THREE.Color(1, 0.72, 0.08);
/** Foil quilting (m) and how hard its crumple bends the light. */
const QUILT = 1.6;
const CRUMPLE = 0.55;
/** Signs: chevron period (m), scroll speed (m/s), segment-bar cells (m). */
const CHEVRON = 3;
const CHEVRON_SPEED = 9;
const BAR_CELL = 1.2;
/** Hangar interiors: the floor's glow over the back wall's, and the rack stripes (m). */
const HANGAR_RACK = 5;

const f = (n: number) => n.toFixed(4);

const VERTEX_PARS = /* glsl */ `
attribute vec4 aSurf;
varying vec4 vSurf;`;

const VERTEX = /* glsl */ `
vSurf = aSurf;`;

const FRAGMENT_PARS = /* glsl */ `
varying vec4 vSurf;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSun;
uniform vec3 uAccent;
// A hash without sine: sin of large arguments loses precision on mobile GPUs and turns a
// constant per plate into per-pixel noise.
float slHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// A plate's profile across one axis (x in 0..1): flat top, bevelled to the seam. Returns the
// height and its slope (per unit of x), so the bump normal is exact rather than a screen-space guess.
vec2 slBevel(float x, float b) {
  float a = clamp(x / b, 0.0, 1.0);
  float c = clamp((1.0 - x) / b, 0.0, 1.0);
  float sa = a * a * (3.0 - 2.0 * a);
  float sc = c * c * (3.0 - 2.0 * c);
  float da = x < b ? 6.0 * a * (1.0 - a) / b : 0.0;
  float dc = x > 1.0 - b ? -6.0 * c * (1.0 - c) / b : 0.0;
  return vec2(sa * sc, da * sc + sa * dc);
}
// Bends the view-space normal by a height gradient over the surface coordinate (metres): the
// surface's own tangents come from screen derivatives of position and coordinate.
vec3 slBump(vec3 N, vec2 uv, vec2 grad) {
  vec3 q0 = dFdx(-vViewPosition);
  vec3 q1 = dFdy(-vViewPosition);
  vec2 st0 = dFdx(uv);
  vec2 st1 = dFdy(uv);
  vec3 q1perp = cross(q1, N);
  vec3 q0perp = cross(N, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x;
  vec3 B = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float s = det == 0.0 ? 0.0 : inversesqrt(det);
  return normalize(N - (T * grad.x + B * grad.y) * s);
}
// 1 while a feature of this size (m) spans a few pixels, 0 once it is under about one.
float slKeep(float size, float px) {
  return 1.0 - smoothstep(size * 0.1, size * 0.3, px);
}
float slGlint(vec3 N, float power) {
  vec3 L = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  vec3 V = normalize(vViewPosition);
  return pow(max(dot(reflect(-V, N), L), 0.0), power);
}
float slNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 q = fract(p);
  q = q * q * (3.0 - 2.0 * q);
  return mix(mix(slHash(i), slHash(i + vec2(1.0, 0.0)), q.x), mix(slHash(i + vec2(0.0, 1.0)), slHash(i + vec2(1.0, 1.0)), q.x), q.y);
}`;

const FRAGMENT = /* glsl */ `
{
  float kind = floor(vSurf.z + 0.5);
  // The seed is constant per part; rounded, so interpolation never lets it drift between pixels.
  float seed = floor(vSurf.w + 0.5) * 1.37;
  vec2 uv = vSurf.xy;
  vec2 fw = fwidth(uv);
  float px = max(max(fw.x, fw.y), 1e-4);
  vec2 grad = vec2(0.0);
  float glint = 0.0;
  if (kind < 1.5) {
    // Hull (0) and structural steel (1): sections, plates, seams; hull also windows and livery.
    bool hull = kind < 0.5;
    vec2 sc = uv / vec2(${f(SECTION[0])}, ${f(SECTION[1])});
    vec2 sid = floor(sc);
    float sh = slHash(sid + seed);
    float dark = hull ? step(1.0 - ${f(DARK_BAY)}, slHash(sid * 1.31 + seed + 4.0)) : 0.0;
    float tone = mix(${f(SECTION_TONE[0])}, ${f(SECTION_TONE[1])}, sh) * mix(1.0, ${f(DARK_BAY_TONE)}, dark);
    vec2 plate = hull ? vec2(${f(PLATE[0])}, ${f(PLATE[1])}) : vec2(${f(STEEL_PLATE[0])}, ${f(STEEL_PLATE[1])});
    vec2 pc = uv / plate;
    vec2 pid = floor(pc);
    vec2 pf = fract(pc);
    float keepPlate = slKeep(plate.y, px);
    vec2 bx = slBevel(pf.x, ${f(BEVEL)});
    vec2 by = slBevel(pf.y, ${f(BEVEL * 2)});
    float h = bx.x * by.x;
    grad = vec2(bx.y * by.x / plate.x, bx.x * by.y / plate.y) * ${f(BEVEL_HEIGHT)} * keepPlate;
    float seam = mix(1.0 - ${f((1 - SEAM_DARK) * BEVEL * 2.5)}, mix(${f(SEAM_DARK)}, 1.0, smoothstep(0.0, 0.6, h)), keepPlate);
    float ptone = 1.0 + (slHash(pid + seed * 1.7) - 0.5) * 2.0 * ${f(PLATE_TONE)} * keepPlate;
    diffuseColor.rgb *= tone * seam * ptone;
    if (hull) {
      // Livery: a stripe of the accent along some section rows, wide enough to read far off.
      float lrow = step(slHash(vec2(sid.y, seed + 2.0)), ${f(1 / LIVERY_EVERY)});
      float lv = fract(sc.y) * ${f(SECTION[1])};
      float stripe = lrow * smoothstep(-px, px, lv - ${f(SECTION[1] / 2 - LIVERY_HEIGHT / 2)}) * smoothstep(-px, px, ${f(SECTION[1] / 2 + LIVERY_HEIGHT / 2)} - lv);
      diffuseColor.rgb = mix(diffuseColor.rgb, uAccent * 0.55, stripe * (1.0 - dark));
      // Windows: decks of porthole strips in inhabited sections, each window its own light.
      float inhabited = step(slHash(sid * 1.73 + seed + 9.0), ${f(INHABITED)}) * (1.0 - dark) * (1.0 - stripe);
      float deck = floor(uv.y / ${f(DECK)});
      float dv = fract(uv.y / ${f(DECK)});
      // Window decks: two per section row, a third of the way up and down it.
      float dl = floor(fract(sc.y) * ${f(SECTION[1] / DECK)});
      float rowOk = 1.0 - min(1.0, abs(dl - ${f(WINDOW_DECKS[0])}) * abs(dl - ${f(WINDOW_DECKS[1])}));
      float band = smoothstep(${f(WINDOW_BAND[0])} - 0.02, ${f(WINDOW_BAND[0])}, dv) * smoothstep(${f(WINDOW_BAND[1])} + 0.02, ${f(WINDOW_BAND[1])}, dv);
      float wu = uv.x / ${f(WINDOW_PITCH)};
      float hole = step(fract(wu), ${f(WINDOW_FILL)});
      float occupancy = mix(${f(WINDOW_LIT[0])}, ${f(WINDOW_LIT[1])}, slHash(sid + seed * 3.3));
      float lit = step(slHash(vec2(floor(wu / 3.0), deck) + seed), occupancy);
      // Every window is dark glass by day; the lit ones glow. Far off, both fade to their share of the band.
      float keepWin = slKeep(${f((WINDOW_BAND[1] - WINDOW_BAND[0]) * DECK)}, px);
      float share = rowOk * ${f((WINDOW_BAND[1] - WINDOW_BAND[0]) * WINDOW_FILL)};
      float glass = (1.0 - dark) * (1.0 - stripe) * mix(share, rowOk * band * hole, keepWin);
      float win = inhabited * mix(share * occupancy, rowOk * band * hole * lit, keepWin);
      vec3 light = mix(vec3(${f(WARM.r)}, ${f(WARM.g)}, ${f(WARM.b)}), vec3(${f(COOL.r)}, ${f(COOL.g)}, ${f(COOL.b)}), step(1.0 - ${f(COOL_SHARE)}, slHash(sid * 2.1 + seed)));
      totalEmissiveRadiance += light * win * ${f(WINDOW_GAIN)};
      diffuseColor.rgb *= 1.0 - glass * ${f(GLASS_DARK)};
      glint = ${f(HULL_GLINT)};
    }
  } else if (kind < 2.5) {
    // Radiator: pale ribbed panels; the ribs catch the light across the panel.
    float r = fract(uv.x / ${f(RIB)});
    float keep = slKeep(${f(RIB)}, px);
    vec2 bv = slBevel(r, 0.3);
    grad = vec2(bv.y / ${f(RIB)} * 0.25 * keep, 0.0);
    diffuseColor.rgb *= mix(0.75, mix(0.45, 1.0, bv.x), keep);
  } else if (kind < 3.5) {
    // Solar array: deep blue cells in a silver grid, a frame every few metres, a glint off the glass.
    vec2 c = fract(uv / ${f(CELL)});
    float keep = slKeep(${f(CELL)}, px);
    float grid = max(step(c.x, 0.06), step(c.y, 0.06));
    vec2 fr = fract(uv / ${f(SOLAR_FRAME)});
    float frame = max(smoothstep(px / ${f(SOLAR_FRAME)}, 0.0, fr.x - 0.01), smoothstep(px / ${f(SOLAR_FRAME)}, 0.0, fr.y - 0.01));
    diffuseColor.rgb *= mix(1.0, mix(1.0, 2.6, grid), keep * 0.8);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5), frame * 0.7);
    glint = ${f(SOLAR_GLINT)};
  } else if (kind < 4.5) {
    // Light strip: its vertex colour is its HDR emission.
    totalEmissiveRadiance += diffuseColor.rgb;
    diffuseColor.rgb = vec3(0.0);
  } else if (kind < 5.5) {
    // Glass: dark panes in a mullion grid, most lit warm from within; the star glints off it.
    vec2 pc = uv / vec2(${f(PANE[0])}, ${f(PANE[1])});
    vec2 pid = floor(pc);
    vec2 pf = fract(pc);
    float keep = slKeep(${f(PANE[1])}, px);
    float mull = max(step(pf.x, ${f(MULLION)}), step(pf.y, ${f(MULLION * 1.3)}));
    float lit = step(slHash(pid + seed), ${f(PANE_LIT)}) * (0.55 + 0.45 * slHash(pid * 1.9 + seed));
    float pane = mix(${f(PANE_LIT * 0.75)}, lit * (1.0 - mull), keep);
    totalEmissiveRadiance += vec3(${f(WARM.r)}, ${f(WARM.g * 1.1)}, ${f(WARM.b * 1.2)}) * pane * ${f(PANE_GAIN)};
    diffuseColor.rgb *= mix(0.25, mix(0.25, 1.0, mull), keep);
    glint = 0.6;
  } else if (kind < 6.5) {
    // Hangar mouth: the bay's warm light, brightest along its floor, racks dark against it.
    float rack = step(0.82, fract(uv.x / ${f(HANGAR_RACK)}));
    float floorGlow = 0.6 + 0.4 * smoothstep(0.0, 1.0, 1.0 - fract(uv.y * 0.05 + 0.5));
    totalEmissiveRadiance += diffuseColor.rgb * floorGlow * (1.0 - rack * 0.75 * slKeep(${f(HANGAR_RACK)}, px));
    diffuseColor.rgb = vec3(0.0);
  } else if (kind < 7.5) {
    // Light panel: chevrons scrolling with the race, or a segment bar filling, by seed.
    float style = mod(floor(vSurf.w + 0.5), 2.0);
    float on;
    if (style < 0.5) {
      on = step(0.5, fract((uv.x + abs(uv.y) * 1.2) / ${f(CHEVRON)} + uTime * ${f(CHEVRON_SPEED / CHEVRON)}));
    } else {
      float cell = floor(uv.x / ${f(BAR_CELL)});
      float gap = step(0.18, fract(uv.x / ${f(BAR_CELL)}));
      on = gap * step(fract(cell * 0.07 - uTime * 0.6), 0.55);
    }
    float keep = slKeep(${f(CHEVRON)}, px);
    totalEmissiveRadiance += diffuseColor.rgb * mix(0.5, 0.15 + 0.85 * on, keep);
    diffuseColor.rgb = vec3(0.02);
  } else if (kind < 8.5) {
    // Hazard stripes: yellow and black diagonals, lit by the star like paint.
    float s = step(0.5, fract((uv.x + uv.y) / ${f(STRIPE)}));
    float keep = slKeep(${f(STRIPE)}, px);
    diffuseColor.rgb *= mix(vec3(${f(HAZARD.r * 0.5)}, ${f(HAZARD.g * 0.5)}, ${f(HAZARD.b * 0.5)}), mix(vec3(0.06), vec3(${f(HAZARD.r)}, ${f(HAZARD.g)}, ${f(HAZARD.b)}), s), keep);
  } else {
    // Foil: quilted gold insulation, crumpled, so the hard light breaks into glints over it.
    vec2 q = fract(uv / ${f(QUILT)});
    float keep = slKeep(${f(QUILT)}, px);
    float n1 = slNoise(uv * 1.7 + seed);
    float n2 = slNoise(uv * 4.3 - seed);
    vec2 bq = vec2(slBevel(q.x, 0.25).y, slBevel(q.y, 0.25).y);
    grad = (vec2(n1 - 0.5, n2 - 0.5) * ${f(CRUMPLE)} + bq * 0.05) * keep;
    diffuseColor.rgb *= mix(0.85, 0.7 + 0.5 * n1, keep);
    glint = 0.7;
  }
#ifndef STATION_LOW
  normal = slBump(normal, uv, grad);
  totalEmissiveRadiance += uSun * glint * slGlint(normal, ${f(GLINT_POWER)}) * diffuseColor.rgb;
#endif
}`;

/** Station structure's material (see the header); `low` drops the bump and glints. */
export function stationMaterial(accent: number, sunDir: THREE.Vector3, sun: THREE.Color, low: boolean): { material: THREE.MeshLambertMaterial; setTime(t: number): void } {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: sunDir.clone() },
    uSun: { value: sun.clone() },
    uAccent: { value: new THREE.Color(accent) },
  };
  if (low) material.defines = { STATION_LOW: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERTEX_PARS}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX}`);
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', `${FRAGMENT_PARS}\nvoid main() {`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAGMENT}`);
  };
  material.customProgramCacheKey = () => `station-${low ? 'low' : 'high'}`;
  return {
    material,
    setTime(t) {
      uniforms.uTime.value = t;
    },
  };
}
