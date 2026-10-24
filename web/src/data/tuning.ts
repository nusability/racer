// Tunable numbers for the prototype. Grouped by owner; the simulation section is tuned
// by play. Nothing here is player-facing copy.

// --- Track geometry (src/core/track.ts) ---
/** Spacing of the resampled centreline, metres. */
export const TRACK_SAMPLE_STEP = 2;
/** Catmull-Rom subdivisions per control-point segment before resampling. */
export const TRACK_SPLINE_SUBDIVISIONS = 64;
/** Samples averaged (each side) when smoothing curvature and bank. */
export const TRACK_SMOOTH_RADIUS = 6;
/** Bank angle (rad) per unit curvature (1/m). */
export const BANK_PER_CURVATURE = 18;
/** Maximum bank angle, radians. */
export const MAX_BANK = 0.35;
/** Depth of a jump's chasm below the lip; falling past it means a crash. */
export const CHASM_DEPTH = 60;
/** How far the kicker's back face drops, as a fraction of its length. */
export const KICKER_BACK_FRACTION = 0.25;
export const PILLAR_HEIGHT = 40;
export const ARCH_LEG_MIN_RADIUS = 2;
export const BOOST_PAD_LENGTH = 24;
export const BOOST_PAD_WIDTH = 8;
export const DEFAULT_NARROW_BLEND = 40;
/** Obstacle lookup bucket size along s, metres. */
export const OBSTACLE_BUCKET = 50;

// --- Simulation (src/core) ---
/** Fixed simulation step, seconds. */
export const SIM_DT = 1 / 120;
/** Gravity, m/s². Stronger than Earth so jumps read as weighty at these speeds. */
export const GRAVITY = 38;

// Race flow (src/core/race.ts)
/** Countdown length before GO; one 'countdown' event per second. */
export const COUNTDOWN_SECONDS = 3;
/** Distance from the start line back to the front grid row, metres. */
export const GRID_FRONT_GAP = 12;
/** Distance between grid rows, metres. */
export const GRID_ROW_SPACING = 18;
/** The right-hand slot of a row sits this far behind the left, so the grid is staggered. */
export const GRID_STAGGER = 9;
/** Lateral offset of the two grid lanes from the centreline, metres. */
export const GRID_LANE_OFFSET = 6;
/** Free boost for pressing boost right at GO: a reward for timing, not for holding early. */
export const START_BOOST_DURATION = 0.9;
/** Seconds after GO in which a first press of boost still counts as a perfect start. */
export const PERFECT_START_WINDOW = 0.3;
/** Touching boost during the countdown floods the engines: no thrust for this long after GO. */
export const FALSE_START_STALL = 1;
/** How long the field may keep racing after the player finishes, seconds. */
export const FINISH_GRACE = 20;
/**
 * Catch-up: a small invisible nudge that keeps races close. AIs well ahead of the player ease
 * off, AIs well behind push, as a top-speed factor ramped in by distance gap. Off when there is
 * no player and once the player has finished. The slipstream (below) is now the main rubber
 * band: it is visible, works for the player too and is earned by driving, so this one stays
 * small. A strong push (it was 0.15) read as rivals simply being faster.
 */
/** Gap (metres along the lap) where the catch-up starts to act. */
export const CATCHUP_START_GAP = 60;
/** Gap where it reaches full strength. */
export const CATCHUP_FULL_GAP = 450;
/** Top speed an AI far ahead gives up (fraction). */
export const CATCHUP_EASE = 0.03;
/** Top speed an AI far behind gains (fraction): the most an AI ever exceeds its stats outside a
 * slipstream. Small, so a pack reeling the player in does it in the player's wake, not by magic;
 * behind like that, AIs still boost freely. */
export const CATCHUP_PUSH = 0.05;

