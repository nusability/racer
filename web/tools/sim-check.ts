// Runs full headless races on every track (plus a synthetic test loop) and prints how they
// went. Fails (non-zero exit) on NaN, a racer that never finishes, or a determinism break.
//   npm run sim                 all tracks
//   npm run sim -- sunpan       one track (simtest is the synthetic loop)
//   npm run sim -- --ladder     also race six equal racers at different skills

import { TRACKS } from '../src/data/tracks/index.ts';
import { RACERS, racerById } from '../src/data/racers.ts';
import { effectiveStats, noUpgrades } from '../src/data/upgrades.ts';
import { Track } from '../src/core/track.ts';
import { Race } from '../src/core/race.ts';
import { AiDriver } from '../src/core/ai.ts';
import { minJumpSpeed } from '../src/core/vehicle.ts';
import { SIM_DT } from '../src/data/tuning.ts';
import type { PlayerInput, RaceEntrant, RaceEvent, RacerDef, TrackDef } from '../src/core/types.ts';
import { simTestTrack } from './sim-test-track.ts';

// The project has no Node typings (the web build must not see them); this is all we use.
declare const process: { argv: string[]; exit(code: number): never };

const SEED = 20261022;
const FIELD = 6;
const SKILL_LO = 0.3;
const SKILL_HI = 0.95;
/** A race longer than this many seconds per lap means someone is stuck. */
const TIMEOUT_PER_LAP = 240;
/** Cup-1 opponents for the novice bot. */
const CUP1_SKILL_LO = 0.3;
const CUP1_SKILL_HI = 0.55;
const STARTER = 'dustwing';
/** Novice races per track (different seeds) to average out luck. */
const NOVICE_RUNS = 5;
/** The novice sees the road this late, seconds. */
const NOVICE_DELAY = 0.25;
/** The novice reads the road like a sloppy AI (wandering line; ignores shortcuts). */
const NOVICE_SKILL = 0.4;
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
        const left = prevBranch[i] === b.index && r.branch < 0;
        if (mark.at >= 0 && ((mark.onBranch && left) || (!mark.onBranch && crossed(b.exitS)))) {
          (mark.onBranch ? viaBranch : viaMain).push({ branch: b.index, seconds: race.time - mark.at });
          mark.at = -1;
        }
        if (r.crashed > 0) mark.at = -1;
      }
      prevS[i] = r.s;
      prevBranch[i] = r.branch;
    });
    if (++steps > maxSteps) {
      const stuck = race.racers.filter((r) => r.finishTime === null).map((r) => `${r.id}@lap${r.lap} s=${r.s.toFixed(0)} b=${r.branch}`);
      fail(`${track.def.id}: timeout after ${(steps * SIM_DT).toFixed(0)}s; unfinished ${stuck.join(', ')}`);
      break;
    }
  }
  return { race, boostTime, cells, fingerprint: JSON.stringify(race.racers), events, viaBranch, viaMain };
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
    const crashText = [c.destroyed && `destroyed ${c.destroyed}`, c.fell && `fell ${c.fell}`, c.obstacle && `obstacle ${c.obstacle}`].filter(Boolean).join(', ') || '-';
    console.log(
      `  ${e.name.padEnd(12)} ${e.skill.toFixed(2).padStart(5)} ${String(st.place).padStart(5)} ` +
        `${st.finishTime === null ? '    DNF' : st.finishTime.toFixed(1).padStart(7)} ${st.bestLap === null ? '     -' : st.bestLap.toFixed(1).padStart(6)} ` +
        `${avg.toFixed(0).padStart(8)} ${v.drive.scrapeTime.toFixed(1).padStart(8)} ${v.drive.offroadTime.toFixed(1).padStart(7)} ` +
        `${res.boostTime[i].toFixed(0).padStart(7)} ${(res.cells[i] / laps).toFixed(1).padStart(9)}  ${crashText}`,
    );
    if (st.finishTime === null) fail(`${track.def.id}: ${e.name} never finished`);
  }
  for (const b of track.branches) {
    const on = res.viaBranch.filter((t) => t.branch === b.index).map((t) => t.seconds);
    const off = res.viaMain.filter((t) => t.branch === b.index).map((t) => t.seconds);
    const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
    const gain = on.length && off.length ? `${(mean(off) - mean(on)).toFixed(2)} s gained` : 'no comparison';
    console.log(`  shortcut "${b.def.name}": taken ${on.length}x, main ${off.length}x, ${gain}`);
  }
  const ev = [...res.events].map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`  events: ${ev}`);
}

