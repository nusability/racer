// Physics checks on synthetic stretches of road, driven by nothing but the real Vehicle: what
// air steering allows, and what a fall off the course ends in. Each prints its numbers and
// reports a failure through the caller's `fail`.

import { racerById } from '../src/data/racers.ts';
import { effectiveStats, noUpgrades } from '../src/data/upgrades.ts';
import { Track } from '../src/core/track.ts';
import { Vehicle, type CrashReason } from '../src/core/vehicle.ts';
import { Race } from '../src/core/race.ts';
import { cornerLimit, steerRate } from '../src/core/handling.ts';
import { BOUNDARY_RESTITUTION, CORNER_PULL, DROP_DEPTH, GRIP_REF, GRAVITY, HANDLING_REF, LATERAL_RESPONSE, RACER_HALF_WIDTH, SIM_DT, TARGET_OVERREACH, VOID_LOST_DEPTH } from '../src/data/tuning.ts';
import type { FloorKind, PlayerInput, RaceEntrant, RaceEvent, TrackDef } from '../src/core/types.ts';
import { layoutCharacter } from './layout-character.ts';
import { WIDE_JUMP_AT, WIDE_JUMP_RAMP, WIDE_JUMP_TAKEOFF, simDraftOval, simLayout, simWideJump } from './sim-test-track.ts';

type Fail = (msg: string) => void;

const STARTER = 'dustwing';
const SEED = 9090;
const IDLE: PlayerInput = { steer: 0, nudge: 0, brake: false, boost: false };

/** Where on the oval's first straight (params 1..3, 1000..3000 m) the checks run, metres along s. */
const CHECK_S = 1200;

function starter() {
  return effectiveStats(racerById(STARTER), noUpgrades());
}

/** The draft oval with its first straight given extra features and a floor. */
function oval(id: string, floor: FloorKind, features: TrackDef['features'], y = 0): Track {
  return new Track({ ...simDraftOval, id, floor, points: simDraftOval.points.map((p) => ({ ...p, y })), features });
}

// --- Air steering: a pod in the air lines up its landing, it can't swerve ---------------------

/** Seconds of full input the air-steering check holds. */
const AIR_CHECK_TIME = 0.5;
/** Height the craft is put in the air at, metres: high enough not to land within the check. */
const AIR_CHECK_HEIGHT = 30;
/** In the air, full steer (or the same drag) may move the craft at most this share of what it does on the road. */
const AIR_CHECK_MAX_SHARE = 0.2;
/** ...and still at least this share: a pilot can line up a landing. */
const AIR_CHECK_MIN_SHARE = 0.03;
/** The drag each step in the nudge run, metres: about a quick thumb. */
const AIR_CHECK_NUDGE = 0.3;

/** Sideways metres moved in AIR_CHECK_TIME of `input` from a standing start at top speed, on the road or in the air. */
function sideways(track: Track, input: PlayerInput, air: boolean): number {
  const stats = starter();
  const v = new Vehicle('air', stats, track, CHECK_S, 0, 0, SEED);
  v.state.speed = stats.topSpeed;
  if (air) {
    v.grounded = false;
    v.alt = track.elevationAt(CHECK_S) + AIR_CHECK_HEIGHT;
  }
  const events: RaceEvent[] = [];
  for (let t = 0; t < AIR_CHECK_TIME; t += SIM_DT) v.step(input, track, [], t, events);
  if (air && !v.state.airborne) throw new Error('air steering check: the craft landed during the check');
  return Math.abs(v.state.x);
}

function airSteerCheck(fail: Fail) {
  const track = oval('simair', 'ground', []);
  const steer: PlayerInput = { ...IDLE, steer: 1 };
  const drag: PlayerInput = { ...IDLE, nudge: AIR_CHECK_NUDGE };
  const keys = sideways(track, steer, true) / sideways(track, steer, false);
  const thumb = sideways(track, drag, true) / sideways(track, drag, false);
  console.log(`\nair steering (${AIR_CHECK_TIME} s of full input, stock starter): keys ${(keys * 100).toFixed(0)}% of the road's sideways move, drag ${(thumb * 100).toFixed(0)}%`);
  for (const [what, share] of [['steer', keys], ['drag', thumb]] as const) {
    if (share > AIR_CHECK_MAX_SHARE) fail(`air steering: ${what} in the air moves ${(share * 100).toFixed(0)}% as far as on the road (> ${AIR_CHECK_MAX_SHARE * 100}%)`);
    if (share < AIR_CHECK_MIN_SHARE) fail(`air steering: ${what} in the air moves only ${(share * 100).toFixed(0)}% as far as on the road: no way to line up a landing`);
  }
}

