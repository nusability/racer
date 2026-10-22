import type { TrackParam } from '../../core/types.ts';
import type { LandmarkKind } from '../../render/landmarks/types.ts';

// Presentation-only dressing for a track: what stands around the course, never on it. The
// simulation never reads this, so it can change without touching race behaviour.

export type ScatterKind = 'rocks' | 'cacti' | 'bones' | 'shards';

/** What marks the hard boundary at the outside of the run-off sand. */
export type BoundaryStyle = 'dune' | 'rock' | 'fence';

export interface TrackScenery {
  /** Flat-topped mesas and buttes on the horizon. */
  mesas: number;
  /** Thin rock spires and hoodoos on the horizon. */
  spires: number;
  /** Peak height of the rolling sand away from the road, metres. */
  duneHeight: number;
  /** Roadside props scattered off the road along the lap. */
  scatter: ScatterKind;
  /** Scatter props per kilometre of lap. */
  scatterPerKm: number;
  /** Palm groves around a pool beside the road; side -1 = left, 1 = right. */
  oases: { at: TrackParam; side: -1 | 1 }[];
  boundary: BoundaryStyle;
  /** Unique set pieces beside the course. */
  landmarks: LandmarkPlacement[];
}

export interface LandmarkPlacement {
  kind: LandmarkKind;
  /** Main-loop position it stands beside. */
  at: TrackParam;
  side: -1 | 1;
  /** Gap between the hard boundary of the track and the landmark's footprint, metres. */
  distance: number;
  /** Extra rotation about Y, radians (0 = facing the track). */
  heading?: number;
  scale?: number;
}
