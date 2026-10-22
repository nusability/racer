// Runs a full headless race on every track with an all-AI field and prints how it went.
// Fails (non-zero exit) on NaN, a racer that never finishes, or a determinism break.
//   npm run sim                 all tracks
//   npm run sim -- sunpan       one track
//   npm run sim -- --ladder     also race six equal racers at different skills

import { TRACKS } from '../src/data/tracks/index.ts';
import { RACERS } from '../src/data/racers.ts';
import { effectiveStats, noUpgrades } from '../src/data/upgrades.ts';
import { Track } from '../src/core/track.ts';
import { Race, racerSpeedKmh } from '../src/core/race.ts';
import { minJumpSpeed } from '../src/core/vehicle.ts';
import { SIM_DT } from '../src/data/tuning.ts';
import type { PlayerInput, RaceEntrant, RaceEvent, RacerDef } from '../src/core/types.ts';

const SEED = 20261022;
const FIELD = 6;
const SKILL_LO = 0.3;
const SKILL_HI = 0.95;
/** A race longer than this many seconds per lap means someone is stuck. */
const TIMEOUT_PER_LAP = 240;
const IDLE: PlayerInput = { steer: 0, brake: false, boost: false };

const args = process.argv.slice(2);
const ladder = args.includes('--ladder');
const only = args.filter((a) => !a.startsWith('--'));
let failures = 0;

function fail(msg: string) {
  console.error(`FAIL ${msg}`);
  failures++;
}

function skillFor(i: number): number {
  return SKILL_HI - ((SKILL_HI - SKILL_LO) * i) / (FIELD - 1);
}

function entrants(racerFor: (i: number) => RacerDef): RaceEntrant[] {
  return Array.from({ length: FIELD }, (_, i) => {
    const def = racerFor(i);
    // No player entrant: the race then runs until everyone finishes (no finish grace).
    return { id: `r${i}`, name: def.name, racerId: def.id, stats: effectiveStats(def, noUpgrades()), isPlayer: false, skill: skillFor(i) };
  });
}

interface RunResult {
  race: Race;
  fingerprint: string;
  eventCounts: Map<string, number>;
}

function run(track: Track, laps: number, field: RaceEntrant[]): RunResult {
  const race = new Race(track, { laps, seed: SEED, entrants: field });
  const maxSteps = Math.ceil((laps * TIMEOUT_PER_LAP) / SIM_DT);
  const eventCounts = new Map<string, number>();
  let steps = 0;
  while (race.phase !== 'finished') {
    const events: RaceEvent[] = race.step(IDLE);
    for (const e of events) eventCounts.set(e.type, (eventCounts.get(e.type) ?? 0) + 1);
    for (const r of race.racers) {
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${track.def.id}: ${r.id}.${k} = ${v} at t=${race.time.toFixed(2)}`);
      }
    }
    if (++steps > maxSteps) {
      const stuck = race.racers.filter((r) => r.finishTime === null).map((r) => `${r.id}@lap${r.lap} s=${r.s.toFixed(0)}`);
      fail(`${track.def.id}: timeout after ${(steps * SIM_DT).toFixed(0)}s; unfinished ${stuck.join(', ')}`);
      break;
    }
  }
  const fingerprint = JSON.stringify(race.racers);
  return { race, fingerprint, eventCounts };
}

function report(track: Track, res: RunResult) {
  const { race } = res;
  console.log(`  ${'racer'.padEnd(12)} ${'skill'.padStart(5)} ${'place'.padStart(5)} ${'time'.padStart(7)} ${'best'.padStart(6)} ${'avg km/h'.padStart(8)} ${'scrape s'.padStart(8)}  crashes`);
  const rows = race.entrants.map((e, i) => ({ e, i, st: race.racers[i], v: race.vehicles[i] })).sort((a, b) => a.st.place - b.st.place);
  for (const { e, st, v } of rows) {
    const c = v.drive.crashes;
    const avg = (st.distance / Math.max(race.time, 1e-9)) * 3.6;
    const crashText = [c.destroyed && `destroyed ${c.destroyed}`, c.fell && `fell ${c.fell}`, c.obstacle && `obstacle ${c.obstacle}`].filter(Boolean).join(', ') || '-';
    console.log(
      `  ${e.name.padEnd(12)} ${e.skill.toFixed(2).padStart(5)} ${String(st.place).padStart(5)} ` +
        `${st.finishTime === null ? '   DNF' : st.finishTime.toFixed(1).padStart(7)} ${st.bestLap === null ? '     -' : st.bestLap.toFixed(1).padStart(6)} ` +
        `${avg.toFixed(0).padStart(8)} ${v.drive.scrapeTime.toFixed(1).padStart(8)}  ${crashText}`,
    );
    if (st.finishTime === null) fail(`${track.def.id}: ${e.name} never finished`);
  }
  const top = race.racers.reduce((m, r) => Math.max(m, racerSpeedKmh(r)), 0);
  const ev = [...res.eventCounts].map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`  final speeds up to ${top.toFixed(0)} km/h; events: ${ev}`);
}

for (const def of TRACKS) {
  if (only.length > 0 && !only.includes(def.id)) continue;
  const track = new Track(def);
  const jumps = track.jumps.map((j) => `${minJumpSpeed(track, j).toFixed(0)} m/s`).join(', ');
  console.log(`\n${def.id} (${def.name}) ${track.length.toFixed(0)} m x ${def.laps} laps${jumps ? `; jump min speeds ${jumps}` : ''}`);
  const field = entrants((i) => RACERS[i % RACERS.length]);
  const a = run(track, def.laps, field);
  report(track, a);
  const b = run(track, def.laps, field);
  if (a.fingerprint !== b.fingerprint) fail(`${def.id}: two runs with the same seed diverged`);
  if (ladder) {
    console.log('  skill ladder, six equal Dustwings:');
    report(track, run(track, def.laps, entrants(() => RACERS[0])));
  }
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nsim-check OK (deterministic, no NaN, everyone finished)');
