// The world's sound around the camera: a biome bed, the nearest landmarks and hazards on a
// couple of reusable positional loops, hazard warnings timed off the same schedule the
// simulation collides with (so you can hear the beast before you see it), and rival
// fly-bys with a Doppler drop. Called once per frame; cheap: a few dozen distance checks
// and parameter retargets, no per-frame nodes.

import { makeFrame, type Ribbon, type Track } from '../core/track.ts';
import type { RacerStyle, Vec3 } from '../core/types.ts';
import { blockerStage, dropperItems, gustStrength, sweeperX, type CourseHazard, type DropItem, type DropStage } from '../core/hazards.ts';
import type { TrackScenery } from '../data/tracks/scenery.ts';
import type { LandmarkKind } from '../render/landmarks/types.ts';
import { ENGINE_RECIPES, type EngineSurface } from './engineRecipes.ts';
import { playCue, type CueName } from './envCues.ts';
import { BIOME_BEDS, HAZARD_FAR, HAZARD_NEAR, LANDMARK_SOUNDS, hazardSound, type HazardSound } from './envRecipes.ts';
import { LoopSlot, type LoopRecipe } from './loopSlot.ts';
import { clamp01, harmonicWave, type LiveAudio } from './synth.ts';

/** A rival as the audio sees it. `position` may be a live reference (it is only read). */
export interface AudioRival {
  position: Vec3;
  speed: number;
  style: RacerStyle;
  /** False once wrecked: a wreck does not fly by. */
  active: boolean;
}

export interface EnvFrame {
  /** Race time: the hazard schedules' clock. */
  time: number;
  listener: Vec3;
  /** Unit direction the camera looks. */
  forward: Vec3;
  rivals: readonly AudioRival[];
}

/** Positional loop voices besides the bed: the nearest landmarks and hazards share them. */
const ENV_SLOTS = 2;
/** Presence below which a source is not worth a voice. */
const MIN_PRESENCE = 0.02;
/** Sky pieces (the aurora) hang round the camera at this presence: always there, never loud. */
const SKY_KINDS: ReadonlySet<LandmarkKind> = new Set(['auroraSky']);
const SKY_PRESENCE = 0.5;
/** Sound sits this far beyond a landmark's footprint gap: roughly its middle, not its edge. */
const LANDMARK_AUDIO_DEPTH = 30;
/** Behind the camera, sources lose this share of presence (the craft and cockpit shade them). */
const BEHIND_SHADE = 0.3;
/** Stereo width of positional sources. */
const PAN_WIDTH = 0.85;
/** Rival fly-by: lateral window, metres; cooldown per rival, seconds; Doppler. */
const PASS_LATERAL = 22;
const PASS_COOLDOWN_S = 1.2;
const PASS_REF_SPEED = 170;
/** Relative speed (m/s) for the full Doppler drop, and that drop as a pitch ratio either side. */
const PASS_FULL_REL = 60;
const PASS_DOPPLER = 0.16;
const PASS_DUR_S = 0.7;
/** Ambient cue level range, as a share of a cue's full gain. */
const AMBIENT_GAIN: [number, number] = [0.3, 0.8];

interface HazardSource {
  h: CourseHazard;
  ribbon: Ribbon;
  sound: HazardSound;
  stage: Stage;
  /** Dropper items and their stages last frame, to hear each one land. */
  items: DropItem[];
  itemStages: DropStage[];
}

type Stage = 'idle' | 'lead' | 'warn' | 'active';

interface Source {
  key: string;
  pos: Vec3;
  loop: LoopRecipe;
  near: number;
  far: number;
  /** Activity 0..1 (hazards vary; landmarks are always 1). */
  activity: number;
  pass?: CueName;
  passArmed: boolean;
  sky: boolean;
  hazard?: HazardSource;
  /** Scratch, per update. */
  presence: number;
  dist: number;
}

interface RivalTrack {
  along: number | null;
  lastPass: number;
}

