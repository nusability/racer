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
import { SIM_DT } from '../src/data/tuning.ts';
import type { PlayerInput } from '../src/core/types.ts';

/** Both bots hold boost through the countdown, so they get the launch boost at GO. */
const HOLD_BOOST: PlayerInput = { steer: 0, nudge: 0, brake: false, boost: true };
/** A race longer than this many seconds per lap means someone is stuck. */
const TIMEOUT_PER_LAP = 240;
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
  /** Takes shortcuts and swerves for cells (otherwise only the cells on its line). */
  routes: boolean;
}

/** A self-described bad racer: late, wobbly, boost always held, never brakes. */
export const NOVICE: PlayerBot = { name: 'novice', eyes: 0.4, delay: 0.25, holdBoost: true, brakes: false, routes: false };
/** A decent player: a fair line, quicker hands, boosts on the straights, brakes for hairpins. */
export const DECENT: PlayerBot = { name: 'decent', eyes: 0.5, delay: 0.15, holdBoost: false, brakes: true, routes: false };
/** A skilled player: a sharp line, quick hands, takes shortcuts and goes for cells. */
export const SKILLED: PlayerBot = { name: 'skilled', eyes: 0.9, delay: 0.1, holdBoost: false, brakes: true, routes: true };

/** The bot's eyes are an AI driver; what it does with them is the bot's. */
export function botDriver(race: Race, seed: number, bot: PlayerBot): (r: Race) => PlayerInput {
  const index = race.entrants.findIndex((e) => e.isPlayer);
  const eyes = new AiDriver(bot.eyes, seed, { shortcuts: bot.routes, cellDetours: bot.routes });
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
    return { steer: 0, nudge, brake: bot.brakes && wanted.brake, boost: bot.holdBoost || wanted.boost };
  };
}

interface Outcome {
  place: number;
  /** Seconds behind the winner (0 when it won); Infinity when it wrecked. */
  gap: number;
  /** Seconds ahead of the best rival when it won (negative = behind it); NaN when it wrecked. */
  margin: number;
  /** The wreck that ended its race, or null when it finished. */
  wreck: string | null;
  /** A rival still running was a lap or more behind when the bot finished. */
  lapped: boolean;
  crashes: number;
  /** Championship points every entrant scored, by entrant id. */
  points: Map<string, number>;
}

function raceCup(cup: CupDef, track: Track, seed: number, bot: PlayerBot, racerId: string, levels: UpgradeLevels): Outcome {
  const field = championshipGrid(cup, 0, playerEntrant(racerId, levels), {});
  const race = new Race(track, { laps: track.def.laps, seed, entrants: field });
  const drive = botDriver(race, seed, bot);
  const maxSteps = Math.ceil((track.def.laps * TIMEOUT_PER_LAP) / SIM_DT);
  for (let n = 0; race.phase !== 'finished'; n++) {
    if (n > maxSteps) throw new Error(`${cup.id}/${track.def.id}: ${bot.name} race timed out`);
    race.step(race.phase === 'countdown' ? HOLD_BOOST : drive(race));
  }
  const me = race.player();
  const index = race.racers.indexOf(me);
  const c = race.vehicles[index].drive.crashes;
  const wreck = (Object.keys(c) as (keyof typeof c)[]).find((k) => c[k] > 0) ?? null;
  if (me.finishTime === null && wreck === null) throw new Error(`${cup.id}/${track.def.id}: ${bot.name} neither finished nor wrecked`);
  const points = new Map(race.results().map((r) => [r.id, CUP_POINTS[r.place - 1]]));
  const rivals = race.racers.filter((r) => r !== me);
  const winner = Math.min(...race.racers.map((r) => r.finishTime ?? Infinity));
  const bestRival = Math.min(...rivals.map((r) => r.finishTime ?? Infinity));
  const lapped = me.finishTime !== null && rivals.some((r) => r.crashed <= 0 && r.distance < me.distance - track.length);
  return {
    place: me.place,
    gap: me.finishTime === null ? Infinity : me.finishTime - winner,
    margin: me.finishTime === null ? NaN : bestRival - me.finishTime,
    wreck,
    lapped,
    crashes: c.destroyed + c.fell + c.offEdge + c.loopStall + c.obstacle + c.hazard,
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
  const reasons = [...new Set(wrecks.map((o) => o.wreck))].map((r) => `${r} ${wrecks.filter((o) => o.wreck === r).length}`).join(', ');
  console.log(
    `  total: race wins ${wins}/${all.length}, cups won ${Math.round(res.cupWinShare * STUDY_RUNS)}/${STUDY_RUNS}, ` +
      `within 3 s of 1st ${within3}/${all.length}, places ${counts}, DNF ${wrecks.length}/${all.length}${reasons ? ` (${reasons})` : ''}`,
  );
  const margins = all.filter((o) => o.wreck === null && o.margin > 0).map((o) => o.margin).sort((a, b) => a - b);
  if (margins.length) {
    console.log(
      `  winning margins: median ${fmt(margins[Math.floor(margins.length / 2)])} s, max ${fmt(margins[margins.length - 1])} s; ` +
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
    cupStudy(cup, DECENT, a.racerId, levels, a.label);
  }
}
