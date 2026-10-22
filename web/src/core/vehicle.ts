// One racer's physics in track space (s, x, y). The player and the AI drive the same model,
// so the AI can never be faster than physics allows.

import type { Jump, Obstacle, PlayerInput, RaceEvent, RacerState, RacerStats } from './types.ts';
import type { Track } from './track.ts';
import {
  ACCEL_TAPER_EXP,
  AIR_GRIP_FACTOR,
  AIR_STEER_FACTOR,
  ARCH_HALF_DEPTH,
  BOOST_ACCEL_MULT,
  BOOST_HEAT_RATE,
  BOOST_PAD_DURATION,
  BOOST_PAD_MAX_HEIGHT,
  BRAKE_DECEL,
  BRAKE_SLIDE_MULT,
  BRAKE_TURN_MULT,
  CEILING_BOUNCE,
  CEILING_DAMAGE,
  CEILING_SPEED_LOSS,
  DAMAGE_TOP_SPEED_LOSS,
  FRENET_MIN_DENOM,
  GRAVITY,
  GRIP_DAMP,
  HOVER_SUCTION,
  IMPACT_INTENSITY_SPEED,
  LAND_DAMAGE,
  LAND_SOFT_IMPACT,
  LAND_SPEED_LOSS,
  LANDING_STEP_TOLERANCE,
  MAX_YAW,
  OBSTACLE_CRASH_HEADON,
  OBSTACLE_CRASH_SPEED_FRACTION,
  OBSTACLE_DAMAGE_PER_SPEED,
  OBSTACLE_QUERY_RANGE,
  OBSTACLE_RESTITUTION,
  OBSTACLE_SPEED_LOSS,
  OVERHEAT_DURATION,
  OVERHEAT_TOP_SPEED,
  OVERSPEED_DECAY,
  RACER_HALF_WIDTH,
  RACER_HEIGHT,
  RACER_RADIUS,
  RESPAWN_BACKOFF,
  RESPAWN_DAMAGE,
  RESPAWN_DELAY,
  RESPAWN_INVULNERABLE,
  RESPAWN_JUMP_RUNUP,
  RESPAWN_SPEED_FRACTION,
  ROLL_PER_SLIDE,
  ROLL_PER_STEER,
  SCRAPE_BASE_INTENSITY,
  SIM_DT,
  SLIDE_INHERIT,
  SLIDE_SCRUB,
  SLOPE_SPEED_FACTOR,
  STEER_FADE_SPEED,
  STEER_SLEW,
  STEER_SPEED_FADE,
  WALL_DAMAGE_FREE_SPEED,
  WALL_DAMAGE_PER_SPEED,
  WALL_FRICTION_DECEL,
  WALL_IMPACT_SPEED_LOSS,
  WALL_RESTITUTION,
  WALL_YAW_REFLECT,
  YAW_SELF_CENTER,
} from '../data/tuning.ts';

export type CrashReason = Extract<RaceEvent, { type: 'crash' }>['reason'];

