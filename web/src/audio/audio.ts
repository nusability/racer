// All game sound, synthesised with WebAudio (no asset files). Before unlock() runs inside a user
// gesture there is no AudioContext, so every call is a no-op until then.
//
// Routing: race sounds → race bus → slow-mo low-pass → master → compressor → speakers. A
// convolution hall (a generated impulse, see synth.ts) takes a little of everything raced
// and a lot of the "space" bus (UI blips, pickups, far-off world cues): that tail is most of
// what makes the game sound spacey. Menu sounds go straight to the master.

import { EngineVoice, type EngineView, type StutterKind } from './engineVoice.ts';
import { AudioEnvironment } from './environment.ts';
import { playSfx, type OneShotName, type SfxState } from './sfx.ts';
import { ShotPlayer, clamp01, impulseResponse, noiseBuffer, type LiveAudio } from './synth.ts';

export type { EngineView } from './engineVoice.ts';
export type { EngineSurface } from './engineRecipes.ts';
export type { AudioRival, EnvFrame } from './environment.ts';
export type { OneShotName } from './sfx.ts';

const MASTER_GAIN = 0.8;
/** Engine parameters are retargeted at most this often; per-frame retargeting buys nothing audible. */
const ENGINE_UPDATE_S = 0.03;
/** Minimum gap between repeats of the same one-shot, seconds. */
const ONE_SHOT_REPEAT_S = 0.04;
/** Sounds that repeat faster than the gate on purpose (a line of cells rings every one). */
const UNGATED: ReadonlySet<OneShotName> = new Set(['pickup']);
/** One-shots that also make the engine stutter. */
const STUTTERS: Partial<Record<OneShotName, StutterKind>> = { tankEmpty: 'tankEmpty', falseStart: 'falseStart' };
/** Slow-mo: race sounds keep at least this much pitch, and the bus closes to this cutoff, at timescale 0. */
const SLOWMO_PITCH_FLOOR = 0.45;
const SLOWMO_CUTOFF_MIN_HZ = 500;
const FULL_BAND_HZ = 20000;
const SLOWMO_SMOOTH_S = 0.08;
/** Reverb: how much of the whole race mix it hears, how much of the space bus, and its return. */
const RACE_SEND = 0.14;
const SPACE_SEND = 0.6;
const REVERB_RETURN = 0.8;
/** Speed rush: band and level at top speed. */
const WIND_HZ: [number, number] = [300, 2100];
const WIND_GAIN = 0.2;
const SCRAPE_HZ: [number, number] = [2200, 4400];
const SCRAPE_GAIN = 0.45;

interface NoiseLoop {
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

interface Rig {
  ctx: AudioContext;
  master: GainNode;
  raceBus: GainNode;
  spaceBus: GainNode;
  send: GainNode;
  slowFilter: BiquadFilterNode;
  noise: AudioBuffer;
  stereoNoise: AudioBuffer;
  shots: ShotPlayer;
}

export class GameAudio {
  private rig: Rig | null = null;
  private timeScale = 1;
  private enabled = true;
  private engineVoice: EngineVoice | null = null;
  private engineLast = -1;
  private windLoop: NoiseLoop | null = null;
  private scrape: NoiseLoop | null = null;
  private lastShot = new Map<OneShotName, number>();
  private readonly sfx: SfxState = { pickupChain: 0, lastPickup: -1 };
  /** The world around the camera: biome bed, landmarks, hazard warnings, rival fly-bys. */
  readonly environment = new AudioEnvironment(() => this.live());

