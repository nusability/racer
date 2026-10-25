import type { TrackPalette } from '../../core/types.ts';
import type { BiomeId } from '../../data/worlds.ts';
import { CITY_NEON } from '../facade.ts';
import { sunDirection } from '../track/environment.ts';
import type { AoLook, BoostBlurLook, GliderFinishLook, WorldLook } from './lookTuning.ts';

// Each world's look, as a function of the track's palette: one world spans midday to deep dusk
// (palette.dusk), and its grade, glow and shimmer follow the light. The env map is painted in
// the palette's own sky, horizon and ground, so gliders reflect the world they race through.
// The palettes were tuned for NoToneMapping; ACES darkens their mid-tones and rolls their
// highlights off, so each world re-tunes exposure until it reads at least as before.

export type WorldLookFor = (palette: TrackPalette) => WorldLook;

/** A value at midday (dusk 0) eased to its deep-dusk value (dusk 1). */
function byDusk(p: TrackPalette, midday: number, dusk: number): number {
  return midday + (dusk - midday) * p.dusk;
}

function sunDir(p: TrackPalette): readonly [number, number, number] {
  const d = sunDirection(p);
  return [d.x, d.y, d.z];
}

/** The speed blur reads the same in every world: it is about speed, not place. */
const BOOST_BLUR: BoostBlurLook = { reach: 0.075, inner: 0.22, outer: 0.75, chroma: 0.008, response: 5, speedFrom: 0.5 };

/**
 * Canyon walls, arches, tunnels and decks shade the road in every world. The city's buildings
 * darken toward the street; elsewhere `buildingBase` is never read (no kit has buildings).
 */
const AO: AoLook = { wall: 0.42, reach: 2.4, wallFoot: 0.5, cover: 0.5, coverClear: [3.5, 24], coverSoften: 4, buildingBase: 0.55, buildingHeight: 7 };

/** Gliders by daylight: a shade less mirror than the city's, so the sky's glare never hides the livery. */
const DAY_GLIDERS: GliderFinishLook = { metalness: 0.5, roughness: 0.32, envIntensity: 1, canopyMetalness: 0.7, canopyRoughness: 0.06 };

/** Env canvas width: the hull is small on screen, so a coarse sky pre-filters cleanly. */
const ENV_WIDTH = 256;

/**
 * The daylight curve. ACES at exposure 0.8 keeps the palettes' mid-tones near where
 * NoToneMapping had them (0.5 → 0.59) but rolls white down to ~0.7; the gain lifts it back to
 * ~0.9 (everything over 1, the sun and glints, still rolls off), and a gamma under 1 gives back
 * the contrast ACES's shoulder took. Dusk scenes are darker and lit by lamps: less gain, more
 * exposure, nearer the city's night grade.
 */
const DAY_EXPOSURE = 0.8;
const DUSK_EXPOSURE = 0.95;
const DAY_GAIN = 1.28;
const DUSK_GAIN = 1.1;
const DAY_GAMMA = 0.93;
/** Low graphics tone-maps in the materials with no grade: a plain exposure that keeps white nearest white. */
const DAY_MATERIAL_EXPOSURE = 1;
const DUSK_MATERIAL_EXPOSURE = 1.1;

function gainOf(p: TrackPalette, tint: readonly [number, number, number]): [number, number, number] {
  const g = byDusk(p, DAY_GAIN, DUSK_GAIN);
  return [g * tint[0], g * tint[1], g * tint[2]];
}

