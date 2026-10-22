// Race orchestration: grid, countdown, laps, finish, standings and racer contacts.
// Deterministic: same track, config and input tape give the same race.

import type { PlayerInput, RaceConfig, RaceEntrant, RaceEvent, RacePhase, RaceResultRow, RacerState } from './types.ts';
import type { Branch, Ribbon, Track } from './track.ts';
import { AiDriver, driverSeed } from './ai.ts';
import { Vehicle, jumpAround } from './vehicle.ts';
import { junctionBounds, type JunctionBounds } from './junction.ts';
import {
  AUTOPILOT_SKILL,
  BRANCH_JUNCTION_LENGTH,
  COUNTDOWN_SECONDS,
  FINISH_GRACE,
  GRID_FRONT_GAP,
  GRID_LANE_OFFSET,
  GRID_ROW_SPACING,
  GRID_STAGGER,
  RACER_BUMP_SHARE,
  RACER_HALF_WIDTH,
  RACER_HEIGHT,
  RACER_HIT_INTENSITY,
  RACER_LENGTH,
  RACER_PUSH_RATE,
  RESPAWN_BACKOFF,
  RESPAWN_JUMP_RUNUP,
  SIM_DT,
  START_BOOST_DURATION,
} from '../data/tuning.ts';

const MS_PER_KMH = 3.6;
const STEPS_PER_SECOND = Math.round(1 / SIM_DT);

export function racerSpeedKmh(state: RacerState): number {
  return state.speed * MS_PER_KMH;
}

/** The parts of a racer's state the renderer interpolates between two steps. */
export interface RacerPose {
  s: number;
  x: number;
  y: number;
  yaw: number;
  roll: number;
}

/**
 * Pose at `alpha` (0..1) between two consecutive steps on one ribbon; s wraps across the
 * start line. When the racer changed ribbon between the steps, use the newer pose as is.
 */
export function lerpPose(ribbon: Ribbon, a: RacerPose, b: RacerPose, alpha: number, out: RacerPose): RacerPose {
  out.s = ribbon.wrap(a.s + ribbon.delta(a.s, b.s) * alpha);
  out.x = a.x + (b.x - a.x) * alpha;
  out.y = a.y + (b.y - a.y) * alpha;
  out.yaw = a.yaw + (b.yaw - a.yaw) * alpha;
  out.roll = a.roll + (b.roll - a.roll) * alpha;
  return out;
}

export class Race {
  readonly track: Track;
  readonly config: RaceConfig;
  readonly entrants: RaceEntrant[];
  readonly vehicles: Vehicle[];
  /** Same order as entrants. */
  readonly racers: RacerState[];
  phase: RacePhase = 'countdown';
  /** Race clock: 0 at GO, frozen when the race ends. */
  time = 0;
  /** Countdown steps left; integer so GO lands on exactly one step. */
  private countdownSteps = COUNTDOWN_SECONDS * STEPS_PER_SECOND;
  private readonly drivers: AiDriver[];
  private readonly playerIndex: number;
  private playerFinishTime: number | null = null;
  /** Pairs of racers in contact last step, so a 'racer' hit fires once per contact. */
  private readonly touching = new Set<number>();
  /** Per branch: branch s where its entry junction ends and its exit junction starts. */
  private readonly junctions: JunctionBounds[];

  constructor(track: Track, config: RaceConfig) {
    if (config.entrants.length === 0) throw new Error('Race: no entrants');
    if (!(config.laps >= 1)) throw new Error(`Race: laps ${config.laps} must be at least 1`);
    this.track = track;
    this.config = config;
    this.entrants = config.entrants;
    this.playerIndex = config.entrants.findIndex((e) => e.isPlayer);
    if (config.entrants.filter((e) => e.isPlayer).length > 1) throw new Error('Race: more than one player entrant');
    this.vehicles = config.entrants.map((e, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const back = GRID_FRONT_GAP + row * GRID_ROW_SPACING + col * GRID_STAGGER;
      const x = (col === 0 ? -1 : 1) * GRID_LANE_OFFSET;
      const s = track.wrap(-back);
      return new Vehicle(e.id, e.stats, track, s, x, track.delta(0, s));
    });
    this.junctions = track.branches.map(junctionBounds);
    this.racers = this.vehicles.map((v) => v.state);
    this.drivers = config.entrants.map(
      (e, i) => new AiDriver(e.isPlayer ? AUTOPILOT_SKILL : e.skill, driverSeed(config.seed, i)),
    );
    this.updatePlaces();
  }

  player(): RacerState {
    if (this.playerIndex < 0) throw new Error('Race: no player entrant');
    return this.racers[this.playerIndex];
  }