// Slipstream (src/core/slipstream.ts): every racer, player and AI alike, rides the wake of a
// racer just ahead of it on the same ribbon. Distances along s are bumper to bumper.
/** Closest gap that drafts, metres: nearer than this is a bump, not a wake. */
export const DRAFT_MIN_GAP = 4;
/** Farthest gap that drafts, metres: about a quarter second at race speed. */
export const DRAFT_MAX_GAP = 40;
/** Half-width of the wake at the closest gap, metres: a little over a craft's half-width. */
export const DRAFT_HALF_WIDTH_NEAR = 2.5;
/** Half-width of the wake at the farthest gap, metres: far back, only a dead-straight line rides it. */
export const DRAFT_HALF_WIDTH_FAR = 1.2;
/** Seconds to build a full draft in the wake, and to lose it out of it: quick, never instant. */
export const DRAFT_BUILD_TIME = 0.5;
export const DRAFT_DECAY_TIME = 0.4;
/** Top speed gained at full draft (fraction): enough to close on an equal rival and pass. */
export const DRAFT_TOP_SPEED = 0.06;
/** Tank refilled per second at full draft: a bit over the passive trickle, and it needs no pause. */
export const DRAFT_BOOST_REFILL = 0.02;
/** Draft at or above this counts as full (charging a slingshot). */
export const DRAFT_FULL = 0.9;
/** Seconds of full draft that charge a slingshot. */
export const DRAFT_SLINGSHOT_CHARGE = 0.8;
/** A charged slingshot is lost when the draft fades below this while still in the wake (dropping back). */
export const DRAFT_CHARGE_KEEP = 0.5;
/** Seconds the full draft bonus lingers after pulling out of a charged wake, so pulling out to pass works. */
export const DRAFT_SLINGSHOT_TIME = 0.6;
/** The 'draft' event turns on at this draft and off below the lower mark, so the edge of a wake doesn't flicker. */
export const DRAFT_EVENT_ON = 0.3;
export const DRAFT_EVENT_OFF = 0.1;
/** Skill of the AI that drives the player's racer after the finish (and in headless runs). */
export const AUTOPILOT_SKILL = 0.85;

// Racer body (collision sizes)
/** Half the racer's width against walls and other racers, metres. */
export const RACER_HALF_WIDTH = 2.2;
/** Collision radius against obstacles, metres. */
export const RACER_RADIUS = 2.2;
/** Bumper-to-bumper length for racer contacts, metres. */
export const RACER_LENGTH = 7;
/** Height the racer needs under a ceiling, metres. */
export const RACER_HEIGHT = 2.5;

// Forward speed
/** Thrust falls off as (speed/top)^this, so speed creeps toward top instead of snapping. */
export const ACCEL_TAPER_EXP = 2;
/** Above top speed (boost just ended), the excess bleeds off at this rate, 1/s. */
export const OVERSPEED_DECAY = 1.2;
/** Boost also multiplies thrust, so the extra speed arrives quickly enough to feel. */
export const BOOST_ACCEL_MULT = 1.7;
/** Air brake deceleration, m/s². Strong: a tap is enough to set up a hairpin. */
export const BRAKE_DECEL = 85;
/** Climbing costs and descending gives this fraction of the gravity component. */
export const SLOPE_SPEED_FACTOR = 0.5;
/** Top speed lost at full damage (fraction): damage hurts but never strands you. */
export const DAMAGE_TOP_SPEED_LOSS = 0.08;