const cityLook: WorldLookFor = (p) => ({
  bloom: { threshold: 0.6, knee: 0.25, strength: 1.2, clamp: 6, levels: 3 },
  grade: {
    // ACES darkens the mid-tones of a scene lit for NoToneMapping; this keeps the asphalt and
    // walls near where the palette had them while neon rolls off instead of clipping. Higher
    // washes the unlit neon (kerbs, signs) toward white and loses its colour.
    exposure: 1.15,
    materialExposure: 1.15,
    // Cool shadows (blue lift), magenta-warm highlights (gain), a little punch in saturation.
    // Stronger lift or saturation turns the asphalt violet and the road loses its grey.
    lift: [0, 0, 0.008],
    gamma: [1, 1, 1.02],
    gain: [1.04, 0.99, 1.03],
    saturation: 1.06,
  },
  boostBlur: BOOST_BLUR,
  wetRoad: {
    reflection: 0.9, smear: 0.09, nearShare: 0.3, horizonFade: 0.08, curlLookAhead: 160, curlResponse: 4,
    sheen: 0.06, sheenPower: 5, sheenColor: 0x6c78b0,
    // Rain-soaked asphalt end to end; no sun to glare off at night.
    baseWet: 1, slickSheen: 1, sunGlint: 0, sunGlintPower: 1,
  },
  // About a glider's footprint, centred under the thrusters; bright enough to bloom when boosting,
  // dim enough cruising that the road's lines still read through it.
  glowPool: { length: 11, width: 7, behind: 2, lift: 0.08, intensity: 0.6, boostIntensity: 1.1, fadeHeight: 6 },
  gliders: { metalness: 0.55, roughness: 0.3, envIntensity: 1.1, canopyMetalness: 0.7, canopyRoughness: 0.06 },
  // The city's reflected night is its own (a violet haze over dark streets, a neon skyline), the
  // same on every city track: its palettes' skies are all night and the towers carry the look.
  env: {
    zenith: 0x080a1e,
    haze: 0x6a2a8c,
    ground: 0x0c0c12,
    hazeGain: 1.6,
    hazeHeight: 0.22,
    groundHaze: 0.35,
    groundHazeFalloff: 14,
    sun: null,
    ridge: null,
    towers: { count: 48, gain: 3, height: [0.08, 0.5], neon: CITY_NEON },
    width: ENV_WIDTH,
  },
  ao: AO,
  heatHaze: null,
  sea: null,
  sunDir: sunDir(p),
});

const desertLook: WorldLookFor = (p) => ({
  // Sunlit sand and pale road reach ~1.3 in linear light, so the glow starts above them (lower
  // and the whole frame goes milky): only the sun, thrusters, spaceport lamps and boost pads
  // pass. At dusk the land darkens and lamps glow sooner.
  bloom: { threshold: byDusk(p, 1.4, 0.8), knee: 0.3, strength: byDusk(p, 0.6, 0.9), clamp: 6, levels: 3 },
  grade: {
    exposure: byDusk(p, DAY_EXPOSURE, DUSK_EXPOSURE),
    materialExposure: byDusk(p, DAY_MATERIAL_EXPOSURE, DUSK_MATERIAL_EXPOSURE),
    // Golden hour: faintly amber shadows; the highlights lose blue as the sun sinks.
    lift: [0.006, 0.002, 0],
    gamma: [DAY_GAMMA, DAY_GAMMA, DAY_GAMMA],
    gain: gainOf(p, [1.03, 1, byDusk(p, 0.96, 0.86)]),
    // Sun-bleached, not grey: ACES desaturates the bright sand, this gives it back.
    saturation: 1.18,
  },
  boostBlur: BOOST_BLUR,
  wetRoad: {
    // Dry packed sand: no mirror, only the sun glaring off it where the road runs toward it.
    reflection: 0, smear: 0.09, nearShare: 0.3, horizonFade: 0.08, curlLookAhead: 160, curlResponse: 4,
    sheen: 0.04, sheenPower: 5, sheenColor: 0xffe0b0,
    baseWet: 0, slickSheen: 1,
    // Low sun glares harder (the road mirrors it at a grazing angle); a wide lobe reads as heat, not water.
    sunGlint: byDusk(p, 0.12, 0.3), sunGlintPower: 16,
  },
  // Thruster light on bright sand is weak by day; at dusk it pools as in the city.
  glowPool: { length: 11, width: 7, behind: 2, lift: 0.08, intensity: byDusk(p, 0.25, 0.5), boostIntensity: byDusk(p, 0.6, 1), fadeHeight: 6 },
  gliders: DAY_GLIDERS,
  env: {
    zenith: p.sky,
    haze: p.horizon,
    ground: p.sand,
    hazeGain: 1,
    hazeHeight: 0.35,
    groundHaze: 0.3,
    groundHazeFalloff: 10,
    // Bright enough (HDR) that a hull facing the sun flares into the bloom; more blows the livery out.
    sun: { color: p.sun, gain: 6, radius: 0.05, glow: byDusk(p, 0.3, 0.7), glowPower: byDusk(p, 18, 5) },
    // Mesas on the horizon, in the palette's rock, sunlit on one face.
    ridge: { color: p.rock, haze: 0.35, height: [0.015, 0.06], crests: 7, sunSide: 0.3 },
    towers: null,
    width: ENV_WIDTH,
  },
  ao: AO,
  // Strongest under the midday sun, nearly gone at dusk. A wobble of ~3 px at 1080p, only in a
  // narrow band along the horizon: the far road swims, anything near enough to dodge does not.
  heatHaze: { amount: byDusk(p, 0.0028, 0.0006), band: 0.06, above: 0.02, scale: 26, rise: 1.4 },
  sea: null,
  sunDir: sunDir(p),
});

