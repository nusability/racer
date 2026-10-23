// Player bots and the championship study for the headless sim check: each cup's real rival
// field (built the way the game builds it) raced by stand-ins for a human, so cup balance is
// measured rather than argued.

import { TRACKS } from '../src/data/tracks/index.ts';
import { CUPS, CUP_POINTS, PLAYER_ENTRANT_ID, type CupDef } from '../src/data/championships.ts';
import { noUpgrades, type UpgradeLevels } from '../src/data/upgrades.ts';
import { championshipGrid, playerEntrant } from '../src/game/opponents.ts';
import { Track } from '../src/core/track.ts';
import { Race } from '../src/core/race.ts';
import { AiDriver } from '../src/core/ai.ts';
import { steerRate } from '../src/core/handling.ts';
import { PERFECT_START_WINDOW, SIM_DT } from '../src/data/tuning.ts';
import type { PlayerInput } from '../src/core/types.ts';

/** Every bot keeps off boost through the countdown (touching it floods the engines). */
const WAIT: PlayerInput = { steer: 0, nudge: 0, brake: false, boost: false };
/** A race longer than this many seconds per lap means someone is stuck. */
const TIMEOUT_PER_LAP = 240;
/** Seconds after GO before position changes count: the grid sorts itself out first. */
const START_SHUFFLE = 5;
/** Races per track per bot (different seeds) to average out luck. */
export const STUDY_RUNS = 5;
const STUDY_SEED = 7000;

/** How a stand-in human drives. They all steer by drag (nudge). */
export interface PlayerBot {
  name: string;
  /** Skill of the AI "eyes" that read the road for it (line quality, berth around rocks). */
  eyes: number;
  /** Seconds between seeing and acting. */
  delay: number;
  /** Holds boost whenever there is tank (true) or boosts where it pays, like an AI (false). */
  holdBoost: boolean;
  /** Uses the air brake where the eyes would. */
  brakes: boolean;
  /** Takes shortcuts. */
  shortcuts: boolean;
  /** Swerves for cells (otherwise only the cells on its line). */
  cells: boolean;
}

/** A self-described bad racer: late, wobbly, boost always held, never brakes. */
export const NOVICE: PlayerBot = { name: 'novice', eyes: 0.4, delay: 0.25, holdBoost: true, brakes: false, shortcuts: false, cells: false };
/** A decent player: a fair line, quicker hands, boosts on the straights, brakes for hairpins, picks up cells. */
export const DECENT: PlayerBot = { name: 'decent', eyes: 0.5, delay: 0.15, holdBoost: false, brakes: true, shortcuts: false, cells: true };
/** A skilled player: a sharp line, quick hands, takes shortcuts and goes for cells. */
export const SKILLED: PlayerBot = { name: 'skilled', eyes: 0.9, delay: 0.1, holdBoost: false, brakes: true, shortcuts: true, cells: true };

/** The bot's eyes are an AI driver; what it does with them is the bot's. */
export function botDriver(race: Race, seed: number, bot: PlayerBot): (r: Race) => PlayerInput {
  const index = race.entrants.findIndex((e) => e.isPlayer);
  const eyes = new AiDriver(bot.eyes, seed, { shortcuts: bot.shortcuts, cellDetours: bot.cells });
  const delay = Math.round(bot.delay / SIM_DT);
  const seen: number[] = [];
  return (r: Race) => {
    const v = r.vehicles[index];
    const wanted = eyes.drive(v, r.track, r.racers, r.time);
    seen.push(eyes.aimX);
    // Drag control: the finger puts the target where the player saw the gap, late.
    const aim = seen.length > delay ? (seen.shift() as number) : v.targetX;
    // A thumb drags smoothly: the target moves no faster than full steer would move it.
    const reach = steerRate(v.stats) * SIM_DT;
    const nudge = Math.max(-reach, Math.min(reach, aim - v.targetX));
    // At GO it reacts a reaction time late, then stabs boost for the launch.
    if (r.time < bot.delay) return { steer: 0, nudge, brake: false, boost: false };
    const launch = r.time < bot.delay + PERFECT_START_WINDOW / 2;
    return { steer: 0, nudge, brake: bot.brakes && wanted.brake, boost: launch || bot.holdBoost || wanted.boost };
  };
}