// Lateral control: the craft flies along the track and the player sets where across it it is.
/** Handling (racer stat) at which the lateral numbers below apply as written. */
export const HANDLING_REF = 1.6;
/** Full steer moves the lateral target this fast, m/s (scaled by handling). */
export const STEER_TARGET_RATE = 45;
/** Natural frequency of the critically damped chase of the target, rad/s (by handling). */
export const LATERAL_RESPONSE = 15;
/** Fastest the craft moves sideways, m/s (by handling): snappy, never a teleport. */
export const LATERAL_SPEED_MAX = 60;
/** The target may sit this far past a hard boundary, so pushing into a wall grinds it. */
export const TARGET_OVERREACH = 1;
/** Corners drift the target outward: m/s of drift per m/s² of speed²·curvature at GRIP_REF. */
export const CORNER_PULL = 0.11;
/** Grip (racer stat) at which CORNER_PULL applies as written; more grip, less drift. */
export const GRIP_REF = 0.6;
/** Fraction of the corner drift left while the air brake is held. */
export const CORNER_PULL_BRAKE = 0.35;
/** Lateral response (target rate and chase) kept in the air: pods correct mid-air, just less. */
export const AIR_STEER_FACTOR = 0.45;
/** Frenet denominator floor: keeps ds/dt finite far on the inside of very tight turns. */
export const FRENET_MIN_DENOM = 0.3;

// Sand run-off and hard boundaries
/** Top speed multiplier on sand: cutting across it is a choice, not a free line. */
export const SAND_TOP_SPEED = 0.7;
/** Extra drag on sand, m/s². */
export const SAND_DRAG = 14;
/** Forward speed lost per m/s of sideways speed into a boundary. */
export const BOUNDARY_SPEED_LOSS = 0.6;
/**
 * Grinding along a boundary drags with the engine's own pull at this fraction of top speed, so
 * a racer held against a wall settles there: slower, never pinned.
 */
export const BOUNDARY_GRIND_SPEED = 0.65;
/** Sideways speed into a boundary that makes contact an impact rather than a press, m/s. */
export const BOUNDARY_IMPACT_SPEED = 4;
/** Boundary hits below this sideways speed do no damage, m/s. */
export const BOUNDARY_DAMAGE_FREE_SPEED = 8;
/** Damage per m/s of sideways speed above the free speed (before armour). */
export const BOUNDARY_DAMAGE_PER_SPEED = 0.006;
/** Grinding along a boundary wears the hull too, per second (before armour). */
export const BOUNDARY_GRIND_DAMAGE = 0.03;
/** Fraction of the sideways speed bounced back off a boundary. */
export const BOUNDARY_RESTITUTION = 0.3;
/** Scrape intensity of a gentle grind; impact speed adds to it. */
export const SCRAPE_BASE_INTENSITY = 0.2;
/** Normal speed that makes any impact full intensity, m/s. */
export const IMPACT_INTENSITY_SPEED = 40;

// Vertical
/** Hover suction pulling the racer onto the road, m/s² on top of gravity. */
export const HOVER_SUCTION = 45;
/** Landings softer than this closing speed cost nothing, m/s: a pod absorbs its own jumps. */
export const LAND_SOFT_IMPACT = 42;
/** Fraction of forward speed lost per m/s of hard landing. */
export const LAND_SPEED_LOSS = 0.005;
/** Damage per m/s of hard landing (before armour). */
export const LAND_DAMAGE = 0.006;
/** How far below a chasm's far edge you can arrive and still land, metres. */
export const LANDING_STEP_TOLERANCE = 1.5;
/** Fraction of the vertical closing speed bounced back down by a ceiling. */
export const CEILING_BOUNCE = 0.3;
/** Damage per m/s of ceiling impact (before armour). */
export const CEILING_DAMAGE = 0.012;
/** Forward speed lost per m/s of ceiling impact. */
export const CEILING_SPEED_LOSS = 0.5;
/** Half-thickness of an arch's span along s: inside it the arch is a ceiling, metres. */
export const ARCH_HALF_DEPTH = 3;