export class AudioEnvironment {
  private readonly live: () => LiveAudio | null;
  private track: Track | null = null;
  private scenery: TrackScenery | null = null;
  private sources: Source[] = [];
  private lagoons: [number, number][] = [];
  private slots: LoopSlot[] = [];
  private bed: LoopSlot | null = null;
  private nextAmbient = 0;
  private lastTime = -1;
  private lastCtxTime = -1;
  private rivals: RivalTrack[] = [];
  private readonly chosen: Source[] = [];
  private readonly scratchItems: DropItem[] = [];
  private readonly right = { x: 0, y: 0, z: 0 };
  private readonly frameScratch = makeFrame();
  /** The frame being processed, for cue placement. */
  private currentFrame: EnvFrame | null = null;

  constructor(live: () => LiveAudio | null) {
    this.live = live;
  }

  /** Learn a new course: its biome, landmarks and hazards. Call once per race, before update. */
  start(track: Track, scenery: TrackScenery): void {
    this.stop();
    this.track = track;
    this.scenery = scenery;
    this.lagoons = scenery.biome === 'beach' ? scenery.lagoons.map((l) => [track.paramToS(l.from), track.paramToS(l.to)]) : [];
    const sources: Source[] = [];
    const boundTo = new Map<string, LandmarkKind>();
    scenery.landmarks.forEach((p, i) => {
      if (p.hazard !== undefined) {
        // A bound landmark is voiced by its hazard, which sits where the danger is.
        boundTo.set(p.hazard, p.kind);
        return;
      }
      const fam = LANDMARK_SOUNDS[p.kind];
      if (!fam) return;
      const ribbon = p.branch === undefined ? track : branchRibbon(track, p.branch);
      const s = ribbon.paramToS(p.at);
      const edge = p.side > 0 ? ribbon.maxXAt(s) : -ribbon.minXAt(s);
      const pos = ribbon.toWorld(s, p.side * (edge + Math.max(0, p.distance) + LANDMARK_AUDIO_DEPTH), 0);
      sources.push(source(`lm${i}`, pos, fam.loop, fam.near, fam.far, 1, SKY_KINDS.has(p.kind), fam.pass));
    });
    const ribbons: Ribbon[] = [track, ...track.branches.map((b) => b.ribbon)];
    for (const ribbon of ribbons) {
      for (const h of ribbon.hazards) {
        // Landmarks bind only to main-loop hazards (see render/track/landmarks.ts).
        const bound = ribbon === track ? boundTo.get(h.def.id) : undefined;
        const sound = hazardSound(h.def.type, bound);
        const src = source(`hz:${ribbon.id}:${h.def.id}`, ribbon.toWorld((h.s0 + h.s1) / 2, 0, 0), sound.loop, HAZARD_NEAR, HAZARD_FAR, sound.idle, false);
        src.hazard = { h, ribbon, sound, stage: 'idle', items: [], itemStages: [] };
        sources.push(src);
      }
    }
    this.sources = sources;
    this.lastTime = -1;
    this.rivals = [];
  }

  /** What the cushion rides on at a racer's spot: road, or the biome's run-off (lagoon water). */
  surfaceAt(branch: number, s: number, x: number): EngineSurface {
    const track = this.track;
    const scenery = this.scenery;
    if (!track || !scenery) throw new Error('AudioEnvironment.surfaceAt before start()');
    const ribbon = track.ribbon(branch);
    if (ribbon.onRoad(s, x)) {
      // Slick road is ice on Frostline (wet rock elsewhere reads as hard road).
      return scenery.biome === 'ice' && ribbon.gripAt(s) < 1 ? 'ice' : 'road';
    }
    switch (scenery.biome) {
      case 'desert':
        return 'sand';
      case 'ice':
        return 'snow';
      case 'beach': {
        const w = track.wrap(s);
        return branch < 0 && this.lagoons.some(([a, b]) => w >= a && w <= b) ? 'water' : 'sand';
      }
    }
  }

