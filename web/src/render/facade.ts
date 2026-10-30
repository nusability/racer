import * as THREE from 'three';
import type { TrackPalette } from '../core/types.ts';
import { SURFACE } from './facadeStyle.ts';

// Lit city facades drawn by the shader, not by geometry: a building is a few instanced kit
// shapes (render/facadeGeometry.ts), and its windows, lit offices, shopfronts, grime, neon,
// signs and holo-ads are worked out per pixel from where the pixel sits on its face. So a whole
// district is one instanced draw per kit shape, whatever the quality. Each instance's index
// seeds its own pattern; its instance colour tints the wall (concrete, glass, brick, steel).
//
// Unstyled (the landmarks' blocks), every instance is an office grid with a neon crown on some.
// Styled, each instance also carries a FacadeStyle (render/facadeStyle.ts): its surface, grime,
// light and neon.
//
// Geometry contract: a kit shape with the `facade` attribute, scaled per instance (the scale is
// read back from the instance matrix, so windows keep their size on any tower).

/** One window bay and one storey of the office grid, metres. */
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
/** Unstyled: share of buildings wearing a neon crown. */
const CROWN_SHARE = 0.45;
const CROWN_GLOW = 1.1;
/** Neon up a corner: its width either side of the corner, metres. */
const EDGE_WIDTH = 0.45;
/** Shopfronts: lit glass along the ground storey, this tall, on this share of bays. */
const SHOP_HEIGHT = 4.2;
const SHOP_SHARE = 0.55;
const SHOP_GLOW = 0.55;
/** A failing tube: how often it may cut out (per second) and the share of those moments it is out. */
const FLICKER_RATE = 7;
const FLICKER_OUT = 0.3;
/** An aviation beacon's blinks per second. */
const BEACON_RATE = 0.7;
/** A dead tube still catches a little of the street's light. */
const DEAD_GLOW = 0.06;
/** Aviation red. */
const BEACON = 0xff2a1a;

// --- Styled surfaces ---
/** Curtain glass: pane width and storey (m), its darkness, its share of lit floors, and the sky's glow in it. */
const CURTAIN_CELL: readonly [number, number] = [1.6, 3.9];
const CURTAIN_DARK = 0.8;
const CURTAIN_LIT = 0.55;
const CURTAIN_SKY = 0.28;
/** Ribbon windows: a long bay, and the glass band's sill and head within the storey. */
const RIBBON_CELL: readonly [number, number] = [5.2, 3.6];
/** Panel flats: small windows, and the share of them boarded or broken at full grime. */
const SLAB_CELL: readonly [number, number] = [2.8, 2.9];
const SLAB_BOARDED = 0.38;
/** Balcony flats: bay and storey, and the lip's share of the storey. */
const BALCONY_CELL: readonly [number, number] = [3.2, 3.1];
const BALCONY_LIP = 0.14;
/** Capsule pods: pod width and height (m), and the share lit (it is a hotel: most are taken). */
const CAPSULE_CELL: readonly [number, number] = [2, 1.6];
const CAPSULE_LIT = 0.75;
/** Industrial cladding: rib pitch (m), panel size (m), and the height of the hazard stripes. */
const RIB_PITCH = 0.6;
const PANEL: readonly [number, number] = [6, 4];
const HAZARD_HEIGHT = 2.2;
const HAZARD_AMBER = 0xc8901a;
/** The shell: column pitch (m), and the share of floors with a work light. */
const SHELL_COLUMN = 6;
const SHELL_LIGHTS = 0.08;
/** Above this share of its height a shell is bare frame in scaffold mesh. */
const SHELL_FRAME = 0.55;
/** Signs: glyph cell (m) and the glow of a lit glyph. */
const GLYPH = 1.1;
const SIGN_GLOW = 1.5;
/** Holo-ads: their glow and how fast the picture moves (cycles per second). */
const HOLO_GLOW = 1.25;
const HOLO_SPEED = 0.25;
/** Grime: how much a streak darkens a wall at full grime, and how high the street's stain climbs (m). */
const GRIME_DARK = 0.55;
const STAIN_HEIGHT = 14;
/** Rust's tint on grimy industrial cladding. */
const RUST: readonly [number, number, number] = [1.15, 0.72, 0.48];
/** Planting: dark and lit leaf, and the share of garden cells with a lamp. */
const LEAF_DARK = 0x10261a;
const LEAF_LIT = 0x2e5a2a;
const GARDEN_LAMPS = 0.12;
/** A landing pad's ring (share of its half width) and its edge light's dash pitch (m). */
const PAD_RING = 0.62;
const PAD_DASH = 4;
/** Shopfronts: bay width (m), the glazing's sill and head over the pavement, the fascia's top (m). */
const SHOP_BAY = 4.6;
const SHOP_GLASS: readonly [number, number] = [0.45, 3.5];
const SHOP_FASCIA = 4.5;
/** Shop light: lit interiors' glow, the share of bays with a neon display, and their glow. */
const SHOP_INTERIOR = 0.9;
const SHOP_DISPLAY = 0.3;
const SHOP_DISPLAY_GLOW = 1.3;
/** At full grime this share of shopfronts is shuttered. */
const SHOP_SHUTTERED = 0.6;
/** Lamps and coloured lights: their glow. */
const LAMP_GLOW = 1.6;
const LIGHT_GLOW = 1.4;
/** Roofs are darker than walls (they face the dark sky). */
const ROOF_SHADE = 0.72;