// Obstacles and other racers. Hull is life: damage reaching 1 wrecks the racer for the race.
/** Search distance for obstacles around a racer, metres (exceeds any radius sum). */
export const OBSTACLE_QUERY_RANGE = 30;
/** A hit closer to dead centre than this fraction of the combined radius... */
export const OBSTACLE_WRECK_OFFSET = 0.25;
/** ...above this fraction of top speed is an instant wreck. */
export const OBSTACLE_WRECK_SPEED_FRACTION = 0.6;
/** Hull a full-speed hit costs at its most central (before armour); glancing costs less. */
export const OBSTACLE_DAMAGE = 0.7;
/** Forward speed a hit costs, as a fraction, at its most central. */
export const OBSTACLE_SPEED_LOSS = 0.35;
/** Sideways speed a glancing hit throws the racer off with, m/s. */
export const OBSTACLE_DEFLECT_SPEED = 25;
/** Sideways shove between racers per m/s of closing speed, before mass sharing (m/s). */
export const RACER_SHOVE = 0.3;
/** Smallest shove of any contact, m/s: touching always pushes apart. */
export const RACER_SHOVE_MIN = 4;
/** A shove moves the victim's line this many seconds' worth: a nudge sends it off its line. */
export const RACER_SHOVE_TARGET_TIME = 0.25;
/** Racer contacts closing slower than this do no damage, m/s: rubbing is free, ramming is not. */
export const RACER_DAMAGE_FREE_SPEED = 8;
/** Hull per m/s of closing speed above that in a racer contact (before armour). */
export const RACER_DAMAGE_PER_SPEED = 0.002;
/** Forward speed both racers lose per m/s of a side contact's closing speed: trading paint costs time. */
export const RACER_SCRUB = 0.3;
/** Fraction of the speed difference exchanged in a nose-to-tail bump. */
export const RACER_BUMP_SHARE = 0.3;
/**
 * Two racers must be apart this long, seconds, before their next touch counts as a new hit:
 * a shove, the drivers steering back and touching again is one tussle, not a string of hits.
 */
export const RACER_CONTACT_COOLDOWN = 1;
/** Closing speed that makes a racer contact full intensity, m/s. */
export const RACER_HIT_INTENSITY_SPEED = 30;
/** A flat crossing's junction zone reaches this far past half the other road's width, metres. */
export const CROSSING_MARGIN = 6;
/** Hull a repair cell restores. */
export const REPAIR_VALUE = 0.25;

// Course shapes and hazards
/** Below this speed in the upper half of a loop a racer falls out: a wreck. */
export const LOOP_MIN_SPEED = 75;
/** On an open-edge side the target may go this far past the edge: you can drive off a cliff. */
export const DROP_OVERREACH = 8;
/** A gust drifts the lateral target: m/s of drift per m/s² of push. */
export const GUST_DRIFT = 0.25;
/** On a slick surface (grip < 1) the chase's damping ratio is the grip (below 1: it overshoots). */
export const SLICK_DAMPING_FLOOR = 0.35;

// Boost tank
/** Tank fill at the start of a race: enough for a launch and a first straight. */
export const BOOST_START_FILL = 0.4;
/** Tank refilled per second without collecting anything: a trickle, cells are the real source. */
export const BOOST_PASSIVE_REFILL = 0.015;
/** The trickle pauses for this long after the tank was last used: boost is spent, not leased. */
export const BOOST_REFILL_DELAY = 1.5;
/** A tank run dry boosts again only once it holds this much: no sputtering on the trickle. */
export const BOOST_RESUME_FILL = 0.1;
/** Tank fill one boost cell gives. */
export const CELL_VALUE = 0.1;
/** Pickup radius of a boost cell, metres (added to the racer's radius). */
export const CELL_RADIUS = 3;
/** A cell is collected only by a racer at most this high above the road: jumps fly over. */
export const CELL_MAX_HEIGHT = 6;
/** Free boost from a pad, seconds: a short kick for taking the pad's line, no tank used. */
export const BOOST_PAD_DURATION = 1.2;
/** A pad only works for a racer at most this high above it, metres. */
export const BOOST_PAD_MAX_HEIGHT = 3;

// Presentation hints
/** Visual heading never turns further than this from the track direction, radians. */
export const MAX_VISUAL_YAW = 0.5;
/** Visual lean per m/s of sideways speed, radians. */
export const ROLL_PER_LATERAL_SPEED = 0.012;
/** Largest visual lean (on top of the track bank), radians. */
export const MAX_LEAN = 0.6;

