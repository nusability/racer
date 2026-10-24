import type { BiomeId } from '../../data/worlds.ts';
import { CITY_NEON } from '../facade.ts';

// Per-world look: the "premium stylised" pass (post-processing, reflective gliders, wet road,
// baked occlusion, boost blur). A world without an entry draws exactly as before the pass:
// no tone mapping, no render targets, its palettes tuned for NoToneMapping. Only a world that
// opts in here changes, so each world can be judged (look and frame rate) before the next.

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

export interface EnvLook {
  /** Night sky above the neon (zenith), the haze band at the horizon, and the street below (sRGB). */
  zenith: number;
  haze: number;
  street: number;
  /** Haze band brightness (linear HDR) and its height above the horizon (radians). */
  hazeGain: number;
  hazeHeight: number;
  /** Towers of lit windows and neon round the horizon: how many, their brightness, how tall (radians). */
  towers: number;
  towerGain: number;
  towerHeight: readonly [number, number];
  /** Neon colours a tower may wear (sRGB). */
  neon: readonly number[];
  /** Equirect canvas the environment is painted on before PMREM (power of two, 2:1). */
  width: number;
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
}

/** Which effects a quality level can afford; the debug flags can only switch these off. */
export interface LookBudget {
  /** The render-target pipeline (tone map + grade in one pass); without it tone mapping runs in the materials. */
  post: boolean;
  bloom: boolean;
  /** An anti-aliasing pass (the mode is the debug menu's: FXAA by default, MSAA to compare). */
  aa: boolean;
  boostBlur: boolean;
  /** Mirrored road glow (drawn from the bloom chain); the sheen is in the road material and needs nothing. */
  wetReflections: boolean;
  wetSheen: boolean;
  gliders: boolean;
  ao: boolean;
}

export const LOOK_BUDGET: Record<'low' | 'high', LookBudget> = {
  // Low stays at today's cost: no render target, so no bloom, blur or AA pass (the canvas keeps
  // its own MSAA). Tone mapping, the sheen, the env-mapped player glider and the baked
  // occlusion cost next to nothing per frame.
  low: { post: false, bloom: false, aa: false, boostBlur: false, wetReflections: false, wetSheen: true, gliders: true, ao: true },
  high: { post: true, bloom: true, aa: true, boostBlur: true, wetReflections: true, wetSheen: true, gliders: true, ao: true },
};

const CITY_LOOK: WorldLook = {
  bloom: { threshold: 0.6, knee: 0.25, strength: 1.2, clamp: 6, levels: 3 },
  grade: {
    // ACES darkens the mid-tones of a scene lit for NoToneMapping; this keeps the asphalt and
    // walls near where the palette had them while neon rolls off instead of clipping. Higher
    // washes the unlit neon (kerbs, signs) toward white and loses its colour.
    exposure: 1.15,
    // Cool shadows (blue lift), magenta-warm highlights (gain), a little punch in saturation.
    // Stronger lift or saturation turns the asphalt violet and the road loses its grey.
    lift: [0, 0, 0.008],
    gamma: [1, 1, 1.02],
    gain: [1.04, 0.99, 1.03],
    saturation: 1.06,
  },
  boostBlur: { reach: 0.075, inner: 0.22, outer: 0.75, chroma: 0.008, response: 5, speedFrom: 0.5 },
  wetRoad: { reflection: 0.9, smear: 0.09, nearShare: 0.3, horizonFade: 0.08, curlLookAhead: 160, curlResponse: 4, sheen: 0.06, sheenPower: 5, sheenColor: 0x6c78b0 },
  // About a glider's footprint, centred under the thrusters; bright enough to bloom when boosting,
  // dim enough cruising that the road's lines still read through it.
  glowPool: { length: 11, width: 7, behind: 2, lift: 0.08, intensity: 0.6, boostIntensity: 1.1, fadeHeight: 6 },
  gliders: { metalness: 0.55, roughness: 0.3, envIntensity: 1.1, canopyMetalness: 0.7, canopyRoughness: 0.06 },
  env: {
    zenith: 0x080a1e,
    haze: 0x6a2a8c,
    street: 0x0c0c12,
    hazeGain: 1.6,
    hazeHeight: 0.22,
    towers: 48,
    towerGain: 3,
    towerHeight: [0.08, 0.5],
    neon: CITY_NEON,
    width: 256,
  },
  ao: { wall: 0.42, reach: 2.4, wallFoot: 0.5, cover: 0.5, coverClear: [3.5, 24], coverSoften: 4, buildingBase: 0.55, buildingHeight: 7 },
};

/** The look each world opts into; null draws the world as it was before the look pass. */
export const WORLD_LOOK: Record<BiomeId, WorldLook | null> = {
  desert: null,
  beach: null,
  ice: null,
  jungle: null,
  city: CITY_LOOK,
  space: null,
};
