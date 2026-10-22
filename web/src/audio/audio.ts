// All game sound, synthesised with WebAudio (no asset files). Before unlock() runs inside a user
// gesture there is no AudioContext, so every call is a no-op until then.

export type OneShotName =
  | 'countdown'
  | 'go'
  | 'boostStart'
  | 'boostPad'
  | 'scrape'
  | 'hit'
  | 'crash'
  | 'land'
  | 'pickup'
  | 'tankEmpty'
  | 'lap'
  | 'finish'
  | 'click'
  | 'buy';

export interface EngineView {
  speed: number;
  topSpeed: number;
  boosting: boolean;
  airborne: boolean;
}

const MASTER_GAIN = 0.8;
/** Engine fundamental at rest and its rise at top speed, Hz. */
const ENGINE_BASE_HZ = 48;
const ENGINE_RANGE_HZ = 150;
/** Pitch lift while boosting, and while airborne (an unloaded engine revs up). */
const ENGINE_BOOST_PITCH = 1.12;
const ENGINE_AIR_PITCH = 1.08;
const ENGINE_CUTOFF_BASE_HZ = 380;
const ENGINE_CUTOFF_RANGE_HZ = 2600;
const ENGINE_CUTOFF_BOOST_HZ = 1800;
/** Engine parameters are retargeted at most this often; per-frame retargeting buys nothing audible. */
const ENGINE_UPDATE_S = 0.03;
/** Smoothing time constant for continuous parameters, seconds. */
const SMOOTH_S = 0.06;
/** Cap on concurrent one-shot voices, and the minimum gap between repeats of the same sound. */
const MAX_ONE_SHOTS = 24;
const ONE_SHOT_REPEAT_S = 0.04;
const NOISE_SECONDS = 2;
/** Pickups closer together than this climb the scale, so a line of cells rings upward. */
const PICKUP_CHAIN_S = 0.6;
/** Pickup chime pitch: base frequency, semitone step per chained cell, and the cap on steps. */
const PICKUP_BASE_HZ = 880;
const PICKUP_STEP_SEMITONES = 2;
const PICKUP_MAX_STEPS = 12;

interface EngineVoice {
  oscs: OscillatorNode[];
  whine: OscillatorNode;
  noise: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  body: GainNode;
  whineGain: GainNode;
  roar: GainNode;
  roarFilter: BiquadFilterNode;
  out: GainNode;
  lastUpdate: number;
}

interface NoiseLoop {
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private enabled = true;
  private engineVoice: EngineVoice | null = null;
  private windLoop: NoiseLoop | null = null;
  private scrape: NoiseLoop | null = null;
  private activeShots = 0;
  private lastShot = new Map<OneShotName, number>();
  private pickupChain = 0;
  private lastPickup = -1;

  /** Call from a user gesture (the title tap): browsers only start audio inside one. */
  unlock(): void {
    if (this.ctx) {
      this.applyState();
      return;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = this.enabled ? MASTER_GAIN : 0;
    master.connect(comp);
    const buf = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.ctx = ctx;
    this.master = master;
    this.noiseBuf = buf;
    document.addEventListener('visibilitychange', () => this.applyState());
    this.applyState();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.applyState();
  }

  /** Runs when enabled and the page is visible; suspended otherwise so nothing burns CPU. */
  private applyState(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const run = this.enabled && !document.hidden;
    this.master.gain.setTargetAtTime(this.enabled ? MASTER_GAIN : 0, ctx.currentTime, 0.02);
    const p = run ? ctx.resume() : ctx.suspend();
    p.catch((err: unknown) => console.error('[audio] Could not change the audio context state', err));
  }

  private live(): { ctx: AudioContext; out: GainNode; noise: AudioBuffer } | null {
    if (!this.ctx || !this.master || !this.noiseBuf || !this.enabled || this.ctx.state !== 'running') return null;
    return { ctx: this.ctx, out: this.master, noise: this.noiseBuf };
  }

  // --- Continuous sounds --------------------------------------------------------------------

  engine(view: EngineView): void {
    const a = this.live();
    if (!a) return;
    const v = (this.engineVoice ??= this.buildEngine(a.ctx, a.out, a.noise));
    const t = a.ctx.currentTime;
    if (t - v.lastUpdate < ENGINE_UPDATE_S) return;
    v.lastUpdate = t;
    const r = Math.max(0, view.speed / view.topSpeed);
    const pitch = (view.boosting ? ENGINE_BOOST_PITCH : 1) * (view.airborne ? ENGINE_AIR_PITCH : 1);
    const f = (ENGINE_BASE_HZ + ENGINE_RANGE_HZ * Math.min(r, 1.4)) * pitch;
    v.oscs[0].frequency.setTargetAtTime(f, t, SMOOTH_S);
    v.oscs[1].frequency.setTargetAtTime(f * 1.006, t, SMOOTH_S);
    v.oscs[2].frequency.setTargetAtTime(f * 0.5, t, SMOOTH_S);
    v.whine.frequency.setTargetAtTime(f * 6.02, t, SMOOTH_S);
    let cutoff = ENGINE_CUTOFF_BASE_HZ + ENGINE_CUTOFF_RANGE_HZ * Math.min(r, 1.2) + (view.boosting ? ENGINE_CUTOFF_BOOST_HZ : 0);
    if (view.airborne) cutoff *= 0.55;
    v.filter.frequency.setTargetAtTime(cutoff, t, SMOOTH_S);
    v.body.gain.setTargetAtTime(view.airborne ? 0.18 : 0.32, t, SMOOTH_S);
    v.whineGain.gain.setTargetAtTime(0.02 + 0.06 * Math.min(r, 1), t, SMOOTH_S);
    v.roar.gain.setTargetAtTime((view.boosting ? 0.5 : 0.08 + 0.12 * Math.min(r, 1)) * (view.airborne ? 0.4 : 1), t, SMOOTH_S);
    v.roarFilter.frequency.setTargetAtTime(view.boosting ? 1400 : 700, t, SMOOTH_S);
  }

  private buildEngine(ctx: AudioContext, out: GainNode, noise: AudioBuffer): EngineVoice {
    const voiceOut = ctx.createGain();
    voiceOut.gain.value = 0.9;
    voiceOut.connect(out);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 5;
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve();
    const body = ctx.createGain();
    body.gain.value = 0;
    filter.connect(shaper).connect(body).connect(voiceOut);
    const oscs = [0, 1, 2].map(() => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = ENGINE_BASE_HZ;
      o.connect(filter);
      o.start();
      return o;
    });
    // The podracer whine: a high partial with a slow wobble.
    const whine = ctx.createOscillator();
    whine.type = 'triangle';
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0;
    whine.connect(whineGain).connect(voiceOut);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 9;
    lfo.connect(lfoDepth).connect(whine.frequency);
    lfo.start();
    whine.start();
    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = 'bandpass';
    roarFilter.Q.value = 0.8;
    const roar = ctx.createGain();
    roar.gain.value = 0;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.connect(roarFilter).connect(roar).connect(voiceOut);
    src.start();
    return { oscs: [...oscs, lfo], whine, noise: src, filter, body, whineGain, roar, roarFilter, out: voiceOut, lastUpdate: -1 };
  }