// --- Falls: off an open edge you fall until you hit something -----------------------------------

/** The stretch of the straight with an open edge on the right, params. */
const DROP_FROM = 1.2;
const DROP_TO = 1.8;
/** A road this high over the sea, metres: a fall into water is short. */
const SEA_ROAD = 12;
/** A fall's impact must come within this of the floor it hit, metres (one step of fall at most). */
const FALL_HIT_TOLERANCE = 3;
/** The measured time to impact may differ from the free-fall estimate by this share (the edge is crossed sideways, not dropped from). */
const FALL_TIME_TOLERANCE = 0.25;

interface Fall {
  reason: CrashReason | null;
  /** Seconds from going over the edge to the wreck. */
  seconds: number;
  /** Height above the floor it wrecked at (the floor itself over ground and sea; the road over the void). */
  altAtWreck: number;
  /** It wrecked while still on the road's level or above (the old instant wreck at the edge). */
  atTheEdge: boolean;
}

/** A starter at top speed steered hard off the right-hand open edge, until it wrecks. */
function driveOff(track: Track): Fall {
  const stats = starter();
  const v = new Vehicle('fall', stats, track, track.paramToS(DROP_FROM) + 50, 0, 0, SEED);
  v.state.speed = stats.topSpeed;
  const st = v.state;
  let over = -1;
  let t = 0;
  for (; st.crashed <= 0 && t < 10; t += SIM_DT) {
    v.step({ ...IDLE, steer: 1 }, track, [], t, []);
    if (over < 0 && st.x > track.maxXAt(st.s)) over = t;
  }
  const crashes = v.drive.crashes;
  const reason = (Object.keys(crashes) as CrashReason[]).find((k) => crashes[k] > 0) ?? null;
  const floor = track.floorAt(st.s);
  const surface = track.elevationAt(st.s);
  return {
    reason,
    seconds: over < 0 ? NaN : t - over,
    altAtWreck: v.alt - (Number.isFinite(floor) ? floor : surface),
    atTheEdge: v.alt >= surface - FALL_HIT_TOLERANCE,
  };
}

function fallCheck(fail: Fail) {
  const drop: TrackDef['features'] = [{ kind: 'drop', from: DROP_FROM, to: DROP_TO, side: 1 }];
  const cases: { floor: FloorKind; y: number; reason: CrashReason; depth: number }[] = [
    { floor: 'ground', y: 0, reason: 'offEdge', depth: DROP_DEPTH },
    { floor: 'water', y: SEA_ROAD, reason: 'splash', depth: SEA_ROAD },
    { floor: 'void', y: 0, reason: 'lost', depth: VOID_LOST_DEPTH },
  ];
  const parts: string[] = [];
  for (const c of cases) {
    const f = driveOff(oval(`simfall-${c.floor}`, c.floor, drop, c.y));
    const expected = Math.sqrt((2 * c.depth) / GRAVITY);
    parts.push(`${c.floor}: ${f.reason ?? 'no wreck'} after ${f.seconds.toFixed(2)} s (free fall ${expected.toFixed(2)} s)`);
    if (f.reason !== c.reason) fail(`falls: off an open edge over ${c.floor} ended in ${f.reason ?? 'no wreck'}, not ${c.reason}`);
    if (f.atTheEdge) fail(`falls: over ${c.floor} the craft wrecked at the edge, not where it hit`);
    if (!(Math.abs(f.seconds - expected) <= expected * FALL_TIME_TOLERANCE)) fail(`falls: over ${c.floor} it fell for ${f.seconds.toFixed(2)} s, not about ${expected.toFixed(2)} s`);
    if (c.floor !== 'void' && Math.abs(f.altAtWreck) > FALL_HIT_TOLERANCE) fail(`falls: over ${c.floor} it wrecked ${f.altAtWreck.toFixed(1)} m from the floor`);
  }
  console.log(`\nfalls (stock starter steered off an open edge at top speed): ${parts.join('; ')}`);
}

// --- A wide jump: flying out past a narrow lip's edge, landing on a wide road ---------------------

