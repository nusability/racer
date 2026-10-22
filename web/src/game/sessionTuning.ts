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
/** Blinks per second while a respawned racer passes through obstacles. */
export const SESSION_INVULNERABLE_BLINK = 8;
