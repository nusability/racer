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
  /**
   * The quarters of the city the course runs through. Each patch of the city belongs to one,
   * so the character shifts along the lap: glass spires downtown, slums and plant by the docks.
   */
  districts: CityDistrict[];
}

/**
 * The kinds of building a city district is built from.
 * Glorious: `spire` (mirrored supertall with setbacks and a crown), `twist` (a tapering tower
 * turning a quarter turn), `monolith` (a dark corporate slab with a giant holo-ad face),
 * `ziggurat` (a stepped megablock with sky gardens), `arcology` (a city in a tower: podium,
 * round core, landing pad, antenna crown), `dome` (a civic tower under a glass dome),
 * `skybridge` (towers linked by bridges in the air).
 * Middling: `residential` (balconied flats), `capsule` (stacked capsule-hotel modules),
 * `industrial` (clad plant with stacks, tanks and pipes).
 * Run-down: `slab` (grimy concrete flats hung with AC units), `shanty` (a tower crusted with
 * cantilevered add-on boxes and cables), `shell` (a half-built frame in scaffold under a crane).
 */
export type CityArchetype =
  | 'spire'
  | 'twist'
  | 'monolith'
  | 'ziggurat'
  | 'arcology'
  | 'dome'
  | 'skybridge'
  | 'residential'
  | 'capsule'
  | 'industrial'
  | 'slab'
  | 'shanty'
  | 'shell';

export interface CityDistrict {
  /** How much of the city this district covers, relative to the track's other districts. */
  share: number;
  /** Relative weights of the archetypes it builds; one left out never appears there. */
  mix: Partial<Record<CityArchetype, number>>;
  /** 0 spotless … 1 decayed: streaked walls, boarded windows, failing and dead neon. */
  grime: number;
  /** 0 … 1: how much neon dresses its buildings (crowns, corner strips, blade signs). */
  neon: number;
}

/** A station megastructure standing off the course: where it looms, and how big it is. */
export interface StationPlacement {
  /** Main-loop position it stands abeam of, and the side. */
  at: TrackParam;
  side: -1 | 1;
  /** Gap between the road's hard boundary and the structure's nearest face, metres. */
  distance: number;
  /** Length along the course of its main spine, metres (its height and depth follow); under ~560 m its parts no longer fit their places and the build throws. */
  length: number;
}

/**
 * An orbital ring station over a gas giant: no ground at all. Every road is a deck hanging in
 * the void (rails where it is walled, a lit open edge where it is a drop), the planet and the
 * stars below and around it, station structure looming off the course and asteroid fields the
 * road weaves through.
 */
export interface SpaceScenery extends SceneryBase {
  biome: 'space';
  /** Megastructures off the course. */
  stations: StationPlacement[];
  /** Main-loop spans of asteroid field: big rocks crowd the road's edges, more hang beyond. */
  asteroidFields: { from: TrackParam; to: TrackParam }[];
  /** Big rocks right beside the road per kilometre of field, both sides together. */
  rocksPerKm: number;
  /** Far rocks, drawn as flat impostors, scattered round the whole course. */
  farRocks: number;
  /** Main-loop spans with lit gantries spanning the deck, close overhead, every few dozen metres. */
  gates: { from: TrackParam; to: TrackParam }[];
  /** Main-loop spans with banks of solar panels on masts standing beside the road, one side or both. */
  arrays: { from: TrackParam; to: TrackParam; side?: -1 | 1 }[];
  /**
   * Main-loop tunnel spans bored through a giant asteroid: the rock is drawn round the tube, so
   * the road dives into the rock at one portal and out of it at the other.
   */
  bores: { from: TrackParam; to: TrackParam }[];
  /**
   * A moon's surface under the course instead of the void: the one space track with ground.
   * Null on a station track (every road hangs in the void).
   */
  moon: MoonSurface | null;
}

/** Grey regolith pocked with craters, the station's lights far overhead. */
export interface MoonSurface {
  /** Typical crater radius, metres (the biggest are about three times it). */
  craterRadius: number;
  /** Share of the ground's crater cells that hold a crater, 0..1. */
  craterShare: number;
  /** Height of the rolling maria between the craters, metres. */
  relief: number;
}

export type TrackScenery = DesertScenery | BeachScenery | IceScenery | CityScenery | SpaceScenery;

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
