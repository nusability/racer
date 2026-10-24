import * as THREE from 'three';
import { mulberry32, range, type Rng } from '../../core/rng.ts';
import type { P3 } from './builder.ts';
import type { Quality } from './config.ts';
import type { Corridor } from './corridor.ts';
import { quadFacing } from './paint.ts';

// Rough ground drawn on the road: broken slabs and loose rock in the track's own rock colours
// (sandstone in the desert, coral rock on the coast, grey ice in the north), and a hazard
// band across the road where each rough stretch starts and ends, so a racer reads it from
// far enough out to lift. The road under it is darkened too (corridor.ts), which is what
// reads first at fog distance. Nothing here collides: the damage is in core/vehicle.ts.

/** Below this rough amount a sample counts as smooth road (the blend at each end). */
const ROUGH_VISIBLE = 0.05;
/** Broken slabs and loose stones per square metre at full rough, by quality. */
const SLABS_PER_M2 = { low: 0.05, high: 0.11 } as const;
const STONES_PER_M2 = { low: 0.025, high: 0.06 } as const;
/** Slab size (corner distance from its centre) and how far its corners lift, metres. */
const SLAB_RADIUS: [number, number] = [0.7, 1.9];
const SLAB_LIFT: [number, number] = [0.03, 0.3];
/** Stone footprint radius and height, metres: low enough to read as rubble, not obstacles. */
const STONE_RADIUS: [number, number] = [0.25, 0.8];
const STONE_HEIGHT: [number, number] = [0.25, 0.75];
const STONE_SIDES = 5;
/** Irregularity: corner angle wobble (radians), corner and facet distance as a share of the radius, apex lean. */
const SLAB_CORNER_WOBBLE = 0.35;
const SLAB_CORNER_REACH: [number, number] = [0.7, 1];
const STONE_FACET_REACH: [number, number] = [0.75, 1.1];
const STONE_APEX_LEAN = 0.3;
/** Slabs stay this far inside the road edge so they never poke through a wall. */
const EDGE_INSET = 0.6;
/** Hazard band across the road at each end of a rough stretch: depth along s, block width, lift. */
const BAND_DEPTH = 2.4;
const BAND_BLOCK = 2;
const BAND_LIFT = 0.05;
/**
 * Warning panels painted on the walls before each rough stretch: metres before its start,
 * panel length along the road and stripe length. Unlit, they read long before the rubble does.
 */
const PANEL_LEADS = [180, 70];
const PANEL_LENGTH = 24;
const PANEL_STRIPE = 3;
/** Panels sit this far proud of the wall face so they never z-fight it. */
const PANEL_PROUD = 0.06;
/** Keeps this module's scatter independent of the other seeded dressing. */
const ROUGH_SEED_SALT = 0x7a3c;
/** Slabs read darker than the rock round the course: broken faces and dust in the cracks. */
const SLAB_SHADE: [number, number] = [0.45, 0.8];
/** Stones catch the light: lighter than the slabs they lie on. */
const STONE_SHADE: [number, number] = [0.7, 1.05];

export function buildRoughGround(cor: Corridor, seed: number, quality: Quality): void {
  const r = cor.ribbon;
  if (!r.samples.some((p) => p.rough > ROUGH_VISIBLE)) return;
  const rng = mulberry32(seed ^ ROUGH_SEED_SALT ^ cor.vi);
  const col = new THREE.Color();
  for (let k = 0; k < r.samples.length; k++) {
    const smp = r.samples[k];
    if (smp.gap) continue;
    const prev = r.samples[cor.idx(k - 1)].rough > ROUGH_VISIBLE;
    const here = smp.rough > ROUGH_VISIBLE;
    if (here !== prev && k > 0) band(cor, k);
    if (here && !prev && k > 0) for (const lead of PANEL_LEADS) for (const side of [-1, 1]) panel(cor, k - Math.round(lead / r.step), side);
    if (!here) continue;
    const area = smp.width * r.step * smp.rough;
    for (let n = count(rng, area * SLABS_PER_M2[quality]); n > 0; n--) slab(cor, rng, smp.s + rng() * r.step, smp.width, col);
    for (let n = count(rng, area * STONES_PER_M2[quality]); n > 0; n--) stone(cor, rng, smp.s + rng() * r.step, smp.width, col);
  }
}

/** A whole number with `mean` as its expectation, so density follows the rough amount smoothly. */
function count(rng: Rng, mean: number): number {
  const whole = Math.floor(mean);
  return whole + (rng() < mean - whole ? 1 : 0);
}

/** A broken slab of surface, tilted: four corners round a centre, each lifted its own amount. */
function slab(cor: Corridor, rng: Rng, s: number, width: number, col: THREE.Color) {
  const r = cor.ribbon;
  const radius = range(rng, SLAB_RADIUS[0], SLAB_RADIUS[1]);
  const half = width / 2 - EDGE_INSET - radius;
  if (half <= 0) return;
  const x = range(rng, -half, half);
  const turn = rng() * Math.PI;
  const corner = (i: number): P3 => {
    const a = turn + (i * Math.PI) / 2 + range(rng, -SLAB_CORNER_WOBBLE, SLAB_CORNER_WOBBLE);
    const d = radius * range(rng, SLAB_CORNER_REACH[0], SLAB_CORNER_REACH[1]);
    return r.toWorld(s + Math.cos(a) * d, x + Math.sin(a) * d, range(rng, SLAB_LIFT[0], SLAB_LIFT[1]));
  };
  const [a, b, c, d] = [0, 1, 2, 3].map(corner);
  const up = r.frameAt(s).up;
  rockShade(cor, rng, col, range(rng, SLAB_SHADE[0], SLAB_SHADE[1]));
  quadFacing(cor.chunkAt(s).rock, a, b, c, d, up, col);
}

