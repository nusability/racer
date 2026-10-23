// AI driver: reads the ribbon ahead and produces the same PlayerInput a thumb would. It
// drives the same Vehicle model as the player, so it can only be as fast as physics allows.

import type { Jump, Obstacle, PlayerInput, RacerState, RacerStats } from './types.ts';
import type { Ribbon, Track } from './track.ts';
import { mulberry32, type Rng } from './rng.ts';
import { PathPlanner, type Blocker } from './aiPlanner.ts';
import { junctionBounds } from './junction.ts';
import { hazardObstacles } from './hazards.ts';
import type { Vehicle } from './vehicle.ts';
import { cornerPull, currentTopSpeed, steerRate } from './handling.ts';
import { minJumpSpeed } from './jumps.ts';
import {
  AI_BOOST_CAUTION_HI,
  AI_BOOST_CAUTION_LO,
  AI_AVOID_RACERS_SKILL,
  AI_BOOST_MIN_RUN_HI,
  AI_BOOST_MIN_RUN_LO,
  AI_BRAKE_REACTION_HI,
  AI_CELL_DETOUR_HI,
  AI_PLAN_RATE_SHARE,
  AI_HAZARD_TIME_MARGIN,
  AI_CELL_DETOUR_LO,
  AI_BRAKE_REACTION_LO,
  AI_CLEARANCE_HI,
  AI_CLEARANCE_LO,
  AI_CORNER_FACTOR_HI,
  AI_CORNER_FACTOR_LO,
  AI_CROSSING_WINDOW_HI,
  AI_CROSSING_WINDOW_LO,
  AI_DROP_MARGIN_HI,
  AI_DROP_MARGIN_LO,
  AI_JUMP_SPEED_MARGIN,
  AI_LINE_FULL_CURVATURE,
  AI_LINE_LOOK_TIME_HI,
  AI_LINE_LOOK_TIME_LO,
  AI_LOOP_LOOK,
  AI_MISTAKE_DURATION,
  AI_MISTAKE_RATE,
  AI_NOISE_TAU,
  AI_OBSTACLE_LEAD_TIME,
  AI_OBSTACLE_LOOK_TIME_HI,
  AI_OBSTACLE_LOOK_TIME_LO,
  AI_PAD_DETOUR,
  AI_PATH_LAG,
  AI_PLAN_INTERVAL,
  AI_PLAN_STICKINESS,
  AI_RACER_LOOK_TIME,
  AI_REACTION_HI,
  AI_REACTION_LO,
  AI_REPAIR_DETOUR,
  AI_REPAIR_WANT,
  AI_SAMPLE_STEP,
  AI_SHORTCUT_HI,
  AI_SHORTCUT_LO,
  AI_SHORTCUT_LOOK_TIME,
  AI_SKILL_CURVE,
  AI_START_BOOST_CHANCE,
  AI_TARGET_NOISE,
  AI_TARGET_TIME,
  AI_WALL_MARGIN,
  BRAKE_DECEL,
  CELL_VALUE,
  CORNER_PULL,
  GRIP_REF,
  HANDLING_REF,
  LATERAL_RESPONSE,
  RACER_HALF_WIDTH,
  RACER_LENGTH,
  RACER_RADIUS,
  SIM_DT,
} from '../data/tuning.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface SpeedProfiles {
  brake: Float64Array;
  boost: Float64Array;
  /** 1 where a loop's upside-down top lies within AI_LOOP_LOOK metres ahead. */
  loopAhead: Uint8Array;
  /** Metres of road ahead of each sample on which full boost needs no braking. */
  boostRun: Float64Array;
}

function profileAt(ribbon: Ribbon, profile: Float64Array, s: number): number {
  return profile[Math.min(profile.length - 1, Math.floor(ribbon.wrap(s) / ribbon.step) % profile.length)];
}

