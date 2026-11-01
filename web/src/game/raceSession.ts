// One race on screen: owns the sim, its scene, HUD and input, and hands the outcome back to
// the menus. The sim advances on a fixed step; rendering interpolates between steps.

import * as THREE from 'three';
import { Race } from '../core/race.ts';
import { makeFrame, Track } from '../core/track.ts';
import type { HazardDef, PlayerInput, RaceEvent, RacerState, RacerStyle } from '../core/types.ts';
import { emptyDebris, type WreckKind } from '../render/racerWreck.ts';
import { racerById } from '../data/racers.ts';
import { courseBounds, sceneryById, trackById } from '../data/tracks/index.ts';
import { worldOfTrack } from '../data/worlds.ts';
import { atmosphere } from '../render/track/config.ts';
import { SIM_DT } from '../data/tuning.ts';
import type { AudioRival, GameAudio } from '../audio/audio.ts';
import { CAM_HIDE_NEAR } from '../render/cameraTuning.ts';
import { ChaseCamera } from '../render/chaseCamera.ts';
import { WreckCamera } from '../render/wreckCamera.ts';
import { VistaCamera } from '../render/vistaCamera.ts';
import { planetTopDirection } from '../render/track/spaceSky.ts';
import { Effects } from '../render/effects.ts';
import { createRacerModel, type RacerModel } from '../render/racerModel.ts';
import { emptySnapshot, lerpSnapshot, poseObject, snapshot, type PoseSnapshot } from '../render/racerPose.ts';
import { DRAFT_STREAKS, SpeedLines } from '../render/speedLines.ts';
import { applyEnvironment, buildTrackScene, type TrackScene } from '../render/trackScene.ts';
import { reportClearance } from '../render/track/clearance.ts';
import { describeLook, resolveLook, type ActiveLook } from '../render/look/look.ts';
import { worldEnvironment } from '../render/look/env.ts';
import { PostFx } from '../render/look/postFx.ts';
import { GlowPools } from '../render/look/glowPools.ts';
import { createHud } from '../ui/hud.ts';
import { createInput } from '../ui/input.ts';
import { createMinimap, type Minimap } from '../ui/minimap.ts';
import { saveTelemetry, TelemetryRecorder } from './telemetry.ts';
import type { KeyValueStore } from './save.ts';
import type { GhostStorage } from './ghostStore.ts';
import { TrialSession } from './trialSession.ts';
import { loadDebugFlags } from '../ui/debugFlags.ts';
import { createPerfOverlay, type PerfOverlay } from '../ui/perfOverlay.ts';
import { showPauseMenu } from '../ui/pauseMenu.ts';
import type { CrashReason, Hud, HudView, InputSource, RaceDone, RaceExit, RaceOutcome, RaceRequest, Settings, WreckInfo } from './types.ts';
import { graphicsLevel } from './graphics.ts';
import { SlowFrameWatch } from './slowFrameWatch.ts';
import { GRAPHICS_PROFILE } from '../render/graphicsTuning.ts';
import {
  SESSION_DUST_RANGE,
  SESSION_FPS_SMOOTHING,
  SESSION_FINISH_LINGER,
  SESSION_VISTA_LINGER,
  SESSION_GO_SHOWN,
  SESSION_HARD_LANDING,
  SESSION_BOOST_NOZZLE_HEAT,
  SESSION_IDLE_NOZZLE_HEAT,
  SESSION_WRECK_BANNER_DELAY,
  SESSION_WRECK_LINGER,
  SESSION_WRECK_SLOWMO,
  SESSION_WRECK_SLOWMO_EASE,
  SESSION_WRECK_SLOWMO_HOLD,
  SESSION_OFFROAD_DUST,
  SESSION_MAX_FRAME_DT,
  SESSION_SHAKE_HIT,
  SESSION_SHAKE_JOLT,
  SESSION_SHAKE_ROUGH,
  SESSION_JOLT_IMPACT,
  SESSION_SHAKE_LAND,
  SESSION_SHAKE_SCRAPE,
  SPRINT_SECTORS,
} from './sessionTuning.ts';

const MS_TO_KMH = 3.6;

export interface SessionContext {
  renderer: THREE.WebGLRenderer;
  uiRoot: HTMLElement;
  audio: GameAudio;
  settings: Settings;
  /** The app's store, for device-level debug flags (the same object startApp got). */
  store: KeyValueStore;
  /** Where a time trial keeps each track's best ghost. */
  ghosts: GhostStorage;
}

interface RacerView {
  model: RacerModel;
  prev: PoseSnapshot;
  curr: PoseSnapshot;
  draw: PoseSnapshot;
  wasBoosting: boolean;
  offroad: boolean;
  /** Shattered: the debris flies on its own, so the pose is no longer written. */
  wrecked: boolean;
  /** Player-facing name of what this racer last hit, for the wreck banner. */
  lastHit: string | null;
}