  step(input: PlayerInput): RaceEvent[] {
    const events: RaceEvent[] = [];
    if (this.phase === 'countdown') {
      this.stepCountdown(input, events);
      return events;
    }
    if (this.phase === 'racing') this.time += SIM_DT;
    // Inputs are all read from the same pre-step state, so entrant order can't bias the race.
    // The player's autopilot runs even while the player drives, so it takes over (after the
    // finish) already warmed up and its RNG never depends on when that happens.
    const inputs = this.vehicles.map((v, i) => {
      const ai = this.drivers[i].drive(v, this.track, this.racers);
      const human = i === this.playerIndex && v.state.finishTime === null && this.phase === 'racing';
      return human ? input : ai;
    });
    const before = this.racers.map((r) => r.distance);
    this.vehicles.forEach((v, i) => {
      const from = this.mainS(v.state);
      v.step(inputs[i], this.track.ribbon(v.state.branch), events);
      if (v.respawnDue) this.respawn(v, events);
      else if (v.state.crashed <= 0) this.junction(v);
      // Standings distance runs along the main loop, whichever ribbon the racer is on.
      v.state.distance += this.track.delta(from, this.mainS(v.state));
    });
    this.contacts(events);
    if (this.phase === 'racing') {
      this.vehicles.forEach((v, i) => this.laps(v, before[i], events));
      this.updatePlaces();
      this.checkEnd();
    }
    return events;
  }

  results(): RaceResultRow[] {
    return this.entrants
      .map((e, i) => ({
        id: e.id,
        name: e.name,
        racerId: e.racerId,
        place: this.racers[i].place,
        time: this.racers[i].finishTime,
        bestLap: this.racers[i].bestLap,
        isPlayer: e.isPlayer,
      }))
      .sort((a, b) => a.place - b.place);
  }

  private stepCountdown(input: PlayerInput, events: RaceEvent[]) {
    if (this.countdownSteps === COUNTDOWN_SECONDS * STEPS_PER_SECOND) {
      events.push({ type: 'countdown', n: COUNTDOWN_SECONDS });
    }
    this.countdownSteps--;
    if (this.countdownSteps % STEPS_PER_SECOND === 0) {
      events.push({ type: 'countdown', n: this.countdownSteps / STEPS_PER_SECOND });
    }
    if (this.countdownSteps > 0) return;
    this.phase = 'racing';
    this.vehicles.forEach((v, i) => {
      const launch = i === this.playerIndex ? input.boost : this.drivers[i].startBoost();
      if (launch) v.grantFreeBoost(START_BOOST_DURATION);
    });
  }

  private laps(v: Vehicle, before: number, events: RaceEvent[]) {
    const st = v.state;
    if (st.finishTime !== null) return;
    const L = this.track.length;
    const completed = Math.floor(st.distance / L);
    if (completed <= st.lap) return;
    // Cross time interpolated within the step, so racers finishing in one step still rank fairly.
    const frac = (completed * L - before) / (st.distance - before);
    const at = this.time - SIM_DT + SIM_DT * Math.min(1, Math.max(0, frac));
    const lapTime = at - v.lapStart;
    v.lapStart = at;
    st.lap = completed;
    if (st.bestLap === null || lapTime < st.bestLap) st.bestLap = lapTime;
    events.push({ type: 'lap', id: st.id, lap: completed, time: lapTime });
    if (completed >= this.config.laps) {
      st.finishTime = at;
      const place = this.racers.filter((r) => r.finishTime !== null).length;
      events.push({ type: 'finish', id: st.id, place, time: at });
      if (this.entrants[this.racers.indexOf(st)].isPlayer) this.playerFinishTime = at;
    }
  }

