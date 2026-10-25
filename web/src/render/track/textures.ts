import * as THREE from 'three';
import { mulberry32, type Rng } from '../../core/rng.ts';
import type { TrackPalette } from '../../core/types.ts';
import { KERB_BLOCK, ROAD_TEXTURE_LENGTH, ROCK_TILE, type Quality, TEXTURE_SIZE } from './config.ts';
import { canvas, css, finish, periodicNoise, rgb, wrapStroke } from './canvasPaint.ts';

// Procedural canvas textures, painted once per scene from the track's palette. Detail maps
// (sand, rock) are near-white multipliers over the vertex colours, so geometry keeps its tint
// and the texture adds grain, ripples and strata up close.

/** Fraction of the road width taken by the painted kerb and the white edge line. */
const KERB = 0.026;
const EDGE_LINE = [0.034, 0.05];
/** Faint seams across the road, metres apart, give a sense of speed. */
const SEAM_SPACING = 16;
const CENTRE_DASH = 6;
const CENTRE_GAP = 10;
/** Lane lines of a city street, as fractions of the road width. */
const CITY_LANES = [1 / 3, 2 / 3];
/** Pale concrete of a city run-off strip, and its saw-cut joints along the lap, metres. */
const CONCRETE = 0xb4b2ae;
const CONCRETE_JOINT = 4;

/** What the paved road and its run-off strip are made of. */
export interface RoadStyle {
  surface: 'packed' | 'causeway' | 'boardwalk' | 'asphalt' | 'deck';
  runoff: 'sand' | 'wetsand' | 'concrete';
}

/** A station deck's steel plates: their length along the road and how many span its width. */
const DECK_PLATE = 4;
const DECK_PLATES_ACROSS = 6;
/** Rivets along each plate seam, per plate width. */
const DECK_RIVETS = 5;

/** Boardwalk plank depth along the road, metres, and the gap between planks. */
const PLANK = 0.32;
const PLANK_GAP = 0.04;

/**
 * Road atlas: paved road on the left half (u 0..0.5, edge to edge), run-off sand on the right
 * half (u 0.5 at the road edge to 1 at the hard boundary). Both repeat every
 * ROAD_TEXTURE_LENGTH metres along the lap.
 */
