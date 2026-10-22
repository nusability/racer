// One race on screen: owns the sim, its scene, HUD and input, and hands the outcome back to
// the menus. The sim advances on a fixed step; rendering interpolates between steps.

import * as THREE from 'three';
import { Race } from '../core/race.ts';
import { Track } from '../core/track.ts';
import type { PlayerInput, RaceEvent, RacerState } from '../core/types.ts';
import { racerById } from '../data/racers.ts';
import { trackById } from '../data/tracks/index.ts';
import { SIM_DT } from '../data/tuning.ts';
import type { GameAudio } from '../audio/audio.ts';
import { CAM_HIDE_NEAR } from '../render/cameraTuning.ts';
import { ChaseCamera } from '../render/chaseCamera.ts';
import { Effects } from '../render/effects.ts';
import { createRacerModel, type RacerModel } from '../render/racerModel.ts';
import { emptySnapshot, lerpSnapshot, poseObject, snapshot, type PoseSnapshot } from '../render/racerPose.ts';
import { SpeedLines } from '../render/speedLines.ts';
import { applyEnvironment, buildTrackScene, type TrackScene } from '../render/trackScene.ts';
import { createHud } from '../ui/hud.ts';
import { createInput } from '../ui/input.ts';
import { createMinimap, type Minimap } from '../ui/minimap.ts';
import { showPauseMenu } from '../ui/pauseMenu.ts';
import type { Hud, InputSource, RaceOutcome, RaceRequest, Settings } from './types.ts';
import {
  SESSION_DUST_RANGE,
  SESSION_FINISH_LINGER,
  SESSION_GO_SHOWN,
  SESSION_HARD_LANDING,
  SESSION_INVULNERABLE_BLINK,
  SESSION_MAX_FRAME_DT,
  SESSION_SHAKE_HIT,
  SESSION_SHAKE_LAND,
  SESSION_SHAKE_SCRAPE,
} from './sessionTuning.ts';

const MS_TO_KMH = 3.6;

export interface SessionContext {
  renderer: THREE.WebGLRenderer;
  uiRoot: HTMLElement;
  audio: GameAudio;
  settings: Settings;
}

interface RacerView {
  model: RacerModel;
  prev: PoseSnapshot;
  curr: PoseSnapshot;
  draw: PoseSnapshot;
  wasBoosting: boolean;
}

export class RaceSession {
  private readonly ctx: SessionContext;
  private readonly request: RaceRequest;
  private readonly onDone: (o: RaceOutcome | null) => void;
  private readonly track: Track;
  private race: Race;
  private readonly scene = new THREE.Scene();
  private readonly env: { dispose(): void };
  private readonly trackScene: TrackScene;
  private readonly views: RacerView[] = [];
  private readonly cam: ChaseCamera;
  private readonly effects: Effects;
  private readonly speedLines: SpeedLines;
  private readonly hud: Hud;
  private readonly input: InputSource;
  private readonly hudRoot: HTMLElement;
  private acc = 0;
  private clock = 0;
  private countdown: number | null = null;
  private countdownClearAt = 0;
  private scrapeLevel = 0;
  private shownBranch = -1;
  private readonly minimap: Minimap;
  private readonly dotColors: string[];
  private finishedFor = 0;
  private paused = false;
  private done = false;
  private pauseClose: (() => void) | null = null;
  private readonly onVisibility = () => {
    if (document.hidden) this.pause();
  };
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpVel = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly frameRight = new THREE.Vector3();

