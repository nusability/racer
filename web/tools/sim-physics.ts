// Physics checks on synthetic stretches of road, driven by nothing but the real Vehicle: what
// air steering allows, and what a fall off the course ends in. Each prints its numbers and
// reports a failure through the caller's `fail`.

import { racerById } from '../src/data/racers.ts';
import { effectiveStats, noUpgrades } from '../src/data/upgrades.ts';
import { Track } from '../src/core/track.ts';
import { Vehicle, type CrashReason } from '../src/core/vehicle.ts';
import { DROP_DEPTH, GRAVITY, SIM_DT, VOID_LOST_DEPTH } from '../src/data/tuning.ts';
import type { FloorKind, PlayerInput, RaceEvent, TrackDef } from '../src/core/types.ts';
import { WIDE_JUMP_AT, WIDE_JUMP_RAMP, WIDE_JUMP_TAKEOFF, simDraftOval, simWideJump } from './sim-test-track.ts';

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

export function physicsChecks(fail: Fail) {
  airSteerCheck(fail);
  fallCheck(fail);
  wideJumpCheck(fail);
}