/** Where the craft is set going: on the lip's edge, sliding out at this sideways speed, m/s. */
const WIDE_START_X = 7.5;
const WIDE_START_VX = 14;
/** ...aiming for this lateral offset: past the lip's edge, inside the landing's. */
const WIDE_TARGET_X = 12;
/** Metres before the lip it is set going: one step at top speed. */
const WIDE_START_BACK = 1;

function wideJumpCheck(fail: Fail) {
  const track = new Track(simWideJump);
  const lip = track.paramToS(WIDE_JUMP_AT) + WIDE_JUMP_RAMP;
  if (!(WIDE_TARGET_X > WIDE_JUMP_TAKEOFF / 2 && WIDE_TARGET_X < track.widthAt(lip + WIDE_JUMP_RAMP * 2) / 2)) throw new Error('wide jump check: its target is not between the lip\'s edge and the landing\'s');
  const stats = starter();
  const v = new Vehicle('wide', stats, track, lip - WIDE_START_BACK, WIDE_START_X, 0, SEED);
  const st = v.state;
  st.speed = stats.topSpeed;
  st.vx = WIDE_START_VX;
  v.targetX = WIDE_TARGET_X;
  v.alt = track.elevationAt(st.s);
  let widest = 0;
  let landed = false;
  for (let t = 0; t < 3 && st.crashed <= 0 && !landed; t += SIM_DT) {
    const events: RaceEvent[] = [];
    v.step(IDLE, track, [], t, events);
    if (st.airborne) widest = Math.max(widest, st.x - track.maxXAt(st.s));
    landed = events.some((e) => e.type === 'land');
  }
  const crashes = v.drive.crashes;
  const reason = (Object.keys(crashes) as CrashReason[]).find((k) => crashes[k] > 0) ?? null;
  console.log(`\nwide jump (narrow lip, wide landing, open both sides): flew ${widest.toFixed(1)} m past the edge beside it; ${landed ? `landed at x=${st.x.toFixed(1)}` : `no landing (${reason ?? 'still flying'})`}`);
  if (widest <= 0) fail('wide jump: the check never flew past the lip\'s edge');
  if (!landed || reason !== null) fail(`wide jump: a racer coming down over the landing road ${reason ? `wrecked (${reason})` : 'did not land'}`);
}

// --- Fragility: walls and rivals break a glider, a brush is cheap ---------------------------------

/** Sideways speeds a starter is put into the wall at, m/s: a brush, a nudge, a swipe, a slam. */
const WALL_HITS = [5, 10, 20, 30, 45];
/** Rivals side by side closing at these speeds, m/s. */
const RACER_HITS = [4, 10, 20, 30];
/** A slam (30 m/s sideways) costs at least this share of a stock hull; a brush (5 m/s) at most this. */
const SLAM_MIN = 0.25;
const BRUSH_MAX = 0.01;
/** A second of scraping along a wall at top speed costs at least this much hull. */
const GRIND_MIN = 0.06;
/** Two rivals swiping at 20 m/s cost each at least this much hull; rubbing at 4 m/s nothing. */
const SWIPE_MIN = 0.08;
/** Doubled armour must halve a hit to within this fraction. */
const ARMOUR_TOLERANCE = 0.05;

/**
 * Hull a stock starter (armour `armor`) loses hitting the oval's right-hand wall at `vn` m/s
 * sideways at top speed: put half a step out from the wall, with its target just past the wall
 * (as close as it may get) and a sideways speed that the chase toward it leaves at exactly vn.
 */
function wallHit(vn: number, armor: number): number {
  const track = new Track(simDraftOval);
  const stats = { ...starter(), armor };
  const lineX = track.maxXAt(CHECK_S) - RACER_HALF_WIDTH;
  const v = new Vehicle('wall', stats, track, CHECK_S, lineX - vn * SIM_DT * 0.5, 0, SEED);
  v.state.speed = stats.topSpeed;
  v.targetX = lineX + TARGET_OVERREACH;
  // One step of the critically damped chase: vx' = vx + (w²·d − 2w·vx)·dt, solved for vx' = vn.
  const w = LATERAL_RESPONSE * (stats.handling / HANDLING_REF);
  const d = v.targetX - v.state.x;
  v.state.vx = (vn - w * w * d * SIM_DT) / (1 - 2 * w * SIM_DT);
  v.step(IDLE, track, [], 0, []);
  const hit = Math.abs(v.state.vx) / BOUNDARY_RESTITUTION;
  if (Math.abs(hit - vn) > 0.01) throw new Error(`fragility check: meant a ${vn} m/s wall hit, got ${hit.toFixed(2)}`);
  return v.state.damage;
}

