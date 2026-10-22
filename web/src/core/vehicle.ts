// One racer's physics in track space (s, x, y) on whichever ribbon it is on (main loop or a
// shortcut). The craft always flies along the track; the player sets *where across it* it
// is (a lateral target the craft chases), not its heading. The player and the AI drive the
// same model, so the AI can never be faster than physics allows.

import type { Jump, Obstacle, PlayerInput, RaceEvent, RacerState, RacerStats } from './types.ts';
import type { Ribbon } from './track.ts';
import {
  ACCEL_TAPER_EXP,
  AIR_STEER_FACTOR,
  ARCH_HALF_DEPTH,
  BOOST_ACCEL_MULT,
  BOOST_HEAT_RATE,
  BOOST_PAD_DURATION,
  BOOST_PAD_MAX_HEIGHT,
  BOUNDARY_DAMAGE_FREE_SPEED,
  BOUNDARY_DAMAGE_PER_SPEED,
  BOUNDARY_FRICTION_DECEL,
  BOUNDARY_RESTITUTION,
  BOUNDARY_SPEED_LOSS,
  BRAKE_DECEL,
  CEILING_BOUNCE,
  CEILING_DAMAGE,
  CEILING_SPEED_LOSS,
  CORNER_PULL,
  CORNER_PULL_BRAKE,
  DAMAGE_TOP_SPEED_LOSS,
  FRENET_MIN_DENOM,
  GRAVITY,
  GRIP_REF,
  HANDLING_REF,
  HOVER_SUCTION,
  IMPACT_INTENSITY_SPEED,
  LAND_DAMAGE,
  LAND_SOFT_IMPACT,
  LAND_SPEED_LOSS,
  LANDING_STEP_TOLERANCE,
  LATERAL_RESPONSE,
  LATERAL_SPEED_MAX,
  MAX_LEAN,
  MAX_VISUAL_YAW,
  OBSTACLE_CRASH_OFFSET,
  OBSTACLE_CRASH_SPEED_FRACTION,
  OBSTACLE_DAMAGE,
  OBSTACLE_DEFLECT_SPEED,
  OBSTACLE_QUERY_RANGE,
  OBSTACLE_SPEED_LOSS,
  OVERHEAT_DURATION,
  OVERHEAT_TOP_SPEED,
  OVERSPEED_DECAY,
  RACER_HALF_WIDTH,
  RACER_HEIGHT,
  RACER_RADIUS,
  RESPAWN_DAMAGE,
  RESPAWN_DELAY,
  RESPAWN_INVULNERABLE,
  RESPAWN_SPEED_FRACTION,
  ROLL_PER_LATERAL_SPEED,
  SAND_DRAG,
  SAND_TOP_SPEED,
  SCRAPE_BASE_INTENSITY,
  SIM_DT,
  SLOPE_SPEED_FACTOR,
  STEER_TARGET_RATE,
  TARGET_OVERREACH,
} from '../data/tuning.ts';

export type CrashReason = Extract<RaceEvent, { type: 'crash' }>['reason'];

