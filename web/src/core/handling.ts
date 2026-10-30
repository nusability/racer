// The handling formulas the physics and the AI share: how a glider's stats turn into steer
// rate, corner drift and top speed.

import type { RacerState, RacerStats } from './types.ts';
import {
  CORNER_PULL,
  CORNER_PULL_BRAKE,
  DAMAGE_TOP_SPEED_LOSS,
  GRIP_REF,
  HANDLING_REF,
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
