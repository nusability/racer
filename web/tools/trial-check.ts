// Headless checks of the time trial: a ghost recorded from real laps (the AI flying the player's
// glider) survives record → quantise → store → load → interpolate, the delta to it is read by
// distance along the course, splits add up, a new best replaces the ghost and a corrupt entry
// is dropped loudly. Prints each ghost's stored size.
//   node --experimental-strip-types tools/trial-check.ts            a few tracks
//   node --experimental-strip-types tools/trial-check.ts --all      every track

import { Race } from '../src/core/race.ts';
import { Track } from '../src/core/track.ts';
import { AiDriver, driverSeed } from '../src/core/ai.ts';
import type { RaceEvent, RacerState, TrackDef } from '../src/core/types.ts';
import { TRACKS, courseBounds, trackById } from '../src/data/tracks/index.ts';
import { noUpgrades } from '../src/data/upgrades.ts';
import { playerEntrant } from '../src/game/opponents.ts';
import { GhostClock, ghostPoseAt, ribbonS, type GhostPose, type GhostRun } from '../src/game/ghost.ts';
import { ghostKey, loadGhost, type GhostStorage } from '../src/game/ghostStore.ts';
import { TrialRun, type LapResult, type TrialEvent } from '../src/game/timeTrial.ts';
import { GHOST_ANGLE_UNIT, GHOST_DIST_UNIT, GHOST_HZ, GHOST_POS_UNIT, GHOST_STEPS_PER_SAMPLE, TRIAL_SECTORS, TRIAL_SEED } from '../src/game/trialTuning.ts';
import { posePitch } from '../src/render/racerPose.ts';
import { SIM_DT } from '../src/data/tuning.ts';
import { PHYSICS_AS_TUNED } from '../src/core/handling.ts';

declare const process: { argv: string[]; exit(code: number): never };

const STARTER = 'dustwing';
/** The autopilot's skill: a clean, quick line, as a decent player flies. */
const DRIVER_SKILL = 0.9;
/** A lap slower than this means the driver is stuck. */
const LAP_TIMEOUT = 300;
/** Quantisation leaves at most half a unit; the floating maths a hair more. */
const SLACK = 1e-6;

let failures = 0;
function check(cond: boolean, what: string): void {
  if (cond) return;
  failures++;
  console.error(`  FAIL ${what}`);
}