/**
 * A casual player: reacts late, wobbles, holds boost whenever there is any in the tank,
 * never brakes, takes no shortcuts and only collects the cells that happen to be on its line.
 */
function noviceDriver(race: Race, seed: number): Driver {
  const index = race.entrants.findIndex((e) => e.isPlayer);
  const eyes = new AiDriver(NOVICE_SKILL, seed, { shortcuts: false, cellDetours: false });
  const delay = Math.round(NOVICE_DELAY / SIM_DT);
  const seen: number[] = [];
  return (r: Race) => {
    const v = r.vehicles[index];
    eyes.drive(v, r.track, r.racers);
    seen.push(eyes.aimX);
    // Drag control: the finger puts the target where the player saw the gap, late.
    const aim = seen.length > delay ? (seen.shift() as number) : v.targetX;
    return { steer: 0, nudge: aim - v.targetX, brake: false, boost: true };
  };
}

function noviceVsCup1(track: Track, laps: number) {
  const starter = racerById(STARTER);
  let crashes = 0;
  const places: number[] = [];
  const gaps: number[] = [];
  for (let k = 0; k < NOVICE_RUNS; k++) {
    const seed = SEED + k;
    const field = [entrant(0, starter, 0, true)];
    for (let i = 1; i < FIELD; i++) field.push(entrant(i, starter, spread(i - 1, FIELD - 1, CUP1_SKILL_LO, CUP1_SKILL_HI), false));
    const race = new Race(track, { laps, seed, entrants: field });
    const drive = noviceDriver(race, seed);
    const maxSteps = Math.ceil((laps * TIMEOUT_PER_LAP) / SIM_DT);
    for (let n = 0; race.phase !== 'finished'; n++) {
      if (n > maxSteps) {
        fail(`${track.def.id}: novice race timed out`);
        break;
      }
      race.step(race.phase === 'countdown' ? IDLE : drive(race));
    }
    const me = race.player();
    if (me.finishTime === null) fail(`${track.def.id}: novice never finished`);
    const c = race.vehicles[0].drive.crashes;
    crashes += c.destroyed + c.fell + c.obstacle;
    places.push(me.place);
    // Novice time against the cup-1 median (positive = slower), placed by distance if unfinished.
    const others = race.racers.filter((r) => r !== me && r.finishTime !== null).map((r) => r.finishTime as number).sort((a, b) => a - b);
    if (me.finishTime !== null && others.length > 0) gaps.push(me.finishTime - others[Math.floor(others.length / 2)]);
  }
  const meanGap = gaps.length ? gaps.reduce((a, g) => a + g, 0) / gaps.length : NaN;
  console.log(`  novice bot vs cup-1 (Dustwings, skill ${CUP1_SKILL_LO}-${CUP1_SKILL_HI}): places ${places.join(', ')}, ` +
      `${(crashes / NOVICE_RUNS).toFixed(1)} crashes/race, ${meanGap >= 0 ? '+' : ''}${meanGap.toFixed(1)} s vs the cup-1 median`);
}

const defs: TrackDef[] = [simTestTrack, ...TRACKS];
for (const def of defs) {
  if (only.length > 0 && !only.includes(def.id)) continue;
  const track = new Track(def);
  const jumps = [track, ...track.branches.map((b) => b.ribbon)].flatMap((rb) => rb.jumps.map((j) => `${minJumpSpeed(rb, j).toFixed(0)}`));
  console.log(
    `\n${def.id} (${def.name}) ${track.length.toFixed(0)} m x ${def.laps} laps, ${track.branches.length} shortcut(s)` +
      `${jumps.length ? `; jump min speeds ${jumps.join(', ')} m/s` : ''}`,
  );
  const field = Array.from({ length: FIELD }, (_, i) => entrant(i, RACERS[i % RACERS.length], spread(i, FIELD, SKILL_LO, SKILL_HI), false));
  const a = run(track, def.laps, SEED, field, null);
  report(track, a);
  const b = run(track, def.laps, SEED, field, null);
  if (a.fingerprint !== b.fingerprint) fail(`${def.id}: two runs with the same seed diverged`);
  noviceVsCup1(track, def.laps);
  if (ladder) {
    console.log('  skill ladder, six equal Dustwings:');
    const starter = racerById(STARTER);
    report(track, run(track, def.laps, SEED, Array.from({ length: FIELD }, (_, i) => entrant(i, starter, spread(i, FIELD, SKILL_LO, SKILL_HI), false)), null));
  }
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nsim-check OK (deterministic, no NaN, everyone finished)');
