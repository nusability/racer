// Runs full headless races on every track (plus synthetic test courses) and prints how they
// went. Fails (non-zero exit) on NaN, a racer that never finishes, a determinism break, or a
// racer pinned against a wall; on the synthetic sprint also on a DNF, wrong placings, a racer
// reaching the run-out's end, a fork whose field all took one way, or a finisher the run-out's
// force field does not take in and ease to a still rest of its own.
//   npm run sim                 all tracks
//   npm run sim -- sunpan       one track (simtest is the synthetic loop, simsprint the sprint,
//                               simphysics the physics checks of tools/sim-physics.ts)
//   npm run sim -- --ladder     also race six equal racers at different skills
//   npm run sim -- --cups x     cup balance study even when filtering to track x

import { TRACKS } from '../src/data/tracks/index.ts';
import { RACERS, racerById } from '../src/data/racers.ts';
import { MAX_UPGRADE_LEVEL, effectiveStats, noUpgrades } from '../src/data/upgrades.ts';
import { Track } from '../src/core/track.ts';
import { Race } from '../src/core/race.ts';
import { Slipstream } from '../src/core/slipstream.ts';
import { Vehicle } from '../src/core/vehicle.ts';
import { minJumpSpeed } from '../src/core/jumps.ts';
import { currentTopSpeed } from '../src/core/handling.ts';
import { BRAKE_DECEL, DRAFT_FULL, DRAFT_TOP_SPEED, RACER_HALF_WIDTH, RACER_LENGTH, SIM_DT, SPRINT_FIELD_DEPTH } from '../src/data/tuning.ts';
import type { PlayerInput, RaceEntrant, RaceEvent, RacerDef, TrackDef } from '../src/core/types.ts';
import { simDraftOval, simFigure8, simSprint, simTestTrack } from './sim-test-track.ts';
import { allCupStudies } from './sim-cups.ts';
import { physicsChecks } from './sim-physics.ts';

// The project has no Node typings (the web build must not see them); this is all we use.
declare const process: { argv: string[]; exit(code: number): never };

const SEED = 20261022;
const FIELD = 6;
const SKILL_LO = 0.3;
const SKILL_HI = 0.95;
/** A race longer than this many seconds per lap (or per sprint) means someone is stuck. */
const TIMEOUT_PER_LAP = 240;
const STARTER = 'dustwing';
const IDLE: PlayerInput = { steer: 0, nudge: 0, brake: false, boost: false };

const args = process.argv.slice(2);
const ladder = args.includes('--ladder');
const only = args.filter((a) => !a.startsWith('--'));
let failures = 0;

function fail(msg: string) {
  console.error(`FAIL ${msg}`);
  failures++;
}

function entrant(i: number, def: RacerDef, skill: number, isPlayer: boolean): RaceEntrant {
  return { id: `r${i}`, name: def.name, racerId: def.id, stats: effectiveStats(def, noUpgrades()), isPlayer, skill };
}

function spread(i: number, n: number, lo: number, hi: number): number {
  return hi - ((hi - lo) * i) / (n - 1);
}

interface Traversal {
  branch: number;
  seconds: number;
}

interface RunResult {
  race: Race;
  /** Per racer: seconds boosting (tank or free) and cells collected. */
  boostTime: number[];
  cells: number[];
  fingerprint: string;
  events: Map<string, number>;
  /** Times to get from a branch's entry to its exit, on the branch and on the main road. */
  viaBranch: Traversal[];
  viaMain: Traversal[];
  /** Per racer: the furthest main-road s it reached. */
  maxMainS: number[];
}

type Driver = (race: Race) => PlayerInput;

