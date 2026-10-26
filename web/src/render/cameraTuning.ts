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

// --- Wreck camera: rides with the player's debris (wreckCamera.ts) ---
// Follow rates are per second of simulated (slowed) time, so the camera keeps pace with the
// debris through the slow motion; swing, orbit, horizon and lens rates are per real second, so
// the shot keeps moving while the debris barely does.
/** Critically damped follow of the camera position: low enough to carry the craft's momentum
 * through the impact, high enough not to fall far behind the debris skidding down the road. */
export const WRECK_CAM_FOLLOW = 4;
/** Follow of the aim point: quicker than the position, so the tumble stays centred. */
export const WRECK_CAM_AIM_FOLLOW = 9;
/** Distance from the debris centre at the moment of impact: a little wider than the chase. */
export const WRECK_CAM_DISTANCE = 16;
/** Extra distance per metre the debris has spread, so the whole break-up stays in frame. */
export const WRECK_CAM_SPREAD_PULLBACK = 1.6;
/** Never further than this: past it the parts shrink to specks. */
export const WRECK_CAM_MAX_DISTANCE = 34;
export const WRECK_CAM_HEIGHT = 5.5;
/** Extra height per metre of spread: pulling back also lifts, to see over the scatter. */
export const WRECK_CAM_SPREAD_LIFT = 0.4;
/** Angle (rad) off the line of flight the camera swings to while the debris flies: a
 * three-quarter rear view shows the parts separating instead of stacking up behind each other. */
export const WRECK_CAM_FLIGHT_ANGLE = 0.55;
export const WRECK_CAM_SWING_RATE = 1.2;
/** Orbit rate (rad/s) once the debris has come to rest. */
export const WRECK_CAM_ORBIT_RATE = 0.35;
/** Debris slower than this (m/s) counts as coming to rest: the orbit fades in as it slows. */
export const WRECK_CAM_REST_SPEED = 6;
/** Falling into the void: follow it down this long (simulated s), then hold and watch it go. */
export const WRECK_CAM_VOID_FOLLOW = 0.8;
/** Rate the horizon rights itself to world up: the debris falls along world gravity, even
 * where the road had turned the horizon over (loops, corkscrews). */
export const WRECK_CAM_UP_BLEND = 1.5;
/** Steepest the camera looks down or up (rad); steeper, the horizon would spin about the lens. */
export const WRECK_CAM_MAX_PITCH = 1.15;
/** Lowest the camera goes above a road it is over. */
export const WRECK_CAM_CLEARANCE = 1.5;
/** A road whose up has at least this much world up is a floor the camera stays above; steeper
 * (a loop's wall or crown) it is a thin ribbon the camera may pass on either side. */
export const WRECK_CAM_FLOOR_UP = 0.5;
export const WRECK_CAM_FOV = 64;
export const WRECK_CAM_FOV_BLEND = 1.5;
/** Steps of the walk along the road that finds the camera's place in track space. */
export const WRECK_CAM_PROJECT_STEPS = 4;
