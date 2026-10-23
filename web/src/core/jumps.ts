// Jump geometry: how fast you must be to clear one.

import type { Jump } from './types.ts';
import type { Ribbon } from './track.ts';
import { GRAVITY, LANDING_STEP_TOLERANCE } from '../data/tuning.ts';

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