  /** Call from a user gesture (the title tap): browsers only start audio inside one. */
  unlock(): void {
    if (this.rig) {
      this.applyState();
      return;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = this.enabled ? MASTER_GAIN : 0;
    master.connect(comp);
    const slowFilter = ctx.createBiquadFilter();
    slowFilter.type = 'lowpass';
    slowFilter.frequency.value = FULL_BAND_HZ;
    slowFilter.connect(master);
    const raceBus = ctx.createGain();
    raceBus.connect(slowFilter);
    // The hall: fed after the slow-mo filter (so a slow-mo tail is dark too) and by the space bus.
    const reverb = ctx.createConvolver();
    reverb.buffer = impulseResponse(ctx);
    const ret = ctx.createGain();
    ret.gain.value = REVERB_RETURN;
    reverb.connect(ret).connect(master);
    const send = ctx.createGain();
    send.connect(reverb);
    const raceSend = ctx.createGain();
    raceSend.gain.value = RACE_SEND;
    slowFilter.connect(raceSend).connect(reverb);
    const spaceBus = ctx.createGain();
    spaceBus.connect(raceBus);
    const spaceSend = ctx.createGain();
    spaceSend.gain.value = SPACE_SEND;
    spaceBus.connect(spaceSend).connect(send);
    const noise = noiseBuffer(ctx, 1);
    this.rig = { ctx, master, raceBus, spaceBus, send, slowFilter, noise, stereoNoise: noiseBuffer(ctx, 2), shots: new ShotPlayer(ctx, noise) };
    document.addEventListener('visibilitychange', () => this.applyState());
    this.applyState();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.applyState();
  }

  /** Runs when enabled and the page is visible; suspended otherwise so nothing burns CPU. */
  private applyState(): void {
    const r = this.rig;
    if (!r) return;
    const run = this.enabled && !document.hidden;
    r.master.gain.setTargetAtTime(this.enabled ? MASTER_GAIN : 0, r.ctx.currentTime, 0.02);
    const p = run ? r.ctx.resume() : r.ctx.suspend();
    p.catch((err: unknown) => console.error('[audio] Could not change the audio context state', err));
  }

  private live(): LiveAudio | null {
    const r = this.rig;
    if (!r || !this.enabled || r.ctx.state !== 'running') return null;
    return { ctx: r.ctx, race: r.raceBus, space: r.spaceBus, send: r.send, menu: r.master, shots: r.shots, stereoNoise: r.stereoNoise, pitch: this.racePitch() };
  }

  /**
   * Slow-motion (0..1, 1 = real time): race sounds pitch down and lose their top end, and
   * one-shots stretch, so a slow-mo wreck sounds heavy instead of chipmunk-normal.
   */
  setTimeScale(f: number): void {
    this.timeScale = clamp01(f);
    const r = this.rig;
    if (!r) return;
    const cutoff = SLOWMO_CUTOFF_MIN_HZ + (FULL_BAND_HZ - SLOWMO_CUTOFF_MIN_HZ) * this.timeScale * this.timeScale;
    r.slowFilter.frequency.setTargetAtTime(cutoff, r.ctx.currentTime, SLOWMO_SMOOTH_S);
    // The engine retargets on its next call instead of waiting out its update interval.
    this.engineLast = -1;
  }

  private racePitch(): number {
    return SLOWMO_PITCH_FLOOR + (1 - SLOWMO_PITCH_FLOOR) * this.timeScale;
  }

  // --- Continuous sounds --------------------------------------------------------------------

  engine(view: EngineView): void {
    const a = this.live();
    if (!a) return;
    let v = this.engineVoice;
    if (v && v.style !== view.style) {
      v.stop();
      v = null;
    }
    v = this.engineVoice = v ?? new EngineVoice(a.ctx, a.race, this.noise(), view.style);
    const t = a.ctx.currentTime;
    if (t - this.engineLast < ENGINE_UPDATE_S) return;
    this.engineLast = t;
    v.update(view, a.pitch);
  }

  private noise(): AudioBuffer {
    if (!this.rig) throw new Error('[audio] noise() before unlock()');
    return this.rig.noise;
  }

  private noiseLoop(a: LiveAudio, type: BiquadFilterType, q: number): NoiseLoop {
    const src = a.ctx.createBufferSource();
    src.buffer = a.stereoNoise;
    src.loop = true;
    const filter = a.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    const gain = a.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(a.race);
    // Random offset so the wind and scrape loops don't play the same noise in phase.
    src.start(0, Math.random() * a.stereoNoise.duration);
    return { src, filter, gain };
  }

  /** Air rushing past, 0..1 with speed: wide stereo noise opening up. */
  wind(intensity: number): void {
    const a = this.live();
    if (!a) return;
    const w = (this.windLoop ??= this.noiseLoop(a, 'bandpass', 0.6));
    const i = clamp01(intensity);
    w.filter.frequency.setTargetAtTime((WIND_HZ[0] + (WIND_HZ[1] - WIND_HZ[0]) * i) * a.pitch, a.ctx.currentTime, 0.15);
    w.gain.gain.setTargetAtTime(WIND_GAIN * i * i, a.ctx.currentTime, 0.15);
  }

  /** Continuous wall scrape; 0 stops it. */
  scrapeLoop(intensity: number): void {
    const a = this.live();
    if (!a) return;
    if (intensity <= 0 && !this.scrape) return;
    const s = (this.scrape ??= this.noiseLoop(a, 'bandpass', 2.5));
    const i = clamp01(intensity);
    s.filter.frequency.setTargetAtTime((SCRAPE_HZ[0] + (SCRAPE_HZ[1] - SCRAPE_HZ[0]) * i) * a.pitch, a.ctx.currentTime, 0.03);
    s.gain.gain.setTargetAtTime(SCRAPE_GAIN * i, a.ctx.currentTime, 0.03);
  }

  stopRaceSounds(): void {
    // Whatever slow-mo the race ended in, the next one starts in real time.
    this.setTimeScale(1);
    this.environment.stop();
    const r = this.rig;
    if (!r) return;
    const t = r.ctx.currentTime;
    this.engineVoice?.stop();
    this.engineVoice = null;
    for (const loop of [this.windLoop, this.scrape]) {
      if (!loop) continue;
      loop.gain.gain.setTargetAtTime(0, t, 0.06);
      loop.src.stop(t + 0.25);
    }
    this.windLoop = null;
    this.scrape = null;
  }

  // --- One-shots ------------------------------------------------------------------------------

  oneShot(name: OneShotName, intensity = 1): void {
    const a = this.live();
    if (!a) return;
    const t = a.ctx.currentTime;
    if (!UNGATED.has(name) && t - (this.lastShot.get(name) ?? -1) < ONE_SHOT_REPEAT_S) return;
    this.lastShot.set(name, t);
    const stutter = STUTTERS[name];
    if (stutter) this.engineVoice?.stutter(stutter);
    playSfx(a, name, intensity, this.sfx);
  }
}