// AI driver (src/core/ai.ts). Skill 0..1 interpolates the *_LO/_HI pairs.
/** Skill is raised to this power before interpolating: early cups beatable, 0.9 still sharp. */
export const AI_SKILL_CURVE = 2.8;
/** Spacing of the AI's look-ahead samples, metres. */
export const AI_SAMPLE_STEP = 10;
/** Racing-line look-ahead in seconds of travel at current speed. */
export const AI_LINE_LOOK_TIME_LO = 0.9;
export const AI_LINE_LOOK_TIME_HI = 1.5;
/** Curvature (1/m) at which the racing line hugs the inside fully. */
export const AI_LINE_FULL_CURVATURE = 1 / 300;
/** Distance the AI's line keeps inside the road edge, metres. */
export const AI_WALL_MARGIN = 3;
/** The AI closes the gap between its target and where it wants it in about this long, s. */
export const AI_TARGET_TIME = 0.08;
/** Obstacle look-ahead in seconds of travel. */
export const AI_OBSTACLE_LOOK_TIME_LO = 0.8;
export const AI_OBSTACLE_LOOK_TIME_HI = 1.5;
/** Steps between path replans (40 Hz at SIM_DT): cheap enough for six AIs on a phone. */
export const AI_PLAN_INTERVAL = 3;
/** How far a replan's line is pulled toward the previous plan (0..1): commitment to a side. */
export const AI_PLAN_STICKINESS = 0.6;
/** Obstacle path planner: longitudinal step, metres. */
export const AI_PLAN_STEP = 5;
/** Obstacle path planner: lateral resolution, metres. */
export const AI_PLAN_LATERAL = 0.5;
/** The planner only considers this far either side of the racer, metres. */
export const AI_PLAN_HALF_SPAN = 30;
/** Lateral metres per metre of travel the planner assumes the racer can swerve, at most. */
export const AI_PLAN_MAX_SLOPE = 0.25;
/**
 * Share of the full steer rate a plan may count on at speed: the AI steers its target in
 * proportion to the error, so it slows as it closes in, and the hull trails the target.
 */