function run(track: Track, laps: number, seed: number, field: RaceEntrant[], player: Driver | null): RunResult {
  const race = new Race(track, { laps, seed, entrants: field });
  const maxSteps = Math.ceil((laps * TIMEOUT_PER_LAP) / SIM_DT);
  const events = new Map<string, number>();
  const viaBranch: Traversal[] = [];
  const viaMain: Traversal[] = [];
  // Per racer and branch: when it started the stretch, and on which ribbon.
  const started = race.racers.map(() => track.branches.map(() => ({ at: -1, onBranch: false })));
  const prevS = race.racers.map((r) => r.s);
  const prevBranch = race.racers.map((r) => r.branch);
  const boostTime = race.racers.map(() => 0);
  const cells = race.racers.map(() => 0);
  const maxMainS = race.racers.map((r) => r.s);
  let steps = 0;
  while (race.phase !== 'finished') {
    const stepEvents: RaceEvent[] = race.step(player === null ? IDLE : player(race));
    for (const e of stepEvents) {
      events.set(e.type, (events.get(e.type) ?? 0) + 1);
      if (e.type === 'pickup') cells[race.racers.findIndex((r) => r.id === e.id)]++;
    }
    race.racers.forEach((r, i) => {
      if (r.boosting) boostTime[i] += SIM_DT;
    });
    race.racers.forEach((r, i) => {
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${track.def.id}: ${r.id}.${k} = ${v} at t=${race.time.toFixed(2)}`);
      }
      for (const b of track.branches) {
        const mark = started[i][b.index];
        const crossed = (at: number) => prevBranch[i] < 0 && r.branch < 0 && track.delta(prevS[i], at) > 0 && track.delta(r.s, at) <= 0;
        if (crossed(b.entryS)) Object.assign(mark, { at: race.time, onBranch: false });
        if (prevBranch[i] < 0 && r.branch === b.index && mark.at >= 0) mark.onBranch = true;
        // Onto another branch over the same stretch (the other route of a fork): neither way of this one.
        if (r.branch >= 0 && r.branch !== b.index && !mark.onBranch) mark.at = -1;
        const left = prevBranch[i] === b.index && r.branch < 0;
        if (mark.at >= 0 && ((mark.onBranch && left) || (!mark.onBranch && crossed(b.exitS)))) {
          (mark.onBranch ? viaBranch : viaMain).push({ branch: b.index, seconds: race.time - mark.at });
          mark.at = -1;
        }
        if (r.crashed > 0) mark.at = -1;
      }
      prevS[i] = r.s;
      prevBranch[i] = r.branch;
      if (r.branch < 0) maxMainS[i] = Math.max(maxMainS[i], r.s);
    });
    if (++steps > maxSteps) {
      const stuck = race.racers.filter((r) => r.finishTime === null && r.crashed <= 0).map((r) => `${r.id}@lap${r.lap} s=${r.s.toFixed(0)} b=${r.branch}`);
      fail(`${track.def.id}: timeout after ${(steps * SIM_DT).toFixed(0)}s; unfinished ${stuck.join(', ')}`);
      break;
    }
  }
  return { race, boostTime, cells, fingerprint: JSON.stringify(race.racers), events, viaBranch, viaMain, maxMainS };
}

/** Below this share of top speed a wall-hugging racer counts as pinned. */
const WALL_HUG_MIN_SPEED = 0.5;
/** ...once it has stayed there this long, seconds (an obstacle hit may dip it for a moment). */
const WALL_HUG_MAX_SLOW = 1;
/** Seconds after GO before the check starts: the launch is still building speed. */
const WALL_HUG_LAUNCH = 4;

/**
 * A starter holding full steer and boost into each wall for a lap must keep sliding: a wall
 * hurts, it never pins. Ends early at a wreck (an obstacle or an open edge on that side).
 */
function wallHug(track: Track, side: -1 | 1) {
  const race = new Race(track, { laps: 1, seed: SEED, entrants: [entrant(0, racerById(STARTER), 1, true)] });
  const v = race.vehicles[0];
  const r = race.racers[0];
  const push: PlayerInput = { steer: side, nudge: 0, brake: false, boost: true };
  const maxSteps = Math.ceil(TIMEOUT_PER_LAP / SIM_DT);
  let slow = 0;
  for (let n = 0; race.phase !== 'finished' && r.crashed <= 0; n++) {
    if (n > maxSteps) return fail(`${track.def.id}: wall hug (${side < 0 ? 'left' : 'right'}) timed out at s=${r.s.toFixed(0)}`);
    race.step(push);
    if (race.phase !== 'racing' || race.time < WALL_HUG_LAUNCH || r.airborne) continue;
    slow = r.speed < currentTopSpeed(v.stats, r, false) * WALL_HUG_MIN_SPEED ? slow + SIM_DT : 0;
    if (slow > WALL_HUG_MAX_SLOW) {
      return fail(`${track.def.id}: wall hug (${side < 0 ? 'left' : 'right'}) pinned at ${r.speed.toFixed(0)} m/s, s=${r.s.toFixed(0)} x=${r.x.toFixed(1)}`);
    }
  }
}

function report(track: Track, res: RunResult) {
  const { race } = res;
  console.log(
    `  ${'racer'.padEnd(12)} ${'skill'.padStart(5)} ${'place'.padStart(5)} ${'time'.padStart(7)} ${'best'.padStart(6)} ` +
      `${'avg km/h'.padStart(8)} ${'scrape s'.padStart(8)} ${'sand s'.padStart(7)} ${'boost s'.padStart(7)} ${'cells/lap'.padStart(9)}  crashes`,
  );
  const rows = race.entrants.map((e, i) => ({ e, i, st: race.racers[i], v: race.vehicles[i] })).sort((a, b) => a.st.place - b.st.place);
  const laps = race.config.laps;
  for (const { e, i, st, v } of rows) {
    const c = v.drive.crashes;
    const avg = (st.distance / Math.max(race.time, SIM_DT)) * 3.6;
    const crashText = (Object.keys(c) as (keyof typeof c)[]).filter((k) => c[k] > 0).map((k) => `wreck: ${k}`).join(', ') || '-';
    console.log(
      `  ${e.name.padEnd(12)} ${e.skill.toFixed(2).padStart(5)} ${String(st.place).padStart(5)} ` +
        `${st.finishTime === null ? '    DNF' : st.finishTime.toFixed(1).padStart(7)} ${st.bestLap === null ? '     -' : st.bestLap.toFixed(1).padStart(6)} ` +
        `${avg.toFixed(0).padStart(8)} ${v.drive.scrapeTime.toFixed(1).padStart(8)} ${v.drive.offroadTime.toFixed(1).padStart(7)} ` +
        `${res.boostTime[i].toFixed(0).padStart(7)} ${(res.cells[i] / laps).toFixed(1).padStart(9)}  ${crashText}`,
    );
    if (st.finishTime === null && st.crashed <= 0) fail(`${track.def.id}: ${e.name} neither finished nor wrecked`);
  }
  const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
  for (const b of track.branches) {
    if (b.fork !== null) continue;
    const on = res.viaBranch.filter((t) => t.branch === b.index).map((t) => t.seconds);
    const off = res.viaMain.filter((t) => t.branch === b.index).map((t) => t.seconds);
    const gain = on.length && off.length ? `${(mean(off) - mean(on)).toFixed(2)} s gained` : 'no comparison';
    console.log(`  shortcut "${b.def.name}": taken ${on.length}x, main ${off.length}x, ${gain}`);
  }
  for (const f of track.forks) {
    const ways = forkWays(track, res, f.index).map((w) => `"${w.name}" ${w.times.length}x${w.times.length ? ` ${mean(w.times).toFixed(1)} s` : ''}`);
    console.log(`  fork "${f.name}": ${ways.join(', ')}`);
  }
  const ev = [...res.events].map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`  events: ${ev}`);
}

/** Each way through a fork and the times racers took on it, entry to exit (main road first). */
function forkWays(track: Track, res: RunResult, fork: number): { name: string; times: number[] }[] {
  const f = track.forks[fork];
  // A racer staying on the main road passes every route's span: count it once, by the first route.
  const main = res.viaMain.filter((t) => t.branch === f.routes[0]).map((t) => t.seconds);
  const routes = f.routes.map((i) => ({ name: track.branches[i].def.name, times: res.viaBranch.filter((t) => t.branch === i).map((t) => t.seconds) }));
  return [{ name: f.name, times: main }, ...routes];
}

/** After the last finisher, a sprint keeps running this long so the run-out can be watched to a stop, seconds. */
const SPRINT_SETTLE = 12;
/** Below this speed a finisher counts as stopped, m/s. */
const SPRINT_STOPPED = 0.5;

/**
 * The sprint's own rules: everyone finishes (the synthetic sprint has nothing that must wreck),
 * places follow finishing times, every finisher stops on the run-out short of the road's end,
 * and each fork's field spreads over at least two of its ways.
 */
function sprintCheck(track: Track, res: RunResult) {
  const { race } = res;
  const id = track.def.id;
  const stoppedAt = race.racers.map(() => -1);
  for (let n = 0; n * SIM_DT < SPRINT_SETTLE; n++) {
    race.step(IDLE);
    race.racers.forEach((r, i) => {
      if (r.branch < 0) res.maxMainS[i] = Math.max(res.maxMainS[i], r.s);
      if (stoppedAt[i] < 0 && r.speed < SPRINT_STOPPED) stoppedAt[i] = r.s;
    });
  }
  const finishS = track.startS + track.raceLength;
  const reach = race.racers.map((r, i) => `${r.id} ${(res.maxMainS[i] - finishS).toFixed(0)} m`);
  console.log(`  run-out (${(track.length - finishS).toFixed(0)} m): stopped past the line at ${reach.join(', ')}`);
  race.racers.forEach((r, i) => {
    if (r.finishTime === null) fail(`${id}: ${r.id} did not finish the sprint${r.crashed > 0 ? ' (wrecked)' : ''}`);
    if (res.maxMainS[i] >= track.length - RACER_LENGTH) fail(`${id}: ${r.id} ran the whole run-out to the road's end`);
    if (stoppedAt[i] < 0) fail(`${id}: ${r.id} still moving ${SPRINT_SETTLE} s after the race ended`);
  });
  const byTime = race.racers.filter((r) => r.finishTime !== null).sort((a, b) => (a.finishTime as number) - (b.finishTime as number));
  byTime.forEach((r, i) => {
    if (r.place !== i + 1) fail(`${id}: ${r.id} finished ${i + 1}th by time but is placed ${r.place}`);
  });
  for (const f of track.forks) {
    const used = forkWays(track, res, f.index).filter((w) => w.times.length > 0).length;
    if (used < 2) fail(`${id}: the whole field took one way through fork "${f.name}"`);
  }
}

const defs: TrackDef[] = [simTestTrack, simFigure8, simSprint, ...TRACKS];
for (const def of defs) {
  if (only.length > 0 && !only.includes(def.id)) continue;
  const track = new Track(def);
  const jumps = [track, ...track.branches.map((b) => b.ribbon)].flatMap((rb) => rb.jumps.map((j) => `${minJumpSpeed(rb, j).toFixed(0)}`));
  const shortcuts = track.branches.filter((b) => b.fork === null).length;
  const distance = def.course === 'sprint' ? `${track.raceLength.toFixed(0)} m sprint` : `${track.length.toFixed(0)} m x ${def.laps} laps`;
  console.log(
    `\n${def.id} (${def.name}) ${distance}, ${shortcuts} shortcut(s)${track.forks.length ? `, ${track.forks.length} fork(s)` : ''}` +
      `${jumps.length ? `; jump min speeds ${jumps.join(', ')} m/s` : ''}`,
  );
  const field = Array.from({ length: FIELD }, (_, i) => entrant(i, RACERS[i % RACERS.length], spread(i, FIELD, SKILL_LO, SKILL_HI), false));
  const a = run(track, def.laps, SEED, field, null);
  report(track, a);
  const b = run(track, def.laps, SEED, field, null);
  if (a.fingerprint !== b.fingerprint) fail(`${def.id}: two runs with the same seed diverged`);
  if (def.course === 'sprint') sprintCheck(track, a);
  wallHug(track, -1);
  wallHug(track, 1);
  if (ladder) {
    console.log('  skill ladder, six equal Dustwings:');
    const starter = racerById(STARTER);
    report(track, run(track, def.laps, SEED, Array.from({ length: FIELD }, (_, i) => entrant(i, starter, spread(i, FIELD, SKILL_LO, SKILL_HI), false)), null));
  }
}

/** Where on the draft oval's dead-straight stretch the slipstream check starts, metres along s. */
const DRAFT_CHECK_S = 1100;
const DRAFT_CHECK_SECONDS = 3;
/** Bumper-to-bumper gap the follower starts at: well inside the wake. */
const DRAFT_CHECK_GAP = 12;
/** Past the far edge of the wake. */
const DRAFT_CHECK_FAR_GAP = 60;
/** Lateral offset that is clear of the wake. */
const DRAFT_CHECK_ASIDE = 5;
/** A tucked-in follower must gain at least this much on an equal leader, metres. */
const DRAFT_CHECK_MIN_GAIN = 3;
/** Out of the wake, equal racers' gap may drift at most this much, metres. */
const DRAFT_CHECK_DRIFT = 0.05;
/** In the slingshot run, the follower pulls out after this long tucked in, seconds. */
const DRAFT_CHECK_PULL_OUT = 1.5;

interface DraftRun {
  gain: number;
  maxDraft: number;
  slingshots: number;
  /** Most the follower's top-speed bonus held at, from the first step out of the wake on. */
  slipAfterPullOut: number;
  tankGain: number;
}

/**
 * Two equal starters at top speed on a featureless straight, driven by nothing but the real
 * Vehicle and Slipstream: what does the wake alone do to the gap?
 */
function draftRun(track: Track, gap: number, x: number, pullOutAt: number | null): DraftRun {
  const stats = effectiveStats(racerById(STARTER), noUpgrades());
  const leader = new Vehicle('lead', stats, track, DRAFT_CHECK_S + gap + RACER_LENGTH, 0, 0, 1);
  const follower = new Vehicle('chase', stats, track, DRAFT_CHECK_S, x, 0, 2);
  const vehicles = [leader, follower];
  for (const v of vehicles) v.state.speed = stats.topSpeed;
  const slip = new Slipstream(vehicles.length);
  const gap0 = track.delta(follower.state.s, leader.state.s);
  const res: DraftRun = { gain: 0, maxDraft: 0, slingshots: 0, slipAfterPullOut: 0, tankGain: 0 };
  let out = false;
  for (let t = 0; t < DRAFT_CHECK_SECONDS; t += SIM_DT) {
    if (pullOutAt !== null && t >= pullOutAt) follower.targetX = DRAFT_CHECK_ASIDE;
    const events: RaceEvent[] = [];
    slip.step(vehicles, track, events);
    res.slingshots += events.filter((e) => e.type === 'slingshot' && e.id === 'chase').length;
    if (res.slingshots > 0) out = true;
    if (out) res.slipAfterPullOut = Math.max(res.slipAfterPullOut, follower.slip);
    for (const v of vehicles) v.step(IDLE, track, [], t, events);
    res.maxDraft = Math.max(res.maxDraft, follower.state.draft);
  }
  res.gain = gap0 - track.delta(follower.state.s, leader.state.s);
  res.tankGain = follower.state.boost - leader.state.boost;
  return res;
}

function slipstreamCheck() {
  const track = new Track(simDraftOval);
  const tucked = draftRun(track, DRAFT_CHECK_GAP, 0, null);
  const aside = draftRun(track, DRAFT_CHECK_GAP, DRAFT_CHECK_ASIDE, null);
  const far = draftRun(track, DRAFT_CHECK_FAR_GAP, 0, null);
  const sling = draftRun(track, DRAFT_CHECK_GAP, 0, DRAFT_CHECK_PULL_OUT);
  console.log(
    `\nslipstream (equal starters, ${DRAFT_CHECK_SECONDS} s): tucked in gains ${tucked.gain.toFixed(1)} m (draft ${tucked.maxDraft.toFixed(2)}, ` +
      `tank +${tucked.tankGain.toFixed(3)}), aside ${aside.gain.toFixed(2)} m, ${DRAFT_CHECK_FAR_GAP} m back ${far.gain.toFixed(2)} m; ` +
      `pulled out: ${sling.slingshots} slingshot(s), bonus held ${sling.slipAfterPullOut.toFixed(3)}`,
  );
  if (tucked.gain < DRAFT_CHECK_MIN_GAIN) fail(`slipstream: a tucked-in follower gained only ${tucked.gain.toFixed(2)} m`);
  if (tucked.maxDraft < DRAFT_FULL) fail(`slipstream: draft never got full (${tucked.maxDraft.toFixed(2)})`);
  if (!(tucked.tankGain > 0)) fail('slipstream: drafting did not top up the tank');
  if (Math.abs(aside.gain) > DRAFT_CHECK_DRIFT || aside.maxDraft > 0) fail(`slipstream: a follower out of the wake drafted (gap moved ${aside.gain.toFixed(2)} m)`);
  if (Math.abs(far.gain) > DRAFT_CHECK_DRIFT || far.maxDraft > 0) fail(`slipstream: a follower beyond the wake drafted (gap moved ${far.gain.toFixed(2)} m)`);
  if (sling.slingshots !== 1) fail(`slipstream: pulling out of a full draft gave ${sling.slingshots} slingshots`);
  if (sling.slipAfterPullOut < DRAFT_TOP_SPEED) fail(`slipstream: the slingshot bonus did not hold (${sling.slipAfterPullOut.toFixed(3)})`);
}

if (only.length === 0 || only.includes(simDraftOval.id)) slipstreamCheck();

/** Rough ground laid on the draft oval's first straight (params 1..3 run from 1000 to 3000 m). */
const ROUGH_CHECK_FROM = 1.2;
const ROUGH_CHECK_TO = 1.6;
/** Where each rough run starts, metres along s, and where it is judged: clear of the stretch both sides. */
const ROUGH_CHECK_START = 1000;
const ROUGH_CHECK_END = 1800;
/** Flat out (top speed, no boost) over that 400 m must cost at least this much hull... */
const ROUGH_CHECK_MIN_FAST = 0.3;
/** ...boost held must cost at least this many times more... */
const ROUGH_CHECK_BOOST_RATIO = 1.5;
/** ...and held at this share of top speed (under the safe speed), at most this much. */
const ROUGH_CHECK_SLOW_SHARE = 0.65;
const ROUGH_CHECK_MAX_SLOW = 0.005;
/** Doubled armour must halve the bill to within this fraction. */
const ROUGH_CHECK_ARMOUR_TOLERANCE = 0.1;

interface RoughRun {
  damage: number;
  jolts: number;
  rough: number;
  wrecked: boolean;
  fingerprint: string;
}

/** One starter over the stretch, driven by nothing but the real Vehicle: flat out, boosted or held slow. */
function roughRun(track: Track, mode: 'fast' | 'boost' | 'slow', armor: number): RoughRun {
  const stats = { ...effectiveStats(racerById(STARTER), noUpgrades()), armor };
  const v = new Vehicle('rough', stats, track, ROUGH_CHECK_START, 0, 0, SEED);
  v.state.speed = mode === 'slow' ? stats.topSpeed * ROUGH_CHECK_SLOW_SHARE : stats.topSpeed;
  v.state.boost = 1;
  const res: RoughRun = { damage: 0, jolts: 0, rough: 0, wrecked: false, fingerprint: '' };
  for (let t = 0; v.state.s < ROUGH_CHECK_END && v.state.crashed <= 0; t += SIM_DT) {
    const brake = mode === 'slow' && v.state.speed > stats.topSpeed * ROUGH_CHECK_SLOW_SHARE;
    const events: RaceEvent[] = [];
    v.step({ steer: 0, nudge: 0, brake, boost: mode === 'boost' }, track, [], t, events);
    res.jolts += events.filter((e) => e.type === 'jolt').length;
    res.rough += events.filter((e) => e.type === 'rough').length;
  }
  res.damage = v.state.damage;
  res.wrecked = v.state.crashed > 0;
  res.fingerprint = JSON.stringify(v.state);
  return res;
}

function roughCheck() {
  const track = new Track({
    ...simDraftOval,
    id: 'simrough',
    features: [...simDraftOval.features, { kind: 'rough', from: ROUGH_CHECK_FROM, to: ROUGH_CHECK_TO, amount: 1 }],
  });
  const fast = roughRun(track, 'fast', 1);
  const again = roughRun(track, 'fast', 1);
  const boost = roughRun(track, 'boost', 1);
  const slow = roughRun(track, 'slow', 1);
  const armoured = roughRun(track, 'fast', 2);
  const pct = (r: RoughRun) => `${(r.damage * 100).toFixed(1)}%${r.wrecked ? ' (wrecked)' : ''}`;
  console.log(
    `
rough ground (400 m, stock starter): flat out ${pct(fast)} hull, ${fast.jolts} jolts; boost held ${pct(boost)}; ` +
      `held at ${ROUGH_CHECK_SLOW_SHARE * 100}% top speed ${pct(slow)}, ${slow.jolts} jolts; armour 2 flat out ${pct(armoured)}`,
  );
  if (fast.rough === 0) fail('rough: the stretch never reported rough ground');
  if (fast.damage < ROUGH_CHECK_MIN_FAST) fail(`rough: flat out cost only ${pct(fast)} hull`);
  if (fast.jolts === 0) fail('rough: flat out never jolted');
  if (!(boost.damage >= fast.damage * ROUGH_CHECK_BOOST_RATIO || boost.wrecked)) fail(`rough: boosting cost ${pct(boost)}, not ${ROUGH_CHECK_BOOST_RATIO}x flat out`);
  if (slow.damage > ROUGH_CHECK_MAX_SLOW || slow.jolts > 0) fail(`rough: under the safe speed it still cost ${pct(slow)} and ${slow.jolts} jolts`);
  if (Math.abs(armoured.damage * 2 - fast.damage) > fast.damage * ROUGH_CHECK_ARMOUR_TOLERANCE) fail(`rough: armour 2 cost ${pct(armoured)} against ${pct(fast)}`);
  if (fast.fingerprint !== again.fingerprint) fail('rough: two identical runs diverged (the jolts must be seeded)');
}

if (only.length === 0 || only.includes('simrough')) roughCheck();

// --- The sprint's force field: a field of stock starters and one of fully upgraded Orbis
// Gyres race the synthetic sprint (the Gyres far too fast at the line for the field's grip to
// stop where they rest without braking on the way). Past the finish each must slow every step,
// never harder than a magnetic brake (no wall), fly into the field still moving (the field
// stops it, not the brake), come to rest inside the field short of the road's end, clear of
// every other finisher, and then stay put (no wobble).

/** The hardest the field may ever slow a finisher, m/s²: twice the air brake (a wall stops in one step). */
const FIELD_MAX_DECEL = 2 * BRAKE_DECEL;
/** A racer come to rest finishes its sideways glide within this long, seconds; after it, it may drift at most this far, metres. */
const FIELD_REST_SETTLE = 1;
const FIELD_REST_DRIFT = 0.01;
/** Speed may never rise by more than this between steps (float noise), m/s. */
const FIELD_SPEED_NOISE = 1e-9;

function forceFieldCheck(racerId: string, level: number) {
  const track = new Track(simSprint);
  const def = racerById(racerId);
  const ups = { engine: level, thrusters: level, steering: level, tank: level, armor: level };
  const field: RaceEntrant[] = Array.from({ length: FIELD }, (_, i) => ({ ...entrant(i, def, spread(i, FIELD, SKILL_LO, SKILL_HI), false), stats: effectiveStats(def, ups) }));
  const race = new Race(track, { laps: 1, seed: SEED, entrants: field });
  const finishS = track.startS + track.raceLength;
  const entry = track.length - SPRINT_FIELD_DEPTH;
  const trace = race.racers.map(() => [] as { speed: number; s: number; x: number; landed: boolean }[]);
  const maxSteps = Math.ceil((TIMEOUT_PER_LAP + SPRINT_SETTLE) / SIM_DT);
  for (let n = 0; n < maxSteps && !(race.phase === 'finished' && trace.every((t) => t.length * SIM_DT > SPRINT_SETTLE)); n++) {
    const events = race.step(IDLE);
    race.racers.forEach((r, i) => {
      if (r.branch >= 0 || r.s < finishS) return;
      // A landing off the run-out's crest costs speed in one step: physics, not the field.
      const landed = events.some((e) => e.type === 'land' && e.id === r.id);
      trace[i].push({ speed: r.speed, s: r.s, x: r.x, landed });
    });
  }
  const label = `${FIELD} ${level === 0 ? 'stock' : 'maxed'} ${def.name}s`;
  const at = (t: (typeof trace)[number]) => t.find((p) => p.s >= entry);
  const wrecked = race.racers.filter((r) => r.crashed > 0).length;
  console.log(`\nforce field (simsprint, ${label}, ${wrecked} wrecked on the way): cross at ${trace.map((t) => (t.length ? t[0].speed.toFixed(0) : '-')).join(', ')} m/s, enter at ${trace.map((t) => at(t)?.speed.toFixed(0) ?? '-').join(', ')} m/s, rest ${trace.map((t) => (t.length ? (t[t.length - 1].s - entry).toFixed(0) : '-')).join(', ')} m into its ${SPRINT_FIELD_DEPTH} m`);
  const rests: { id: string; s: number; x: number }[] = [];
  trace.forEach((t, i) => {
    const id = race.racers[i].id;
    // A maxed Gyre can wreck on the pillar field at ~400 m/s: that is no fault of the run-out's.
    if (t.length === 0) return race.racers[i].crashed > 0 ? undefined : fail(`force field (${label}): ${id} never crossed the finish`);
    let worst = 0;
    let rise = 0;
    for (let k = 1; k < t.length; k++) {
      if (!t[k].landed) worst = Math.max(worst, (t[k - 1].speed - t[k].speed) / SIM_DT);
      rise = Math.max(rise, t[k].speed - t[k - 1].speed);
    }
    const rest = t.findIndex((p) => p.speed === 0);
    const inside = at(t);
    if (rise > FIELD_SPEED_NOISE) fail(`force field (${label}): ${id} sped up by ${rise.toFixed(3)} m/s past the finish`);
    if (worst > FIELD_MAX_DECEL) fail(`force field (${label}): ${id} was stopped at ${worst.toFixed(0)} m/s² (a wall), over ${FIELD_MAX_DECEL}`);
    if (!inside || inside.speed === 0) fail(`force field (${label}): ${id} stopped short of the field instead of being stopped by it`);
    if (rest < 0) return fail(`force field (${label}): ${id} still moving ${SPRINT_SETTLE} s after the race ended`);
    const end = t[t.length - 1];
    if (end.s >= track.length - RACER_LENGTH) fail(`force field (${label}): ${id} reached the road's end`);
    if (end.s <= entry) fail(`force field (${label}): ${id} came to rest outside the field`);
    // Its last sideways glide settles first; from then on it must hold still.
    const settled = rest + Math.round(FIELD_REST_SETTLE / SIM_DT);
    if (settled >= t.length) return fail(`force field (${label}): ${id} came to rest too late to watch it settle`);
    const drift = Math.max(...t.slice(settled).map((p) => Math.abs(p.x - t[settled].x)));
    if (drift > FIELD_REST_DRIFT || t.slice(rest).some((p) => p.speed !== 0)) fail(`force field (${label}): ${id} did not stay at rest (drifted ${drift.toFixed(3)} m)`);
    for (const o of rests) {
      if (Math.abs(o.s - end.s) < RACER_LENGTH && Math.abs(o.x - end.x) < 2 * RACER_HALF_WIDTH) fail(`force field (${label}): ${id} rests inside ${o.id}`);
    }
    rests.push({ id, s: end.s, x: end.x });
  });
}

if (only.length === 0 || only.includes(simSprint.id)) {
  forceFieldCheck('dustwing', 0);
  forceFieldCheck('gyre', MAX_UPGRADE_LEVEL);
}

if (only.length === 0 || only.includes('simphysics')) physicsChecks(fail);

// Cup balance: the real rival fields against stand-in players (skipped for single-track runs).
if (only.length === 0 || args.includes('--cups')) allCupStudies();

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nsim-check OK (deterministic, no NaN, everyone finished, walls never pin)');
