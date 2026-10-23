// Player bots and the championship study for the headless sim check: each cup's real rival
// field (built the way the game builds it) raced by stand-ins for a human, so cup balance is
// measured rather than argued.

import { TRACKS } from '../src/data/tracks/index.ts';
import { CUPS, type CupDef } from '../src/data/championships.ts';
import { noUpgrades, type UpgradeLevels } from '../src/data/upgrades.ts';
import { championshipGrid, playerEntrant } from '../src/game/opponents.ts';
import { Track } from '../src/core/track.ts';
import { Race } from '../src/core/race.ts';
import { AiDriver } from '../src/core/ai.ts';
import { steerRate } from '../src/core/vehicle.ts';
import { SIM_DT } from '../src/data/tuning.ts';
import type { PlayerInput } from '../src/core/types.ts';

/** Both bots hold boost through the countdown, so they get the launch boost at GO. */
const HOLD_BOOST: PlayerInput = { steer: 0, nudge: 0, brake: false, boost: true };
/** A race longer than this many seconds per lap means someone is stuck. */
const TIMEOUT_PER_LAP = 240;
/** Races per track per bot (different seeds) to average out luck. */
export const STUDY_RUNS = 5;
const STUDY_SEED = 7000;

/** How a stand-in human drives. They all steer by drag (nudge) and take no shortcuts. */
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
}

/** A self-described bad racer: late, wobbly, boost always held, never brakes. */
export const NOVICE: PlayerBot = { name: 'novice', eyes: 0.4, delay: 0.25, holdBoost: true, brakes: false };
/** A decent player: a fair line, quicker hands, boosts on the straights, brakes for hairpins. */
export const DECENT: PlayerBot = { name: 'decent', eyes: 0.5, delay: 0.15, holdBoost: false, brakes: true };

/** Cells are collected only when they are on the bot's line: no detours, no shortcuts. */
export function botDriver(race: Race, seed: number, bot: PlayerBot): (r: Race) => PlayerInput {
  const index = race.entrants.findIndex((e) => e.isPlayer);
  const eyes = new AiDriver(bot.eyes, seed, { shortcuts: false, cellDetours: false });
  const delay = Math.round(bot.delay / SIM_DT);
  const seen: number[] = [];
  return (r: Race) => {
    const v = r.vehicles[index];
    const wanted = eyes.drive(v, r.track, r.racers);
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
  /** Seconds behind the winner (0 when it won). */
  gap: number;
  crashes: number;
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
  if (me.finishTime === null) throw new Error(`${cup.id}/${track.def.id}: ${bot.name} never finished`);
  const winner = Math.min(...race.racers.map((r) => r.finishTime ?? Infinity));
  const c = race.vehicles[race.racers.indexOf(me)].drive.crashes;
  return { place: me.place, gap: me.finishTime - winner, crashes: c.destroyed + c.fell + c.obstacle };
}

/** Prints, per track, the bot's place distribution and gap to the winner, then the cup totals. */
export function cupStudy(cup: CupDef, bot: PlayerBot, racerId: string, levels: UpgradeLevels, machine: string) {
  console.log(`\n${cup.name} vs ${bot.name} bot on ${machine}`);
  const all: Outcome[] = [];
  for (const trackId of cup.trackIds) {
    const def = TRACKS.find((t) => t.id === trackId);
    if (!def) throw new Error(`${cup.id}: unknown track ${trackId}`);
    const track = new Track(def);
    const runs = Array.from({ length: STUDY_RUNS }, (_, k) => raceCup(cup, track, STUDY_SEED + k, bot, racerId, levels));
    all.push(...runs);
    const gaps = runs.map((r) => r.gap).sort((a, b) => a - b);
    console.log(
      `  ${trackId.padEnd(12)} places ${runs.map((r) => r.place).join(',')}  ` +
        `gap to 1st median ${gaps[Math.floor(gaps.length / 2)].toFixed(1)} s (max ${gaps[gaps.length - 1].toFixed(1)})  ` +
        `crashes/race ${(runs.reduce((a, r) => a + r.crashes, 0) / runs.length).toFixed(1)}`,
    );
  }
  const wins = all.filter((o) => o.place === 1).length;
  const within3 = all.filter((o) => o.gap <= 3).length;
  const counts = [1, 2, 3, 4, 5, 6].map((p) => `${p}:${all.filter((o) => o.place === p).length}`).join(' ');
  console.log(
    `  total: wins ${wins}/${all.length}, within 3 s of 1st ${within3}/${all.length}, ` +
      `mean place ${(all.reduce((a, o) => a + o.place, 0) / all.length).toFixed(1)}, places ${counts}`,
  );
}

/**
 * The player machine each cup tier assumes (see the header of data/championships.ts). Every
 * world's rookie/pro/elite cups share their tier's rival band, so they share this too.
 */
const ASSUMED: Record<number, { racerId: string; levels: Partial<UpgradeLevels>; label: string }> = {
  1: { racerId: 'dustwing', levels: {}, label: 'stock Dustwing' },
  2: { racerId: 'dustwing', levels: { engine: 2, thrusters: 2, steering: 1 }, label: 'Dustwing E2 T2 S1' },
  3: { racerId: 'quadra', levels: { engine: 2, thrusters: 2, steering: 2 }, label: 'Quadra Vex E2 T2 S2' },
};

export function allCupStudies() {
  for (const cup of CUPS) {
    const a = ASSUMED[cup.tier];
    if (!a) throw new Error(`sim-cups: no assumed player machine for tier ${cup.tier} (cup ${cup.id})`);
    const levels = { ...noUpgrades(), ...a.levels };
    // The first cup is the one a bad racer must be able to win; later cups assume a decent player.
    if (cup.tier === 1) cupStudy(cup, NOVICE, a.racerId, levels, a.label);
    cupStudy(cup, DECENT, a.racerId, levels, a.label);
  }
}