interface Outcome {
  place: number;
  /** Seconds behind the winner (0 when it won); Infinity when it wrecked. */
  gap: number;
  /**
   * Seconds ahead of the best rival still running (negative = behind it); NaN when it wrecked,
   * Infinity when every rival wrecked.
   */
  margin: number;
  /** The wreck that ended its race, or null when it finished. */
  wreck: string | null;
  /** A rival still running was a lap or more behind when the bot finished. */
  lapped: boolean;
  /** Hull lost by the end (1 = destroyed). */
  damage: number;
  /** Times the lead changed hands after the start shuffle. */
  leadChanges: number;
  /** Places the bot lost to rivals going past it, and gained passing them (after the start). */
  passed: number;
  overtakes: number;
  /** Share of its race the bot spent boosting. */
  boostShare: number;
  /** Championship points every entrant scored, by entrant id. */
  points: Map<string, number>;
}

function raceCup(cup: CupDef, track: Track, seed: number, bot: PlayerBot, racerId: string, levels: UpgradeLevels): Outcome {
  const field = championshipGrid(cup, 0, playerEntrant(racerId, levels), {});
  const race = new Race(track, { laps: track.def.laps, seed, entrants: field });
  const drive = botDriver(race, seed, bot);
  const maxSteps = Math.ceil((track.def.laps * TIMEOUT_PER_LAP) / SIM_DT);
  const me = race.player();
  // The race ends a grace period after the player finishes, so a rival still running then
  // gets its margin from how far it had left at the player's finish, at its average pace.
  let rivalEta = Infinity;
  let leader = '';
  let leadChanges = 0;
  let passed = 0;
  let overtakes = 0;
  let boosting = 0;
  let place = me.place;
  for (let n = 0; race.phase !== 'finished'; n++) {
    if (n > maxSteps) throw new Error(`${cup.id}/${track.def.id}: ${bot.name} race timed out`);
    race.step(race.phase === 'countdown' ? WAIT : drive(race));
    if (race.phase === 'countdown' || me.crashed > 0 || me.finishTime !== null) continue;
    if (me.boosting) boosting += SIM_DT;
    const first = race.racers.find((r) => r.place === 1);
    if (race.time > START_SHUFFLE && first && leader !== '' && first.id !== leader) leadChanges++;
    if (first) leader = first.id;
    if (race.time > START_SHUFFLE) {
      if (me.place > place) passed += me.place - place;
      if (me.place < place) overtakes += place - me.place;
    }
    place = me.place;
    if (me.finishTime !== null && rivalEta === Infinity) {
      for (const r of race.racers) {
        if (r === me || r.crashed > 0) continue;
        const eta = r.finishTime ?? race.time + (track.length * track.def.laps - r.distance) / (r.distance / race.time);
        rivalEta = Math.min(rivalEta, eta);
      }
    }
  }
  const index = race.racers.indexOf(me);
  const c = race.vehicles[index].drive.crashes;
  const wreck = (Object.keys(c) as (keyof typeof c)[]).find((k) => c[k] > 0) ?? null;
  if (me.finishTime === null && wreck === null) throw new Error(`${cup.id}/${track.def.id}: ${bot.name} neither finished nor wrecked`);
  const points = new Map(race.results().map((r) => [r.id, CUP_POINTS[r.place - 1]]));
  const rivals = race.racers.filter((r) => r !== me);
  const winner = Math.min(...race.racers.map((r) => r.finishTime ?? Infinity));
  const lapped = me.finishTime !== null && rivals.some((r) => r.crashed <= 0 && r.distance < me.distance - track.length);
  return {
    place: me.place,
    gap: me.finishTime === null ? Infinity : me.finishTime - winner,
    margin: me.finishTime === null ? NaN : rivalEta - me.finishTime,
    wreck,
    lapped,
    damage: me.damage,
    leadChanges,
    passed,
    overtakes,
    boostShare: boosting / Math.max(SIM_DT, me.finishTime ?? race.time),
    points,
  };
}

