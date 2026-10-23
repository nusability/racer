// The one earn computation: what a finished race pays. Career applies it; nothing else pays.
import {
  CUP_REPEAT_BONUS_FRACTION,
  CUP_WIN_BONUS,
  PLACE_PAYOUT,
  QUICK_RACE_PAYOUT_FRACTION,
  TIER_PAYOUT_MULTIPLIER,
  WORLD_PAYOUT_MULTIPLIER,
} from '../data/economy.ts';
import type { CupDef } from '../data/championships.ts';
import { WORLDS } from '../data/worlds.ts';
import type { RaceMode } from './types.ts';

export interface PayoutInput {
  mode: RaceMode;
  /** 1-based finishing place. */
  place: number;
  /**
   * The cup whose rate applies: the cup raced (championship) or, for a quick race, the
   * hardest cup won in the track's world (its rookie cup before any win there).
   */
  cup: CupDef;
  laps: number;
  /** The track's standard lap count; quick races pay per lap against it. */
  standardLaps: number;
  /** Set when this race decided a cup the player won. */
  cupWin: { firstTime: boolean } | null;
}

export interface Payout {
  race: number;
  cupBonus: number;
  total: number;
}

function pick(table: number[], index: number, what: string): number {
  const v = table[index];
  if (v === undefined) throw new Error(`No ${what} at index ${index} in data/economy.ts`);
  return v;
}

function worldMultiplier(cup: CupDef): number {
  const world = WORLDS.findIndex((w) => w.id === cup.worldId);
  if (world < 0) throw new Error(`Cup "${cup.id}" is in unknown world "${cup.worldId}"`);
  return pick(WORLD_PAYOUT_MULTIPLIER, world, 'world multiplier');
}

export function racePayout(p: PayoutInput): Payout {
  const world = worldMultiplier(p.cup);
  let race = pick(PLACE_PAYOUT, p.place - 1, 'place payout') * pick(TIER_PAYOUT_MULTIPLIER, p.cup.tier - 1, 'tier multiplier') * world;
  // Quick races pay per lap up to the standard distance: shorter pays less, longer no more.
  if (p.mode === 'quick') race *= QUICK_RACE_PAYOUT_FRACTION * (Math.min(p.laps, p.standardLaps) / p.standardLaps);
  let cupBonus = 0;
  if (p.cupWin) {
    // The bonus table is already per tier; only the world scales it.
    const bonus = pick(CUP_WIN_BONUS, p.cup.tier - 1, 'cup bonus') * world;
    cupBonus = bonus * (p.cupWin.firstTime ? 1 : CUP_REPEAT_BONUS_FRACTION);
  }
  const raceCredits = Math.round(race);
  const bonusCredits = Math.round(cupBonus);
  return { race: raceCredits, cupBonus: bonusCredits, total: raceCredits + bonusCredits };
}