export const AI_PLAN_RATE_SHARE = 0.5;
/** Obstacles block this many seconds of travel in front of and behind them. */
export const AI_OBSTACLE_LEAD_TIME = 0.1;
/** The AI steers around racers it would catch within this many seconds. */
export const AI_RACER_LOOK_TIME = 1.2;
/** Planner cost of a blocked cell; dwarfs any line or swerve cost so blocked means avoid. */
export const AI_PLAN_BLOCK_COST = 1e6;
/** Planner cost of one step inside a blocker's clearance margin, at its edge of contact. */
export const AI_PLAN_CLEARANCE_COST = 300;
/** Planner cost per metre off the racing line per step. */
export const AI_PLAN_LINE_COST = 1;
/** Planner cost per metre of swerve: keeps paths smooth. */
export const AI_PLAN_SWERVE_COST = 2;
/** Planner cost per step spent on sand: slower, so only worth it to get round something. */
export const AI_PLAN_SAND_COST = 40;
/** Response lag the AI plans around: it is committed to its current sideways motion. */
export const AI_PATH_LAG = 0.08;
/** Extra clearance the AI leaves around obstacles, metres. */
export const AI_CLEARANCE_LO = 5;
export const AI_CLEARANCE_HI = 1.6;
/** Fraction of the theoretical cornering limit the AI dares to carry. */
export const AI_CORNER_FACTOR_LO = 0.45;
export const AI_CORNER_FACTOR_HI = 0.95;
/** Braking reaction delay, seconds of travel lost before the AI starts braking. */
export const AI_BRAKE_REACTION_LO = 0.35;
export const AI_BRAKE_REACTION_HI = 0.05;
/** Straight needed before the AI boosts, as a multiple of the braking distance it needs. */
export const AI_BOOST_CAUTION_LO = 8;
export const AI_BOOST_CAUTION_HI = 1;
/** The AI only spends tank on a straight at least this many seconds long: skill saves it. */
export const AI_BOOST_MIN_RUN_LO = 0;
export const AI_BOOST_MIN_RUN_HI = 1.5;
/** The AI swerves for a boost cell lying within this of its line, metres. */
export const AI_CELL_DETOUR_LO = 2;
export const AI_CELL_DETOUR_HI = 14;
/** Seconds between the AI seeing where to be and steering for it: humans react late too. */
export const AI_REACTION_LO = 0.3;
export const AI_REACTION_HI = 0;
/** Wander of the AI's target at skill 0 (scaled by 1 - skill), metres. */
export const AI_TARGET_NOISE = 4;
/** Correlation time of the target wander, seconds. */
export const AI_NOISE_TAU = 0.5;
/** Lapses per second at skill 0 (scaled by (1 - skill)²): hands off, obstacles unseen. */
export const AI_MISTAKE_RATE = 0.3;
/** Length of a lapse, seconds. */
export const AI_MISTAKE_DURATION = 0.6;
/** Approaching a jump below this multiple of its minimum clearing speed, the AI won't brake. */
export const AI_JUMP_SPEED_MARGIN = 1.3;
/** Chance per race start that an AI nails the launch boost, at skill 1. */
export const AI_START_BOOST_CHANCE = 0.8;
/** Chance an AI of skill 0 false-starts (it falls with the square of the missing skill). */
export const AI_FALSE_START_CHANCE = 0.25;
/** The AI detours to a boost pad when it lies within this of its line, metres. */
export const AI_PAD_DETOUR = 7;
/** An AI keeps this far from an open edge, metres (novices give cliffs a wide berth). */
export const AI_DROP_MARGIN_LO = 6;
export const AI_DROP_MARGIN_HI = 2;
/** With a loop's top this close ahead the AI won't brake and boosts: stalling there is a wreck. */
export const AI_LOOP_LOOK = 500;
/** The AI keeps clear of where a hazard will be this many seconds either side of its arrival. */
export const AI_HAZARD_TIME_MARGIN = 0.3;
/** Hull damage at which an AI starts going for repair cells. */
export const AI_REPAIR_WANT = 0.35;
/** It swerves for a repair cell within this of its line, metres. */
export const AI_REPAIR_DETOUR = 20;
/** AIs at or above this skill steer around rivals; below it they bump and barge. */
export const AI_AVOID_RACERS_SKILL = 0.5;
/** How far toward a rival's line an AI tucks in to draft it (0..1 of the offset): aces ride wakes. */
export const AI_DRAFT_TUCK_LO = 0;
export const AI_DRAFT_TUCK_HI = 1;
/** Only on a straight: no bend sharper than this (1/m) within AI_DRAFT_STRAIGHT_TIME of travel. */
export const AI_DRAFT_MAX_CURVATURE = 1 / 1200;
export const AI_DRAFT_STRAIGHT_TIME = 1.5;
/** An AI only moves over for a wake this far across from where it is, metres. */
export const AI_DRAFT_CATCH = 8;
/** Never sits in line closer than this, metres bumper to bumper (at least DRAFT_MIN_GAP): a rear-end costs hull. */
export const AI_DRAFT_TUCK_MIN_GAP = 6;
/** In line and due to reach that gap within this many seconds, it pulls out to pass. */
export const AI_DRAFT_PASS_TIME = 1.5;
/** Room it leaves beside the rival it passes, metres beyond touching; the lane must be free of others too. */
export const AI_DRAFT_PASS_CLEARANCE = 1.5;
/**
 * How fast tucking in and pulling out move the AI sideways, m/s: under a racer contact's
 * damage-free closing speed (RACER_DAMAGE_FREE_SPEED), so a pull-out that does touch a rival
 * rubs rather than rams.
 */
