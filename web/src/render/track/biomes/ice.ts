import * as THREE from 'three';
import type { TrackPalette } from '../../../core/types.ts';
import { mulberry32, range, type Rng } from '../../../core/rng.ts';
import type { IceScenery } from '../../../data/tracks/scenery.ts';
import { FlatBuilder, type P3 } from '../builder.ts';
import { HORIZON_MAX, HORIZON_MIN, ROCK_TILE } from '../config.ts';
import type { Corridor } from '../corridor.ts';
import { instanced, type Placement } from '../instanced.ts';
import { fbm, smoothstep } from '../noise.ts';
import { quadFacing } from '../paint.ts';
import { rockTexture, sandTexture } from '../textures.ts';
import type { BiomeKit } from './kit.ts';

// Frostline: snowfields in wind-carved drifts, mountain walls rising a little way off the
// course with rock showing on their steeps, snow-capped peaks all round the horizon, dark
// pines along the road and blue seracs of glacier ice.

/** Wind-carved drift spacing, metres. */
const DRIFT_WAVELENGTH = 110;
/** Scale of the mountain massifs beside the course and how far off they start rising. */
const MASSIF_SCALE = 700;
const MASSIF_START = 0.35;
/** The open snowfield sits this far under the lowest road. */
const FLOOR_BELOW_ROAD = 2;
/** Above this fraction of a peak's height it is snow; below, banded rock. */
const SNOWLINE = 0.45;
/** Peaks keep at least this far from every point of the lap. */
const PEAK_CLEAR = 450;
/** Pines stand this far past the hard boundary, in a band this deep. */
const PINE_SETBACK = 25;
const PINE_BAND = 220;
const SERAC_SETBACK = 40;
const SERAC_BAND = 160;
const SNOW_WHITE = new THREE.Color(0xf6faff);
const ICE_BLUE = new THREE.Color(0x9fd6f4);
const PINE = new THREE.Color(0x1f3a32);

export function iceKit(scenery: IceScenery, palette: TrackPalette): BiomeKit {
  const snow = new THREE.Color(palette.sand);
  const shadowSnow = snow.clone().lerp(new THREE.Color(0x7f9fd0), 0.35);
  const rock = new THREE.Color(palette.rock);
  const h = scenery.driftHeight;
  return {
    ground: {
      base: (minRoadY) => minRoadY - FLOOR_BELOW_ROAD,
      natural(g, x, z, ripple) {
        const along = x * g.windDir.x + z * g.windDir.z;
        const warp = fbm(g.noise, x / 300, z / 300, 2) * 2;
        const drift = 1 - Math.abs(Math.sin((Math.PI * along) / DRIFT_WAVELENGTH + warp));
        const swell = fbm(g.noise, x / 500 + 30, z / 500 + 30, 3);
        // Massifs rise only away from the course (ripple fades to 0 there), so every road
        // runs along a valley floor with mountain walls a little way off.
        const massif = Math.max(0, fbm(g.noise, x / MASSIF_SCALE + 70, z / MASSIF_SCALE + 70, 3) + 0.15);
        const away = 1 - smoothstep((ripple - MASSIF_START) / (1 - MASSIF_START));
        return g.base + h * (0.6 * drift * drift * ripple + 1.2 * swell) + scenery.massifHeight * massif * away;
      },
      color(g, x, z, y, slope, out) {
        const grain = g.noise(x / 7 + 50, z / 7 + 50) * 0.03;
        // Steep ground sheds its snow and shows rock; hollows hold blue shadowed snow.
        const rel = h > 0 ? (y - g.base) / (h * 2) : 0.5;
        out.copy(shadowSnow).lerp(snow, smoothstep(rel * 1.4 + 0.3));
        out.lerp(rock, smoothstep((slope - 0.55) / 0.35) * 0.85);
        out.multiplyScalar(1 + grain);
        return out;
      },
    },
    road: { surface: 'packed', runoff: 'sand' },
    roadLight: 0,
    masonry: 'sandstone',
    detail: (seed, quality) => ({ sand: sandTexture(seed, quality), rock: rockTexture(seed, quality) }),
    dress(ctx) {
      const main = ctx.corridors[0];
      const objects: THREE.Object3D[] = [];
      const peaks = buildPeaks(main, scenery, palette, ctx.seed).build(ROCK_TILE);
      if (peaks) {
        const m = new THREE.Mesh(peaks, ctx.lit);
        m.name = 'peaks';
        m.matrixAutoUpdate = false;
        objects.push(m);
      }
      objects.push(...buildWoods(ctx.corridors, scenery, ctx.lit, ctx.seed));
      return {
        objects,
        update() {},
        dispose() {
          peaks?.dispose();
        },
      };
    },
    spray: { road: palette.road, runoff: palette.sand, water: SNOW_WHITE.getHex() },
    debris: { color: ICE_BLUE.getHex(), glow: 0, dust: SNOW_WHITE.getHex(), streak: SNOW_WHITE.getHex(), shape: 'rock' },
  };
}

