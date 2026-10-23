// Builds the field for a race. Deterministic: the same cup, standings and player give the same
// grid, so a retried race lines up exactly as before.
import type { RaceEntrant } from '../core/types.ts';
import { PLAYER_ENTRANT_ID } from '../data/championships.ts';
import type { CupDef, RivalDef } from '../data/championships.ts';
import { racerById } from '../data/racers.ts';
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

export function rivalEntrant(rival: RivalDef): RaceEntrant {
  return {
    id: rival.id,
    name: rival.name,
    racerId: rival.racerId,
    stats: effectiveStats(racerById(rival.racerId), uniformLevels(rival.upgradeLevel)),
    isPlayer: false,
    skill: rival.skill,
  };
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
  const rivals = cup.rivals.map(rivalEntrant);
  if (raceIndex === 0) return [...rivals, player];
  const field = [...rivals, player];
  const order = new Map(field.map((e, i) => [e.id, i]));
  const pts = (id: string): number => points[id] ?? 0;
  return field.sort((a, b) => pts(a.id) - pts(b.id) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Quick race: the rival roster of the world's hardest open cup, player mid-pack. */
export function quickRaceGrid(cup: CupDef, player: RaceEntrant): RaceEntrant[] {
  const field = cup.rivals.map(rivalEntrant);
  field.splice(QUICK_RACE_PLAYER_SLOT, 0, player);
  return field;
}
