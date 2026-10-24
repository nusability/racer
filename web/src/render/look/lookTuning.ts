import type { GraphicsLevel } from '../graphicsTuning.ts';

// Per-world look: the "premium stylised" pass (post-processing, reflective gliders, wet road,
// baked occlusion, boost blur, heat haze). The shapes of its tuning and what each graphics
// level affords; each world's own tuning is in worldLooks.ts. A world without an entry draws
// exactly as before the pass: no tone mapping, no render targets, its palettes tuned for
// NoToneMapping.

export type AaMode = 'fxaa' | 'msaa' | 'off';

export interface BloomLook {
  /** Brightness (largest channel, linear HDR) where glow starts: only lights pass it. */
  threshold: number;
  /** Soft knee below the threshold, so glow fades in rather than snapping on. */
  knee: number;
  /** Added glow, times the summed blur levels. */
  strength: number;
  /** HDR spikes (additive jets stacked on neon) are clamped here before blurring, or one pixel flickers a whole halo. */
  clamp: number;
  /** Down-sample levels below half resolution (1/4, 1/8, …): more is a wider glow and more passes. */
  levels: number;
}

export interface GradeLook {
  /** Tone-mapping exposure (ACES); the scene is lit for NoToneMapping, which ACES darkens in the mid-tones. */
  exposure: number;
  /**
   * Exposure when tone mapping runs in the materials (no post pass, so no grade): it stands in
   * for the grade's gain, which daylight worlds lean on to bring ACES's whites back to white.
   */
  materialExposure: number;
  /** Lift / gamma / gain per channel (after tone mapping, display-referred 0..1). */
  lift: readonly [number, number, number];
  gamma: readonly [number, number, number];
  gain: readonly [number, number, number];
  saturation: number;
}

export interface BoostBlurLook {
  /** Radial blur reach at the screen corner at full boost and top speed (share of the centre-to-pixel vector). */
  reach: number;
  /** Blur is zero inside this radius and full past `outer` (aspect-corrected, 0.5 = the half height): the line ahead stays sharp. */
  inner: number;
  outer: number;
  /** Red/blue split at the edge, as a share of the centre-to-pixel vector. */
  chroma: number;
  /** The blur eases in and out at this rate (1/s), so boost on and off never pops. */
  response: number;
  /** Below this share of top speed there is no blur, even on boost. */
  speedFrom: number;
}

export interface WetRoadLook {
  /** Screen-space mirrored glow on the road: strength, and how far each reflection smears toward the viewer (screen heights). */
  reflection: number;
  smear: number;
  /** Reflections are strongest at the horizon (grazing) and fall to this share at the bottom of the screen. */
  nearShare: number;
  /**
   * The mirror line is the horizon of the road under the camera; reflections fade in over this
   * many screen heights below it instead of stopping dead, so a road that bends across the line
   * (a loop, a corkscrew, a crest) never shows a hard edge.
   */
  horizonFade: number;
  /**
   * The mirror is one plane, so where the road curls (loops, corkscrews) it is wrong: mirrored
   * reflections fade out while the camera's road, or the road this many metres ahead, curls,
   * easing at `curlResponse` per second. The glow pools carry the halos there.
   */
  curlLookAhead: number;
  curlResponse: number;
  /** Fresnel sheen at grazing angles: strength, Schlick power, and its colour (sRGB). */
  sheen: number;
  sheenPower: number;
  sheenColor: number;
  /**
   * How wet ordinary road is (0..1): the share of the mirrored reflections it shows. Slick
   * stretches (ice, grip below 1) are fully wet, so the wet look also says "slippery here".
   */
  baseWet: number;
  /** The sheen on slick stretches, times `sheen`. */
  slickSheen: number;
  /** Sun glare on the road where it mirrors the sun (strength, Phong power), in the sun's colour; 0 is none. */
  sunGlint: number;
  sunGlintPower: number;
}

