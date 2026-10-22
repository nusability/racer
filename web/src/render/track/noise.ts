import { mulberry32 } from '../../core/rng.ts';

// Seeded value noise for terrain and rock erosion. Deterministic per track so the same course
// always looks the same.

export type Noise2 = (x: number, y: number) => number;

const TABLE = 256;

/** Smooth value noise in [-1, 1], period TABLE on both axes. */
export function valueNoise(seed: number): Noise2 {
  const rng = mulberry32(seed);
  const vals = new Float32Array(TABLE * TABLE);
  for (let i = 0; i < vals.length; i++) vals[i] = rng() * 2 - 1;
  const at = (ix: number, iy: number) => vals[(iy & (TABLE - 1)) * TABLE + (ix & (TABLE - 1))];
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/** Fractal sum of octaves, roughly in [-1, 1]. */
export function fbm(noise: Noise2, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * f, y * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
