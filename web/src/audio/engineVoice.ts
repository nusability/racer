// The player's engine: one persistent graph per race (no per-frame nodes), retuned from the
// craft's state. Layers: a stereo fan whine, a turbine body with a sub, an amplitude pulse
// (each glider's character), jet/boost noise and the air cushion over the ground. A gate and
// a bit-crusher at the end make the stutter when boost dies or the engine floods at the start.

import type { RacerStyle } from '../core/types.ts';
import { ENGINE_RECIPES, SURFACE_RECIPES, type EngineRecipe, type EngineSurface } from './engineRecipes.ts';
import { crushCurve, harmonicWave, softClipCurve } from './synth.ts';

export interface EngineView {
  speed: number;
  topSpeed: number;
  boosting: boolean;
  airborne: boolean;
  /** The player's glider style: picks the voice. */
  style: RacerStyle;
  /** What the cushion rides on. */
  surface: EngineSurface;
}

export type StutterKind = 'tankEmpty' | 'falseStart';

/** Speed ratio cap: boost can push past top speed, and the pitch keeps climbing a little. */
const MAX_RATIO = 1.4;
/** An unloaded engine in the air revs up while the cushion falls silent. */
const AIR_PITCH = 1.08;
const AIR_BODY = 0.55;
const AIR_CUTOFF = 0.55;
/** Smoothing time constant for continuous parameters, seconds. */
const SMOOTH_S = 0.06;
/** The cushion swells this much, for this long, when the ground under it changes. */
const SURFACE_SPLASH = 2.6;
const SURFACE_SPLASH_S = 0.22;
/** Steps of the bit-crusher's quantiser: few enough to sound broken. */
const CRUSH_STEPS = 5;
/** Tremolo rate while stuttering, Hz: a fast flutter over the gaps. */
const STUTTER_TREM_HZ = 26;
/** Gate smoothing, seconds: hard enough to sound like cuts, soft enough not to click. */
const GATE_SMOOTH_S = 0.004;

/**
 * Stutter patterns: [seconds, gate level, crush 0..1] segments, played with ±STUTTER_JITTER
 * timing jitter so no two cut-outs are alike. tankEmpty sputters and recovers in about a
 * second; falseStart coughs and chokes for longer, deeper.
 */
const STUTTER: Record<StutterKind, { segments: [number, number, number][]; sag: number }> = {
  tankEmpty: {
    segments: [
      [0.05, 0.08, 1], [0.07, 1, 0.7], [0.04, 0.03, 1], [0.08, 0.85, 0.5], [0.03, 0, 1],
      [0.11, 0.8, 0.35], [0.05, 0.12, 0.9], [0.13, 0.9, 0.25], [0.04, 0.25, 0.6], [0.22, 1, 0.1],
    ],
    sag: 0.22,
  },
  falseStart: {
    segments: [
      [0.14, 0.04, 1], [0.08, 0.7, 0.8], [0.2, 0.02, 1], [0.07, 0.6, 0.9], [0.26, 0.05, 1],
      [0.06, 0.8, 0.6], [0.12, 0.1, 0.9], [0.18, 0.75, 0.4], [0.08, 0.3, 0.6], [0.3, 1, 0.1],
    ],
    sag: 0.4,
  },
};
const STUTTER_JITTER = 0.3;

export class EngineVoice {
  readonly style: RacerStyle;
  private readonly ctx: BaseAudioContext;
  private readonly r: EngineRecipe;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly out: GainNode;
  private readonly whineL: OscillatorNode;
  private readonly whineR: OscillatorNode;
  private readonly whineGain: GainNode;
  private readonly vibDepth: GainNode;
  private readonly body: OscillatorNode;
  private readonly sub: OscillatorNode;
  private readonly bodyFilter: BiquadFilterNode;
  private readonly bodyGain: GainNode;
  private readonly subGain: GainNode;
  private readonly pulse: OscillatorNode;
  private readonly pulseDepth: GainNode;
  private readonly trem: GainNode;
  private readonly gate: GainNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly jetFilter: BiquadFilterNode;
  private readonly jetGain: GainNode;
  private readonly cushionFilter: BiquadFilterNode;
  private readonly cushionGain: GainNode;
  private surface: EngineSurface | null = null;
  private splashUntil = -1;
  private stutterFrom = -1;
  private stutterUntil = -1;
  private stutterSag = 0;