/** Per-racer race statistics the headless check and results screens can read. */
export interface DriveStats {
  crashes: Record<CrashReason, number>;
  /** Seconds spent touching a wall. */
  scrapeTime: number;
  /** Seconds spent racing (not crashed), for average speed. */
  activeTime: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Max yaw rate (rad/s) the racer can command at this speed. */
export function steerAuthority(stats: RacerStats, speed: number, brake: boolean, airborne: boolean): number {
  let a = stats.handling * (1 - STEER_SPEED_FADE * Math.min(1, speed / STEER_FADE_SPEED));
  if (brake) a *= BRAKE_TURN_MULT;
  if (airborne) a *= AIR_STEER_FACTOR;
  return a;
}

/** Top speed right now, given damage, overheat and whether boost is active. */
export function currentTopSpeed(stats: RacerStats, state: RacerState, boosting: boolean): number {
  let top = stats.topSpeed * (1 - DAMAGE_TOP_SPEED_LOSS * state.damage);
  if (state.overheat > 0) top *= OVERHEAT_TOP_SPEED;
  if (boosting) top *= 1 + stats.boostPower;
  return top;
}

/**
 * Minimum speed at the lip to clear a jump. The ramp is h·t² over its length L, so the lip
 * launches at vy = v·2h/L; the racer must still be above the far edge minus the landing
 * tolerance after crossing the gap G: v² ≥ g·G² / (2·(H + 2hG/L + tol)), where H is the lip's
 * height above the far edge. Infinity when no speed clears it.
 */
export function minJumpSpeed(track: Track, jump: Jump): number {
  const rampLength = track.delta(jump.rampStart, jump.lip);
  const gap = track.delta(jump.lip, jump.gapEnd);
  const lipHeight = track.elevationAt(track.wrap(jump.lip - track.step)) - track.elevationAt(jump.gapEnd);
  const reach = lipHeight + (2 * jump.rampHeight * gap) / rampLength + LANDING_STEP_TOLERANCE;
  if (reach <= 0) return Infinity;
  return gap * Math.sqrt(GRAVITY / (2 * reach));
}

/** The jump whose ramp or chasm contains s (with `before` metres of run-up), or null. */
export function jumpAround(track: Track, s: number, before: number): Jump | null {
  for (const j of track.jumps) {
    const from = j.rampStart - before;
    const span = track.delta(from, j.gapEnd);
    const d = track.wrap(s - from);
    if (d <= span) return j;
  }
  return null;
}

export class Vehicle {
  readonly state: RacerState;
  readonly stats: RacerStats;
  readonly drive: DriveStats;
  /** Absolute altitude of the racer's hover point, metres. */
  alt: number;
  grounded: boolean;
  /** Seconds of free boost left (boost pad or launch). */
  freeBoost: number;
  /** Where the last crash happened, for the respawn point. */
  crashS: number;
  /** Race time the current lap started. */
  lapStart: number;

  constructor(id: string, stats: RacerStats, track: Track, s: number, x: number) {
    this.stats = stats;
    this.state = {
      id,
      s,
      distance: track.delta(0, s),
      x,
      y: 0,
      vy: 0,
      speed: 0,
      vx: 0,
      yaw: 0,
      roll: track.bankAt(s),
      heat: 0,
      overheat: 0,
      damage: 0,
      boosting: false,
      airborne: false,
      crashed: 0,
      lap: 0,
      finishTime: null,
      place: 0,
      bestLap: null,
      steer: 0,
      invulnerable: 0,
    };
    this.drive = { crashes: { destroyed: 0, fell: 0, obstacle: 0 }, scrapeTime: 0, activeTime: 0 };
    this.alt = track.elevationAt(s);
    this.grounded = true;
    this.freeBoost = 0;
    this.crashS = s;
    this.lapStart = 0;
  }

