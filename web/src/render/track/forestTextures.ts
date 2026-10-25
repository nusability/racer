import * as THREE from 'three';
import { mulberry32, type Rng } from '../../core/rng.ts';
import type { TrackPalette } from '../../core/types.ts';
import { canvas, css, finish, periodicNoise, wrapStroke } from './canvasPaint.ts';
import { ROAD_TEXTURE_LENGTH, type Quality, TEXTURE_SIZE } from './config.ts';

// Elderwood's canvas painters: the trail and the logging road (packed earth worn into two
// racing ruts, roots crossing it), the forest-floor run-off (moss and leaf litter) and the
// near-white detail maps for moss and mossy stone. A forest road carries no paint: the trail
// reads by its paler worn middle, the darker mossy litter at its edges and the trunks there.

/** Roots crossing the trail every this many metres on average: the forest's sense of speed. */
const ROOT_SPACING = 17;
/** The two worn ruts sit at these shares of the road width. */
const RUTS = [0.33, 0.67];
/** Moss creeps in from each edge of a trail over this share of the road width. */
const MOSS_CREEP = 0.16;
/**
 * The worn middle of a trail is paler than its edges, so the way reads at speed without paint:
 * the earth's shade at the middle and at the edges, and where across the width each holds.
 */
const WORN_MIDDLE = 1.14;
const WORN_EDGE = 0.72;
const WORN_BAND: readonly [number, number] = [0.22, 0.4];
/** Fallen leaves per square metre of road (trail) and run-off. */
const LEAVES_ROAD = 0.35;
const LEAVES_RUNOFF = 1.4;
/** Autumn tones scattered in the litter (sRGB), over the palette's own sand. */
const LEAF_TONES = [0xb8862e, 0x8a4a22, 0xc9a04a, 0x6a7a2a, 0x9a3a1e];
/** Moss cushions over one run-off texture tile (the rest is leaf litter). */
const MOSS_CUSHIONS = 160;
/** A logging road is compacted gravel: this many pale stones per square metre. */
const GRAVEL = 6;

/**
 * The paved half (u 0..R) of a forest road, painted over its base fill: ruts, roots, leaves,
 * and on a trail the moss creeping in from both edges. The edge paint comes after this.
 */
