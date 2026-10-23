// A reusable looping ambience voice: filtered stereo noise plus a tone, both under one slow
// LFO that can swell the level, sweep the filter and bend the pitch. The environment owns a
// few of these for the whole race and retunes them to whatever is nearest (no per-frame
// node creation); a slot is only retuned while silent, so the change is never heard.

export interface LoopRecipe {
  noise?: { filter: BiquadFilterType; hz: number; q: number; gain: number };
  tone?: { wave: OscillatorType; hz: number; gain: number };
  lfo?: {
    wave: OscillatorType;
    hz: number;
    /**
     * 0..1 swell of the level. Negative with a sawtooth gives percussive decays (footfalls,
     * rotor chop): the level drops from full and snaps back each cycle.
     */
    amp?: number;
    /** Filter sweep, Hz either side. */
    filterHz?: number;
    /** Pitch bend of the tone, cents either side. */
    cents?: number;
  };
  /** Overall level at full presence. */
  gain: number;
  /** Reverb share at the near distance; it grows with distance. */
  wet: number;
}

/** Retuning waits until the slot's level has decayed this far (and at least FADE_S). */
const FADE_S = 0.25;
const SMOOTH_S = 0.12;

export class LoopSlot {
  /** Key of the source this slot plays, or null when free. */
  key: string | null = null;
  private recipe: LoopRecipe | null = null;
  private fadingSince = -1;
  private readonly ctx: BaseAudioContext;
  private readonly sources: AudioScheduledSourceNode[];
  private readonly filter: BiquadFilterNode;
  private readonly noiseGain: GainNode;
  private readonly osc: OscillatorNode;
  private readonly toneGain: GainNode;
  private readonly lfo: OscillatorNode;
  private readonly ampDepth: GainNode;
  private readonly filterDepth: GainNode;
  private readonly pitchDepth: GainNode;
  private readonly am: GainNode;
  private readonly level: GainNode;
  private readonly panner: StereoPannerNode;
  private readonly wet: GainNode;

  constructor(ctx: BaseAudioContext, dry: AudioNode, send: AudioNode, stereoNoise: AudioBuffer) {
    this.ctx = ctx;
    const gain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const noise = ctx.createBufferSource();
    noise.buffer = stereoNoise;
    noise.loop = true;
    this.filter = ctx.createBiquadFilter();
    this.noiseGain = gain(0);
    this.osc = ctx.createOscillator();
    this.toneGain = gain(0);
    this.lfo = ctx.createOscillator();
    this.ampDepth = gain(0);
    this.filterDepth = gain(0);
    this.pitchDepth = gain(0);
    this.am = gain(1);
    this.level = gain(0);
    this.panner = ctx.createStereoPanner();
    this.wet = gain(0);
    noise.connect(this.filter).connect(this.noiseGain).connect(this.am);
    this.osc.connect(this.toneGain).connect(this.am);
    this.lfo.connect(this.ampDepth).connect(this.am.gain);
    this.lfo.connect(this.filterDepth).connect(this.filter.frequency);
    this.lfo.connect(this.pitchDepth).connect(this.osc.detune);
    this.am.connect(this.level).connect(this.panner).connect(dry);
    this.panner.connect(this.wet).connect(send);
    this.sources = [noise, this.osc, this.lfo];
    // Offset into the noise so slots never play the same noise in phase.
    noise.start(0, Math.random() * stereoNoise.duration);
    this.osc.start();
    this.lfo.start();
  }

  /** True once a slot told to fade has gone quiet and can be retuned. */
  ready(): boolean {
    return this.key === null || (this.fadingSince >= 0 && this.ctx.currentTime - this.fadingSince >= FADE_S);
  }

  fadeOut(): void {
    if (this.fadingSince >= 0) return;
    this.fadingSince = this.ctx.currentTime;
    this.level.gain.setTargetAtTime(0, this.ctx.currentTime, FADE_S / 4);
    this.wet.gain.setTargetAtTime(0, this.ctx.currentTime, FADE_S / 4);
  }

  get fading(): boolean {
    return this.fadingSince >= 0;
  }

  /** Retune to a new source. Only call when ready(): the slot must be silent. */
  assign(key: string, r: LoopRecipe): void {
    const t = this.ctx.currentTime;
    this.key = key;
    this.recipe = r;
    this.fadingSince = -1;
    const n = r.noise;
    this.noiseGain.gain.setValueAtTime(n ? n.gain : 0, t);
    if (n) {
      this.filter.type = n.filter;
      this.filter.frequency.setValueAtTime(n.hz, t);
      this.filter.Q.setValueAtTime(n.q, t);
    }
    const o = r.tone;
    this.toneGain.gain.setValueAtTime(o ? o.gain : 0, t);
    if (o) {
      this.osc.type = o.wave;
      this.osc.frequency.setValueAtTime(o.hz, t);
    }
    const l = r.lfo;
    const amp = l?.amp ?? 0;
    if (l) {
      this.lfo.type = l.wave;
      this.lfo.frequency.setValueAtTime(l.hz, t);
    }
    // The level swings between 1 - |amp| and 1.
    this.am.gain.setValueAtTime(1 - Math.abs(amp) / 2, t);
    this.ampDepth.gain.setValueAtTime(amp / 2, t);
    this.filterDepth.gain.setValueAtTime(l?.filterHz ?? 0, t);
    this.pitchDepth.gain.setValueAtTime(l?.cents ?? 0, t);
  }

  /**
   * Place the source: `presence` 0..1 (activity × distance), `pan` -1..1, `far` 0..1 (more
   * reverb, darker), `pitch` the slow-mo factor.
   */
  place(presence: number, pan: number, far: number, pitch: number): void {
    const r = this.recipe;
    if (!r || this.fadingSince >= 0) return;
    const t = this.ctx.currentTime;
    this.level.gain.setTargetAtTime(r.gain * presence * (1 - 0.5 * far), t, SMOOTH_S);
    this.wet.gain.setTargetAtTime(r.gain * presence * Math.min(1, r.wet + far * 0.8), t, SMOOTH_S);
    this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, SMOOTH_S);
    // Distance takes the top end off, as air does.
    if (r.noise) this.filter.frequency.setTargetAtTime(r.noise.hz * (1 - 0.45 * far) * pitch, t, SMOOTH_S);
    if (r.tone) this.osc.frequency.setTargetAtTime(r.tone.hz * pitch, t, SMOOTH_S);
    if (r.lfo) this.lfo.frequency.setTargetAtTime(r.lfo.hz * pitch, t, SMOOTH_S);
  }

  stop(): void {
    const t = this.ctx.currentTime;
    this.level.gain.setTargetAtTime(0, t, 0.06);
    this.wet.gain.setTargetAtTime(0, t, 0.06);
    for (const s of this.sources) s.stop(t + 0.3);
  }
}