/** The city's neon accents: magenta, cyan, amber. */
export const CITY_NEON: readonly [number, number, number] = [0xff3fb4, 0x3ff0ff, 0xffb02e];

export interface FacadeOptions {
  palette: TrackPalette;
  /** The three neon colours a crown may take (sRGB hex). */
  neon: readonly [number, number, number];
  /** Baked occlusion at the street: walls darken by `amount` toward their base over `height` metres; null for none. */
  baseShade: { amount: number; height: number } | null;
  /** Read each instance's FacadeStyle from the geometry's `facadeStyle` instanced attribute. */
  styled?: boolean;
}

/** A facade material, and the clock its flickering neon and holo-ads run on. */
export type FacadeMaterial = THREE.MeshLambertMaterial & { readonly time: { value: number } };

const f = (v: number) => v.toFixed(3);
const vec2 = (v: readonly [number, number]) => `vec2(${f(v[0])}, ${f(v[1])})`;
/** A colour constant in the shader's working (linear) space. */
const rgb = (hex: number) => {
  const c = new THREE.Color(hex);
  return `${f(c.r)}, ${f(c.g)}, ${f(c.b)}`;
};

const VERTEX_PARS = /* glsl */ `
attribute vec4 facade;
#ifdef FACADE_STYLED
attribute vec4 facadeStyle;
#endif
varying vec4 vFacade;
varying vec4 vFacadeB;
varying vec4 vFacadeRoof;
varying vec4 vStyle;`;

const VERTEX = /* glsl */ `
#ifdef USE_INSTANCING
vec3 fcScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
float fcSeed = float(gl_InstanceID);
#else
vec3 fcScale = vec3(1.0);
float fcSeed = 0.0;
#endif
float fcAxis = facade.y > 0.5 ? fcScale.z : fcScale.x;
// Along the face, up it, the seed, the full height; wall or roof, half the face's width, cornered.
vFacade = vec4(facade.x * fcAxis, position.y * fcScale.y, fcSeed, fcScale.y);
vFacadeB = vec4(facade.z, 0.5 * fcAxis, facade.w, 0.0);
vFacadeRoof = vec4(position.xz * fcScale.xz, 0.5 * fcScale.xz);
#ifdef FACADE_STYLED
vStyle = facadeStyle;
#else
vStyle = vec4(${SURFACE.office}.0, 0.0, 1.0, -1.0);
#endif`;

