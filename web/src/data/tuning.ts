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
/** Free boost for holding boost exactly at GO: a reward for timing, not for holding early. */
export const START_BOOST_DURATION = 0.9;
/** How long the field may keep racing after the player finishes, seconds. */
export const FINISH_GRACE = 20;
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
/** Top speed multiplier while overheated. */
export const OVERHEAT_TOP_SPEED = 0.85;

// Steering and slide
/** How fast applied steer follows the input, per second: removes touch-input jitter. */
export const STEER_SLEW = 8;
/** Fraction of steering authority lost at STEER_FADE_SPEED: high speed is twitchy enough. */
export const STEER_SPEED_FADE = 0.5;
export const STEER_FADE_SPEED = 250;
/** Air brake multiplies steering authority: the brake-drift into hairpins. */
export const BRAKE_TURN_MULT = 1.7;
/** Weak pull of the nose back toward the track direction, 1/s; small so you must steer. */
export const YAW_SELF_CENTER = 0.4;
/** The nose never points further than this from the track direction, radians. */
export const MAX_YAW = 0.7;
/** Frenet denominator floor: keeps ds/dt finite on the inside of very tight turns. */
export const FRENET_MIN_DENOM = 0.3;
/** Steering authority kept in the air: pods correct mid-air, just less. */
export const AIR_STEER_FACTOR = 0.45;
/** Fraction of a steering rotation the momentum does not follow at once (becomes slide). */
export const SLIDE_INHERIT = 0.35;
/** Braking loosens the rear: more slide while the brake is held. */
export const BRAKE_SLIDE_MULT = 1.4;
/** Slide damping per unit grip, 1/s. */
export const GRIP_DAMP = 10;
/** Fraction of grip damping that works in the air. */
export const AIR_GRIP_FACTOR = 0.15;
/** Sliding scrubs forward speed: m/s² per m/s of slide. */
export const SLIDE_SCRUB = 0.35;

// Walls
/** Forward speed lost per m/s of speed into the wall. */
export const WALL_IMPACT_SPEED_LOSS = 0.9;
/** Grinding along a wall, m/s². Punishing but not race-ending. */
export const WALL_FRICTION_DECEL = 35;
/** Wall impacts below this normal speed do no damage, m/s. */
export const WALL_DAMAGE_FREE_SPEED = 6;
/** Damage per m/s of normal speed above the free speed (before armour). */
export const WALL_DAMAGE_PER_SPEED = 0.011;
/** On impact the nose is turned away by this fraction of its angle into the wall. */
export const WALL_YAW_REFLECT = 0.3;
/** Fraction of the normal speed bounced back off the wall. */
export const WALL_RESTITUTION = 0.25;
/** Scrape intensity of a gentle grind; impact speed adds to it. */
export const SCRAPE_BASE_INTENSITY = 0.2;
/** Normal speed that makes any impact full intensity, m/s. */
export const IMPACT_INTENSITY_SPEED = 40;

// Vertical
/** Hover suction pulling the racer onto the road, m/s² on top of gravity. */
export const HOVER_SUCTION = 45;
/** Landings softer than this closing speed cost nothing, m/s: a pod absorbs its own jumps. */
export const LAND_SOFT_IMPACT = 40;
/** Fraction of forward speed lost per m/s of hard landing. */
export const LAND_SPEED_LOSS = 0.005;
/** Damage per m/s of hard landing (before armour). */
export const LAND_DAMAGE = 0.01;
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

// Obstacles and other racers
/** Search distance for obstacles around a racer, metres (exceeds any radius sum). */
export const OBSTACLE_QUERY_RANGE = 30;
/** Fraction of velocity into an obstacle above which the hit is "dead-on". */
export const OBSTACLE_CRASH_HEADON = 0.7;
/** A dead-on hit above this fraction of top speed is a crash. */
export const OBSTACLE_CRASH_SPEED_FRACTION = 0.6;
/** Forward speed lost per m/s of speed into an obstacle. */
export const OBSTACLE_SPEED_LOSS = 1.0;
/** Damage per m/s of speed into an obstacle (before armour). */
export const OBSTACLE_DAMAGE_PER_SPEED = 0.006;
/** Fraction of the normal speed bounced back off an obstacle. */
export const OBSTACLE_RESTITUTION = 0.2;
/** Lateral separation acceleration per metre of overlap between racers, 1/s². Soft on purpose. */
export const RACER_PUSH_RATE = 60;
/** Fraction of the speed difference exchanged in a nose-to-tail bump. */
export const RACER_BUMP_SHARE = 0.3;
/** Racer contacts are mild: opponents are secondary to the track. */
export const RACER_HIT_INTENSITY = 0.15;

// Crash and respawn
/** Seconds a crashed racer is out before respawning. */
export const RESPAWN_DELAY = 1.7;
/** Respawn this far behind the crash point, metres. */
export const RESPAWN_BACKOFF = 30;
/** Respawns near a jump move this far before its ramp, so there is room to reach speed. */
export const RESPAWN_JUMP_RUNUP = 250;
/** Speed after respawning, as a fraction of top speed. */
export const RESPAWN_SPEED_FRACTION = 0.6;
/** Damage after respawning is at most this. */
export const RESPAWN_DAMAGE = 0.3;
/** Seconds after respawning during which obstacles and racers pass through you. */
export const RESPAWN_INVULNERABLE = 1.5;