export interface StudyResult {
  /** Per track, the STUDY_RUNS outcomes (run k of every track forms championship k). */
  byTrack: { trackId: string; runs: Outcome[] }[];
  /** How often each place (index 0 = 1st) came up over all races. */
  placeShare: number[];
  /** Share of the STUDY_RUNS championships (seed k's races, real cup points) the bot won. */
  cupWinShare: number;
}

/** Races a cup's real field against the bot on the given machine. */
export function studyCup(cup: CupDef, bot: PlayerBot, racerId: string, levels: UpgradeLevels): StudyResult {
  const byTrack = cup.trackIds.map((trackId) => {
    const def = TRACKS.find((t) => t.id === trackId);
    if (!def) throw new Error(`${cup.id}: unknown track ${trackId}`);
    const track = new Track(def);
    return { trackId, runs: Array.from({ length: STUDY_RUNS }, (_, k) => raceCup(cup, track, STUDY_SEED + k, bot, racerId, levels)) };
  });
  const all = byTrack.flatMap((t) => t.runs);
  const placeShare = CUP_POINTS.map((_, i) => all.filter((o) => o.place === i + 1).length / all.length);
  let cupWins = 0;
  for (let k = 0; k < STUDY_RUNS; k++) {
    const totals = new Map<string, number>();
    for (const t of byTrack) for (const [id, pts] of t.runs[k].points) totals.set(id, (totals.get(id) ?? 0) + pts);
    const mine = totals.get(PLAYER_ENTRANT_ID) ?? 0;
    // A tie goes against the player: the standings tiebreak is the last race, not modelled here.
    if ([...totals].every(([id, pts]) => id === PLAYER_ENTRANT_ID || pts < mine)) cupWins++;
  }
  return { byTrack, placeShare, cupWinShare: cupWins / STUDY_RUNS };
}

