// One-shot cues the world makes: hazard warnings and strikes (a beast's roar, a ship's horn,
// an avalanche rumble), crowd cheers as you pass, and the random life of each biome (gulls,
// ice creaks). Each is played at a gain and pan the environment works out from distance.

import type { ShotPlayer } from './synth.ts';

export type CueName =
  | 'roar'
  | 'horn'
  | 'clank'
  | 'rumble'
  | 'whistle'
  | 'impact'
  | 'splash'
  | 'song'
  | 'crack'
  | 'creak'
  | 'jet'
  | 'stomp'
  | 'cheer'
  | 'gull'
  | 'liftoff'
  | 'gust'
  | 'hiss'
  | 'tick'
  | 'honk'
  | 'siren'
  | 'buzz'
  | 'chime'
  | 'whoosh'
  | 'clang'
  | 'collapse'
  | 'birdsong'
  | 'woodcreak'
  | 'call'
  | 'crash'
  | 'hooves'
  | 'snap'
  | 'logland'
  | 'leaves';

/** A distant siren's wail: rise-fall cycles and their length, seconds. */
const SIREN_CYCLES = 3;
const SIREN_CYCLE_S = 0.9;
/** A transit chime: three falling notes (Hz), this far apart. */
const CHIME_NOTES = [988, 784, 659];
const CHIME_GAP_S = 0.28;
/** A bird's phrase: notes, their length and gap (s), and the pitch range they wander (Hz). */
const BIRD_NOTES = 5;
const BIRD_NOTE_S = 0.09;
const BIRD_GAP_S = 0.12;
const BIRD_HZ: readonly [number, number] = [2600, 4200];
/** Hoofbeats in a hooves cue: a light four-beat gallop phrase, twice. */
const HOOF_BEATS = 8;
const HOOF_GAP_S = 0.16;
/** Footfalls in a stomp cue, and the gap between them, seconds. */
const STOMP_STEPS = 3;
const STOMP_GAP_S = 0.42;

