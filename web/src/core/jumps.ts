// Jump geometry questions about a ribbon: how fast you must be to clear one, and whether a
// point lies in one's ramp or chasm (respawns must not land there).

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

/** The jump whose ramp or chasm contains s (with `before` metres of run-up), or null. */
export function jumpAround(ribbon: Ribbon, s: number, before: number): Jump | null {
  for (const j of ribbon.jumps) {
    const from = j.rampStart - before;
    const d = ribbon.closed ? ribbon.wrap(s - from) : s - from;
    if (d >= 0 && d <= ribbon.delta(from, j.gapEnd)) return j;
  }
  return null;
}