/** Mixes a race seed and an entrant index into an independent per-driver seed. */
export function driverSeed(raceSeed: number, index: number): number {
  return (Math.imul(raceSeed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(index + 1, 0xc2b2ae35)) >>> 0;
}

export interface AiOptions {
  /** Whether this driver ever takes shortcuts. */
  shortcuts: boolean;
  /** Whether this driver swerves to collect boost cells (otherwise only those on its line). */
  cellDetours: boolean;
}

export class AiDriver {
  readonly skill: number;
  private readonly options: AiOptions;
  private readonly rng: Rng;
  private noise = 0;
  private lapse = 0;
  private readonly obstacleBuf: Obstacle[] = [];
  private readonly hazardBuf: Obstacle[] = [];
  private readonly planner = new PathPlanner();
  private readonly blockers: Blocker[] = [];
  /** Steps since the path was last planned, and the target it gave. */
  private planAge = Infinity;
  private planTarget = 0;
  /** Where across the ribbon this driver last wanted to be (its target before steering). */
  aimX = 0;
  /** Recent targets, oldest first: the reaction delay reads the oldest. */
  private readonly seen: number[] = [];
  private readonly profiles = new Map<Ribbon, SpeedProfiles>();
  /** Per branch: the lap a shortcut was last decided on and whether it is being taken. */
  private readonly shortcut = new Map<number, { lap: number; take: boolean }>();

  constructor(skill: number, seed: number, options: AiOptions = { shortcuts: true, cellDetours: true }) {
    if (!(skill >= 0 && skill <= 1)) throw new Error(`AiDriver: skill ${skill} outside 0..1`);
    this.skill = skill;
    this.options = options;
    this.rng = mulberry32(seed);
  }

  /** Interpolates a lo/hi behaviour by eased skill: the low end weaker, the top end intact. */
  private bySkill(lo: number, hi: number): number {
    return lo + (hi - lo) * this.skill ** AI_SKILL_CURVE;
  }

  /** Whether this driver holds boost at the exact moment of GO. */
  startBoost(): boolean {
    return this.rng() < AI_START_BOOST_CHANCE * this.skill;
  }

  /**
   * The input for one SIM_DT step. Call every step so noise and lapses evolve evenly.
   * `field` is every racer in the race (this one included); slower ones ahead are avoided.
   * `time` is the race clock: hazards are planned around where they will be on arrival.
   */
  drive(veh: Vehicle, track: Track, field: readonly RacerState[], time: number): PlayerInput {
    this.evolveNoise();
    const st = veh.state;
    if (st.crashed > 0) return { steer: 0, nudge: 0, brake: false, boost: false };
    const ribbon = track.ribbon(st.branch);
    const v = Math.max(st.speed, 1);
    const stats = veh.stats;

    // 1. Where across the ribbon to be: the racing line, a pad, an arch, a shortcut.
    let target = this.racingLine(ribbon, st.s, v);
    const lineLook = v * this.bySkill(AI_LINE_LOOK_TIME_LO, AI_LINE_LOOK_TIME_HI);
    for (const p of ribbon.boostPads) {
      const d = ribbon.delta(st.s, p.s);
      if (d > 0 && d < lineLook && Math.abs(p.x - target) < AI_PAD_DETOUR) target = p.x;
    }
    target = this.cellDetour(veh, ribbon, target, lineLook);
    if (st.damage >= AI_REPAIR_WANT) target = this.repairDetour(veh, ribbon, target, lineLook);
    const route = this.routeChoice(track, st, v, target);
    target = route.x;

    // 2. Obstacles, arches and racers ahead hand the target to the path planner.
    const obsLook = v * this.bySkill(AI_OBSTACLE_LOOK_TIME_LO, AI_OBSTACLE_LOOK_TIME_HI);
    const clearance = this.bySkill(AI_CLEARANCE_LO, AI_CLEARANCE_HI);
    // Crossing onto another ribbon, this one's arches and walls further on no longer apply.
    if (this.lapse <= 0 && !route.crossing) {
      for (const a of ribbon.arches) {
        const d = ribbon.delta(st.s, a.s);
        if (d < 0 || d > obsLook) continue;
        const lo = a.openMin + RACER_RADIUS + clearance;
        const hi = a.openMax - RACER_RADIUS - clearance;
        target = lo <= hi ? clamp(target, lo, hi) : (a.openMin + a.openMax) / 2;
      }
      const blockers = this.blockers;
      blockers.length = 0;
      for (const o of ribbon.obstaclesNear(st.s, RACER_LENGTH, obsLook, this.obstacleBuf)) blockers.push(o);
      this.addHazardBlockers(st, ribbon, v, obsLook, time, blockers);
      // Skilled pilots steer clear of rivals; the rest trade paint.
      if (this.skill >= AI_AVOID_RACERS_SKILL) this.addRacerBlockers(st, ribbon, field, blockers);
      if (blockers.length === 0) this.planAge = Infinity;
      else {
        // Replanning every few steps is plenty: the plan is already lag-aware.
        if (this.planAge >= AI_PLAN_INTERVAL) {
          this.planTarget = this.planner.plan({
            ribbon,
            s: st.s,
            x: st.x,
            slope0: st.vx / v,
            lagDist: v * AI_PATH_LAG,
            // Lean toward the last plan, so a near tie doesn't flip sides every replan.
            line: this.planAge === Infinity ? target : target + (this.planTarget - target) * AI_PLAN_STICKINESS,
            look: obsLook,
            clearance,
            blockers,
            stretch: v * AI_OBSTACLE_LEAD_TIME,
            // A critically damped chase trails a moving target by 2/ω, and the driver acts a
            // reaction time late: aim that far ahead.
            lead: (v * 2) / (LATERAL_RESPONSE * (stats.handling / HANDLING_REF)) + v * this.bySkill(AI_REACTION_LO, AI_REACTION_HI),
            dropMargin: this.bySkill(AI_DROP_MARGIN_LO, AI_DROP_MARGIN_HI),
            maxSlope: (steerRate(stats) * AI_PLAN_RATE_SHARE) / v,
          });
          this.planAge = 0;
        }
        this.planAge++;
        target = this.planTarget;
      }
    }
    target += this.noise;
    this.aimX = target;
    // Act on what was seen a reaction time ago (an empty history means the current target).
    this.seen.push(target);
    const lag = Math.round(this.bySkill(AI_REACTION_LO, AI_REACTION_HI) / SIM_DT);
    while (this.seen.length > lag + 1) this.seen.shift();
    target = this.seen[0];

    // 3. Speed: brake when a bend ahead can't be held at this speed in the distance left.
    const reaction = this.bySkill(AI_BRAKE_REACTION_LO, AI_BRAKE_REACTION_HI);
    const profiles = this.profilesFor(ribbon, stats);
    const seen = ribbon.wrap(st.s + v * reaction);
    const top = currentTopSpeed(stats, st, true);
    let brake = v > Math.min(profileAt(ribbon, profiles.brake, st.s), profileAt(ribbon, profiles.brake, seen));
    const boostRoom = top <= profileAt(ribbon, profiles.boost, seen);
    const jump = nextJump(ribbon, st.s, (top * top) / (2 * BRAKE_DECEL) + top * reaction);
    const jumpSpeed = jump === null ? 0 : minJumpSpeed(ribbon, jump) * AI_JUMP_SPEED_MARGIN;
    // A loop ahead wants all the speed there is: stalling at its top is a wreck.
    const loopAhead = profiles.loopAhead[Math.floor(ribbon.wrap(st.s) / ribbon.step) % profiles.loopAhead.length] === 1;
    if (this.crossTrafficAhead(st, ribbon, field, v)) brake = true;
    if (v < jumpSpeed || st.airborne || loopAhead) brake = false;

    // 4. Steer the target onto where it should be, cancelling the corner drift.
    const pull = cornerPull(stats, ribbon.curvatureAt(st.s), st.speed, brake, ribbon.gripAt(st.s));
    const rate = steerRate(stats);
    const steer = this.lapse > 0 ? 0 : clamp(((target - veh.targetX) / AI_TARGET_TIME - pull) / rate, -1, 1);

    // 5. Boost when it pays: never while braking, only on a straight long enough for this
    // driver's patience (skilled drivers save the tank for the long ones), or to clear a jump.
    const run = profileAt(ribbon, profiles.boostRun, seen);
    // Far behind (the catch-up pushing), there is no tank worth saving.
    const patience = veh.pace > 1 ? 0 : this.bySkill(AI_BOOST_MIN_RUN_LO, AI_BOOST_MIN_RUN_HI);
    const worthIt = boostRoom && run >= v * patience;
    const boost = !brake && (worthIt || v < jumpSpeed || loopAhead);

    return { steer, nudge: 0, brake, boost };
  }

  /** The inside of what is coming, scaled by how hard it bends, kept on the road. */
  private racingLine(ribbon: Ribbon, s: number, v: number): number {
    const look = v * this.bySkill(AI_LINE_LOOK_TIME_LO, AI_LINE_LOOK_TIME_HI);
    let curvSum = 0;
    let n = 0;
    let half = ribbon.widthAt(s) / 2;
    for (let d = AI_SAMPLE_STEP; d <= look; d += AI_SAMPLE_STEP) {
      const sd = ribbon.wrap(s + d);
      curvSum += ribbon.curvatureAt(sd);
      half = Math.min(half, ribbon.widthAt(sd) / 2);
      n++;
    }
    const lane = Math.max(0, half - RACER_HALF_WIDTH - AI_WALL_MARGIN);
    return clamp(n > 0 ? curvSum / n / AI_LINE_FULL_CURVATURE : 0, -1, 1) * lane;
  }

  /** The nearest untaken boost cell close enough to the line to be worth the swerve. */
  private cellDetour(veh: Vehicle, ribbon: Ribbon, line: number, look: number): number {
    const st = veh.state;
    // A nearly full tank has no room for a cell.
    if (!this.options.cellDetours || st.boost > 1 - CELL_VALUE / 2) return line;
    const reach = this.bySkill(AI_CELL_DETOUR_LO, AI_CELL_DETOUR_HI);
    let best = line;
    let bestD = Infinity;
    for (const c of ribbon.cells) {
      const d = ribbon.delta(st.s, c.s);
      if (d <= 0 || d > look || d >= bestD || Math.abs(c.x - line) > reach) continue;
      if (veh.hasCollected(st.branch, c.index)) continue;
      best = c.x;
      bestD = d;
    }
    return best;
  }

  /**
   * A rival on the other leg of a flat crossing will get there just before us: yield. The
   * window is skill-scaled (a novice doesn't look).
   */
  private crossTrafficAhead(st: RacerState, ribbon: Ribbon, field: readonly RacerState[], v: number): boolean {
    const window = this.bySkill(AI_CROSSING_WINDOW_LO, AI_CROSSING_WINDOW_HI);
    if (window <= 0) return false;
    for (const c of ribbon.crossings) {
      if (c.style !== 'flat') continue;
      for (const [mine, theirs] of [
        [c.s, c.other],
        [c.other, c.s],
      ]) {
        const d = ribbon.delta(st.s, mine);
        if (d <= 0 || d > v * window * 2) continue;
        const etaMe = d / v;
        for (const r of field) {
          if (r === st || r.branch !== st.branch || r.crashed > 0) continue;
          const dr = ribbon.delta(r.s, theirs);
          if (dr <= 0) continue;
          const etaThem = dr / Math.max(r.speed, 1);
          if (etaThem <= etaMe && etaMe - etaThem < window) return true;
        }
      }
    }
    return false;
  }

  /** The nearest untaken repair cell, for a damaged hull: worth a wider swerve than boost. */
  private repairDetour(veh: Vehicle, ribbon: Ribbon, line: number, look: number): number {
    const st = veh.state;
    let best = line;
    let bestD = Infinity;
    for (const c of ribbon.repairCells) {
      const d = ribbon.delta(st.s, c.s);
      if (d <= 0 || d > look || d >= bestD || Math.abs(c.x - line) > AI_REPAIR_DETOUR) continue;
      if (veh.hasCollected(st.branch, c.index, 'repair')) continue;
      best = c.x;
      bestD = d;
    }
    return best;
  }

  /**
   * Hazards ahead, placed where they will be when this racer gets there: a sweeper's body at
   * arrival, rocks that will have landed, a barrier that will be down.
   */
  private addHazardBlockers(st: RacerState, ribbon: Ribbon, v: number, look: number, time: number, out: Blocker[]) {
    for (const h of ribbon.hazards) {
      const ahead = ribbon.delta(st.s, h.s0);
      const beyond = ribbon.delta(st.s, h.s1);
      if (beyond < -RACER_LENGTH || ahead > look) continue;
      const eta = Math.max(0, ahead) / v;
      // Where it will be on arrival, and a little either side: arrival time drifts with speed,
      // and a gate that drops just after the plan was made is as solid as one already down.
      for (const dt of [-AI_HAZARD_TIME_MARGIN, 0, AI_HAZARD_TIME_MARGIN]) {
        for (const o of hazardObstacles([h], time + Math.max(0, eta + dt), this.hazardBuf)) out.push({ s: o.s, x: o.x, radius: o.radius });
      }
    }
  }

  /**
   * Shortcuts: decided once per lap as one comes up (skilled drivers gamble on them more),
   * then lined up through the entry junction; on a branch, merge back in its exit junction.
   */
  private routeChoice(track: Track, st: RacerState, v: number, line: number): { x: number; crossing: boolean } {
    if (st.branch >= 0) {
      const b = track.branches[st.branch];
      if (st.s < junctionBounds(b).outStart) return { x: line, crossing: false };
      // The main road lies across the branch's main-facing edge.
      return { x: -b.side * (b.ribbon.widthAt(st.s) / 2 + RACER_HALF_WIDTH + AI_WALL_MARGIN), crossing: true };
    }
    if (!this.options.shortcuts) return { x: line, crossing: false };
    for (const b of track.branches) {
      const ahead = track.delta(st.s, b.entryS);
      const inJunction = ahead <= 0 && ahead > -junctionBounds(b).inEnd;
      if (!inJunction && (ahead < 0 || ahead > v * AI_SHORTCUT_LOOK_TIME)) continue;
      let choice = this.shortcut.get(b.index);
      if (choice === undefined || choice.lap !== st.lap) {
        choice = { lap: st.lap, take: this.rng() < this.bySkill(AI_SHORTCUT_LO, AI_SHORTCUT_HI) };
        this.shortcut.set(b.index, choice);
      }
      if (!choice.take) continue;
      // Hug the road edge until the junction opens, then cross onto the branch.
      const half = track.widthAt(st.s) / 2;
      return { x: b.side * (inJunction ? half + b.def.width / 2 : half - RACER_HALF_WIDTH), crossing: inJunction };
    }
    return { x: line, crossing: false };
  }

  /**
   * Per-sample speed limits, built once per ribbon: `brake` is the fastest speed from which
   * every bend ahead can still be held (corner drift no faster than the steer can cancel)
   * with full braking; `boost` is the same with braking scaled down by the driver's caution,
   * so a cautious driver needs a longer straight to boost; `boostRun` is how long the
   * boostable stretch ahead of each sample is.
   */
  private profilesFor(ribbon: Ribbon, stats: RacerStats): SpeedProfiles {
    const known = this.profiles.get(ribbon);
    if (known) return known;
    // Drift = |κ|·v²·CORNER_PULL·GRIP_REF/grip must stay within a share of the steer rate.
    const budget = (this.bySkill(AI_CORNER_FACTOR_LO, AI_CORNER_FACTOR_HI) * steerRate(stats) * stats.grip) / (CORNER_PULL * GRIP_REF);
    const corner = ribbon.samples.map((p) => Math.sqrt((budget * p.grip) / Math.max(Math.abs(p.curvature), Number.MIN_VALUE)));
    const envelope = (decel: number) => {
      const n = corner.length;
      const out = Float64Array.from(corner);
      // A loop needs two sweeps backwards so limits propagate across the start line.
      for (let pass = 0; pass < (ribbon.closed ? 2 : 1); pass++) {
        for (let i = n - 1; i >= 0; i--) {
          if (!ribbon.closed && i === n - 1) continue;
          const next = out[(i + 1) % n];
          out[i] = Math.min(out[i], Math.sqrt(next * next + 2 * decel * ribbon.step));
        }
      }
      return out;
    };
    const caution = this.bySkill(AI_BOOST_CAUTION_LO, AI_BOOST_CAUTION_HI);
    const boost = envelope(BRAKE_DECEL / caution);
    const boosted = stats.topSpeed * (1 + stats.boostPower);
    const boostRun = new Float64Array(boost.length);
    for (let pass = 0; pass < (ribbon.closed ? 2 : 1); pass++) {
      for (let i = boost.length - 1; i >= 0; i--) {
        const next = i + 1 < boost.length ? boostRun[i + 1] : ribbon.closed ? boostRun[0] : 0;
        boostRun[i] = boost[i] >= boosted ? next + ribbon.step : 0;
      }
    }
    // Distance to the next upside-down loop sample, swept backwards (twice round a loop).
    const loopAhead = new Uint8Array(ribbon.samples.length);
    let toTop = Infinity;
    for (let pass = 0; pass < (ribbon.closed ? 2 : 1); pass++) {
      for (let i = ribbon.samples.length - 1; i >= 0; i--) {
        const smp = ribbon.samples[i];
        toTop = smp.magnet && smp.up.y < 0 ? 0 : toTop + ribbon.step;
        loopAhead[i] = toTop <= AI_LOOP_LOOK ? 1 : 0;
      }
    }
    const made = { brake: envelope(BRAKE_DECEL), boost, boostRun, loopAhead };
    this.profiles.set(ribbon, made);
    return made;
  }

  /** Racers on the same ribbon we are catching, placed where we would meet them. */
  private addRacerBlockers(st: RacerState, ribbon: Ribbon, field: readonly RacerState[], out: Blocker[]) {
    for (const r of field) {
      if (r === st || r.branch !== st.branch || r.crashed > 0) continue;
      const gap = ribbon.delta(st.s, r.s);
      const closing = st.speed - r.speed;
      if (gap < -RACER_LENGTH) continue;
      const meet = gap <= 0 ? 0 : closing > 0 ? gap / closing : Infinity;
      if (meet > AI_RACER_LOOK_TIME) continue;
      out.push({ s: ribbon.wrap(r.s + r.speed * meet), x: r.x, radius: RACER_HALF_WIDTH });
    }
  }

  private evolveNoise() {
    const dt = SIM_DT;
    // Ornstein-Uhlenbeck: smooth wander rather than per-step jitter. Sum of three uniforms
    // stands in for a gaussian; its variance is 1/4, hence the factor 2.
    const g = (this.rng() + this.rng() + this.rng() - 1.5) * 2;
    const sigma = AI_TARGET_NOISE * (1 - this.skill);
    this.noise += (-this.noise / AI_NOISE_TAU) * dt + sigma * Math.sqrt((2 / AI_NOISE_TAU) * dt) * g;
    if (this.lapse > 0) this.lapse -= dt;
    else if (this.rng() < AI_MISTAKE_RATE * (1 - this.skill) ** 2 * dt) this.lapse = AI_MISTAKE_DURATION;
  }
}

function nextJump(ribbon: Ribbon, s: number, horizon: number): Jump | null {
  let best: Jump | null = null;
  let bestD = Infinity;
  for (const j of ribbon.jumps) {
    const d = ribbon.delta(s, j.lip);
    if (d > 0 && d < horizon && d < bestD) {
      best = j;
      bestD = d;
    }
  }
  return best;
}