const FRAGMENT_PARS = /* glsl */ `
varying vec4 vFacade;
varying vec4 vFacadeB;
varying vec4 vFacadeRoof;
varying vec4 vStyle;
uniform float uLit;
uniform float uGlow;
uniform float uTime;
uniform vec3 uWarm;
uniform vec3 uCool;
uniform vec3 uNeon[3];
uniform vec3 uBeacon;
uniform vec3 uSky;
uniform vec2 uBaseShade;
float fcHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float fcNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  return mix(mix(fcHash(i), fcHash(i + vec2(1.0, 0.0)), u.x), mix(fcHash(i + vec2(0.0, 1.0)), fcHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec3 fcNeonOf(float h) {
  return h < 0.5 ? uNeon[0] : h < 1.5 ? uNeon[1] : h < 2.5 ? uNeon[2] : uBeacon;
}
float fcRect(vec2 q, vec4 r) {
  return step(r.x, q.x) * step(q.x, r.z) * step(r.y, q.y) * step(q.y, r.w);
}
// Streaks running down from sills and blotches of damp: 0 clean … 1 filthy.
float fcDirt(vec2 p, float seed) {
  float drip = smoothstep(0.55, 0.85, fcNoise(vec2(p.x * 0.45 + seed, p.y * 0.035)));
  float blot = smoothstep(0.45, 0.8, fcNoise(p * 0.08 + seed * 1.7));
  return clamp(drip * 0.8 + blot * 0.6, 0.0, 1.0);
}`;

const S = SURFACE;