// Boost and heat
/** Heat gained per second of boost (heat is 0..1). */
export const BOOST_HEAT_RATE = 0.3;
/** Forced cool-down after overheating, seconds. */
export const OVERHEAT_DURATION = 3;
/** Free boost from a pad, seconds. */
export const BOOST_PAD_DURATION = 1.2;
/** A pad only works for a racer at most this high above it, metres. */
export const BOOST_PAD_MAX_HEIGHT = 3;

// Presentation hints
/** Visual lean per unit of applied steer, radians. */
export const ROLL_PER_STEER = 0.45;
/** Extra visual lean per m/s of slide, radians. */
export const ROLL_PER_SLIDE = 0.012;

// AI driver (src/core/ai.ts). Skill 0..1 interpolates the *_LO/_HI pairs.
/** Spacing of the AI's look-ahead samples, metres. */
export const AI_SAMPLE_STEP = 10;
/** Racing-line look-ahead in seconds of travel at current speed. */
export const AI_LINE_LOOK_TIME_LO = 0.9;
export const AI_LINE_LOOK_TIME_HI = 1.5;
/** Curvature (1/m) at which the racing line hugs the inside fully. */
export const AI_LINE_FULL_CURVATURE = 1 / 300;
/** Distance the AI's line keeps from the walls, metres. */
export const AI_WALL_MARGIN = 3;
/** Lateral position gain: how hard the AI closes on its target line, 1/s. */
export const AI_POS_GAIN = 1.6;
/** Heading gain of the steering controller, 1/s. */
export const AI_YAW_GAIN = 7;
/** The AI never asks for more heading than this off the track direction, radians. */
export const AI_MAX_YAW = 0.35;
/** Obstacle look-ahead in seconds of travel. */
export const AI_OBSTACLE_LOOK_TIME_LO = 0.8;
export const AI_OBSTACLE_LOOK_TIME_HI = 1.5;
/** Obstacle path planner: longitudinal step, metres. */
export const AI_PLAN_STEP = 5;
/** Obstacle path planner: lateral resolution, metres. */
export const AI_PLAN_LATERAL = 0.5;
/** Lateral metres per metre of travel the planner assumes the racer can swerve. */
export const AI_PLAN_MAX_SLOPE = 0.2;
/** Obstacles block this many seconds of travel in front of them, so dodges start early. */
export const AI_OBSTACLE_LEAD_TIME = 0.15;
/** The AI steers around racers it would catch within this many seconds. */
export const AI_RACER_LOOK_TIME = 1.2;
/** Planner cost of a blocked cell; dwarfs any line or swerve cost so blocked means avoid. */
export const AI_PLAN_BLOCK_COST = 1e6;
/** Planner cost per metre off the racing line per step. */
export const AI_PLAN_LINE_COST = 1;
/** Planner cost per metre of swerve: keeps paths smooth. */
export const AI_PLAN_SWERVE_COST = 2;
/** Response lag of steering + slide the AI plans around: it plans from where it will be. */
export const AI_PATH_LAG = 0.15;
/** The AI holds the planned path's mean heading over this many seconds of travel. */
export const AI_PATH_WINDOW = 0.1;
/** Extra clearance the AI leaves around obstacles, metres. */
export const AI_CLEARANCE_LO = 2.5;
export const AI_CLEARANCE_HI = 1.2;
/** Fraction of the theoretical cornering limit the AI dares to carry. */
export const AI_CORNER_FACTOR_LO = 0.75;
export const AI_CORNER_FACTOR_HI = 0.97;
/** Braking reaction delay, seconds of travel lost before the AI starts braking. */
export const AI_BRAKE_REACTION_LO = 0.35;
export const AI_BRAKE_REACTION_HI = 0.05;
/** Heat at which the AI stops boosting. */
export const AI_HEAT_LIMIT_LO = 0.75;
export const AI_HEAT_LIMIT_HI = 0.93;
/** The AI resumes boosting once heat has fallen this far below its limit. */
export const AI_HEAT_HYSTERESIS = 0.35;
/** Steering noise amplitude at skill 0 (scaled by 1 - skill). */
export const AI_STEER_NOISE = 0.35;
/** Correlation time of the steering noise, seconds. */
export const AI_NOISE_TAU = 0.5;
/** Lapses per second at skill 0 (scaled by (1 - skill)²): the AI ignores an obstacle. */
export const AI_MISTAKE_RATE = 0.12;
/** Length of a lapse, seconds. */
export const AI_MISTAKE_DURATION = 0.7;
/** Approaching a jump below this multiple of its minimum clearing speed, the AI won't brake. */
export const AI_JUMP_SPEED_MARGIN = 1.3;
/** Chance per race start that an AI nails the launch boost, at skill 1. */
export const AI_START_BOOST_CHANCE = 0.8;
/** The AI detours to a boost pad when it lies within this of its line, metres. */
export const AI_PAD_DETOUR = 7;
/** Chance at skill 0 (scaled by 1 - skill) that an AI ignores its heat limit this race. */
export const AI_OVERHEAT_GAMBLE = 0.6;