/** Open water seen from the coast's gliders, under the horizon haze. */
const COAST_SEA = 0x1a6a9a;

const beachLook: WorldLookFor = (p) => ({
  // As the desert's: the coast's pale road and sand by day must stay under the glow.
  bloom: { threshold: byDusk(p, 1.4, 0.85), knee: 0.3, strength: byDusk(p, 0.55, 0.95), clamp: 6, levels: 3 },
  grade: {
    exposure: byDusk(p, DAY_EXPOSURE, DUSK_EXPOSURE),
    materialExposure: byDusk(p, DAY_MATERIAL_EXPOSURE, DUSK_MATERIAL_EXPOSURE),
    // Tropical: clean whites, turquoise lifted in the shadows by day; sunsets go warm.
    lift: [0, 0.003, 0.008],
    gamma: [DAY_GAMMA, DAY_GAMMA, DAY_GAMMA],
    gain: gainOf(p, [byDusk(p, 0.98, 1.04), 1, byDusk(p, 1.04, 0.95)]),
    // Sunsets already glow orange in the palette; more saturation there turns the boards red.
    saturation: byDusk(p, 1.2, 1.1),
  },
  boostBlur: BOOST_BLUR,
  wetRoad: {
    reflection: 0, smear: 0.09, nearShare: 0.3, horizonFade: 0.08, curlLookAhead: 160, curlResponse: 4,
    // Salt-damp road: a faint sky-coloured sheen and the sun's glare at sunset.
    sheen: 0.05, sheenPower: 5, sheenColor: p.horizon,
    baseWet: 0, slickSheen: 1,
    sunGlint: byDusk(p, 0.08, 0.18), sunGlintPower: 20,
  },
  glowPool: { length: 11, width: 7, behind: 2, lift: 0.08, intensity: byDusk(p, 0.25, 0.5), boostIntensity: byDusk(p, 0.6, 1), fadeHeight: 6 },
  gliders: DAY_GLIDERS,
  env: {
    zenith: p.sky,
    haze: p.horizon,
    ground: COAST_SEA,
    hazeGain: 1,
    hazeHeight: 0.3,
    // The sea mirrors the horizon strongly near it.
    groundHaze: 0.6,
    groundHazeFalloff: 8,
    sun: { color: p.sun, gain: 6, radius: 0.05, glow: byDusk(p, 0.3, 0.7), glowPower: byDusk(p, 18, 5) },
    // Low islands offshore.
    ridge: { color: p.rock, haze: 0.55, height: [0, 0.03], crests: 5, sunSide: 0.2 },
    towers: null,
    width: ENV_WIDTH,
  },
  ao: AO,
  heatHaze: null,
  sea: { reflection: 0.85, glint: byDusk(p, 6, 9), glintPower: 360, sparkle: 0.035, sparkleGain: byDusk(p, 3, 5) },
  sunDir: sunDir(p),
});

/** Snow peaks round the reflected horizon (their palette's snow is its `sand`). */
const ICE_PEAK = 0xeef4ff;
/** On snow every direction a hull faces is near white: a duller mirror keeps the livery's colour. */
const ICE_GLIDERS: GliderFinishLook = { ...DAY_GLIDERS, envIntensity: 0.55 };