const FRAGMENT = /* glsl */ `
{
  float surf = vStyle.x;
  float grime = vStyle.y;
  float seed = vFacade.z;
  float along = vFacade.x;
  float up = vFacade.y;
  float tall = vFacade.w;
  float hue;
  float mode;
  float trim;
  float high;
  if (vStyle.w < 0.0) {
    hue = floor(fcHash(vec2(seed, 7.7)) * 2.999);
    mode = 0.0;
    trim = step(fcHash(vec2(seed, 4.1)), ${f(CROWN_SHARE)});
    high = 0.0;
  } else {
    hue = mod(vStyle.w, 4.0);
    mode = mod(floor(vStyle.w / 4.0), 4.0);
    trim = mod(floor(vStyle.w / 16.0), 4.0);
    high = floor(vStyle.w / 64.0);
  }
  vec3 neon = fcNeonOf(hue);
  // A failing tube cuts out now and then; a failing beacon is simply a blinking one.
  float on = 1.0;
  if (mode > 0.5 && mode < 1.5) {
    on = hue > 2.5 ? step(0.5, fract(uTime * ${f(BEACON_RATE)} + seed * 0.37))
                   : step(${f(FLICKER_OUT)}, fcHash(vec2(floor(uTime * ${f(FLICKER_RATE)} + seed * 0.61), seed)));
  } else if (mode > 1.5) {
    on = ${f(DEAD_GLOW)};
  }
  vec2 pw = fwidth(vec2(along, up));
  vec3 emit = vec3(0.0);
  if (vFacadeB.x > 0.5) {
    // Window grid parameters, the office's unless the surface has its own.
    vec2 cs = vec2(${f(BAY)}, ${f(STOREY)});
    vec4 rect = vec4(${f(GLASS_X[0])}, ${f(GLASS_Y[0])}, ${f(GLASS_X[1])}, ${f(GLASS_Y[1])});
    float share = uLit * vStyle.z;
    float run = 3.0;
    float dark = ${f(GLASS_DARK)};
    float cool = ${f(COOL_SHARE)};
    float windows = 1.0;
    float shops = 1.0;
    if (surf > ${S.office}.5 && surf < ${S.curtain}.5) {
      cs = ${vec2(CURTAIN_CELL)}; rect = vec4(0.05, 0.1, 0.95, 0.97); share *= ${f(CURTAIN_LIT)}; run = 8.0; dark = ${f(CURTAIN_DARK)}; cool = 0.75;
    } else if (surf < ${S.ribbon}.5 && surf > ${S.curtain}.5) {
      cs = ${vec2(RIBBON_CELL)}; rect = vec4(0.02, 0.32, 0.98, 0.78); run = 2.0; dark = 0.6;
    } else if (surf < ${S.slab}.5 && surf > ${S.ribbon}.5) {
      cs = ${vec2(SLAB_CELL)}; rect = vec4(0.28, 0.3, 0.72, 0.76); share *= 1.45 - 0.3 * grime; run = 1.0; dark = 0.55; cool = 0.25;
    } else if (surf < ${S.balcony}.5 && surf > ${S.slab}.5) {
      cs = ${vec2(BALCONY_CELL)}; rect = vec4(0.06, 0.26, 0.94, 0.86); share *= 1.25; run = 1.0; cool = 0.2;
    } else if (surf < ${S.capsule}.5 && surf > ${S.balcony}.5) {
      cs = ${vec2(CAPSULE_CELL)}; rect = vec4(0.1, 0.12, 0.9, 0.88); share = ${f(CAPSULE_LIT)} * vStyle.z; run = 1.0; dark = 0.55;
    } else if (surf < ${S.industrial}.5 && surf > ${S.capsule}.5) {
      cs = vec2(${f(PANEL[0])}, ${f(PANEL[0])}); rect = vec4(0.12, 0.7, 0.88, 0.86); share *= 1.1; run = 1.0; cool = 0.7; shops = 0.0;
    } else if (surf > ${S.industrial}.5) {
      windows = 0.0;
      shops = 0.0;
    }
    vec2 cell = vec2(along, up) / cs;
    vec2 id = floor(cell);
    vec2 q = fract(cell);
    vec2 fw = pw / cs;
    float detail = 1.0 - smoothstep(${f(FILTER[0])}, ${f(FILTER[1])}, max(fw.x, fw.y));
    if (windows > 0.5) {
      float glass = fcRect(q, rect);
      float glassAvg = (rect.z - rect.x) * (rect.w - rect.y);
      // Offices are lit in runs along a floor (one tenant), so hash the floor and a coarse bay.
      float lit = step(fcHash(vec2(floor(id.x / run), id.y) + seed * 17.13), share);
      vec3 tone = mix(uWarm, uCool, step(1.0 - cool, fcHash(vec2(id.y, seed) + 9.2)));
      if (surf > ${S.balcony}.5 && surf < ${S.capsule}.5) {
        // Every pod its own colour.
        tone = mix(uWarm, fcNeonOf(floor(fcHash(id + seed * 3.7) * 2.999)), 0.45);
      }
      if (surf > ${S.ribbon}.5 && surf < ${S.slab}.5) {
        // Boarded or broken: no glass, no light, a darker patch.
        float boarded = step(fcHash(id + seed * 5.1), grime * ${f(SLAB_BOARDED)});
        lit *= 1.0 - boarded;
        glass *= 1.0 - boarded * 0.7;
        diffuseColor.rgb *= 1.0 - boarded * glass * 0.4 * detail;
        // Some windows behind coloured curtains.
        tone = mix(tone, fcNeonOf(floor(fcHash(id + seed) * 2.999)), step(0.8, fcHash(id + 4.4)) * 0.5);
      }
      float g = mix(glassAvg, glass, detail);
      float l = mix(share, lit, detail);
      diffuseColor.rgb *= 1.0 - g * dark;
      emit += tone * g * l * uGlow;
      if (surf > ${S.office}.5 && surf < ${S.curtain}.5) {
        // The sky's glow in mirrored glass, brighter up the tower, broken by neighbours' reflections.
        float sheen = (0.35 + 0.65 * smoothstep(0.0, tall, up)) * (0.55 + 0.45 * fcNoise(vec2(along * 0.03 + seed, up * 0.004)));
        emit += uSky * g * sheen * ${f(CURTAIN_SKY)};
      }
    }
    if (surf > ${S.slab}.5 && surf < ${S.balcony}.5) {
      // A pale balcony lip at each floor and a railing over it.
      float lip = step(q.y, ${f(BALCONY_LIP)});
      float rail = step(${f(BALCONY_LIP)}, q.y) * step(q.y, 0.42) * step(fract(along * 2.5), 0.18);
      diffuseColor.rgb *= 1.0 + detail * (lip * 0.45 - rail * 0.5);
    }
    if (surf > ${S.capsule}.5 && surf < ${S.industrial}.5) {
      // Ribbed cladding in panels, rust in the streaks, hazard stripes along the base.
      float rib = 0.85 + 0.15 * sin(along * ${f((2 * Math.PI) / RIB_PITCH)});
      vec2 pq = fract(vec2(along, up) / vec2(${f(PANEL[0])}, ${f(PANEL[1])}));
      float seam = step(pq.x, 0.02) + step(pq.y, 0.03);
      float ribFw = pw.x / ${f(RIB_PITCH)};
      diffuseColor.rgb *= mix(1.0, rib, 1.0 - smoothstep(0.3, 0.8, ribFw)) * (1.0 - 0.35 * min(seam, 1.0) * detail);
      float stripe = step(up, ${f(HAZARD_HEIGHT)}) * (1.0 - high) * step(0.5, fract((along + up) * 0.6));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${rgb(HAZARD_AMBER)}), stripe * detail);
      diffuseColor.rgb *= mix(vec3(1.0), vec3(${RUST.map(f).join(', ')}), grime * fcDirt(vec2(along, up), seed));
    }
    if (surf > ${S.industrial}.5 && surf < ${S.shell}.5) {
      // Floor slabs and columns round a dark interior; bare frame in scaffold mesh up top.
      float slab = step(q.y, 0.2);
      float column = step(fract(along / ${f(SHELL_COLUMN)}), 0.08);
      float solid = max(slab, column);
      float frame = step(${f(SHELL_FRAME)} * tall, up);
      float mesh = frame * (step(abs(fract((along + up) * 0.5) - 0.5), 0.05) + step(abs(fract((along - up) * 0.5) - 0.5), 0.05));
      diffuseColor.rgb *= mix(1.0, mix(0.22, 1.3, solid), detail);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.5, 0.52), min(mesh, 1.0) * detail * 0.7);
      float lamp = step(fcHash(vec2(floor(along / ${f(SHELL_COLUMN)}), id.y) + seed), ${f(SHELL_LIGHTS)} * vStyle.z) * (1.0 - frame);
      emit += uCool * lamp * (1.0 - solid) * fcRect(fract(vec2(along / ${f(SHELL_COLUMN)}, q.y)), vec4(0.4, 0.55, 0.6, 0.8)) * 2.0 * detail;
    }
    if (surf > ${S.shell}.5 && surf < ${S.sign}.5) {
      // Abstract glyphs in columns inside a lit frame: a sign in no language anyone reads.
      vec2 gc = vec2(along, up) / ${f(GLYPH)};
      vec2 gid = floor(gc);
      vec2 gq = fract(gc);
      vec2 sub = floor(gq * 3.0);
      vec2 sq = fract(gq * 3.0);
      float stroke = step(0.45, fcHash(gid * 3.0 + sub + seed)) * fcRect(sq, vec4(0.12, 0.12, 0.88, 0.88));
      float glyph = step(0.3, fcHash(gid + seed * 2.3)) * stroke * fcRect(gq, vec4(0.08, 0.08, 0.92, 0.92));
      float frameLine = step(vFacadeB.y - abs(along), 0.25) + step(up, 0.25) + step(tall - up, 0.25);
      float gAvg = 0.25;
      float gfw = max(pw.x, pw.y) / ${f(GLYPH)};
      float lit = mix(gAvg, glyph, 1.0 - smoothstep(0.15, 0.4, gfw)) + min(frameLine, 1.0);
      diffuseColor.rgb *= 0.25;
      emit += neon * lit * ${f(SIGN_GLOW)} * on;
    }
    if (surf > ${S.sign}.5 && surf < ${S.holo}.5) {
      // Rings swelling out of the middle over slow colour bands, rows of glyphs scrolling under them.
      vec2 p = vec2(along / max(vFacadeB.y, 0.1), up / tall * 2.0 - 1.0);
      float t = uTime * ${f(HOLO_SPEED)} + fcHash(vec2(seed, 1.3));
      float bands = 0.5 + 0.5 * sin(p.y * 5.0 - t * 6.2832 + seed);
      float ring = 1.0 - smoothstep(0.0, 0.08, abs(length(p * vec2(1.0, 0.7)) - fract(t) * 1.4));
      vec2 rq = vec2(along * 0.8 + uTime * 5.0, up * 0.8);
      float rows = step(0.55, fcHash(floor(rq) + seed)) * step(p.y, -0.35) * step(0.3, fract(rq.y));
      float scan = 0.78 + 0.22 * sin(up * 9.0 + uTime * 14.0);
      vec3 col = mix(neon, fcNeonOf(mod(hue + 1.0, 3.0)), bands);
      diffuseColor.rgb *= 0.2;
      emit += col * (0.35 + 0.65 * ring + rows) * scan * ${f(HOLO_GLOW)} * on;
    }
    if (surf > ${S.holo}.5 && surf < ${S.plain}.5) {
      vec2 pq = fract(vec2(along, up) / 2.5);
      diffuseColor.rgb *= 1.0 - 0.3 * min(step(pq.x, 0.03) + step(pq.y, 0.03), 1.0) * detail;
    }
    if (surf > ${S.plain}.5 && surf < ${S.garden}.5) {
      float leaf = fcNoise(vec2(along, up) * 0.7 + seed) * 0.7 + fcNoise(vec2(along, up) * 2.3) * 0.3;
      diffuseColor.rgb = mix(vec3(${rgb(LEAF_DARK)}), vec3(${rgb(LEAF_LIT)}), leaf);
      vec2 lq = vec2(along, up) / 3.0;
      emit += uWarm * step(fcHash(floor(lq) + seed), ${f(GARDEN_LAMPS)}) * fcRect(fract(lq), vec4(0.4, 0.4, 0.6, 0.6)) * 1.5;
    }
    if (surf > ${S.garden}.5 && surf < ${S.pad}.5) {
      // A pad's rim: a lit strip along the top of its edge.
      emit += neon * step(tall - up, 0.5) * on;
    }
    if (surf > ${S.pad}.5 && surf < ${S.shop}.5) {
      // Shop windows between mullions over a dark plinth, a fascia of glyph signs over them.
      vec2 sc = vec2(along / ${f(SHOP_BAY)}, up);
      float bay = floor(sc.x);
      float bq = fract(sc.x);
      float glass = step(0.04, bq) * step(bq, 0.96) * step(${f(SHOP_GLASS[0])}, up) * step(up, ${f(SHOP_GLASS[1])});
      float shut = step(fcHash(vec2(bay, seed + 1.9)), grime * ${f(SHOP_SHUTTERED)});
      float display = step(fcHash(vec2(bay, seed + 6.1)), ${f(SHOP_DISPLAY)}) * step(0.25, bq) * step(bq, 0.75) * step(1.2, up) * step(up, 2.9);
      vec3 interior = mix(uWarm, uCool, step(0.7, fcHash(vec2(bay, seed + 2.6))));
      float sfw = pw.x / ${f(SHOP_BAY)};
      float sd = 1.0 - smoothstep(0.3, 0.8, sfw);
      // Shutters: ribbed steel, unlit.
      diffuseColor.rgb *= mix(1.0, mix(0.35, 0.8 + 0.2 * step(0.5, fract(up * 4.0)), shut), glass);
      emit += interior * glass * (1.0 - shut) * mix(0.6, 1.0, sd) * ${f(SHOP_INTERIOR)} * uGlow;
      emit += fcNeonOf(floor(fcHash(vec2(bay, seed + 8.3)) * 2.999)) * display * (1.0 - shut) * ${f(SHOP_DISPLAY_GLOW)} * on;
      float fascia = step(${f(SHOP_GLASS[1])} + 0.15, up) * step(up, ${f(SHOP_FASCIA)});
      vec2 gc = vec2(along, up) / ${f(GLYPH * 0.6)};
      float glyph = step(0.5, fcHash(floor(gc) + seed * 1.3)) * fcRect(fract(gc), vec4(0.15, 0.15, 0.85, 0.85));
      float signed = step(fcHash(vec2(bay, seed + 4.7)), 1.0 - 0.5 * grime);
      diffuseColor.rgb *= 1.0 - fascia * 0.7;
      emit += fcNeonOf(floor(fcHash(vec2(bay, seed + 5.2)) * 2.999)) * fascia * signed * mix(0.3, glyph, sd) * ${f(SIGN_GLOW)} * on;
      diffuseColor.rgb *= 1.0 - 0.6 * step(up, ${f(SHOP_GLASS[0])});
    }
    if (surf > ${S.shop}.5 && surf < ${S.lamp}.5) {
      diffuseColor.rgb = vec3(0.1);
      emit += uWarm * ${f(LAMP_GLOW)} * on;
    }
    if (surf > ${S.lamp}.5) {
      diffuseColor.rgb = vec3(0.1);
      emit += neon * ${f(LIGHT_GLOW)} * on;
    }
    // Shopfronts along the street, shuttered more often the grimier the street, neon-lit on a grimy one.
    float shop = shops * (1.0 - high) * step(up, ${f(SHOP_HEIGHT)}) * step(0.6, up) * step(fcHash(vec2(id.x, seed + 3.3)), ${f(SHOP_SHARE)} * (1.0 - 0.6 * grime));
    emit += mix(uWarm, neon, step(0.5, grime)) * shop * ${f(SHOP_GLOW)} * uGlow;
    // Neon: a band under the roofline, and strips up the corners.
    float crown = step(0.5, mod(trim, 2.0)) * step(tall - ${f(CROWN_TOP + CROWN_HEIGHT)}, up) * step(up, tall - ${f(CROWN_TOP)});
    float edge = step(1.5, trim) * vFacadeB.z * step(vFacadeB.y - abs(along), ${f(EDGE_WIDTH)});
    float tube = min(crown + edge, 1.0);
    emit += neon * tube * ${f(CROWN_GLOW)} * on;
    diffuseColor.rgb *= 1.0 - tube;
    // Grime: streaks and damp, and the street's stain climbing the base.
    float dirt = fcDirt(vec2(along, up), seed);
    float stain = (1.0 - high) * (1.0 - smoothstep(0.0, ${f(STAIN_HEIGHT)}, up));
    diffuseColor.rgb *= 1.0 - grime * ${f(GRIME_DARK)} * max(dirt, stain);
    // Occlusion where the wall meets the street (lit shopfronts are emissive, so they stay lit).
    diffuseColor.rgb *= 1.0 - (1.0 - high) * uBaseShade.x * (1.0 - smoothstep(0.0, uBaseShade.y, up));
  } else {
    // A roof: dark, damp, a garden's planting, or a pad's ring and lit rim.
    vec2 r = vFacadeRoof.xy;
    vec2 rh = vFacadeRoof.zw;
    diffuseColor.rgb *= ${f(ROOF_SHADE)} * (1.0 - grime * 0.5 * fcDirt(r, seed));
    if (surf > ${S.plain}.5 && surf < ${S.garden}.5) {
      float leaf = fcNoise(r * 0.5 + seed);
      diffuseColor.rgb = mix(vec3(${rgb(LEAF_DARK)}), vec3(${rgb(LEAF_LIT)}), leaf);
    }
    if (surf > ${S.shop}.5) {
      // A lamp or a light glows all over, top included.
      diffuseColor.rgb = vec3(0.1);
      emit += (surf < ${S.lamp}.5 ? uWarm * ${f(LAMP_GLOW)} : neon * ${f(LIGHT_GLOW)}) * on;
    } else if (surf > ${S.garden}.5 && surf < ${S.pad}.5) {
      float rr = length(r) / max(min(rh.x, rh.y), 0.1);
      float ring = step(abs(rr - ${f(PAD_RING)}), 0.04);
      vec2 e = abs(r) / max(rh, vec2(0.1));
      float rim = step(0.93, max(e.x, e.y)) * step(fract((r.x + r.y) / ${f(PAD_DASH)}), 0.35);
      emit += neon * (ring + rim) * on;
    }
  }
  totalEmissiveRadiance += emit;
}`;

