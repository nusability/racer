import * as THREE from 'three';
import { mulberry32, type Rng } from '../../../core/rng.ts';
import { canvas, finish, periodicNoise } from '../canvasPaint.ts';
import type { Quality } from '../config.ts';

// Elderwood's pre-painted images, made once per race on canvases: the bark the near trunks
// wear (colour plus a normal map of its furrows), and the sprite atlas everything further out is
// drawn from, the 90s trick that still fills a phone's frame cheaply: trunk impostors already
// shaded as lit cylinders, fern fronds, shrubs and canopy clumps, all as alpha cut-outs.

/** Bark map size (square; it tiles round and up a trunk). */
const BARK_SIZE = { high: 512, low: 256 } as const;
/**
 * Furrows across one tile, how far each wanders sideways up it (share of their spacing; less
 * than half, so neighbours never pinch together) and the wander's wavelengths (whole numbers of
 * the tile's height, so it tiles up the trunk).
 */
const BARK_FURROWS = 13;
const FURROW_WANDER = 0.18;
const WANDER_WAVES = [1, 3];
/** A furrow's width (share of the spacing): narrow, deep and dark between broad fibrous ridges. */
const FURROW_WIDTH = 0.34;
/** Fibres along the ridges: their sideways frequency (per tile) and how much they ridge the bark. */
const FIBRES = 90;
const FIBRE_LENGTH = 4;
const FIBRE_DEPTH = 0.18;
/** Cracks across the ridges per tile, and their depth (share of a ridge's height). */
const BARK_CRACKS = 14;
const CRACK_DEPTH = 0.4;
/** Bark shade at the bottom of a furrow and on a ridge, and its grain. */
const FURROW_SHADE = 0.3;
const RIDGE_SHADE = 1.05;
const BARK_GRAIN = 0.1;
/** The grain's lattice across and up a tile: stretched up the trunk, like the fibres. */
const GRAIN_CELLS: readonly [number, number] = [48, 12];
/** How hard the furrows bend the light (normal-map gradient scale). */
const BARK_RELIEF = 2.4;

/**
 * Redwood bark, reddish brown, furrowed straight up the trunk. The colour is the bark's own
 * (copies vary its brightness; the moss and the canopy's shade come from vertex colours) and
 * the normal map carries the furrows, so the near trunks catch the light like deep bark.
 */
export function barkTextures(seed: number, quality: Quality, bark: THREE.Color): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const S = BARK_SIZE[quality];
  const rng = mulberry32(seed ^ 0xba4c);
  const height = barkHeight(rng, S);
  const [cv, ctx] = canvas(S, S);
  const img = ctx.createImageData(S, S);
  const grain = latticeNoise(rng, GRAIN_CELLS[0], GRAIN_CELLS[1]);
  const tone = periodicNoise(rng, 6);
  const [br, bg, bb] = srgb(bark).map((c) => c * 255);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const h = height[y * S + x];
      const shade = (FURROW_SHADE + (RIDGE_SHADE - FURROW_SHADE) * h) * (1 + grain((x / S) * GRAIN_CELLS[0], (y / S) * GRAIN_CELLS[1]) * BARK_GRAIN);
      // Old bark weathers unevenly: broad patches redder, others greyer.
      const t = tone((x / S) * 6, (y / S) * 6) * 0.5;
      const i = (y * S + x) * 4;
      img.data[i] = Math.min(255, br * shade * (1 + t * 0.2));
      img.data[i + 1] = Math.min(255, bg * shade * (1 + t * 0.05));
      img.data[i + 2] = Math.min(255, bb * shade * (1 - t * 0.1));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = finish(cv, THREE.RepeatWrapping);

  const [ncv, nctx] = canvas(S, S);
  const nimg = nctx.createImageData(S, S);
  const at = (x: number, y: number) => height[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * BARK_RELIEF;
      const dy = (at(x, y + 1) - at(x, y - 1)) * BARK_RELIEF;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      nimg.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  const normal = finish(ncv, THREE.RepeatWrapping);
  // A normal map is data, not colour.
  normal.colorSpace = THREE.NoColorSpace;
  return { map, normal };
}

