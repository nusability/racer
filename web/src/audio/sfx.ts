// Named one-shots: UI blips, pickups, impacts, boost. Built from ShotPlayer tones and noise
// bursts. UI and pickups go to the space bus (wet, wide); impacts stay drier and heavy.

import { clamp01, type LiveAudio } from './synth.ts';

export type OneShotName =
  | 'countdown'
  | 'go'
  | 'boostStart'
  | 'boostPad'
  | 'scrape'
  | 'hit'
  | 'crash'
  | 'land'
  | 'launch'
  | 'pickup'
  | 'tankEmpty'
  | 'falseStart'
  | 'perfectStart'
  | 'slingshot'
  | 'repair'
  | 'wreck'
  | 'lap'
  | 'finish'
  | 'click'
  | 'buy';

/** Menu sounds bypass the race bus, so slow-mo never drags a button click. */
export const MENU_SOUNDS: ReadonlySet<OneShotName> = new Set(['click', 'buy']);

/** Pickups closer together than this climb the scale, so a line of cells rings upward. */
const PICKUP_CHAIN_S = 0.6;
const PICKUP_BASE_HZ = 880;
const PICKUP_STEP_SEMITONES = 2;
const PICKUP_MAX_STEPS = 12;
/** Sparkle partials on a pickup: random pitches in this band, scattered across the stereo field. */
const SPARKLE_HZ: [number, number] = [3800, 8200];
const SPARKLES = 3;
/** Debris tinkles after a wreck: count, spread (s) and pitch band (Hz). */
const WRECK_DEBRIS = 9;
const WRECK_DEBRIS_SPREAD_S = 1.4;
const WRECK_DEBRIS_HZ: [number, number] = [2200, 6200];
/** Inharmonic ratios of struck metal plate: a crash rings like a hull, not a bell. */
const HULL_MODES = [1, 2.66, 4.53];
/** Lap ping-pong echoes: count, gap and decay per repeat. */
const LAP_ECHOES = 3;
const LAP_ECHO_S = 0.16;
const LAP_ECHO_DECAY = 0.45;

export interface SfxState {
  pickupChain: number;
  lastPickup: number;
}

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

