// Shared contracts for the Mirage Racer prototype. Everything under src/core is pure
// TypeScript (no three.js, no DOM) so it runs headless in tools/sim-check.ts.
//
// World axes follow three.js: +Y is up, the ground is the XZ plane, metres and seconds.
// "Track space" is (s, x, y): s = distance along the centreline (0..track.length; wraps on a
// circuit, clamps at the ends of a sprint and of a branch),
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

/** A control point of the centreline, in world metres. */
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
  /** Like boostCells, but each one repairs part of the hull. Rarer, often on a risky line. */
  | { kind: 'repairCells'; at: TrackParam; lateral: number; count: number; spacing: number }
  /**
   * Hard walls at the road edge (no sand run-off) on one side or both (side omitted).
   * Canyons and tunnels already imply walls on both sides.
   */
  | { kind: 'walls'; from: TrackParam; to: TrackParam; side?: -1 | 1 }
  /** Run-off override: drivable sand beyond the road edge, metres, on one side or both. */
  | { kind: 'runoff'; from: TrackParam; to: TrackParam; amount: number; side?: -1 | 1 }
  /**
   * An open drop at the road edge on one side or both: no run-off and no wall. Leaving the
   * road there means falling off the course (a wreck). Ridges, cliff roads, bridges.
   */
  | { kind: 'drop'; from: TrackParam; to: TrackParam; side?: -1 | 1 }
  /**
   * A vertical loop starting at `at` on a straight: the road climbs a full circle of
   * `radius` metres and comes down `span` metres further along, shifted `shift` metres to
   * the side (so the exit passes beside the entry), then eases back over `settle` metres.
   * Racers are held to the surface inside it; too slow at the top and they fall (a wreck).
   */
  | { kind: 'loop'; at: TrackParam; radius: number; span: number; shift: number; settle: number }
  /** A slippery surface (ice, wet rock): the craft answers steering with `grip` (0..1) of its usual bite. */
  | { kind: 'slick'; from: TrackParam; to: TrackParam; grip: number }
  /**
   * Broken, rocky ground (rubble, cracked slabs, pressure ridges): skimming over it faster than
   * the safe speed batters the hull, steeply more the faster you go. `amount` (0..1] scales the
   * damage and the jolts. Lifting or braking through it is cheap; flat out it is the price of a
   * shortcut.
   */
  | { kind: 'rough'; from: TrackParam; to: TrackParam; amount: number }
  /** The road rolls through `turns` full barrel rolls between from and to; racers are held to it. */
  | { kind: 'corkscrew'; from: TrackParam; to: TrackParam; turns: number }
  /**
   * The course crosses itself here (figure-8s and knots): the stretch at `at` passes the
   * stretch at `other`. 'bridge': one passes over the other (the author gives them at least
   * CROSSING_BRIDGE_CLEARANCE of height difference; the renderer builds the bridge and cuts
   * the walls below). 'flat': an X junction at road level — cross-traffic is real and racers
   * on the two stretches can collide. Declaring it is what lets the checks accept the overlap.
   */
  | { kind: 'crossing'; at: TrackParam; other: TrackParam; style: 'bridge' | 'flat' }
  /** A scheduled, moving danger tied to the course (see HazardDef). */
  | { kind: 'hazard'; hazard: HazardDef }
  /**
   * Names the main road's own route through a fork (main road only). A fork is one or two
   * `route` branches leaving over exactly this from..to (one on each side at most), and the
   * main road between them is the third route: it gets a name like the others, flashed when a
   * racer stays on it past the fork.
   */
  | { kind: 'route'; from: TrackParam; to: TrackParam; name: string };

/**
 * Hazards are deterministic schedules on race time, so the simulation and the presentation
 * (landmarks, warning shadows) always agree. Every hazard has an id that scenery can bind a
 * landmark to (e.g. the sand beast that IS the sweeper).
 */
export type HazardDef =
  /**
   * A body crossing the road at `at` (a beast, a bucket wheel, a ship's hull, a train): it
   * sweeps from xFrom to xTo during `cross` seconds, waits `hold` seconds, sweeps back during
   * `cross`, and is parked off the course for the rest of each `period`. Collides like a pillar.
   */
  | { type: 'sweeper'; id: string; at: TrackParam; radius: number; height: number; xFrom: number; xTo: number; cross: number; hold: number; period: number; phase: number }
  /**
   * Objects falling onto the course between from and to: every `period`, `count` of them land
   * on seeded spots across the drivable width. Each is telegraphed `warn` seconds before it
   * lands (a shadow), then lies there `stay` seconds as an obstacle. Rocks from a digger,
   * lava bombs, ice blocks, cargo.
   */
  | { type: 'dropper'; id: string; from: TrackParam; to: TrackParam; count: number; radius: number; period: number; warn: number; stay: number; phase: number }
  /**
   * A barrier that comes down across the course at `at` for `up` seconds of every `period`
   * (a beast's body lying across the road, a closing gate), leaving an opening `opening`
   * metres wide centred on `offset`. Telegraphed `warn` seconds before it lands.
   */
  | { type: 'blocker'; id: string; at: TrackParam; opening: number; offset: number; height: number; warn: number; up: number; period: number; phase: number }
  /**
   * A sideways push between from and to (a ship's downdraft, a jet blast, a gale) of
   * `strength` m/s² towards +x (negative = towards −x), active `on` seconds of every `period`.
   */
  | { type: 'gust'; id: string; from: TrackParam; to: TrackParam; strength: number; on: number; period: number; phase: number };

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