  constructor(ctx: BaseAudioContext, dest: AudioNode, noise: AudioBuffer, style: RacerStyle) {
    this.ctx = ctx;
    this.style = style;
    const r = (this.r = ENGINE_RECIPES[style]);
    const gain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const osc = (type: OscillatorType | PeriodicWave, hz: number) => {
      const o = ctx.createOscillator();
      if (typeof type === 'string') o.type = type;
      else o.setPeriodicWave(type);
      o.frequency.value = hz;
      this.sources.push(o);
      return o;
    };

    this.out = gain(r.level);
    this.out.connect(dest);
    // Gate → (dry | crusher) → out. Everything the engine makes passes the gate.
    this.gate = gain(1);
    this.dry = gain(1);
    this.wet = gain(0);
    const crusher = ctx.createWaveShaper();
    crusher.curve = crushCurve(CRUSH_STEPS);
    this.gate.connect(this.dry).connect(this.out);
    this.gate.connect(crusher).connect(this.wet).connect(this.out);
    // Fan and body share the tremolo; the noise layers do not (a rattle is mechanical).
    this.trem = gain(1 - r.pulse.depth / 2);
    this.trem.connect(this.gate);
    this.pulse = osc(r.pulse.wave, r.pulse.hz[0]);
    this.pulseDepth = gain(r.pulse.depth / 2);
    this.pulse.connect(this.pulseDepth).connect(this.trem.gain);

    // The fan: two copies a few cents apart, panned apart, for width and beating.
    const wave = harmonicWave(ctx, r.whine.partials);
    this.whineGain = gain(0);
    this.whineGain.connect(this.trem);
    this.whineL = osc(wave, r.whine.baseHz);
    this.whineR = osc(wave, r.whine.baseHz);
    this.whineL.detune.value = -r.whine.spreadCents / 2;
    this.whineR.detune.value = r.whine.spreadCents / 2;
    for (const [o, side] of [[this.whineL, -1], [this.whineR, 1]] as const) {
      const p = ctx.createStereoPanner();
      p.pan.value = side * 0.45;
      o.connect(p).connect(this.whineGain);
    }
    const vib = osc('sine', r.whine.vibratoHz);
    this.vibDepth = gain(r.whine.vibratoCents);
    vib.connect(this.vibDepth);
    this.vibDepth.connect(this.whineL.detune);
    this.vibDepth.connect(this.whineR.detune);

    // The turbine body and its sub.
    this.body = osc(harmonicWave(ctx, r.body.partials), r.body.baseHz);
    this.bodyFilter = ctx.createBiquadFilter();
    this.bodyFilter.type = 'lowpass';
    this.bodyFilter.Q.value = r.body.q;
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve(r.body.drive);
    this.bodyGain = gain(0);
    this.body.connect(this.bodyFilter).connect(shaper).connect(this.bodyGain).connect(this.trem);
    this.sub = osc('sine', r.body.baseHz / 2);
    this.subGain = gain(0);
    this.sub.connect(this.subGain).connect(this.trem);

    // One noise source feeds both the jet and the cushion.
    const n = ctx.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    this.sources.push(n);
    this.jetFilter = ctx.createBiquadFilter();
    this.jetFilter.type = 'bandpass';
    this.jetFilter.Q.value = r.jet.q;
    this.jetGain = gain(0);
    n.connect(this.jetFilter).connect(this.jetGain).connect(this.gate);
    this.cushionFilter = ctx.createBiquadFilter();
    this.cushionFilter.type = 'bandpass';
    this.cushionGain = gain(0);
    n.connect(this.cushionFilter).connect(this.cushionGain).connect(this.gate);

    for (const s of this.sources) s.start();
  }

