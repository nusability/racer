// Shared contracts for the Mirage Racer prototype. Everything under src/core is pure
// TypeScript (no three.js, no DOM) so it runs headless in tools/sim-check.ts.
//
// World axes follow three.js: +Y is up, the ground is the XZ plane, metres and seconds.
// "Track space" is (s, x, y): s = distance along the centreline (0..track.length, wraps),
// x = lateral offset from the centreline (+ = to the racer's right when facing +s),
// y = height above the road surface.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------------------
// Track authoring (src/data/tracks/*.ts)
// ---------------------------------------------------------------------------

/** A control point of the closed centreline, in world metres. */
export interface TrackControlPoint {
  x: number;
  z: number;
  /** Base elevation of the road surface. */
  y: number;
  /** Road width (edge to edge) from here to the next point; interpolated. */
  width?: number;
}

/**
 * Where a feature sits along the lap, in control-point parameter space: 3 is control point 3,
 * 3.5 is halfway (by arc length) between points 3 and 4. Lets authors place features on the
 * straights they drew rather than guessing lap fractions.
 */
export type TrackParam = number;

export type TrackFeature =
  /** Launch ramp then a chasm with no surface. Miss the landing and you fall: crash. */
  | { kind: 'jump'; at: TrackParam; rampLength: number; rampHeight: number; gapLength: number }
  /** A small kicker: a short rise that throws you into the air with no chasm behind it. */
  | { kind: 'kicker'; at: TrackParam; length: number; height: number }
  /** Rolling dunes added to the elevation: sin bumps. */
  | { kind: 'dunes'; from: TrackParam; to: TrackParam; amplitude: number; wavelength: number }
  /** Enclosed rock tunnel with a ceiling `ceiling` metres above the road. */
  | { kind: 'tunnel'; from: TrackParam; to: TrackParam; ceiling: number }
  /** Tall canyon walls on both sides (visual height; walls always collide). */
  | { kind: 'canyon'; from: TrackParam; to: TrackParam; wallHeight: number }
  /** Width override (smoothly blended in/out over `blend` metres). */
  | { kind: 'narrow'; from: TrackParam; to: TrackParam; width: number; blend?: number }
  /** A solid rock column standing on the road. */
  | { kind: 'pillar'; at: TrackParam; lateral: number; radius: number }
  /** A rock arch over the road: its two legs leave a gap `opening` wide centred on `offset`. */
  | { kind: 'arch'; at: TrackParam; opening: number; offset: number; height: number }
  /** Seeded scatter of boulders between from..to. */
  | { kind: 'boulders'; from: TrackParam; to: TrackParam; count: number; radius: number }
  /** Boost pad on the road surface: an instant burst of free boost. */
  | { kind: 'boostPad'; at: TrackParam; lateral: number }
  /**
   * A line of boost cells floating over the course: each one tops up the racer's boost tank.
   * `count` cells, `spacing` metres apart along s, starting at `at`, all at `lateral`.
   */
  | { kind: 'boostCells'; at: TrackParam; lateral: number; count: number; spacing: number }
  /**
   * Hard walls at the road edge (no sand run-off) on one side or both (side omitted).
   * Canyons and tunnels already imply walls on both sides.
   */
  | { kind: 'walls'; from: TrackParam; to: TrackParam; side?: -1 | 1 }
  /** Run-off override: drivable sand beyond the road edge, metres, on one side or both. */
  | { kind: 'runoff'; from: TrackParam; to: TrackParam; amount: number; side?: -1 | 1 };

export interface TrackPalette {
  sky: number; // zenith colour
  horizon: number; // horizon / fog colour
  sand: number;
  road: number;
  rock: number;
  accent: number; // banners, markers
  sun: number;
  /** 0 = midday, 1 = deep dusk; drives light intensity and colour. */
  dusk: number;
}

export interface TrackDef {
  id: string;
  name: string;
  /** One line shown in menus. */
  blurb: string;
  /** 1 (easy) .. 5 (brutal). */
  difficulty: number;
  laps: number;
  seed: number;
  /** Default road width when a point doesn't set one. */
  width: number;
  /**
   * Default drivable sand beyond each road edge, metres, before the hard boundary. Sand is
   * slower than the road, so cutting across it is a choice, not a free shortcut.
   */
  runoff: number;
  /** Closed loop: the last point connects back to the first. The start line is at point 0. */
  points: TrackControlPoint[];
  features: TrackFeature[];
  /** Alternative routes that leave and rejoin the main loop (shortcuts). */
  branches: BranchDef[];
  palette: TrackPalette;
}

