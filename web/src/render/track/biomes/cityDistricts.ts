import { mulberry32, range, type Rng } from '../../../core/rng.ts';
import type { CityArchetype, CityDistrict, CityScenery } from '../../../data/tracks/scenery.ts';
import { HORIZON_MAX, HORIZON_MIN } from '../config.ts';
import type { Ground } from '../ground.ts';
import { sideIndex } from '../shape.ts';
import { ARCHETYPES, BLOCK_SCALE } from './cityArchetypes.ts';
import { Builder, type Face, type Plot } from './cityBuilder.ts';
import type { CityParts } from './cityParts.ts';
import { BUILDING_CLEAR, type CitySite, type Lot } from './citySite.ts';

// Where the city's buildings stand and what each one is. A street grid round the course: the
// canyon of high-rises lining it first (the grid's blocks nearest the course fill first), then
// the towers behind, tallest furthest back, then a skyline of taller towers ringing the horizon.
// The ground is split into districts (scenery.districts), patches a few blocks across, so the
// city's character shifts along the lap; each building is an archetype drawn from its
// district's mix, dressed in its district's grime and neon.

/** Street grid: block pitch and the street between blocks, metres. */
const BLOCK = 120;
const STREET = 22;
/** Lots per block side (a block holds up to LOTS² buildings). */
const LOTS = 2;
/** A lot's plot: this share of the lot (the street side stays open). */
const PLOT: readonly [number, number] = [0.66, 0.92];
/** A megastructure taking a whole block covers this share of it. */
const BLOCK_PLOT = 0.95;
/** Share of block-scale archetypes that take a whole block when it is free and clear. */
const BLOCK_SHARE = 0.55;
/** Share of a block's lots that keep the block's archetype (the rest draw their own). */
const SAME_BLOCK = 0.6;
/** The district is searched this far out from the course for blocks. */
const DISTRICT_REACH = 900;
/** Districts are patches about this wide (m): a few blocks, so one lap passes through several. */
const DISTRICT_SPAN = 520;
/** Tower height spread round the scenery's typical height. */
const HEIGHT_SPREAD: readonly [number, number] = [0.35, 1.9];
/**
 * The canyon: the blocks this deep beside the course, this many buildings per kilometre of lap,
 * most of them high-rises nearly as tall as the towers behind (shares of the scenery's tower
 * height), so the course runs between walls of lit storeys.
 */
const CANYON_BAND = 260;
export const CANYON_PER_KM = 55;
const CANYON_HEIGHT: readonly [number, number] = [0.5, 1.05];
/** Rhythm in the canyon walls: this share of its buildings are low blocks of these heights. */
const CANYON_LOW_SHARE = 0.2;
const CANYON_LOW: readonly [number, number] = [12, 34];
/** Share of canyon blocks left as open squares, so the skyline shows between the walls. */
const PLAZA_SHARE = 0.12;
/** Share of lots left empty (a car park, a square): a solid wall of towers reads as a texture. */
const EMPTY_LOT = 0.2;
/** Towers start this far into the canyon band, and grow to full height over this ramp (share at the course, metres). */
const TOWER_START = 0.6;
const TOWER_RAMP: readonly [number, number] = [0.4, 500];
/** Skyline towers on the horizon: how far out, and how much taller than the district. */
const SKYLINE_CLEAR = 380;
const SKYLINE_HEIGHT: readonly [number, number] = [1.3, 3.6];
const SKYLINE_FOOT: readonly [number, number] = [32, 84];
/** Buildings reach this far under the lowest ground round them, past the terrain mesh's own sink and skirts. */
const BASE_SINK = 3;

/** What a building may be and how it is dressed, at a point of the city. */
interface Quarter {
  district: CityDistrict;
  /** The district's archetypes and their running weight totals, for a weighted draw. */
  kinds: CityArchetype[];
  totals: number[];
}

/** Places the city: canyon and towers on the street grid round the course, then the skyline. */
export function placeCity(g: Ground, site: CitySite, scenery: CityScenery, seed: number, counts: { canyon: number; towers: number; skyline: number }, detail: boolean, parts: CityParts): void {
  const rng = mulberry32(seed);
  const quarters = districtMap(g, scenery.districts, mulberry32(seed ^ 0xd157));
  const plant = (lot: Lot, rise: number, q: Quarter, kind: CityArchetype, small: boolean): boolean => {
    const f = site.footing(lot);
    const plot: Plot = {
      ...lot,
      base: f.lo - BASE_SINK,
      ground: f.hi,
      top: site.roofCap(lot),
      rise,
      face: faceToCourse(g, lot),
      grime: q.district.grime,
      neon: q.district.neon,
      detail: detail && !small,
      rng,
      parts,
    };
    return ARCHETYPES[kind](new Builder(plot));
  };
  grid(g, site, scenery, rng, quarters, counts, plant);
  skyline(g, site, scenery, rng, quarters, counts.skyline, plant);
}

