// Race-runtime presentation numbers.

/** Longest frame the session will simulate; a longer stall (tab switch) is clipped. */
export const SESSION_MAX_FRAME_DT = 0.1;
/** Seconds the finished race stays on screen before the results appear. */
export const SESSION_FINISH_LINGER = 2.5;
/** Seconds "GO!" stays up. */
export const SESSION_GO_SHOWN = 0.8;
/** Racers further than this (m along the track) from the player skip dust and sparks. */
export const SESSION_DUST_RANGE = 250;
export const SESSION_SHAKE_SCRAPE = 0.08;
export const SESSION_SHAKE_HIT = 0.6;
/** Landing closing speed (m/s) treated as a full-strength impact for shake, sound and dust. */
export const SESSION_HARD_LANDING = 50;
export const SESSION_SHAKE_LAND = 0.5;
/** Dust multiplier while a racer is on the sand run-off. */
export const SESSION_OFFROAD_DUST = 2.5;
/** Nozzle glow the racer model shows while boosting / cruising (its old heat input). */
export const SESSION_BOOST_NOZZLE_HEAT = 0.6;
export const SESSION_IDLE_NOZZLE_HEAT = 0.15;

// --- The player's wreck ---
/** Time scale while the craft comes apart, how long it holds (real seconds) and eases back. */
export const SESSION_WRECK_SLOWMO = 0.22;
export const SESSION_WRECK_SLOWMO_HOLD = 2.4;
export const SESSION_WRECK_SLOWMO_EASE = 1.2;
/** Real seconds from the wreck until the results appear. */
export const SESSION_WRECK_LINGER = 5;
/** Cinematic orbit around the wreck: metres ahead of the impact it frames, radius, height, rad/s. */
export const SESSION_WRECK_LOOK_AHEAD = 18;
export const SESSION_WRECK_ORBIT_RADIUS = 26;
export const SESSION_WRECK_ORBIT_HEIGHT = 7;
export const SESSION_WRECK_ORBIT_RATE = 0.35;
/** Start the orbit off to the side, so the first frame shows the craft breaking up side-on. */
export const SESSION_WRECK_ORBIT_START = 1.1;
