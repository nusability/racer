// Builds the field for a race. Deterministic: the same cup, standings and player give the same
// grid, so a retried race lines up exactly as before. Rivals are lifted to the player's
// machine (see the parity note in data/championships.ts): the race is won by driving.
import type { RaceEntrant, RacerStats } from '../core/types.ts';
import { PERFORMANCE_BOOST_WEIGHT, PLAYER_ENTRANT_ID, RIVAL_PARITY_SHARE } from '../data/championships.ts';
import type { CupDef, RivalDef } from '../data/championships.ts';
import { RACERS, racerById } from '../data/racers.ts';
import { MAX_UPGRADE_LEVEL, UPGRADES, effectiveStats } from '../data/upgrades.ts';
import type { UpgradeLevels } from '../data/upgrades.ts';

export const PLAYER_NAME = 'You';

/** Quick race: grid slot (0 = pole) the player starts from, i.e. mid-pack. */
const QUICK_RACE_PLAYER_SLOT = 3;

function uniformLevels(level: number): UpgradeLevels {
  if (level < 0 || level > MAX_UPGRADE_LEVEL) throw new Error(`Rival upgrade level ${level} out of range`);
  const levels = {} as UpgradeLevels;
  for (const u of UPGRADES) levels[u.id] = level;
  return levels;
}

export function playerEntrant(racerId: string, levels: UpgradeLevels): RaceEntrant {
  return {
    id: PLAYER_ENTRANT_ID,
    name: PLAYER_NAME,
    racerId,
    stats: effectiveStats(racerById(racerId), levels),
    isPlayer: true,
    skill: 0,
  };
}

/**
 * How fast a machine is, as one number: top speed, plus a little for boost (power x tank).
 * Handling and armour are left out: they are the gliders' character, not their pace.
 */
export function performanceIndex(stats: RacerStats): number {
  return stats.topSpeed * (1 + PERFORMANCE_BOOST_WEIGHT * stats.boostPower * stats.boostTank);
}

/** Upgrade order when lifting a rival: pace first, then character. */
const LIFT_ORDER: (keyof UpgradeLevels)[] = ['engine', 'thrusters', 'tank', 'steering', 'armor'];

/**
 * The rival's roster machine, lifted until it reaches `target` performance: its own glider is
 * upgraded one level at a time (round robin in LIFT_ORDER), then the next glider class up from
 * stock, and so on. Past the best glider fully upgraded there is nothing left to lift.
 */
function liftedMachine(rival: RivalDef, target: number): { racerId: string; stats: RacerStats } {
  const from = RACERS.findIndex((r) => r.id === rival.racerId);
  if (from < 0) throw new Error(`Rival ${rival.id}: unknown racer "${rival.racerId}"`);
  for (let g = from; ; g++) {
    const levels = uniformLevels(g === from ? rival.upgradeLevel : 0);
    for (;;) {
      const stats = effectiveStats(RACERS[g], levels);
      const next = LIFT_ORDER.reduce((low, id) => (levels[id] < levels[low] ? id : low), LIFT_ORDER[0]);
      const maxed = levels[next] >= MAX_UPGRADE_LEVEL;
      if (performanceIndex(stats) >= target || (maxed && g === RACERS.length - 1)) return { racerId: RACERS[g].id, stats };
      if (maxed) break;
      levels[next]++;
    }
  }
}

/** A rival on its roster machine, lifted to parity with `player` (when given). */
export function rivalEntrant(rival: RivalDef, player?: RaceEntrant): RaceEntrant {
  const target = player ? performanceIndex(player.stats) * RIVAL_PARITY_SHARE : 0;
  const machine = liftedMachine(rival, target);
  return {
    id: rival.id,
    name: rival.name,
    racerId: machine.racerId,
    // The rival's form: its machine trimmed to its own pace, so the field strings out.
    stats: { ...machine.stats, topSpeed: machine.stats.topSpeed * rival.pace },
    isPlayer: false,
    skill: rival.skill,
  };
}

/**
 * How much faster the cup's field is than `player`, as a fraction (0.02 = 2 % faster), or 0
 * when the player's machine is at or above it. The fastest roster machine sets the floor
 * rivals never drop below, so an under-upgraded glider faces a faster field; menus say so
 * up front rather than letting the race feel rigged.
 */
export function fieldEdge(cup: CupDef, player: RaceEntrant): number {
  const floor = Math.max(...cup.rivals.map((r) => performanceIndex(liftedMachine(r, 0).stats)));
  return Math.max(0, floor / performanceIndex(player.stats) - 1);
}

/**
 * Race 1: rivals strongest-first, player at the back. Later races: reverse standings, so the
 * leader starts last and has to fight through. Ties keep the roster order.
 */
export function championshipGrid(
  cup: CupDef,
  raceIndex: number,
  player: RaceEntrant,
  points: Record<string, number>,
): RaceEntrant[] {
  const rivals = cup.rivals.map((r) => rivalEntrant(r, player));
  if (raceIndex === 0) return [...rivals, player];
  const field = [...rivals, player];
  const order = new Map(field.map((e, i) => [e.id, i]));
  const pts = (id: string): number => points[id] ?? 0;
  return field.sort((a, b) => pts(a.id) - pts(b.id) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Quick race: the rival roster of the world's hardest open cup, player mid-pack. */
export function quickRaceGrid(cup: CupDef, player: RaceEntrant): RaceEntrant[] {
  const field = cup.rivals.map((r) => rivalEntrant(r, player));
  field.splice(QUICK_RACE_PLAYER_SLOT, 0, player);
  return field;
}
