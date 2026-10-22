// Where a shortcut's junctions are along its own ribbon. A branch's control list is
// [entry, entry + J, ...points, exit − J, exit] (see BranchDef), so the junctions end and
// start at control params 1 and points.length + 2.

import type { Branch } from './track.ts';

export interface JunctionBounds {
  /** Branch s where the entry junction (side by side with the main road) ends. */
  inEnd: number;
  /** Branch s where the exit junction starts. */
  outStart: number;
}

export function junctionBounds(b: Branch): JunctionBounds {
  return { inEnd: b.ribbon.paramToS(1), outStart: b.ribbon.paramToS(b.def.points.length + 2) };
}