  /** Advances one SIM_DT. Events go to `events`. */
  step(input: PlayerInput, track: Track, events: RaceEvent[]): void {
    const st = this.state;
    const dt = SIM_DT;
    if (st.crashed > 0) {
      st.crashed -= dt;
      if (st.crashed <= 0) this.respawn(track, events);
      return;
    }
    this.drive.activeTime += dt;
    st.invulnerable = Math.max(0, st.invulnerable - dt);

    // Applied steer follows the input at a finite rate.
    const target = clamp(input.steer, -1, 1);
    const maxStep = STEER_SLEW * dt;
    st.steer += clamp(target - st.steer, -maxStep, maxStep);

    this.updateHeat(input.boost, events);
    const boosting = st.boosting;
    const brake = input.brake;

    // Forward speed: auto-throttle toward the current top speed.
    const top = currentTopSpeed(this.stats, st, boosting);
    let dv: number;
    if (brake) dv = -BRAKE_DECEL;
    else if (st.speed < top) {
      const thrust = this.stats.accel * (boosting ? BOOST_ACCEL_MULT : 1);
      dv = thrust * (1 - (st.speed / top) ** ACCEL_TAPER_EXP);
    } else dv = -(st.speed - top) * OVERSPEED_DECAY;
    if (this.grounded) dv -= GRAVITY * track.slopeAt(st.s) * SLOPE_SPEED_FACTOR;
    dv -= Math.abs(st.vx) * SLIDE_SCRUB;
    st.speed = Math.max(0, st.speed + dv * dt);

    // Heading relative to the track, in the Frenet frame.
    const airborne = !this.grounded;
    const omega = st.steer * steerAuthority(this.stats, st.speed, brake, airborne);
    const sOld = st.s;
    const curvature = track.curvatureAt(sOld);
    const sdot = (st.speed * Math.cos(st.yaw)) / Math.max(FRENET_MIN_DENOM, 1 - curvature * st.x);
    st.yaw = clamp(st.yaw + (omega - curvature * sdot - st.yaw * YAW_SELF_CENTER) * dt, -MAX_YAW, MAX_YAW);

    // Momentum lags a steering rotation; the lag is slide that grip then kills.
    const inherit = SLIDE_INHERIT * (brake ? BRAKE_SLIDE_MULT : 1) * (airborne ? 0 : 1);
    st.vx -= st.speed * Math.cos(st.yaw) * omega * dt * inherit;
    st.vx *= Math.exp(-this.stats.grip * GRIP_DAMP * (airborne ? AIR_GRIP_FACTOR : 1) * dt);

    const ds = sdot * dt;
    st.s = track.wrap(sOld + ds);
    st.distance += ds;
    st.x += (st.speed * Math.sin(st.yaw) + st.vx) * dt;

    this.walls(track, events);
    this.vertical(track, sOld, sdot, events);
    if (st.crashed > 0) return;
    if (st.invulnerable <= 0) this.obstacles(track, events);
    if (st.crashed > 0) return;
    this.boostPads(track, sOld, events);
    if (st.damage >= 1) this.crash('destroyed', events);

    st.y = this.alt - track.elevationAt(st.s);
    st.airborne = !this.grounded;
    st.roll = track.bankAt(st.s) + st.steer * ROLL_PER_STEER - st.vx * ROLL_PER_SLIDE;
  }

  private updateHeat(wantBoost: boolean, events: RaceEvent[]) {
    const st = this.state;
    const dt = SIM_DT;
    this.freeBoost = Math.max(0, this.freeBoost - dt);
    let engineBoost = false;
    if (st.overheat > 0) {
      st.overheat = Math.max(0, st.overheat - dt);
      st.heat = Math.max(0, st.heat - this.stats.cooling * dt);
    } else if (wantBoost) {
      st.heat += BOOST_HEAT_RATE * dt;
      engineBoost = true;
      if (st.heat >= 1) {
        st.heat = 1;
        st.overheat = OVERHEAT_DURATION;
        engineBoost = false;
        events.push({ type: 'overheat', id: st.id });
      }
    } else st.heat = Math.max(0, st.heat - this.stats.cooling * dt);
    st.boosting = engineBoost || this.freeBoost > 0;
  }

  private walls(track: Track, events: RaceEvent[]) {
    const st = this.state;
    const half = track.widthAt(st.s) / 2 - RACER_HALF_WIDTH;
    if (Math.abs(st.x) <= half) return;
    const side: -1 | 1 = st.x > 0 ? 1 : -1;
    st.x = side * half;
    // Normal (into the wall) component of the track-space velocity.
    const vn = side * (st.speed * Math.sin(st.yaw) + st.vx);
    if (vn > 0) {
      st.speed = Math.max(0, st.speed - vn * WALL_IMPACT_SPEED_LOSS);
      this.damage(Math.max(0, vn - WALL_DAMAGE_FREE_SPEED) * WALL_DAMAGE_PER_SPEED);
      if (side * st.yaw > 0) st.yaw = -st.yaw * WALL_YAW_REFLECT;
      st.vx = -side * vn * WALL_RESTITUTION;
    }
    st.speed = Math.max(0, st.speed - WALL_FRICTION_DECEL * SIM_DT);
    this.drive.scrapeTime += SIM_DT;
    const intensity = clamp(SCRAPE_BASE_INTENSITY + Math.max(0, vn) / IMPACT_INTENSITY_SPEED, 0, 1);
    events.push({ type: 'scrape', id: st.id, side, intensity });
  }

