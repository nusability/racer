// Time Trial numbers: the ghost's sampling and quantisation, the run's shape, and how long its
// HUD readouts stay up.
import { SIM_DT } from '../data/tuning.ts';
import { SPRINT_SECTORS } from './sessionTuning.ts';

/**
 * Ghost poses per second. 10 Hz keeps a lap to a few KB (tools/trial-check.ts prints the
 * sizes) while linear interpolation still reads smooth: at 200 m/s the samples are 20 m
 * apart, and a glider's line barely bends over that. It divides the 120 Hz sim step, so
 * every sample lands on a step and is recorded exact, never interpolated.
 */
export const GHOST_HZ = 10;
export const GHOST_STEPS_PER_SAMPLE = Math.round(1 / (SIM_DT * GHOST_HZ));
if (Math.abs(GHOST_STEPS_PER_SAMPLE * SIM_DT * GHOST_HZ - 1) > 1e-9) throw new Error(`trialTuning: GHOST_HZ ${GHOST_HZ} must divide the sim rate`);

/**
 * Quantisation of a stored pose. Distance along the course is what the live delta is read
 * by: 1/8 m is under 1 ms even at 150 m/s. Lateral and height at 1/16 m (6 cm) can't be seen
 * at chase-camera distance. Angles at 1/1024 turn (0.35°).
 */
export const GHOST_DIST_UNIT = 1 / 8;
export const GHOST_POS_UNIT = 1 / 16;
export const GHOST_ANGLE_UNIT = (2 * Math.PI) / 1024;

/** localStorage key prefix of a track's best ghost (one key per track, apart from the career save). */
export const GHOST_KEY_PREFIX = 'mirage-racer.ghost.';
/** The stored ghost's format; any other version is dropped (prototype: no migration). */
export const GHOST_VERSION = 1;

/**
 * A circuit trial is a continuous run of laps the player ends from the pause menu; the race
 * still needs a lap count, and at this one an hour of flying laps on the longest track fits.
 */
export const TRIAL_CIRCUIT_LAPS = 60;
/** Each lap (and a sprint's run) is split at the same equal sectors the sprint HUD counts. */
export const TRIAL_SECTORS = SPRINT_SECTORS;
/** Seconds a split's delta stays on the HUD after its sector line. */
export const TRIAL_SPLIT_SHOWN = 2.5;
/**
 * Seconds a lap's compact readout (time, delta, sectors) stays in the corner before it fades:
 * long enough for a glance or two down the next straight, and gone long before the next lap's
 * first sector line (a quarter of the shortest lap is over 13 s).
 */
export const TRIAL_LAP_READOUT_SHOWN = 5;
/** The ghost's look: see-through, tinted, never solid enough to hide the road. */
export const GHOST_OPACITY = 0.34;
export const GHOST_TINT = 0x8fe8ff;
/**
 * The ghost shows only this far ahead of the camera (m, along its view): closer it is beside or
 * behind the lens, a translucent hull filling the screen. The player's own craft is further
 * ahead than this, so a ghost level with it still shows.
 */
export const GHOST_HIDE_AHEAD = 4;
/** Same seed every run of a track, so its rough ground jolts the same and runs compare. */
export const TRIAL_SEED = 0x7e57;