/** Height of the bark (0 furrow .. 1 ridge top) over a tile, wrapping both ways. */
function barkHeight(rng: Rng, S: number): Float32Array {
  const out = new Float32Array(S * S);
  const phases = Array.from({ length: BARK_FURROWS }, () => WANDER_WAVES.map(() => rng() * Math.PI * 2));
  const pitch = S / BARK_FURROWS;
  const fibre = latticeNoise(rng, FIBRES, FIBRE_LENGTH);
  for (let y = 0; y < S; y++) {
    const v = y / S;
    // Each furrow's line this row, wandering in whole waves up the tile.
    const lines = phases.map((ph, f) => (f + 0.5) * pitch + WANDER_WAVES.reduce((a, w, k) => a + Math.sin(v * Math.PI * 2 * w + ph[k]) * (FURROW_WANDER * pitch) / (k + 1), 0));
    for (let x = 0; x < S; x++) {
      let d = Infinity;
      for (const c of lines) {
        const dx = Math.abs(x - c);
        d = Math.min(d, Math.min(dx, S - dx));
      }
      const t = Math.min(1, d / (pitch * FURROW_WIDTH));
      const ridge = t * t * (3 - 2 * t);
      // Long fibres: noise stretched up the trunk.
      const f = fibre((x / S) * FIBRES, v * FIBRE_LENGTH) * FIBRE_DEPTH;
      out[y * S + x] = Math.max(0, Math.min(1, ridge * (1 - FIBRE_DEPTH) + f + FIBRE_DEPTH * 0.5));
    }
  }
  // Cracks across the ridges: short dark breaks that plate the bark.
  for (let c = 0; c < BARK_CRACKS; c++) {
    const cx = Math.floor(rng() * S);
    const cy = Math.floor(rng() * S);
    const len = Math.floor(pitch * (0.3 + rng() * 0.5));
    for (let i = 0; i < len; i++) out[cy * S + ((cx + i) % S)] *= 1 - CRACK_DEPTH;
  }
  return out;
}