/**
 * A shortcut: an open ribbon that leaves the main road from one side and rejoins it later.
 * At each end it runs alongside the main road, edge to edge, for BRANCH_JUNCTION_LENGTH
 * metres (the junction, where racers can cross between the two); between the junctions a
 * divider wall separates them. The builder derives the two junction control points at each
 * end, so the full control list is [entry, entry + J, ...points, exit − J, exit] and branch
 * features use that list's parameter space: 0..1 is the entry junction, 2 is points[0], and
 * points.length + 2 .. points.length + 3 is the exit junction.
 */
export interface BranchDef {
  id: string;
  /** Shown on the minimap and in flashes, e.g. "Smuggler's Cut". */
  name: string;
  /** Side of the main road it leaves from and rejoins on. */
  side: -1 | 1;
  /** Main-loop params where it leaves and rejoins; from < to (never across the start line). */
  from: TrackParam;
  to: TrackParam;
  width: number;
  /** Default sand run-off of the branch; walled by default (0) to make it a commitment. */
  runoff: number;
  points: TrackControlPoint[];
  features: TrackFeature[];
}

// ---------------------------------------------------------------------------
// Built track (src/core/track.ts)
// ---------------------------------------------------------------------------

export interface TrackSample {
  s: number;
  /** Centreline point on the road surface (world). In a gap: where the surface would be. */
  pos: Vec3;
  /** Unit forward direction including slope. */
  tangent: Vec3;
  /** Unit right vector, banked. */
  right: Vec3;
  /** Unit up vector of the road, banked. */
  up: Vec3;
  width: number;
  /** Signed horizontal curvature (1/m). Positive = the track turns right. */
  curvature: number;
  /** dElevation/ds of the road surface. */
  slope: number;
  /** Bank angle in radians (positive = right side low, i.e. leaning into a right turn). */
  bank: number;
  /** No surface here (chasm of a jump). */
  gap: boolean;
  /** Ceiling height above the road, Infinity when open sky. */
  ceiling: number;
  /** Visual canyon wall height, 0 when none (low berm). */
  wallHeight: number;
  /**
   * Hard boundary distance from the centreline on the left and right (both positive, both ≥
   * width/2). Between the road edge and the boundary is drivable sand.
   */
  edgeL: number;
  edgeR: number;
}

/** A solid obstacle in track space: a vertical cylinder standing on the road. */
export interface Obstacle {
  kind: 'pillar' | 'archLeg' | 'boulder';
  s: number;
  x: number;
  radius: number;
  height: number;
}

export interface Arch {
  s: number;
  /** Lateral extent of the opening (the legs are outside it). */
  openMin: number;
  openMax: number;
  height: number;
}

export interface BoostPad {
  s: number;
  x: number;
  length: number;
  width: number;
}

/** A collectible that refills the boost tank. Each racer can take each cell once per lap. */
export interface BoostCell {
  /** Index into the ribbon's cells. */
  index: number;
  s: number;
  x: number;
}

export interface Jump {
  /** Ramp start, lip (= gap start) and gap end, in s. */
  rampStart: number;
  lip: number;
  gapEnd: number;
  rampHeight: number;
}

// ---------------------------------------------------------------------------
// Racers (src/data/racers.ts, src/data/upgrades.ts)
// ---------------------------------------------------------------------------

/** Effective performance numbers fed to the simulation. */
export interface RacerStats {
  /** Top speed without boost, m/s. */
  topSpeed: number;
  /** Forward acceleration at low speed, m/s². */
  accel: number;
  /** Max yaw rate from steering, rad/s. */
  handling: number;
  /** 0..1: how quickly lateral slide is killed (1 = on rails). */
  grip: number;
  /** Boost multiplies top speed by (1 + boostPower). */
  boostPower: number;
  /** Seconds of boost a full tank holds. */
  boostTank: number;
  /** Damage taken is divided by this (1 = baseline). */
  armor: number;
}

/** Ground-effect skimmer silhouettes (src/render/racerStyles.ts). */
export type RacerStyle = 'skiff' | 'sponson' | 'dart' | 'quadfan' | 'swept' | 'ringwing';

export interface RacerVisual {
  style: RacerStyle;
  primary: number;
  secondary: number;
  accent: number;
  /** Engine exhaust / energy colour. */
  glow: number;
}

