// One racer's physics in track space (s, x, y) on whichever ribbon it is on (main loop or a
// shortcut). The craft always flies along the track; the player sets *where across it* it
// is (a lateral target the craft chases), not its heading. The player and the AI drive the
// same model, so the AI can never be faster than physics allows.

import type { BoostCell, Obstacle, PlayerInput, RaceEvent, RacerState, RacerStats } from './types.ts';
import { gustAt } from './hazards.ts';
import { cornerPull, currentTopSpeed, roughOverspeed, roughWear, steerRate } from './handling.ts';
import { mulberry32, type Rng } from './rng.ts';
import type { Ribbon } from './track.ts';
import {
  ACCEL_TAPER_EXP,
  AIR_STEER_FACTOR,
  ARCH_HALF_DEPTH,
  BOOST_ACCEL_MULT,
  BOOST_PAD_DURATION,
  BOOST_PAD_MAX_HEIGHT,
  BOOST_PASSIVE_REFILL,
  BOOST_REFILL_DELAY,
  BOOST_RESUME_FILL,
  BOOST_START_FILL,
  BOUNDARY_DAMAGE_FREE_SPEED,
  BOUNDARY_DAMAGE_PER_SPEED,
  BOUNDARY_GRIND_SPEED,
  BOUNDARY_IMPACT_SPEED,
  BOUNDARY_GRIND_DAMAGE,
  BOUNDARY_RESTITUTION,
  BOUNDARY_SPEED_LOSS,
  BRAKE_DECEL,
  CEILING_BOUNCE,
  CEILING_DAMAGE,
  CEILING_SPEED_LOSS,
  CELL_MAX_HEIGHT,
  CELL_RADIUS,
  CELL_VALUE,
  DROP_OVERREACH,
  FRENET_MIN_DENOM,
  GRAVITY,
  GUST_DRIFT,
  HANDLING_REF,
  HOVER_SUCTION,
  IMPACT_INTENSITY_SPEED,
  LANDING_STEP_TOLERANCE,
  LAND_DAMAGE,
  LAND_SOFT_IMPACT,
  LAND_SPEED_LOSS,
  LATERAL_RESPONSE,
  LATERAL_SPEED_MAX,
  LOOP_MIN_SPEED,
  MAX_LEAN,
  MAX_VISUAL_YAW,
  OBSTACLE_DAMAGE,
  OBSTACLE_DEFLECT_SPEED,
  OBSTACLE_QUERY_RANGE,
  OBSTACLE_SPEED_LOSS,
  OBSTACLE_WRECK_OFFSET,
  OBSTACLE_WRECK_SPEED_FRACTION,
  OVERSPEED_DECAY,
  RACER_HALF_WIDTH,
  RACER_HEIGHT,
  RACER_RADIUS,
  REPAIR_VALUE,
  ROLL_PER_LATERAL_SPEED,
  ROUGH_JOLT_FULL,
  ROUGH_JOLT_RATE,
  ROUGH_JOLT_SPEED,
  SAND_DRAG,
  SAND_TOP_SPEED,
  SCRAPE_BASE_INTENSITY,
  SIM_DT,
  SLICK_DAMPING_FLOOR,
  SLOPE_SPEED_FACTOR,
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
  /** Top-speed bonus (fraction) the race sets from the slipstream (src/core/slipstream.ts). */
  slip = 0;
  /** The tank ran dry and has not yet refilled to the resume level. */
  private dry = false;
  /** Seconds since the tank was last spent from: the trickle refill waits a moment. */
  private sinceSpend = Infinity;
  /** Seconds the engines stay flooded after a false start: no thrust, no boost. */
  private stalled = 0;
  /** The wall the racer was against last step (-1 left, 1 right, 0 none): pressing is not a new hit. */
  private wallSide: -1 | 0 | 1 = 0;
  /** Per ribbon (branch index, -1 = main): the boost and repair cells taken this lap. */
  private readonly collected = new Map<number, Uint8Array>();
  private readonly repaired = new Map<number, Uint8Array>();
  /**
   * The obstacle currently being touched, so one contact is judged and reported once: the
   * obstacle itself, or for a scheduled hazard (rebuilt every step) its id and place.
   */
  private touching: unknown = null;
  /** The racer's own seeded stream for what the ground does to it (rough-ground jolts). */
  private readonly rng: Rng;

  constructor(id: string, stats: RacerStats, ribbon: Ribbon, s: number, x: number, distance: number, seed: number) {
    this.stats = stats;
    this.rng = mulberry32(seed);
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
      draft: 0,
    };
    this.drive = { crashes: { destroyed: 0, fell: 0, offEdge: 0, loopStall: 0, obstacle: 0, hazard: 0 }, scrapeTime: 0, offroadTime: 0 };
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
    const reachL = ribbon.dropAt(sOld, -1) ? -DROP_OVERREACH : RACER_HALF_WIDTH - TARGET_OVERREACH;
    const reachR = ribbon.dropAt(sOld, 1) ? -DROP_OVERREACH : RACER_HALF_WIDTH - TARGET_OVERREACH;
    this.targetX = clamp(this.targetX, ribbon.minXAt(sOld) + reachL, ribbon.maxXAt(sOld) - reachR);

    // x chases the target with a cap on sideways speed: critically damped on a normal
    // surface, looser and overshooting on a slick one.
    const k = this.stats.handling / HANDLING_REF;
    const w = LATERAL_RESPONSE * k * air * Math.sqrt(surfaceGrip);
    const zeta = surfaceGrip < 1 ? Math.max(SLICK_DAMPING_FLOOR, surfaceGrip) : 1;
    const maxLat = LATERAL_SPEED_MAX * k;
    st.vx = clamp(st.vx + (w * w * (this.targetX - st.x) - 2 * zeta * w * st.vx) * dt, -maxLat, maxLat);

    // Sideways motion borrows from forward motion (weaving is not free), but never all of it.
    st.yaw = clamp(Math.atan2(st.vx, Math.max(st.speed, 1)), -MAX_VISUAL_YAW, MAX_VISUAL_YAW);
    const forward = st.speed * Math.cos(st.yaw);
    const sdot = forward / Math.max(FRENET_MIN_DENOM, 1 - curvature * st.x);
    st.s = ribbon.wrap(sOld + sdot * dt);
    st.x += st.vx * dt;

    if (this.boundaries(ribbon, events)) return;
    this.vertical(ribbon, sOld, sdot, events);
    if (st.crashed > 0) return;
    if (this.obstacles(ribbon, hazards, events)) return;
    this.boostPads(ribbon, sOld, events);
    this.cells(ribbon, sOld, events);
    this.sand(ribbon, events);
    this.roughGround(ribbon, events);
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
    const spend = wantBoost && this.freeBoost <= 0 && !this.dry && this.stalled <= 0;
    this.sinceSpend = spend ? 0 : this.sinceSpend + dt;
    if (this.sinceSpend >= BOOST_REFILL_DELAY) st.boost = Math.min(1, st.boost + BOOST_PASSIVE_REFILL * dt);
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
    let top = currentTopSpeed(this.stats, st, st.boosting) * this.pace * (1 + this.slip);
    if (this.offroad) top *= SAND_TOP_SPEED;
    let dv: number;
    if (brake) dv = -BRAKE_DECEL;
    else if (this.stalled > 0) {
      this.stalled -= SIM_DT;
      dv = 0;
    } else if (st.speed < top) {
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
    if (st.x >= lo && st.x <= hi) {
      this.wallSide = 0;
      return false;
    }
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
    // Arriving hard is an impact: speed, hull and a bounce. Held against the wall (already on
    // it, or touching too gently to count) it only grinds, a drag the engine balances at
    // BOUNDARY_GRIND_SPEED of top speed, so pushing into a wall slides, it never pins.
    const impact = this.wallSide !== side && vn > BOUNDARY_IMPACT_SPEED;
    this.wallSide = side;
    if (impact) {
      st.speed = Math.max(0, st.speed - vn * BOUNDARY_SPEED_LOSS);
      this.damage(Math.max(0, vn - BOUNDARY_DAMAGE_FREE_SPEED) * BOUNDARY_DAMAGE_PER_SPEED);
      st.vx = -side * vn * BOUNDARY_RESTITUTION;
    } else if (vn > 0) st.vx = 0;
    const top = currentTopSpeed(this.stats, st, st.boosting) * this.pace * (1 + this.slip);
    const thrust = this.stats.accel * (st.boosting ? BOOST_ACCEL_MULT : 1);
    if (st.speed > top * BOUNDARY_GRIND_SPEED) {
      const grind = thrust * (1 - BOUNDARY_GRIND_SPEED ** ACCEL_TAPER_EXP);
      st.speed = Math.max(top * BOUNDARY_GRIND_SPEED, st.speed - grind * SIM_DT);
    }
    this.damage(BOUNDARY_GRIND_DAMAGE * SIM_DT);
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

  /**
   * Rough ground batters a racer skimming it faster than the safe speed: hull by the second,
   * steeply more the faster it goes, and jolts that kick it sideways. In the air it is spared.
   */
  private roughGround(ribbon: Ribbon, events: RaceEvent[]) {
    const st = this.state;
    const rough = ribbon.roughAt(st.s);
    if (rough <= 0 || !this.grounded) return;
    events.push({ type: 'rough', id: st.id, intensity: Math.min(1, (rough * st.speed) / this.stats.topSpeed) });
    const over = roughOverspeed(this.stats, st.speed);
    if (over <= 0) return;
    this.damage(roughWear(this.stats, st.speed, rough) * SIM_DT);
    if (this.rng() >= ROUGH_JOLT_RATE * rough * over * SIM_DT) return;
    const intensity = Math.min(1, (rough * over) / ROUGH_JOLT_FULL);
    // Either way with even odds: a kick the pilot can't anticipate.
    st.vx += (this.rng() < 0.5 ? -1 : 1) * ROUGH_JOLT_SPEED * intensity;
    events.push({ type: 'jolt', id: st.id, intensity });
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
          this.crash('fell', events);
          return;
        }
      } else if (this.alt <= surface) {
        if (wasOverGap && this.alt < surface - LANDING_STEP_TOLERANCE) {
          this.crash('fell', events);
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
        events.push({ type: 'hit', id: st.id, kind: o.kind, intensity: 1, hazard: o.hazardId });
        this.crash(o.kind === 'hazard' ? 'hazard' : 'obstacle', events);
        return true;
      }
      const centrality = 1 - offset;
      st.speed *= 1 - OBSTACLE_SPEED_LOSS * centrality;
      this.damage(OBSTACLE_DAMAGE * centrality * pace);
      events.push({ type: 'hit', id: st.id, kind: o.kind, intensity: centrality * pace, hazard: o.hazardId });
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

  /** Boost cells refill the tank, repair cells the hull: each once per racer per lap. */
  private cells(ribbon: Ribbon, sOld: number, events: RaceEvent[]) {
    const st = this.state;
    if (this.alt - ribbon.elevationAt(st.s) > CELL_MAX_HEIGHT) return;
    this.collect(ribbon, ribbon.cells, this.collected, sOld, events, 'boost');
    this.collect(ribbon, ribbon.repairCells, this.repaired, sOld, events, 'repair');
  }

  private collect(ribbon: Ribbon, cells: readonly BoostCell[], taken: Map<number, Uint8Array>, sOld: number, events: RaceEvent[], item: 'boost' | 'repair') {
    if (cells.length === 0) return;
    const st = this.state;
    for (const c of cells) {
      const crossed = ribbon.delta(sOld, c.s) > 0 && ribbon.delta(st.s, c.s) <= 0;
      if (!crossed || Math.abs(st.x - c.x) >= CELL_RADIUS + RACER_RADIUS) continue;
      let flags = taken.get(st.branch);
      if (flags === undefined) {
        flags = new Uint8Array(cells.length);
        taken.set(st.branch, flags);
      }
      if (flags[c.index]) continue;
      flags[c.index] = 1;
      if (item === 'boost') st.boost = Math.min(1, st.boost + CELL_VALUE);
      else st.damage = Math.max(0, st.damage - REPAIR_VALUE);
      events.push({ type: 'pickup', id: st.id, branch: st.branch, cell: c.index, item });
    }
  }

  /** Whether this racer has taken that boost (or repair) cell this lap (they reappear each lap). */
  hasCollected(branch: number, cell: number, item: 'boost' | 'repair' = 'boost'): boolean {
    return (item === 'boost' ? this.collected : this.repaired).get(branch)?.[cell] === 1;
  }

  /** A new lap: every cell is there to take again. */
  newLap() {
    this.collected.clear();
    this.repaired.clear();
  }

  /** Starts a free boost burst (launch boost at GO). */
  /** A false start: the engines give nothing for `seconds`, and any launch boost is lost. */
  stall(seconds: number) {
    this.stalled = seconds;
    this.freeBoost = 0;
  }

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

  /** Hull damage from outside (a racer contact): armour divides it; a spent hull wrecks. */
  harm(amount: number, events: RaceEvent[]) {
    if (this.state.crashed > 0) return;
    this.damage(amount);
    if (this.state.damage >= 1) this.crash('destroyed', events);
  }

  /** A wreck is final: the racer stops where it is and is out of the race. */
  private crash(reason: CrashReason, events: RaceEvent[]) {
    const st = this.state;
    st.crashed = SIM_DT;
    st.speed = 0;
    st.vx = 0;
    st.boosting = false;
    this.freeBoost = 0;
    this.touching = null;
    this.wallSide = 0;
    if (this.offroad) {
      this.offroad = false;
      events.push({ type: 'offroad', id: st.id, on: false });
    }
    this.drive.crashes[reason]++;
    events.push({ type: 'crash', id: st.id, reason });
  }
}

const nearBuf: Obstacle[] = [];
