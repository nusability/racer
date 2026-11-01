// One time-trial run, headless: records the ghost, times the sectors and laps, reads the live
// delta to the best ghost by distance along the course, and replaces the stored ghost when a
// lap (or a sprint's run) beats it. The race session draws what this reports.
import { PHYSICS_BASE } from '../core/handling.ts';
import type { Race } from '../core/race.ts';
import type { Track } from '../core/track.ts';
import type { RaceEvent } from '../core/types.ts';
import type { UpgradeLevels } from '../data/upgrades.ts';
import { GhostClock, GhostRecorder, type GhostRun } from './ghost.ts';
import { loadGhost, saveGhost, type GhostRecord, type GhostStorage, type TrialPhysics } from './ghostStore.ts';
import { TRIAL_SECTORS } from './trialTuning.ts';

export interface LapResult {
  /** 1-based. */
  lap: number;
  time: number;
  /** The best to beat as the lap started (the ghost's time), null with no ghost yet. */
  best: number | null;
  /** time − best; negative is faster. */
  delta: number | null;
  /** Each sector's own time (they sum to the lap). */
  sectors: number[];
  /** Each sector against the ghost's same sector. */
  sectorDeltas: (number | null)[];
  newBest: boolean;
  /** The physics the lap was flown with, and the ghost's it was compared to. */
  physics: TrialPhysics;
  ghostPhysics: TrialPhysics | null;
}

/** The whole run, for the panel at its end. */
export interface TrialSummary {
  /** Every lap of the run in order (a sprint: its one run, once finished). */
  laps: LapResult[];
  /** The run's fastest lap; null before the first. */
  best: LapResult | null;
  /** The ghost the run started against (null with none): what the best is measured by. */
  ghost: { time: number; sectors: number[]; physics: TrialPhysics; physicsBase: number } | null;
  /** best − the start ghost; null without either. */
  delta: number | null;
  /** Each of the best lap's sectors against the start ghost's same sector. */
  sectorDeltas: (number | null)[];
  /** A lap of this run became the stored ghost. */
  ghostSaved: boolean;
  /** The physics the run was flown with, and the tuning base they sit on (core/handling.ts PHYSICS_BASE). */
  physics: TrialPhysics;
  physicsBase: number;
}

export type TrialEvent =
  /** A sector line inside the lap: `time` into the lap, against the ghost there. */
  | { type: 'split'; sector: number; time: number; delta: number | null }
  | { type: 'lap'; result: LapResult }
  /** The lap line refitted the craft (hull, tank, or both back to the race start's). */
  | { type: 'refit'; hull: boolean; tank: boolean }
  /** A new best is stored and is now the ghost. */
  | { type: 'ghost'; record: GhostRecord; bytes: number };

export interface TrialSetup {
  glider: string;
  upgrades: UpgradeLevels;
  physics: TrialPhysics;
  build: string;
}

export class TrialRun {
  private readonly track: Track;
  private readonly store: GhostStorage;
  private readonly setup: TrialSetup;
  private readonly recorder: GhostRecorder;
  private ghostRec: GhostRecord | null;
  private clock: GhostClock | null;
  /** Lap distance and lap time at the last step, for the sector lines crossed since. */
  private prevD: number | null = null;
  private prevT = 0;
  private splits: number[] = [];
  /** The ghost's own sector times at each line, read once per ghost. */
  private ghostSplits: number[] = [];
  /** The best to beat as the current lap started. */
  private lapBest: number | null;
  private lapGhostPhysics: TrialPhysics | null;
  private curD = 0;
  /** Every lap of this run, in order. */
  private readonly results: LapResult[] = [];
  /** The ghost as the run started, kept for its summary while a new best replaces the live one. */
  private readonly startGhost: TrialSummary['ghost'];
  private ghostSaved = false;

  constructor(track: Track, store: GhostStorage, setup: TrialSetup) {
    this.track = track;
    this.store = store;
    this.setup = setup;
    this.recorder = new GhostRecorder(track);
    this.ghostRec = loadGhost(store, track.def.id);
    this.clock = null;
    this.useGhost(this.ghostRec);
    this.lapBest = this.ghostRec?.run.time ?? null;
    this.lapGhostPhysics = this.ghostRec?.physics ?? null;
    const g = this.ghostRec;
    this.startGhost = g ? { time: g.run.time, sectors: sectorTimes(this.ghostSplits, g.run.time), physics: g.physics, physicsBase: g.physicsBase } : null;
  }

  get ghost(): GhostRecord | null {
    return this.ghostRec;
  }

  /** Seconds into the lap in progress (0 before GO). */
  get lapTime(): number {
    return this.recorder.lapTime;
  }

  /** Every lap time of this run, in order. */
  get laps(): number[] {
    return this.results.map((r) => r.time);
  }

  get lapNumber(): number {
    return this.results.length + 1;
  }

  get bestLap(): number | null {
    return this.best()?.time ?? null;
  }

  get lastLap(): number | null {
    return this.results.at(-1)?.time ?? null;
  }

  summary(): TrialSummary {
    const best = this.best();
    const ghost = this.startGhost;
    return {
      laps: [...this.results],
      best,
      ghost,
      delta: best && ghost ? best.time - ghost.time : null,
      sectorDeltas: best ? best.sectors.map((s, i) => (ghost ? s - ghost.sectors[i] : null)) : [],
      ghostSaved: this.ghostSaved,
      physics: this.setup.physics,
      physicsBase: PHYSICS_BASE,
    };
  }

