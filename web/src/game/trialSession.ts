// The time trial inside a race session: the headless TrialRun, the ghost drawn from its best,
// and the trial HUD. The session calls step() after each sim step and draw() each frame, and
// end() when the trial ends (a sprint's finish, the lap cap, a wreck, or the player leaving
// from the pause menu), which puts up the summary.
import * as THREE from 'three';
import type { Race } from '../core/race.ts';
import type { Track } from '../core/track.ts';
import type { RaceEvent } from '../core/types.ts';
import { racerById } from '../data/racers.ts';
import { SIM_DT } from '../data/tuning.ts';
import { GhostModel } from '../render/ghostModel.ts';
import { createTrialHud, type TrialEnd, type TrialHud } from '../ui/trialHud.ts';
import { wreckCopy } from '../ui/wreckCopy.ts';
import type { WreckInfo } from './types.ts';
import { ghostPoseAt, type GhostPose } from './ghost.ts';
import type { GhostStorage, TrialPhysics } from './ghostStore.ts';
import { TrialRun, type TrialSetup } from './timeTrial.ts';
import { GHOST_HIDE_AHEAD } from './trialTuning.ts';

/** What a time-trial run adds to its race log. */
export interface TrialTelemetry {
  laps: number[];
  best: number | null;
  physics: TrialPhysics;
  /** The ghost the run started against. */
  ghost: { time: number; glider: string; physics: TrialPhysics; physicsBase: number; build: string; date: string } | null;
}

export interface TrialSessionDeps {
  track: Track;
  scene: THREE.Scene;
  hudRoot: HTMLElement;
  ghosts: GhostStorage;
  setup: TrialSetup;
  debug: boolean;
  retry(): void;
  /** Back to the track picker. */
  tracks(): void;
  menu(): void;
}

/** How a trial ended: in a wreck, at the line (a sprint's finish or the lap cap), or left from the pause menu. */
export type TrialEndReason = { kind: 'wreck'; wreck: WreckInfo } | { kind: 'finished' } | { kind: 'left' };

export class TrialSession {
  private readonly deps: TrialSessionDeps;
  private run: TrialRun;
  /** The glider and physics this run races with (a restart picks up the physics afresh). */
  private setup: TrialSetup;
  private readonly hud: TrialHud;
  private ghostModel: GhostModel | null = null;
  private readonly toGhost = new THREE.Vector3();
  private readonly lens = new THREE.Vector3();
  private readonly pose: GhostPose = { branch: -1, s: 0, x: 0, y: 0, yaw: 0, pitch: 0, roll: 0, boosting: false };
  private startGhost: TrialTelemetry['ghost'];
  /** The trial is over: the summary waits for RETRY, CHANGE TRACK or MENU. */
  private over = false;

  constructor(deps: TrialSessionDeps) {
    this.deps = deps;
    this.setup = deps.setup;
    this.run = new TrialRun(deps.track, deps.ghosts, this.setup);
    this.startGhost = this.ghostSummary();
    this.hud = createTrialHud(deps.hudRoot, { debug: deps.debug, retry: deps.retry, tracks: deps.tracks, menu: deps.menu });
    this.syncGhostModel();
  }

  /** The summary is up. */
  get isOver(): boolean {
    return this.over;
  }

  /** Laps done this run; a run without one leaves no log. */
  get lapsDone(): number {
    return this.run.laps.length;
  }

  step(race: Race, events: readonly RaceEvent[]): void {
    for (const ev of this.run.step(race, events)) {
      if (ev.type === 'split') this.hud.split(ev.sector, ev.time, ev.delta);
      else if (ev.type === 'lap') this.hud.lap(ev.result, this.deps.track.course === 'sprint');
      else if (ev.type === 'refit') this.hud.refit(ev.hull, ev.tank);
      else {
        console.info(`time trial: new best ${ev.record.run.time.toFixed(3)} s on ${ev.record.trackId}, ghost stored (${ev.bytes} bytes)`);
        this.syncGhostModel();
      }
    }
  }

  /** `alpha`: how far the drawn frame is between the last two sim steps, as the racers are drawn. */
  draw(alpha: number, camera: THREE.Camera): void {
    const lapTime = this.run.lapTime - (1 - alpha) * SIM_DT;
    const ghost = this.run.ghost;
    const model = this.ghostModel;
    if (model) {
      const pose = ghost ? ghostPoseAt(this.deps.track, ghost.run, lapTime, this.pose) : null;
      model.show(pose ? this.deps.track.ribbon(pose.branch) : null, pose);
      // Behind the player, a ghost sits at or behind the lens and would fill the screen.
      camera.getWorldDirection(this.lens);
      if (pose && this.toGhost.subVectors(model.root.position, camera.position).dot(this.lens) < GHOST_HIDE_AHEAD) model.hide();
    }
    const sprint = this.deps.track.course === 'sprint';
    this.hud.update({
      stage: sprint ? 'SPRINT' : `LAP ${this.run.lapNumber}`,
      lapTime: this.over && sprint ? (this.run.lastLap ?? lapTime) : Math.max(0, lapTime),
      delta: this.over ? null : this.run.liveDelta(),
      best: sprint ? null : this.run.bestLap,
      last: sprint ? null : this.run.lastLap,
    });
  }

  /** The trial is over: the summary of the run. Later calls (the session asks every frame) keep it. */
  end(reason: TrialEndReason): void {
    if (this.over) return;
    this.over = true;
    this.hud.summary(this.run.summary(), this.endCopy(reason));
  }

  private endCopy(reason: TrialEndReason): TrialEnd {
    const sprint = this.deps.track.course === 'sprint';
    switch (reason.kind) {
      case 'wreck': {
        const copy = wreckCopy(reason.wreck);
        return { title: copy.title, sub: copy.sub, sprint };
      }
      case 'finished':
        return { title: sprint ? 'FINISHED' : `${this.run.laps.length} LAPS`, sub: null, sprint };
      case 'left':
        return { title: 'TRIAL OVER', sub: null, sprint };
    }
  }

  /** A fresh run from the grid against the (perhaps just replaced) best ghost, with the physics the new start races with. */
  restart(physics: TrialPhysics): void {
    this.setup = { ...this.setup, physics };
    this.run = new TrialRun(this.deps.track, this.deps.ghosts, this.setup);
    this.startGhost = this.ghostSummary();
    this.over = false;
    this.hud.reset();
    this.syncGhostModel();
  }

  telemetry(): TrialTelemetry {
    return { laps: [...this.run.laps], best: this.run.bestLap, physics: this.setup.physics, ghost: this.startGhost };
  }

  dispose(): void {
    this.hud.dispose();
    this.ghostModel?.dispose();
  }

  private ghostSummary(): TrialTelemetry['ghost'] {
    const g = this.run.ghost;
    return g ? { time: g.run.time, glider: g.glider, physics: g.physics, physicsBase: g.physicsBase, build: g.build, date: g.date } : null;
  }

  /** The ghost is drawn as the glider its run was set with: a new best in another glider rebuilds it. */
  private syncGhostModel(): void {
    const glider = this.run.ghost?.glider ?? null;
    if (this.ghostModel?.glider === glider) return;
    this.ghostModel?.dispose();
    this.ghostModel = glider === null ? null : new GhostModel(glider, racerById(glider).visual);
    if (this.ghostModel) this.deps.scene.add(this.ghostModel.root);
  }
}
