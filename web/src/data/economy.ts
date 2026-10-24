// Economy tunables. src/game/economy.ts is the only reader; credits are integers everywhere.
//
// Pacing (a decent player averages about 2nd and wins about half the cups it enters; the
// numbers are walked through every world by tools/sim-economy.ts):
// - Dust Cup, first run: a couple of level-1 upgrades, or a start on saving for glider #2.
// - Glider #2 during the desert's pro cup; the Halo Comet (top of the gliders sold from the
//   start) at the end of the second world.
// - Neon Meridian's own gliders (data/racers.ts) are what the city's pay buys: the Lumen Shard
//   with the Neon Cup's winnings, the Orbis Gyre with the Zenith Crown's. Their upgrade sets
//   (3.4x and 4.6x the starter's, via UPGRADE_CLASS_PRICE_STEP) are the long tail after that.
// - Elderwood sells no glider of its own: its pay finishes the Orbis Gyre's upgrade set by the
//   elite cup, and after that credits only pile up.
// - A full upgrade set on the starter costs about a whole world's winnings.

/** Championship payout at tier 1 in the first world, by finishing place (1st..6th). */
// Raised 40% once rival parity made upgrades a feel choice rather than a way to win cups.
export const PLACE_PAYOUT: number[] = [1400, 1050, 770, 560, 350, 210];

/** Payout multiplier per cup tier (index = tier - 1): harder cups pay more, without dwarfing. */
export const TIER_PAYOUT_MULTIPLIER: number[] = [1, 1.6, 2.4];

/**
 * Payout multiplier per world, by its index in WORLDS (desert, coast, ice, city, forest). A new
 * world appends one entry; a world without one is an error, not a silent default. From the
 * coast on each world pays 1.5x the one before (city: a Neon Cup win pays 5040 against the
 * Frost Cup's 3360; Elderwood's Fernway Cup 7560), so a new world is felt in the garage without
 * its rookie cup out-paying the last elite (Zenith Crown: 12096).
 */
export const WORLD_PAYOUT_MULTIPLIER: number[] = [1, 1.6, 2.4, 3.6, 5.4];

/** Bonus for winning a cup, per tier (index = tier - 1), before the world multiplier. */
export const CUP_WIN_BONUS: number[] = [1200, 2400, 4000];

/** Fraction of the cup-win bonus paid for winning a cup already won before. */
export const CUP_REPEAT_BONUS_FRACTION = 0.25;

/**
 * Quick race pays this fraction of a championship race at the hardest cup the player has won
 * in that track's world (the rookie cup's rate before any win there).
 */
export const QUICK_RACE_PAYOUT_FRACTION = 0.35;
