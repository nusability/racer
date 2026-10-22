import * as THREE from 'three';
import { mulberry32 } from '../../core/rng.ts';
import type { TrackPalette } from '../../core/types.ts';
import { BERM_BLOCK, ROAD_TEXTURE_LENGTH } from './config.ts';

// Procedural canvas textures. Painted once per scene with the track's palette.

const ROAD_W = 256;
const ROAD_H = 1024;
/** Fraction of the road width taken by the painted kerb and the white edge line. */
const KERB = 0.024;
const EDGE_LINE = [0.032, 0.05];
/** Faint seams across the road, metres apart, give a sense of speed. */
const SEAM_SPACING = 16;
/** Maximum anisotropic filtering requested; three clamps to what the GPU offers. */
const ANISOTROPY = 8;

function css(hex: number, k = 1): string {
  const c = new THREE.Color(hex);
  return `rgb(${Math.round(Math.min(1, c.r * k) * 255)},${Math.round(Math.min(1, c.g * k) * 255)},${Math.round(Math.min(1, c.b * k) * 255)})`;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for track textures');
  return [cv, ctx];
}

/** Packed-sand road: grain, worn racing lanes, edge lines and painted kerbs. Repeats along s. */
export function roadTexture(palette: TrackPalette, seed: number): THREE.CanvasTexture {
  const [cv, ctx] = canvas(ROAD_W, ROAD_H);
  const rng = mulberry32(seed ^ 0x40ad);
  ctx.fillStyle = css(palette.road);
  ctx.fillRect(0, 0, ROAD_W, ROAD_H);
  // Grain speckle and long streaks.
  for (let i = 0; i < 9000; i++) {
    const v = 0.82 + rng() * 0.3;
    ctx.fillStyle = css(palette.road, v);
    ctx.fillRect(rng() * ROAD_W, rng() * ROAD_H, 1 + rng() * 2, 1 + rng() * 3);
  }
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = css(palette.road, 0.88 + rng() * 0.2);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(rng() * ROAD_W, 0, 1 + rng() * 3, ROAD_H);
  }
  ctx.globalAlpha = 1;
  // Two scorched racing lanes where the pods' repulsors bake the sand.
  for (const lane of [0.36, 0.64]) {
    const g = ctx.createLinearGradient((lane - 0.09) * ROAD_W, 0, (lane + 0.09) * ROAD_W, 0);
    g.addColorStop(0, 'rgba(40,20,10,0)');
    g.addColorStop(0.5, 'rgba(40,20,10,0.22)');
    g.addColorStop(1, 'rgba(40,20,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect((lane - 0.09) * ROAD_W, 0, 0.18 * ROAD_W, ROAD_H);
  }
  // Seams.
  const pxPerM = ROAD_H / ROAD_TEXTURE_LENGTH;
  ctx.fillStyle = 'rgba(30,15,5,0.18)';
  for (let m = 0; m < ROAD_TEXTURE_LENGTH; m += SEAM_SPACING) ctx.fillRect(0, m * pxPerM, ROAD_W, 2);
  // Edge lines and kerbs, both sides.
  for (const mirror of [false, true]) {
    const x = (u: number) => (mirror ? ROAD_W - u * ROAD_W : u * ROAD_W);
    ctx.fillStyle = '#f4f0e8';
    const l0 = x(EDGE_LINE[0]);
    const l1 = x(EDGE_LINE[1]);
    ctx.fillRect(Math.min(l0, l1), 0, Math.abs(l1 - l0), ROAD_H);
    const blocks = ROAD_TEXTURE_LENGTH / BERM_BLOCK;
    for (let b = 0; b < blocks; b++) {
      ctx.fillStyle = b % 2 ? '#f4f0e8' : css(palette.accent);
      const k0 = x(0);
      const k1 = x(KERB);
      ctx.fillRect(Math.min(k0, k1), b * BERM_BLOCK * pxPerM, Math.abs(k1 - k0), BERM_BLOCK * pxPerM);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = ANISOTROPY;
  return tex;
}

/** Forward-pointing chevrons for boost pads; scrolled along v at runtime. */
export function boostTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 128;
  const [cv, ctx] = canvas(w, h);
  ctx.fillStyle = '#06343c';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#7ff8ff';
  ctx.lineWidth = 13;
  ctx.lineJoin = 'miter';
  for (const y of [h * 0.28, h * 0.78]) {
    ctx.beginPath();
    ctx.moveTo(6, y + 20);
    ctx.lineTo(w / 2, y - 12);
    ctx.lineTo(w - 6, y + 20);
    ctx.stroke();
  }
  ctx.fillStyle = '#1fd8ff';
  ctx.fillRect(0, 0, 4, h);
  ctx.fillRect(w - 4, 0, 4, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = ANISOTROPY;
  return tex;
}
