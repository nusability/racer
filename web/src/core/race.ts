// Race orchestration: grid, countdown, laps, finish, standings and racer contacts, on a
// circuit (laps of a loop) or a sprint (start to finish once, then a run-out to stop in).
// Deterministic: same track, config and input tape give the same race.

import type { FieldHold, Obstacle, PlayerInput, RaceConfig, RaceEntrant, RaceEvent, RacePhase, RaceResultRow, RacerState } from './types.ts';
import { makeFrame, type Branch, type Frame, type Ribbon, type Track } from './track.ts';
import { AiDriver, driverSeed } from './ai.ts';
import { Vehicle } from './vehicle.ts';
import { hazardObstacles } from './hazards.ts';
import { junctionBounds, type JunctionBounds } from './junction.ts';
import { Slipstream } from './slipstream.ts';
import { impactWear } from './handling.ts';
import {
  AUTOPILOT_SKILL,
  BRANCH_JUNCTION_LENGTH,
  CROSSING_MARGIN,
  CATCHUP_EASE,
  CATCHUP_FULL_GAP,
  CATCHUP_PUSH,
  CATCHUP_START_GAP,
  COUNTDOWN_SECONDS,
  FINISH_GRACE,
  GRID_FRONT_GAP,
  GRID_LANE_OFFSET,
  GRID_ROW_SPACING,
  GRID_STAGGER,
  RACER_BUMP_SHARE,
  RACER_CONTACT_COOLDOWN,
  RACER_HALF_WIDTH,
  RACER_DAMAGE,
  RACER_DAMAGE_FREE_SPEED,
  RACER_DAMAGE_REF_SPEED,
  RACER_HEIGHT,
  RACER_HIT_INTENSITY_SPEED,
  RACER_LENGTH,
  RACER_RADIUS,
  RACER_SCRUB,
  RACER_SHOVE,
  RACER_SHOVE_MIN,
  RACER_SHOVE_TARGET_TIME,
  SIM_DT,
  SPRINT_FIELD_DEPTH,
  SPRINT_FIELD_FIRST_REST,
  SPRINT_FIELD_LANE,
  SPRINT_FIELD_LANES,
  SPRINT_FIELD_ROW,
  SPRINT_FIELD_STAGGER,
  SPRINT_FIELD_STEER_SPAN,
  START_BOOST_DURATION,
  PERFECT_START_WINDOW,
  FALSE_START_STALL,
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
  /** The player touched boost during the countdown. */
  private playerFlooded = false;
  /** The player launched neither late nor perfectly yet, so a press in the start window counts. */
  private playerLaunchPending = false;
  /** Per pair of racers, the race time they last touched, so one tussle is one hit. */
  private readonly lastTouch = new Map<number, number>();
  /** Per branch: branch s where its entry junction ends and its exit junction starts. */
  private readonly junctions: JunctionBounds[];
  /** Racer indices in the order they wrecked. */
  private readonly wrecks: number[] = [];
  /** This step's hazard obstacles per ribbon (branch index, -1 = main). */
  private readonly hazardNow = new Map<number, Obstacle[]>();
  /** Every racer's draft in the wake of the racers ahead of it. */
  private readonly slipstream: Slipstream;
  /** Racers past a sprint's finish line so far: the next one takes the next place in the force field's formation. */
  private held = 0;

  constructor(track: Track, config: RaceConfig) {
    if (config.entrants.length === 0) throw new Error('Race: no entrants');
    if (!(config.laps >= 1)) throw new Error(`Race: laps ${config.laps} must be at least 1`);
    if (track.course === 'sprint' && config.laps !== 1) throw new Error(`Race: a sprint is raced once, not ${config.laps} laps`);
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
      if (track.course === 'sprint' && back > track.startS) throw new Error(`Race: grid slot ${i} stands ${back} m back, off the ${track.startS} m apron`);
      const s = track.wrap(track.startS - back);
      // Seeded after every driver's own stream, so the ground's jolts never echo a driver's choices.
      return new Vehicle(e.id, e.stats, track, s, x, track.delta(track.startS, s), driverSeed(config.seed, config.entrants.length + i));
    });
    this.junctions = track.branches.map(junctionBounds);
    this.racers = this.vehicles.map((v) => v.state);
    this.slipstream = new Slipstream(this.vehicles.length);
    this.drivers = config.entrants.map(
      (e, i) => new AiDriver(e.isPlayer ? AUTOPILOT_SKILL : e.skill, driverSeed(config.seed, i)),
    );
    this.updatePlaces();
  }

  player(): RacerState {
    if (this.playerIndex < 0) throw new Error('Race: no player entrant');
    return this.racers[this.playerIndex];
  }

  /** The player is out of the race. The race keeps simulating; the session decides when to end it. */
  get playerWrecked(): boolean {
    return this.playerIndex >= 0 && this.racers[this.playerIndex].crashed > 0;
  }

  step(input: PlayerInput): RaceEvent[] {
    const events: RaceEvent[] = [];
    if (this.phase === 'countdown') {
      this.stepCountdown(input, events);
      return events;
    }
    if (this.phase === 'racing') {
      this.time += SIM_DT;
      this.startWindow(input, events);
    }
    // Inputs are all read from the same pre-step state, so entrant order can't bias the race.
    // The player's autopilot runs even while the player drives, so it takes over (after the
    // finish) already warmed up and its RNG never depends on when that happens.
    const inputs = this.vehicles.map((v, i) => {
      const ai = this.drivers[i].drive(v, this.track, this.racers, this.time);
      const human = i === this.playerIndex && v.state.finishTime === null && this.phase === 'racing';
      // Past a sprint's finish there is only the run-out: everyone glides into the force field,
      // steering to its own place in the field's formation, and rests there.
      if (v.hold !== null) return holdInput(v, v.hold);
      return human ? input : ai;
    });
    const before = this.racers.map((r) => r.distance);
    this.catchUp();
    this.slipstream.step(this.vehicles, this.track, events);
    this.hazardNow.clear();
    this.vehicles.forEach((v, i) => {
      if (v.state.crashed > 0) {
        v.step(inputs[i], this.track.ribbon(v.state.branch), NO_OBSTACLES, this.time, events);
        return;
      }
      const from = this.mainS(v.state);
      const ribbon = this.track.ribbon(v.state.branch);
      v.step(inputs[i], ribbon, this.hazardsOn(v.state.branch), this.time, events);
      if (v.state.crashed > 0) this.wrecks.push(i);
      else if (v.state.fall === null) {
        this.junction(v);
        this.forceField(v);
      }
      // Standings distance runs along the main road, whichever ribbon the racer is on.
      v.state.distance += this.track.delta(from, this.mainS(v.state));
    });
    this.contacts(events);
    this.crossTraffic(events);
    if (this.phase === 'racing') {
      this.vehicles.forEach((v, i) => this.laps(v, before[i], events));
      this.updatePlaces();
      this.checkEnd();
    }
    return events;
  }

  /** Valid at any moment: finishers by time, then racers still running by distance, then wrecks. */
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
        dnf: this.racers[i].crashed > 0,
      }))
      .sort((a, b) => a.place - b.place);
  }

  /** The obstacles a ribbon's hazards present this step, computed once per ribbon. */
  private hazardsOn(branch: number): readonly Obstacle[] {
    let out = this.hazardNow.get(branch);
    if (!out) {
      const ribbon = this.track.ribbon(branch);
      out = ribbon.hazards.length === 0 ? [] : hazardObstacles(ribbon.hazards, this.time, []);
      this.hazardNow.set(branch, out);
    }
    return out;
  }

  private stepCountdown(input: PlayerInput, events: RaceEvent[]) {
    if (this.countdownSteps === COUNTDOWN_SECONDS * STEPS_PER_SECOND) {
      events.push({ type: 'countdown', n: COUNTDOWN_SECONDS });
    }
    this.countdownSteps--;
    if (this.countdownSteps % STEPS_PER_SECOND === 0) {
      events.push({ type: 'countdown', n: this.countdownSteps / STEPS_PER_SECOND });
    }
    // Any touch of boost before GO floods the player's engines (the countdown step that
    // reaches GO is GO itself, so a press there is on time).
    if (this.countdownSteps > 0) {
      if (input.boost) this.playerFlooded = true;
      return;
    }
    this.phase = 'racing';
    this.vehicles.forEach((v, i) => {
      const start = i === this.playerIndex ? (this.playerFlooded ? 'false' : 'none') : this.drivers[i].startAction();
      if (start === 'false') {
        v.stall(FALSE_START_STALL);
        events.push({ type: 'falseStart', id: v.state.id });
      } else if (start === 'perfect') this.perfectStart(v, events);
      else if (i === this.playerIndex) this.playerLaunchPending = true;
    });
    this.startWindow(input, events);
  }

  /** Right after GO, a player who hasn't launched yet gets the launch boost by pressing boost. */
  private startWindow(input: PlayerInput, events: RaceEvent[]) {
    if (!this.playerLaunchPending) return;
    if (this.time > PERFECT_START_WINDOW) this.playerLaunchPending = false;
    else if (input.boost) {
      this.playerLaunchPending = false;
      this.perfectStart(this.vehicles[this.playerIndex], events);
    }
  }

  private perfectStart(v: Vehicle, events: RaceEvent[]) {
    v.grantFreeBoost(START_BOOST_DURATION);
    events.push({ type: 'perfectStart', id: v.state.id });
  }

  private laps(v: Vehicle, before: number, events: RaceEvent[]) {
    const st = v.state;
    // Falling off the course is no way to cross a line.
    if (st.finishTime !== null || st.fall !== null) return;
    // A circuit's lap, or the whole of a sprint (one 'lap' that ends at its finish line).
    const L = this.track.raceLength;
    const completed = Math.floor(st.distance / L);
    if (completed <= st.lap) return;
    // Cross time interpolated within the step, so racers finishing in one step still rank fairly.
    const frac = (completed * L - before) / (st.distance - before);
    const at = this.time - SIM_DT + SIM_DT * Math.min(1, Math.max(0, frac));
    const lapTime = at - v.lapStart;
    v.lapStart = at;
    st.lap = completed;
    v.newLap();
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
    // A later wreck lasted longer, so it places ahead of an earlier one.
    const wreckRank = (r: RacerState) => this.wrecks.indexOf(this.racers.indexOf(r));
    const order = this.racers.slice().sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      const aOut = a.crashed > 0;
      const bOut = b.crashed > 0;
      if (aOut && bOut) return wreckRank(b) - wreckRank(a);
      if (aOut !== bOut) return aOut ? 1 : -1;
      return b.distance - a.distance;
    });
    order.forEach((r, i) => (r.place = i + 1));
  }

  private checkEnd() {
    const allDone = this.racers.every((r) => r.finishTime !== null || r.crashed > 0);
    const graceOver = this.playerFinishTime !== null && this.time >= this.playerFinishTime + FINISH_GRACE;
    if (allDone || graceOver) this.phase = 'finished';
  }

  /**
   * Racer contacts are physical. Side by side, both are shoved apart with an impulse that
   * grows with how fast they closed, the lighter (less armoured) one moving more, and the
   * shove carries their lines with it: side-swiping a rival into a wall is a tactic. Nose to
   * tail, the chaser hands speed to the leader. Every new contact costs both some hull.
   */
  private contacts(events: RaceEvent[]) {
    const n = this.vehicles.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const key = i * n + j;
        const a = this.vehicles[i];
        const b = this.vehicles[j];
        if (!this.inContact(a, b)) continue;
        const ds = this.track.ribbon(a.state.branch).delta(a.state.s, b.state.s);
        const dx = b.state.x - a.state.x;
        const overlapX = 2 * RACER_HALF_WIDTH - Math.abs(dx);
        const overlapS = RACER_LENGTH - Math.abs(ds);
        const fresh = this.touch(key);
        let closing: number;
        if (overlapS < overlapX) {
          const [rear, front] = ds > 0 ? [a.state, b.state] : [b.state, a.state];
          closing = Math.max(0, rear.speed - front.speed);
          const share = closing * RACER_BUMP_SHARE;
          rear.speed -= share;
          front.speed += share;
        } else {
          const dir = dx >= 0 ? 1 : -1;
          // Overlap is resolved at once, split by mass, so racers never sit inside each other.
          const ma = a.stats.armor;
          const mb = b.stats.armor;
          const shareA = mb / (ma + mb);
          const shareB = ma / (ma + mb);
          a.state.x -= dir * overlapX * shareA;
          b.state.x += dir * overlapX * shareB;
          closing = Math.max(0, dir * (a.state.vx - b.state.vx));
          if (fresh) {
            a.state.speed = Math.max(0, a.state.speed - closing * RACER_SCRUB);
            b.state.speed = Math.max(0, b.state.speed - closing * RACER_SCRUB);
            const shove = 2 * (RACER_SHOVE_MIN + RACER_SHOVE * closing);
            a.state.vx -= dir * shove * shareA;
            b.state.vx += dir * shove * shareB;
            a.targetX -= dir * shove * shareA * RACER_SHOVE_TARGET_TIME;
            b.targetX += dir * shove * shareB * RACER_SHOVE_TARGET_TIME;
          }
        }
        if (!fresh) continue;
        const wear = impactWear(closing, RACER_DAMAGE_FREE_SPEED, RACER_DAMAGE_REF_SPEED, RACER_DAMAGE);
        a.harm(wear, events);
        b.harm(wear, events);
        const intensity = Math.min(1, closing / RACER_HIT_INTENSITY_SPEED);
        events.push({ type: 'hit', id: a.state.id, kind: 'racer', intensity });
        events.push({ type: 'hit', id: b.state.id, kind: 'racer', intensity });
        if (a.state.crashed > 0) this.wrecks.push(i);
        if (b.state.crashed > 0) this.wrecks.push(j);
      }
    }
  }

  /**
   * Flat (road-level) crossings: racers on the two legs share world space, so inside the
   * junction they are tested by world position and a contact resolves like a side impact
   * (the impulse projected onto each racer's own forward and lateral axes).
   */
  private crossTraffic(events: RaceEvent[]) {
    const n = this.vehicles.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = this.vehicles[i];
        const b = this.vehicles[j];
        const key = i * n + j;
        if (a.state.crashed > 0 || b.state.crashed > 0 || a.state.fall !== null || b.state.fall !== null || a.state.branch !== b.state.branch || !this.atFlatCrossing(a, b)) continue;
        const ribbon = this.track.ribbon(a.state.branch);
        const fa = ribbon.frameAt(a.state.s, frameA);
        const fb = ribbon.frameAt(b.state.s, frameB);
        ribbon.toWorld(a.state.s, a.state.x, a.state.y, posA, frameA);
        ribbon.toWorld(b.state.s, b.state.x, b.state.y, posB, frameB);
        const dx = posB.x - posA.x;
        const dz = posB.z - posA.z;
        const dist = Math.hypot(dx, dz);
        if (dist >= 2 * RACER_RADIUS || Math.abs(posB.y - posA.y) >= RACER_HEIGHT || dist === 0) continue;
        const nx = dx / dist;
        const nz = dz / dist;
        const along = (f: Frame, v: Vehicle) => [f.tangent.x * v.state.speed + f.right.x * v.state.vx, f.tangent.z * v.state.speed + f.right.z * v.state.vx];
        const [vax, vaz] = along(fa, a);
        const [vbx, vbz] = along(fb, b);
        const closing = Math.max(0, (vax - vbx) * nx + (vaz - vbz) * nz);
        const ma = a.stats.armor;
        const mb = b.stats.armor;
        const shareA = mb / (ma + mb);
        const shareB = ma / (ma + mb);
        const overlap = 2 * RACER_RADIUS - dist;
        // Push a along -n and b along +n, in each racer's own track axes.
        const push = (v: Vehicle, f: Frame, sign: number, share: number, amount: number) => {
          const lateral = sign * (nx * f.right.x + nz * f.right.z);
          const forward = sign * (nx * f.tangent.x + nz * f.tangent.z);
          v.state.x += lateral * overlap * share;
          if (amount <= 0) return;
          v.state.vx += lateral * amount * share;
          v.targetX += lateral * amount * share * RACER_SHOVE_TARGET_TIME;
          v.state.speed = Math.max(0, v.state.speed + forward * amount * share);
        };
        const fresh = this.touch(key);
        const impulse = fresh ? 2 * (RACER_SHOVE_MIN + RACER_SHOVE * closing) : 0;
        push(a, fa, -1, shareA, impulse);
        push(b, fb, 1, shareB, impulse);
        if (!fresh) continue;
        const wear = impactWear(closing, RACER_DAMAGE_FREE_SPEED, RACER_DAMAGE_REF_SPEED, RACER_DAMAGE);
        a.harm(wear, events);
        b.harm(wear, events);
        const intensity = Math.min(1, closing / RACER_HIT_INTENSITY_SPEED);
        events.push({ type: 'hit', id: a.state.id, kind: 'racer', intensity });
        events.push({ type: 'hit', id: b.state.id, kind: 'racer', intensity });
        if (a.state.crashed > 0) this.wrecks.push(i);
        if (b.state.crashed > 0) this.wrecks.push(j);
      }
    }
  }

  /** Records a touch of the pair; true when it is a new hit rather than the same tussle. */
  private touch(key: number): boolean {
    const last = this.lastTouch.get(key);
    this.lastTouch.set(key, this.time);
    return last === undefined || this.time - last > RACER_CONTACT_COOLDOWN;
  }

  /** Both racers are inside the junction zone of one flat crossing, one on each leg. */
  private atFlatCrossing(a: Vehicle, b: Vehicle): boolean {
    const ribbon = this.track.ribbon(a.state.branch);
    for (const c of ribbon.crossings) {
      if (c.style !== 'flat') continue;
      const near = (s: number, leg: number, other: number) =>
        Math.abs(ribbon.delta(leg, s)) < ribbon.widthAt(other) / 2 + CROSSING_MARGIN;
      const aOnS = near(a.state.s, c.s, c.other);
      const aOnO = near(a.state.s, c.other, c.s);
      const bOnS = near(b.state.s, c.s, c.other);
      const bOnO = near(b.state.s, c.other, c.s);
      if ((aOnS && bOnO) || (aOnO && bOnS)) return true;
    }
    return false;
  }

  private inContact(a: Vehicle, b: Vehicle): boolean {
    const sa = a.state;
    const sb = b.state;
    // A racer falling off the course is beyond touching: it is below or beside the road.
    if (sa.crashed > 0 || sb.crashed > 0 || sa.fall !== null || sb.fall !== null || sa.branch !== sb.branch) return false;
    // Two racers the run-out's force field holds have nothing left to race for: they pass
    // through each other, so a queue easing to rest never shoves itself apart.
    if (a.hold !== null && b.hold !== null) return false;
    return (
      Math.abs(this.track.ribbon(sa.branch).delta(sa.s, sb.s)) < RACER_LENGTH &&
      Math.abs(sb.x - sa.x) < 2 * RACER_HALF_WIDTH &&
      Math.abs(b.alt - a.alt) < RACER_HEIGHT
    );
  }

  /** Sets each AI's catch-up pace from its distance gap to the player (see CATCHUP_*); off once the player is out. */
  private catchUp() {
    const player = this.playerIndex >= 0 ? this.racers[this.playerIndex] : null;
    const active = player !== null && player.finishTime === null && player.crashed <= 0 && this.phase === 'racing';
    const ramp = (gap: number) =>
      Math.min(1, Math.max(0, (gap - CATCHUP_START_GAP) / (CATCHUP_FULL_GAP - CATCHUP_START_GAP)));
    this.vehicles.forEach((v, i) => {
      if (!active || i === this.playerIndex) {
        v.pace = 1;
        return;
      }
      const gap = v.state.distance - (player as RacerState).distance;
      v.pace = gap > 0 ? 1 - CATCHUP_EASE * ramp(gap) : 1 + CATCHUP_PUSH * ramp(-gap);
    });
  }

  /**
   * A sprint's run-out ends in a block of force field (SPRINT_FIELD_*) reaching to the road's
   * end: a racer crossing the finish line (in the race or after it) is handed the next place in
   * the field's formation, and the field brings it to rest there (Vehicle.holdForStop): never
   * at the road's end, never in a hard stop.
   */
  private forceField(v: Vehicle) {
    const st = v.state;
    if (this.track.course !== 'sprint' || st.branch >= 0) return;
    if (st.s >= this.track.length) throw new Error(`Race: ${st.id} ran through the force field to the end of ${this.track.def.id}`);
    const finish = this.track.startS + this.track.raceLength;
    if (v.hold !== null || st.s < finish) return;
    v.hold = this.fieldPlace(this.held, st.s);
    this.held++;
  }

  /**
   * The n-th finisher's place in the field: rows of SPRINT_FIELD_LANES, the middle lane first
   * and then out to either side, each side lane a little behind (an arrowhead), each row
   * shallower than the last. `s` is where the racer is now: its place must lie ahead.
   */
  private fieldPlace(n: number, s: number): FieldHold {
    const entry = this.track.length - SPRINT_FIELD_DEPTH;
    const lane = n % SPRINT_FIELD_LANES;
    // 0, then -1, 1, -2, 2…: out from the middle, alternating sides.
    const side = lane === 0 ? 0 : (lane % 2 === 1 ? -1 : 1) * Math.ceil(lane / 2);
    const rest = entry + SPRINT_FIELD_FIRST_REST - Math.floor(n / SPRINT_FIELD_LANES) * SPRINT_FIELD_ROW - Math.abs(side) * SPRINT_FIELD_STAGGER;
    if (rest <= entry || rest <= s) throw new Error(`Race: ${this.track.def.id}'s force field has no room to hold racer ${n + 1}`);
    return { entry, s: rest, x: side * SPRINT_FIELD_LANE * (this.track.widthAt(rest) / 2) };
  }

  /** Where on the main road a racer counts as being: a branch maps linearly onto the stretch it skips. */
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
}

const worldBuf = { x: 0, y: 0, z: 0 };
const posA = { x: 0, y: 0, z: 0 };
const posB = { x: 0, y: 0, z: 0 };
const frameA = makeFrame();
const frameB = makeFrame();
const NO_OBSTACLES: readonly Obstacle[] = [];
/**
 * A racer the force field holds: no throttle, no boost, steering to its lane (in proportion
 * once close, so it settles there instead of hunting across it).
 */
function holdInput(v: Vehicle, hold: FieldHold): PlayerInput {
  return { steer: Math.max(-1, Math.min(1, (hold.x - v.targetX) / SPRINT_FIELD_STEER_SPAN)), nudge: 0, brake: true, boost: false };
}