const iceLook: WorldLookFor = (p) => ({
  // Sunlit snow is the brightest thing in any world: by day the glow starts well above it, so
  // only lights, glints and the sun bloom; under the aurora's night it starts low enough for the
  // aurora and every lamp to glow.
  bloom: { threshold: byDusk(p, 1.5, 0.55), knee: 0.3, strength: byDusk(p, 0.45, 1.1), clamp: 6, levels: 3 },
  grade: {
    // Honest exposure: sunlit snow lands at ~0.9, never clipped flat, so its drifts keep shape.
    exposure: byDusk(p, DAY_EXPOSURE, DUSK_EXPOSURE),
    // Without the grade's gain, a notch under the other day worlds: snow is brighter than sand.
    materialExposure: byDusk(p, 0.95, DUSK_MATERIAL_EXPOSURE),
    // Cold: blue in the shadows, a crisp blue-white gain.
    lift: [0, 0.004, 0.014],
    gamma: [0.95, 0.95, 0.95],
    gain: gainOf(p, [0.95, 0.99, 1.04]),
    saturation: 1.06,
  },
  boostBlur: BOOST_BLUR,
  wetRoad: {
    // Glazed packed snow: a faint mirror everywhere, a clear one on slick ice.
    reflection: byDusk(p, 0.3, 0.55), smear: 0.07, nearShare: 0.3, horizonFade: 0.08, curlLookAhead: 160, curlResponse: 4,
    sheen: 0.05, sheenPower: 4, sheenColor: 0xcfe4ff,
    baseWet: 0.2, slickSheen: 2.5,
    sunGlint: byDusk(p, 0.12, 0.04), sunGlintPower: 40,
  },
  glowPool: { length: 11, width: 7, behind: 2, lift: 0.08, intensity: byDusk(p, 0.2, 0.6), boostIntensity: byDusk(p, 0.5, 1.1), fadeHeight: 6 },
  gliders: ICE_GLIDERS,
  env: {
    zenith: p.sky,
    haze: p.horizon,
    ground: p.sand,
    hazeGain: 1,
    hazeHeight: 0.3,
    groundHaze: 0.25,
    groundHazeFalloff: 10,
    sun: { color: p.sun, gain: 5, radius: 0.04, glow: byDusk(p, 0.3, 0.6), glowPower: byDusk(p, 18, 5) },
    ridge: { color: ICE_PEAK, haze: 0.3, height: [0.03, 0.12], crests: 9, sunSide: 0.25 },
    towers: null,
    width: ENV_WIDTH,
  },
  ao: AO,
  heatHaze: null,
  sea: null,
  sunDir: sunDir(p),
});

/** The gas giant under the ring station, as the gliders see it below them (render/track/spaceSky.ts). */
const SPACE_PLANET = 0x4a78a8;

const spaceLook: WorldLookFor = (p) => ({
  // Space is black and lit by points: the star, the station's lights, the gantry and rib bands,
  // the boost pads. The glow starts under them and over the lit planet and hull (~0.6 linear),
  // so depth comes from light without the frame going milky.
  bloom: { threshold: 0.8, knee: 0.25, strength: 1.05, clamp: 6, levels: 3 },
  grade: {
    // A notch over the city's exposure: the star's hard key leaves deep shadows, and the deck
    // in them must still read; ACES keeps the star and the lamps from clipping flat.
    exposure: 1.2,
    materialExposure: 1.2,
    // Shadows stay black (no lift): space has no air to scatter light into them. A faint cool
    // gain matches the planet's bounce.
    lift: [0, 0, 0],
    gamma: [1, 1, 0.98],
    gain: [0.99, 1, 1.03],
    saturation: 1.08,
  },
  boostBlur: BOOST_BLUR,
  wetRoad: {
    // Polished steel plating: the lamps and pads mirror in it, softer than wet asphalt, and the
    // star glares off it where the deck runs toward it.
    reflection: 0.55, smear: 0.07, nearShare: 0.3, horizonFade: 0.08, curlLookAhead: 160, curlResponse: 4,
    sheen: 0.05, sheenPower: 5, sheenColor: 0x8fb4e8,
    baseWet: 0.65, slickSheen: 1,
    sunGlint: 0.2, sunGlintPower: 40,
  },
  glowPool: { length: 11, width: 7, behind: 2, lift: 0.08, intensity: 0.6, boostIntensity: 1.1, fadeHeight: 6 },
  gliders: { metalness: 0.55, roughness: 0.28, envIntensity: 1, canopyMetalness: 0.7, canopyRoughness: 0.06 },
  // What a hull mirrors: black above, the planet's blue below, the star as a hard point.
  env: {
    zenith: 0x020308,
    haze: 0x0c1424,
    ground: SPACE_PLANET,
    hazeGain: 1,
    hazeHeight: 0.12,
    groundHaze: 0.2,
    groundHazeFalloff: 6,
    sun: { color: p.sun, gain: 8, radius: 0.02, glow: 0.15, glowPower: 30 },
    ridge: null,
    towers: null,
    width: ENV_WIDTH,
  },
  ao: AO,
  heatHaze: null,
  sea: null,
  sunDir: sunDir(p),
});

/** The look each world opts into; null draws the world as it was before the look pass. */
export const WORLD_LOOK: Record<BiomeId, WorldLookFor | null> = {
  desert: desertLook,
  beach: beachLook,
  ice: iceLook,
  jungle: null,
  city: cityLook,
  space: spaceLook,
};
