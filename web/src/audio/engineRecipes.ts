// Engine voice recipes: one per glider style, so each craft is recognisable with your eyes
// shut. Every voice is the same graph (fan whine pair, turbine body, sub, tremolo, jet/boost
// noise, air cushion); a recipe only moves its numbers. Frequencies are Hz at rest and the
// rise to top speed; gains are linear.

import type { RacerStyle } from '../core/types.ts';

export interface EngineRecipe {
  /** The fan: two oscillators (left and right) playing a harmonic wave. */
  whine: {
    /** Harmonic amplitudes from the fundamental up; zeros make chords out of integer ratios. */
    partials: number[];
    baseHz: number;
    rangeHz: number;
    /** Detune between the left and right fan, cents: beating (scrappy) or shimmer (smooth). */
    spreadCents: number;
    /** Gain at rest and at top speed. */
    gain: [number, number];
    /** Slow pitch wobble of the fans. */
    vibratoHz: number;
    vibratoCents: number;
  };
  /** The turbine core: a rich wave through a resonant low-pass and a soft clipper. */
  body: {
    partials: number[];
    baseHz: number;
    rangeHz: number;
    cutoffHz: number;
    cutoffRangeHz: number;
    q: number;
    drive: number;
    gain: number;
    /** Sine an octave under the body: the weight you feel more than hear. */
    sub: number;
  };
  /** Amplitude pulse over fan and body: rattle, blade-pass throb or an aggressive wah. */
  pulse: {
    wave: OscillatorType;
    /** Rate at rest and at top speed. */
    hz: [number, number];
    /** 0..1: how far the pulse dips the level. */
    depth: number;
  };
  /** Band-passed noise: the jet exhaust at speed, which boost opens wide. */
  jet: {
    hz: number;
    q: number;
    /** Gain at rest and at top speed, without boost. */
    gain: [number, number];
  };
  boost: {
    /** Pitch lift of fan and body while boosting. */
    pitch: number;
    /** Extra jet gain and how far the jet band opens. */
    gain: number;
    hzMul: number;
    /** Extra body cutoff, Hz. */
    cutoffHz: number;
  };
  /** Overall trim so the six voices sit at the same loudness. */
  level: number;
}