export function roadTexture(palette: TrackPalette, style: RoadStyle, seed: number, quality: Quality): THREE.CanvasTexture {
  const W = TEXTURE_SIZE[quality];
  const H = W * 2;
  const R = W / 2;
  const [cv, ctx] = canvas(W, H);
  const rng = mulberry32(seed ^ 0x40ad);
  const pxPerM = H / ROAD_TEXTURE_LENGTH;

  // --- Paved road ---
  ctx.fillStyle = css(palette.road);
  ctx.fillRect(0, 0, R, H);
  if (style.surface === 'boardwalk') {
    // Planks across the road: each its own tone, with dark gaps and nail rows.
    for (let y = 0; y < H; y += PLANK * pxPerM) {
      ctx.fillStyle = css(palette.road, 0.82 + rng() * 0.3);
      ctx.fillRect(0, y, R, PLANK * pxPerM);
      ctx.fillStyle = css(palette.road, 0.45, 0.9);
      ctx.fillRect(0, y, R, Math.max(1, PLANK_GAP * pxPerM));
      for (let x = 0.12; x < 1; x += 0.25) ctx.fillRect(x * R, y + (PLANK * pxPerM) / 2, 2, 2);
    }
  } else if (style.surface === 'deck') {
    // Steel plates, each its own tone, with dark seams and rivet rows: no cracks, no gravel.
    const pw = R / DECK_PLATES_ACROSS;
    for (let y = 0; y < H; y += DECK_PLATE * pxPerM) {
      for (let i = 0; i < DECK_PLATES_ACROSS; i++) {
        ctx.fillStyle = css(palette.road, 0.9 + rng() * 0.2);
        ctx.fillRect(i * pw, y, pw, DECK_PLATE * pxPerM);
        ctx.fillStyle = css(palette.road, 0.5, 0.9);
        ctx.fillRect(i * pw, y, 2, DECK_PLATE * pxPerM);
        ctx.fillRect(i * pw, y, pw, 2);
        ctx.fillStyle = css(palette.road, 1.4, 0.7);
        for (let r = 0; r < DECK_RIVETS; r++) ctx.fillRect(i * pw + ((r + 0.5) * pw) / DECK_RIVETS, y + 4, 2, 2);
      }
    }
  } else if (style.surface === 'causeway') {
    // Concrete slabs with sand blown across them.
    for (let y = 0; y < H; y += 4 * pxPerM) {
      ctx.fillStyle = css(palette.road, 0.75, 0.6);
      ctx.fillRect(0, y, R, 2);
    }
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = css(palette.sand, 1, 0.12 + rng() * 0.18);
      const y = rng() * H;
      wrapStroke(H, (dy) => ctx.fillRect(0, y + dy, R, 30 + rng() * 120));
    }
  }
  // Repair patches and tonal blotches.
  for (let i = 0; i < 26; i++) {
    const x = rng() * R;
    const y = rng() * H;
    const w = 20 + rng() * R * 0.4;
    const h = 40 + rng() * 260;
    ctx.fillStyle = css(palette.road, 0.88 + rng() * 0.2, 0.35);
    wrapStroke(H, (dy) => ctx.fillRect(x - w / 2, y + dy, w, h));
  }
  // Aggregate: fine speckle and the odd pebble.
  for (let i = 0; i < (R * H) / 9; i++) {
    const v = 0.72 + rng() * 0.5;
    ctx.fillStyle = css(palette.road, v, 0.8);
    ctx.fillRect(rng() * R, rng() * H, 1 + rng() * 1.5, 1 + rng() * 1.5);
  }
  const metal = style.surface === 'deck';
  for (let i = 0; i < (metal ? 0 : 900); i++) {
    ctx.fillStyle = css(palette.road, rng() < 0.5 ? 0.62 : 1.25, 0.9);
    ctx.beginPath();
    ctx.arc(rng() * R, rng() * H, 1.2 + rng() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Hover scorch: long soft streaks bunched round two racing lines.
  for (let i = 0; i < 70; i++) {
    const lane = rng() < 0.5 ? 0.33 : 0.67;
    const x = (lane + (rng() - 0.5) * 0.22) * R;
    const len = 200 + rng() * H * 0.8;
    const y = rng() * H;
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, 'rgba(30,14,6,0)');
    g.addColorStop(0.5, `rgba(30,14,6,${0.12 + rng() * 0.18})`);
    g.addColorStop(1, 'rgba(30,14,6,0)');
    ctx.fillStyle = g;
    const w = 1.5 + rng() * 5;
    wrapStroke(H, (dy) => ctx.fillRect(x, y + dy, w, len));
  }
  // Cracks: wandering dark lines, mostly along the road.
  ctx.lineWidth = 1.2;
  for (let i = 0; i < (metal ? 0 : 40); i++) {
    let x = rng() * R;
    let y = rng() * H;
    ctx.strokeStyle = css(palette.road, 0.45, 0.7);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 6 + Math.floor(rng() * 14);
    let ang = rng() < 0.6 ? Math.PI / 2 : rng() * Math.PI;
    for (let s = 0; s < steps; s++) {
      ang += (rng() - 0.5) * 1.1;
      x = Math.max(4, Math.min(R - 4, x + Math.cos(ang) * 9));
      y += Math.sin(ang) * 9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Seams across the road.
  ctx.fillStyle = 'rgba(30,15,5,0.2)';
  for (let m = 0; m < ROAD_TEXTURE_LENGTH; m += SEAM_SPACING) ctx.fillRect(0, m * pxPerM, R, 2);
  // Paint: worn dashed centre line, edge lines, kerbs.
  const paint = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    // Wear: knock specks out of fresh paint.
    ctx.fillStyle = css(palette.road, 0.95, 0.55);
    for (let i = 0; i < (w * h) / 40; i++) ctx.fillRect(x + rng() * w, y + rng() * h, 1 + rng() * 2, 1 + rng() * 2);
  };
  // A city street (and a station deck) is laned: two dashed lane lines instead of one centre line.
  const lanes = style.surface === 'asphalt' || metal ? CITY_LANES : [0.5];
  for (const lane of lanes) {
    for (let m = 0; m < ROAD_TEXTURE_LENGTH; m += CENTRE_DASH + CENTRE_GAP) {
      paint(R * lane - 2, m * pxPerM, 4, CENTRE_DASH * pxPerM, 'rgba(244,240,232,0.75)');
    }
  }
  for (const mirror of [false, true]) {
    const x = (u: number) => (mirror ? R - u * R : u * R);
    const l0 = x(EDGE_LINE[0]);
    const l1 = x(EDGE_LINE[1]);
    paint(Math.min(l0, l1), 0, Math.abs(l1 - l0), H, '#f4f0e8');
    for (let b = 0; b < ROAD_TEXTURE_LENGTH / KERB_BLOCK; b++) {
      const k0 = x(0);
      const k1 = x(KERB);
      paint(Math.min(k0, k1), b * KERB_BLOCK * pxPerM, Math.abs(k1 - k0), KERB_BLOCK * pxPerM, b % 2 ? '#f4f0e8' : css(palette.accent));
    }
  }

  if (style.runoff === 'concrete') concreteRunoff(ctx, palette, rng, R, W, H, pxPerM);
  else sandRunoff(ctx, palette, style.runoff === 'wetsand', rng, R, W, H);
  return finish(cv, THREE.ClampToEdgeWrapping);
}

/** Run-off sand (u 0.5 road side → 1 boundary). Wet sand is the beach's: darker, cooler, glossy. */
function sandRunoff(ctx: CanvasRenderingContext2D, palette: TrackPalette, wet: boolean, rng: Rng, R: number, W: number, H: number) {
  const sand = (k: number, a = 1) => {
    const [r1, g1, b1] = rgb(palette.sand, wet ? 0.78 : 1);
    const [r2, g2, b2] = rgb(wet ? 0x8a9aa0 : palette.road);
    return `rgba(${Math.round((r1 * 0.7 + r2 * 0.3) * k)},${Math.round((g1 * 0.7 + g2 * 0.3) * k)},${Math.round((b1 * 0.7 + b2 * 0.3) * k)},${a})`;
  };
  const grad = ctx.createLinearGradient(R, 0, W, 0);
  grad.addColorStop(0, sand(0.86));
  grad.addColorStop(0.15, sand(1));
  grad.addColorStop(1, sand(1.04));
  ctx.fillStyle = grad;
  ctx.fillRect(R, 0, R, H);
  // Wind ripples: wavy bands across the strip.
  for (let y = 0; y < H; y += 6 + rng() * 6) {
    ctx.strokeStyle = sand(rng() < 0.5 ? 0.9 : 1.08, 0.5);
    ctx.lineWidth = 1 + rng() * 1.5;
    ctx.beginPath();
    const phase = rng() * 6.28;
    for (let x = R; x <= W; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.05 + phase) * 3);
    ctx.stroke();
  }
  // Hover streaks: long straight scuffs where racers ran wide.
  for (let i = 0; i < 50; i++) {
    const x = R + Math.pow(rng(), 1.6) * R;
    const len = 300 + rng() * H;
    const y = rng() * H;
    ctx.fillStyle = sand(rng() < 0.7 ? 0.8 : 1.12, 0.45);
    const w = 2 + rng() * 6;
    wrapStroke(H, (dy) => ctx.fillRect(x, y + dy, w, len));
  }
  for (let i = 0; i < (R * H) / 14; i++) {
    ctx.fillStyle = sand(0.8 + rng() * 0.35, 0.6);
    ctx.fillRect(R + rng() * R, rng() * H, 1 + rng(), 1 + rng());
  }
  // Paved edge breaking up into sand.
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = css(palette.road, 0.9 + rng() * 0.2, 0.8);
    const w = Math.pow(rng(), 2) * R * 0.08;
    ctx.fillRect(R, rng() * H, w, 2 + rng() * 10);
  }
}

