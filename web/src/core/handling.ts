// The handling formulas the physics and the AI share: how a glider's stats turn into steer
// rate, corner drift and top speed.

import type { PhysicsTuning, RacerState, RacerStats } from './types.ts';
import type { Ribbon } from './track.ts';
import {
  CORNER_PULL,
  CORNER_PULL_BRAKE,
  DAMAGE_TOP_SPEED_LOSS,
  AI_CREST_LOOKBACK,
  AIR_RESPONSE_FACTOR,
  AIR_STEER_FACTOR,
  CREST_GRIP_MIN,
  CREST_LIGHTNESS,
  WALL_CORNER_FRICTION,
  DIP_GRIP_MAX,
  GRAVITY,
  GRIP_REF,
  HANDLING_REF,
  HOVER_SUCTION,
  IMPACT_DAMAGE_EXP,
  ROUGH_DAMAGE,
  ROUGH_DAMAGE_EXP,
  ROUGH_SAFE_SPEED,
  STEER_TARGET_RATE,
} from '../data/tuning.ts';

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

/**
 * Hull (before armour) a hit closing at `speed` m/s costs: nothing up to `free`, then rising to
 * the power IMPACT_DAMAGE_EXP to `atRef` at `ref` m/s. Walls and rivals each pass their own.
 */
export function impactWear(speed: number, free: number, ref: number, atRef: number): number {
  return atRef * (Math.max(0, speed - free) / (ref - free)) ** IMPACT_DAMAGE_EXP;
}

/** The game as tuned: every multiplier of the owner's live tuning at 1. */
export const PHYSICS_AS_TUNED: PhysicsTuning = { cornerGrip: 1, crestLightness: 1, suction: 1, wallScrape: 1, airSteer: 1 };

/** A race's physics, resolved from the owner's multipliers (PhysicsTuning) and data/tuning.ts. */
export interface Physics {
  readonly tuning: PhysicsTuning;
  /** Multiplies every racer's grip stat. */
  readonly gripScale: number;
  /** Share of the road's vertical acceleration (against liftOff) a crest takes off the load. */
  readonly crestLightness: number;
  /** The road's downward acceleration under the craft at which it leaves the road, m/s²: gravity plus suction. */
  readonly liftOff: number;
  /** See WALL_CORNER_FRICTION. */
  readonly wallFriction: number;
  /** Share of the steer rate and of a drag that moves the lateral target in the air (see AIR_STEER_FACTOR). */
  readonly airSteer: number;
  /** Share of the lateral chase's response kept in the air (see AIR_RESPONSE_FACTOR). */
  readonly airResponse: number;
}

export function resolvePhysics(t: PhysicsTuning): Physics {
  for (const [k, v] of Object.entries(t)) {
    if (!(v > 0 && Number.isFinite(v))) throw new Error(`Physics tuning ${k} = ${v}: a multiplier must be positive`);
  }
  return {
    tuning: { ...t },
    gripScale: t.cornerGrip,
    crestLightness: CREST_LIGHTNESS * t.crestLightness,
    liftOff: GRAVITY + HOVER_SUCTION * t.suction,
    wallFriction: WALL_CORNER_FRICTION * t.wallScrape,
    // One knob for both: the owner tunes how much air control there is, and a faster target the
    // craft chases no faster (or the reverse) would only change how it feels to get there.
    airSteer: AIR_STEER_FACTOR * t.airSteer,
    airResponse: AIR_RESPONSE_FACTOR * t.airSteer,
  };
}

/**
 * How hard the road presses a craft on at `speed` where it curves vertically by `vcurve` (1/m,
 * negative over a crest), as a share of level road, before clamping. It goes light by
 * crestLightness of the road's vertical acceleration against liftOff, so a crest short of a
 * lift-off still leaves it some grip (see liftsOff).
 */
export function roadLoadRaw(speed: number, vcurve: number, ph: Physics): number {
  return 1 + (ph.crestLightness * speed * speed * vcurve) / ph.liftOff;
}

/** The share of its grip a grounded craft has there (see CREST_GRIP_MIN, DIP_GRIP_MAX). */
export function roadLoad(speed: number, vcurve: number, ph: Physics): number {
  return Math.min(DIP_GRIP_MAX, Math.max(CREST_GRIP_MIN, roadLoadRaw(speed, vcurve, ph)));
}

/** The road falls away under a craft at `speed` faster than gravity and suction can follow: it flies. */
export function liftsOff(speed: number, vcurve: number, ph: Physics): boolean {
  return speed * speed * vcurve <= -ph.liftOff;
}

/** Upper end of the cornering-limit search, m/s: past anything a glider reaches. */
const CORNER_LIMIT_SEARCH = 1000;
const CORNER_LIMIT_ITERATIONS = 40;

/**
 * Fastest speed at which a corner of curvature `curv` (1/m, unsigned) can be held: its drift no
 * more than `budget` (m/s of steer, as speed²·curvature per unit of grip) times the grip the road
 * load leaves at that speed over vertical curvature `vcurve`. Infinity on the straight.
 */
export function cornerLimit(curv: number, budget: number, vcurve: number, ph: Physics): number {
  if (curv <= 0) return Infinity;
  const holds = (v: number) => v * v * curv <= budget * roadLoad(v, vcurve, ph);
  if (holds(CORNER_LIMIT_SEARCH)) return Infinity;
  let lo = 0;
  let hi = CORNER_LIMIT_SEARCH;
  for (let i = 0; i < CORNER_LIMIT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (holds(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The vertical curvature that sets sample k's grip for a driver planning ahead: the sharpest
 * crest within AI_CREST_LOOKBACK before it (going light just before a corner costs the corner),
 * else its own (a dip under a corner helps).
 */
export function crestGripAt(r: Ribbon, k: number): number {
  const n = r.samples.length;
  let worst = r.samples[k].vcurve;
  for (let d = 1; d * r.step <= AI_CREST_LOOKBACK; d++) {
    const j = r.closed ? (k - d + n) % n : k - d;
    if (j < 0) break;
    worst = Math.min(worst, r.samples[j].vcurve);
  }
  return worst;
}

/** Top speed right now, given damage and whether boost is active. */
export function currentTopSpeed(stats: RacerStats, state: RacerState, boosting: boolean): number {
  let top = stats.topSpeed * (1 - DAMAGE_TOP_SPEED_LOSS * state.damage);
  if (boosting) top *= 1 + stats.boostPower;
  return top;
}

/**
 * How far over the safe speed for rough ground a racer is, normalised so the glider's own top
 * speed is 1 (boosting goes past it); 0 at or under the safe speed.
 */
export function roughOverspeed(stats: RacerStats, speed: number): number {
  return Math.max(0, (speed / stats.topSpeed - ROUGH_SAFE_SPEED) / (1 - ROUGH_SAFE_SPEED));
}

/** Hull per second (before armour) that rough ground of this amount costs at this speed. */
export function roughWear(stats: RacerStats, speed: number, rough: number): number {
  return ROUGH_DAMAGE * rough * roughOverspeed(stats, speed) ** ROUGH_DAMAGE_EXP;
}