  private updatePlaces() {
    const order = this.racers.slice().sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      return b.distance - a.distance;
    });
    order.forEach((r, i) => (r.place = i + 1));
  }

  private checkEnd() {
    const allDone = this.racers.every((r) => r.finishTime !== null);
    const graceOver = this.playerFinishTime !== null && this.time >= this.playerFinishTime + FINISH_GRACE;
    if (allDone || graceOver) this.phase = 'finished';
  }

  private contacts(events: RaceEvent[]) {
    const n = this.vehicles.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const key = i * n + j;
        const a = this.vehicles[i];
        const b = this.vehicles[j];
        if (!this.inContact(a, b)) {
          this.touching.delete(key);
          continue;
        }
        const ds = this.track.ribbon(a.state.branch).delta(a.state.s, b.state.s);
        const dx = b.state.x - a.state.x;
        const overlapX = 2 * RACER_HALF_WIDTH - Math.abs(dx);
        const overlapS = RACER_LENGTH - Math.abs(ds);
        if (overlapS < overlapX) {
          // Nose to tail: the chaser gives some of its closing speed to the leader.
          const [rear, front] = ds > 0 ? [a.state, b.state] : [b.state, a.state];
          const share = Math.max(0, rear.speed - front.speed) * RACER_BUMP_SHARE;
          rear.speed -= share;
          front.speed += share;
        } else {
          const dir = dx >= 0 ? 1 : -1;
          a.state.vx -= dir * overlapX * RACER_PUSH_RATE * SIM_DT;
          b.state.vx += dir * overlapX * RACER_PUSH_RATE * SIM_DT;
        }
        if (!this.touching.has(key)) {
          this.touching.add(key);
          events.push({ type: 'hit', id: a.state.id, kind: 'racer', intensity: RACER_HIT_INTENSITY });
          events.push({ type: 'hit', id: b.state.id, kind: 'racer', intensity: RACER_HIT_INTENSITY });
        }
      }
    }
  }

  private inContact(a: Vehicle, b: Vehicle): boolean {
    const sa = a.state;
    const sb = b.state;
    if (sa.crashed > 0 || sb.crashed > 0 || sa.invulnerable > 0 || sb.invulnerable > 0) return false;
    if (sa.branch !== sb.branch) return false;
    return (
      Math.abs(this.track.ribbon(sa.branch).delta(sa.s, sb.s)) < RACER_LENGTH &&
      Math.abs(sb.x - sa.x) < 2 * RACER_HALF_WIDTH &&
      Math.abs(b.alt - a.alt) < RACER_HEIGHT
    );
  }

  /** Where on the main loop a racer counts as being: a branch maps linearly onto the stretch it skips. */
  private mainS(st: RacerState): number {
    if (st.branch < 0) return st.s;
    const b = this.track.branches[st.branch];
    return b.entryS + (st.s / b.ribbon.length) * (b.exitS - b.entryS);
  }

  /** Crossing between the main loop and a shortcut, at the junctions where they run side by side. */
  private junction(v: Vehicle) {
    const st = v.state;
    const main = this.track;
    if (st.branch < 0) {
      for (const b of main.branches) {
        const into = main.delta(b.entryS, st.s);
        if (into < 0 || into > BRANCH_JUNCTION_LENGTH || b.side * st.x <= main.widthAt(st.s) / 2) continue;
        const p = b.ribbon.project(main.toWorld(st.s, st.x, 0, worldBuf), into, 2 * BRANCH_JUNCTION_LENGTH);
        v.transfer(b.index, p.s, p.x);
        return;
      }
      return;
    }
    const b = main.branches[st.branch];
    const rb = b.ribbon;
    const j = this.junctions[st.branch];
    const atEnd = st.s >= rb.length - rb.step;
    const inEntry = st.s <= j.inEnd;
    const crossed = (inEntry || st.s >= j.outStart) && b.side * st.x < -rb.widthAt(st.s) / 2;
    if (!crossed && !atEnd) return;
    const hint = inEntry ? b.entryS + st.s : b.exitS - (rb.length - st.s);
    const p = main.project(rb.toWorld(st.s, st.x, 0, worldBuf), hint, 2 * BRANCH_JUNCTION_LENGTH);
    v.transfer(-1, p.s, p.x);
    if (atEnd) this.mergeOntoMain(v, b);
  }

  /** At a branch's end everyone is on the main road: fold a racer still out wide back inside it. */
  private mergeOntoMain(v: Vehicle, b: Branch) {
    const st = v.state;
    const lo = this.track.minXAt(st.s) + RACER_HALF_WIDTH;
    const hi = this.track.maxXAt(st.s) - RACER_HALF_WIDTH;
    const x = Math.min(hi, Math.max(lo, st.x));
    if (x !== st.x) v.transfer(-1, st.s, x);
    if (b.side * st.vx > 0) st.vx = 0;
  }

  /**
   * Respawn a bit behind the crash on the same ribbon, never in or just before a chasm; a
   * crash in a branch's entry junction (or one backed up into it) goes back onto the main road.
   */
  private respawn(v: Vehicle, events: RaceEvent[]) {
    const main = this.track;
    let branch = v.crashBranch;
    let s: number;
    if (branch >= 0) {
      const b = main.branches[branch];
      s = v.crashS - RESPAWN_BACKOFF;
      const jump = jumpAround(b.ribbon, s, RESPAWN_JUMP_RUNUP);
      if (jump) s = jump.rampStart - RESPAWN_JUMP_RUNUP;
      if (s <= this.junctions[branch].inEnd) {
        branch = -1;
        s = main.wrap(b.entryS + Math.max(0, s));
      }
    } else s = main.wrap(v.crashS - RESPAWN_BACKOFF);
    if (branch < 0) {
      const jump = jumpAround(main, s, RESPAWN_JUMP_RUNUP);
      if (jump) s = main.wrap(jump.rampStart - RESPAWN_JUMP_RUNUP);
    }
    v.respawn(branch, main.ribbon(branch), s, events);
  }
}

const worldBuf = { x: 0, y: 0, z: 0 };