  private best(): LapResult | null {
    return this.results.reduce<LapResult | null>((a, r) => (a === null || r.time < a.time ? r : a), null);
  }

  /** The player against the ghost at the same point of the lap, s (negative: ahead); null with no ghost. */
  liveDelta(): number | null {
    if (!this.clock || this.prevD === null) return null;
    return this.lapTime - this.clock.timeAt(this.curD);
  }

  /** Call after every sim step with that step's events. */
  step(race: Race, events: readonly RaceEvent[]): TrialEvent[] {
    if (race.phase === 'countdown') return [];
    const p = race.player();
    const out: TrialEvent[] = [];
    const L = this.track.raceLength;
    let lapped: number | null = null;
    let refit: TrialEvent | null = null;
    for (const ev of events) {
      if (ev.type === 'lap' && ev.id === p.id) {
        this.recorder.lap(ev.time);
        lapped = ev.time;
      }
      if (ev.type === 'refit' && ev.id === p.id) refit = { type: 'refit', hull: ev.hull, tank: ev.tank };
    }
    const runs = this.recorder.step(p);
    const d = p.distance - this.results.length * L - (lapped !== null ? L : 0);
    const t = this.recorder.lapTime;
    if (lapped !== null) {
      // The last sector lines of the lap just closed, then the lap itself.
      this.crossLines(this.prevD, L, lapped, out, lapped);
      out.push({ type: 'lap', result: this.closeLap(lapped) });
      if (refit) out.push(refit);
      this.prevD = this.prevD === null ? null : this.prevD - L;
      this.prevT -= lapped;
    }
    if (p.crashed === 0 && p.fall === null) this.crossLines(this.prevD, d, t, out, null);
    this.prevD = d;
    this.prevT = t;
    this.curD = d;
    for (const run of runs) this.offerBest(run, out);
    return out;
  }

  /** Sector lines between the last step's distance and this one's, timed by interpolating the step. */
  private crossLines(from: number | null, to: number, t: number, out: TrialEvent[], lapEnd: number | null): void {
    if (from === null) return;
    const L = this.track.raceLength;
    for (let k = this.splits.length + 1; k < TRIAL_SECTORS; k++) {
      const line = (k / TRIAL_SECTORS) * L;
      if (!(from < line && line <= to)) break;
      const tEnd = lapEnd ?? t;
      const at = this.prevT + ((line - from) / (to - from)) * (tEnd - this.prevT);
      this.splits.push(at);
      out.push({ type: 'split', sector: k, time: at, delta: this.ghostSplits.length >= k ? at - this.ghostSplits[k - 1] : null });
    }
  }

  private closeLap(time: number): LapResult {
    const sectors = sectorTimes(this.splits, time);
    const ghostSectors = this.ghostRec ? sectorTimes(this.ghostSplits, this.ghostRec.run.time) : null;
    const sectorDeltas = sectors.map((s, i) => (ghostSectors ? s - ghostSectors[i] : null));
    const best = this.lapBest;
    const result: LapResult = {
      lap: this.results.length + 1,
      time,
      best,
      delta: best === null ? null : time - best,
      sectors,
      sectorDeltas,
      newBest: best === null || time < best,
      physics: this.setup.physics,
      ghostPhysics: this.lapGhostPhysics,
    };
    this.results.push(result);
    this.splits = [];
    if (result.newBest) this.lapBest = time;
    this.lapGhostPhysics = this.ghostRec?.physics ?? null;
    return result;
  }

  /** A cut run that beats the stored ghost becomes it. */
  private offerBest(run: GhostRun, out: TrialEvent[]): void {
    if (this.ghostRec !== null && run.time >= this.ghostRec.run.time) return;
    const record: GhostRecord = {
      trackId: this.track.def.id,
      run,
      glider: this.setup.glider,
      upgrades: { ...this.setup.upgrades },
      physics: { ...this.setup.physics },
      physicsBase: PHYSICS_BASE,
      build: this.setup.build,
      date: new Date().toISOString(),
    };
    const bytes = saveGhost(this.store, record);
    this.ghostSaved = true;
    this.useGhost(record);
    // The lap in progress started against the old ghost; from here it reads the new one.
    this.lapGhostPhysics = record.physics;
    out.push({ type: 'ghost', record, bytes });
  }

  private useGhost(g: GhostRecord | null): void {
    this.ghostRec = g;
    this.clock = g ? new GhostClock(g.run, this.track.raceLength) : null;
    const clock = this.clock;
    this.ghostSplits = clock ? Array.from({ length: TRIAL_SECTORS - 1 }, (_, i) => clock.timeAt(((i + 1) / TRIAL_SECTORS) * this.track.raceLength)) : [];
  }
}

/** Each sector's own time from the lap times at its sector lines and the lap's end. */
function sectorTimes(splits: readonly number[], time: number): number[] {
  const lines = [...splits];
  // A lap that missed a line (a wreck mid-way has no lap) can't be split there: its sectors lump.
  while (lines.length < TRIAL_SECTORS - 1) lines.push(lines[lines.length - 1] ?? 0);
  const bounds = [0, ...lines, time];
  return bounds.slice(1).map((b, i) => b - bounds[i]);
}