/**
 * How a course is raced. 'circuit': a closed loop over `laps`, the start and finish line at
 * point 0. 'sprint': point to point, raced once, from a start line at point 0 to a finish line
 * at the last point; the builder adds a straight grid apron behind the start and a run-out
 * beyond the finish (SPRINT_GRID_APRON, SPRINT_RUNOUT) so finishers glide to a stop.
 */
export type CourseKind = 'circuit' | 'sprint';

/**
 * What lies below the course, for a racer that falls off it (past an open edge, or into a
 * chasm). 'ground': solid ground (sand, rock, snow, streets, regolith) DROP_DEPTH below an open
 * edge and CHASM_DEPTH below a chasm's lower lip: the fall ends there in a wreck. 'water': the
 * sea at SEA_LEVEL (ground instead where that lies higher): a splash. 'void': nothing at all
 * (Orbital Reach's decks): the craft tumbles away and is lost after VOID_LOST_DEPTH of fall. It
 * must match what the world draws there (track-check holds it to the track's biome).
 */
export type FloorKind = 'ground' | 'water' | 'void';

export interface TrackDef {
  id: string;
  name: string;
  /** One line shown in menus. */
  blurb: string;
  /** 1 (easy) .. 5 (brutal). */
  difficulty: number;
  course: CourseKind;
  /** Laps of a circuit; a sprint is raced once, so exactly 1. */
  laps: number;
  seed: number;
  /** Default road width when a point doesn't set one. */
  width: number;
  /**
   * Default drivable sand beyond each road edge, metres, before the hard boundary. Sand is
   * slower than the road, so cutting across it is a choice, not a free shortcut.
   */
  runoff: number;
  /** What a racer falling off the course meets (see FloorKind). */
  floor: FloorKind;
  /**
   * Circuit: a closed loop, the last point connects back to the first; the start line is at
   * point 0. Sprint: an open line from the start (point 0) to the finish (the last point).
   */
  points: TrackControlPoint[];
  features: TrackFeature[];
  /** Ribbons that leave the main road and rejoin it later: shortcuts and the routes of forks. */
  branches: BranchDef[];
  palette: TrackPalette;
}

/**
 * A branch: an open ribbon that leaves the main road from one side and rejoins it later.
 * At each end it runs alongside the main road, edge to edge, for BRANCH_JUNCTION_LENGTH
 * metres (the junction, where racers can cross between the two); between the junctions a
 * divider wall separates them. The builder derives the two junction control points at each
 * end, so the full control list is [entry, entry + J, ...points, exit − J, exit] and branch
 * features use that list's parameter space: 0..1 is the entry junction, 2 is points[0], and
 * points.length + 2 .. points.length + 3 is the exit junction.
 */
export interface BranchDef {
  id: string;
  /**
   * 'shortcut': a walled cut that trades hull for time (rough ground, squeezes; see
   * track-check's shortcut table). 'route': one of the parallel ways of a fork, about as quick
   * as the main road (ROUTE_TIME_BAND in track-check), different in character, never a free
   * gain. A route needs a main-road 'route' feature over the same from..to naming the main way.
   */
  kind: 'shortcut' | 'route';
  /** Shown on the minimap and in flashes, e.g. "Smuggler's Cut". */
  name: string;
  /** Side of the main road it leaves from and rejoins on. */
  side: -1 | 1;
  /** Main-road params where it leaves and rejoins; from < to (never across a circuit's start line). */
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
  /**
   * Vertical curvature of the road (1/m): d(slope)/ds, smoothed. Negative over a crest (the road
   * falls away, the craft goes light), positive in a dip (it is pressed on); 0 in loops and
   * corkscrews, which hold the craft to the road, and at a chasm's edges.
   */
  vcurve: number;
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
  /** The boundary on that side is an open drop (falling off = a wreck), not a wall. */
  dropL: boolean;
  dropR: boolean;
  /** Racers are held to the surface here (loops, corkscrews): no air, no ballistic flight. */
  magnet: boolean;
  /** Surface grip multiplier (1 = normal; ice < 1). */
  grip: number;
  /** Rough ground 0..1 (0 = smooth): hull damage and jolts at speed (see the 'rough' feature). */
  rough: number;
  /**
   * Height (world y) of what a racer falling off the course here meets: the chasm floor in a
   * gap, else the ground or sea beside the open edges; -Infinity over the void (see FloorKind).
   */
  floor: number;
  /** The floor here is the sea's surface: a fall ends in a splash. */
  water: boolean;
}

