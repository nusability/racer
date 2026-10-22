// Economy tunables. src/game/economy.ts is the only reader; credits are integers everywhere.
//
// Pacing target (a decent player averages roughly 2nd place):
// - 2nd racer (3,000) after 3-4 Dust Cup races,
// - the last racer (30,000) late in the Mirage Grand Prix,
// - full upgrades on one racer (~69,000) about one Grand Prix's winnings.

/** Championship payout at tier 1 by finishing place (1st..6th). */
export const PLACE_PAYOUT: number[] = [1000, 750, 550, 400, 250, 150];

/** Payout multiplier per cup tier (index = tier - 1). */
export const TIER_PAYOUT_MULTIPLIER: number[] = [1, 4, 12];

/** Bonus for winning a cup, per tier (index = tier - 1). */
export const CUP_WIN_BONUS: number[] = [2000, 6000, 25000];

/** Fraction of the cup-win bonus paid for winning a cup already won before. */
export const CUP_REPEAT_BONUS_FRACTION = 0.25;

/** Quick race pays this fraction of a championship race at the player's tier. */
export const QUICK_RACE_PAYOUT_FRACTION = 0.5;