export const AI_DRAFT_SHIFT_RATE = 6;
/** Arrival-time window (s) inside which an AI yields to cross traffic at a flat crossing. */
export const AI_CROSSING_WINDOW_LO = 0;
export const AI_CROSSING_WINDOW_HI = 0.7;
/** Chance per lap that an AI takes a shortcut it comes to. */
export const AI_SHORTCUT_LO = 0;
export const AI_SHORTCUT_HI = 0.8;
/** The AI decides on a shortcut and lines up for it this many seconds before its entry. */
export const AI_SHORTCUT_LOOK_TIME = 2;
/**
 * An AI skips a shortcut once its hull damage reaches this: rookies gamble on a battered hull
 * (and can wreck in the rough), aces keep a margin for a flat-out mistake.
 */
export const AI_SHORTCUT_HULL_LO = 0.8;
export const AI_SHORTCUT_HULL_HI = 0.5;
/**
 * The share of top speed an AI lifts to on rough ground. Aces sit just over the safe speed
 * (ROUGH_SAFE_SPEED, a scratch of hull); rookies stay quicker and pay for it.
 */
export const AI_ROUGH_LIFT_LO = 0.9;
export const AI_ROUGH_LIFT_HI = 0.73;
/** Chance, times (1 − skill)², that an AI charges a shortcut's rough ground without lifting. */
export const AI_ROUGH_RECKLESS = 0.35;

// --- Shortcuts (src/core/track.ts) ---
/** Length of the side-by-side run where a branch leaves or rejoins the main road. */
export const BRANCH_JUNCTION_LENGTH = 60;
/** Distance over which the main loop's run-off narrows to meet a branch junction and widens after it. */
export const BRANCH_EDGE_FADE = 150;

// --- Rough ground (the 'rough' feature; src/core/vehicle.ts) ---
// Rough ground is what makes a shortcut a trade-off rather than a free cut: flat out it costs a
// third of a stock hull, lifted through it costs time instead.
/** A rough stretch ramps up over this many metres at each end, so its damage never steps. */
export const ROUGH_BLEND = 20;
/**
 * Up to this share of the glider's (unboosted, undamaged) top speed, rough ground does no
 * damage: lifting off to it is the safe way through, and costs a real slice of the saving.
 */
export const ROUGH_SAFE_SPEED = 0.7;
/**
 * Hull per second (before armour, at amount 1) at full top speed: a third of a stock hull for
 * 250 m of rubble taken flat out. The rate grows with the speed above the safe speed
 * (normalised so top speed = 1) to the power ROUGH_DAMAGE_EXP, so boosting through costs
 * several times what holding top speed does, and lifting most of the way costs little.
 */
export const ROUGH_DAMAGE = 0.2;
/** Steepness of the damage curve: a 25% boost on top of top speed costs about 2.5× the hull. */
export const ROUGH_DAMAGE_EXP = 1.5;
/** Jolts (sideways kicks) per second at full top speed on amount 1; more when faster. */
export const ROUGH_JOLT_RATE = 3;
/** Sideways speed a full-strength jolt kicks the craft with, m/s: enough to need a correction. */
export const ROUGH_JOLT_SPEED = 7;
/** Normalised overspeed at which a jolt is at full strength (about boosting at top speed). */
export const ROUGH_JOLT_FULL = 2;

// --- Hazards (src/core/hazards.ts) ---
/** Seconds between successive objects of one dropper landing. */
export const HAZARD_DROP_STAGGER = 0.5;
/** A dropped object's height as a multiple of its radius. */
export const HAZARD_ROCK_HEIGHT = 1.6;
/** A blocker's bar is made of cylinders this big, this far apart across the course. */
export const HAZARD_BAR_RADIUS = 2.2;
export const HAZARD_BAR_SPACING = 3.5;
/** A slick stretch blends its grip in over this fraction (inverse) of its length at each end. */
export const SLICK_BLEND_FRACTION = 8;
/** Least height difference between the two roads at a 'bridge' crossing, metres. */
export const CROSSING_BRIDGE_CLEARANCE = 14;
