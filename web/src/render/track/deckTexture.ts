import * as THREE from 'three';
import { mulberry32, type Rng } from '../../core/rng.ts';
import type { TrackPalette } from '../../core/types.ts';
import { KERB_BLOCK, ROAD_TEXTURE_LENGTH, type Quality, TEXTURE_SIZE, ROCK_TILE } from './config.ts';
import { canvas, css, finish, wrapStroke } from './canvasPaint.ts';

// A station's steel: the deck the road runs on and the plated hull of its tube. The deck is
// plating, not paving: big plates laid in courses, bevelled seams, scorch where the craft run,
// and racing guide markings (two racing lines studded with lights, forward chevrons down the
// middle, hazard kerbs) instead of a highway's dashes. Its own light (a glow map, so the
// markings and seams emit while the steel only reflects) is lit seams across the deck every
// few plates, light strips just inside each edge and the studs on the racing lines.
//
// Atlas layout as the road's (textures.ts): road in the left half, edge to edge.

/** Deck plates: how many span the road, their length (m), their tone spread, the seam (px). */
const PLATES_ACROSS = 4;
const PLATE_LENGTH = 6.4;
const PLATE_TONE: readonly [number, number] = [0.9, 1.08];
const SEAM_PX = 2;
/** Lit seams across the deck every this many metres (a multiple of the plate), and their light. */
const LIT_SEAM = 12.8;
const LIT_SEAM_PX = 3;
/** Racing lines (share of the road), studded with a light every this many metres. */
const RACING_LINES = [1 / 3, 2 / 3];
const LINE_PX = 3;
const STUD_EVERY = 4;
const STUD_PX = 5;
/** Forward chevrons down the middle every this many metres: their reach and width (share of the road), stroke (m). */
const CHEVRON_EVERY = 32;
const CHEVRON_REACH = 0.07;
const CHEVRON_LENGTH = 2.4;
const CHEVRON_STROKE = 0.3;
/** Kerb and edge light (shares of the road atlas half, as textures.ts lays them out). */
const KERB = 0.026;
const EDGE_LIGHT: readonly [number, number] = [0.034, 0.046];
/** Marking and light colours (sRGB): guide cyan, kerb steel. */
const GUIDE = 0x7fe8ff;
const KERB_STEEL = 0x22252b;
/** Scorch streaks where racers run, bunched round the racing lines. */
const SCORCH = 60;
/**
 * The glow map holds the deck's own lamp light (the kit's road light) as well as its marking
 * lights: the albedo darkened to the road light. Canvas values are sRGB, so the linear road
 * light is taken through the display gamma.
 */
const DISPLAY_GAMMA = 2.2;

/** Hull plating detail (near-white multiplier): plate size (m, dividing ROCK_TILE), seams and rivet rows. */
const HULL_PLATE: readonly [number, number] = [12, 4];
const HULL_RIVET = 0.5;

/** The deck's plating and markings into the road half (R px wide, H px for ROAD_TEXTURE_LENGTH m). */
export function deckPlating(ctx: CanvasRenderingContext2D, palette: TrackPalette, rng: Rng, R: number, H: number, pxPerM: number): void {
  const pw = R / PLATES_ACROSS;
  const ph = PLATE_LENGTH * pxPerM;
  for (let row = 0, y = 0; y < H; row++, y += ph) {
    // Courses offset by half a plate, as plating is laid.
    const shift = row % 2 ? pw / 2 : 0;
    for (let i = -1; i < PLATES_ACROSS; i++) {
      const x = i * pw + shift;
      ctx.fillStyle = css(palette.road, PLATE_TONE[0] + rng() * (PLATE_TONE[1] - PLATE_TONE[0]));
      ctx.fillRect(x, y, pw, ph);
      // A bevel: a dark seam with a bright lip beside it.
      ctx.fillStyle = css(palette.road, 0.45);
      ctx.fillRect(x, y, SEAM_PX, ph);
      ctx.fillRect(x, y, pw, SEAM_PX);
      ctx.fillStyle = css(palette.road, 1.35, 0.6);
      ctx.fillRect(x + SEAM_PX, y + SEAM_PX, 1, ph - SEAM_PX);
      ctx.fillRect(x + SEAM_PX, y + SEAM_PX, pw - SEAM_PX, 1);
    }
  }
  // Brushed grain along the deck.
  for (let i = 0; i < R * 2; i++) {
    ctx.fillStyle = css(palette.road, rng() < 0.5 ? 0.85 : 1.15, 0.12);
    const len = 40 + rng() * 300;
    const x = rng() * R;
    const y = rng() * H;
    wrapStroke(H, (dy) => ctx.fillRect(x, y + dy, 1, len));
  }
  // Hover scorch round the racing lines.
  for (let i = 0; i < SCORCH; i++) {
    const lane = RACING_LINES[Math.floor(rng() * RACING_LINES.length)];
    const x = (lane + (rng() - 0.5) * 0.18) * R;
    const len = 200 + rng() * H * 0.8;
    const y = rng() * H;
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, 'rgba(20,14,10,0)');
    g.addColorStop(0.5, `rgba(20,14,10,${0.12 + rng() * 0.16})`);
    g.addColorStop(1, 'rgba(20,14,10,0)');
    ctx.fillStyle = g;
    const w = 2 + rng() * 6;
    wrapStroke(H, (dy) => ctx.fillRect(x, y + dy, w, len));
  }
  markings(ctx, palette, R, H, pxPerM, 'paint');
}