class MapStore implements GhostStorage {
  readonly map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

/** The player's true state at every ghost sample step, to hold the decoded ghost against. */
interface Truth {
  t: number;
  lap: number;
  branch: number;
  s: number;
  x: number;
  y: number;
  yaw: number;
  pitch: number;
  relRoll: number;
  off: boolean;
}

interface Flown {
  results: LapResult[];
  events: TrialEvent[];
  truth: Truth[];
  /** Every ghost saved, with its stored size. */
  ghosts: { run: GhostRun; bytes: number }[];
}

/** Flies `laps` laps of a time trial with the AI on the player's glider. */
function fly(def: TrackDef, store: MapStore, laps: number): Flown {
  const track = new Track(def, courseBounds(def.id));
  const entrant = playerEntrant(STARTER, noUpgrades());
  const race = new Race(track, { laps, seed: TRIAL_SEED, entrants: [entrant], physics: PHYSICS_AS_TUNED });
  const trial = new TrialRun(track, store, { glider: STARTER, upgrades: noUpgrades(), physics: { ...PHYSICS_AS_TUNED }, build: 'check' });
  const driver = new AiDriver(DRIVER_SKILL, driverSeed(TRIAL_SEED, 1));
  const out: Flown = { results: [], events: [], truth: [], ghosts: [] };
  let step = -1;
  let lapsDone = 0;
  const limit = Math.ceil((laps * LAP_TIMEOUT) / SIM_DT);
  for (let i = 0; i < limit; i++) {
    const p = race.player();
    const input = driver.drive(race.vehicles[0], track, race.racers, race.time);
    const events: RaceEvent[] = race.step(input);
    if (race.phase !== 'countdown') step++;
    for (const ev of events) if (ev.type === 'lap') lapsDone = ev.lap;
    if (step >= 0 && step % GHOST_STEPS_PER_SAMPLE === 0) out.truth.push(truthOf(track, p, step * SIM_DT, lapsDone));
    for (const ev of trial.step(race, events)) {
      out.events.push(ev);
      if (ev.type === 'lap') out.results.push(ev.result);
      if (ev.type === 'ghost') out.ghosts.push({ run: ev.record.run, bytes: ev.bytes });
    }
    if (p.crashed > 0) throw new Error(`${def.id}: the driver wrecked`);
    // One more second past the last line, so the last lap's closing sample is in.
    if (lapsDone >= laps && trial.lapTime > 1) break;
  }
  if (out.results.length < laps) throw new Error(`${def.id}: only ${out.results.length} of ${laps} laps`);
  return out;
}

function truthOf(track: Track, p: RacerState, t: number, lap: number): Truth {
  const r = track.ribbon(p.branch);
  return { t, lap, branch: p.branch, s: p.s, x: p.x, y: p.y, yaw: p.yaw, pitch: posePitch(r, p.s, p.vy, p.speed), relRoll: p.roll - r.bankAt(p.s), off: p.fall !== null };
}

const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** The stored ghost of lap `lap` (0-based) holds the true poses, and its clock reads time by distance. */
function checkGhost(def: TrackDef, store: MapStore, flown: Flown, lapStarts: number[], lap: number): void {
  const track = new Track(def, courseBounds(def.id));
  const rec = loadGhost(store, def.id);
  check(rec !== null, `${def.id}: a ghost is stored`);
  if (!rec) return;
  const run = rec.run;
  check(Math.abs(run.time - flown.results[lap].time) < 1e-9, `${def.id}: the ghost is lap ${lap + 1} (${run.time} vs ${flown.results[lap].time})`);
  check(run.t0 <= 0 && run.t0 > -1 / GHOST_HZ, `${def.id}: t0 ${run.t0} is the sample just before the line`);
  const start = lapStarts[lap];
  const pose: GhostPose = { branch: 0, s: 0, x: 0, y: 0, yaw: 0, pitch: 0, roll: 0, boosting: false };
  const clock = new GhostClock(run, track.raceLength);
  let worstS = 0;
  let worstX = 0;
  let worstClock = 0;
  let compared = 0;
  for (const tr of flown.truth) {
    const t = tr.t - start;
    if (t < run.t0 - 1e-9 || t > run.time) continue;
    const i = Math.round((t - run.t0) * GHOST_HZ);
    if (i >= run.frames.length - 1 || tr.off) continue;
    const g = ghostPoseAt(track, run, run.t0 + i / GHOST_HZ, pose);
    if (!g) {
      check(false, `${def.id}: no ghost pose at ${t.toFixed(2)} s`);
      continue;
    }
    compared++;
    check(g.branch === tr.branch, `${def.id}: ghost on ribbon ${g.branch} at ${t.toFixed(2)} s, flown on ${tr.branch}`);
    // s comes back through the course distance (ghost.ribbonS), so it carries d's quantum
    // (scaled onto a branch by its length against the stretch it skips).
    worstS = Math.max(worstS, Math.abs(ribbon(track, tr.branch).delta(g.s, tr.s)));
    worstX = Math.max(worstX, Math.abs(g.x - tr.x));
    check(Math.abs(g.y - tr.y) <= GHOST_POS_UNIT / 2 + SLACK, `${def.id}: height ${g.y} vs ${tr.y}`);
    check(angleGap(g.yaw, tr.yaw) <= GHOST_ANGLE_UNIT / 2 + SLACK, `${def.id}: yaw ${g.yaw} vs ${tr.yaw}`);
    check(Math.abs(g.pitch - tr.pitch) <= GHOST_ANGLE_UNIT / 2 + SLACK, `${def.id}: pitch ${g.pitch} vs ${tr.pitch}`);
    check(angleGap(g.roll, tr.relRoll) <= GHOST_ANGLE_UNIT / 2 + SLACK, `${def.id}: roll ${g.roll} vs ${tr.relRoll}`);
    // Time by distance: at this sample's own distance the clock reads its own time.
    const d = run.frames[i].d;
    if (i > 0 && d > run.frames[i - 1].d && t >= 0) worstClock = Math.max(worstClock, Math.abs(clock.timeAt(d) - t));
  }
  check(compared > run.frames.length / 2, `${def.id}: compared ${compared} of ${run.frames.length} frames`);
  // A branch's s is the course distance scaled by the branch's length over the stretch it skips.
  check(worstS < 4 * GHOST_DIST_UNIT, `${def.id}: s within ${worstS.toFixed(3)} m`);
  check(worstX <= GHOST_POS_UNIT / 2 + SLACK, `${def.id}: x within ${worstX.toFixed(3)} m`);
  check(worstClock < 2e-3, `${def.id}: the ghost's clock reads its own samples within ${(worstClock * 1000).toFixed(2)} ms`);
  // Between two samples the pose lies between them.
  const m = Math.floor(run.frames.length / 2);
  const mid = ghostPoseAt(track, run, run.t0 + (m + 0.5) / GHOST_HZ, pose);
  const a = run.frames[m];
  const b = run.frames[m + 1];
  if (mid && a.branch === b.branch) {
    const s = ribbonS(track, a.branch, (a.d + b.d) / 2);
    check(Math.abs(ribbon(track, a.branch).delta(mid.s, s)) < 1e-6 && Math.abs(mid.x - (a.x + b.x) / 2) < 1e-6, `${def.id}: interpolates halfway between samples`);
  }
  check(ghostPoseAt(track, run, run.time + 1, pose) === null, `${def.id}: no ghost past its run`);
}

function ribbon(track: Track, branch: number) {
  return track.ribbon(branch);
}

/** Splits sum to the lap, and the sector deltas to the lap's delta. */
function checkLaps(def: TrackDef, flown: Flown): void {
  for (const r of flown.results) {
    check(r.sectors.length === TRIAL_SECTORS, `${def.id}: lap ${r.lap} has ${TRIAL_SECTORS} sectors`);
    const sum = r.sectors.reduce((a, b) => a + b, 0);
    check(Math.abs(sum - r.time) < 1e-9, `${def.id}: lap ${r.lap} sectors sum to ${sum}, lap ${r.time}`);
    check(r.sectors.every((s) => s > 0), `${def.id}: lap ${r.lap} sectors all positive (${r.sectors.map((s) => s.toFixed(2))})`);
    if (r.delta !== null) {
      const ds = r.sectorDeltas.reduce((a: number, b) => a + (b ?? NaN), 0);
      check(Math.abs(ds - r.delta) < 1e-6, `${def.id}: lap ${r.lap} sector deltas sum to ${ds}, delta ${r.delta}`);
    }
  }
  const splits = flown.events.filter((e) => e.type === 'split');
  check(splits.length === flown.results.length * (TRIAL_SECTORS - 1), `${def.id}: ${splits.length} splits over ${flown.results.length} laps`);
}

/** A synthetic run at constant speed: the clock must read d / v. */
function checkClock(): void {
  const v = 150;
  const time = 20;
  const t0 = -0.04;
  const frames = Array.from({ length: Math.ceil((time - t0) * GHOST_HZ) + 1 }, (_, i) => {
    const t = t0 + i / GHOST_HZ;
    return { branch: -1, d: v * t, x: 0, y: 0, yaw: 0, pitch: 0, roll: 0, boosting: false, off: false };
  });
  const clock = new GhostClock({ time, t0, frames }, v * time);
  for (const d of [0.5, 37, 1000, 2222.2, v * time - 0.1]) check(Math.abs(clock.timeAt(d) - d / v) < 1e-9, `clock: ${d} m at ${clock.timeAt(d)} s, expected ${d / v}`);
  check(clock.timeAt(-5) === 0, 'clock: before the line reads 0');
  check(clock.timeAt(v * time * 2) === time, 'clock: past the line reads the lap time');
  // A slip backwards keeps the furthest reach, so the curve never runs back.
  const slipped = frames.map((f, i) => (i === 50 ? { ...f, d: f.d - 40 } : f));
  const c2 = new GhostClock({ time, t0, frames: slipped }, v * time);
  check(c2.timeAt(slipped[49].d + 1) >= c2.timeAt(slipped[49].d), 'clock: monotonic over a slip');
}

function checkCorrupt(): void {
  const store = new MapStore();
  const id = TRACKS[0].id;
  const warned: unknown[] = [];
  const warn = console.warn;
  console.warn = (...a: unknown[]) => warned.push(a);
  try {
    for (const bad of ['{not json', '{"v":1}', JSON.stringify({ v: 999 }), '[]']) {
      store.setItem(ghostKey(id), bad);
      check(loadGhost(store, id) === null, `corrupt "${bad}" loads as no ghost`);
      check(store.getItem(ghostKey(id)) === null, `corrupt "${bad}" is dropped`);
    }
  } finally {
    console.warn = warn;
  }
  check(warned.length === 4, `every drop warns (${warned.length})`);
  // Truncated frames: a stored ghost cut short must not decode.
  const real = new MapStore();
  fly(trackById(TRACKS[0].id), real, 1);
  const raw = real.getItem(ghostKey(id)) as string;
  const o = JSON.parse(raw);
  o.frames = o.frames.slice(0, Math.floor(o.frames.length / 2) & ~3);
  real.setItem(ghostKey(id), JSON.stringify(o));
  console.warn = () => {};
  try {
    check(loadGhost(real, id) === null, 'truncated frames load as no ghost');
  } finally {
    console.warn = warn;
  }
}

function lapStartsOf(results: LapResult[]): number[] {
  const out = [0];
  for (const r of results) out.push(out[out.length - 1] + r.time);
  return out;
}

const all = process.argv.includes('--all');
const circuits = TRACKS.filter((t) => t.course === 'circuit');
const sprints = TRACKS.filter((t) => t.course === 'sprint');
const picks = all ? TRACKS : [circuits.find((t) => (t.branches?.length ?? 0) > 0) ?? circuits[0], circuits[circuits.length - 1], sprints.find((t) => (t.branches?.length ?? 0) > 0) ?? sprints[0]];

checkClock();
checkCorrupt();
for (const def of picks) {
  const store = new MapStore();
  const laps = def.course === 'circuit' ? 3 : 1;
  const flown = fly(def, store, laps);
  checkLaps(def, flown);
  const best = flown.results.reduce((a, b) => (b.time < a.time ? b : a));
  checkGhost(def, store, flown, lapStartsOf(flown.results), best.lap - 1);
  // The first lap always sets a ghost; a later one only by beating it.
  check(flown.results[0].newBest && flown.results[0].best === null, `${def.id}: the first lap is a new best against nothing`);
  for (const r of flown.results.slice(1)) {
    check(r.best !== null && r.delta !== null && Math.abs(r.delta - (r.time - (r.best as number))) < 1e-9, `${def.id}: lap ${r.lap} reads its delta to the best`);
    check(r.newBest === r.time < (r.best as number), `${def.id}: lap ${r.lap} is a new best only when faster`);
  }
  check(flown.ghosts.length === flown.results.filter((r) => r.newBest).length, `${def.id}: one ghost saved per new best`);
  const size = flown.ghosts.at(-1)?.bytes ?? 0;
  const laps2 = flown.results.map((r) => r.time.toFixed(2)).join(' / ');
  const offCourse = flown.ghosts.at(-1)?.run.frames.filter((f) => f.off).length ?? 0;
  console.log(`${def.id.padEnd(14)} ${def.course.padEnd(8)} ${laps2.padEnd(26)} ghost ${(size / 1024).toFixed(1)} KB (${(size / best.time).toFixed(0)} B/s)${offCourse ? `, ${offCourse} frames off the course` : ''}`);

  // A second trial reads the stored ghost; its standing lap can't beat a flying best.
  if (def.course === 'circuit') {
    const r = fly(def, store, 1).results[0];
    check(r.best !== null && Math.abs((r.best as number) - best.time) < 1e-9, `${def.id}: a new run compares against the stored best`);
    check(r.delta !== null && r.delta >= 0 && !r.newBest, `${def.id}: the same driver's standing lap is no new best (${r.delta})`);
  }
}

if (failures > 0) {
  console.error(`trial-check: ${failures} failure(s)`);
  process.exit(1);
}
console.log(`trial-check: ok (dist unit ${GHOST_DIST_UNIT} m, ${GHOST_HZ} Hz)`);