  update(f: EnvFrame): void {
    const a = this.live();
    if (!a || !this.scenery) return;
    const ctx = a.ctx;
    const now = ctx.currentTime;
    if (!this.bed) this.build(a);
    const bed = this.bed;
    if (!bed) return;
    this.currentFrame = f;
    this.right.x = -f.forward.z;
    this.right.z = f.forward.x;
    const rl = Math.hypot(this.right.x, this.right.z) || 1;
    this.right.x /= rl;
    this.right.z /= rl;

    // A restart (time going backwards) re-syncs hazard stages without firing their cues.
    const rewound = f.time < this.lastTime;
    for (const s of this.sources) {
      if (s.hazard) this.updateHazard(a, s, f, rewound || this.lastTime < 0);
      this.measure(s, f);
      if (s.pass) {
        if (s.dist < s.near && s.passArmed) {
          s.passArmed = false;
          this.cue(a, s.pass, s, 1);
        } else if (s.dist > s.near * 2) s.passArmed = true;
      }
    }
    this.lastTime = f.time;
    this.assignSlots(a);

    bed.place(1, 0, 0, a.pitch);
    if (now >= this.nextAmbient) {
      const b = BIOME_BEDS[this.scenery.biome];
      if (this.nextAmbient > 0 && a.shots.has(2)) {
        const name = b.cues[Math.floor(Math.random() * b.cues.length)];
        const g = AMBIENT_GAIN[0] + Math.random() * (AMBIENT_GAIN[1] - AMBIENT_GAIN[0]);
        playCue(a.shots, a.space, name, g, Math.random() * 1.6 - 0.8, a.pitch);
      }
      this.nextAmbient = now + b.gap[0] + Math.random() * (b.gap[1] - b.gap[0]);
    }

    this.passes(a, f, now);
  }

  private build(a: LiveAudio): void {
    const scenery = this.scenery;
    if (!scenery) return;
    const noise = a.stereoNoise;
    this.bed = new LoopSlot(a.ctx, a.race, a.send, noise);
    this.bed.assign('bed', BIOME_BEDS[scenery.biome].loop);
    this.slots = Array.from({ length: ENV_SLOTS }, () => new LoopSlot(a.ctx, a.race, a.send, noise));
    this.nextAmbient = 0;
  }

  private measure(s: Source, f: EnvFrame): void {
    const dx = s.pos.x - f.listener.x;
    const dy = s.pos.y - f.listener.y;
    const dz = s.pos.z - f.listener.z;
    s.dist = s.sky ? 0 : Math.hypot(dx, dy, dz);
    const att = s.sky ? SKY_PRESENCE : falloff(s.dist, s.near, s.far);
    s.presence = att * s.activity;
  }

  /** Where a source sits in the stereo field, how far (0..1) and how shaded by being behind. */
  private place(s: Source, f: EnvFrame): { pan: number; far: number; shade: number } {
    if (s.sky) return { pan: 0, far: 0.5, shade: 1 };
    const dx = s.pos.x - f.listener.x;
    const dz = s.pos.z - f.listener.z;
    const h = Math.hypot(dx, dz) || 1;
    const pan = ((dx * this.right.x + dz * this.right.z) / h) * PAN_WIDTH;
    const front = (dx * f.forward.x + dz * f.forward.z) / h;
    const far = clamp01((s.dist - s.near) / (s.far - s.near));
    return { pan, far, shade: front < 0 ? 1 + BEHIND_SHADE * front : 1 };
  }

  /** Give the loudest sources the voices; retune a voice only after it has faded out. */
  private assignSlots(a: LiveAudio): void {
    const chosen = this.chosen;
    chosen.length = 0;
    for (const s of this.sources) {
      if (s.presence < MIN_PRESENCE) continue;
      let i = chosen.length;
      while (i > 0 && chosen[i - 1].presence < s.presence) i--;
      if (i < ENV_SLOTS) {
        chosen.splice(i, 0, s);
        if (chosen.length > ENV_SLOTS) chosen.pop();
      }
    }
    for (const slot of this.slots) {
      if (slot.key !== null && !slot.fading && !chosen.some((s) => s.key === slot.key)) slot.fadeOut();
    }
    for (const s of chosen) {
      if (this.slots.some((slot) => slot.key === s.key && !slot.fading)) continue;
      const free = this.slots.find((slot) => slot.ready());
      free?.assign(s.key, s.loop);
    }
    const frame = this.currentFrame;
    for (const slot of this.slots) {
      const s = slot.fading ? undefined : chosen.find((c) => c.key === slot.key);
      if (!s || !frame) continue;
      const p = this.place(s, frame);
      slot.place(s.presence * p.shade, p.pan, p.far, a.pitch);
    }
  }