type Plant = (lot: Lot, rise: number, q: Quarter, kind: CityArchetype, small: boolean) => boolean;

/** Splits the city into district patches: each point belongs to its nearest patch centre. */
function districtMap(g: Ground, districts: CityDistrict[], rng: Rng): (x: number, z: number) => Quarter {
  if (districts.length === 0) throw new Error('city scenery has no districts');
  const quarters = districts.map((district, i): Quarter => {
    const kinds = (Object.keys(district.mix) as CityArchetype[]).filter((k) => (district.mix[k] ?? 0) > 0);
    if (kinds.length === 0) throw new Error(`city district ${i} builds nothing: its mix has no positive weight`);
    if (!(district.share > 0)) throw new Error(`city district ${i} has share ${district.share}; it must be positive`);
    for (const v of [district.grime, district.neon]) if (!(v >= 0 && v <= 1)) throw new Error(`city district ${i}: grime and neon must lie in 0..1 (got ${v})`);
    let t = 0;
    return { district, kinds, totals: kinds.map((k) => (t += district.mix[k] ?? 0)) };
  });
  const box = bounds(g);
  const reach = DISTRICT_REACH + HORIZON_MAX;
  const nx = Math.max(1, Math.ceil((box.x1 - box.x0 + 2 * reach) / DISTRICT_SPAN));
  const nz = Math.max(1, Math.ceil((box.z1 - box.z0 + 2 * reach) / DISTRICT_SPAN));
  const shareTotal = districts.reduce((n, d) => n + d.share, 0);
  // One jittered centre per cell of a coarse grid, each given a district by share.
  const centres: { x: number; z: number; q: Quarter }[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      let r = rng() * shareTotal;
      let q = quarters[quarters.length - 1];
      for (let k = 0; k < districts.length; k++) {
        r -= districts[k].share;
        if (r < 0) {
          q = quarters[k];
          break;
        }
      }
      centres.push({ x: box.x0 - reach + (i + rng()) * DISTRICT_SPAN, z: box.z0 - reach + (j + rng()) * DISTRICT_SPAN, q });
    }
  }
  return (x, z) => {
    let best = centres[0];
    let bd = Infinity;
    for (const c of centres) {
      const d = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best.q;
  };
}

function pick(q: Quarter, rng: Rng): CityArchetype {
  const r = rng() * q.totals[q.totals.length - 1];
  const i = q.totals.findIndex((t) => r < t);
  return q.kinds[i < 0 ? q.kinds.length - 1 : i];
}

/** The lot's side facing the nearest road (its signs and ad faces turn that way). */
function faceToCourse(g: Ground, lot: Lot): Face {
  const near = g.nearest(lot.x, lot.z);
  if (!near) return 0;
  const p = g.views[near.v].ribbon.samples[near.k].pos;
  const dx = p.x - lot.x;
  const dz = p.z - lot.z;
  // Into the lot's frame (the inverse of its yaw).
  const c = Math.cos(lot.yaw);
  const s = Math.sin(lot.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) > Math.abs(lz) ? (lx > 0 ? 0 : 1) : lz > 0 ? 2 : 3;
}

function bounds(g: Ground): { x0: number; z0: number; x1: number; z1: number } {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const v of g.views) {
    for (const s of v.ribbon.samples) {
      x0 = Math.min(x0, s.pos.x);
      x1 = Math.max(x1, s.pos.x);
      z0 = Math.min(z0, s.pos.z);
      z1 = Math.max(z1, s.pos.z);
    }
  }
  return { x0, z0, x1, z1 };
}

/**
 * The street grid: the canyon lining the course, then the towers behind. A block either holds
 * one megastructure or up to LOTS² buildings, one per lot.
 */