/** Concrete run-off: pale slabs with saw-cut joints, tyre-dark scuffs and oil stains. */
function concreteRunoff(ctx: CanvasRenderingContext2D, palette: TrackPalette, rng: Rng, R: number, W: number, H: number, pxPerM: number) {
  const slab = (k: number, a = 1) => css(CONCRETE, k, a);
  const grad = ctx.createLinearGradient(R, 0, W, 0);
  grad.addColorStop(0, slab(0.8));
  grad.addColorStop(0.12, slab(0.95));
  grad.addColorStop(1, slab(1));
  ctx.fillStyle = grad;
  ctx.fillRect(R, 0, R, H);
  // Each slab its own tone, cut across every few metres and once along the strip.
  for (let m = 0; m < ROAD_TEXTURE_LENGTH; m += CONCRETE_JOINT) {
    ctx.fillStyle = slab(0.9 + rng() * 0.16, 0.5);
    ctx.fillRect(R, m * pxPerM, R, CONCRETE_JOINT * pxPerM);
    ctx.fillStyle = slab(0.55, 0.9);
    ctx.fillRect(R, m * pxPerM, R, 2);
  }
  ctx.fillRect(R + R * 0.5, 0, 2, H);
  for (let i = 0; i < (R * H) / 14; i++) {
    ctx.fillStyle = slab(0.78 + rng() * 0.35, 0.5);
    ctx.fillRect(R + rng() * R, rng() * H, 1 + rng(), 1 + rng());
  }
  // Oil stains and scuffs where racers ran wide.
  for (let i = 0; i < 30; i++) {
    const x = R + Math.pow(rng(), 1.5) * R;
    const y = rng() * H;
    const r = 6 + rng() * 26;
    ctx.fillStyle = css(palette.road, 0.6, 0.18 + rng() * 0.2);
    wrapStroke(H, (dy) => {
      ctx.beginPath();
      ctx.ellipse(x, y + dy, r, r * (1.5 + rng() * 2), 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  for (let i = 0; i < 40; i++) {
    const x = R + Math.pow(rng(), 1.8) * R;
    const len = 300 + rng() * H;
    const y = rng() * H;
    ctx.fillStyle = css(palette.road, 0.7, 0.25);
    const w = 2 + rng() * 5;
    wrapStroke(H, (dy) => ctx.fillRect(x, y + dy, w, len));
  }
}

/** Near-white sand detail: rippled, grainy, tiling. */
export function sandTexture(seed: number, quality: Quality): THREE.CanvasTexture {
  const S = TEXTURE_SIZE[quality];
  const [cv, ctx] = canvas(S, S);
  const rng = mulberry32(seed ^ 0x5a4d);
  const warp = periodicNoise(rng, 8);
  const grain = periodicNoise(rng, 64);
  const img = ctx.createImageData(S, S);
  const RIPPLES = 14;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const w = warp(u * 8, v * 8) * 0.9;
      const ripple = Math.sin((u * 2 + v) * Math.PI * 2 * RIPPLES + w * 6);
      const crest = Math.pow(0.5 + 0.5 * ripple, 4);
      const value = 0.86 + 0.1 * crest - 0.06 * Math.max(0, -ripple) + grain(u * 64, v * 64) * 0.05 + (rng() - 0.5) * 0.06;
      const i = (y * S + x) * 4;
      const c = Math.max(0, Math.min(255, value * 255));
      img.data[i] = c;
      img.data[i + 1] = c * 0.99;
      img.data[i + 2] = c * 0.97;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(cv, THREE.RepeatWrapping);
}

/**
 * Near-white sandstone detail: level strata of varying thickness, erosion streaks running
 * down them and fine cracks. v is world height (ROCK_TILE metres per repeat).
 */
export function rockTexture(seed: number, quality: Quality): THREE.CanvasTexture {
  const S = TEXTURE_SIZE[quality];
  const [cv, ctx] = canvas(S, S);
  const rng = mulberry32(seed ^ 0x70c4);
  const streak = periodicNoise(rng, 32);
  const fine = periodicNoise(rng, 128);
  const wobble = periodicNoise(rng, 8);
  // Strata boundaries down the tile (pixel rows), each band with its own tone.
  const bands: { y: number; tone: number }[] = [];
  for (let y = 0; y < S; ) {
    bands.push({ y, tone: 0.78 + rng() * 0.24 });
    y += (S / ROCK_TILE) * (0.6 + rng() * 2.6);
  }
  const toneAt = (y: number) => {
    let t = bands[0].tone;
    for (const b of bands) if (b.y <= y) t = b.tone;
    return t;
  };
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const yy = (y + wobble(u * 8, v * 8) * S * 0.012 + S) % S;
      const tone = toneAt(yy);
      const lines = 0.03 * Math.sin(yy * 0.9) + fine(u * 128, v * 128) * 0.05;
      const drip = Math.max(0, streak(u * 32, v * 4)) * 0.22;
      const value = tone + lines - drip + (rng() - 0.5) * 0.05;
      const i = (y * S + x) * 4;
      const c = Math.max(0, Math.min(255, value * 255));
      img.data[i] = c;
      img.data[i + 1] = c * 0.97;
      img.data[i + 2] = c * 0.94;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Cracks.
  ctx.strokeStyle = 'rgba(40,24,16,0.45)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 60; i++) {
    let x = rng() * S;
    let y = rng() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += (rng() - 0.5) * 18;
      y += 4 + rng() * 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(cv, THREE.RepeatWrapping);
}

/** Forward-pointing chevrons for boost pads; scrolled along v at runtime. */
export function boostTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const [cv, ctx] = canvas(w, h);
  ctx.fillStyle = '#06343c';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#7ff8ff';
  ctx.lineWidth = 26;
  ctx.lineJoin = 'miter';
  for (const y of [h * 0.28, h * 0.78]) {
    ctx.beginPath();
    ctx.moveTo(12, y + 40);
    ctx.lineTo(w / 2, y - 24);
    ctx.lineTo(w - 12, y + 40);
    ctx.stroke();
  }
  ctx.fillStyle = '#1fd8ff';
  ctx.fillRect(0, 0, 8, h);
  ctx.fillRect(w - 8, 0, 8, h);
  return finish(cv, THREE.ClampToEdgeWrapping);
}

/** Fork signs: one row per shortcut name, arrow pointing the way (left or right). */
export function signTexture(names: { name: string; side: -1 | 1 }[], accent: number): THREE.CanvasTexture {
  const w = 512;
  const row = 128;
  const [cv, ctx] = canvas(w, row * Math.max(1, names.length));
  names.forEach(({ name, side }, i) => {
    const y = i * row;
    ctx.fillStyle = '#141018';
    ctx.fillRect(0, y, w, row);
    ctx.fillStyle = css(accent);
    ctx.fillRect(0, y, w, 10);
    ctx.fillRect(0, y + row - 10, w, 10);
    ctx.font = 'bold 54px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff4e0';
    ctx.textAlign = side > 0 ? 'left' : 'right';
    ctx.fillText(name.toUpperCase(), side > 0 ? 24 : w - 24, y + row / 2);
    // Arrow toward the fork.
    ctx.fillStyle = css(accent);
    const ax = side > 0 ? w - 70 : 70;
    ctx.beginPath();
    ctx.moveTo(ax + side * 46, y + row / 2);
    ctx.lineTo(ax - side * 10, y + 22);
    ctx.lineTo(ax - side * 10, y + row - 22);
    ctx.fill();
  });
  return finish(cv, THREE.ClampToEdgeWrapping);
}

/** Paving slab size of the city's plazas and pavements, metres (SAND_TILE splits into whole slabs). */
const PAVING_SLABS = 8;

/**
 * Near-white city ground detail: square paving slabs with dark joints, each slab its own tone,
 * worn and stained. Tiles every SAND_TILE metres like the sand it replaces.
 */
export function pavingTexture(seed: number, quality: Quality): THREE.CanvasTexture {
  const S = TEXTURE_SIZE[quality];
  const [cv, ctx] = canvas(S, S);
  const rng = mulberry32(seed ^ 0x9a7e);
  const cell = S / PAVING_SLABS;
  for (let j = 0; j < PAVING_SLABS; j++) {
    for (let i = 0; i < PAVING_SLABS; i++) {
      const v = Math.round(210 + rng() * 40);
      ctx.fillStyle = `rgb(${v},${v},${Math.min(255, v + 4)})`;
      ctx.fillRect(i * cell, j * cell, cell, cell);
    }
  }
  ctx.fillStyle = 'rgba(40,40,46,0.55)';
  for (let q = 0; q < PAVING_SLABS; q++) {
    ctx.fillRect(q * cell, 0, Math.max(1, S / 512), S);
    ctx.fillRect(0, q * cell, S, Math.max(1, S / 512));
  }
  for (let i = 0; i < (S * S) / 20; i++) {
    const v = 160 + rng() * 95;
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    ctx.fillRect(rng() * S, rng() * S, 1 + rng(), 1 + rng());
  }
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(30,30,36,${0.06 + rng() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(rng() * S, rng() * S, 10 + rng() * S * 0.08, 10 + rng() * S * 0.06, rng() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(cv, THREE.RepeatWrapping);
}

/** Formwork panels across one ROCK_TILE of cast concrete, and tie holes per panel side. */
const FORMWORK_PANELS = 12;
const TIE_HOLES = 3;

/**
 * Near-white cast concrete detail: formwork panel joints, rows of tie holes, faint rain streaks
 * down the face. v is world height, as for the rock it replaces.
 */
export function concreteTexture(seed: number, quality: Quality): THREE.CanvasTexture {
  const S = TEXTURE_SIZE[quality];
  const [cv, ctx] = canvas(S, S);
  const rng = mulberry32(seed ^ 0xc0c7);
  const fine = periodicNoise(rng, 64);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const value = 0.9 + fine((x / S) * 64, (y / S) * 64) * 0.05 + (rng() - 0.5) * 0.05;
      const i = (y * S + x) * 4;
      const c = Math.max(0, Math.min(255, value * 255));
      img.data[i] = c;
      img.data[i + 1] = c;
      img.data[i + 2] = c * 1.01;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const panel = S / FORMWORK_PANELS;
  ctx.fillStyle = 'rgba(60,60,64,0.35)';
  for (let q = 0; q < FORMWORK_PANELS; q++) {
    ctx.fillRect(q * panel, 0, 1.5, S);
    ctx.fillRect(0, q * panel * 2, S, 1.5);
  }
  ctx.fillStyle = 'rgba(40,40,44,0.5)';
  for (let j = 0; j < FORMWORK_PANELS / 2; j++) {
    for (let i = 0; i < FORMWORK_PANELS; i++) {
      for (let t = 0; t < TIE_HOLES; t++) ctx.fillRect(i * panel + panel * ((t + 0.5) / TIE_HOLES), j * panel * 2 + panel, 2, 2);
    }
  }
  for (let i = 0; i < 70; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const len = S * (0.1 + rng() * 0.4);
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, 'rgba(50,50,56,0.18)');
    g.addColorStop(1, 'rgba(50,50,56,0)');
    ctx.fillStyle = g;
    const w = 1 + rng() * 4;
    wrapStroke(S, (dy) => ctx.fillRect(x, y + dy, w, len));
  }
  return finish(cv, THREE.RepeatWrapping);
}