/** Player-facing name of what wrecked a racer, by the kind of the last thing it hit. */
const HIT_CAUSE: Partial<Record<Extract<RaceEvent, { type: 'hit' }>['kind'], string>> = {
  pillar: 'a rock pillar',
  archLeg: 'an arch',
  boulder: 'a boulder',
  racer: 'a rival',
  ceiling: 'the ceiling',
};

/** Player-facing name of a hazard, by what it does on the course. */
const HAZARD_CAUSE: Record<HazardDef['type'], string> = {
  blocker: 'a barrier',
  sweeper: 'cross traffic',
  dropper: 'falling debris',
  gust: 'a gust',
};

/** How each wreck breaks the craft up: a fall ends in a blast where it hits, the void in a tumble away. */
const WRECK_KIND: Record<CrashReason, WreckKind> = {
  destroyed: 'explode',
  obstacle: 'impact',
  hazard: 'impact',
  fell: 'explode',
  offEdge: 'explode',
  splash: 'impact',
  lost: 'fall',
  loopStall: 'fall',
};

/** Wrecks that end a fall off the course: the debris lands on the floor the craft hit. */
const FALL_ENDS = new Set<CrashReason>(['fell', 'offEdge', 'splash']);

/**
 * The session's state that belongs to one start from the grid. A restart replaces it whole, so
 * nothing a run showed (a wreck's slow motion, its banner, a countdown, a flashed name) can
 * carry into the next one.
 */
interface RunState {
  /** Sim time owed to the fixed step. */
  acc: number;
  countdown: number | null;
  countdownClearAt: number;
  /** How hard a wall and rough ground battered the player this frame, for the scrape and rumble loops. */
  scrapeLevel: number;
  roughLevel: number;
  /** The named way (shortcut, route) last flashed for the player; null on plain main road. */
  shownPath: string | null;
  /** The sprint sector last shown (sprints count sectors where circuits count laps). */
  shownSector: number;
  finishedFor: number;
  /** Set once the player is wrecked: drives the slow-motion cinematic, then ends the race. */
  playerWreck: WreckInfo | null;
  wreckFor: number;
  wreckBannerShown: boolean;
}

function freshRun(): RunState {
  return { acc: 0, countdown: null, countdownClearAt: 0, scrapeLevel: 0, roughLevel: 0, shownPath: null, shownSector: 1, finishedFor: 0, playerWreck: null, wreckFor: 0, wreckBannerShown: false };
}

export class RaceSession {
  private readonly ctx: SessionContext;
  private readonly request: RaceRequest;
  private readonly onDone: RaceDone;
  /** The graphics safety net's view of this race's frame rate. */
  private readonly slowWatch = new SlowFrameWatch();
  private readonly track: Track;
  private race: Race;
  private readonly scene = new THREE.Scene();
  private readonly env: { dispose(): void };
  private readonly trackScene: TrackScene;
  private readonly views: RacerView[] = [];
  private readonly cam: ChaseCamera;
  /** Takes the chase camera's lens over while the player's debris flies. */
  private readonly wreckCam: WreckCamera;
  /** A sprint's end: the vista once the player rests in the force field (null on a circuit). */
  private readonly vista: VistaCamera | null;
  private readonly debris = emptyDebris();
  private readonly effects: Effects;
  private readonly speedLines: SpeedLines;
  /** The wake streaming round the player's craft while it drafts. */
  private readonly draftLines: SpeedLines;
  private readonly hud: Hud;
  private readonly input: InputSource;
  private readonly hudRoot: HTMLElement;
  private clock = 0;
  /** What this start (or restart) has shown so far; replaced whole on a restart. */
  private run: RunState = freshRun();
  private readonly minimap: Minimap;
  private readonly dotColors: string[];
  private paused = false;
  private done = false;
  private pauseClose: (() => void) | null = null;
  private readonly onVisibility = () => {
    if (document.hidden) this.pause();
  };
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpVel = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  /** Every entrant as the audio hears it (live positions); the player's entry stays inactive. */
  private readonly audioRivals: AudioRival[];
  private readonly playerStyle: RacerStyle;
  private readonly frameRight = new THREE.Vector3();
  private telemetry: TelemetryRecorder;
  /** On-screen fps / draw-call readout, when the debug flag asks for it. */
  private readonly perf: PerfOverlay | null;
  private fpsSmoothed = 0;
  /** The world's live look (null: drawn as before the look pass), its post pipeline and glider reflections. */
  private readonly look: ActiveLook | null;
  private readonly post: PostFx | null;
  private readonly gliderEnv: { texture: THREE.Texture; dispose(): void } | null;
  /** Thruster light on the road under each glider; part of the wet road, so it follows that switch. */
  private readonly glowPools: GlowPools | null;
  /** The shared renderer's tone mapping before this race, restored for the garage after it. */
  private readonly toneMappingBefore: { mapping: THREE.ToneMapping; exposure: number };
  private readonly roadFrame = makeFrame();
  private readonly roadUp = new THREE.Vector3();
  /** A time trial's ghost, splits and HUD; null in a race against the field. */
  private readonly trial: TrialSession | null;