  private noiseLoop(ctx: AudioContext, out: GainNode, noise: AudioBuffer, type: BiquadFilterType, q: number): NoiseLoop {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(out);
    // Random offset so the wind and scrape loops don't play the same noise in phase.
    src.start(0, Math.random() * NOISE_SECONDS);
    return { src, filter, gain };
  }

  wind(intensity: number): void {
    const a = this.live();
    if (!a) return;
    const w = (this.windLoop ??= this.noiseLoop(a.ctx, a.out, a.noise, 'bandpass', 0.6));
    const i = clamp01(intensity);
    w.filter.frequency.setTargetAtTime(300 + 1800 * i, a.ctx.currentTime, 0.15);
    w.gain.gain.setTargetAtTime(0.22 * i * i, a.ctx.currentTime, 0.15);
  }

  /** Continuous wall scrape; 0 stops it. */
  scrapeLoop(intensity: number): void {
    const a = this.live();
    if (!a) return;
    if (intensity <= 0 && !this.scrape) return;
    const s = (this.scrape ??= this.noiseLoop(a.ctx, a.out, a.noise, 'bandpass', 2.5));
    const i = clamp01(intensity);
    s.filter.frequency.setTargetAtTime(2200 + 2200 * i, a.ctx.currentTime, 0.03);
    s.gain.gain.setTargetAtTime(0.45 * i, a.ctx.currentTime, 0.03);
  }

  stopRaceSounds(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const stopAt = t + 0.25;
    if (this.engineVoice) {
      const v = this.engineVoice;
      v.out.gain.setTargetAtTime(0, t, 0.06);
      for (const o of [...v.oscs, v.whine]) o.stop(stopAt);
      v.noise.stop(stopAt);
      this.engineVoice = null;
    }
    for (const loop of [this.windLoop, this.scrape]) {
      if (!loop) continue;
      loop.gain.gain.setTargetAtTime(0, t, 0.06);
      loop.src.stop(stopAt);
    }
    this.windLoop = null;
    this.scrape = null;
  }

  // --- One-shots ------------------------------------------------------------------------------

  /** A short doppler swoosh as a rival passes; pan -1 (left) .. 1 (right). */
  opponentPass(pan: number, intensity: number): void {
    const a = this.live();
    if (!a || this.activeShots >= MAX_ONE_SHOTS) return;
    const panner = a.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(a.out);
    this.tone(a.ctx, panner, 'sawtooth', 260, 150, 0.6, 0.18 * clamp01(intensity), 0, 1200);
    this.noise(a.ctx, panner, a.noise, 0.5, 'bandpass', 900, 500, 0.2 * clamp01(intensity), 0);
  }