/** Thruster light pooled on the road under each glider (glowPools.ts). */
export interface GlowPoolLook {
  /** Pool size on the road, metres along and across, and how far behind the craft's centre it sits. */
  length: number;
  width: number;
  behind: number;
  /** Lifted this far off the road surface (plus polygon offset) so it never sinks into it. */
  lift: number;
  /** Brightness of the glow colour cruising and boosting (above 1 feeds the bloom). */
  intensity: number;
  boostIntensity: number;
  /** Height above the road at which the pool has faded out (jumps). */
  fadeHeight: number;
}

export interface GliderFinishLook {
  /** Paint over metal: how metallic and how rough the hull, and how strongly it reflects the city. */
  metalness: number;
  roughness: number;
  envIntensity: number;
  canopyMetalness: number;
  canopyRoughness: number;
}

/** Lit towers with neon edges standing round the reflected horizon (the city's skyline). */
export interface EnvTowersLook {
  /** How many, their brightness (linear HDR), how tall (radians). */
  count: number;
  gain: number;
  height: readonly [number, number];
  /** Neon colours a tower may wear (sRGB). */
  neon: readonly number[];
}

/** A ring of hills, mesas or peaks standing on the reflected horizon. */
export interface EnvRidgeLook {
  /** Its colour (sRGB) and how far it melts into the horizon haze (0..1). */
  color: number;
  haze: number;
  /** Height range (radians) and how many crests run round the horizon. */
  height: readonly [number, number];
  crests: number;
  /** The face toward the sun is this much brighter (share), the far face as much darker. */
  sunSide: number;
}

/** A forest's canopy closing overhead and its trunks round the horizon, as the gliders reflect them. */
export interface EnvCanopyLook {
  /** Leaf colour (sRGB), and the elevation (radians) where the canopy starts closing in. */
  leaves: number;
  from: number;
  /** Share of the sky the leaves hide near the zenith (the rest is gaps of sky), 0..1. */
  cover: number;
  /** Dark trunks standing round the horizon up into the canopy: how many, their colour (sRGB), their width (radians). */
  trunks: number;
  bark: number;
  trunkWidth: readonly [number, number];
}

/** The world the gliders reflect, painted once per race (env.ts). */
export interface EnvLook {
  /** Sky at the zenith, the haze band at the horizon, and the ground below (sRGB). */
  zenith: number;
  haze: number;
  ground: number;
  /** Haze band brightness (linear HDR) and its height above the horizon (radians). */
  hazeGain: number;
  hazeHeight: number;
  /** The ground mirrors the haze near the horizon: this share, falling off this fast below it (1/rad). */
  groundHaze: number;
  groundHazeFalloff: number;
  /** The sun (sRGB) as a bright disc a hull can glint with, and its glow; null for a world without one. */
  sun: { color: number; gain: number; radius: number; glow: number; glowPower: number } | null;
  ridge: EnvRidgeLook | null;
  towers: EnvTowersLook | null;
  canopy: EnvCanopyLook | null;
  /** Equirect canvas the environment is painted on before PMREM (power of two, 2:1). */
  width: number;
}

/**
 * Heat shimmer: a screen-space wobble of the scene in a band along the road's horizon (the far
 * road and ground), fading fast toward the viewer so the road, hazards and pads near enough to
 * act on never move.
 */
export interface HeatHazeLook {
  /** Largest displacement, as a share of the screen height; 0 is none. */
  amount: number;
  /** Below the horizon line it fades over this many screen heights; above it, over `above`. */
  band: number;
  above: number;
  /** Noise cells per screen height (finer is a busier shimmer) and how fast it rises (cells/s). */
  scale: number;
  rise: number;
}

/** The look's water (biomes/water.ts): sky mirrored by a Fresnel term and HDR sun glints for the bloom. */
export interface SeaLook {
  /** Share of the Fresnel-weighted sky reflection, the glint's peak brightness (linear HDR) and tightness. */
  reflection: number;
  glint: number;
  glintPower: number;
  /** Sparkle: tiny sun facets on the ripples, how many (0..1 of cells) and how bright (HDR). */
  sparkle: number;
  sparkleGain: number;
}