/** Snow-capped peaks ringing the course: jagged cones, rock below the snowline. */
function buildPeaks(cor: Corridor, scenery: IceScenery, palette: TrackPalette, seed: number): FlatBuilder {
  const b = new FlatBuilder();
  const rng = mulberry32(seed ^ 0x51ce);
  const S = cor.ground.views.flatMap((v) => v.ribbon.samples);
  let cx = 0;
  let cz = 0;
  for (const s of S) {
    cx += s.pos.x / S.length;
    cz += s.pos.z / S.length;
  }
  const radius = Math.max(...S.map((s) => Math.hypot(s.pos.x - cx, s.pos.z - cz)));
  const clear = (x: number, z: number, r: number) => {
    for (let k = 0; k < S.length; k += 10) if (Math.hypot(S[k].pos.x - x, S[k].pos.z - z) < PEAK_CLEAR + r) return false;
    return true;
  };
  const rockCol = new THREE.Color(palette.rock);
  let placed = 0;
  for (let tries = 0; placed < scenery.peaks && tries < scenery.peaks * 30; tries++) {
    const a = rng() * Math.PI * 2;
    const d = radius + range(rng, HORIZON_MIN, HORIZON_MAX);
    const r = range(rng, 260, 620);
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    if (!clear(x, z, r)) continue;
    const y = cor.ground.height(x, z) - 10;
    peak(b, { x, y, z }, r, r * range(rng, 0.7, 1.25), rng, rockCol);
    placed++;
  }
  return b;
}

/** A jagged cone: rings narrowing to a crooked summit, snow above the snowline. */
function peak(b: FlatBuilder, c: P3, r: number, height: number, rng: Rng, rock: THREE.Color) {
  const sides = 9;
  const rings = [0, 0.3, 0.55, 0.78, 1];
  const lean = { x: range(rng, -0.15, 0.15) * r, z: range(rng, -0.15, 0.15) * r };
  const pts = rings.map((t) =>
    Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2 + t * 0.6;
      const rr = r * (1 - t) * range(rng, 0.75, 1.2) + (t === 1 ? 0 : 4);
      return { x: c.x + lean.x * t + Math.cos(a) * rr, y: c.y + height * t * range(rng, 0.92, 1.05), z: c.z + lean.z * t + Math.sin(a) * rr };
    }),
  );
  const col = (y: number, out: THREE.Color) => {
    const t = (y - c.y) / height;
    return t > SNOWLINE ? out.copy(SNOW_WHITE) : out.copy(rock).multiplyScalar(0.75 + 0.5 * t);
  };
  const ca = new THREE.Color();
  const cb = new THREE.Color();
  for (let q = 0; q + 1 < pts.length; q++) {
    for (let i = 0; i < sides; i++) {
      const k = (i + 1) % sides;
      const A = pts[q][i];
      col(A.y, ca);
      col(pts[q + 1][i].y, cb);
      quadFacing(b, A, pts[q][k], pts[q + 1][k], pts[q + 1][i], { x: A.x - c.x, y: 0, z: A.z - c.z }, ca, ca, cb, cb);
    }
  }
}