  private vertical(track: Track, sOld: number, sdot: number, events: RaceEvent[]) {
    const st = this.state;
    const dt = SIM_DT;
    const s = st.s;
    const surface = track.elevationAt(s);
    const gap = track.isGap(s);
    if (this.grounded) {
      // The road's vertical velocity under us; launch when it falls away faster than
      // gravity plus hover suction can follow (crests, kickers, jump lips).
      const vSurf = (surface - track.elevationAt(sOld)) / dt;
      if (gap || vSurf < st.vy - (GRAVITY + HOVER_SUCTION) * dt) {
        this.grounded = false;
        events.push({ type: 'launch', id: st.id });
      } else {
        st.vy = vSurf;
        this.alt = surface;
      }
    }
    if (!this.grounded) {
      const wasOverGap = track.isGap(sOld);
      st.vy -= GRAVITY * dt;
      this.alt += st.vy * dt;
      if (gap) {
        if (this.alt < track.chasmFloorAt(s)) this.crash('fell', events);
      } else if (this.alt <= surface) {
        if (wasOverGap && this.alt < surface - LANDING_STEP_TOLERANCE) {
          this.crash('fell', events);
          return;
        }
        const vSurf = track.slopeAt(s) * sdot;
        const impact = Math.max(0, vSurf - st.vy);
        this.alt = surface;
        st.vy = vSurf;
        this.grounded = true;
        const hard = Math.max(0, impact - LAND_SOFT_IMPACT);
        st.speed *= 1 - Math.min(1, hard * LAND_SPEED_LOSS);
        this.damage(hard * LAND_DAMAGE);
        events.push({ type: 'land', id: st.id, impact });
      }
    }
    this.ceiling(track, surface, sdot, events);
  }

  private ceiling(track: Track, surface: number, sdot: number, events: RaceEvent[]) {
    const st = this.state;
    let ceiling = track.ceilingAt(st.s);
    for (const a of track.arches) {
      if (Math.abs(track.delta(a.s, st.s)) < ARCH_HALF_DEPTH) ceiling = Math.min(ceiling, a.height);
    }
    const maxAlt = surface + ceiling - RACER_HEIGHT;
    if (this.alt <= maxAlt) return;
    const vSurf = this.grounded ? st.vy : track.slopeAt(st.s) * sdot;
    const closing = Math.max(0, st.vy - vSurf);
    this.alt = maxAlt;
    st.vy = vSurf - closing * CEILING_BOUNCE;
    st.speed = Math.max(0, st.speed - closing * CEILING_SPEED_LOSS);
    this.damage(closing * CEILING_DAMAGE);
    events.push({ type: 'hit', id: st.id, kind: 'ceiling', intensity: clamp(closing / IMPACT_INTENSITY_SPEED, 0, 1) });
  }

  private obstacles(track: Track, events: RaceEvent[]) {
    const st = this.state;
    const height = this.alt - track.elevationAt(st.s);
    for (const o of track.obstaclesNear(st.s, OBSTACLE_QUERY_RANGE, OBSTACLE_QUERY_RANGE, nearBuf)) {
      if (height >= o.height) continue;
      const ds = track.delta(o.s, st.s);
      const dx = st.x - o.x;
      const reach = o.radius + RACER_RADIUS;
      const dist = Math.hypot(ds, dx);
      if (dist >= reach) continue;
      this.hitObstacle(track, o, ds, dx, dist, reach, events);
      if (st.crashed > 0) return;
    }
  }