export const ENGINE_RECIPES: Record<RacerStyle, EngineRecipe> = {
  // Dustwing: a patched-up twin-fan skiff. Two mismatched fans beat against each other and
  // a loose panel rattles at a rate that climbs with speed.
  skiff: {
    whine: { partials: [1, 0.5, 0.33, 0.25, 0.2], baseHz: 380, rangeHz: 1150, spreadCents: 42, gain: [0.05, 0.11], vibratoHz: 5.5, vibratoCents: 14 },
    body: { partials: [1, 0.5, 0.33, 0.25, 0.2, 0.16], baseHz: 46, rangeHz: 120, cutoffHz: 420, cutoffRangeHz: 1900, q: 4, drive: 2.4, gain: 0.26, sub: 0.12 },
    pulse: { wave: 'square', hz: [17, 33], depth: 0.2 },
    jet: { hz: 900, q: 0.8, gain: [0.03, 0.09] },
    boost: { pitch: 1.12, gain: 0.32, hzMul: 1.8, cutoffHz: 1500 },
    level: 1,
  },
  // Scarab GT: one huge fan in an armoured hull. A deep turbine drone with a slow,
  // heavy blade-pass throb; the fan itself is low and dark.
  sponson: {
    whine: { partials: [1, 0.6, 0.4, 0.15], baseHz: 210, rangeHz: 560, spreadCents: 6, gain: [0.035, 0.07], vibratoHz: 1.2, vibratoCents: 6 },
    body: { partials: [1, 0.7, 0.5, 0.4, 0.3, 0.22, 0.16, 0.1], baseHz: 30, rangeHz: 72, cutoffHz: 260, cutoffRangeHz: 1100, q: 6, drive: 3.2, gain: 0.34, sub: 0.3 },
    pulse: { wave: 'sine', hz: [7, 19], depth: 0.28 },
    jet: { hz: 420, q: 0.7, gain: [0.04, 0.1] },
    boost: { pitch: 1.1, gain: 0.36, hzMul: 2.2, cutoffHz: 1100 },
    level: 1,
  },
  // Sirocco: a needle with a jet. A thin, piercing scream high above everything, odd
  // harmonics only (hollow), with a hissing exhaust always on.
  dart: {
    whine: { partials: [1, 0, 0.42, 0, 0.22, 0, 0.12], baseHz: 820, rangeHz: 2300, spreadCents: 9, gain: [0.04, 0.1], vibratoHz: 7, vibratoCents: 8 },
    body: { partials: [1, 0.3, 0.1], baseHz: 62, rangeHz: 150, cutoffHz: 500, cutoffRangeHz: 2400, q: 2, drive: 1.6, gain: 0.16, sub: 0.06 },
    pulse: { wave: 'sine', hz: [0.5, 0.5], depth: 0 },
    jet: { hz: 2600, q: 1.1, gain: [0.05, 0.16] },
    boost: { pitch: 1.14, gain: 0.3, hzMul: 1.5, cutoffHz: 2400 },
    level: 0.95,
  },
  // Quadra Vex: four fans tuned to a major chord (harmonics 4:5:6:8), steady as a choir.
  quadfan: {
    whine: { partials: [0, 0, 0, 1, 0.8, 0.7, 0, 0.5], baseHz: 105, rangeHz: 300, spreadCents: 7, gain: [0.05, 0.11], vibratoHz: 0.8, vibratoCents: 5 },
    body: { partials: [1, 0.5, 0.33, 0.25], baseHz: 52, rangeHz: 130, cutoffHz: 380, cutoffRangeHz: 1700, q: 3, drive: 2, gain: 0.22, sub: 0.12 },
    pulse: { wave: 'triangle', hz: [3, 6], depth: 0.08 },
    jet: { hz: 1200, q: 0.8, gain: [0.03, 0.08] },
    boost: { pitch: 1.12, gain: 0.3, hzMul: 1.7, cutoffHz: 1600 },
    level: 1,
  },
  // Twin Viper: aggressive and bright, pulsing like a wah pedal held down, faster with speed.
  swept: {
    whine: { partials: [1, 0.9, 0.65, 0.5, 0.35, 0.25, 0.18], baseHz: 560, rangeHz: 1700, spreadCents: 16, gain: [0.05, 0.12], vibratoHz: 6, vibratoCents: 10 },
    body: { partials: [1, 0, 0.33, 0, 0.2, 0, 0.14], baseHz: 55, rangeHz: 140, cutoffHz: 520, cutoffRangeHz: 2600, q: 7, drive: 3, gain: 0.24, sub: 0.1 },
    pulse: { wave: 'sine', hz: [6, 15], depth: 0.55 },
    jet: { hz: 1500, q: 1, gain: [0.03, 0.09] },
    boost: { pitch: 1.13, gain: 0.32, hzMul: 1.8, cutoffHz: 2000 },
    level: 0.95,
  },
  // Halo Comet: the ring drive. A smooth hum with a stack of soft harmonics that shimmer
  // between the ears (tiny detune, slow vibrato): sci-fi, never rough.
  ringwing: {
    whine: { partials: [1, 0.55, 0.38, 0.28, 0.2, 0.14], baseHz: 190, rangeHz: 620, spreadCents: 4, gain: [0.05, 0.1], vibratoHz: 0.35, vibratoCents: 16 },
    body: { partials: [1, 0.25, 0.08], baseHz: 48, rangeHz: 115, cutoffHz: 300, cutoffRangeHz: 1200, q: 1.5, drive: 1.2, gain: 0.26, sub: 0.22 },
    pulse: { wave: 'sine', hz: [0.6, 1.4], depth: 0.1 },
    jet: { hz: 3200, q: 0.6, gain: [0.02, 0.06] },
    boost: { pitch: 1.1, gain: 0.28, hzMul: 1.4, cutoffHz: 1200 },
    level: 1.05,
  },
};

/** What the air cushion is riding on. */
export type EngineSurface = 'road' | 'sand' | 'water' | 'snow' | 'ice';

/**
 * The cushion's noise band per surface. One band-pass for all so the filter never changes
 * type mid-flight (that clicks): smooth road is a low hum, sand a gritty mid, water a hiss
 * of spray, snow a soft hush, ice a thin glassy sizzle.
 */
export const SURFACE_RECIPES: Record<EngineSurface, { hz: number; q: number; gain: number }> = {
  road: { hz: 170, q: 0.8, gain: 0.12 },
  sand: { hz: 420, q: 0.7, gain: 0.22 },
  water: { hz: 1700, q: 0.55, gain: 0.2 },
  snow: { hz: 900, q: 0.4, gain: 0.16 },
  ice: { hz: 3600, q: 1.2, gain: 0.09 },
};
