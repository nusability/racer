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
  /** A volcanic island: what falls on the road is molten lava bombs, not rock. */
  lava?: boolean;
}

/** The ice: snowfields in valleys between mountain walls, peaks on the horizon, pines, seracs. */
export interface IceScenery extends SceneryBase {
  biome: 'ice';
  /** Snow-capped peaks on the horizon. */
  peaks: number;
  /** Height of the mountain walls rising a little way off the course, metres. */
  massifHeight: number;
  /** Peak height of the wind-carved drifts near the road, metres. */
  driftHeight: number;
  /** Pines beside the course per kilometre of lap. */
  pinesPerKm: number;
  /** Chance (percent per pine) of a cluster of blue seracs further out. */
  seracs: number;
}

/** The city: walled roads between towers, neon and elevated highways, by night. */
export interface CityScenery extends SceneryBase {
  biome: 'city';
  /** Towers standing around the course, in blocks off the road. */
  towers: number;
  /** Typical tower height, metres; the skyline the track is read against. */
  towerHeight: number;
  /** Neon billboards beside the course per kilometre of lap. */
  billboardsPerKm: number;
}

/** A stretch of the main loop where the woods open up. */
export interface ForestClearing {
  from: TrackParam;
  to: TrackParam;
  /**
   * 'glade': a sunlit meadow, no giants beside the road, sky overhead. 'town': logged-out
   * ground round a settlement (the lumber town's street circuit): stumps and stacked timber.
   */
  style: 'glade' | 'town';
}

/** Elderwood: a forest of giant ancient trees, the canopy far overhead, ferns, moss and mist. */
export interface ForestScenery extends SceneryBase {
  biome: 'forest';
  /**
   * What the road is: 'trail' is dark packed earth with moss creeping in at its edges (most
   * races, through the woods); 'logging' is a pale compacted logging road, the street circuits'.
   */
  road: 'trail' | 'logging';
  /** Giant trees lining the course per kilometre of lap, both sides together (80–110 reads as a colonnade). */
  treesPerKm: number;
  /**
   * Typical giant's height to the top of its crown, metres (120–180): the crowns start three
   * quarters of the way up, so this is how high the canopy ceiling stands over the course.
   */
  treeHeight: number;
  /** Typical trunk radius above the root flare, metres (2.5–4: trunks 5–8 m across). */
  trunkRadius: number;
  /** How far out from the course the woods stand before the mist takes them, metres. */
  forestDepth: number;
  /** How closed the canopy ceiling over the course is: 0 open sky, 1 a near-solid roof with gaps. */
  canopy: number;
  /** Ferns, shrubs, fallen logs and mossy boulders on the forest floor: 0 bare, 1 lush. */
  undergrowth: number;
  /** Ground mist drifting between the trunks: 0 clear, 1 thick. */
  mist: number;
  /** Shafts of sunlight through canopy gaps per kilometre of lap. */
  shaftsPerKm: number;
  /** Main-loop spans where the woods open into a glade or a logged-out town. */
  clearings: ForestClearing[];
}

export type TrackScenery = DesertScenery | BeachScenery | IceScenery | CityScenery | ForestScenery;

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
  /**
   * Bind to the course hazard with this id (on the main loop): the landmark animates from the
   * hazard's schedule and is given a track-space → local mapping (see HazardBinding).
   */
  hazard?: string;
}