export function forestRoad(ctx: CanvasRenderingContext2D, palette: TrackPalette, kind: 'trail' | 'logging', rng: Rng, R: number, H: number, pxPerM: number): void {
  const metresAcross = R / pxPerM;
  if (kind === 'trail') {
    // The worn band: pale down the middle, darkening to the litter at either edge.
    const g = ctx.createLinearGradient(0, 0, R, 0);
    g.addColorStop(0, css(palette.road, WORN_EDGE));
    g.addColorStop(WORN_BAND[0], css(palette.road, 1));
    g.addColorStop(WORN_BAND[1], css(palette.road, WORN_MIDDLE));
    g.addColorStop(1 - WORN_BAND[1], css(palette.road, WORN_MIDDLE));
    g.addColorStop(1 - WORN_BAND[0], css(palette.road, 1));
    g.addColorStop(1, css(palette.road, WORN_EDGE));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, R, H);
  }
  // Ruts: the racing lines, worn darker and smoother.
  for (const lane of RUTS) {
    const g = ctx.createLinearGradient((lane - 0.12) * R, 0, (lane + 0.12) * R, 0);
    g.addColorStop(0, css(palette.road, 1, 0));
    g.addColorStop(0.5, css(palette.road, kind === 'trail' ? 0.72 : 0.82, 0.8));
    g.addColorStop(1, css(palette.road, 1, 0));
    ctx.fillStyle = g;
    ctx.fillRect((lane - 0.12) * R, 0, 0.24 * R, H);
  }
  if (kind === 'logging') {
    for (let i = 0; i < GRAVEL * metresAcross * ROAD_TEXTURE_LENGTH; i++) {
      ctx.fillStyle = css(palette.road, 1.15 + rng() * 0.35, 0.7);
      ctx.fillRect(rng() * R, rng() * H, 1 + rng() * 2, 1 + rng() * 2);
    }
  }
  // Roots: dark gnarled lines snaking across, raised a little (a pale lit top edge).
  for (let m = rng() * ROOT_SPACING; m < ROAD_TEXTURE_LENGTH; m += ROOT_SPACING * (0.5 + rng())) {
    const y0 = m * pxPerM;
    const reach = kind === 'trail' ? 0.4 + rng() * 0.6 : 0.15 + rng() * 0.2;
    const fromLeft = rng() < 0.5;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const u = (i / 10) * reach;
      pts.push([(fromLeft ? u : 1 - u) * R, y0 + Math.sin(i * 1.3 + m) * pxPerM * 0.6 + (rng() - 0.5) * pxPerM * 0.3]);
    }
    for (const [dy, colour, width] of [[0, css(palette.road, 0.5, 0.6), 3], [-2, css(palette.sand, 1.1, 0.3), 1.5]] as const) {
      wrapStroke(H, (wrap) => {
        ctx.strokeStyle = colour;
        ctx.lineWidth = width * (pxPerM / 16);
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + dy + wrap) : ctx.moveTo(x, y + dy + wrap)));
        ctx.stroke();
      });
    }
  }
  if (kind === 'trail') {
    // Moss creeping in from both edges, thickest at the edge, in ragged tongues.
    const moss = mossColour(palette);
    for (const mirror of [false, true]) {
      for (let i = 0; i < 260; i++) {
        const depth = Math.pow(rng(), 2.2) * MOSS_CREEP * R;
        const x = mirror ? R - depth : depth;
        const y = rng() * H;
        ctx.fillStyle = css(moss, 0.8 + rng() * 0.4, 0.35 + rng() * 0.4);
        const h = (0.5 + rng() * 2.5) * pxPerM;
        wrapStroke(H, (dy) => ctx.fillRect(mirror ? x - 6 : 0, y + dy, mirror ? R - x + 6 : x + 6, h));
      }
    }
  }
  leaves(ctx, palette, rng, 0, R, H, LEAVES_ROAD * metresAcross * ROAD_TEXTURE_LENGTH, pxPerM);
}

