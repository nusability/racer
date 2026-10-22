// AI driver: reads the track ahead and produces the same PlayerInput a thumb would. It drives
// the same Vehicle model as the player, so it can only be as fast as physics allows.

import type { Obstacle, PlayerInput, RacerState, RacerStats } from './types.ts';
import type { Track } from './track.ts';
import { mulberry32, type Rng } from './rng.ts';
import { PathPlanner, type Blocker } from './aiPlanner.ts';
import { currentTopSpeed, minJumpSpeed, steerAuthority, type Vehicle } from './vehicle.ts';
import {
  AI_BOOST_CAUTION_HI,
  AI_BOOST_CAUTION_LO,
  AI_BOOST_REST_HI,
  AI_BOOST_REST_LO,
  AI_BRAKE_REACTION_HI,
  AI_BRAKE_REACTION_LO,
  AI_CLEARANCE_HI,
  AI_CLEARANCE_LO,
  AI_CORNER_FACTOR_HI,
  AI_CORNER_FACTOR_LO,
  AI_HEAT_HYSTERESIS,
  AI_HEAT_LIMIT_HI,
  AI_HEAT_LIMIT_LO,
  AI_JUMP_SPEED_MARGIN,
  AI_LINE_FULL_CURVATURE,
  AI_LINE_LOOK_TIME_HI,
  AI_LINE_LOOK_TIME_LO,
  AI_MAX_YAW,
  AI_MISTAKE_DURATION,
  AI_MISTAKE_RATE,
  AI_NOISE_TAU,
  AI_OBSTACLE_LEAD_TIME,
  AI_OBSTACLE_LOOK_TIME_HI,
  AI_OBSTACLE_LOOK_TIME_LO,
  AI_OVERHEAT_GAMBLE,
  AI_PAD_DETOUR,
  AI_PATH_LAG,
  AI_PATH_WINDOW,
  AI_PLAN_INTERVAL,
  AI_PLAN_STEP,
  AI_POS_GAIN,
  AI_RACER_LOOK_TIME,
  AI_SAMPLE_STEP,
  AI_START_BOOST_CHANCE,
  AI_STEER_NOISE,
  AI_WALL_MARGIN,
  AI_YAW_GAIN,
  BRAKE_DECEL,
  FRENET_MIN_DENOM,
  RACER_HALF_WIDTH,
  RACER_LENGTH,
  RACER_RADIUS,
  SIM_DT,
  STEER_FADE_SPEED,
  STEER_SPEED_FADE,
  YAW_SELF_CENTER,
} from '../data/tuning.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function profileAt(track: Track, profile: Float64Array, s: number): number {
  return profile[Math.floor(track.wrap(s) / track.step) % profile.length];
}

