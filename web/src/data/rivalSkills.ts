// AI skill of the five rivals in a cup, strongest first, by tier. One band per tier in every
// world (worlds add variety, tiers add difficulty). Rivals race on the player's machine
// (see game/opponents.ts), so these bands are the whole difficulty: tools/sim-check.ts races
// stand-in players against them (a sloppy novice should finish mid-pack in a rookie cup).
export const TIER_SKILLS: readonly (readonly number[])[] = [
  [0.44, 0.41, 0.38, 0.35, 0.32],
  [0.65, 0.62, 0.59, 0.56, 0.53],
  [0.63, 0.61, 0.59, 0.56, 0.54],
];
