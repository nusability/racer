// The one earn computation: what a finished race pays. Career applies it; nothing else pays.
import {
  CUP_REPEAT_BONUS_FRACTION,
  CUP_WIN_BONUS,
  PLACE_PAYOUT,
  QUICK_RACE_PAYOUT_FRACTION,
  TIER_PAYOUT_MULTIPLIER,
} from '../data/economy.ts';
import type { RaceMode } from './types.ts';

export interface PayoutInput {
  mode: RaceMode;
  /** 1-based finishing place. */
  place: number;
  tier: number;
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

function tierMultiplier(tier: number): number {
  const m = TIER_PAYOUT_MULTIPLIER[tier - 1];
  if (m === undefined) throw new Error(`No payout multiplier for tier ${tier}`);
  return m;
}

export function racePayout(p: PayoutInput): Payout {
  const base = PLACE_PAYOUT[p.place - 1];
  if (base === undefined) throw new Error(`No payout for place ${p.place}`);
  let race = base * tierMultiplier(p.tier);
  // Quick races scale with distance so a 1-lap sprint can't be farmed at full rate.
  if (p.mode === 'quick') race *= QUICK_RACE_PAYOUT_FRACTION * (p.laps / p.standardLaps);
  let cupBonus = 0;
  if (p.cupWin) {
    const bonus = CUP_WIN_BONUS[p.tier - 1];
    if (bonus === undefined) throw new Error(`No cup bonus for tier ${p.tier}`);
    cupBonus = bonus * (p.cupWin.firstTime ? 1 : CUP_REPEAT_BONUS_FRACTION);
  }
  const raceCredits = Math.round(race);
  const bonusCredits = Math.round(cupBonus);
  return { race: raceCredits, cupBonus: bonusCredits, total: raceCredits + bonusCredits };
}
