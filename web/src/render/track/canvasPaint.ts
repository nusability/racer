import * as THREE from 'three';
import type { Rng } from '../../core/rng.ts';
import { ANISOTROPY } from './config.ts';

// Canvas painting helpers shared by the procedural track textures (textures.ts and the biomes'
// own painters): colour strings from palette hex, canvases, tiling noise and wrapped strokes.

export function rgb(hex: number, k = 1): [number, number, number] {
  const ch = (shift: number) => Math.min(255, ((hex >> shift) & 255) * k);
  return [ch(16), ch(8), ch(0)];
}

export function css(hex: number, k = 1, a = 1): string {
  const [r, g, b] = rgb(hex, k);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for track textures');
  return [cv, ctx];
}

export function finish(cv: HTMLCanvasElement, wrapS: THREE.Wrapping): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = wrapS;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = ANISOTROPY;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/** Tileable value noise on a `period`-cell lattice, sampled at (x, y) in cells. */
export function periodicNoise(rng: Rng, period: number): (x: number, y: number) => number {
  const v = new Float32Array(period * period).map(() => rng() * 2 - 1);
  const at = (i: number, j: number) => v[(((j % period) + period) % period) * period + (((i % period) + period) % period)];
  return (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/** Draws a stroke and its copies one tile up and down, so it wraps seamlessly along v. */
export function wrapStroke(h: number, draw: (dy: number) => void) {
  for (const dy of [-h, 0, h]) draw(dy);
}
