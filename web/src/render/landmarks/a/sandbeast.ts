// Sandbeast: a colossal armoured burrower. Placed on a course it IS a blocker: it erupts from
// the desert beside the road in a towering arch, slams head-first into the road and burrows
// into it, leaving a crater and a ridge of broken road that settle before it comes again (see
// sandbeastBound.ts). Unbound (the landmark viewer), it plays the same cycle against a stretch
// of virtual road in front of it.

import type { HazardBinding, Landmark, LandmarkOptions } from '../types.ts';
import { boundHazard, type HazardOf } from './bound.ts';
import { createBoundBeast } from './sandbeastBound.ts';

/** The virtual road: its centre this far in front of the origin, its drivable half-width. */
const FREE_ROAD = 70;
const FREE_HALF = 28;
/** A blocker shaped like the desert tracks': open against the near edge, closed beyond. */
const FREE_DEF = { type: 'blocker', id: 'free', at: 0, opening: 30, offset: -13, height: 12, warn: 3, up: 4, period: 15, phase: 0 } as const;

export function createSandbeast(opts: LandmarkOptions): Landmark {
  const bound = boundHazard(opts, 'sandbeast', ['blocker'] as const);
  if (bound) return createBoundBeast(opts, bound.binding, bound.hazard);
  const hazard: HazardOf<'blocker'> = { def: FREE_DEF, s0: 0, s1: 0, seed: opts.seed, minX: -FREE_HALF, maxX: FREE_HALF };
  // The road runs along local X; its −x edge is the one nearer the origin (local −Z faces it).
  const binding: HazardBinding = { hazard, toLocal: (s, x, y, out) => out.set(s, y, -FREE_ROAD - x) };
  return createBoundBeast(opts, binding, hazard);
}
