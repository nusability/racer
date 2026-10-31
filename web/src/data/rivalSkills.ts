// The five rivals of a cup, strongest first, by tier: one ladder per tier in every world (worlds
// add variety, tiers add difficulty). Rivals race on the player's machine (game/opponents.ts),
// so these are the whole difficulty: tools/sim-check.ts races stand-in players against them.
//
// Each rival has its own form: an AI skill and a pace, the top speed of its (lifted) machine as
// a share of what parity gives it. The roster runs from a fast leader to a back-marker, so over
// a race the field strings out and the player meets its rivals one at a time; the first two and
// the middle two are paired close, so they still fight each other for the place.
export interface RivalForm {
  skill: number;
  pace: number;
}

const form = (skill: number, pace: number): RivalForm => ({ skill, pace });

export const RIVAL_FORM: readonly (readonly RivalForm[])[] = [
  [form(0.5, 1.0), form(0.47, 0.996), form(0.4, 0.975), form(0.37, 0.971), form(0.28, 0.945)],
  [form(0.56, 1.005), form(0.53, 1.0), form(0.46, 0.978), form(0.43, 0.973), form(0.34, 0.94)],
  [form(0.66, 1.025), form(0.63, 1.018), form(0.56, 0.99), form(0.53, 0.982), form(0.44, 0.945)],
];