  private hitObstacle(
    track: Track,
    o: Obstacle, ds: number, dx: number, dist: number, reach: number, events: RaceEvent[]) {
    const st = this.state;
    // Outward normal from the obstacle centre in the (s, x) plane.
    const ns = dist > 0 ? ds / dist : -1;
    const nx = dist > 0 ? dx / dist : 0;
    const vs = st.speed * Math.cos(st.yaw);
    const vxT = st.speed * Math.sin(st.yaw) + st.vx;
    const closing = -(vs * ns + vxT * nx);
    const total = Math.hypot(vs, vxT);
    if (closing > 0 && total > 0) {
      const headOn = closing / total;
      if (headOn > OBSTACLE_CRASH_HEADON && st.speed > OBSTACLE_CRASH_SPEED_FRACTION * this.stats.topSpeed) {
        events.push({ type: 'hit', id: st.id, kind: o.kind, intensity: 1 });
        this.crash('obstacle', events);
        return;
      }
      // Glancing: remove the closing velocity, bounce a little, keep the rest as the new heading.
      const bounce = closing * (1 + OBSTACLE_RESTITUTION);
      const nvs = vs + bounce * ns;
      const nvx = vxT + bounce * nx;
      const heading = Math.atan2(nvx, Math.max(nvs, 0));
      st.speed = Math.max(0, Math.hypot(nvs, nvx) - closing * OBSTACLE_SPEED_LOSS);
      st.yaw = clamp(heading, -MAX_YAW, MAX_YAW);
      st.vx = 0;
      this.damage(closing * OBSTACLE_DAMAGE_PER_SPEED);
      events.push({ type: 'hit', id: st.id, kind: o.kind, intensity: clamp(closing / IMPACT_INTENSITY_SPEED, 0, 1) });
    }
    // Push out of the obstacle along the normal.
    const push = reach - dist;
    st.x += nx * push;
    st.distance += ns * push;
    st.s = track.wrap(st.s + ns * push);
  }

  private boostPads(track: Track, sOld: number, events: RaceEvent[]) {
    const st = this.state;
    if (!this.grounded && this.alt - track.elevationAt(st.s) > BOOST_PAD_MAX_HEIGHT) return;
    for (const p of track.boostPads) {
      const crossed = track.delta(sOld, p.s) > 0 && track.delta(st.s, p.s) <= 0;
      if (crossed && Math.abs(st.x - p.x) < p.width / 2) {
        this.freeBoost = BOOST_PAD_DURATION;
        st.boosting = true;
        events.push({ type: 'boostPad', id: st.id });
      }
    }
  }

  /** Starts a free boost burst (launch boost at GO). */
  grantFreeBoost(seconds: number) {
    this.freeBoost = Math.max(this.freeBoost, seconds);
  }

  private damage(amount: number) {
    this.state.damage = Math.min(1, this.state.damage + amount / this.stats.armor);
  }

  private crash(reason: CrashReason, events: RaceEvent[]) {
    const st = this.state;
    st.crashed = RESPAWN_DELAY;
    st.speed = 0;
    st.vx = 0;
    st.boosting = false;
    this.freeBoost = 0;
    this.crashS = st.s;
    this.drive.crashes[reason]++;
    events.push({ type: 'crash', id: st.id, reason });
  }

  private respawn(track: Track, events: RaceEvent[]) {
    const st = this.state;
    let s = track.wrap(this.crashS - RESPAWN_BACKOFF);
    const jump = jumpAround(track, s, RESPAWN_JUMP_RUNUP);
    if (jump) s = track.wrap(jump.rampStart - RESPAWN_JUMP_RUNUP);
    st.distance += track.delta(st.s, s);
    st.s = s;
    st.x = 0;
    st.yaw = 0;
    st.vx = 0;
    st.vy = 0;
    st.steer = 0;
    this.alt = track.elevationAt(s);
    this.grounded = true;
    st.y = 0;
    st.airborne = false;
    st.speed = this.stats.topSpeed * RESPAWN_SPEED_FRACTION;
    st.damage = Math.min(st.damage, RESPAWN_DAMAGE);
    st.heat = 0;
    st.overheat = 0;
    st.crashed = 0;
    st.invulnerable = RESPAWN_INVULNERABLE;
    st.roll = track.bankAt(s);
    events.push({ type: 'respawn', id: st.id });
  }

}

const nearBuf: Obstacle[] = [];