/** Run-off (u 0.5 road side → 1 boundary): moss and leaf litter, the trail breaking up into it. */
export function litterRunoff(ctx: CanvasRenderingContext2D, palette: TrackPalette, rng: Rng, R: number, W: number, H: number, pxPerM: number): void {
  const moss = mossColour(palette);
  const grad = ctx.createLinearGradient(R, 0, W, 0);
  grad.addColorStop(0, css(palette.road, 0.9));
  grad.addColorStop(0.1, css(palette.sand, 0.95));
  grad.addColorStop(1, css(palette.sand, 1));
  ctx.fillStyle = grad;
  ctx.fillRect(R, 0, R, H);
  // Moss cushions: soft-edged green blobs, denser away from the road.
  for (let i = 0; i < MOSS_CUSHIONS; i++) {
    const x = R + Math.pow(rng(), 0.7) * R;
    const y = rng() * H;
    const r = (0.4 + rng() * 1.6) * pxPerM;
    ctx.fillStyle = css(moss, 0.65 + rng() * 0.4, 0.2 + rng() * 0.3);
    wrapStroke(H, (dy) => {
      ctx.beginPath();
      ctx.ellipse(x, y + dy, r, r * (0.6 + rng() * 0.8), rng() * 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // Twigs.
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 160; i++) {
    const x = R + rng() * R;
    const y = rng() * H;
    const a = rng() * Math.PI;
    const l = (0.3 + rng() * 1.2) * pxPerM;
    ctx.strokeStyle = css(palette.road, 0.5, 0.7);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  leaves(ctx, palette, rng, R, R, H, LEAVES_RUNOFF * (R / pxPerM) * ROAD_TEXTURE_LENGTH, pxPerM);
  // Earth of the road edge breaking up into the litter.
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = css(palette.road, 0.85 + rng() * 0.25, 0.8);
    ctx.fillRect(R, rng() * H, Math.pow(rng(), 2) * R * 0.1, 2 + rng() * 8);
  }
}

/** Small leaf shapes over [x0, x0 + w], in autumn tones and the palette's moss. */
function leaves(ctx: CanvasRenderingContext2D, palette: TrackPalette, rng: Rng, x0: number, w: number, H: number, count: number, pxPerM: number): void {
  const tones = [...LEAF_TONES, mossColour(palette)];
  for (let i = 0; i < count; i++) {
    const x = x0 + rng() * w;
    const y = rng() * H;
    const s = (0.08 + rng() * 0.12) * pxPerM;
    ctx.fillStyle = css(tones[Math.floor(rng() * tones.length)], 0.7 + rng() * 0.5, 0.75);
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.5, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The forest's moss: the palette's forest floor (its sand) pushed toward green. */
function mossColour(palette: TrackPalette): number {
  return new THREE.Color(palette.sand).lerp(new THREE.Color(MOSS), MOSS_PULL).getHex();
}
const MOSS = 0x4f7a2a;
const MOSS_PULL = 0.55;

/**
 * Near-white forest-floor detail: mottled moss cushions, leaf litter and twigs over soft earth.
 * Tiles every SAND_TILE metres like the sand it replaces.
 */
export function mossTexture(seed: number, quality: Quality): THREE.CanvasTexture {
  const S = TEXTURE_SIZE[quality];
  const [cv, ctx] = canvas(S, S);
  const rng = mulberry32(seed ^ 0x3055);
  const blot = periodicNoise(rng, 8);
  const fine = periodicNoise(rng, 64);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const cushion = Math.max(0, blot(u * 8, v * 8)) * 0.12;
      const value = 0.84 + cushion + fine(u * 64, v * 64) * 0.07 + (rng() - 0.5) * 0.08;
      const i = (y * S + x) * 4;
      const c = Math.max(0, Math.min(255, value * 255));
      img.data[i] = c * 0.97;
      img.data[i + 1] = c;
      img.data[i + 2] = c * 0.94;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Leaves and twigs as darker marks: the vertex colour carries the hue, this the shapes.
  for (let i = 0; i < (S * S) / 900; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const s = 2 + rng() * 5;
    ctx.fillStyle = `rgba(60,40,20,${0.12 + rng() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.45, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < S / 6; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const a = rng() * Math.PI;
    const l = 6 + rng() * 22;
    ctx.strokeStyle = `rgba(50,32,18,${0.2 + rng() * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  return finish(cv, THREE.RepeatWrapping);
}

/**
 * Near-white mossy stone detail: blocky jointed rock with moss settled on its ledges (lighter,
 * softer patches) and dark wet seams. v is world height (ROCK_TILE metres per repeat).
 */
export function mossyStoneTexture(seed: number, quality: Quality): THREE.CanvasTexture {
  const S = TEXTURE_SIZE[quality];
  const [cv, ctx] = canvas(S, S);
  const rng = mulberry32(seed ^ 0x570e);
  const patch = periodicNoise(rng, 6);
  const fine = periodicNoise(rng, 96);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const moss = Math.max(0, patch(u * 6, v * 6) * 1.6 - 0.2);
      const value = 0.8 + fine(u * 96, v * 96) * 0.08 + moss * 0.1 + (rng() - 0.5) * 0.06;
      const i = (y * S + x) * 4;
      const c = Math.max(0, Math.min(255, value * 255));
      // Moss is greener than the stone it sits on.
      img.data[i] = c * (1 - moss * 0.08);
      img.data[i + 1] = c;
      img.data[i + 2] = c * (0.95 - moss * 0.1);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Joints: horizontal bedding with vertical breaks between blocks.
  ctx.strokeStyle = 'rgba(30,30,24,0.4)';
  ctx.lineWidth = 1.5;
  for (let y = rng() * 40; y < S; y += 30 + rng() * 70) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= S; x += 32) ctx.lineTo(x, y + (rng() - 0.5) * 6);
    ctx.stroke();
    for (let x = rng() * 80; x < S; x += 50 + rng() * 120) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 10, y + 30 + rng() * 40);
      ctx.stroke();
    }
  }
  return finish(cv, THREE.RepeatWrapping);
}