export function playSfx(a: LiveAudio, name: OneShotName, intensity: number, st: SfxState): void {
  const { shots: p, ctx } = a;
  const menu = MENU_SOUNDS.has(name);
  const k = menu ? 1 : a.pitch;
  const dry = menu ? a.menu : a.race;
  const wet = menu ? a.menu : a.space;
  const i = clamp01(intensity);
  const t = ctx.currentTime;
  switch (name) {
    case 'countdown':
      // A clean sci-fi blip: a sine that drops a fifth, with a square body and a click on top.
      p.tone(wet, { wave: 'sine', f0: 1320, f1: 880, dur: 0.12, gain: 0.26 }, k);
      p.tone(wet, { wave: 'square', f0: 440, dur: 0.1, gain: 0.07, filter: 'lowpass', filterHz: 1800 }, k);
      p.noise(wet, { filter: 'highpass', f0: 7000, dur: 0.03, gain: 0.08 }, k);
      break;
    case 'go':
      // A rising sweep that lands on a bright open chord, sparkles flung left and right.
      p.tone(wet, { wave: 'sawtooth', f0: 220, f1: 880, dur: 0.45, gain: 0.12, filter: 'lowpass', filterHz: 3200, q: 4 }, k);
      p.tone(wet, { wave: 'triangle', f0: 880, dur: 0.7, gain: 0.22, delay: 0.08 }, k);
      p.tone(wet, { wave: 'triangle', f0: 1318, dur: 0.7, gain: 0.14, delay: 0.1 }, k);
      [2637, 3520, 4186].forEach((f, n) => p.tone(wet, { wave: 'sine', f0: f, dur: 0.25, gain: 0.05, delay: 0.12 + n * 0.06, pan: n % 2 ? 0.7 : -0.7 }, k));
      p.noise(wet, { filter: 'highpass', f0: 2000, f1: 8000, dur: 0.5, gain: 0.08, attack: 0.2 }, k);
      break;
    case 'boostStart':
      // Afterburner light: a thump, a roar opening up, and a resonant synth sweep climbing over it.
      p.tone(dry, { wave: 'sine', f0: 70, f1: 38, dur: 0.35, gain: 0.5 }, k);
      p.noise(dry, { filter: 'bandpass', f0: 300, f1: 3200, dur: 0.75, gain: 0.55, q: 0.8 }, k);
      p.tone(wet, { wave: 'sawtooth', f0: 110, f1: 990, dur: 0.6, gain: 0.1, filter: 'bandpass', filterHz: 900, q: 3 }, k);
      p.tone(wet, { wave: 'square', f0: 220, f1: 1760, dur: 0.55, gain: 0.035, pan: -0.6, panTo: 0.6, filter: 'lowpass', filterHz: 4000 }, k);
      break;
    case 'boostPad':
      p.tone(dry, { wave: 'sawtooth', f0: 300, f1: 1400, dur: 0.35, gain: 0.2, filter: 'lowpass', filterHz: 4000 }, k);
      p.tone(wet, { wave: 'square', f0: 600, f1: 2800, dur: 0.3, gain: 0.06, delay: 0.04, pan: 0.5, panTo: -0.5 }, k);
      p.noise(dry, { filter: 'bandpass', f0: 600, f1: 2600, dur: 0.4, gain: 0.25 }, k);
      break;
    case 'scrape':
      p.noise(dry, { filter: 'highpass', f0: 2600, f1: 1800, dur: 0.18, gain: 0.4 * i }, k);
      break;
    case 'hit':
      p.tone(dry, { wave: 'sine', f0: 150, f1: 38, dur: 0.32, gain: 0.9 * i }, k);
      p.noise(dry, { filter: 'lowpass', f0: 1400, f1: 300, dur: 0.16, gain: 0.6 * i }, k);
      for (const m of HULL_MODES) p.tone(wet, { wave: 'sine', f0: 410 * m, dur: 0.22, gain: 0.07 * i / m }, k);
      break;
    case 'crash':
      // Heavy: a sub boom, a long crunch closing down, and the hull ringing.
      p.tone(dry, { wave: 'sine', f0: 90, f1: 24, dur: 1.2, gain: 0.7 }, k);
      p.noise(dry, { filter: 'lowpass', f0: 3000, f1: 140, dur: 1.6, gain: 0.65 }, k);
      p.noise(dry, { filter: 'bandpass', f0: 3000, f1: 800, dur: 0.6, gain: 0.35, delay: 0.1 }, k);
      for (const m of HULL_MODES) p.tone(wet, { wave: 'sine', f0: 230 * m, f1: 220 * m, dur: 0.9, gain: 0.12 / m }, k);
      break;
    case 'land':
      p.tone(dry, { wave: 'sine', f0: 115, f1: 42, dur: 0.24, gain: 0.75 * i }, k);
      p.noise(dry, { filter: 'lowpass', f0: 700, f1: 200, dur: 0.12, gain: 0.5 * i }, k);
      break;
    case 'launch':
      // Leaving the ground: the cushion lets go with a falling whoosh.
      p.noise(dry, { filter: 'bandpass', f0: 1600, f1: 400, dur: 0.45, gain: 0.18, q: 0.7 }, k);
      break;
    case 'pickup': {
      st.pickupChain = t - st.lastPickup < PICKUP_CHAIN_S ? Math.min(PICKUP_MAX_STEPS, st.pickupChain + 1) : 0;
      st.lastPickup = t;
      const f = PICKUP_BASE_HZ * 2 ** ((st.pickupChain * PICKUP_STEP_SEMITONES) / 12);
      p.tone(wet, { wave: 'triangle', f0: f, f1: f * 1.5, dur: 0.12, gain: 0.24 }, k);
      p.tone(wet, { wave: 'sine', f0: f * 2, dur: 0.22, gain: 0.1, delay: 0.03 }, k);
      for (let n = 0; n < SPARKLES; n++) {
        const hz = rand(SPARKLE_HZ[0], SPARKLE_HZ[1]);
        p.tone(wet, { wave: 'sine', f0: hz, f1: hz * 1.04, dur: 0.14, gain: 0.035, delay: 0.02 + n * 0.035, pan: rand(-0.9, 0.9) }, k);
      }
      break;
    }
    case 'tankEmpty':
      // The engine voice gates itself (EngineVoice.stutter); this adds the misfire pops and a
      // power-down zap with glitch blips over it.
      for (let n = 0; n < 5; n++) p.noise(dry, { filter: 'bandpass', f0: rand(300, 900), f1: 200, dur: 0.05, gain: 0.3 - n * 0.04, delay: n * rand(0.07, 0.15), q: 2 }, k);
      p.tone(wet, { wave: 'sawtooth', f0: 620, f1: 70, dur: 0.4, gain: 0.08, filter: 'bandpass', filterHz: 700, q: 2 }, k);
      for (let n = 0; n < 3; n++) p.tone(wet, { wave: 'square', f0: rand(1200, 3200), dur: 0.03, gain: 0.03, delay: 0.05 + n * 0.11, pan: rand(-0.8, 0.8) }, k);
      break;
    case 'falseStart':
      // Flooded: an error buzz under the engine's choking cough, and backfires.
      p.tone(wet, { wave: 'square', f0: 116, f1: 92, dur: 0.45, gain: 0.08, filter: 'lowpass', filterHz: 900 }, k);
      for (let n = 0; n < 4; n++) p.noise(dry, { filter: 'lowpass', f0: 1800, f1: 160, dur: 0.12, gain: 0.45, delay: 0.1 + n * rand(0.18, 0.3) }, k);
      break;
    case 'perfectStart':
      // A clean launch: bright rising fifth, a whoosh and sparkles.
      p.tone(wet, { wave: 'triangle', f0: 784, f1: 1175, dur: 0.35, gain: 0.18 }, k);
      p.tone(wet, { wave: 'sine', f0: 1568, dur: 0.5, gain: 0.08, delay: 0.12 }, k);
      p.noise(dry, { filter: 'bandpass', f0: 500, f1: 4000, dur: 0.6, gain: 0.3 }, k);
      for (let n = 0; n < SPARKLES; n++) p.tone(wet, { wave: 'sine', f0: rand(SPARKLE_HZ[0], SPARKLE_HZ[1]), dur: 0.18, gain: 0.04, delay: 0.15 + n * 0.05, pan: rand(-0.9, 0.9) }, k);
      break;
    case 'slingshot':
      // Thrown out of a wake: the air tears past with a rising whoosh, panned off the side it
      // pulled out to, and a faint lifting tone.
      p.noise(dry, { filter: 'bandpass', f0: 700, f1: 3800, dur: 0.55, gain: 0.26, q: 1.2, pan: -0.4, panTo: 0.4 }, k);
      p.tone(wet, { wave: 'sine', f0: 660, f1: 990, dur: 0.4, gain: 0.06 }, k);
      break;
    case 'lap':
      // Glassy two-tone ping, echoing left-right-left down the hall.
      for (let e = 0; e <= LAP_ECHOES; e++) {
        const g = 0.26 * LAP_ECHO_DECAY ** e;
        const pan = e === 0 ? 0 : e % 2 ? -0.7 : 0.7;
        p.tone(wet, { wave: 'triangle', f0: 1320, dur: 0.14, gain: g, delay: e * LAP_ECHO_S, pan }, k);
        p.tone(wet, { wave: 'sine', f0: 1760, dur: 0.3, gain: g * 0.8, delay: e * LAP_ECHO_S + 0.09, pan }, k);
      }
      break;
    case 'finish':
      [523, 659, 784, 1047].forEach((f, n) => p.tone(wet, { wave: 'triangle', f0: f, dur: n === 3 ? 0.9 : 0.2, gain: 0.28, delay: n * 0.11 }, k));
      p.tone(wet, { wave: 'sine', f0: 2093, dur: 1.2, gain: 0.06, delay: 0.33, pan: -0.5, panTo: 0.5 }, k);
      p.noise(wet, { filter: 'highpass', f0: 6000, f1: 10000, dur: 1, gain: 0.05, delay: 0.33, attack: 0.3 }, k);
      break;
    case 'repair':
      // Warm rising major third with a soft shimmer: health back, not boost.
      p.tone(wet, { wave: 'sine', f0: 523, f1: 659, dur: 0.16, gain: 0.3 }, k);
      p.tone(wet, { wave: 'triangle', f0: 784, f1: 1046, dur: 0.24, gain: 0.18, delay: 0.08 }, k);
      p.noise(wet, { filter: 'highpass', f0: 6000, f1: 9000, dur: 0.25, gain: 0.05, delay: 0.05 }, k);
      break;
    case 'wreck':
      // Impact crunch, then the explosion's body and boom, the hull ringing, debris raining down.
      p.noise(dry, { filter: 'bandpass', f0: 2400, f1: 260, dur: 0.35, gain: 0.8 }, k);
      p.tone(dry, { wave: 'sawtooth', f0: 180, f1: 40, dur: 0.5, gain: 0.5, filter: 'lowpass', filterHz: 700 }, k);
      p.noise(dry, { filter: 'lowpass', f0: 3200, f1: 90, dur: 1.9, gain: 0.65, delay: 0.04 }, k);
      p.tone(dry, { wave: 'sine', f0: 78, f1: 22, dur: 1.4, gain: 0.7, delay: 0.03 }, k);
      for (const m of HULL_MODES) p.tone(wet, { wave: 'sine', f0: 180 * m, f1: 170 * m, dur: 1.2, gain: 0.1 / m }, k);
      for (let n = 0; n < WRECK_DEBRIS; n++) {
        const at = 0.3 + Math.random() * WRECK_DEBRIS_SPREAD_S;
        const hz = rand(WRECK_DEBRIS_HZ[0], WRECK_DEBRIS_HZ[1]);
        p.tone(wet, { wave: 'sine', f0: hz, f1: hz * 0.97, dur: 0.09, gain: 0.12 * (1 - at / (WRECK_DEBRIS_SPREAD_S + 0.6)), delay: at, pan: rand(-0.8, 0.8) }, k);
      }
      break;
    case 'click':
      p.tone(dry, { wave: 'square', f0: 1800, f1: 1100, dur: 0.035, gain: 0.08 }, k);
      break;
    case 'buy':
      p.tone(dry, { wave: 'sine', f0: 1320, dur: 0.09, gain: 0.3 }, k);
      p.tone(dry, { wave: 'sine', f0: 1760, dur: 0.3, gain: 0.3, delay: 0.08 }, k);
      p.tone(dry, { wave: 'triangle', f0: 2640, dur: 0.25, gain: 0.08, delay: 0.08 }, k);
      break;
  }
}
