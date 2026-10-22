// Chase-camera feel. Distances in metres, angles in degrees, rates per second.

/** Distance behind the racer at standstill and at top speed. */
export const CAM_BACK_MIN = 8.5;
export const CAM_BACK_MAX = 12;
/** Extra pull-back while boosting: the racer surges away from the camera. */
export const CAM_BACK_BOOST = 3;
export const CAM_HEIGHT = 3.2;
export const CAM_LOOK_AHEAD = 22;
export const CAM_LOOK_HEIGHT = 1.2;
/** How much of the racer's lateral offset the camera copies (lower = racer swings more). */
export const CAM_LATERAL_FOLLOW = 0.8;
export const CAM_WALL_MARGIN = 1.5;
export const CAM_CEILING_MARGIN = 1.5;
/** Exponential smoothing rate. */
export const CAM_SMOOTH = 9;
/** Fraction of the road's bank the horizon follows. */
export const CAM_UP_FOLLOW = 0.45;
export const CAM_FOV_MIN = 66;
export const CAM_FOV_MAX = 84;
export const CAM_FOV_BOOST = 10;
/** Portrait screens need a taller vertical FOV to keep the road's width in view. */
export const CAM_PORTRAIT_FOV_SCALE = 1.3;
export const CAM_SHAKE_DECAY = 2.5;

// --- Racer pose ---
/** Visual hover gap between the road and the craft's centre. */
export const POSE_VISUAL_HOVER = 1.1;
/** Nose up/down limit when flying, radians. */
export const POSE_MAX_PITCH = 0.45;