function grid(g: Ground, site: CitySite, scenery: CityScenery, rng: Rng, quarterAt: (x: number, z: number) => Quarter, counts: { canyon: number; towers: number }, plant: Plant): void {
  const box = bounds(g);
  const yaw = rng() * Math.PI;
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const cx = (box.x0 + box.x1) / 2;
  const cz = (box.z0 + box.z1) / 2;
  const half = Math.hypot(box.x1 - box.x0, box.z1 - box.z0) / 2 + DISTRICT_REACH;
  const n = Math.ceil(half / BLOCK);
  const blocks: { x: number; z: number; d: number; id: number }[] = [];
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const u = i * BLOCK;
      const v = j * BLOCK;
      const x = cx + u * c - v * sn;
      const z = cz + u * sn + v * c;
      const near = g.nearest(x, z);
      if (!near) continue;
      const d = Math.abs(near.d) - g.views[near.v].shape.outer[sideIndex(near.d)][near.k];
      if (d < BUILDING_CLEAR || d > DISTRICT_REACH) continue;
      blocks.push({ x, z, d, id: blocks.length });
    }
  }
  blocks.sort((a, b) => a.d - b.d);
  const lot = (BLOCK - STREET) / LOTS;
  // Lots already built on or left open: the canyon and the towers share the band between them.
  const taken = new Set<number>();
  const fill = (list: typeof blocks, count: number, plazas: number, height: (d: number) => number) => {
    let placed = 0;
    for (const b of list) {
      if (placed >= count) return;
      const ids = Array.from({ length: LOTS * LOTS }, (_, q) => b.id * LOTS * LOTS + q);
      if (rng() < plazas) {
        for (const id of ids) taken.add(id);
        continue;
      }
      const quarter = quarterAt(b.x, b.z);
      const kind = pick(quarter, rng);
      if (BLOCK_SCALE.has(kind) && ids.every((id) => !taken.has(id)) && rng() < BLOCK_SHARE) {
        const whole: Lot = { x: b.x, z: b.z, w: (BLOCK - STREET) * BLOCK_PLOT, d: (BLOCK - STREET) * BLOCK_PLOT, yaw: -yaw };
        if (site.clear(whole) && plant(whole, height(b.d), quarter, kind, false)) {
          for (const id of ids) taken.add(id);
          placed += ids.length;
          continue;
        }
      }
      for (let q = 0; q < LOTS * LOTS && placed < count; q++) {
        const id = ids[q];
        if (taken.has(id) || rng() < EMPTY_LOT) continue;
        const lu = ((q % LOTS) - (LOTS - 1) / 2) * lot;
        const lv = (Math.floor(q / LOTS) - (LOTS - 1) / 2) * lot;
        const here: Lot = { x: b.x + lu * c - lv * sn, z: b.z + lu * sn + lv * c, w: lot * range(rng, PLOT[0], PLOT[1]), d: lot * range(rng, PLOT[0], PLOT[1]), yaw: -yaw };
        if (!site.clear(here)) continue;
        const own = rng() < SAME_BLOCK ? kind : pick(quarter, rng);
        if (!plant(here, height(b.d), quarter, own, false)) continue;
        taken.add(id);
        placed++;
      }
    }
  };
  fill(blocks.filter((b) => b.d < CANYON_BAND), counts.canyon, PLAZA_SHARE, () =>
    rng() < CANYON_LOW_SHARE ? range(rng, CANYON_LOW[0], CANYON_LOW[1]) : scenery.towerHeight * range(rng, CANYON_HEIGHT[0], CANYON_HEIGHT[1]),
  );
  fill(blocks.filter((b) => b.d >= CANYON_BAND * TOWER_START), counts.towers, 0, (d) => scenery.towerHeight * range(rng, HEIGHT_SPREAD[0], HEIGHT_SPREAD[1]) * Math.min(1, TOWER_RAMP[0] + d / TOWER_RAMP[1]));
}

/** Taller towers ringing the horizon, each its district's archetype, built without the small kit. */
function skyline(g: Ground, site: CitySite, scenery: CityScenery, rng: Rng, quarterAt: (x: number, z: number) => Quarter, count: number, plant: Plant): void {
  const S = g.views.flatMap((v) => v.ribbon.samples);
  let cx = 0;
  let cz = 0;
  for (const s of S) {
    cx += s.pos.x / S.length;
    cz += s.pos.z / S.length;
  }
  const radius = Math.max(...S.map((s) => Math.hypot(s.pos.x - cx, s.pos.z - cz)));
  const clear = (x: number, z: number, r: number) => {
    for (let k = 0; k < S.length; k += 10) if (Math.hypot(S[k].pos.x - x, S[k].pos.z - z) < SKYLINE_CLEAR + r) return false;
    return true;
  };
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 20; tries++) {
    const a = rng() * Math.PI * 2;
    const dist = radius + range(rng, HORIZON_MIN * 0.5, HORIZON_MAX * 0.8);
    const x = cx + Math.cos(a) * dist;
    const z = cz + Math.sin(a) * dist;
    const foot = range(rng, SKYLINE_FOOT[0], SKYLINE_FOOT[1]);
    const lot: Lot = { x, z, w: foot, d: foot * range(rng, 0.6, 1), yaw: rng() * Math.PI };
    if (!clear(x, z, foot) || !site.clear(lot)) continue;
    const quarter = quarterAt(x, z);
    if (plant(lot, scenery.towerHeight * range(rng, SKYLINE_HEIGHT[0], SKYLINE_HEIGHT[1]), quarter, pick(quarter, rng), true)) placed++;
  }
}