  constructor(ctx: SessionContext, request: RaceRequest, onDone: (o: RaceOutcome | null) => void) {
    this.ctx = ctx;
    this.request = request;
    this.onDone = onDone;
    const def = trackById(request.trackId);
    this.track = new Track(def);
    this.race = this.newRace();

    this.env = applyEnvironment(this.scene, def.palette, ctx.settings.quality);
    this.trackScene = buildTrackScene(this.track, ctx.settings.quality);
    this.scene.add(this.trackScene.group);

    for (const e of request.entrants) {
      const model = createRacerModel(racerById(e.racerId).visual, {
        detail: e.isPlayer || ctx.settings.quality === 'high' ? 'high' : 'low',
      });
      this.scene.add(model.root);
      this.views.push({ model, prev: emptySnapshot(), curr: emptySnapshot(), draw: emptySnapshot(), wasBoosting: false });
    }
    this.syncSnapshots(true);

    const size = ctx.renderer.getSize(new THREE.Vector2());
    this.cam = new ChaseCamera(size.x / size.y);
    this.scene.add(this.cam.camera);
    this.effects = new Effects(this.scene, ctx.settings.quality);
    this.speedLines = new SpeedLines(this.cam.camera);

    this.hudRoot = document.createElement('div');
    this.hudRoot.className = 'race-layer';
    ctx.uiRoot.appendChild(this.hudRoot);
    this.hud = createHud(this.hudRoot, () => this.pause());
    this.input = createInput(this.hudRoot, ctx.settings);
    this.minimap = createMinimap(this.hudRoot, this.track);
    this.dotColors = request.entrants.map((e) => `#${racerById(e.racerId).visual.primary.toString(16).padStart(6, '0')}`);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private newRace(): Race {
    return new Race(this.track, { laps: this.request.laps, seed: this.request.seed, entrants: this.request.entrants });
  }

  private player(): RacerState {
    return this.race.player();
  }

  private playerIndex(): number {
    return this.request.entrants.findIndex((e) => e.isPlayer);
  }

  private syncSnapshots(both: boolean) {
    this.race.racers.forEach((r, i) => {
      const v = this.views[i];
      if (both) snapshot(r, v.prev);
      else {
        const t = v.prev;
        v.prev = v.curr;
        v.curr = t;
      }
      snapshot(r, v.curr);
    });
  }

  resize(width: number, height: number) {
    this.cam.resize(width / height);
  }

  pause() {
    if (this.paused || this.done) return;
    this.paused = true;
    this.ctx.audio.stopRaceSounds();
    this.pauseClose = showPauseMenu(this.ctx.uiRoot, {
      resume: () => this.resume(),
      restart: () => this.restart(),
      quit: () => this.finish(null),
    });
  }

  private resume() {
    this.pauseClose?.();
    this.pauseClose = null;
    this.paused = false;
  }

  private restart() {
    this.resume();
    this.race = this.newRace();
    this.acc = 0;
    this.finishedFor = 0;
    this.countdown = null;
    this.shownBranch = -1;
    this.cam.reset();
    this.syncSnapshots(true);
    for (const v of this.views) v.model.root.visible = true;
  }

  private finish(outcome: RaceOutcome | null) {
    if (this.done) return;
    this.done = true;
    this.dispose();
    this.onDone(outcome);
  }

  /** Advance and draw one display frame. */
  frame(dtRaw: number) {
    if (this.done) return;
    const dt = Math.min(dtRaw, SESSION_MAX_FRAME_DT);
    if (!this.paused) {
      this.clock += dt;
      this.acc += dt;
      const input: PlayerInput = this.input.read();
      while (this.acc >= SIM_DT) {
        this.acc -= SIM_DT;
        const events = this.race.step(input);
        // A nudge is a displacement, not a rate: it must land on exactly one step.
        input.nudge = 0;
        this.syncSnapshots(false);
        for (const ev of events) this.handleEvent(ev);
      }
      if (this.race.phase === 'finished') {
        this.finishedFor += dt;
        if (this.finishedFor >= SESSION_FINISH_LINGER) {
          this.finish({ request: this.request, results: this.race.results() });
          return;
        }
      }
    }
    this.draw(dt);
  }

  private handleEvent(ev: RaceEvent) {
    const audio = this.ctx.audio;
    const pi = this.playerIndex();
    const pid = this.request.entrants[pi].id;
    switch (ev.type) {
      case 'countdown':
        this.countdown = ev.n;
        audio.oneShot(ev.n === 0 ? 'go' : 'countdown');
        if (ev.n === 0) this.countdownClearAt = this.clock + SESSION_GO_SHOWN;
        return;
      case 'scrape': {
        const i = this.indexOf(ev.id);
        if (this.nearCamera(i)) this.wallSparks(i, ev.side, ev.intensity);
        if (ev.id === pid) {
          this.cam.addShake(SESSION_SHAKE_SCRAPE * ev.intensity);
          this.scrapeLevel = Math.max(this.scrapeLevel, ev.intensity);
        }
        return;
      }
      case 'hit':
        if (ev.id === pid) {
          audio.oneShot('hit', ev.intensity);
          this.cam.addShake(SESSION_SHAKE_HIT * ev.intensity);
        }
        return;
      case 'crash': {
        const i = this.indexOf(ev.id);
        const v = this.views[i];
        this.worldPos(i, this.tmpPos);
        this.tmpVel.set(0, 0, 0);
        this.effects.explosion(this.tmpPos, this.tmpVel, racerById(this.request.entrants[i].racerId).visual.glow);
        v.model.root.visible = false;
        if (ev.id === pid) {
          audio.oneShot('crash');
          this.cam.addShake(1);
          this.hud.flash(ev.reason === 'fell' ? 'FELL!' : 'WRECKED!');
        }
        return;
      }
      case 'respawn': {
        const i = this.indexOf(ev.id);
        this.views[i].model.root.visible = true;
        snapshot(this.race.racers[i], this.views[i].prev);
        return;
      }
      case 'land': {
        const i = this.indexOf(ev.id);
        if (this.nearCamera(i)) {
          this.worldPos(i, this.tmpPos);
          this.effects.landing(this.tmpPos, Math.min(1, ev.impact / SESSION_HARD_LANDING));
        }
        if (ev.id === pid) {
          const hard = Math.min(1, ev.impact / SESSION_HARD_LANDING);
          audio.oneShot('land', hard);
          this.cam.addShake(SESSION_SHAKE_LAND * hard);
        }
        return;
      }
      case 'boostPad': {
        const i = this.indexOf(ev.id);
        if (ev.id === pid) audio.oneShot('boostPad');
        if (this.nearCamera(i)) this.burst(i);
        return;
      }
      case 'overheat':
        if (ev.id === pid) {
          audio.oneShot('overheat');
          this.hud.flash('OVERHEAT');
        }
        return;
      case 'lap':
        if (ev.id === pid && ev.lap < this.request.laps) {
          audio.oneShot('lap');
          this.hud.flash(ev.lap === this.request.laps - 1 ? 'FINAL LAP' : `LAP ${ev.lap + 1}`);
        }
        return;
      case 'finish':
        if (ev.id === pid) {
          audio.oneShot('finish');
          this.hud.flash(ordinal(ev.place));
        }
        return;
      case 'launch':
        return;
    }
  }

  private indexOf(id: string): number {
    const i = this.request.entrants.findIndex((e) => e.id === id);
    if (i < 0) throw new Error(`Race event for unknown racer "${id}"`);
    return i;
  }

  private worldPos(i: number, out: THREE.Vector3) {
    return out.copy(this.views[i].model.root.position);
  }

  private nearCamera(i: number): boolean {
    return this.views[i].model.root.position.distanceTo(this.cam.camera.position) < SESSION_DUST_RANGE;
  }

  private wallSparks(i: number, side: -1 | 1, intensity: number) {
    const root = this.views[i].model.root;
    this.frameRight.set(1, 0, 0).applyQuaternion(root.quaternion);
    this.tmpPos.copy(root.position).addScaledVector(this.frameRight, side * 2.5);
    this.tmpDir.set(0, 0, 1).applyQuaternion(root.quaternion).addScaledVector(this.frameRight, -side * 0.4);
    this.effects.sparks(this.tmpPos, this.tmpDir, intensity);
  }

  private burst(i: number) {
    const root = this.views[i].model.root;
    this.tmpDir.set(0, 0, -1).applyQuaternion(root.quaternion);
    this.effects.boostBurst(root.position, this.tmpDir, racerById(this.request.entrants[i].racerId).visual.glow);
  }

  private draw(dt: number) {
    if (this.countdown === 0 && this.clock >= this.countdownClearAt) this.countdown = null;
    const alpha = this.paused ? 1 : this.acc / SIM_DT;
    const pi = this.playerIndex();
    this.race.racers.forEach((r, i) => {
      const v = this.views[i];
      lerpSnapshot(this.track, v.prev, v.curr, alpha, v.draw);
      poseObject(this.track, v.draw, v.model.root);
      if (r.crashed <= 0) {
        const blinkOn = r.invulnerable <= 0 || Math.floor(this.clock * SESSION_INVULNERABLE_BLINK) % 2 === 0;
        const inLens = i !== pi && v.model.root.position.distanceTo(this.cam.camera.position) < CAM_HIDE_NEAR;
        v.model.root.visible = blinkOn && !inLens;
      }
      const stats = this.request.entrants[i].stats;
      v.model.update(dt, this.clock, {
        speed: r.speed,
        topSpeed: stats.topSpeed,
        boosting: r.boosting,
        heat: r.heat,
        overheated: r.overheat > 0,
        damage: r.damage,
        steer: r.steer,
        airborne: r.airborne,
        crashed: r.crashed > 0,
      });
      if (r.boosting && !v.wasBoosting && this.nearCamera(i)) {
        this.burst(i);
        if (i === pi) this.ctx.audio.oneShot('boostStart');
      }
      v.wasBoosting = r.boosting;
      if (r.crashed <= 0 && !r.airborne && this.nearCamera(i)) {
        // Dust inherits the racer's velocity so it streams past the chase camera.
        this.tmpVel.set(0, 0, -1).applyQuaternion(v.model.root.quaternion).multiplyScalar(r.speed);
        this.effects.dust(v.model.root.position, this.tmpVel, Math.min(1, r.speed / stats.topSpeed), this.track.def.palette.sand);
      }
    });

    const p = this.player();
    const top = this.request.entrants[pi].stats.topSpeed;
    const speedFrac = p.speed / top;
    const pv = this.views[pi].draw;
    // The camera follows the interpolated pose, not the raw step, or it judders.
    this.cam.update(dt, this.track, { ...p, branch: pv.branch, s: pv.s, x: pv.x, y: pv.y }, speedFrac, this.clock);
    if (pv.branch !== this.shownBranch) {
      if (pv.branch >= 0) this.hud.flash(this.track.branches[pv.branch].def.name.toUpperCase());
      this.shownBranch = pv.branch;
    }
    this.minimap.update(this.race.racers, pi, this.dotColors);
    this.speedLines.update(dt, Math.max(0, Math.min(1, (speedFrac - 0.45) * 1.6)) + (p.boosting ? 0.35 : 0));
    this.effects.update(dt, this.cam.camera);
    this.trackScene.update(this.clock, this.cam.camera.position);

    if (!this.paused) {
      this.ctx.audio.engine({ speed: p.speed, topSpeed: top, boosting: p.boosting, airborne: p.airborne, heat: p.heat });
      this.ctx.audio.wind(Math.min(1, speedFrac));
      this.ctx.audio.scrapeLoop(this.scrapeLevel);
      this.scrapeLevel = 0;
    }
    this.hud.update({
      speedKmh: Math.round(p.speed * MS_TO_KMH),
      place: p.place,
      racers: this.race.racers.length,
      lap: Math.min(this.request.laps, p.lap + 1),
      laps: this.request.laps,
      time: this.race.time,
      bestLap: p.bestLap,
      heat: p.heat,
      overheated: p.overheat > 0,
      damage: p.damage,
      boosting: p.boosting,
      countdown: this.countdown,
      finished: p.finishTime !== null,
    });
    this.ctx.renderer.render(this.scene, this.cam.camera);
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.ctx.audio.stopRaceSounds();
    this.pauseClose?.();
    this.input.dispose();
    this.minimap.dispose();
    this.hud.dispose();
    this.hudRoot.remove();
    this.speedLines.dispose();
    this.effects.dispose();
    for (const v of this.views) v.model.dispose();
    this.trackScene.dispose();
    this.env.dispose();
  }
}

function ordinal(n: number): string {
  const suffix = n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH';
  return `${n}${suffix}!`;
}