/**
 * The markings, painted (`paint`: on the albedo) or lit (`light`: on the glow map). Lit, they
 * add the seams across the deck; painted, the kerbs.
 */
function markings(ctx: CanvasRenderingContext2D, palette: TrackPalette, R: number, H: number, pxPerM: number, as: 'paint' | 'light'): void {
  const lit = as === 'light';
  const guide = (a: number) => css(GUIDE, 1, a);
  for (const lane of RACING_LINES) {
    ctx.fillStyle = guide(lit ? 0.3 : 0.35);
    ctx.fillRect(lane * R - LINE_PX / 2, 0, LINE_PX, H);
    ctx.fillStyle = lit ? guide(1) : '#e8fbff';
    for (let m = 0; m < ROAD_TEXTURE_LENGTH; m += STUD_EVERY) ctx.fillRect(lane * R - STUD_PX / 2, m * pxPerM, STUD_PX, STUD_PX * 1.6);
  }
  // Chevrons point the way the race runs: toward the canvas top (v grows along the lap, and the canvas is flipped).
  ctx.strokeStyle = lit ? css(palette.accent, 1, 0.35) : css(palette.accent, 1, 0.45);
  ctx.lineWidth = CHEVRON_STROKE * pxPerM;
  ctx.lineCap = 'butt';
  for (let m = CHEVRON_EVERY / 2; m < ROAD_TEXTURE_LENGTH; m += CHEVRON_EVERY) {
    for (const off of [0, CHEVRON_LENGTH * 0.6]) {
      const tip = (m - off) * pxPerM;
      ctx.beginPath();
      ctx.moveTo(R * (0.5 - CHEVRON_REACH), tip + CHEVRON_LENGTH * pxPerM);
      ctx.lineTo(R * 0.5, tip);
      ctx.lineTo(R * (0.5 + CHEVRON_REACH), tip + CHEVRON_LENGTH * pxPerM);
      ctx.stroke();
    }
  }
  for (const mirror of [false, true]) {
    const x = (u: number) => (mirror ? R - u * R : u * R);
    const e0 = x(EDGE_LIGHT[0]);
    const e1 = x(EDGE_LIGHT[1]);
    ctx.fillStyle = lit ? guide(1) : '#dff8ff';
    ctx.fillRect(Math.min(e0, e1), 0, Math.abs(e1 - e0), H);
    if (lit) continue;
    for (let b = 0; b < ROAD_TEXTURE_LENGTH / KERB_BLOCK; b++) {
      const k0 = x(0);
      const k1 = x(KERB);
      ctx.fillStyle = b % 2 ? css(KERB_STEEL) : css(palette.accent);
      ctx.fillRect(Math.min(k0, k1), b * KERB_BLOCK * pxPerM, Math.abs(k1 - k0), KERB_BLOCK * pxPerM);
    }
  }
  if (lit) {
    ctx.fillStyle = guide(0.85);
    for (let m = 0; m < ROAD_TEXTURE_LENGTH; m += LIT_SEAM) ctx.fillRect(x0(R), m * pxPerM - LIT_SEAM_PX / 2, R - 2 * x0(R), LIT_SEAM_PX);
  }
}

/** Lit seams stop at the edge lights. */
function x0(R: number): number {
  return EDGE_LIGHT[1] * R;
}

/**
 * The deck's glow map (see the header) from its painted atlas: the albedo at the road light,
 * plus the markings' light. Only the road half glows; the run-off half stays at the road light.
 */
export function deckGlowTexture(albedo: THREE.CanvasTexture, palette: TrackPalette, roadLight: number): THREE.CanvasTexture {
  const src = albedo.image as HTMLCanvasElement;
  const W = src.width;
  const H = src.height;
  const R = W / 2;
  const [cv, ctx] = canvas(W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = Math.pow(roadLight, 1 / DISPLAY_GAMMA);
  ctx.drawImage(src, 0, 0);
  ctx.globalAlpha = 1;
  markings(ctx, palette, R, H, H / ROAD_TEXTURE_LENGTH, 'light');
  return finish(cv, THREE.ClampToEdgeWrapping);
}

/** Near-white hull plating detail for a station's tube and decks: plates on a grid, seams, rivet rows. */
export function hullPlateTexture(seed: number, quality: Quality): THREE.CanvasTexture {
  const S = TEXTURE_SIZE[quality];
  const [cv, ctx] = canvas(S, S);
  const rng = mulberry32(seed ^ 0x9a7e);
  const px = S / ROCK_TILE;
  const pw = HULL_PLATE[0] * px;
  const ph = HULL_PLATE[1] * px;
  for (let y = 0; y < S; y += ph) {
    for (let x = 0; x < S; x += pw) {
      const v = 0.86 + rng() * 0.12;
      ctx.fillStyle = `rgb(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 258)})`;
      ctx.fillRect(x, y, pw, ph);
      ctx.fillStyle = 'rgba(40,42,48,0.75)';
      ctx.fillRect(x, y, 2, ph);
      ctx.fillRect(x, y, pw, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x + 2, y + 2, pw - 2, 1);
      ctx.fillStyle = 'rgba(40,42,48,0.4)';
      for (let r = HULL_RIVET * px; r < pw; r += HULL_RIVET * px * 2) ctx.fillRect(x + r, y + 5, 2, 2);
    }
  }
  return finish(cv, THREE.RepeatWrapping);
}
