import type { TrackParam } from '../../core/types.ts';
import type { LandmarkKind } from '../../render/landmarks/types.ts';

// Presentation-only dressing for a track: what stands around the course, never on it. The
// simulation never reads this, so it can change without touching race behaviour.

export type ScatterKind = 'rocks' | 'cacti' | 'bones' | 'shards';

/** What marks the hard boundary at the outside of the run-off (water run-off gets buoys). */
export type BoundaryStyle = 'dune' | 'rock' | 'fence';

interface SceneryBase {
  boundary: BoundaryStyle;
  /** Unique set pieces beside the course. */
  landmarks: LandmarkPlacement[];
}

/** The desert: dunes, mesas and spires. */
export interface DesertScenery extends SceneryBase {
  biome: 'desert';
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
}

/** The coast: sea all round, beaches, islands, sea stacks, lagoons you skim across. */
export interface BeachScenery extends SceneryBase {
  biome: 'beach';
  /** Main-loop spans where the run-off is shallow lagoon water instead of sand. */
  lagoons: { from: TrackParam; to: TrackParam }[];
  /** Share of the open map that is land rather than sea, 0..1. */
  land: number;
  /** Height of the dunes and islands away from the course, metres above the sea. */
  landHeight: number;
  /** Distant islands and headlands on the horizon. */
  islands: number;
  /** Sea stacks standing in the water near the course. */
  stacks: number;
  /** Beach dressing per kilometre of lap: palms, huts, towers and flags. */
  palmsPerKm: number;
  hutsPerKm: number;
  /** What the road is made of. */
  road: 'causeway' | 'boardwalk';
}

export type TrackScenery = DesertScenery | BeachScenery;

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
  /** Stand beside this shortcut instead of the main loop; `at` is then in its parameter space. */
  branch?: string;
  /**
   * Let the footprint reach over the hard boundary (distance may be negative). Only for layouts
   * with a clear lane where the course runs, e.g. a market street a shortcut runs down.
   */
  straddle?: boolean;
  /**
   * Stands in the sea (ships, whales, a pier, a harbour, an island): placed at sea level with
   * the ground under it dug to a sea bed.
   */
  afloat?: boolean;
}