  private updateHazard(a: LiveAudio, s: Source, f: EnvFrame, resync: boolean): void {
    const hz = s.hazard;
    if (!hz) return;
    const d = hz.h.def;
    const snd = hz.sound;
    const time = f.time;
    let stage: Stage = 'idle';
    let activity = snd.idle;
    const ct = cycleTime(time, d.period, d.phase);
    const lead = Math.max(0, d.period - ct <= snd.lead ? 1 - (d.period - ct) / snd.lead : 0);
    switch (d.type) {
      case 'sweeper': {
        const moving = ct < d.cross || (ct >= d.cross + d.hold && ct < 2 * d.cross + d.hold);
        if (moving) stage = 'active';
        else if (ct < d.cross + d.hold) stage = 'warn';
        else if (lead > 0) stage = 'lead';
        activity = stage === 'active' ? 1 : stage === 'warn' ? 0.6 : Math.max(snd.idle, lead * 0.8);
        hz.ribbon.toWorld(hz.h.s0, sweeperX(d, time), 0, s.pos, this.frameScratch);
        break;
      }
      case 'blocker': {
        const b = blockerStage(d, time);
        const idleLeft = (1 - b.progress) * (d.period - d.warn - d.up);
        if (b.stage === 'down') stage = 'active';
        else if (b.stage === 'warn') stage = 'warn';
        else if (idleLeft <= snd.lead) stage = 'lead';
        activity = stage === 'active' ? 0.5 : stage === 'warn' ? 0.4 + 0.6 * b.progress : stage === 'lead' ? Math.max(snd.idle, 0.3 * (1 - idleLeft / snd.lead)) : snd.idle;
        break;
      }
      case 'dropper': {
        const items = dropperItems(hz.h, time, this.scratchItems);
        let warn = false;
        let down = false;
        items.forEach((it, i) => {
          warn ||= it.stage === 'warn';
          down ||= it.stage === 'down';
          if (!resync && it.stage === 'down' && hz.itemStages[i] === 'warn' && snd.land) {
            const at = hz.ribbon.toWorld(it.s, it.x, 0);
            this.cueAt(a, snd.land, at, f, 1);
          }
          hz.itemStages[i] = it.stage;
        });
        stage = warn ? 'warn' : down ? 'active' : lead > 0 ? 'lead' : 'idle';
        activity = warn ? 1 : down ? 0.5 : Math.max(snd.idle, lead * 0.8);
        break;
      }
      case 'gust': {
        const g = Math.abs(gustStrength(d, time) / d.strength);
        stage = ct < d.on ? 'active' : lead > 0 ? 'lead' : 'idle';
        activity = Math.max(snd.idle, stage === 'active' ? 0.4 + 0.6 * g : lead * 0.6);
        break;
      }
    }
    if (!resync && stage !== hz.stage) {
      // The warning fires as the hazard leaves rest (lead, or straight into warn when the
      // lead is shorter than a frame); the strike as the danger arrives.
      if (hz.stage === 'idle' && (stage === 'lead' || stage === 'warn') && snd.warn) this.cue(a, snd.warn, s, 1);
      if (stage === 'active' && hz.stage !== 'active' && snd.strike) this.cue(a, snd.strike, s, 1);
    }
    hz.stage = stage;
    s.activity = activity;
  }

  private cue(a: LiveAudio, name: CueName, s: Source, gain: number): void {
    this.cueAt(a, name, s.pos, this.currentFrame, gain, s.near, s.far);
  }

