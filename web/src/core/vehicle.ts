// One racer's physics in track space (s, x, y) on whichever ribbon it is on (main loop or a
// shortcut). The craft always flies along the track; the player sets *where across it* it
// is (a lateral target the craft chases), not its heading. The player and the AI drive the
// same model, so the AI can never be faster than physics allows.

import type { Obstacle, PlayerInput, RaceEvent, RacerState, RacerStats } from './types.ts';
import type { Ribbon } from './track.ts';
import {
  ACCEL_TAPER_EXP,
  AIR_STEER_FACTOR,
  ARCH_HALF_DEPTH,
  BOOST_ACCEL_MULT,
  BOOST_PASSIVE_REFILL,
  BOOST_RESUME_FILL,
  BOOST_START_FILL,
  CELL_MAX_HEIGHT,
  CELL_RADIUS,
  CELL_VALUE,
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
 * inside; grip (the glider's and the surface's) and the air brake reduce it.
 */
export function cornerPull(stats: RacerStats, curvature: number, speed: number, brake: boolean, surfaceGrip: number): number {
  const pull = -curvature * speed * speed * CORNER_PULL * (GRIP_REF / (stats.grip * surfaceGrip));
  return brake ? pull * CORNER_PULL_BRAKE : pull;
}

/** Top speed right now, given damage and whether boost is active. */
export function currentTopSpeed(stats: RacerStats, state: RacerState, boosting: boolean): number {
  let top = stats.topSpeed * (1 - DAMAGE_TOP_SPEED_LOSS * state.damage);
  if (boosting) top *= 1 + stats.boostPower;
  return top;
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
  /** Race time the current lap started. */
  lapStart: number;
  /** Top-speed factor the race sets for catch-up (1 = the stats as they are). */
  pace = 1;
  /** The tank ran dry and has not yet refilled to the resume level. */
  private dry = false;
  /** Per ribbon (branch index, -1 = main): the boost and repair cells taken this lap. */
  private readonly collected = new Map<number, Uint8Array>();
  private readonly repaired = new Map<number, Uint8Array>();
  /**
   * The obstacle currently being touched, so one contact is judged and reported once: the
   * obstacle itself, or for a scheduled hazard (rebuilt every step) its id and place.
   */
  private touching: unknown = null;

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
      boost: BOOST_START_FILL,
      damage: 0,
      boosting: false,
      airborne: false,
      crashed: 0,
      lap: 0,
      finishTime: null,
      place: 0,
      bestLap: null,
      steer: 0,
    };
    this.drive = { crashes: { destroyed: 0, fell: 0, obstacle: 0 }, scrapeTime: 0, offroadTime: 0 };
    this.targetX = x;
    this.alt = ribbon.elevationAt(s);
    this.grounded = true;
    this.offroad = false;
    this.freeBoost = 0;
    this.lapStart = 0;
  }

  /**
   * Advances one SIM_DT on `ribbon` (the one state.branch names). `hazards` are the obstacles
   * that ribbon's scheduled hazards present right now; `time` is the race clock (for gusts).
   */
  step(input: PlayerInput, ribbon: Ribbon, hazards: readonly Obstacle[], time: number, events: RaceEvent[]): void {
    const st = this.state;
    const dt = SIM_DT;
    if (st.crashed > 0) {
      st.crashed += dt;
      return;
    }
    st.steer = clamp(input.steer, -1, 1);
    const brake = input.brake;
    const airborne = !this.grounded;

    this.updateBoost(input.boost, events);
    this.updateSpeed(ribbon, brake);

    // Lateral target: steer moves it, a drag nudges it, corners and gusts drift it.
    const sOld = st.s;
    const curvature = ribbon.curvatureAt(sOld);
    const surfaceGrip = ribbon.gripAt(sOld);
    const air = airborne ? AIR_STEER_FACTOR : 1;
    const drift = cornerPull(this.stats, curvature, st.speed, brake, surfaceGrip) + gustAt(ribbon.hazards, sOld, time) * GUST_DRIFT;
    this.targetX += (st.steer * steerRate(this.stats) * air + drift) * dt + input.nudge;
    // Past a wall the target overreaches a little (pushing grinds); past an open edge, far
    // enough that holding the steer drives you off it.
    const reachL = ribbon.dropAt(sOld, -1) ? DROP_OVERREACH + RACER_HALF_WIDTH : RACER_HALF_WIDTH - TARGET_OVERREACH;
    const reachR = ribbon.dropAt(sOld, 1) ? DROP_OVERREACH + RACER_HALF_WIDTH : RACER_HALF_WIDTH - TARGET_OVERREACH;
    this.targetX = clamp(this.targetX, ribbon.minXAt(sOld) + reachL, ribbon.maxXAt(sOld) - reachR);

    // x chases the target with a cap on sideways speed: critically damped on a normal
    // surface, looser and overshooting on a slick one.
    const k = this.stats.handling / HANDLING_REF;
    const w = LATERAL_RESPONSE * k * air * Math.sqrt(surfaceGrip);
    const zeta = surfaceGrip < 1 ? Math.max(SLICK_DAMPING_FLOOR, surfaceGrip) : 1;
    const maxLat = LATERAL_SPEED_MAX * k;
    st.vx = clamp(st.vx + (w * w * (this.targetX - st.x) - 2 * zeta * w * st.vx) * dt, -maxLat, maxLat);

    // Sideways motion borrows from forward motion (weaving is not free), but never all of it.
    // Inside a loop the road is longer than its s span, so s advances by speed / stretch.
    st.yaw = clamp(Math.atan2(st.vx, Math.max(st.speed, 1)), -MAX_VISUAL_YAW, MAX_VISUAL_YAW);
    const forward = st.speed * Math.cos(st.yaw);
    const sdot = forward / Math.max(FRENET_MIN_DENOM, 1 - curvature * st.x) / ribbon.stretchAt(sOld);
    st.s = ribbon.wrap(sOld + sdot * dt);
    st.x += st.vx * dt;

    if (this.boundaries(ribbon, events)) return;
    this.vertical(ribbon, sOld, sdot, events);
    if (st.crashed > 0) return;
    if (this.obstacles(ribbon, hazards, events)) return;
    this.boostPads(ribbon, sOld, events);
    this.cells(ribbon, sOld, events);
    this.sand(ribbon, events);
    if (st.damage >= 1) {
      this.crash('destroyed', events);
      return;
    }

    st.y = this.alt - ribbon.elevationAt(st.s);
    st.airborne = !this.grounded;
    st.roll = ribbon.bankAt(st.s) + clamp(st.vx * ROLL_PER_LATERAL_SPEED, -MAX_LEAN, MAX_LEAN);
  }

  /** Holding boost spends the tank, no strings attached; a pad or launch burst is free. */
  private updateBoost(wantBoost: boolean, events: RaceEvent[]) {
    const st = this.state;
    const dt = SIM_DT;
    this.freeBoost = Math.max(0, this.freeBoost - dt);
    if (this.dry && st.boost >= BOOST_RESUME_FILL) this.dry = false;
    const spend = wantBoost && this.freeBoost <= 0 && !this.dry;
    st.boost = Math.min(1, st.boost + BOOST_PASSIVE_REFILL * dt);
    if (spend) {
      st.boost = Math.max(0, st.boost - dt / this.stats.boostTank);
      if (st.boost === 0) {
        this.dry = true;
        events.push({ type: 'tankEmpty', id: st.id });
      }
    }
    st.boosting = spend || this.freeBoost > 0;
  }

  /** Auto-throttle toward the current top speed; sand caps it lower and drags. */
  private updateSpeed(ribbon: Ribbon, brake: boolean) {
    const st = this.state;
    let top = currentTopSpeed(this.stats, st, st.boosting) * this.pace;
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

  /**
   * Walls scrape speed and wear the hull (more at a hard angle); an open edge is a fall.
   * Returns true when the racer went over an edge (a wreck).
   */
  private boundaries(ribbon: Ribbon, events: RaceEvent[]): boolean {
    const st = this.state;
    const minX = ribbon.minXAt(st.s);
    const maxX = ribbon.maxXAt(st.s);
    const lo = minX + RACER_HALF_WIDTH;
    const hi = maxX - RACER_HALF_WIDTH;
    if (st.x >= lo && st.x <= hi) return false;
    const side: -1 | 1 = st.x > hi ? 1 : -1;
    if (ribbon.dropAt(st.s, side)) {
      // Over an open edge there is nothing to push back: once the centre is past it, it falls.
      if (st.x > maxX || st.x < minX) {
        this.crash('offEdge', events);
        return true;
      }
      return false;
    }
    st.x = side === 1 ? hi : lo;
    const vn = Math.max(0, side * st.vx);
    st.speed = Math.max(0, st.speed - vn * BOUNDARY_SPEED_LOSS - BOUNDARY_FRICTION_DECEL * SIM_DT);
    this.damage(Math.max(0, vn - BOUNDARY_DAMAGE_FREE_SPEED) * BOUNDARY_DAMAGE_PER_SPEED + BOUNDARY_GRIND_DAMAGE * SIM_DT);
    if (vn > 0) st.vx = -side * vn * BOUNDARY_RESTITUTION;
    this.drive.scrapeTime += SIM_DT;
    const intensity = clamp(SCRAPE_BASE_INTENSITY + vn / IMPACT_INTENSITY_SPEED, 0, 1);
    events.push({ type: 'scrape', id: st.id, side, intensity });
    return false;
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
    if (ribbon.isMagnet(s)) {
      // Loops and corkscrews hold the racer to the road: no air, no ballistic flight.
      st.vy = (surface - ribbon.elevationAt(sOld)) / dt;
      this.alt = surface;
      this.grounded = true;
      // Upside down (the road's up points down) and too slow to stay pressed on: it falls.
      if (ribbon.sampleAt(s).up.y < 0 && st.speed < LOOP_MIN_SPEED) this.crash('loopStall', events);
      return;
    }
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

  /** Static obstacles and the hazards' current ones. Returns true on a wreck. */
  private obstacles(ribbon: Ribbon, hazards: readonly Obstacle[], events: RaceEvent[]): boolean {
    const st = this.state;
    const height = this.alt - ribbon.elevationAt(st.s);
    let touched: unknown = null;
    const check = (o: Obstacle): boolean => {
      if (height >= o.height) return false;
      const ds = ribbon.delta(o.s, st.s);
      const reach = o.radius + RACER_RADIUS;
      if (Math.abs(ds) >= reach || Math.hypot(ds, st.x - o.x) >= reach) return false;
      const key = o.kind === 'hazard' ? `${o.hazardId}@${Math.round(o.s)}` : o;
      const wrecked = this.hitObstacle(o, key, ds, reach, ribbon, events);
      touched = key;
      return wrecked;
    };
    for (const o of ribbon.obstaclesNear(st.s, OBSTACLE_QUERY_RANGE, OBSTACLE_QUERY_RANGE, nearBuf)) if (check(o)) return true;
    for (const o of hazards) if (check(o)) return true;
    this.touching = touched;
    return false;
  }

  /**
   * A dead-centre hit at speed is a wreck. Anything else costs hull and speed by how central
   * and how fast it was, and slides the racer round the obstacle's side. Returns true on a wreck.
   */
  private hitObstacle(o: Obstacle, key: unknown, ds: number, reach: number, ribbon: Ribbon, events: RaceEvent[]): boolean {
    const st = this.state;
    const offset = Math.abs(st.x - o.x) / reach;
    // Pass on the side the racer is already on (or failing that heading for), unless a
    // boundary leaves no room there.
    const across = Math.sqrt(Math.max(0, reach * reach - ds * ds));
    let side = st.x !== o.x ? Math.sign(st.x - o.x) : this.targetX >= o.x ? 1 : -1;
    const lo = ribbon.minXAt(st.s) + RACER_HALF_WIDTH;
    const hi = ribbon.maxXAt(st.s) - RACER_HALF_WIDTH;
    if (o.x + side * across > hi || o.x + side * across < lo) side = -side;
    if (this.touching !== key) {
      const pace = Math.min(1, st.speed / this.stats.topSpeed);
      if (offset < OBSTACLE_WRECK_OFFSET && pace > OBSTACLE_WRECK_SPEED_FRACTION) {
        events.push({ type: 'hit', id: st.id, kind: o.kind, intensity: 1 });
        this.crash(o.kind === 'hazard' ? 'hazard' : 'obstacle', events);
        return true;
      }
      const centrality = 1 - offset;
      st.speed *= 1 - OBSTACLE_SPEED_LOSS * centrality;
      this.damage(OBSTACLE_DAMAGE * centrality * pace);
      events.push({ type: 'hit', id: st.id, kind: o.kind, intensity: centrality * pace });
      if (st.damage >= 1) {
        this.crash('destroyed', events);
        return true;
      }
    }
    st.x = clamp(o.x + side * across, lo, hi);
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

  private cells(ribbon: Ribbon, sOld: number, events: RaceEvent[]) {
    const st = this.state;
    if (ribbon.cells.length === 0 || this.alt - ribbon.elevationAt(st.s) > CELL_MAX_HEIGHT) return;
    let taken = this.collected.get(st.branch);
    for (const c of ribbon.cells) {
      const crossed = ribbon.delta(sOld, c.s) > 0 && ribbon.delta(st.s, c.s) <= 0;
      if (!crossed || Math.abs(st.x - c.x) >= CELL_RADIUS + RACER_RADIUS) continue;
      if (taken === undefined) {
        taken = new Uint8Array(ribbon.cells.length);
        this.collected.set(st.branch, taken);
      }
      if (taken[c.index]) continue;
      taken[c.index] = 1;
      st.boost = Math.min(1, st.boost + CELL_VALUE);
      events.push({ type: 'pickup', id: st.id, branch: st.branch, cell: c.index });
    }
  }

  /** Whether this racer has taken that cell this lap (cells reappear for it each lap). */
  hasCollected(branch: number, cell: number): boolean {
    return this.collected.get(branch)?.[cell] === 1;
  }

  /** A new lap: every cell is there to take again. */
  newLap() {
    this.collected.clear();
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
    st.crashed = 0;
    st.invulnerable = RESPAWN_INVULNERABLE;
    st.roll = ribbon.bankAt(s);
    this.respawnDue = false;
    events.push({ type: 'respawn', id: st.id });
  }
}

const nearBuf: Obstacle[] = [];