  constructor(ctx: SessionContext, request: RaceRequest, onDone: RaceDone) {
    this.ctx = ctx;
    this.request = request;
    this.onDone = onDone;
    const def = trackById(request.trackId);
    this.track = new Track(def, courseBounds(def.id));
    this.race = this.newRace();
    this.telemetry = new TelemetryRecorder(request, ctx.settings, this.race.config.physics, __BUILD__);

    const renderer = ctx.renderer;
    const level = graphicsLevel(ctx.settings);
    const detail = GRAPHICS_PROFILE[level].detail;
    this.look = resolveLook(worldOfTrack(def.id).biome, level, loadDebugFlags(ctx.store).look, PostFx.supported(renderer), def.palette);
    this.toneMappingBefore = { mapping: renderer.toneMapping, exposure: renderer.toneMappingExposure };
    const look = this.look;
    if (look && !look.post) {
      // No render target: the materials tone-map themselves on the way to the canvas.
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = look.look.grade.materialExposure;
    }
    this.post = look?.post
      ? new PostFx(renderer, {
          bloom: look.bloom ? look.look.bloom : null,
          bloomShift: look.bloomShift,
          grade: look.look.grade,
          boostBlur: look.boostBlur ? look.look.boostBlur : null,
          wet: look.wetReflections ? look.look.wetRoad : null,
          haze: look.heatHaze ? look.look.heatHaze : null,
          aa: look.aa,
        })
      : null;
    this.gliderEnv = look?.gliders ? worldEnvironment(renderer, look.look.env, look.look.sunDir) : null;
    const finish = this.gliderEnv && look ? { envMap: this.gliderEnv.texture, look: look.look.gliders } : null;

    const air = atmosphere(detail, worldOfTrack(def.id).biome);
    this.env = applyEnvironment(this.scene, def.palette, air);
    this.trackScene = buildTrackScene(this.track, detail, look);
    // Scenery standing in the drivable envelope is a build bug: a dev build refuses the race, a
    // live one races on and says so in the console.
    reportClearance(this.track, this.trackScene.clearance);
    if (import.meta.env.DEV && this.trackScene.clearance.length > 0) throw new Error(`clearance audit: scenery stands in the course on ${def.id} (see the console)`);
    this.scene.add(this.trackScene.group);
    this.glowPools = look?.wetSheen
      ? new GlowPools(this.track, request.entrants.map((e) => racerById(e.racerId).visual.glow), look.look.glowPool)
      : null;
    if (this.glowPools) this.scene.add(this.glowPools.mesh);

    for (const e of request.entrants) {
      const model = createRacerModel(racerById(e.racerId).visual, {
        detail: e.isPlayer || detail === 'high' ? 'high' : 'low',
        finish,
      });
      this.scene.add(model.root);
      this.views.push({
        model,
        prev: emptySnapshot(),
        curr: emptySnapshot(),
        draw: emptySnapshot(),
        wasBoosting: false,
        offroad: false,
        wrecked: false,
        lastHit: null,
      });
    }
    this.syncSnapshots(true);
    this.audioRivals = request.entrants.map((e, i) => ({ position: this.views[i].model.root.position, speed: 0, style: racerById(e.racerId).visual.style, active: false }));
    this.playerStyle = racerById(request.entrants[this.playerIndex()].racerId).visual.style;
    ctx.audio.environment.start(this.track, sceneryById(request.trackId));

    const size = ctx.renderer.getSize(new THREE.Vector2());
    this.cam = new ChaseCamera(size.x / size.y);
    if (air.far !== null) {
      this.cam.camera.far = air.far;
      this.cam.camera.updateProjectionMatrix();
    }
    this.wreckCam = new WreckCamera(this.cam.camera);
    // The best view from a sprint's end: the gas giant in space (framed on its top, which a moon's
    // ground never hides), elsewhere the land beyond the road's end.
    const ahead = this.track.frameAt(this.track.length).tangent;
    const view = air.sky === 'space' ? planetTopDirection(def.palette) : new THREE.Vector3(ahead.x, 0, ahead.z);
    this.vista = this.track.course === 'sprint' ? new VistaCamera(this.cam.camera, view) : null;
    this.scene.add(this.cam.camera);
    this.effects = new Effects(this.scene, detail);
    this.speedLines = new SpeedLines(this.cam.camera);
    this.draftLines = new SpeedLines(this.cam.camera, DRAFT_STREAKS);

    this.hudRoot = document.createElement('div');
    this.hudRoot.className = 'race-layer';
    ctx.uiRoot.appendChild(this.hudRoot);
    this.hud = createHud(this.hudRoot, () => this.pause());
    this.input = createInput(this.hudRoot, ctx.settings);
    this.minimap = createMinimap(this.hudRoot, this.track);
    this.perf = loadDebugFlags(ctx.store).perfOverlay ? createPerfOverlay(this.hudRoot) : null;
    this.dotColors = request.entrants.map((e) => `#${racerById(e.racerId).visual.primary.toString(16).padStart(6, '0')}`);
    this.trial = request.mode === 'timeTrial' ? this.createTrial() : null;
    if (this.trial) this.hudRoot.classList.add('race-layer--trial');
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private createTrial(): TrialSession {
    const player = this.request.entrants[this.playerIndex()];
    return new TrialSession({
      track: this.track,
      scene: this.scene,
      hudRoot: this.hudRoot,
      ghosts: this.ctx.ghosts,
      setup: { glider: player.racerId, upgrades: this.request.upgrades ?? fail('a time trial request carries the glider\'s upgrades'), physics: { ...this.race.config.physics }, build: __BUILD__ },
      debug: loadDebugFlags(this.ctx.store).enabled,
      retry: () => this.restart(),
      tracks: () => this.finish(null, 'back'),
      menu: () => this.finish(null, 'menu'),
    });
  }

  /** Each start (and restart) races with the owner's physics tuning as it stands then. */
  private newRace(): Race {
    const physics = loadDebugFlags(this.ctx.store).physics;
    // A time trial's laps each start alike, so they compare: refitted at every line.
    return new Race(this.track, { laps: this.request.laps, seed: this.request.seed, entrants: this.request.entrants, physics, refitEachLap: this.request.mode === 'timeTrial' });
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
    this.post?.resize();
  }

  pause() {
    // A trial's summary has its own buttons; a pause menu over it would only repeat them.
    if (this.paused || this.done || this.trial?.isOver) return;
    this.paused = true;
    this.ctx.audio.stopRaceSounds();
    this.pauseClose = showPauseMenu(this.ctx.uiRoot, {
      resume: () => this.resume(),
      restart: () => this.restart(),
      quit: () => (this.trial ? this.leaveTrial() : this.finish(null, 'back')),
    });
  }

  /** Quitting a trial ends it on its summary, the scene held still (still paused) where the player left it. */
  private leaveTrial() {
    this.pauseClose?.();
    this.pauseClose = null;
    this.endTrial();
  }

  private resume() {
    this.pauseClose?.();
    this.pauseClose = null;
    this.paused = false;
  }

  /**
   * Back to the grid: the pause menu's RESTART, a trial's ↻ (or R) and its summary's RETRY all
   * come here, mid-run, mid-wreck or after the end. Everything the last run put on screen goes:
   * its state, the HUD's banner and messages, the wreck's camera, debris, fire and slow motion.
   */
  private restart() {
    this.resume();
    this.saveTrialLog();
    this.race = this.newRace();
    this.trial?.restart({ ...this.race.config.physics });
    this.telemetry = new TelemetryRecorder(this.request, this.ctx.settings, this.race.config.physics, __BUILD__);
    // With no wreck in the new run, the chase camera takes the lens back from the wreck camera.
    this.run = freshRun();
    this.hud.reset();
    this.effects.clear();
    this.cam.reset();
    this.trackScene.resetCells();
    this.vista?.reset();
    this.ctx.audio.setTimeScale(1);
    this.syncSnapshots(true);
    for (const v of this.views) {
      if (v.wrecked) v.model.reset();
      v.wrecked = false;
      v.lastHit = null;
      v.offroad = false;
      v.wasBoosting = false;
      v.model.root.visible = true;
    }
  }

  /** `exit`: where a race without an outcome (quit, or a trial left) goes. */
  private finish(outcome: RaceOutcome | null, exit: RaceExit) {
    if (this.done) return;
    this.done = true;
    // A quit race isn't worth a log: there is no outcome to explain. A trial is only ever left
    // (it pays nothing and has no outcome), and logs each run that set a time.
    if (this.trial) this.saveTrialLog();
    else if (outcome) saveTelemetry(this.telemetry.finish(outcome));
    this.dispose();
    this.onDone(outcome, { sustainedSlow: this.slowWatch.sustainedSlow }, exit);
  }

  /** The run's log, once it has a lap: the race as it stands, with its lap times and physics. */
  private saveTrialLog() {
    if (!this.trial || this.trial.lapsDone === 0) return;
    saveTelemetry(this.telemetry.finish({ request: this.request, results: this.race.results(), playerWreck: this.run.playerWreck }, this.trial.telemetry()));
  }

  /**
   * A trial ended: in a wreck or at the line, the scene plays on behind its summary; left from
   * the pause menu, it holds still. Left during a wreck or past the line, that is how it ended.
   */
  private endTrial(): void {
    const wreck = this.run.playerWreck;
    this.trial?.end(wreck ? { kind: 'wreck', wreck } : this.player().finishTime !== null ? { kind: 'finished' } : { kind: 'left' });
  }

  /** Advance and draw one display frame. */
  frame(dtRaw: number) {
    if (this.done) return;
    const real = Math.min(dtRaw, SESSION_MAX_FRAME_DT);
    const scale = this.timeScale();
    const dt = real * scale;
    if (!this.paused) {
      if (this.run.playerWreck) {
        this.run.wreckFor += real;
        // Let the first moments of the break-up play clean before the banner lands.
        if (!this.run.wreckBannerShown && this.run.wreckFor >= SESSION_WRECK_BANNER_DELAY) {
          this.run.wreckBannerShown = true;
          this.hud.wrecked(this.run.playerWreck);
        }
        this.ctx.audio.setTimeScale(scale);
        if (this.run.wreckFor >= SESSION_WRECK_LINGER) {
          if (this.trial) this.endTrial();
          else {
            this.finish({ request: this.request, results: this.race.results(), playerWreck: this.run.playerWreck }, 'back');
            return;
          }
        }
      }
      this.clock += dt;
      this.run.acc += dt;
      this.telemetry.frame(real);
      this.slowWatch.frame(dtRaw);
      const input: PlayerInput = this.input.read();
      while (this.run.acc >= SIM_DT) {
        this.run.acc -= SIM_DT;
        const events = this.race.step(input);
        this.telemetry.step(this.race, input, events);
        this.trial?.step(this.race, events);
        // A nudge is a displacement, not a rate: it must land on exactly one step.
        input.nudge = 0;
        this.syncSnapshots(false);
        for (const ev of events) this.handleEvent(ev);
      }
      if (this.race.phase === 'finished' && !this.run.playerWreck) {
        this.run.finishedFor += dt;
        // A sprint's results wait for the player to have taken in the view from its end.
        if (this.run.finishedFor >= SESSION_FINISH_LINGER && (this.vista === null || this.vista.shown >= SESSION_VISTA_LINGER)) {
          if (this.trial) this.endTrial();
          else {
            this.finish({ request: this.request, results: this.race.results(), playerWreck: null }, 'back');
            return;
          }
        }
      }
    }
    this.draw(dt, real);
  }

  private handleEvent(ev: RaceEvent) {
    const audio = this.ctx.audio;
    const pi = this.playerIndex();
    const pid = this.request.entrants[pi].id;
    switch (ev.type) {
      case 'countdown':
        this.run.countdown = ev.n;
        audio.oneShot(ev.n === 0 ? 'go' : 'countdown');
        if (ev.n === 0) this.run.countdownClearAt = this.clock + SESSION_GO_SHOWN;
        return;
      case 'scrape': {
        const i = this.indexOf(ev.id);
        if (this.nearCamera(i)) this.wallSparks(i, ev.side, ev.intensity);
        if (ev.id === pid) {
          this.cam.addShake(SESSION_SHAKE_SCRAPE * ev.intensity);
          this.run.scrapeLevel = Math.max(this.run.scrapeLevel, ev.intensity);
        }
        return;
      }
      case 'rough':
        if (ev.id === pid) {
          this.cam.addShake(SESSION_SHAKE_ROUGH * ev.intensity);
          this.run.roughLevel = Math.max(this.run.roughLevel, ev.intensity);
        }
        return;
      case 'jolt': {
        const i = this.indexOf(ev.id);
        if (this.nearCamera(i)) {
          this.worldPos(i, this.tmpPos);
          this.effects.landing(this.tmpPos, ev.intensity * SESSION_JOLT_IMPACT);
        }
        if (ev.id === pid) {
          audio.oneShot('hit', ev.intensity * SESSION_JOLT_IMPACT);
          this.cam.addShake(SESSION_SHAKE_JOLT * ev.intensity);
        }
        return;
      }
      case 'hit':
        this.views[this.indexOf(ev.id)].lastHit = this.hitCause(ev);
        if (ev.id === pid) {
          audio.oneShot('hit', ev.intensity);
          this.cam.addShake(SESSION_SHAKE_HIT * ev.intensity);
        }
        return;
      case 'crash': {
        const i = this.indexOf(ev.id);
        const v = this.views[i];
        const root = v.model.root;
        // The craft keeps most of its momentum: it was flying forward at its last speed, or,
        // falling off the course, along its flight.
        const r = this.race.racers[i];
        if (r.fall !== null) this.tmpVel.set(r.fall.vel.x, r.fall.vel.y, r.fall.vel.z);
        else this.tmpVel.set(0, 0, -1).applyQuaternion(root.quaternion).multiplyScalar(Math.max(v.prev.speed, v.curr.speed));
        const kind = WRECK_KIND[ev.reason];
        root.visible = true;
        // A fall ends where the craft is now: pose it at its impact, and lay the debris on that floor.
        if (r.fall !== null) {
          snapshot(r, v.draw);
          poseObject(this.track, v.draw, root);
        }
        const groundY = FALL_ENDS.has(ev.reason) ? this.track.ribbon(r.branch).floorAt(r.s) : undefined;
        v.model.shatter(this.tmpVel, { kind, groundY });
        if (ev.reason === 'splash') this.effects.splash(root.position, this.tmpVel);
        else if (kind !== 'fall') this.effects.wreck(root.position, this.tmpVel, racerById(this.request.entrants[i].racerId).visual.glow);
        v.wrecked = true;
        if (ev.id === pid) {
          // A hull worn out by many knocks still names the last one: it is what the player saw.
          const cause = ev.reason === 'obstacle' || ev.reason === 'hazard' || ev.reason === 'destroyed' ? v.lastHit : null;
          this.run.playerWreck = { reason: ev.reason, cause };
          // From where the player last saw the craft: the interpolated pose, not the raw step.
          this.wreckCam.begin(this.track.ribbon(v.draw.branch), v.draw.s, v.model.debris(this.debris));
          audio.oneShot('wreck');
        }
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
      case 'pickup':
        if (ev.id === pid) {
          this.trackScene.collectCell(ev.item, ev.branch, ev.cell);
          if (ev.item === 'repair') {
            this.hud.pulseRepair();
            audio.oneShot('repair');
          } else {
            this.hud.pulseBoost();
            audio.oneShot('pickup');
          }
        }
        return;
      case 'tankEmpty':
        if (ev.id === pid) audio.oneShot('tankEmpty');
        return;
      case 'lap':
        // Each lap the player may collect every cell again.
        if (ev.id === pid) this.trackScene.resetCells();
        // A trial's own HUD times each lap, and its lap cap is no final lap to announce.
        if (ev.id === pid && ev.lap < this.request.laps && !this.trial) {
          audio.oneShot('lap');
          this.hud.flash(ev.lap === this.request.laps - 1 ? 'FINAL LAP' : `LAP ${ev.lap + 1}`);
        }
        return;
      case 'finish':
        if (ev.id === pid) {
          audio.oneShot('finish');
          // Alone, first place says nothing: the trial's panel shows the time instead.
          if (!this.trial) this.hud.flash(ordinal(ev.place));
        }
        return;
      case 'refit':
        // A time trial's lap line: the bars that came back flash, as a cell's pickup does.
        if (ev.id === pid) {
          if (ev.hull) this.hud.pulseRepair();
          if (ev.tank) this.hud.pulseBoost();
        }
        return;
      case 'launch':
        if (ev.id === pid) audio.oneShot('launch');
        return;
      case 'falseStart':
      case 'perfectStart':
        if (ev.id === pid) {
          audio.oneShot(ev.type);
          this.hud.flash(ev.type === 'falseStart' ? 'FALSE START!' : 'PERFECT START!');
        }
        return;
      case 'offroad':
        this.views[this.indexOf(ev.id)].offroad = ev.on;
        return;
      case 'slingshot':
        if (ev.id === pid) {
          audio.oneShot('slingshot');
          this.hud.flash('SLINGSHOT!');
        }
        return;
    }
  }

  private hitCause(ev: Extract<RaceEvent, { type: 'hit' }>): string | null {
    if (ev.kind !== 'hazard') return HIT_CAUSE[ev.kind] ?? null;
    const id = ev.hazard;
    const h = [this.track, ...this.track.branches.map((b) => b.ribbon)].flatMap((r) => r.hazards).find((x) => x.def.id === id);
    if (!h) throw new Error(`raceSession: hit by unknown hazard "${id}"`);
    return HAZARD_CAUSE[h.def.type];
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
    // The player's own shock ring spawns right in front of the lens and fills the screen.
    if (i === this.playerIndex()) return;
    const root = this.views[i].model.root;
    this.tmpDir.set(0, 0, -1).applyQuaternion(root.quaternion);
    this.effects.boostBurst(root.position, this.tmpDir, racerById(this.request.entrants[i].racerId).visual.glow);
  }

  /** `dt`: race seconds (slowed during the wreck); `real`: display seconds. */
  private draw(dt: number, real: number) {
    if (this.run.countdown === 0 && this.clock >= this.run.countdownClearAt) this.run.countdown = null;
    const alpha = this.paused ? 1 : this.run.acc / SIM_DT;
    const pi = this.playerIndex();
    this.race.racers.forEach((r, i) => {
      const v = this.views[i];
      if (!v.wrecked) {
        lerpSnapshot(this.track, v.prev, v.curr, alpha, v.draw);
        poseObject(this.track, v.draw, v.model.root);
        v.model.root.visible = i === pi || v.model.root.position.distanceTo(this.cam.camera.position) >= CAM_HIDE_NEAR;
      }
      this.glowPools?.update(i, v.draw, r.boosting, v.wrecked);
      const stats = this.request.entrants[i].stats;
      v.model.update(dt, this.clock, {
        speed: r.speed,
        topSpeed: stats.topSpeed,
        boosting: r.boosting,
        heat: r.boosting ? SESSION_BOOST_NOZZLE_HEAT : SESSION_IDLE_NOZZLE_HEAT,
        damage: r.damage,
        steer: r.steer,
        groundColor: this.trackScene.groundColorAt(r.branch, r.s, r.x),
        airborne: r.airborne,
        crashed: r.crashed > 0,
      });
      if (r.boosting && !v.wasBoosting && this.nearCamera(i)) {
        this.burst(i);
        if (i === pi) this.ctx.audio.oneShot('boostStart');
      }
      v.wasBoosting = r.boosting;
      this.audioRivals[i].speed = r.speed;
      this.audioRivals[i].active = i !== pi && !v.wrecked;
      if (r.crashed <= 0 && !r.airborne && this.nearCamera(i)) {
        // Dust inherits the racer's velocity so it streams past the chase camera.
        this.tmpVel.set(0, 0, -1).applyQuaternion(v.model.root.quaternion).multiplyScalar(r.speed);
        const amount = Math.min(1, r.speed / stats.topSpeed) * (v.offroad ? SESSION_OFFROAD_DUST : 1);
        this.effects.dust(v.model.root.position, this.tmpVel, amount, this.trackScene.groundColorAt(r.branch, r.s, r.x));
      }
    });

    this.trial?.draw(alpha, this.cam.camera);
    const p = this.player();
    const top = this.request.entrants[pi].stats.topSpeed;
    const speedFrac = p.speed / top;
    const pv = this.views[pi].draw;
    if (this.run.playerWreck) this.wreckCam.update(dt, real, this.views[pi].model.debris(this.debris));
    // The camera follows the interpolated pose, not the raw step, or it judders.
    else if (!this.vista?.update(this.paused ? 0 : real, this.views[pi].model.root.position, p.finishTime !== null && p.speed === 0)) {
      this.cam.update(dt, this.track, { ...p, branch: pv.branch, s: pv.s, x: pv.x, y: pv.y, fall: pv.falling ? pv.fall : null }, speedFrac, this.clock);
    }
    // Entering a shortcut or a fork's route (the main road's own route included) names it.
    const path = this.track.pathNameAt(pv.branch, pv.s);
    if (path !== this.run.shownPath) {
      if (path !== null) this.hud.flash(path.toUpperCase());
      this.run.shownPath = path;
    }
    const stage = this.stage(p);
    if (stage.kind === 'sector' && stage.n !== this.run.shownSector) {
      this.run.shownSector = stage.n;
      if (p.finishTime === null) {
        this.ctx.audio.oneShot('lap');
        this.hud.flash(stage.n === stage.of ? 'FINAL SECTOR' : `SECTOR ${stage.n}`);
      }
    }
    this.minimap.update(this.race.racers, pi, this.dotColors);
    this.speedLines.update(dt, Math.max(0, Math.min(1, (speedFrac - 0.45) * 1.6)) + (p.boosting ? 0.35 : 0));
    // A wrecked player has no wake to ride; its draft only decays in the sim.
    this.draftLines.update(dt, this.run.playerWreck ? 0 : p.draft);
    this.effects.update(dt, this.cam.camera);
    this.trackScene.pressField(this.race.racers, this.race.time);
    // Hazards run on race time: the scene must show exactly what the simulation collides with.
    this.trackScene.update(this.race.time, this.cam.camera.position);

    if (!this.paused && !this.run.playerWreck) {
      const surface = this.ctx.audio.environment.surfaceAt(p.branch, p.s, p.x);
      this.ctx.audio.engine({ speed: p.speed, topSpeed: top, boosting: p.boosting, airborne: p.airborne, style: this.playerStyle, surface });
      this.ctx.audio.wind(Math.min(1, speedFrac));
      this.ctx.audio.scrapeLoop(this.run.scrapeLevel);
      this.ctx.audio.rumbleLoop(this.run.roughLevel);
      this.run.roughLevel = 0;
      this.ctx.audio.draft(p.draft);
      this.run.scrapeLevel = 0;
    }
    // The world keeps sounding through the wreck cinematic; hazards run on race time.
    if (!this.paused) {
      this.cam.camera.getWorldDirection(this.tmpDir);
      this.ctx.audio.environment.update({ time: this.race.time, listener: this.cam.camera.position, forward: this.tmpDir, rivals: this.audioRivals });
    }
    this.hud.update({
      speedKmh: Math.round(p.speed * MS_TO_KMH),
      place: p.place,
      racers: this.race.racers.length,
      stage,
      time: this.race.time,
      bestLap: this.track.course === 'sprint' ? null : p.bestLap,
      boost: p.boost,
      damage: p.damage,
      boosting: p.boosting,
      draft: p.draft,
      countdown: this.run.countdown,
      finished: p.finishTime !== null,
    });
    this.input.showTank(p.boost);
    if (this.post) {
      const up = this.track.ribbon(pv.branch).frameAt(pv.s, this.roadFrame).up;
      this.roadUp.set(up.x, up.y, up.z);
      const ribbon = this.track.ribbon(pv.branch);
      const ahead = this.look?.look.wetRoad.curlLookAhead ?? 0;
      const curling = ribbon.isMagnet(pv.s) || ribbon.isMagnet(pv.branch >= 0 ? Math.min(ribbon.length, pv.s + ahead) : pv.s + ahead);
      this.post.render(this.scene, this.cam.camera, { dt, boosting: p.boosting && !this.run.playerWreck, speedFrac, roadUp: this.roadUp, curling });
    } else {
      this.ctx.renderer.render(this.scene, this.cam.camera);
    }
    if (this.perf) {
      const info = this.ctx.renderer.info.render;
      const fps = dt > 0 ? 1 / dt : 0;
      this.fpsSmoothed += (fps - this.fpsSmoothed) * SESSION_FPS_SMOOTHING;
      this.perf.update({ fps: this.fpsSmoothed, drawCalls: info.calls, triangles: info.triangles, look: describeLook(this.look) });
    }
  }

  /** Lap of a circuit, or sector of a sprint: SPRINT_SECTORS equal shares of its distance. */
  private stage(p: RacerState): HudView['stage'] {
    if (this.track.course === 'circuit') return { kind: 'lap', n: Math.min(this.request.laps, p.lap + 1), of: this.request.laps };
    const done = p.finishTime !== null ? 1 : Math.max(0, p.distance) / this.track.raceLength;
    return { kind: 'sector', n: Math.min(SPRINT_SECTORS, Math.floor(done * SPRINT_SECTORS) + 1), of: SPRINT_SECTORS };
  }

  /** Slow motion while the player's craft comes apart, easing back to real time. */
  private timeScale(): number {
    if (!this.run.playerWreck) return 1;
    const t = this.run.wreckFor;
    if (t < SESSION_WRECK_SLOWMO_HOLD) return SESSION_WRECK_SLOWMO;
    const u = Math.min(1, (t - SESSION_WRECK_SLOWMO_HOLD) / SESSION_WRECK_SLOWMO_EASE);
    return SESSION_WRECK_SLOWMO + (1 - SESSION_WRECK_SLOWMO) * u * u;
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.ctx.audio.stopRaceSounds();
    this.pauseClose?.();
    this.input.dispose();
    this.minimap.dispose();
    this.perf?.dispose();
    this.trial?.dispose();
    this.hud.dispose();
    this.hudRoot.remove();
    this.speedLines.dispose();
    this.draftLines.dispose();
    this.effects.dispose();
    for (const v of this.views) v.model.dispose();
    this.trackScene.dispose();
    this.env.dispose();
    this.post?.dispose();
    this.gliderEnv?.dispose();
    this.glowPools?.dispose();
    this.ctx.renderer.toneMapping = this.toneMappingBefore.mapping;
    this.ctx.renderer.toneMappingExposure = this.toneMappingBefore.exposure;
  }
}

function fail(why: string): never {
  throw new Error(`raceSession: ${why}`);
}

function ordinal(n: number): string {
  const suffix = n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH';
  return `${n}${suffix}!`;
}