  oneShot(name: OneShotName, intensity = 1): void {
    const a = this.live();
    if (!a || this.activeShots >= MAX_ONE_SHOTS) return;
    const t = a.ctx.currentTime;
    // A line of cells is collected faster than the repeat gate, and each one should ring.
    if (name !== 'pickup' && t - (this.lastShot.get(name) ?? -1) < ONE_SHOT_REPEAT_S) return;
    this.lastShot.set(name, t);
    const { ctx, out, noise } = a;
    const k = clamp01(intensity);
    switch (name) {
      case 'countdown':
        this.tone(ctx, out, 'square', 520, 520, 0.16, 0.22, 0);
        break;
      case 'go':
        this.tone(ctx, out, 'square', 1040, 1040, 0.5, 0.22, 0);
        this.tone(ctx, out, 'sawtooth', 520, 530, 0.5, 0.12, 0, 3000);
        break;
      case 'boostStart':
        this.noise(ctx, out, noise, 0.7, 'bandpass', 400, 3200, 0.6, 0);
        this.tone(ctx, out, 'sawtooth', 70, 170, 0.45, 0.35, 0, 900);
        break;
      case 'boostPad':
        this.tone(ctx, out, 'sawtooth', 300, 1400, 0.35, 0.22, 0, 4000);
        this.tone(ctx, out, 'square', 600, 2800, 0.3, 0.08, 0.04);
        break;
      case 'scrape':
        this.noise(ctx, out, noise, 0.18, 'highpass', 2600, 1800, 0.4 * k, 0);
        break;
      case 'hit':
        this.tone(ctx, out, 'sine', 150, 38, 0.32, 0.9 * k, 0);
        this.noise(ctx, out, noise, 0.16, 'lowpass', 1400, 300, 0.6 * k, 0);
        break;
      case 'crash':
        this.noise(ctx, out, noise, 1.5, 'lowpass', 2400, 160, 1, 0);
        this.tone(ctx, out, 'sine', 95, 28, 1, 1, 0);
        this.noise(ctx, out, noise, 0.6, 'bandpass', 3000, 800, 0.35, 0.12);
        break;
      case 'land':
        this.tone(ctx, out, 'sine', 115, 42, 0.24, 0.75 * k, 0);
        this.noise(ctx, out, noise, 0.12, 'lowpass', 700, 200, 0.5 * k, 0);
        break;
      case 'pickup': {
        this.pickupChain = t - this.lastPickup < PICKUP_CHAIN_S ? Math.min(PICKUP_MAX_STEPS, this.pickupChain + 1) : 0;
        this.lastPickup = t;
        const f = PICKUP_BASE_HZ * 2 ** ((this.pickupChain * PICKUP_STEP_SEMITONES) / 12);
        this.tone(ctx, out, 'triangle', f, f * 1.5, 0.12, 0.28, 0);
        this.tone(ctx, out, 'sine', f * 2, f * 2, 0.18, 0.12, 0.03);
        break;
      }
      case 'tankEmpty':
        for (let i = 0; i < 3; i++) this.noise(ctx, out, noise, 0.07, 'bandpass', 500 - i * 120, 260, 0.22 - i * 0.05, i * 0.09);
        this.tone(ctx, out, 'sawtooth', 120, 60, 0.3, 0.1, 0, 500);
        break;
      case 'lap':
        this.tone(ctx, out, 'triangle', 880, 880, 0.12, 0.3, 0);
        this.tone(ctx, out, 'triangle', 1320, 1320, 0.28, 0.3, 0.1);
        break;
      case 'finish':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(ctx, out, 'triangle', f, f, i === 3 ? 0.6 : 0.18, 0.32, i * 0.11));
        break;
      case 'click':
        this.tone(ctx, out, 'square', 1800, 1100, 0.035, 0.08, 0);
        break;
      case 'buy':
        this.tone(ctx, out, 'sine', 1320, 1320, 0.09, 0.3, 0);
        this.tone(ctx, out, 'sine', 1760, 1760, 0.3, 0.3, 0.08);
        this.tone(ctx, out, 'triangle', 2640, 2640, 0.25, 0.08, 0.08);
        break;
    }
  }

  private track(node: AudioScheduledSourceNode): void {
    this.activeShots++;
    node.addEventListener('ended', () => this.activeShots--, { once: true });
  }

  private tone(ctx: AudioContext, out: AudioNode, type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay: number, lowpass?: number): void {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = envelope(ctx, t, dur, gain);
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      o.connect(f).connect(g).connect(out);
    } else {
      o.connect(g).connect(out);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
    this.track(o);
  }

  private noise(ctx: AudioContext, out: AudioNode, buf: AudioBuffer, dur: number, type: BiquadFilterType, f0: number, f1: number, gain: number, delay: number): void {
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = envelope(ctx, t, dur, gain);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * Math.max(0, NOISE_SECONDS - dur));
    src.stop(t + dur + 0.05);
    this.track(src);
  }
}

/** Fast attack, exponential decay: the shape every one-shot uses. */
function envelope(ctx: AudioContext, t: number, dur: number, peak: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.min(0.01, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(2.2 * x);
  }
  return curve;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
