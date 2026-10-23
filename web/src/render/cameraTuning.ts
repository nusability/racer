// Chase-camera feel. Distances in metres, angles in degrees, rates per second.

import { SKIMMER_RIDE_HEIGHT } from './skimmerTuning.ts';

/** Distance behind the racer at standstill and at top speed. */
export const CAM_BACK_MIN = 10.5;
export const CAM_BACK_MAX = 12;
/** Extra pull-back while boosting: the racer surges away from the camera. */
export const CAM_BACK_BOOST = 2.5;
export const CAM_HEIGHT = 3.3;
export const CAM_LOOK_AHEAD = 40;
export const CAM_LOOK_HEIGHT = 3.4;
/** How much of the racer's lateral offset the camera copies (lower = racer swings more). */
export const CAM_LATERAL_FOLLOW = 0.8;
export const CAM_WALL_MARGIN = 1.5;
export const CAM_CEILING_MARGIN = 1.5;
/** Exponential smoothing rate. */
export const CAM_SMOOTH = 9;
/** Fraction of the road's bank the horizon follows. */
export const CAM_UP_FOLLOW = 0.45;
export const CAM_FOV_MIN = 66;
export const CAM_FOV_MAX = 80;
export const CAM_FOV_BOOST = 10;
/** Portrait screens need a taller vertical FOV to keep the road's width in view. */
export const CAM_PORTRAIT_FOV_SCALE = 1.3;
export const CAM_SHAKE_DECAY = 2.5;

// --- Racer pose ---
/** Visual hover gap between the road and the craft's centre: the skimmer's ride height. */
export const POSE_VISUAL_HOVER = SKIMMER_RIDE_HEIGHT;
/** Nose up/down limit when flying, radians. */
export const POSE_MAX_PITCH = 0.45;
/** Opponents closer than this to the camera are hidden instead of filling the lens. */
export const CAM_HIDE_NEAR = 9;
/** Rate the horizon blends to and from following the road fully (loops, corkscrews). */
export const CAM_UP_BLEND = 4;