/** Mixes a race seed and an entrant index into an independent per-driver seed. */
export function driverSeed(raceSeed: number, index: number): number {
  return (Math.imul(raceSeed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(index + 1, 0xc2b2ae35)) >>> 0;
}

export class AiDriver {
  readonly skill: number;
  private readonly rng: Rng;
  private readonly heatLimit: number;
  private readonly boostRest: number;
  private noise = 0;
  private lapse = 0;
  private boostLatched = true;
  /** Ignoring the heat limit this cycle. */
  private pushing = false;
  /** Seconds the engine has sat fully cooled. */
  private coldTime = 0;
  /** Steering held through a lapse. */
  private frozenSteer = 0;
  private readonly obstacleBuf: Obstacle[] = [];
  private readonly planner = new PathPlanner();
  private readonly blockers: Blocker[] = [];
  /** Steps since the path was last planned, and its heading (lateral m per m). */
  private planAge = Infinity;
  private planSlope = 0;
  private profiles: { track: Track; brake: Float64Array; boost: Float64Array } | null = null;

  constructor(skill: number, seed: number) {
    if (!(skill >= 0 && skill <= 1)) throw new Error(`AiDriver: skill ${skill} outside 0..1`);
    this.skill = skill;
    this.rng = mulberry32(seed);
    this.heatLimit = this.bySkill(AI_HEAT_LIMIT_LO, AI_HEAT_LIMIT_HI);
    // A rest only means something once the engine has fully cooled.
    this.boostRest = this.bySkill(AI_BOOST_REST_LO, AI_BOOST_REST_HI);
  }

  private bySkill(lo: number, hi: number): number {
    return lo + (hi - lo) * this.skill;
  }

  /** Whether this driver holds boost at the exact moment of GO. */
  startBoost(): boolean {
    return this.rng() < AI_START_BOOST_CHANCE * this.skill;
  }

  /**
   * The input for one SIM_DT step. Call every step so noise and lapses evolve evenly.
   * `field` is every racer in the race (this one included); slower ones ahead are avoided.
   */
  drive(veh: Vehicle, track: Track, field: readonly RacerState[]): PlayerInput {
    this.evolveNoise();
    const st = veh.state;
    if (st.crashed > 0) return { steer: 0, brake: false, boost: false };
    const v = Math.max(st.speed, 1);
    const stats = veh.stats;

    // 1. The racing line: the inside of what is coming, scaled by how hard it bends.
    const lineLook = v * this.bySkill(AI_LINE_LOOK_TIME_LO, AI_LINE_LOOK_TIME_HI);
    let curvSum = 0;
    let n = 0;
    let half = track.widthAt(st.s) / 2;
    for (let d = AI_SAMPLE_STEP; d <= lineLook; d += AI_SAMPLE_STEP) {
      const s = track.wrap(st.s + d);
      curvSum += track.curvatureAt(s);
      half = Math.min(half, track.widthAt(s) / 2);
      n++;
    }
    const lane = half - RACER_HALF_WIDTH - AI_WALL_MARGIN;
    let target = clamp(n > 0 ? curvSum / n / AI_LINE_FULL_CURVATURE : 0, -1, 1) * Math.max(0, lane);

    // 2. Boost pads close to the line are worth a detour.
    for (const p of track.boostPads) {
      const d = track.delta(st.s, p.s);
      if (d > 0 && d < lineLook && Math.abs(p.x - target) < AI_PAD_DETOUR) target = p.x;
    }

    // 3. Arch openings pull the line in; obstacles hand steering to the path planner.
    const obsLook = v * this.bySkill(AI_OBSTACLE_LOOK_TIME_LO, AI_OBSTACLE_LOOK_TIME_HI);
    const clearance = this.bySkill(AI_CLEARANCE_LO, AI_CLEARANCE_HI);
    // Lateral velocity the racer wants; obstacles replace the gentle approach to the line.
    let xdotWanted: number | null = null;
    if (this.lapse <= 0) {
      for (const a of track.arches) {
        const d = track.delta(st.s, a.s);
        if (d < 0 || d > obsLook) continue;
        const lo = a.openMin + RACER_RADIUS + clearance;
        const hi = a.openMax - RACER_RADIUS - clearance;
        target = lo <= hi ? clamp(target, lo, hi) : (a.openMin + a.openMax) / 2;
      }
      const blockers = this.blockers;
      blockers.length = 0;
      for (const o of track.obstaclesNear(st.s, RACER_LENGTH, obsLook, this.obstacleBuf)) blockers.push(o);
      this.addRacerBlockers(st, track, field, blockers);
      if (blockers.length === 0) this.planAge = Infinity;
      else {
        // Replanning every few steps is plenty: the plan is already lag-aware.
        if (this.planAge >= AI_PLAN_INTERVAL) {
          // The racer keeps its current lateral motion until steering bites, so the plan is
          // free only after that; then hold the path's heading rather than chase a point,
          // which would ring against the slide lag.
          const xdot = st.speed * Math.sin(st.yaw) + st.vx;
          this.planSlope = this.planner.plan(
            track,
            st.s,
            st.x,
            xdot / v,
            v * AI_PATH_LAG,
            target,
            obsLook,
            clearance,
            blockers,
            v * AI_OBSTACLE_LEAD_TIME,
            Math.max(AI_PLAN_STEP, v * AI_PATH_WINDOW),
          );
          this.planAge = 0;
        }
        this.planAge++;
        xdotWanted = this.planSlope * v;
      }
    }

    // 4. Speed: brake when a bend ahead can't be taken at this speed in the distance left.
    const reaction = this.bySkill(AI_BRAKE_REACTION_LO, AI_BRAKE_REACTION_HI);
    const profiles = this.profilesFor(track, stats);
    const seen = track.wrap(st.s + v * reaction);
    const top = currentTopSpeed(stats, st, true);
    let brakeNeeded = v > Math.min(profileAt(track, profiles.brake, st.s), profileAt(track, profiles.brake, seen));
    const boostRoom = top <= profileAt(track, profiles.boost, seen);
    const horizon = (top * top) / (2 * BRAKE_DECEL) + top * reaction;
    const jump = this.nextJump(track, st.s, horizon);
    const jumpSpeed = jump === null ? 0 : minJumpSpeed(track, jump) * AI_JUMP_SPEED_MARGIN;
    if (v < jumpSpeed) brakeNeeded = false;

    // 5. Steering: cascade from lateral error to heading to yaw rate, with curvature feed-forward.
    const maxLat = v * Math.sin(AI_MAX_YAW);
    const xdotDes = clamp(xdotWanted ?? (target - st.x) * AI_POS_GAIN, -maxLat, maxLat);
    const yawDes = Math.asin(clamp((xdotDes - st.vx) / v, -Math.sin(AI_MAX_YAW), Math.sin(AI_MAX_YAW)));
    const curvature = track.curvatureAt(st.s);
    const sdot = (v * Math.cos(st.yaw)) / Math.max(FRENET_MIN_DENOM, 1 - curvature * st.x);
    const omegaDes = curvature * sdot + AI_YAW_GAIN * (yawDes - st.yaw) + st.yaw * YAW_SELF_CENTER;
    const airborne = st.airborne;
    // Running out of steering is the other reason to brake: the brake-drift adds authority.
    if (!airborne && Math.abs(omegaDes) > steerAuthority(stats, v, false, false) && v > jumpSpeed) brakeNeeded = true;
    const brake = brakeNeeded && !airborne;
    const steer =
      this.lapse > 0 ? this.frozenSteer : clamp(omegaDes / steerAuthority(stats, v, brake, airborne) + this.noise, -1, 1);
    if (this.lapse <= 0) this.frozenSteer = steer;

    // 6. Boost with a heat margin; never while braking.
    this.coldTime = st.heat > 0 ? 0 : this.coldTime + SIM_DT;
    // At the limit a novice may keep pushing into overheat; the call is made once per cycle.
    if (st.heat >= this.heatLimit && this.boostLatched && !this.pushing) {
      this.pushing = this.rng() < AI_OVERHEAT_GAMBLE * (1 - this.skill);
      this.boostLatched = this.pushing;
    } else if (st.overheat > 0) {
      this.pushing = false;
      this.boostLatched = false;
    } else if (st.heat <= this.heatLimit - AI_HEAT_HYSTERESIS && this.coldTime >= this.boostRest) this.boostLatched = true;
    const wantSpeed = boostRoom || v < jumpSpeed;
    const boost = !brake && wantSpeed && this.boostLatched && st.overheat <= 0;

    return { steer, brake, boost };
  }

  /**
   * Per-sample speed limits, built once per track: `brake` is the fastest speed from which
   * every bend ahead can still be made with full braking; `boost` is the same with braking
   * scaled down by the driver's caution, so a cautious driver needs a longer straight to boost.
   */
  private profilesFor(track: Track, stats: RacerStats): { brake: Float64Array; boost: Float64Array } {
    if (this.profiles !== null && this.profiles.track === track) return this.profiles;
    // Authority fades linearly with speed, so the cornering limit has a closed form.
    const h = this.bySkill(AI_CORNER_FACTOR_LO, AI_CORNER_FACTOR_HI) * stats.handling;
    const corner = track.samples.map((p) => h / (Math.abs(p.curvature) + (h * STEER_SPEED_FADE) / STEER_FADE_SPEED));
    const envelope = (decel: number) => {
      const n = corner.length;
      const out = Float64Array.from(corner);
      // Two sweeps backwards round the loop let limits propagate across the start line.
      for (let pass = 0; pass < 2; pass++) {
        for (let i = n - 1; i >= 0; i--) {
          const next = out[(i + 1) % n];
          out[i] = Math.min(out[i], Math.sqrt(next * next + 2 * decel * track.step));
        }
      }
      return out;
    };
    const caution = this.bySkill(AI_BOOST_CAUTION_LO, AI_BOOST_CAUTION_HI);
    this.profiles = { track, brake: envelope(BRAKE_DECEL), boost: envelope(BRAKE_DECEL / caution) };
    return this.profiles;
  }

  /** Racers we are catching, placed where we would meet them. */
  private addRacerBlockers(st: RacerState, track: Track, field: readonly RacerState[], out: Blocker[]) {
    for (const r of field) {
      if (r === st || r.crashed > 0 || r.invulnerable > 0) continue;
      const gap = track.delta(st.s, r.s);
      const closing = st.speed - r.speed;
      if (gap < -RACER_LENGTH) continue;
      const meet = gap <= 0 ? 0 : closing > 0 ? gap / closing : Infinity;
      if (meet > AI_RACER_LOOK_TIME) continue;
      out.push({ s: track.wrap(r.s + r.speed * meet), x: r.x, radius: RACER_HALF_WIDTH });
    }
  }

  private nextJump(track: Track, s: number, horizon: number) {
    let best = null;
    let bestD = Infinity;
    for (const j of track.jumps) {
      const d = track.delta(s, j.lip);
      if (d > 0 && d < horizon && d < bestD) {
        best = j;
        bestD = d;
      }
    }
    return best;
  }

  private evolveNoise() {
    const dt = SIM_DT;
    // Ornstein-Uhlenbeck: smooth wander rather than per-step jitter. Sum of three uniforms
    // stands in for a gaussian; its variance is 1/4, hence the factor 2.
    const g = (this.rng() + this.rng() + this.rng() - 1.5) * 2;
    const sigma = AI_STEER_NOISE * (1 - this.skill);
    this.noise += (-this.noise / AI_NOISE_TAU) * dt + sigma * Math.sqrt((2 / AI_NOISE_TAU) * dt) * g;
    if (this.lapse > 0) this.lapse -= dt;
    else if (this.rng() < AI_MISTAKE_RATE * (1 - this.skill) ** 2 * dt) this.lapse = AI_MISTAKE_DURATION;
  }
}