  /** Retarget every layer from the craft's state; `pitch` is the slow-mo factor. */
  update(view: EngineView, pitch: number): void {
    const t = this.ctx.currentTime;
    const r = this.r;
    const ratio = Math.min(MAX_RATIO, Math.max(0, view.speed / view.topSpeed));
    const rr = Math.min(1, ratio);
    const st = this.stutterAmount(t);
    // A dying engine sags in pitch as it cuts out.
    const sag = 1 - this.stutterSag * st;
    const lift = (view.boosting ? r.boost.pitch : 1) * (view.airborne ? AIR_PITCH : 1) * pitch * sag;
    const set = (p: AudioParam, v: number, tc = SMOOTH_S) => p.setTargetAtTime(v, t, tc);

    const whineHz = (r.whine.baseHz + r.whine.rangeHz * ratio) * lift;
    set(this.whineL.frequency, whineHz);
    set(this.whineR.frequency, whineHz);
    const wg = r.whine.gain[0] + (r.whine.gain[1] - r.whine.gain[0]) * rr;
    set(this.whineGain.gain, wg * (view.boosting ? 1.25 : 1));
    set(this.vibDepth.gain, r.whine.vibratoCents + st * 60);

    const bodyHz = (r.body.baseHz + r.body.rangeHz * ratio) * lift;
    set(this.body.frequency, bodyHz);
    set(this.sub.frequency, bodyHz / 2);
    let cutoff = r.body.cutoffHz + r.body.cutoffRangeHz * Math.min(ratio, 1.2) + (view.boosting ? r.boost.cutoffHz : 0);
    if (view.airborne) cutoff *= AIR_CUTOFF;
    set(this.bodyFilter.frequency, cutoff * pitch);
    const air = view.airborne ? AIR_BODY : 1;
    set(this.bodyGain.gain, r.body.gain * air);
    set(this.subGain.gain, r.body.sub * air);

    // The pulse: the glider's own rate, or a fast flutter while it stutters.
    const depth = Math.min(0.9, r.pulse.depth + st * 0.8);
    set(this.pulse.frequency, (r.pulse.hz[0] + (r.pulse.hz[1] - r.pulse.hz[0]) * rr) * (1 - st) * pitch + STUTTER_TREM_HZ * st);
    set(this.pulseDepth.gain, depth / 2);
    set(this.trem.gain, 1 - depth / 2);

    const jet = r.jet.gain[0] + (r.jet.gain[1] - r.jet.gain[0]) * rr + (view.boosting ? r.boost.gain : 0);
    set(this.jetGain.gain, jet * (view.airborne ? 0.6 : 1));
    set(this.jetFilter.frequency, r.jet.hz * (0.6 + 0.6 * rr) * (view.boosting ? r.boost.hzMul : 1) * pitch);

    const s = SURFACE_RECIPES[view.surface];
    if (this.surface !== null && this.surface !== view.surface && !view.airborne && rr > 0.2) this.splash(t, s.gain * SURFACE_SPLASH);
    this.surface = view.surface;
    set(this.cushionFilter.frequency, s.hz * (0.7 + 0.5 * rr) * pitch, 0.1);
    set(this.cushionFilter.Q, s.q, 0.1);
    if (t >= this.splashUntil) set(this.cushionGain.gain, view.airborne ? 0 : s.gain * (0.25 + 0.75 * rr), view.airborne ? 0.12 : SMOOTH_S);
  }

  /** The cushion bursts as it crosses onto new ground (spray off water, grit off sand). */
  private splash(t: number, peak: number): void {
    const g = this.cushionGain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(peak, t, 0.015);
    g.setTargetAtTime(peak / SURFACE_SPLASH, t + SURFACE_SPLASH_S * 0.4, SURFACE_SPLASH_S / 3);
    this.splashUntil = t + SURFACE_SPLASH_S;
  }

  /**
   * Gate the engine through a glitchy pattern of cut-outs, bit-crushed bursts and a fast
   * flutter, then let it recover. Scheduled on the audio clock so the cuts are sample-tight.
   */
  stutter(kind: StutterKind): void {
    const t0 = this.ctx.currentTime;
    const p = STUTTER[kind];
    const g = this.gate.gain;
    const d = this.dry.gain;
    const w = this.wet.gain;
    for (const a of [g, d, w]) a.cancelScheduledValues(t0);
    let t = t0;
    for (const [dur, level, crush] of p.segments) {
      g.setTargetAtTime(level, t, GATE_SMOOTH_S);
      d.setTargetAtTime(1 - crush * 0.85, t, GATE_SMOOTH_S);
      w.setTargetAtTime(crush * 0.9, t, GATE_SMOOTH_S);
      t += dur * (1 + (Math.random() * 2 - 1) * STUTTER_JITTER);
    }
    // Recover: the engine catches and the grit clears.
    g.setTargetAtTime(1, t, 0.05);
    d.setTargetAtTime(1, t, 0.08);
    w.setTargetAtTime(0, t, 0.08);
    this.stutterFrom = t0;
    this.stutterUntil = t;
    this.stutterSag = p.sag;
  }

  /** 1 at the start of a stutter, easing to 0 as it recovers. */
  private stutterAmount(t: number): number {
    if (t >= this.stutterUntil) return 0;
    const u = (t - this.stutterFrom) / (this.stutterUntil - this.stutterFrom);
    return 1 - u * u;
  }

  /** Fade out and release every source. */
  stop(): void {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.06);
    for (const s of this.sources) s.stop(t + 0.3);
  }
}
