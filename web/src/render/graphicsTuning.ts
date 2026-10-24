import type { Quality } from './track/config.ts';

// Graphics levels: one setting the player sees (LOW … ULTRA), set by the benchmark on its own
// or by hand in Settings. Each level is a geometry/detail tier, a look-pass tier
// (LOOK_BUDGET in look/lookTuning.ts, indexed by the level) and a render scale.

export const GRAPHICS_LEVELS = ['low', 'medium', 'high', 'ultra'] as const;
export type GraphicsLevel = (typeof GRAPHICS_LEVELS)[number];

export interface GraphicsProfile {
  /** The track, landmark and racer detail tier everything that builds geometry takes. */
  detail: Quality;
  /** Highest device pixel ratio the canvas renders at; the screen's own ratio is used when lower. */
  pixelRatioCap: number;
}

export const GRAPHICS_PROFILE: Record<GraphicsLevel, GraphicsProfile> = {
  // Fill rate is what a weak GPU runs out of first, so low draws one pixel per CSS pixel.
  low: { detail: 'low', pixelRatioCap: 1 },
  // Full view distance (in a game this fast, seeing the road ahead is gameplay), at a render
  // scale that is still sharp on a phone but draws about half the pixels of 2×.
  medium: { detail: 'high', pixelRatioCap: 1.5 },
  // The designed look, as every device drew it before graphics levels existed.
  high: { detail: 'high', pixelRatioCap: 2 },
  // Native resolution on 3× screens.
  ultra: { detail: 'high', pixelRatioCap: 3 },
};

/**
 * Auto with no benchmark yet (a race started before the first one finished): the middle of
 * the range, smooth on most phones, until the device has been measured.
 */
export const UNMEASURED_LEVEL: GraphicsLevel = 'medium';

// --- The benchmark (benchmark.ts) ---

/**
 * The benchmark draws a Neon Meridian street (the heaviest world: lit facades, neon, the full
 * look) built from the race's own parts, but small: building and compiling a whole track takes
 * seconds on a phone, and the title screen must stay responsive while it runs. Its palette is
 * this track's.
 */
export const BENCH_PALETTE_TRACK = 'downtown';
/** The street: how long (m), the road's width, and the towers on both sides along it. */
export const BENCH_STREET_LENGTH = 2400;
export const BENCH_ROAD_WIDTH = 26;
export const BENCH_TOWERS = 420;
/** Tower footprint and height ranges (m), and how far back from the road edge they stand. */
export const BENCH_TOWER_SIZE: readonly [number, number] = [16, 42];
export const BENCH_TOWER_HEIGHT: readonly [number, number] = [24, 170];
export const BENCH_TOWER_SETBACK: readonly [number, number] = [6, 70];
/** Wall tints the towers take (sRGB): concrete, blue glass, brick, as the city district mixes them. */
export const BENCH_TOWER_TINTS: readonly number[] = [0x8c9099, 0x5f7189, 0x9a7f6c];
/** Seeds the street's layout, so every device measures the same scene. */
export const BENCH_SEED = 0x6e0b;
/** Gliders ahead of the camera, as at a race start: each is a rival's hull and canopy, env-mapped. */
export const BENCH_GLIDERS = 5;
/** Their spacing along the road ahead of the camera (m), and their offset either side of the centre line. */
export const BENCH_GLIDER_GAP = 14;
export const BENCH_GLIDER_SPREAD = 5;
/** Their height over the road (m). */
export const BENCH_GLIDER_HOVER = 1.2;
/** Camera: where the first frame looks from (m along the street), and how far each frame moves on, so the batches see many views. */
export const BENCH_START_S = 120;
export const BENCH_STEP_S = 23;
/** Chase-camera height and distance behind the lead glider (m), and how far ahead it looks, as in a race. */
export const BENCH_CAM_UP = 3.6;
export const BENCH_CAM_BACK = 9;
export const BENCH_LOOK_AHEAD = 60;
export const BENCH_FOV = 72;
/** Each benchmark frame eases the post effects (the boost blur) on by one 60 fps frame, as in a race. */
export const BENCH_FRAME_TIME = 1 / 60;
/**
 * The first frame, which compiles every shader, is drawn this small (px square): compiling
 * blocks the page on drivers that cannot compile in parallel, and at full size a slow GPU would
 * add its fill time to that block.
 */
export const BENCH_COMPILE_SIZE = 64;
/** Frames timed after the first to size the batches (the batches decide the level). */
export const BENCH_WARMUP_FRAMES = 2;
/** Timed batches; the median is the result, so one hitch (GC, another tab) does not decide the level. */
export const BENCH_BATCHES = 3;
/** Each batch aims for this much GPU time, so a fast GPU times enough frames for a stable figure and a slow one is not held for seconds. */
export const BENCH_BATCH_MS = 90;
export const BENCH_BATCH_FRAMES_MIN = 2;
export const BENCH_BATCH_FRAMES_MAX = 40;

/**
 * Highest level each benchmark result picks, as the longest frame (ms, the ultra look at the
 * screen's real size and ultra's render scale) that level may take. A 60 fps frame is 16.7 ms
 * and the simulation, HUD DOM and a crowded moment (wrecks, the whole field on screen) need a
 * good share of it, so the GPU's share of a frame is kept near 8 ms at the chosen level:
 *  - ultra must fit as measured;
 *  - high draws no MSAA and up to 4/9 of the pixels (2× against 3×): about half the cost;
 *  - medium also drops wet reflections and boost blur and draws its glow at a quarter of the
 *    resolution, at 1.5× (a quarter of 3×'s pixels): about a quarter of the cost.
 * Anything slower is low.
 */
export const BENCH_MAX_MS: Record<Exclude<GraphicsLevel, 'low'>, number> = {
  ultra: 7,
  high: 14,
  medium: 28,
};

// --- The in-race safety net (raceSession.ts) ---

/** The frame rate is judged over windows this long (s), so one slow frame never counts. */
export const SAFETY_WINDOW_SECONDS = 1;
/** At an automatic level, a race whose frame rate stays under this ... */
export const SAFETY_MIN_FPS = 45;
/** ... for this many seconds in a row drops one level for the next race. */
export const SAFETY_SLOW_SECONDS = 5;
/** The first seconds of a race are not judged: shaders compile and textures upload on the first frames. */
export const SAFETY_GRACE_SECONDS = 3;
/** A frame longer than this is a stall (tab switch, notification), not a slow GPU: the window starts again. */
export const SAFETY_STALL_SECONDS = 0.25;