/** Plays `name` into `out` at gain `g` (0..1), pan -1..1, slow-mo pitch `k`. */
export function playCue(p: ShotPlayer, out: AudioNode, name: CueName, g: number, pan: number, k: number): void {
  switch (name) {
    case 'roar':
      // A throat, not a synth: a falling saw through a low-pass, and a growling noise band.
      p.tone(out, { wave: 'sawtooth', f0: 150, f1: 55, dur: 1.7, gain: 0.5 * g, attack: 0.25, filter: 'lowpass', filterHz: 900, q: 3, pan }, k);
      p.noise(out, { filter: 'bandpass', f0: 650, f1: 240, q: 4, dur: 1.5, gain: 0.7 * g, attack: 0.2, pan }, k);
      break;
    case 'horn':
      // Two detuned saws: a big ship's horn beating against itself.
      p.tone(out, { wave: 'sawtooth', f0: 98, dur: 1.9, gain: 0.32 * g, attack: 0.12, filter: 'lowpass', filterHz: 700, pan }, k);
      p.tone(out, { wave: 'sawtooth', f0: 104, dur: 1.9, gain: 0.26 * g, attack: 0.15, filter: 'lowpass', filterHz: 600, pan }, k);
      break;
    case 'clank':
      p.tone(out, { wave: 'square', f0: 130, f1: 80, dur: 0.18, gain: 0.25 * g, filter: 'lowpass', filterHz: 1500, pan }, k);
      p.noise(out, { filter: 'highpass', f0: 3200, dur: 0.09, gain: 0.3 * g, pan }, k);
      break;
    case 'rumble':
      // Swells in slowly: you hear the avalanche before you can place it.
      p.noise(out, { filter: 'lowpass', f0: 420, f1: 110, dur: 2.3, gain: 0.9 * g, attack: 0.8, pan }, k);
      p.tone(out, { wave: 'sine', f0: 46, f1: 30, dur: 2.3, gain: 0.5 * g, attack: 0.7, pan }, k);
      break;
    case 'whistle':
      p.tone(out, { wave: 'sine', f0: 2300, f1: 520, dur: 1.3, gain: 0.12 * g, attack: 0.1, pan }, k);
      break;
    case 'impact':
      p.tone(out, { wave: 'sine', f0: 100, f1: 32, dur: 0.45, gain: 0.8 * g, pan }, k);
      p.noise(out, { filter: 'lowpass', f0: 1300, f1: 200, dur: 0.3, gain: 0.6 * g, pan }, k);
      break;
    case 'splash':
      p.noise(out, { filter: 'bandpass', f0: 2200, f1: 300, q: 0.7, dur: 1.1, gain: 0.7 * g, attack: 0.04, pan }, k);
      p.noise(out, { filter: 'lowpass', f0: 600, dur: 0.6, gain: 0.5 * g, pan }, k);
      break;
    case 'song':
      // A whale call: slow rising glide, then an answer falling away.
      p.tone(out, { wave: 'sine', f0: 210, f1: 420, dur: 1.8, gain: 0.3 * g, attack: 0.5, pan }, k);
      p.tone(out, { wave: 'sine', f0: 330, f1: 260, dur: 1.4, gain: 0.2 * g, attack: 0.4, delay: 1.1, pan }, k);
      break;
    case 'crack':
      p.noise(out, { filter: 'highpass', f0: 2500, dur: 0.12, gain: 0.6 * g, pan }, k);
      p.tone(out, { wave: 'sine', f0: 72, f1: 28, dur: 0.9, gain: 0.7 * g, pan }, k);
      p.noise(out, { filter: 'lowpass', f0: 900, f1: 140, dur: 1.3, gain: 0.6 * g, delay: 0.05, pan }, k);
      break;
    case 'creak':
      // A slow pulse train through a narrow resonance: ice under strain.
      p.tone(out, { wave: 'square', f0: 34 + Math.random() * 10, f1: 52 + Math.random() * 14, dur: 0.7, gain: 0.35 * g, attack: 0.15, filter: 'bandpass', filterHz: 700 + Math.random() * 500, q: 9, pan }, k);
      break;
    case 'jet':
      p.noise(out, { filter: 'bandpass', f0: 400, f1: 2800, q: 0.9, dur: 1.6, gain: 0.6 * g, attack: 0.6, pan: -pan, panTo: pan }, k);
      p.tone(out, { wave: 'sawtooth', f0: 90, f1: 190, dur: 1.6, gain: 0.15 * g, attack: 0.6, filter: 'lowpass', filterHz: 1200, pan }, k);
      break;
    case 'stomp':
      for (let i = 0; i < STOMP_STEPS; i++) {
        p.tone(out, { wave: 'sine', f0: 62, f1: 28, dur: 0.32, gain: 0.8 * g, delay: i * STOMP_GAP_S, pan }, k);
        p.noise(out, { filter: 'lowpass', f0: 320, dur: 0.2, gain: 0.5 * g, delay: i * STOMP_GAP_S, pan }, k);
      }
      break;
    case 'cheer':
      p.noise(out, { filter: 'bandpass', f0: 1000, f1: 1300, q: 0.9, dur: 1.7, gain: 0.55 * g, attack: 0.35, pan: pan * 1.2, panTo: -pan }, k);
      p.noise(out, { filter: 'bandpass', f0: 2600, q: 3, dur: 1.2, gain: 0.25 * g, attack: 0.3, delay: 0.15, pan }, k);
      break;
    case 'gull':
      p.tone(out, { wave: 'triangle', f0: 2300, f1: 1500, dur: 0.22, gain: 0.08 * g, pan }, k);
      p.tone(out, { wave: 'triangle', f0: 2100, f1: 1350, dur: 0.3, gain: 0.07 * g, delay: 0.3, pan }, k);
      break;
    case 'liftoff':
      p.noise(out, { filter: 'lowpass', f0: 1000, f1: 200, dur: 2.5, gain: 0.9 * g, attack: 0.4, pan }, k);
      p.tone(out, { wave: 'sine', f0: 42, f1: 34, dur: 2.5, gain: 0.5 * g, attack: 0.4, pan }, k);
      break;
    case 'gust':
      p.noise(out, { filter: 'bandpass', f0: 300, f1: 1500, q: 1.2, dur: 1.3, gain: 0.5 * g, attack: 0.5, pan: -pan, panTo: pan }, k);
      break;
    case 'hiss':
      p.noise(out, { filter: 'highpass', f0: 3000, f1: 1800, dur: 1.4, gain: 0.12 * g, attack: 0.5, pan: -pan, panTo: pan }, k);
      break;
    case 'tick':
      // A tinkle of ice: two quick high pings.
      p.tone(out, { wave: 'sine', f0: 3800 + Math.random() * 2000, dur: 0.08, gain: 0.05 * g, pan }, k);
      p.tone(out, { wave: 'sine', f0: 4200 + Math.random() * 2000, dur: 0.1, gain: 0.04 * g, delay: 0.07, pan: -pan }, k);
      break;
    case 'honk':
      // Two cars somewhere down the block: short square blasts through a box-like resonance.
      p.tone(out, { wave: 'square', f0: 392, dur: 0.22, gain: 0.07 * g, filter: 'bandpass', filterHz: 900, q: 2, pan }, k);
      p.tone(out, { wave: 'square', f0: 466, dur: 0.35, gain: 0.06 * g, delay: 0.3, filter: 'bandpass', filterHz: 1000, q: 2, pan: -pan * 0.5 }, k);
      break;
    case 'siren':
      for (let i = 0; i < SIREN_CYCLES; i++) {
        p.tone(out, { wave: 'triangle', f0: 620, f1: 980, dur: SIREN_CYCLE_S / 2, gain: 0.05 * g, delay: i * SIREN_CYCLE_S, pan }, k);
        p.tone(out, { wave: 'triangle', f0: 980, f1: 620, dur: SIREN_CYCLE_S / 2, gain: 0.05 * g, delay: i * SIREN_CYCLE_S + SIREN_CYCLE_S / 2, pan }, k);
      }
      break;
    case 'buzz':
      // A neon tube arcing: a mains-hum saw crackling through a narrow band.
      p.tone(out, { wave: 'sawtooth', f0: 120, dur: 0.45, gain: 0.1 * g, filter: 'bandpass', filterHz: 2400, q: 4, pan }, k);
      p.noise(out, { filter: 'highpass', f0: 4000, dur: 0.12, gain: 0.12 * g, delay: 0.1, pan }, k);
      break;
    case 'chime':
      CHIME_NOTES.forEach((f0, i) => p.tone(out, { wave: 'sine', f0, dur: 0.6, gain: 0.14 * g, delay: i * CHIME_GAP_S, pan }, k));
      break;
    case 'whoosh':
      // A maglev going by: a rising then falling air rush and a glassy linear-motor whine.
      p.noise(out, { filter: 'bandpass', f0: 500, f1: 2600, q: 0.8, dur: 1.4, gain: 0.7 * g, attack: 0.5, pan: -pan, panTo: pan }, k);
      p.tone(out, { wave: 'sine', f0: 1200, f1: 600, dur: 1.4, gain: 0.08 * g, attack: 0.4, pan: -pan, panTo: pan }, k);
      break;
    case 'clang':
      // Steel on asphalt: inharmonic ringing partials over a thud.
      p.tone(out, { wave: 'sine', f0: 90, f1: 40, dur: 0.4, gain: 0.6 * g, pan }, k);
      p.tone(out, { wave: 'triangle', f0: 523, dur: 1.2, gain: 0.12 * g, pan }, k);
      p.tone(out, { wave: 'triangle', f0: 1397, dur: 0.9, gain: 0.07 * g, pan }, k);
      p.noise(out, { filter: 'highpass', f0: 2600, dur: 0.15, gain: 0.35 * g, pan }, k);
      break;
    case 'birdsong': {
      // A wandering phrase of short whistled notes, each gliding up or down.
      let f = BIRD_HZ[0] + Math.random() * (BIRD_HZ[1] - BIRD_HZ[0]);
      for (let i = 0; i < BIRD_NOTES; i++) {
        const next = BIRD_HZ[0] + Math.random() * (BIRD_HZ[1] - BIRD_HZ[0]);
        p.tone(out, { wave: 'sine', f0: f, f1: next, dur: BIRD_NOTE_S, gain: 0.05 * g, delay: i * BIRD_GAP_S, pan }, k);
        f = next;
      }
      break;
    }
    case 'woodcreak':
      // A great trunk under load: a slow, rough groan through a woody resonance, bending in pitch.
      p.tone(out, { wave: 'sawtooth', f0: 70 + Math.random() * 20, f1: 46 + Math.random() * 12, dur: 1.4, gain: 0.3 * g, attack: 0.3, filter: 'bandpass', filterHz: 380 + Math.random() * 200, q: 6, pan }, k);
      p.tone(out, { wave: 'square', f0: 23, f1: 31, dur: 1.2, gain: 0.12 * g, attack: 0.2, delay: 0.2, filter: 'lowpass', filterHz: 600, pan }, k);
      break;
    case 'call':
      // Something large and gentle calling through the trees: a long rising hoot and a falling answer.
      p.tone(out, { wave: 'triangle', f0: 180, f1: 310, dur: 1.1, gain: 0.16 * g, attack: 0.35, filter: 'lowpass', filterHz: 1400, pan }, k);
      p.tone(out, { wave: 'triangle', f0: 290, f1: 150, dur: 1.3, gain: 0.12 * g, attack: 0.3, delay: 0.9, filter: 'lowpass', filterHz: 1200, pan: -pan * 0.5 }, k);
      break;
    case 'crash':
      // A giant coming down: the trunk splitting, a rushing roar of crown and leaves, the ground shaking.
      p.noise(out, { filter: 'highpass', f0: 2600, dur: 0.18, gain: 0.55 * g, pan }, k);
      p.noise(out, { filter: 'bandpass', f0: 2400, f1: 600, q: 0.6, dur: 2.2, gain: 0.7 * g, attack: 0.15, delay: 0.1, pan }, k);
      p.tone(out, { wave: 'sine', f0: 60, f1: 26, dur: 1.8, gain: 0.85 * g, delay: 0.55, pan }, k);
      p.noise(out, { filter: 'lowpass', f0: 500, f1: 90, dur: 2, gain: 0.7 * g, delay: 0.55, pan }, k);
      break;
    case 'hooves':
      for (let i = 0; i < HOOF_BEATS; i++) {
        const beat = i * HOOF_GAP_S + (i % 4 === 3 ? 0.08 : 0);
        p.tone(out, { wave: 'sine', f0: 90, f1: 45, dur: 0.12, gain: 0.45 * g, delay: beat, pan }, k);
        p.noise(out, { filter: 'bandpass', f0: 900, q: 1.5, dur: 0.06, gain: 0.18 * g, delay: beat, pan }, k);
      }
      break;
    case 'snap':
      // A log jam letting go: a sharp crack of timber and the first knock of a log rolling.
      p.noise(out, { filter: 'highpass', f0: 1800, dur: 0.1, gain: 0.6 * g, pan }, k);
      p.tone(out, { wave: 'triangle', f0: 180, f1: 90, dur: 0.25, gain: 0.35 * g, delay: 0.05, pan }, k);
      p.noise(out, { filter: 'lowpass', f0: 400, f1: 120, dur: 1.6, gain: 0.55 * g, attack: 0.4, delay: 0.2, pan }, k);
      break;
    case 'logland':
      // A log hitting the trail: a hollow wooden knock over a thud.
      p.tone(out, { wave: 'sine', f0: 85, f1: 38, dur: 0.4, gain: 0.7 * g, pan }, k);
      p.tone(out, { wave: 'triangle', f0: 240, f1: 170, dur: 0.22, gain: 0.25 * g, pan }, k);
      p.noise(out, { filter: 'lowpass', f0: 900, f1: 200, dur: 0.35, gain: 0.45 * g, pan }, k);
      break;
    case 'leaves':
      // A gust tearing through the canopy: a rising rush of leaves sweeping across.
      p.noise(out, { filter: 'bandpass', f0: 1200, f1: 3200, q: 0.7, dur: 1.6, gain: 0.5 * g, attack: 0.6, pan: -pan, panTo: pan }, k);
      p.noise(out, { filter: 'lowpass', f0: 350, dur: 1.4, gain: 0.35 * g, attack: 0.5, pan }, k);
      break;
    case 'collapse':
      // A facade coming down: a crack, then masonry thundering on for seconds.
      p.noise(out, { filter: 'highpass', f0: 2200, dur: 0.15, gain: 0.5 * g, pan }, k);
      p.noise(out, { filter: 'lowpass', f0: 1200, f1: 160, dur: 2.6, gain: 0.95 * g, attack: 0.1, delay: 0.1, pan }, k);
      p.tone(out, { wave: 'sine', f0: 55, f1: 30, dur: 2.2, gain: 0.6 * g, delay: 0.15, pan }, k);
      break;
  }
}