/** Prints, per track, the bot's place distribution and gap to the winner, then the cup totals. */
export function cupStudy(cup: CupDef, bot: PlayerBot, racerId: string, levels: UpgradeLevels, machine: string): StudyResult {
  console.log(`\n${cup.name} vs ${bot.name} bot on ${machine}`);
  const res = studyCup(cup, bot, racerId, levels);
  const fmt = (x: number) => x.toFixed(1);
  for (const { trackId, runs } of res.byTrack) {
    const gaps = runs.filter((r) => r.wreck === null).map((r) => r.gap).sort((a, b) => a - b);
    const gapText = gaps.length ? `gap to 1st median ${fmt(gaps[Math.floor(gaps.length / 2)])} s (max ${fmt(gaps[gaps.length - 1])})` : 'no finishes';
    console.log(`  ${trackId.padEnd(12)} places ${runs.map((r) => (r.wreck ? 'X' : String(r.place))).join(',')}  ${gapText}`);
  }
  const all = res.byTrack.flatMap((t) => t.runs);
  const wins = all.filter((o) => o.place === 1 && o.wreck === null).length;
  const within3 = all.filter((o) => o.gap <= 3).length;
  const counts = [1, 2, 3, 4, 5, 6].map((p) => `${p}:${all.filter((o) => o.place === p && o.wreck === null).length}`).join(' ');
  const wrecks = all.filter((o) => o.wreck !== null);
  const finished = all.filter((o) => o.wreck === null);
  const reasons = [...new Set(wrecks.map((o) => o.wreck))].map((r) => `${r} ${wrecks.filter((o) => o.wreck === r).length}`).join(', ');
  console.log(
    `  total: race wins ${wins}/${all.length}, cups won ${Math.round(res.cupWinShare * STUDY_RUNS)}/${STUDY_RUNS}, ` +
      `within 3 s of 1st ${within3}/${all.length}, places ${counts}, DNF ${wrecks.length}/${all.length}${reasons ? ` (${reasons})` : ''}, ` +
      `mean hull lost by finishers ${Math.round((100 * finished.reduce((t, o) => t + o.damage, 0)) / Math.max(1, finished.length))}%`,
  );
  const mean = (f: (o: Outcome) => number) => fmt(all.reduce((t, o) => t + f(o), 0) / all.length);
  console.log(
    `  per race: mean place ${mean((o) => o.place)}, lead changes ${mean((o) => o.leadChanges)}, bot passed ${mean((o) => o.passed)}x, ` +
      `bot overtook ${mean((o) => o.overtakes)}x, bot boosting ${Math.round(100 * all.reduce((t, o) => t + o.boostShare, 0) / all.length)}% of its race`,
  );
  const margins = all.filter((o) => o.wreck === null && o.margin > 0 && Number.isFinite(o.margin)).map((o) => o.margin).sort((a, b) => a - b);
  if (margins.length) {
    const bands = [1, 3, 6, 10, Infinity];
    const counts = bands.map((hi, i) => margins.filter((m) => m >= (bands[i - 1] ?? 0) && m < hi).length);
    console.log(
      `  winning margins: median ${fmt(margins[Math.floor(margins.length / 2)])} s, max ${fmt(margins[margins.length - 1])} s ` +
        `(<1 s ${counts[0]}, 1-3 ${counts[1]}, 3-6 ${counts[2]}, 6-10 ${counts[3]}, 10+ ${counts[4]}); ` +
        `lapped a rival in ${all.filter((o) => o.lapped).length}/${all.length} races`,
    );
  }
  return res;
}

/**
 * The player machine each cup tier assumes (see the header of data/championships.ts). Every
 * world's rookie/pro/elite cups share their tier's rival band, so they share this too.
 */
export const ASSUMED: Record<number, { racerId: string; levels: Partial<UpgradeLevels>; label: string }> = {
  1: { racerId: 'dustwing', levels: {}, label: 'stock Dustwing' },
  2: { racerId: 'scarab', levels: { engine: 1 }, label: 'Scarab GT E1' },
  3: { racerId: 'sirocco', levels: { engine: 1, thrusters: 1, steering: 1 }, label: 'Sirocco E1 T1 S1' },
};

/** The best glider fully upgraded: what a leaked save (or a long career) brings to cup 1. */
const OVER_UPGRADED = { racerId: 'halo', levels: { engine: 5, thrusters: 5, steering: 5, tank: 5, armor: 5 }, label: 'maxed Halo Comet' };

export function allCupStudies() {
  for (const cup of CUPS) {
    const a = ASSUMED[cup.tier];
    if (!a) throw new Error(`sim-cups: no assumed player machine for tier ${cup.tier} (cup ${cup.id})`);
    const levels = { ...noUpgrades(), ...a.levels };
    // The first cup is the one a bad racer must be able to win and a good one must not run
    // away with; later cups assume a decent player.
    if (cup.tier === 1) {
      cupStudy(cup, NOVICE, a.racerId, levels, a.label);
      cupStudy(cup, SKILLED, a.racerId, levels, a.label);
    }
    // Machine parity: an over-upgraded bad driver must not steamroll the first cup.
    if (cup === CUPS[0]) cupStudy(cup, NOVICE, OVER_UPGRADED.racerId, OVER_UPGRADED.levels, OVER_UPGRADED.label);
    cupStudy(cup, DECENT, a.racerId, levels, a.label);
  }
}