/** Value noise on an nx × ny lattice that wraps both ways: stretched where nx ≠ ny. */
function latticeNoise(rng: Rng, nx: number, ny: number): (x: number, y: number) => number {
  const v = new Float32Array(nx * ny).map(() => rng() * 2 - 1);
  const at = (i: number, j: number) => v[(((j % ny) + ny) % ny) * nx + (((i % nx) + nx) % nx)];
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

/** A colour as sRGB channels 0..1: canvases are painted in the texture's own (sRGB) space. */
type Rgb = [number, number, number];
function srgb(c: THREE.Color): Rgb {
  const o = { r: 0, g: 0, b: 0 };
  c.getRGB(o, THREE.SRGBColorSpace);
  return [o.r, o.g, o.b];
}
function style(c: Rgb, k: number): string {
  const ch = (v: number) => Math.round(Math.min(255, Math.max(0, v * k * 255)));
  return `rgb(${ch(c[0])},${ch(c[1])},${ch(c[2])})`;
}

// --- The sprite atlas ---------------------------------------------------------------------------

/** What a sprite is, which decides where it may be drawn (forest.ts) and how it is lit (forestSprites.ts). */
export type SpriteKind = 'trunk' | 'fern' | 'shrub' | 'canopy';

export interface SpriteFrame {
  kind: SpriteKind;
  /** Atlas rectangle: u0, v0, width, height (0..1, v up). */
  rect: [number, number, number, number];
}

/** Atlas size (square). */
const ATLAS_SIZE = { high: 1024, low: 512 } as const;
/**
 * Trunk impostors fill the left of the atlas, side by side, full height; the right column holds
 * the small sprites stacked. A trunk's frame is TRUNK_FRAME_WIDTH barrel diameters wide, so its
 * root flare fits.
 */
const TRUNK_FRAMES = 8;
const TRUNK_SHARE = 0.75;
export const TRUNK_FRAME_WIDTH = 2.2;
/** The sun's side of a painted trunk: its direction across the image (−1 left) and toward the viewer. */
const PAINT_LIGHT: readonly [number, number] = [-0.55, 0.83];
/** Painted trunk light: the shadowed side's share (sky light), and the lit side's extra. */
const TRUNK_AMBIENT = 0.42;
const TRUNK_DIRECT = 0.62;
/** Furrows round a painted trunk (they crowd toward its edges, as on a cylinder). */
const TRUNK_FURROWS = 7;
/** The painted root flare: how much wider than the barrel at the very foot, and how high it reaches (share of the frame). */
const FLARE_WIDTH = 0.85;
const FLARE_HEIGHT = 0.035;
/** Moss up the foot, and the canopy's shade over the top (shares of the frame's height). */
const MOSS_UP = 0.07;
const SHADE_FROM = 0.55;
const SHADE_TOP = 0.28;
/** Barrel taper from foot to top. */
const TAPER = 0.18;
/** The top of a painted trunk fades out (share of the frame), so it never ends in a hard edge. */
const TOP_FADE = 0.08;

/**
 * Paints the sprite atlas: trunk impostors (lit cylinders with furrows, a flare and mossy foot,
 * fading into the canopy's shade at the top), then fern, shrub and canopy cut-outs. Colours are
 * the sprites' own; the material lights them like everything else.
 */
export function spriteAtlas(seed: number, quality: Quality, c: { bark: THREE.Color; moss: THREE.Color; fern: THREE.Color; leaves: THREE.Color }): { texture: THREE.CanvasTexture; frames: SpriteFrame[] } {
  const S = ATLAS_SIZE[quality];
  const [cv, ctx] = canvas(S, S);
  const rng = mulberry32(seed ^ 0x5b17);
  const frames: SpriteFrame[] = [];
  const tw = Math.floor((S * TRUNK_SHARE) / TRUNK_FRAMES);
  for (let i = 0; i < TRUNK_FRAMES; i++) {
    const k = 0.85 + rng() * 0.3;
    paintTrunk(ctx, i * tw, tw, S, rng, srgb(c.bark).map((v) => v * k) as Rgb, srgb(c.moss));
    frames.push({ kind: 'trunk', rect: [(i * tw) / S, 0, tw / S, 1] });
  }
  const x0 = Math.floor(S * TRUNK_SHARE);
  const cell = S - x0;
  const small: [SpriteKind, (x: number, y: number, w: number) => void][] = [
    ['fern', (x, y, w) => paintFern(ctx, x, y, w, rng, srgb(c.fern))],
    ['fern', (x, y, w) => paintFern(ctx, x, y, w, rng, srgb(c.fern.clone().lerp(c.moss, 0.4)))],
    ['shrub', (x, y, w) => paintShrub(ctx, x, y, w, rng, srgb(c.fern.clone().multiplyScalar(0.7)))],
    ['canopy', (x, y, w) => paintCanopy(ctx, x, y, w, rng, srgb(c.leaves))],
  ];
  small.forEach(([kind, paint], i) => {
    const y = i * cell;
    paint(x0, y, cell);
    // Canvas y runs down; the atlas's v runs up.
    frames.push({ kind, rect: [x0 / S, 1 - (y + cell) / S, cell / S, cell / S] });
  });
  const texture = finish(cv, THREE.ClampToEdgeWrapping);
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return { texture, frames };
}

function paintTrunk(ctx: CanvasRenderingContext2D, x0: number, w: number, H: number, rng: Rng, bark: Rgb, moss: Rgb): void {
  const img = ctx.createImageData(w, H);
  const barrel = w / TRUNK_FRAME_WIDTH / 2;
  const cx = w / 2;
  const phase = rng() * Math.PI * 2;
  const crack = periodicNoise(rng, 64);
  for (let y = 0; y < H; y++) {
    // Height up the trunk, 0 at the foot.
    const up = 1 - y / H;
    const flare = 1 + FLARE_WIDTH * Math.exp(-up / FLARE_HEIGHT);
    const half = barrel * (1 - TAPER * up) * flare;
    for (let x = 0; x < w; x++) {
      const t = (x + 0.5 - cx) / half;
      const i = (y * w + x) * 4;
      if (Math.abs(t) >= 1) {
        img.data[i + 3] = 0;
        continue;
      }
      const nz = Math.sqrt(1 - t * t);
      const light = TRUNK_AMBIENT + TRUNK_DIRECT * Math.max(0, PAINT_LIGHT[0] * t + PAINT_LIGHT[1] * nz);
      // Furrows run round the cylinder: evenly spaced in angle, so they crowd at the edges.
      const a = Math.asin(t);
      const ridge = 0.5 + 0.5 * Math.cos(a * TRUNK_FURROWS * 2 + phase + Math.sin(up * 40 + a * 3) * 0.6);
      const plates = 0.85 + 0.15 * crack((x / w) * 8, up * 64);
      const shade = light * (FURROW_SHADE + (RIDGE_SHADE - FURROW_SHADE) * ridge) * plates;
      const mossy = Math.max(0, 1 - up / MOSS_UP) * 0.8;
      // Toward the canopy the trunk sinks into its shade.
      const canopy = 1 - (1 - SHADE_TOP) * Math.max(0, (up - SHADE_FROM) / (1 - SHADE_FROM));
      for (let ch = 0; ch < 3; ch++) img.data[i + ch] = Math.min(255, (bark[ch] * shade * (1 - mossy) + moss[ch] * light * mossy) * canopy * 255);
      // A soft pixel at the silhouette, so the cut-out's edge is not a staircase; the top
      // thins away into the canopy, ragged across the trunk.
      const top = Math.min(1, (1 - up) / TOP_FADE + Math.sin(x * 1.7 + phase) * 0.3);
      img.data[i + 3] = Math.min(255, (1 - Math.abs(t)) * half * 2 * 255) * Math.max(0, top);
    }
  }
  ctx.putImageData(img, x0, 0);
}

/** Fronds of a fern clump, rising from the cell's bottom middle and arching out, leaflets along each. */
function paintFern(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, rng: Rng, fern: Rgb): void {
  const base = { x: x0 + w / 2, y: y0 + w * 0.98 };
  const fronds = 13;
  for (let f = 0; f < fronds; f++) {
    // Fan out from upright to nearly flat on either side.
    const a = -Math.PI / 2 + ((f / (fronds - 1)) * 2 - 1) * (Math.PI * 0.46) + (rng() - 0.5) * 0.2;
    const len = w * (0.38 + rng() * 0.12) * (1 - Math.abs(Math.cos(a + Math.PI / 2)) * 0.15);
    const droop = 0.6 + rng() * 0.6;
    const k = 0.75 + rng() * 0.45;
    const pt = (s: number) => ({
      x: base.x + Math.cos(a) * len * s,
      y: base.y + Math.sin(a) * len * s + droop * len * s * s * Math.abs(Math.cos(a)),
    });
    ctx.strokeStyle = style(fern, k * 0.7);
    ctx.lineWidth = Math.max(1, w / 120);
    ctx.beginPath();
    for (let s = 0; s <= 1.0001; s += 0.05) {
      const p = pt(s);
      if (s === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    // Leaflets: pairs of short tapered strokes, shrinking toward the tip, lighter at the tips.
    for (let s = 0.12; s < 0.98; s += 0.055) {
      const p = pt(s);
      const q = pt(s + 0.02);
      const dir = Math.atan2(q.y - p.y, q.x - p.x);
      const leaf = w * 0.07 * (1 - s * 0.75);
      const light = k * (0.8 + s * 0.5);
      ctx.strokeStyle = style(fern, light);
      ctx.lineWidth = Math.max(1, leaf * 0.35);
      for (const side of [-1, 1]) {
        const la = dir + side * (Math.PI / 2.6);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(la) * leaf, p.y + Math.sin(la) * leaf + leaf * 0.3);
        ctx.stroke();
      }
    }
  }
}

/**
 * A ragged mass of canopy seen from below: clusters of leaves scattered over the whole cell,
 * thickest in its middle, no flat underside or round top (that reads as one tree's crown, not
 * the roof of a forest), darkest where the most leaves overlap.
 */
function paintCanopy(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, rng: Rng, leaf: Rgb): void {
  const clusters = 26;
  for (let c = 0; c < clusters; c++) {
    // Clusters gather toward the middle, spread wider than tall.
    const cx = x0 + w * (0.5 + (rng() + rng() - 1) * 0.42);
    const cy = y0 + w * (0.5 + (rng() + rng() - 1) * 0.3);
    const spread = w * (0.06 + rng() * 0.08);
    for (let i = 0; i < 60; i++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * spread;
      const light = 0.35 + rng() * 0.5 + (cy - y0 < w * 0.4 ? 0.15 : 0);
      ctx.fillStyle = style(leaf, light);
      const s = w * (0.008 + rng() * 0.014);
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, s, s * 0.5, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** A mound of leaves: overlapping clusters of small leaf shapes, darker underneath and inside. */
function paintShrub(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, rng: Rng, leaf: Rgb): void {
  const leaves = 900;
  for (let i = 0; i < leaves; i++) {
    // Inside a dome: wide at the bottom, rounded on top.
    const u = rng() * 2 - 1;
    const v = rng();
    const r = Math.sqrt(1 - v * v * 0.9);
    const x = x0 + w / 2 + u * r * w * 0.46;
    const y = y0 + w * (0.98 - v * 0.9);
    const depth = 1 - Math.abs(u) * r;
    const light = 0.45 + v * 0.6 + rng() * 0.2 - depth * 0.15;
    ctx.fillStyle = style(leaf, light);
    const s = w * (0.012 + rng() * 0.02);
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.55, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}