/** Pines in bands beside the course and seracs of glacier ice further out: instanced. */
function buildWoods(corridors: Corridor[], scenery: IceScenery, mat: THREE.Material, seed: number): THREE.Object3D[] {
  const rng = mulberry32(seed ^ 0x9e11);
  const pines: Placement[] = [];
  const seracs: Placement[] = [];
  for (const cor of corridors) {
    const r = cor.ribbon;
    const every = Math.max(1, Math.round(1000 / Math.max(1, scenery.pinesPerKm) / r.step));
    for (let k = 0; k < r.samples.length; k += every) {
      if (cor.shape.deck[k] || cor.shape.tunnel[k]) continue;
      const side = rng() < 0.5 ? -1 : 1;
      if (cor.shape.drop[side < 0 ? 0 : 1][k] || cor.shape.open[side < 0 ? 0 : 1][k]) continue;
      const out = cor.edge(k, side) + PINE_SETBACK + rng() * PINE_BAND;
      const p = cor.beside(k, side, out - cor.edge(k, side), 0);
      if (!cor.ground.clearOfCourse(p.x, p.z, 6)) continue;
      const y = cor.ground.height(p.x, p.z) - 0.5;
      const sc = range(rng, 0.8, 1.6);
      pines.push({ pos: { x: p.x, y, z: p.z }, yaw: rng() * 6.3, scale: { x: sc, y: sc * range(rng, 0.9, 1.3), z: sc } });
      // Seracs cluster in groups of a few, well clear of the course.
      if (rng() < scenery.seracs / 100) {
        const so = cor.edge(k, -side) + SERAC_SETBACK + rng() * SERAC_BAND;
        const q = cor.beside(k, -side, so - cor.edge(k, -side), 0);
        if (cor.ground.clearOfCourse(q.x, q.z, 10)) {
          const s2 = range(rng, 4, 11);
          seracs.push({ pos: { x: q.x, y: cor.ground.height(q.x, q.z) + s2 * 0.3, z: q.z }, yaw: rng() * 6.3, scale: { x: s2, y: s2 * range(rng, 1.2, 2.2), z: s2 * range(rng, 0.7, 1.1) } });
        }
      }
    }
  }
  const out: THREE.Object3D[] = [];
  const woods = instanced(pineGeometry(), mat, pines, 'pines');
  if (woods) out.push(woods);
  const g = new THREE.IcosahedronGeometry(1, 0);
  paintGeometry(g, ICE_BLUE);
  const ice = instanced(g, mat, seracs, 'seracs');
  if (ice) out.push(ice);
  return out;
}

/** Three stacked cones on a trunk, dark green with snow on each tier's top. */
function pineGeometry(): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const tiers: [number, number, number][] = [
    [3.2, 2, 7],
    [2.5, 5.5, 9.5],
    [1.7, 8.5, 12.5],
  ];
  const sides = 7;
  for (const [r, y0, y1] of tiers) {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const p0 = { x: Math.cos(a0) * r, y: y0, z: Math.sin(a0) * r };
      const p1 = { x: Math.cos(a1) * r, y: y0, z: Math.sin(a1) * r };
      const top = { x: 0, y: y1, z: 0 };
      const mid0 = { x: p0.x * 0.45, y: y0 + (y1 - y0) * 0.55, z: p0.z * 0.45 };
      const mid1 = { x: p1.x * 0.45, y: y0 + (y1 - y0) * 0.55, z: p1.z * 0.45 };
      const outDir = { x: Math.cos((a0 + a1) / 2), y: 0.4, z: Math.sin((a0 + a1) / 2) };
      quadFacing(b, p0, p1, mid1, mid0, outDir, PINE, PINE, PINE, PINE);
      b.tri(mid0, mid1, top, SNOW_WHITE);
    }
  }
  const trunk = new THREE.Color(0x4a3428);
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 4) * Math.PI * 2;
    const a1 = ((i + 1) / 4) * Math.PI * 2;
    const w = 0.4;
    const p = (a: number, y: number) => ({ x: Math.cos(a) * w, y, z: Math.sin(a) * w });
    quadFacing(b, p(a0, -1), p(a1, -1), p(a1, 2.2), p(a0, 2.2), { x: Math.cos(a0 + 0.8), y: 0, z: Math.sin(a0 + 0.8) }, trunk);
  }
  const g = b.build();
  if (!g) throw new Error('pine geometry is empty');
  return g;
}

function paintGeometry(g: THREE.BufferGeometry, c: THREE.Color) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

