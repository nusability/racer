// Race telemetry settings (src/game/telemetry.ts).

/** Bump when the log shape changes; older logs on the device are then ignored. */
export const TELEMETRY_VERSION = 2;
export const TELEMETRY_KEY = 'mirage-racer.telemetry';
/** Races kept on the device. */
export const TELEMETRY_KEEP = 10;
/** Seconds of race time between player samples. */
export const TELEMETRY_SAMPLE_PERIOD = 0.5;
/** Fraction of slowest frames averaged for the "worst" frame rate. */
export const TELEMETRY_WORST_FRAMES = 0.05;
/** Lateral target speed (m/s) a full key/tilt steer moves the craft, for the steering-activity figure. */
export const TELEMETRY_RATE_STEER_SPEED = 45;