/** Hull lost holding a stock starter against the wall for a second at top speed (no impact). */
function grindSecond(): number {
  const track = new Track(simDraftOval);
  const stats = starter();
  const v = new Vehicle('grind', stats, track, CHECK_S, track.maxXAt(CHECK_S) - RACER_HALF_WIDTH, 0, SEED);
  v.state.speed = stats.topSpeed;
  v.targetX = track.maxXAt(CHECK_S);
  for (let t = 0; t < 1; t += SIM_DT) {
    v.step(IDLE, track, [], t, []);
    v.state.speed = stats.topSpeed;
  }
  return v.state.damage;
}

/** Hull each of two stock starters loses touching side by side, closing at `closing` m/s. */
function racerHit(closing: number): number {
  const track = new Track(simDraftOval);
  const stats = starter();
  const entrant = (i: number): RaceEntrant => ({ id: `r${i}`, name: `r${i}`, racerId: STARTER, stats, isPlayer: false, skill: 1 });
  const race = new Race(track, { laps: 1, seed: SEED, entrants: [entrant(0), entrant(1)] });
  race.phase = 'racing';
  race.vehicles.forEach((v, i) => {
    const side = i === 0 ? -1 : 1;
    v.state.s = CHECK_S;
    v.state.speed = stats.topSpeed;
    // Just apart, each moving in at half the closing speed: they touch in the first step.
    v.state.x = side * (RACER_HALF_WIDTH + (closing * SIM_DT) / 4);
    v.state.vx = (-side * closing) / 2;
    v.targetX = v.state.x - (side * closing) / (LATERAL_RESPONSE * (stats.handling / HANDLING_REF));
  });
  race.step(IDLE);
  return Math.max(...race.racers.map((r) => r.damage));
}

function fragilityCheck(fail: Fail) {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const walls = WALL_HITS.map((vn) => ({ vn, hull: wallHit(vn, 1) }));
  const racers = RACER_HITS.map((c) => ({ c, hull: racerHit(c) }));
  const grind = grindSecond();
  const slam = wallHit(30, 1);
  const armoured = wallHit(30, 2);
  console.log(
    `
fragility (stock starter, hull per hit): walls ${walls.map((w) => `${w.vn} m/s ${pct(w.hull)}`).join(', ')}; ` +
      `scraping a wall at top speed ${pct(grind)}/s; rivals side by side ${racers.map((r) => `${r.c} m/s ${pct(r.hull)}`).join(', ')}; armour 2 at 30 m/s ${pct(armoured)}`,
  );
  if (slam < SLAM_MIN) fail(`fragility: a 30 m/s wall slam costs only ${pct(slam)} (< ${pct(SLAM_MIN)})`);
  if (wallHit(5, 1) > BRUSH_MAX) fail(`fragility: brushing a wall at 5 m/s costs ${pct(wallHit(5, 1))} (> ${pct(BRUSH_MAX)})`);
  if (grind < GRIND_MIN) fail(`fragility: a second of scraping at top speed costs only ${pct(grind)} (< ${pct(GRIND_MIN)})`);
  if (racerHit(20) < SWIPE_MIN) fail(`fragility: a 20 m/s swipe between rivals costs only ${pct(racerHit(20))} (< ${pct(SWIPE_MIN)})`);
  if (racerHit(4) > 0) fail(`fragility: rubbing at 4 m/s costs ${pct(racerHit(4))}`);
  if (Math.abs(armoured * 2 - slam) > slam * ARMOUR_TOLERANCE) fail(`fragility: armour 2 took ${pct(armoured)} of a slam that costs ${pct(slam)}`);
  for (let i = 1; i < walls.length; i++) {
    if (!(walls[i].hull > walls[i - 1].hull)) fail(`fragility: a ${walls[i].vn} m/s wall hit costs no more than a ${walls[i - 1].vn} m/s one`);
  }
}

// --- Crests and dips: the road's vertical curve sets how hard it presses the craft on ----------