/** Lambert facades with shader-drawn windows, shopfronts, grime and neon (see the header). */
export function facadeMaterial(o: FacadeOptions): FacadeMaterial {
  const dusk = o.palette.dusk;
  const time = { value: 0 };
  const mat = Object.assign(new THREE.MeshLambertMaterial({ color: 0xffffff }), { time });
  const uniforms = {
    uLit: { value: LIT_DAY + (LIT_DUSK - LIT_DAY) * dusk },
    uGlow: { value: GLOW_DAY + (GLOW_DUSK - GLOW_DAY) * dusk },
    uTime: time,
    uWarm: { value: new THREE.Color(WARM) },
    uCool: { value: new THREE.Color(COOL) },
    uNeon: { value: o.neon.map((c) => new THREE.Color(c)) },
    uBeacon: { value: new THREE.Color(BEACON) },
    // Mirrored glass shows the glow low in the sky, toward the horizon.
    uSky: { value: new THREE.Color(o.palette.horizon) },
    // amount 0 multiplies by exactly 1: the facade is unchanged where the look is off.
    uBaseShade: { value: o.baseShade ? new THREE.Vector2(o.baseShade.amount, o.baseShade.height) : new THREE.Vector2(0, 1) },
  };
  if (o.styled) mat.defines = { FACADE_STYLED: '' };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAGMENT}`);
  };
  mat.customProgramCacheKey = () => (o.styled ? 'city-facade-styled' : 'city-facade');
  return mat;
}
