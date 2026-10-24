import { BENCH_MAX_MS, GRAPHICS_LEVELS, GRAPHICS_PROFILE, type GraphicsLevel } from './graphicsTuning.ts';

export function isGraphicsLevel(v: unknown): v is GraphicsLevel {
  return GRAPHICS_LEVELS.includes(v as GraphicsLevel);
}

/** The level a benchmark result (ms per ultra frame) affords: the highest whose limit it meets. */
export function levelForMs(ms: number): GraphicsLevel {
  if (!(ms > 0)) throw new Error(`graphics: a benchmark frame of ${ms} ms is not a measurement`);
  if (ms <= BENCH_MAX_MS.ultra) return 'ultra';
  if (ms <= BENCH_MAX_MS.high) return 'high';
  if (ms <= BENCH_MAX_MS.medium) return 'medium';
  return 'low';
}

/** One level down, or null at the bottom. */
export function lowerLevel(level: GraphicsLevel): GraphicsLevel | null {
  const i = GRAPHICS_LEVELS.indexOf(level);
  return i > 0 ? GRAPHICS_LEVELS[i - 1] : null;
}

/** The canvas pixel ratio a level renders at on a screen of `devicePixelRatio`. */
export function pixelRatioFor(level: GraphicsLevel, devicePixelRatio: number): number {
  return Math.min(devicePixelRatio, GRAPHICS_PROFILE[level].pixelRatioCap);
}

/** The GPU's name as the browser reports it (Safari: "Apple GPU"), for the benchmark's record. */
export function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
}