/** Per-racer race statistics the headless check and results screens can read. */
export interface DriveStats {
  crashes: Record<CrashReason, number>;
  /** Seconds spent touching a hard boundary. */
  scrapeTime: number;
  /** Seconds spent on sand. */
  offroadTime: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** How fast full steer moves the lateral target, m/s. */
export function steerRate(stats: RacerStats): number {
  return STEER_TARGET_RATE * (stats.handling / HANDLING_REF);
}

/**
 * Outward drift of the lateral target in a corner, m/s (signed: + = rightward). It grows
 * with speed²·curvature, so a hairpin at full boost carries you wide unless you hold the
 * inside; grip and the air brake reduce it.
 */
export function cornerPull(stats: RacerStats, curvature: number, speed: number, brake: boolean): number {
  const pull = -curvature * speed * speed * CORNER_PULL * (GRIP_REF / stats.grip);
  return brake ? pull * CORNER_PULL_BRAKE : pull;
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
export function minJumpSpeed(ribbon: Ribbon, jump: Jump): number {
  const rampLength = ribbon.delta(jump.rampStart, jump.lip);
  const gap = ribbon.delta(jump.lip, jump.gapEnd);
  const lipHeight = ribbon.elevationAt(ribbon.wrap(jump.lip - ribbon.step)) - ribbon.elevationAt(jump.gapEnd);
  const reach = lipHeight + (2 * jump.rampHeight * gap) / rampLength + LANDING_STEP_TOLERANCE;
  if (reach <= 0) return Infinity;
  return gap * Math.sqrt(GRAVITY / (2 * reach));
}

/** The jump whose ramp or chasm contains s (with `before` metres of run-up), or null. */
export function jumpAround(ribbon: Ribbon, s: number, before: number): Jump | null {
  for (const j of ribbon.jumps) {
    const from = j.rampStart - before;
    const d = ribbon.closed ? ribbon.wrap(s - from) : s - from;
    if (d >= 0 && d <= ribbon.delta(from, j.gapEnd)) return j;
  }
  return null;
}

export class Vehicle {
  readonly state: RacerState;
  readonly stats: RacerStats;
  readonly drive: DriveStats;
  /** Where across the ribbon the racer wants to be; x chases it. */
  targetX: number;
  /** Absolute altitude of the racer's hover point, metres. */
  alt: number;
  grounded: boolean;
  /** On the sand run-off (beyond the road edge). */
  offroad: boolean;
  /** Seconds of free boost left (boost pad or launch). */
  freeBoost: number;
  /** Where the last crash happened (ribbon and s), for the respawn point. */
  crashBranch: number;
  crashS: number;
  /** Set when the crash timer runs out: the race picks the respawn point. */
  respawnDue: boolean;
  /** Race time the current lap started. */
  lapStart: number;
  /** The obstacle currently being touched, so one contact is judged and reported once. */
  private touching: Obstacle | null = null;

  constructor(id: string, stats: RacerStats, ribbon: Ribbon, s: number, x: number, distance: number) {
    this.stats = stats;
    this.state = {
      id,
      branch: -1,
      s,
      distance,
      x,
      y: 0,
      vy: 0,
      speed: 0,
      vx: 0,
      yaw: 0,
      roll: ribbon.bankAt(s),
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
    this.drive = { crashes: { destroyed: 0, fell: 0, obstacle: 0 }, scrapeTime: 0, offroadTime: 0 };
    this.targetX = x;
    this.alt = ribbon.elevationAt(s);
    this.grounded = true;
    this.offroad = false;
    this.freeBoost = 0;
    this.crashBranch = -1;
    this.crashS = s;
    this.respawnDue = false;
    this.lapStart = 0;
  }

  /** Advances one SIM_DT on `ribbon` (the one state.branch names). Events go to `events`. */
  step(input: PlayerInput, ribbon: Ribbon, events: RaceEvent[]): void {
    const st = this.state;
    const dt = SIM_DT;
    if (st.crashed > 0) {
      st.crashed -= dt;
      if (st.crashed <= 0) this.respawnDue = true;
      return;
    }
    st.invulnerable = Math.max(0, st.invulnerable - dt);
    st.steer = clamp(input.steer, -1, 1);
    const brake = input.brake;
    const airborne = !this.grounded;

    this.updateHeat(input.boost, events);
    this.updateSpeed(ribbon, brake);

    // Lateral target: steer moves it, a drag nudges it, corners drift it outward.
    const sOld = st.s;
    const curvature = ribbon.curvatureAt(sOld);
    const air = airborne ? AIR_STEER_FACTOR : 1;
    this.targetX +=
      (st.steer * steerRate(this.stats) * air + cornerPull(this.stats, curvature, st.speed, brake)) * dt + input.nudge;
    this.targetX = clamp(
      this.targetX,
      ribbon.minXAt(sOld) + RACER_HALF_WIDTH - TARGET_OVERREACH,
      ribbon.maxXAt(sOld) - RACER_HALF_WIDTH + TARGET_OVERREACH,
    );

    // x chases the target critically damped, with a cap on sideways speed.
    const k = this.stats.handling / HANDLING_REF;
    const w = LATERAL_RESPONSE * k * air;
    const maxLat = LATERAL_SPEED_MAX * k;
    st.vx = clamp(st.vx + (w * w * (this.targetX - st.x) - 2 * w * st.vx) * dt, -maxLat, maxLat);

    // Sideways motion borrows from forward motion, so weaving is not free.
    const forward = Math.sqrt(Math.max(0, st.speed * st.speed - st.vx * st.vx));
    const sdot = forward / Math.max(FRENET_MIN_DENOM, 1 - curvature * st.x);
    st.s = ribbon.wrap(sOld + sdot * dt);
    st.x += st.vx * dt;

    this.boundaries(ribbon, events);
    this.vertical(ribbon, sOld, sdot, events);
    if (st.crashed > 0) return;
    if (st.invulnerable <= 0) this.obstacles(ribbon, events);
    if (st.crashed > 0) return;
    this.boostPads(ribbon, sOld, events);
    this.sand(ribbon, events);
    if (st.damage >= 1) {
      this.crash('destroyed', ribbon, events);
      return;
    }

    st.y = this.alt - ribbon.elevationAt(st.s);
    st.airborne = !this.grounded;
    st.yaw = clamp(Math.atan2(st.vx, Math.max(st.speed, 1)), -MAX_VISUAL_YAW, MAX_VISUAL_YAW);
    st.roll = ribbon.bankAt(st.s) + clamp(st.vx * ROLL_PER_LATERAL_SPEED, -MAX_LEAN, MAX_LEAN);
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

  /** Auto-throttle toward the current top speed; sand caps it lower and drags. */
  private updateSpeed(ribbon: Ribbon, brake: boolean) {
    const st = this.state;
    let top = currentTopSpeed(this.stats, st, st.boosting);
    if (this.offroad) top *= SAND_TOP_SPEED;
    let dv: number;
    if (brake) dv = -BRAKE_DECEL;
    else if (st.speed < top) {
      const thrust = this.stats.accel * (st.boosting ? BOOST_ACCEL_MULT : 1);
      dv = thrust * (1 - (st.speed / top) ** ACCEL_TAPER_EXP);
    } else dv = -(st.speed - top) * OVERSPEED_DECAY;
    if (this.grounded) dv -= GRAVITY * ribbon.slopeAt(st.s) * SLOPE_SPEED_FACTOR;
    if (this.offroad) dv -= SAND_DRAG;
    st.speed = Math.max(0, st.speed + dv * SIM_DT);
  }

  /** Hard boundaries forgive: a speed scrub and a push back, damage only at a hard angle. */
  private boundaries(ribbon: Ribbon, events: RaceEvent[]) {
    const st = this.state;
    const lo = ribbon.minXAt(st.s) + RACER_HALF_WIDTH;
    const hi = ribbon.maxXAt(st.s) - RACER_HALF_WIDTH;
    if (st.x >= lo && st.x <= hi) return;
    const side: -1 | 1 = st.x > hi ? 1 : -1;
    st.x = side === 1 ? hi : lo;
    const vn = Math.max(0, side * st.vx);
    st.speed = Math.max(0, st.speed - vn * BOUNDARY_SPEED_LOSS - BOUNDARY_FRICTION_DECEL * SIM_DT);
    this.damage(Math.max(0, vn - BOUNDARY_DAMAGE_FREE_SPEED) * BOUNDARY_DAMAGE_PER_SPEED);
    if (vn > 0) st.vx = -side * vn * BOUNDARY_RESTITUTION;
    this.drive.scrapeTime += SIM_DT;
    const intensity = clamp(SCRAPE_BASE_INTENSITY + vn / IMPACT_INTENSITY_SPEED, 0, 1);
    events.push({ type: 'scrape', id: st.id, side, intensity });
  }

  private sand(ribbon: Ribbon, events: RaceEvent[]) {
    const st = this.state;
    const on = this.grounded && !ribbon.onRoad(st.s, st.x);
    if (on) this.drive.offroadTime += SIM_DT;
    if (on !== this.offroad) {
      this.offroad = on;
      events.push({ type: 'offroad', id: st.id, on });
    }
  }

  private vertical(ribbon: Ribbon, sOld: number, sdot: number, events: RaceEvent[]) {
    const st = this.state;
    const dt = SIM_DT;
    const s = st.s;
    const surface = ribbon.elevationAt(s);
    const gap = ribbon.isGap(s);
    if (this.grounded) {
      // The road's vertical velocity under us; launch when it falls away faster than
      // gravity plus hover suction can follow (crests, kickers, jump lips).
      const vSurf = (surface - ribbon.elevationAt(sOld)) / dt;
      if (gap || vSurf < st.vy - (GRAVITY + HOVER_SUCTION) * dt) {
        this.grounded = false;
        events.push({ type: 'launch', id: st.id });
      } else {
        st.vy = vSurf;
        this.alt = surface;
      }
    }
    if (!this.grounded) {
      const wasOverGap = ribbon.isGap(sOld);
      st.vy -= GRAVITY * dt;
      this.alt += st.vy * dt;
      if (gap) {
        if (this.alt < ribbon.chasmFloorAt(s)) {
          this.crash('fell', ribbon, events);
          return;
        }
      } else if (this.alt <= surface) {
        if (wasOverGap && this.alt < surface - LANDING_STEP_TOLERANCE) {
          this.crash('fell', ribbon, events);
          return;
        }
        const vSurf = ribbon.slopeAt(s) * sdot;
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
    this.ceiling(ribbon, surface, sdot, events);
  }

  private ceiling(ribbon: Ribbon, surface: number, sdot: number, events: RaceEvent[]) {
    const st = this.state;
    let ceiling = ribbon.ceilingAt(st.s);
    for (const a of ribbon.arches) {
      if (Math.abs(ribbon.delta(a.s, st.s)) < ARCH_HALF_DEPTH) ceiling = Math.min(ceiling, a.height);
    }
    const maxAlt = surface + ceiling - RACER_HEIGHT;
    if (this.alt <= maxAlt) return;
    const vSurf = this.grounded ? st.vy : ribbon.slopeAt(st.s) * sdot;
    const closing = Math.max(0, st.vy - vSurf);
    this.alt = maxAlt;
    st.vy = vSurf - closing * CEILING_BOUNCE;
    st.speed = Math.max(0, st.speed - closing * CEILING_SPEED_LOSS);
    this.damage(closing * CEILING_DAMAGE);
    events.push({ type: 'hit', id: st.id, kind: 'ceiling', intensity: clamp(closing / IMPACT_INTENSITY_SPEED, 0, 1) });
  }

  private obstacles(ribbon: Ribbon, events: RaceEvent[]) {
    const st = this.state;
    const height = this.alt - ribbon.elevationAt(st.s);
    let touched: Obstacle | null = null;
    for (const o of ribbon.obstaclesNear(st.s, OBSTACLE_QUERY_RANGE, OBSTACLE_QUERY_RANGE, nearBuf)) {
      if (height >= o.height) continue;
      const ds = ribbon.delta(o.s, st.s);
      const reach = o.radius + RACER_RADIUS;
      if (Math.hypot(ds, st.x - o.x) >= reach) continue;
      touched = o;
      if (this.hitObstacle(o, ds, reach, ribbon, events)) return;
    }
    this.touching = touched;
  }

  /**
   * Only a near dead-centre hit at speed is a crash; anything else slides the racer round
   * the obstacle's side with a speed loss and a little damage. Returns true on a crash.
   */
  private hitObstacle(o: Obstacle, ds: number, reach: number, ribbon: Ribbon, events: RaceEvent[]): boolean {
    const st = this.state;
    const offset = Math.abs(st.x - o.x) / reach;
    // Pass on the side the racer is already on, or failing that the side it is heading for.
    const side = st.x !== o.x ? Math.sign(st.x - o.x) : this.targetX >= o.x ? 1 : -1;
    if (this.touching !== o) {
      const fast = st.speed > OBSTACLE_CRASH_SPEED_FRACTION * this.stats.topSpeed;
      if (offset < OBSTACLE_CRASH_OFFSET && fast) {
        events.push({ type: 'hit', id: st.id, kind: o.kind, intensity: 1 });
        this.crash('obstacle', ribbon, events);
        return true;
      }
      const centrality = 1 - offset;
      st.speed *= 1 - OBSTACLE_SPEED_LOSS * centrality;
      this.damage(OBSTACLE_DAMAGE * centrality);
      events.push({ type: 'hit', id: st.id, kind: o.kind, intensity: centrality });
    }
    st.x = o.x + side * Math.sqrt(Math.max(0, reach * reach - ds * ds));
    st.vx = side * Math.max(side * st.vx, OBSTACLE_DEFLECT_SPEED);
    // The target follows, or the chase would pull the racer straight back into the rock.
    if (side * (this.targetX - st.x) < 0) this.targetX = st.x;
    return false;
  }

  private boostPads(ribbon: Ribbon, sOld: number, events: RaceEvent[]) {
    const st = this.state;
    if (!this.grounded && this.alt - ribbon.elevationAt(st.s) > BOOST_PAD_MAX_HEIGHT) return;
    for (const p of ribbon.boostPads) {
      const crossed = ribbon.delta(sOld, p.s) > 0 && ribbon.delta(st.s, p.s) <= 0;
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

  /** Moves the racer to another ribbon (a junction transfer), keeping its offset to the target. */
  transfer(branch: number, s: number, x: number) {
    const st = this.state;
    this.targetX += x - st.x;
    st.branch = branch;
    st.s = s;
    st.x = x;
  }

  private damage(amount: number) {
    this.state.damage = Math.min(1, this.state.damage + amount / this.stats.armor);
  }

  private crash(reason: CrashReason, ribbon: Ribbon, events: RaceEvent[]) {
    const st = this.state;
    st.crashed = RESPAWN_DELAY;
    st.speed = 0;
    st.vx = 0;
    st.boosting = false;
    this.freeBoost = 0;
    this.crashBranch = st.branch;
    this.crashS = ribbon.wrap(st.s);
    this.touching = null;
    if (this.offroad) {
      this.offroad = false;
      events.push({ type: 'offroad', id: st.id, on: false });
    }
    this.drive.crashes[reason]++;
    events.push({ type: 'crash', id: st.id, reason });
  }

  /** Puts the racer back on the centre of `ribbon` at s (the race chooses where). */
  respawn(branch: number, ribbon: Ribbon, s: number, events: RaceEvent[]) {
    const st = this.state;
    st.branch = branch;
    st.s = s;
    st.x = 0;
    this.targetX = 0;
    st.yaw = 0;
    st.vx = 0;
    st.vy = 0;
    st.steer = 0;
    this.alt = ribbon.elevationAt(s);
    this.grounded = true;
    st.y = 0;
    st.airborne = false;
    st.speed = this.stats.topSpeed * RESPAWN_SPEED_FRACTION;
    st.damage = Math.min(st.damage, RESPAWN_DAMAGE);
    st.heat = 0;
    st.overheat = 0;
    st.crashed = 0;
    st.invulnerable = RESPAWN_INVULNERABLE;
    st.roll = ribbon.bankAt(s);
    this.respawnDue = false;
    events.push({ type: 'respawn', id: st.id });
  }
}

const nearBuf: Obstacle[] = [];
