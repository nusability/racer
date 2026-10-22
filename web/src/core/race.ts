// Race orchestration: grid, countdown, laps, finish, standings and racer contacts.
// Deterministic: same track, config and input tape give the same race.

import type { PlayerInput, RaceConfig, RaceEntrant, RaceEvent, RacePhase, RaceResultRow, RacerState } from './types.ts';
import type { Track } from './track.ts';
import { AiDriver, driverSeed } from './ai.ts';
import { Vehicle } from './vehicle.ts';
import {
  AUTOPILOT_SKILL,
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
  SIM_DT,
  START_BOOST_DURATION,
} from '../data/tuning.ts';

const MS_PER_KMH = 3.6;

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

/** Pose at `alpha` (0..1) between two consecutive steps; s wraps across the start line. */
export function lerpPose(track: Track, a: RacerPose, b: RacerPose, alpha: number, out: RacerPose): RacerPose {
  out.s = track.wrap(a.s + track.delta(a.s, b.s) * alpha);
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
  private countdown = COUNTDOWN_SECONDS;
  private readonly drivers: AiDriver[];
  private readonly playerIndex: number;
  private playerFinishTime: number | null = null;
  /** Pairs of racers in contact last step, so a 'racer' hit fires once per contact. */
  private readonly touching = new Set<number>();

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
      return new Vehicle(e.id, e.stats, track, track.wrap(-back), x);
    });
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
    const inputs = this.vehicles.map((v, i) => {
      const ai = this.drivers[i].drive(v, this.track, this.racers);
      const human =
        i === this.playerIndex && v.state.finishTime === null && this.phase === 'racing';
      return human ? input : ai;
    });
    const before = this.racers.map((r) => r.distance);
    this.vehicles.forEach((v, i) => v.step(inputs[i], this.track, events));
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
    const before = this.countdown;
    if (before === COUNTDOWN_SECONDS) events.push({ type: 'countdown', n: COUNTDOWN_SECONDS });
    this.countdown = Math.max(0, before - SIM_DT);
    const n = Math.ceil(this.countdown - 1e-9);
    if (n < Math.ceil(before - 1e-9)) events.push({ type: 'countdown', n });
    if (this.countdown > 0) return;
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
        const ds = this.track.delta(a.state.s, b.state.s);
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
    return (
      Math.abs(this.track.delta(sa.s, sb.s)) < RACER_LENGTH &&
      Math.abs(sb.x - sa.x) < 2 * RACER_HALF_WIDTH &&
      Math.abs(b.alt - a.alt) < RACER_HEIGHT
    );
  }
}