/** A solid obstacle in track space: a vertical cylinder standing on the road. */
export interface Obstacle {
  kind: 'pillar' | 'archLeg' | 'boulder' | 'hazard';
  /** For kind 'hazard': the HazardDef id it belongs to (scheduled obstacles come and go). */
  hazardId?: string;
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
export type RacerStyle = 'skiff' | 'sponson' | 'dart' | 'quadfan' | 'swept' | 'ringwing' | 'wedge' | 'gyre';

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
  /**
   * World (data/worlds.ts) whose opening puts this glider on sale; absent means on sale from
   * the start. Lets a late world bring gliders its winnings are meant to buy.
   */
  unlockWorld?: string;
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

/** Where a sprint's force field holds a finisher: main-road s where it enters the field, and the place (s, x) it rests at. */
export interface FieldHold {
  entry: number;
  s: number;
  x: number;
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
  /** Hull damage 0..1; reaching 1 wrecks the racer. Repair cells take it back down. */
  damage: number;
  boosting: boolean;
  airborne: boolean;
  /** Seconds since this racer wrecked; 0 while racing. A wreck is final for the race. */
  crashed: number;
  /** Laps completed (a sprint has one: 1 once it is finished). */
  lap: number;
  /** Race time at which this racer finished, or null. */
  finishTime: number | null;
  /** 1-based current standing. */
  place: number;
  /** Best lap time so far (s) or null; on a sprint, the run itself once finished. */
  bestLap: number | null;
  /** Steer rate command applied this step (-1..1), for presentation. */
  steer: number;
  /** Slipstream built up riding a racer's wake, 0..1 (see src/core/slipstream.ts). */
  draft: number;
  /**
   * Off the course and falling (Vehicle: below the road past an open edge): a free body in
   * world space until it hits the floor, the course, or is lost in the void. Null while on the
   * course; kept as it was at the impact once the fall ends in a wreck.
   */
  fall: FallState | null;
}

/** A racer falling free of the course, in world space (metres, m/s; +Y up). */
export interface FallState {
  pos: Vec3;
  vel: Vec3;
  /** Seconds since it went over. */
  time: number;
}

export type RaceEvent =
  | { type: 'countdown'; n: number } // 3, 2, 1, 0 = GO
  | { type: 'scrape'; id: string; side: -1 | 1; intensity: number }
  /** Entered (on: true) or left (on: false) the sand run-off beyond the road edge. */
  | { type: 'offroad'; id: string; on: boolean }
  /**
   * Every step a racer skims rough ground: `intensity` 0..1 is the rough amount times its
   * share of top speed (a rumble even when lifting), for sound and camera shake.
   */
  | { type: 'rough'; id: string; intensity: number }
  /** Rough ground kicked the racer sideways (a jolt), `intensity` 0..1. */
  | { type: 'jolt'; id: string; intensity: number }
  /** Started (on: true) or stopped (on: false) riding another racer's slipstream. */
  | { type: 'draft'; id: string; on: boolean }
  /** Pulled out of a full draft: the slipstream's speed lingers a moment for the pass. */
  | { type: 'slingshot'; id: string }
  /** `hazard`: the HazardDef id, when kind is 'hazard' (so a wreck can name what caused it). */
  | { type: 'hit'; id: string; kind: Obstacle['kind'] | 'ceiling' | 'racer'; intensity: number; hazard?: string }
  /**
   * A wreck: the racer is out of this race (no respawn). destroyed = hull gone, fell = into a
   * chasm (its floor or its far face), offEdge = fell off an open edge onto the ground below or
   * into the course's own structure, splash = fell into the sea, lost = fell into the void,
   * loopStall = too slow at the top of a loop, obstacle / hazard = a dead-centre hit at speed.
   */
  | { type: 'crash'; id: string; reason: 'destroyed' | 'fell' | 'offEdge' | 'splash' | 'lost' | 'loopStall' | 'obstacle' | 'hazard' }
  | { type: 'respawn'; id: string }
  | { type: 'launch'; id: string }
  /** At GO: boost was touched during the countdown, so the engines flooded and launch late. */
  | { type: 'falseStart'; id: string }
  /** Boost pressed right at GO (and not before): the launch boost fires. */
  | { type: 'perfectStart'; id: string }
  | { type: 'land'; id: string; impact: number }
  | { type: 'boostPad'; id: string }
  /** A racer collected boost cell `cell` of ribbon `branch` (-1 = main loop). */
  | { type: 'pickup'; id: string; branch: number; cell: number; item: 'boost' | 'repair' }
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
  /** Wrecked: did not finish. Placed after every racer still running, latest wreck first. */
  dnf: boolean;
}
