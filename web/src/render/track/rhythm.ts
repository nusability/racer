import { mulberry32 } from '../../core/rng.ts';

// Irregular repeats for lights racers fly past. Lights at one even pitch strobe: once a frame
// carries the camera past half a pitch, the eye matches each band to the one behind it and the
// row crawls backwards or stands still (the wagon-wheel effect). The fastest glider maxed out,
// on boost and in a draft, covers ~400 m/s, so an 18 m pitch does that below ~44 fps and
// freezes at ~22 fps. Gaps drawn from a wide band have no pitch for a frame to line up with at
// any speed or frame rate: a frame's displacement only ever matches a scattered few bands, so
// the row reads as passing, never as walking back. tools/track-check.ts measures it.

/** A repeat whose gaps are drawn uniformly from `gap` (m); `salt` keeps unrelated repeats from falling in step. */
export interface Rhythm {
  readonly gap: readonly [number, number];
  readonly salt: number;
}

const memo = new Map<string, readonly number[]>();

/** The beats along a road `length` metres long: the first one gap in, the last before the end. */
export function beats(rhythm: Rhythm, length: number): readonly number[] {
  const [lo, hi] = rhythm.gap;
  if (!(lo > 0 && hi >= lo)) throw new Error(`rhythm: gap [${lo}, ${hi}] must be positive and ordered`);
  const key = `${rhythm.salt}:${lo}:${hi}:${length}`;
  const hit = memo.get(key);
  if (hit) return hit;
  // Seeded by the repeat, so the same road always gets the same lights and a tube's ribs and
  // its ceiling light bars (drawn by separate modules) fall on the same beats.
  const rng = mulberry32(rhythm.salt);
  const out: number[] = [];
  for (let s = lo + (hi - lo) * rng(); s < length; s += lo + (hi - lo) * rng()) out.push(s);
  memo.set(key, out);
  return out;
}

/** The index of the last beat at or before s (-1 before the first). */
export function beatIndex(rhythm: Rhythm, length: number, s: number): number {
  const b = beats(rhythm, length);
  let lo = 0;
  let hi = b.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (b[mid] <= s) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** The beats in [s0, s1), with their index along the road. */
export function beatsIn(rhythm: Rhythm, length: number, s0: number, s1: number): { s: number; i: number }[] {
  const b = beats(rhythm, length);
  const out: { s: number; i: number }[] = [];
  for (let i = beatIndex(rhythm, length, s0 - 1e-9) + 1; i < b.length && b[i] < s1; i++) out.push({ s: b[i], i });
  return out;
}
