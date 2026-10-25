import * as THREE from 'three';
import type { TrackPalette } from '../../../core/types.ts';
import type { MoonSurface } from '../../../data/tracks/scenery.ts';
import type { Ground } from '../ground.ts';
import { fbm, smoothstep } from '../noise.ts';
import type { GroundStyle } from './kit.ts';

// A moon's surface for the one space track with ground: grey regolith rolling gently, pocked with
// craters (a bowl, a raised rim and a skirt of brighter ejecta), and a small moon's curvature.
// Space has no fog to hide where the terrain mesh ends, so the ground falls away from the course
// as a sphere would: past a flat band the drop grows with the square of the distance, the
// horizon closes in a few hundred metres off the road and everything beyond it, the mesh's edge
// included, is under it.

/** The open moon sits this far under the lowest road. */
const FLOOR_BELOW_ROAD = 1.5;
/** Ground within this of the course keeps its height; past it the curvature takes over. */
const FLAT_BAND = 400;
/** Radius of the moon's curvature, metres: small, so the horizon is close and hides the mesh's edge. */
const MOON_RADIUS = 12000;
/** Distance field for the curvature: cell size, and how far past the course it reaches. */
const CELL = 100;
const REACH = 4000;
/** Every this many samples of a ribbon count toward the distance field. */
const SAMPLE_EVERY = 20;
/** Craters: one candidate per cell of this many crater radii; bowl depth and rim height as shares of the radius. */
const CELL_RADII = 4;
const BOWL = 0.22;
const RIM = 0.07;
/** The rim's width as a share of the radius; ejecta reach this many radii out. */
const RIM_WIDTH = 0.25;
const EJECTA = 1.8;
/** Crater sizes run from this share of the typical radius up to three times it (most small). */
const SIZE_MIN = 0.4;
const SIZE_SPREAD = 2.6;
const SIZE_POWER = 3;
/** Rolling maria: their scale, metres. */
const MARE_SCALE = 700;
/** Colour: crater floors darker, ejecta brighter, slopes shaded. */
const FLOOR_SHADE = 0.72;
const EJECTA_LIGHT = 0.28;

export function moonGround(moon: MoonSurface, palette: TrackPalette): GroundStyle {
  const regolith = new THREE.Color(palette.sand);
  const dark = new THREE.Color(palette.sand).multiplyScalar(FLOOR_SHADE);
  const light = new THREE.Color(palette.sand).lerp(new THREE.Color(0xffffff), EJECTA_LIGHT);
  const fields = new WeakMap<Ground, DistanceField>();
  const field = (g: Ground) => {
    let f = fields.get(g);
    if (!f) {
      f = distanceField(g);
      fields.set(g, f);
    }
    return f;
  };
  return {
    base: (minRoadY) => minRoadY - FLOOR_BELOW_ROAD,
    natural(g, x, z, ripple) {
      const mare = fbm(g.noise, x / MARE_SCALE + 13, z / MARE_SCALE + 13, 3);
      const c = craters(g, x, z, moon);
      const off = Math.max(0, field(g).at(x, z) - FLAT_BAND);
      return g.base + moon.relief * mare + c.height * (0.4 + 0.6 * ripple) - (off * off) / (2 * MOON_RADIUS);
    },
    color(g, x, z, _y, slope, out) {
      const c = craters(g, x, z, moon);
      const grain = g.noise(x / 7 + 50, z / 7 + 50) * 0.05;
      out.copy(regolith).lerp(dark, c.floor).lerp(light, c.ejecta);
      return out.multiplyScalar(1 + grain - Math.min(0.3, slope * 0.4));
    },
  };
}

interface DistanceField {
  /** Horizontal distance to the nearest part of the course, metres (REACH when farther). */
  at(x: number, z: number): number;
}

/** A coarse grid of distances to the course, sampled bilinearly. */
function distanceField(g: Ground): DistanceField {
  const pts: { x: number; z: number }[] = [];
  for (const v of g.views) for (let k = 0; k < v.shape.gx.length; k += SAMPLE_EVERY) pts.push({ x: v.shape.gx[k], z: v.shape.gz[k] });
  const x0 = Math.min(...pts.map((p) => p.x)) - REACH;
  const z0 = Math.min(...pts.map((p) => p.z)) - REACH;
  const w = Math.ceil((Math.max(...pts.map((p) => p.x)) + REACH - x0) / CELL) + 1;
  const h = Math.ceil((Math.max(...pts.map((p) => p.z)) + REACH - z0) / CELL) + 1;
  const d = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = x0 + i * CELL;
      const z = z0 + j * CELL;
      let best = REACH * REACH;
      for (const p of pts) best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2);
      d[j * w + i] = Math.sqrt(best);
    }
  }
  return {
    at(x, z) {
      const fi = (x - x0) / CELL;
      const fj = (z - z0) / CELL;
      const i = Math.floor(fi);
      const j = Math.floor(fj);
      if (i < 0 || j < 0 || i >= w - 1 || j >= h - 1) return REACH;
      const u = fi - i;
      const t = fj - j;
      const a = d[j * w + i] + (d[j * w + i + 1] - d[j * w + i]) * u;
      const b = d[(j + 1) * w + i] + (d[(j + 1) * w + i + 1] - d[(j + 1) * w + i]) * u;
      return a + (b - a) * t;
    },
  };
}

/** The craters' effect at a point: height, how much is crater floor, how much ejecta (0..1). */
function craters(g: Ground, x: number, z: number, moon: MoonSurface): { height: number; floor: number; ejecta: number } {
  const size = moon.craterRadius * CELL_RADII;
  const ci = Math.floor(x / size);
  const cj = Math.floor(z / size);
  let height = 0;
  let floor = 0;
  let ejecta = 0;
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      const h1 = hash(i, j, 1);
      if (h1 > moon.craterShare) continue;
      const r = moon.craterRadius * (SIZE_MIN + SIZE_SPREAD * hash(i, j, 2) ** SIZE_POWER);
      const cx = (i + 0.2 + 0.6 * hash(i, j, 3)) * size;
      const cz = (j + 0.2 + 0.6 * hash(i, j, 4)) * size;
      const q = Math.hypot(x - cx, z - cz) / r;
      if (q > EJECTA) continue;
      const bowl = q < 1 ? -BOWL * r * (1 - q * q) : 0;
      const rim = RIM * r * Math.exp(-(((q - 1) / RIM_WIDTH) ** 2));
      height += bowl + rim;
      floor = Math.max(floor, q < 1 ? 1 - smoothstep(q * 1.2) : 0);
      ejecta = Math.max(ejecta, q > 0.9 ? (1 - smoothstep((q - 1) / (EJECTA - 1))) * 0.8 : 0);
    }
  }
  // The noise keeps every crater from being a perfect circle of colour.
  ejecta *= 0.6 + 0.4 * g.noise(x / 30 + 7, z / 30 + 7);
  return { height, floor, ejecta };
}

/** A deterministic 0..1 hash of a crater cell and a salt. */
function hash(i: number, j: number, salt: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