  /** Play a cue from a world position: gain by distance, pan by bearing, wetter when far. */
  private cueAt(a: LiveAudio, name: CueName, pos: Vec3, f: EnvFrame | null, gain: number, near = HAZARD_NEAR, far = HAZARD_FAR): void {
    if (!f) return;
    const dx = pos.x - f.listener.x;
    const dz = pos.z - f.listener.z;
    const dist = Math.hypot(dx, pos.y - f.listener.y, dz);
    // Cues fall off linearly, not squared: a warning should carry.
    const g = gain * clamp01(1 - Math.max(0, dist - near) / (far - near));
    if (g <= MIN_PRESENCE) return;
    const h = Math.hypot(dx, dz) || 1;
    const pan = ((dx * this.right.x + dz * this.right.z) / h) * PAN_WIDTH;
    playCue(a.shots, dist > near * 2 ? a.space : a.race, name, g, pan, a.pitch);
  }

  /** Rivals crossing the camera's line: a Doppler swoosh in their own engine's voice. */
  private passes(a: LiveAudio, f: EnvFrame, now: number): void {
    const dt = this.lastCtxTime < 0 ? 0 : now - this.lastCtxTime;
    this.lastCtxTime = now;
    f.rivals.forEach((r, i) => {
      const tr = (this.rivals[i] ??= { along: null, lastPass: -Infinity });
      if (!r.active) {
        tr.along = null;
        return;
      }
      const dx = r.position.x - f.listener.x;
      const dz = r.position.z - f.listener.z;
      const along = dx * f.forward.x + dz * f.forward.z;
      const lateral = dx * this.right.x + dz * this.right.z;
      const prev = tr.along;
      tr.along = along;
      if (prev === null || dt <= 0 || Math.sign(prev) === Math.sign(along) || Math.abs(lateral) > PASS_LATERAL) return;
      if (now - tr.lastPass < PASS_COOLDOWN_S || !a.shots.has(2)) return;
      tr.lastPass = now;
      const rel = Math.abs(along - prev) / dt;
      const close = 1 - Math.abs(lateral) / PASS_LATERAL;
      const w = ENGINE_RECIPES[r.style].whine;
      const hz = w.baseHz + w.rangeHz * Math.min(1, r.speed / PASS_REF_SPEED);
      const dop = 1 + PASS_DOPPLER * clamp01(rel / PASS_FULL_REL);
      const side = Math.sign(lateral) || 1;
      a.shots.tone(a.race, { wave: harmonicWave(a.ctx, w.partials), f0: hz * dop, f1: hz / dop, dur: PASS_DUR_S, gain: 0.12 * close, pan: side * 0.8, panTo: side * 0.4, filter: 'lowpass', filterHz: hz * 3 }, a.pitch);
      a.shots.noise(a.race, { filter: 'bandpass', f0: 1400, f1: 500, q: 0.8, dur: PASS_DUR_S * 0.8, gain: 0.2 * close, pan: side * 0.8, panTo: side * 0.3 }, a.pitch);
    });
  }

  /** Release every voice (pause, race end). The course stays learned for a resume. */
  stop(): void {
    this.bed?.stop();
    for (const s of this.slots) s.stop();
    this.bed = null;
    this.slots = [];
    this.lastCtxTime = -1;
    for (const r of this.rivals) r.along = null;
  }
}

function source(key: string, pos: Vec3, loop: LoopRecipe, near: number, far: number, activity: number, sky: boolean, pass?: CueName): Source {
  return { key, pos: { x: pos.x, y: pos.y, z: pos.z }, loop, near, far, activity, pass, passArmed: true, sky, presence: 0, dist: Infinity };
}

/** 1 inside near, easing (squared) to 0 at far. */
function falloff(d: number, near: number, far: number): number {
  if (d <= near) return 1;
  const u = clamp01(1 - (d - near) / (far - near));
  return u * u;
}

/** Seconds into a hazard's cycle (as core/hazards.ts computes it). */
function cycleTime(time: number, period: number, phase: number): number {
  const t = (time + phase) % period;
  return t < 0 ? t + period : t;
}

function branchRibbon(track: Track, id: string): Ribbon {
  const b = track.branches.find((x) => x.def.id === id);
  if (!b) throw new Error(`Track ${track.def.id}: no branch "${id}" for a landmark sound`);
  return b.ribbon;
}
