// The graphics setting: which level a race draws at, and how the benchmark and the in-race
// safety net move the automatic one. The levels themselves are in render/graphicsTuning.ts.
import { levelForMs, lowerLevel } from '../render/graphics.ts';
import { UNMEASURED_LEVEL, type GraphicsLevel } from '../render/graphicsTuning.ts';
import type { Settings } from './types.ts';

/** The level races and the menu backdrop draw at. */
export function graphicsLevel(s: Settings): GraphicsLevel {
  if (s.graphics !== 'auto') return s.graphics;
  return s.benchmark ? s.benchmark.level : UNMEASURED_LEVEL;
}

/** Auto needs a (new) measurement: none yet, or the build or the GPU changed since. */
export function benchmarkStale(s: Settings, build: string, gpu: string): boolean {
  return s.benchmark === null || s.benchmark.build !== build || s.benchmark.gpu !== gpu;
}

/**
 * A finished benchmark, recorded. The choice is left as it is: a player who picked a level
 * while it ran keeps it (Re-test sets auto itself before it starts).
 */
export function withBenchmark(s: Settings, ms: number, lowerBound: boolean, build: string, gpu: string): Settings {
  const measured = levelForMs(ms);
  return { ...s, benchmark: { level: measured, measured, ms, lowerBound, build, gpu } };
}

/**
 * After a race that ran too slowly: one level down for the next race, at an automatic level
 * only (a level the player chose is theirs). Null when there is nothing to change.
 */
export function steppedDown(s: Settings): Settings | null {
  if (s.graphics !== 'auto' || !s.benchmark) return null;
  const level = lowerLevel(s.benchmark.level);
  return level ? { ...s, benchmark: { ...s.benchmark, level } } : null;
}
