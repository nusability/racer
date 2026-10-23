// Shared synthesis primitives: generated buffers (noise, the reverb impulse), wave shaping
// curves, and the one-shot player every short sound is built from. Nothing here is a sample:
// every buffer is computed at runtime.

/** Seconds of looping noise; long enough that the loop point is never heard as a rhythm. */
export const NOISE_SECONDS = 2;
/** Cap on concurrent one-shot sources (each tone or noise burst is one). */
const MAX_ONE_SHOT_SOURCES = 28;
/** Shortest attack of a one-shot, seconds: shorter than this clicks. */
const MIN_ATTACK_S = 0.004;
/** The default attack is this share of the duration, capped at DEFAULT_ATTACK_S. */
const DEFAULT_ATTACK_SHARE = 0.25;
const DEFAULT_ATTACK_S = 0.01;
/** Exponential ramps cannot reach 0; this is "silent". */
export const SILENT = 0.0001;
/** Sources stop this long after their envelope ends, so the tail is never cut. */
const STOP_PAD_S = 0.05;

/** Everything a sound needs while audio is running: the context, the buses, the noise. */
export interface LiveAudio {
  ctx: BaseAudioContext;
  /** Race sounds: slowed by slow-mo, a little reverb. */
  race: AudioNode;
  /** Race sounds that should sound big and spacey: much more reverb. */
  space: AudioNode;
  /** Straight into the reverb, for loops that crossfade dry against wet by distance. */
  send: AudioNode;
  /** Menu sounds: never slowed. */
  menu: AudioNode;
  shots: ShotPlayer;
  /** Pitch (and inverse stretch) of race sounds at the current slow-mo time scale. */
  pitch: number;
}

export interface ToneShot {
  wave: OscillatorType | PeriodicWave;
  f0: number;
  /** End frequency (exponential glide); defaults to f0. */
  f1?: number;
  dur: number;
  gain: number;
  delay?: number;
  attack?: number;
  /** An optional filter after the oscillator. */
  filter?: BiquadFilterType;
  filterHz?: number;
  q?: number;
  /** Stereo position -1..1; omitted = centre (no panner node). */
  pan?: number;
  /** Pan at the end of the sound, for sounds that fly across. */
  panTo?: number;
}

export interface NoiseShot {
  filter: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  dur: number;
  gain: number;
  delay?: number;
  attack?: number;
  pan?: number;
  panTo?: number;
}

/**
 * Plays short enveloped tones and noise bursts. Counts live sources so a pile-up (a wreck
 * while cells ring) degrades by dropping sounds instead of by stalling the audio thread.
 */
export class ShotPlayer {
  private active = 0;
  private readonly ctx: BaseAudioContext;
  private readonly noiseBuf: AudioBuffer;

  constructor(ctx: BaseAudioContext, noise: AudioBuffer) {
    this.ctx = ctx;
    this.noiseBuf = noise;
  }

  /** Room for `n` more sources. */
  has(n = 1): boolean {
    return this.active + n <= MAX_ONE_SHOT_SOURCES;
  }

  /** `k` is the slow-mo pitch: below 1 the sound drops in pitch and stretches in time. */
  tone(out: AudioNode, s: ToneShot, k = 1): void {
    if (!this.has()) return;
    const ctx = this.ctx;
    const dur = s.dur / k;
    const t = ctx.currentTime + (s.delay ?? 0) / k;
    const o = ctx.createOscillator();
    if (typeof s.wave === 'string') o.type = s.wave;
    else o.setPeriodicWave(s.wave);
    o.frequency.setValueAtTime(s.f0 * k, t);
    if (s.f1 !== undefined && s.f1 !== s.f0) o.frequency.exponentialRampToValueAtTime(s.f1 * k, t + dur);
    let head: AudioNode = o;
    if (s.filter) {
      const f = ctx.createBiquadFilter();
      f.type = s.filter;
      f.frequency.value = (s.filterHz ?? s.f0) * k;
      f.Q.value = s.q ?? 1;
      head = head.connect(f);
    }
    const g = envelope(ctx, t, dur, s.gain, s.attack === undefined ? undefined : s.attack / k);
    head.connect(g).connect(this.panned(out, t, dur, s.pan, s.panTo));
    o.start(t);
    o.stop(t + dur + STOP_PAD_S);
    this.track(o);
  }