/** A loose stone: a low faceted pyramid standing on the road. */
function stone(cor: Corridor, rng: Rng, s: number, width: number, col: THREE.Color) {
  const r = cor.ribbon;
  const radius = range(rng, STONE_RADIUS[0], STONE_RADIUS[1]);
  const half = width / 2 - EDGE_INSET - radius;
  if (half <= 0) return;
  const x = range(rng, -half, half);
  const turn = rng() * Math.PI * 2;
  const base: P3[] = [];
  for (let i = 0; i < STONE_SIDES; i++) {
    const a = turn + (i / STONE_SIDES) * Math.PI * 2;
    const d = radius * range(rng, STONE_FACET_REACH[0], STONE_FACET_REACH[1]);
    base.push(r.toWorld(s + Math.cos(a) * d, x + Math.sin(a) * d, 0));
  }
  // The apex leans a little, so a field of them doesn't look stamped.
  const lean = () => range(rng, -STONE_APEX_LEAN, STONE_APEX_LEAN) * radius;
  const apex = r.toWorld(s + lean(), x + lean(), range(rng, STONE_HEIGHT[0], STONE_HEIGHT[1]));
  const centre = r.toWorld(s, x, 0);
  const b = cor.chunkAt(s).rock;
  for (let i = 0; i < STONE_SIDES; i++) {
    const p = base[i];
    const q = base[(i + 1) % STONE_SIDES];
    const out = { x: (p.x + q.x) / 2 - centre.x, y: 0, z: (p.z + q.z) / 2 - centre.z };
    rockShade(cor, rng, col, range(rng, STONE_SHADE[0], STONE_SHADE[1]));
    // A degenerate quad (apex twice) so quadFacing settles the winding.
    quadFacing(b, p, q, apex, apex, out, col);
  }
}

/** The track's own rock, mixed toward its light or dark tone at random. */
function rockShade(cor: Corridor, rng: Rng, out: THREE.Color, shade: number) {
  const p = cor.paint;
  out.copy(p.rock).lerp(rng() < 0.5 ? p.rockDark : p.rockLight, rng());
  out.multiplyScalar(shade);
}

/**
 * Yellow and black stripes on the wall face on `side`, from sample k on, between a third and
 * two thirds of the wall's height (where the corridor's own profile puts the face). Skipped
 * where that side has no wall: sand run-off, an open edge or a junction.
 */
function panel(cor: Corridor, k: number, side: number) {
  const r = cor.ribbon;
  if (!r.closed && k < 0) return;
  const steps = Math.round(PANEL_LENGTH / r.step);
  for (let q = 0; q < steps; q++) {
    const a = k + q;
    const b = a + 1;
    if (!r.closed && b >= r.samples.length) return;
    if (cor.gap(a) || cor.tunnel(a) || cor.open(a, side) || cor.drop(a, side) || cor.junction(a)) continue;
    const A = cor.profile(a, side);
    const B = cor.profile(b, side);
    if (A.sand || B.sand || A.hidden || B.hidden) continue;
    const kk = cor.idx(a);
    const inward = { x: -side * cor.shape.rx[kk], y: 0, z: -side * cor.shape.rz[kk] };
    const proud = (p: P3): P3 => ({ x: p.x + inward.x * PANEL_PROUD, y: p.y, z: p.z + inward.z * PANEL_PROUD });
    const stripe = Math.floor((q * r.step) / PANEL_STRIPE) % 2 === 0;
    quadFacing(cor.glow, proud(A.pts[1]), proud(B.pts[1]), proud(B.pts[2]), proud(A.pts[2]), inward, stripe ? cor.paint.hazard : cor.paint.black);
  }
}

/** Yellow and black blocks across the road at sample k, unlit so they read at speed. */
function band(cor: Corridor, k: number) {
  const r = cor.ribbon;
  const smp = r.samples[cor.idx(k)];
  const half = smp.width / 2;
  const blocks = Math.max(1, Math.round(smp.width / BAND_BLOCK));
  const w = smp.width / blocks;
  const s0 = smp.s - BAND_DEPTH / 2;
  const s1 = smp.s + BAND_DEPTH / 2;
  for (let i = 0; i < blocks; i++) {
    const x0 = -half + i * w;
    const x1 = x0 + w;
    const p = (s: number, x: number) => r.toWorld(s, x, BAND_LIFT);
    quadFacing(cor.glow, p(s0, x0), p(s0, x1), p(s1, x1), p(s1, x0), smp.up, i % 2 === 0 ? cor.paint.hazard : cor.paint.black);
  }
}
