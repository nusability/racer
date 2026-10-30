// Authoring helpers for track layouts (see the guide at the top of tracks/index.ts): an
// elevation profile laid over the control points, and chicanes dropped into a straight. Both
// return plain control points, so a def stays data.

import type { TrackControlPoint, TrackParam } from '../../core/types.ts';

/**
 * The points with their heights set from an elevation profile: [param, height] keys in rising
 * param order, linear between them (the spline smooths it), held flat before the first and
 * after the last. Params name control points as features do (3.5 is halfway from 3 to 4), so
 * the keys stay put when points are added.
 */
export function withProfile(points: readonly TrackControlPoint[], profile: readonly [TrackParam, number][]): TrackControlPoint[] {
  if (profile.length === 0) throw new Error('withProfile: an empty profile');
  for (let i = 1; i < profile.length; i++) {
    if (!(profile[i][0] > profile[i - 1][0])) throw new Error(`withProfile: keys must rise (${profile[i - 1][0]} then ${profile[i][0]})`);
  }
  return points.map((p, k) => {
    const next = profile.findIndex(([u]) => u > k);
    if (next === 0) return { ...p, y: profile[0][1] };
    if (next < 0) return { ...p, y: profile[profile.length - 1][1] };
    const [u0, h0] = profile[next - 1];
    const [u1, h1] = profile[next];
    return { ...p, y: h0 + ((h1 - h0) * (k - u0)) / (u1 - u0) };
  });
}

/**
 * Control points for a chicane on the straight from `from` toward `to`: starting `at` metres
 * along it, the road steps `offset` metres to one side (+ = right of travel) and back over
 * `length` metres: a bend out, one straightening, one back and one onto the line again, a
 * flick left-right-right-left (or the mirror). Splice them between `from` and `to`. The bends
 * tighten as offset grows and length shrinks: track-check reports their radius, and a pair
 * within its chicane gap and radius counts as a chicane.
 */
export function chicane(from: TrackControlPoint, to: TrackControlPoint, at: number, length: number, offset: number): TrackControlPoint[] {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (!(at > 0 && at + length < d)) throw new Error(`chicane: ${at}+${length} m does not fit the ${d.toFixed(0)} m straight`);
  const fx = dx / d;
  const fz = dz / d;
  // Right of travel, as the track builder frames it (forward × up).
  const rx = -fz;
  const rz = fx;
  const at3 = (along: number, side: number): TrackControlPoint => {
    const t = (at + along) / d;
    return {
      x: from.x + fx * (at + along) + rx * side,
      z: from.z + fz * (at + along) + rz * side,
      y: from.y + (to.y - from.y) * t,
      ...(from.width !== undefined ? { width: from.width } : {}),
    };
  };
  return [at3(0, 0), at3(length / 3, offset), at3((2 * length) / 3, offset), at3(length, 0)];
}