  noise(out: AudioNode, s: NoiseShot, k = 1): void {
    if (!this.has()) return;
    const ctx = this.ctx;
    const dur = Math.min(NOISE_SECONDS, s.dur / k);
    const t = ctx.currentTime + (s.delay ?? 0) / k;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = k;
    const f = ctx.createBiquadFilter();
    f.type = s.filter;
    f.Q.value = s.q ?? 1;
    f.frequency.setValueAtTime(s.f0 * k, t);
    if (s.f1 !== undefined && s.f1 !== s.f0) f.frequency.exponentialRampToValueAtTime(s.f1 * k, t + dur);
    const g = envelope(ctx, t, dur, s.gain, s.attack === undefined ? undefined : s.attack / k);
    src.connect(f).connect(g).connect(this.panned(out, t, dur, s.pan, s.panTo));
    src.start(t, Math.random() * Math.max(0, NOISE_SECONDS - dur));
    src.stop(t + dur + STOP_PAD_S);
    this.track(src);
  }

  private panned(out: AudioNode, t: number, dur: number, pan: number | undefined, panTo: number | undefined): AudioNode {
    if (pan === undefined || (pan === 0 && panTo === undefined)) return out;
    const p = this.ctx.createStereoPanner();
    p.pan.setValueAtTime(clampPan(pan), t);
    if (panTo !== undefined) p.pan.linearRampToValueAtTime(clampPan(panTo), t + dur);
    p.connect(out);
    return p;
  }

  private track(node: AudioScheduledSourceNode): void {
    this.active++;
    node.addEventListener('ended', () => this.active--, { once: true });
  }
}

/** Attack then exponential decay: the shape every one-shot uses. */
function envelope(ctx: BaseAudioContext, t: number, dur: number, peak: number, attack?: number): GainNode {
  const a = Math.max(MIN_ATTACK_S, Math.min(attack ?? Math.min(DEFAULT_ATTACK_S, dur * DEFAULT_ATTACK_SHARE), dur * 0.9));
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, t);
  g.gain.exponentialRampToValueAtTime(Math.max(SILENT * 2, peak), t + a);
  g.gain.exponentialRampToValueAtTime(SILENT, t + dur);
  return g;
}

/** White noise; `channels` 2 gives decorrelated left and right for wide ambience. */
export function noiseBuffer(ctx: BaseAudioContext, channels: 1 | 2): AudioBuffer {
  const buf = ctx.createBuffer(channels, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return buf;
}

/** Reverb impulse: length, pre-delay, and how fast the high end dies (one-pole smoothing). */
const IR_SECONDS = 1.6;
const IR_PREDELAY_S = 0.018;
/** Amplitude falls by 60 dB over this long: a large, soft hall rather than a room. */
const IR_RT60_S = 1.4;
const IR_DARKEN = 0.55;
/** Early reflections: a handful of discrete taps that give the space a size. */
const IR_EARLY_TAPS = 7;
const IR_EARLY_SPAN_S = 0.09;

/**
 * A synthetic stereo hall: decorrelated decaying noise per ear (that is what makes it wide),
 * darkening over time, with a few early taps. Generated once; the convolver does the rest.
 */
export function impulseResponse(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * IR_SECONDS);
  const buf = ctx.createBuffer(2, len, rate);
  const pre = Math.floor(rate * IR_PREDELAY_S);
  // ln(1000) = 60 dB.
  const decay = Math.log(1000) / IR_RT60_S;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / rate;
      // The filter closes as the tail ages: high frequencies die first, as in a real hall.
      const smooth = IR_DARKEN * Math.min(1, t / IR_RT60_S) + 0.05;
      lp += (Math.random() * 2 - 1 - lp) * (1 - smooth);
      d[i] = lp * Math.exp(-decay * t);
    }
    for (let k = 0; k < IR_EARLY_TAPS; k++) {
      const at = pre + Math.floor(Math.random() * IR_EARLY_SPAN_S * rate);
      d[at] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - k * 0.05);
    }
  }
  return buf;
}

/** tanh soft clip with the given drive: warmth without hard digital edges. */
export function softClipCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

/** Amplitude quantised to a few steps: the bit-crush grit of a failing engine. */
export function crushCurve(steps: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

/** A periodic wave from harmonic amplitudes (index 0 = the fundamental), cached per context. */
const waveCache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
export function harmonicWave(ctx: BaseAudioContext, amps: readonly number[]): PeriodicWave {
  let m = waveCache.get(ctx);
  if (!m) waveCache.set(ctx, (m = new Map()));
  const key = amps.join(',');
  const hit = m.get(key);
  if (hit) return hit;
  const real = new Float32Array(amps.length + 1);
  const imag = new Float32Array(amps.length + 1);
  amps.forEach((a, i) => (imag[i + 1] = a));
  const w = ctx.createPeriodicWave(real, imag);
  m.set(key, w);
  return w;
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampPan(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