/** Rolling ground laid over the oval's far turn (params 4..6, a ~600 m radius). */
const ROLL_FROM = 4.1;
const ROLL_TO = 5.9;
const ROLL_AMPLITUDE = 2;
const ROLL_WAVELENGTH = 200;
/** Seconds the craft is let drift with no input. */
const ROLL_DRIFT_TIME = 0.1;
/** Over the crest the turn must carry it at least this many times as far wide as on the flat... */
const CREST_DRIFT_MIN = 1.6;
/** ...and in the dip at most this share of it. */
const DIP_DRIFT_MAX = 0.8;
/** A bend this tight, metres, for the cornering-limit comparison. */
const LIMIT_RADIUS = 100;

/** How far wide a stock starter at top speed drifts (its lateral target) in ROLL_DRIFT_TIME from sample k, hands off. */
function driftFrom(track: Track, s: number): number {
  const stats = starter();
  const v = new Vehicle('roll', stats, track, s, 0, 0, SEED);
  v.state.speed = stats.topSpeed;
  v.state.vy = track.slopeAt(s) * stats.topSpeed;
  for (let t = 0; t < ROLL_DRIFT_TIME; t += SIM_DT) v.step(IDLE, track, [], t, []);
  if (v.state.airborne) throw new Error('crest check: the craft took off');
  return Math.abs(v.targetX);
}

function crestCheck(fail: Fail) {
  const flat = new Track(simDraftOval);
  const rolling = new Track({ ...simDraftOval, id: 'simroll', features: [{ kind: 'dunes', from: ROLL_FROM, to: ROLL_TO, amplitude: ROLL_AMPLITUDE, wavelength: ROLL_WAVELENGTH }] });
  // The sharpest crest and the deepest dip in the middle of the rolling turn.
  const mid = rolling.samples.filter((p) => p.s > rolling.paramToS(4.6) && p.s < rolling.paramToS(5.4));
  const crest = mid.reduce((a, b) => (b.vcurve < a.vcurve ? b : a));
  const dip = mid.reduce((a, b) => (b.vcurve > a.vcurve ? b : a));
  const base = driftFrom(flat, crest.s);
  const overCrest = driftFrom(rolling, crest.s) / base;
  const inDip = driftFrom(rolling, dip.s) / driftFrom(flat, dip.s);
  console.log(`\ncrests (stock starter at top speed in a 600 m turn, ${ROLL_AMPLITUDE} m rollers): drifts wide ${overCrest.toFixed(2)}x as far over a crest, ${inDip.toFixed(2)}x in a dip`);
  if (overCrest < CREST_DRIFT_MIN) fail(`crests: over a crest the turn carries the craft only ${overCrest.toFixed(2)}x as far wide (< ${CREST_DRIFT_MIN}x)`);
  if (inDip > DIP_DRIFT_MAX) fail(`crests: in a dip the turn carries the craft ${inDip.toFixed(2)}x as far wide (> ${DIP_DRIFT_MAX}x)`);
  // The AI plans its corners with the same grip: a 100 m bend's limit over that crest and dip.
  const stats = starter();
  const budget = (steerRate(stats) * stats.grip) / (CORNER_PULL * GRIP_REF);
  const [onCrest, onFlat, onDip] = [crest.vcurve, 0, dip.vcurve].map((c) => cornerLimit(1 / LIMIT_RADIUS, budget, c));
  console.log(`  cornering limit of a ${LIMIT_RADIUS} m bend at its limit of drift: ${onCrest.toFixed(0)} m/s over the crest, ${onFlat.toFixed(0)} flat, ${onDip.toFixed(0)} in the dip`);
  if (!(onCrest < onFlat && onFlat < onDip)) fail('crests: the cornering limit the AI plans with ignores crests and dips');
}

/** The layout character report finds what the authoring helpers laid: a chicane and a crest before a bend. */
function layoutCheck(fail: Fail) {
  const track = new Track(simLayout);
  const c = layoutCharacter(track, track.raceLength, false);
  console.log(`\nlayout character (simlayout): ${c.chicanes} chicane(s), ${c.crestsBeforeCorners} crest(s) before a bend, ${c.brakeZones} brake zone(s), elevation ${c.elevationRange.toFixed(0)} m`);
  if (c.chicanes < 1) fail('layout: the authored chicane is not counted');
  if (c.crestsBeforeCorners < 1) fail('layout: the authored crest before the far turn is not counted');
}

export function physicsChecks(fail: Fail) {
  layoutCheck(fail);
  crestCheck(fail);
  airSteerCheck(fail);
  fallCheck(fail);
  wideJumpCheck(fail);
  fragilityCheck(fail);
}