export interface AoLook {
  /** Road shade at the foot of a wall, and how far in from the road edge the darkening reaches (m). */
  wall: number;
  reach: number;
  /** Concrete wall faces darken this much at their foot. */
  wallFoot: number;
  /** Road under another road (flyover, deck): shade, and the clearances that count as covered (m). */
  cover: number;
  coverClear: readonly [number, number];
  /** Samples either side a cover blends over, so the shadow has soft ends. */
  coverSoften: number;
  /** Buildings darken toward the street over this height (m), to this share. */
  buildingBase: number;
  buildingHeight: number;
}

export interface WorldLook {
  bloom: BloomLook;
  grade: GradeLook;
  boostBlur: BoostBlurLook;
  wetRoad: WetRoadLook;
  glowPool: GlowPoolLook;
  gliders: GliderFinishLook;
  env: EnvLook;
  ao: AoLook;
  /** Null for a world without shimmering heat. */
  heatHaze: HeatHazeLook | null;
  /** Null for a world without open water. */
  sea: SeaLook | null;
  /** World direction toward the sun (from the track's palette): the road's glint and the env's sun. */
  sunDir: readonly [number, number, number];
}

/** Which effects a graphics level can afford; the debug flags can only switch these off. */
export interface LookBudget {
  /** The render-target pipeline (tone map + grade in one pass); without it tone mapping runs in the materials. */
  post: boolean;
  bloom: boolean;
  /**
   * The bloom chain starts at 1/2^shift of the drawing buffer (1: half resolution, the designed
   * glow). The chain always ends at the same size, so the glow reaches as far at any shift; a
   * lower shift only makes its core crisper, at the fill cost of one more, larger pass.
   */
  bloomShift: 0 | 1 | 2;
  /** The anti-aliasing pass (the debug menu can force another mode, or none). */
  aa: AaMode;
  boostBlur: boolean;
  /** The heat shimmer: a little noise in the composite, no extra pass. */
  heatHaze: boolean;
  /** Mirrored road glow (drawn from the bloom chain); the sheen is in the road material and needs nothing. */
  wetReflections: boolean;
  wetSheen: boolean;
  gliders: boolean;
  ao: boolean;
}

export const LOOK_BUDGET: Record<GraphicsLevel, LookBudget> = {
  // Low stays at the cost from before the look pass: no render target, so no bloom, blur or AA
  // pass (the canvas keeps its own MSAA). Tone mapping, the sheen, the env-mapped player glider
  // and the baked occlusion cost next to nothing per frame.
  low: { post: false, bloom: false, bloomShift: 1, aa: 'off', boostBlur: false, heatHaze: false, wetReflections: false, wetSheen: true, gliders: true, ao: true },
  // The glow is most of what the look adds to a night city, so medium keeps it, starting at a
  // quarter of the resolution (a quarter of high's bloom fill). The mirrored reflections and
  // the boost blur are full-resolution taps per pixel for a subtler gain, so they go.
  medium: { post: true, bloom: true, bloomShift: 2, aa: 'fxaa', boostBlur: false, heatHaze: true, wetReflections: false, wetSheen: true, gliders: true, ao: true },
  high: { post: true, bloom: true, bloomShift: 1, aa: 'fxaa', boostBlur: true, heatHaze: true, wetReflections: true, wetSheen: true, gliders: true, ao: true },
  // Tile GPUs resolve MSAA on chip, so a GPU with room to spare smooths geometry edges properly
  // instead of FXAA's blur, and the glow starts at full resolution.
  ultra: { post: true, bloom: true, bloomShift: 0, aa: 'msaa', boostBlur: true, heatHaze: true, wetReflections: true, wetSheen: true, gliders: true, ao: true },
};