export interface RacerDef {
  id: string;
  name: string;
  pilot: string;
  blurb: string;
  /** Credits; 0 = owned from the start. */
  price: number;
  base: RacerStats;
  visual: RacerVisual;
}

export type UpgradeId = 'engine' | 'thrusters' | 'steering' | 'tank' | 'armor';

// ---------------------------------------------------------------------------
// Race simulation (src/core/race.ts)
// ---------------------------------------------------------------------------

/**
 * The racer is driven by a lateral TARGET position, not by heading: the craft always flies
 * along the track and slides sideways to where the pilot puts it (very fast, but not
 * instantly). Two ways to move the target, which add up:
 */
export interface PlayerInput {
  /** Rate command, -1 (full left) .. 1 (full right): keys, buttons, tilt. */
  steer: number;
  /**
   * Trackpad-style displacement of the target, metres, applied once (the step that receives
   * it). Positive = right. The drag control turns finger movement into this.
   */
  nudge: number;
  /** Air brake held. */
  brake: boolean;
  /** Boost held. */
  boost: boolean;
}

export interface RaceEntrant {
  id: string;
  name: string;
  racerId: string;
  stats: RacerStats;
  isPlayer: boolean;
  /** AI skill 0..1 (ignored for the player). */
  skill: number;
}

export interface RaceConfig {
  laps: number;
  seed: number;
  entrants: RaceEntrant[];
}

export interface RacerState {
  id: string;
  /** -1 on the main loop, else the index into track.branches the racer is on. */
  branch: number;
  /** Position along the current ribbon (main: 0..track.length; branch: 0..branch length). */
  s: number;
  /** Total distance covered since the start line, for ordering. */
  distance: number;
  x: number;
  /** Height above the road surface (0 = hovering at rest height on the road). */
  y: number;
  /** Absolute vertical velocity, m/s. */
  vy: number;
  /** Forward speed, m/s. */
  speed: number;
  /** Sideways velocity in track space, m/s (+ = moving right). */
  vx: number;
  /** Visual heading relative to the track tangent, radians (+ = pointing right): presentation only. */
  yaw: number;
  /** Visual roll the presentation can use, radians. */
  roll: number;
  /** Boost tank fill, 0..1. Holding boost drains it; boost cells refill it. No penalty for using it. */
  boost: number;
  /** 0..1; 1 = destroyed. */
  damage: number;
  boosting: boolean;
  airborne: boolean;
  /** Seconds left before respawn after a crash; 0 when racing. */
  crashed: number;
  /** Laps completed. */
  lap: number;
  /** Race time at which this racer finished, or null. */
  finishTime: number | null;
  /** 1-based current standing. */
  place: number;
  /** Best lap time so far (s) or null. */
  bestLap: number | null;
  /** Steer rate command applied this step (-1..1), for presentation. */
  steer: number;
  /** Seconds left of post-respawn invulnerability (obstacles and racers pass through). */
  invulnerable: number;
}

export type RaceEvent =
  | { type: 'countdown'; n: number } // 3, 2, 1, 0 = GO
  | { type: 'scrape'; id: string; side: -1 | 1; intensity: number }
  /** Entered (on: true) or left (on: false) the sand run-off beyond the road edge. */
  | { type: 'offroad'; id: string; on: boolean }
  | { type: 'hit'; id: string; kind: Obstacle['kind'] | 'ceiling' | 'racer'; intensity: number }
  | { type: 'crash'; id: string; reason: 'destroyed' | 'fell' | 'obstacle' }
  | { type: 'respawn'; id: string }
  | { type: 'launch'; id: string }
  | { type: 'land'; id: string; impact: number }
  | { type: 'boostPad'; id: string }
  /** A racer collected boost cell `cell` of ribbon `branch` (-1 = main loop). */
  | { type: 'pickup'; id: string; branch: number; cell: number }
  /** A racer's tank ran dry while boost was held. */
  | { type: 'tankEmpty'; id: string }
  | { type: 'lap'; id: string; lap: number; time: number }
  | { type: 'finish'; id: string; place: number; time: number };

export type RacePhase = 'countdown' | 'racing' | 'finished';

export interface RaceResultRow {
  id: string;
  name: string;
  racerId: string;
  place: number;
  /** Null when the race ended before they finished (they get placed by distance). */
  time: number | null;
  bestLap: number | null;
  isPlayer: boolean;
}
