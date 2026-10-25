import * as THREE from 'three';
import type { TrackPalette } from '../../../core/types.ts';
import { mulberry32, range, type Rng } from '../../../core/rng.ts';
import type { CityScenery } from '../../../data/tracks/scenery.ts';
import { HORIZON_MAX, HORIZON_MIN, RUNOFF_MIN, TERRAIN_CELLS_NEAR } from '../config.ts';
import type { Corridor } from '../corridor.ts';
import type { Ground } from '../ground.ts';
import { fbm, smoothstep } from '../noise.ts';
import { sideIndex } from '../shape.ts';
import { concreteTexture, pavingTexture } from '../textures.ts';
import { CITY_NEON, facadeBox, facadeMaterial } from '../../facade.ts';
import { neonSigns, signBoards } from '../../neonSigns.ts';
import type { BiomeKit, DressContext, Dressing } from './kit.ts';
import { BUILDING_CLEAR, citySite, type CitySite, type Lot } from './citySite.ts';
import type { AoLook } from '../../look/lookTuning.ts';

// Neon Meridian: a night city. Dark asphalt streets and pale plazas off the course, a canyon of
// lit high-rises lining it on a street grid (broken by low blocks and open squares, and kept
// low round the inside of corners so the road ahead stays in view), towers behind them, a
// skyline of taller towers ringing the horizon, and neon billboards on poles along the walls. The road keeps the contrast: dark
// laned asphalt between bright edge lines, accent-and-white kerbs and pale concrete barriers.
// Every building is one instance of one box whose windows and neon the shader draws
// (render/facade.ts), so the whole city is one draw call at either quality.

/** The open city sits this far under the lowest road. */
const FLOOR_BELOW_ROAD = 1.5;
/** Gentle swell of the city floor, metres and scale: a city is nearly flat. */
const SWELL_HEIGHT = 1.5;
const SWELL_SCALE = 700;
/** Scale of the plaza/street patchwork in the ground colour. */
const DISTRICT_SCALE = 260;
/** Steeper than this the ground is a cast berm or bank, pale concrete. */
const BANK_SLOPE: readonly [number, number] = [0.3, 0.6];
const ASPHALT = new THREE.Color(0x26282f);
const PLAZA = new THREE.Color(0x585a62);
const BERM = new THREE.Color(0x8e8e94);

/**
 * Street lighting on the road: a night city's roads are lit from above, so the road keeps its
 * markings readable upside down in a loop or rolled in a corkscrew, away from the low sun.
 */
const ROAD_LIGHT = 0.3;
/** Street grid: block pitch and the street between blocks, metres. */
const BLOCK = 120;
const STREET = 22;
/** Lots per block side (a block holds up to LOTS² buildings). */
const LOTS = 2;
/** The district is searched this far out from the course for blocks. */
const DISTRICT_REACH = 900;
/** Tower height spread round the scenery's typical height. */
const HEIGHT_SPREAD: readonly [number, number] = [0.35, 1.9];
/**
 * The canyon: the blocks this deep beside the course, this many buildings per kilometre of lap,
 * most of them high-rises nearly as tall as the towers behind (shares of the scenery's tower
 * height), so the course runs between walls of lit storeys.
 */
const CANYON_BAND = 260;
const CANYON_PER_KM = 55;
const CANYON_HEIGHT: readonly [number, number] = [0.5, 1.05];
/** Rhythm in the canyon walls: this share of its buildings are low blocks of these heights. */
const CANYON_LOW_SHARE = 0.2;
const CANYON_LOW: readonly [number, number] = [12, 34];
/** Share of canyon blocks left as open squares, so the skyline shows between the walls. */
const PLAZA_SHARE = 0.12;
/** A lot capped lower than this (inside a corner, past a drop) is left as an open square. */
const MIN_RISE = 8;
/** Towers start this far into the canyon band, and grow to full height over this ramp (share at the course, metres). */
const TOWER_START = 0.6;
const TOWER_RAMP: readonly [number, number] = [0.4, 500];
/** Low quality keeps this share of every building (canyon, towers and skyline): less fill on a weak GPU. */
const LOW_SHARE = 0.55;
/** Skyline towers on the horizon: how many, how far out, and how much taller than the district. */
const SKYLINE = 150;
const SKYLINE_CLEAR = 380;
const SKYLINE_HEIGHT: readonly [number, number] = [1.3, 3.6];
const SKYLINE_FOOT: readonly [number, number] = [28, 80];
/** Share of skyline towers built as stacked setbacks (each tier one more instance). */
const SETBACK_SHARE = 0.4;
const SETBACK_TIERS = 3;
/** Wall tones of the buildings: concrete, dark glass, brick, steel. */
const WALLS = [0x4a4c56, 0x2a3242, 0x4a3634, 0x5a5e68, 0x343846];
/** Billboards: board size (2:1, the ad atlas's aspect), pole height and its setback past the wall top. */
const BOARD_W = 16;
const BOARD_H = 8;
const POLE_H: readonly [number, number] = [6, 13];
const POLE_W = 0.9;
const BOARD_SETBACK = 6;
/** Boards turn this far from square to the road, toward oncoming racers. */
const BOARD_TOE = 0.6;
/** A board's near edge keeps this far off any road. */
const BOARD_CLEAR = 1;
/** Sign light by day and at deep dusk. */
const SIGN_DAY = 0.55;
const SIGN_DUSK = 1;
const POLE_COLOUR = 0x2a2c33;
/** What hazards throw onto a city road: steel girders, concrete dust, blown litter. */
const STEEL = 0x8c939c;
const DUST = 0x9a989a;
const LITTER = 0xe8e4f0;
const SPRAY_CONCRETE = 0xa8a6a4;

/** `ao`: the world look's baked occlusion (darkens the buildings' street level), or null. */
export function cityKit(scenery: CityScenery, palette: TrackPalette, ao: AoLook | null): BiomeKit {
  const asphalt = ASPHALT.clone().lerp(new THREE.Color(palette.road), 0.3);
  const plaza = PLAZA.clone().lerp(new THREE.Color(palette.sand), 0.25);
  const berm = BERM.clone().lerp(new THREE.Color(palette.rock), 0.3);
  return {
    ground: {
      base: (minRoadY) => minRoadY - FLOOR_BELOW_ROAD,
      natural: (g, x, z) => g.base + SWELL_HEIGHT * fbm(g.noise, x / SWELL_SCALE + 20, z / SWELL_SCALE + 20, 2),
      color(g, x, z, _y, slope, out) {
        const district = fbm(g.noise, x / DISTRICT_SCALE + 5, z / DISTRICT_SCALE + 5, 2);
        const grain = g.noise(x / 6 + 40, z / 6 + 40) * 0.05;
        out.copy(asphalt).lerp(plaza, smoothstep((district - 0.05) / 0.3));
        out.lerp(berm, smoothstep((slope - BANK_SLOPE[0]) / (BANK_SLOPE[1] - BANK_SLOPE[0])));
        return out.multiplyScalar(1 + grain);
      },
    },
    road: { surface: 'asphalt', runoff: 'concrete' },
    roadLight: ROAD_LIGHT,
    masonry: 'concrete',
    pillar: { kind: 'rock' },
    terrainCells: TERRAIN_CELLS_NEAR,
    ownPosts: false,
    cornerStands: true,
    detail: (seed, quality) => ({ sand: pavingTexture(seed, quality), rock: concreteTexture(seed, quality) }),
    dress: (ctx) => dressCity(ctx, scenery, palette, ao),
    spray: { road: palette.road, runoff: SPRAY_CONCRETE, water: SPRAY_CONCRETE },
    debris: { color: STEEL, glow: 0, dust: DUST, streak: LITTER, shape: 'girder' },
  };
}

function dressCity(ctx: DressContext, scenery: CityScenery, palette: TrackPalette, ao: AoLook | null): Dressing {
  const rng = mulberry32(ctx.seed ^ 0xc17e);
  const keep = ctx.quality === 'high' ? 1 : LOW_SHARE;
  const boxes: THREE.Matrix4[] = [];
  const tints: THREE.Color[] = [];
  const add = (x: number, y: number, z: number, w: number, h: number, d: number, yaw: number, tint: THREE.Color) => {
    boxes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(w, h, d)));
    tints.push(tint);
  };
  const lapKm = ctx.corridors[0].ribbon.length / 1000;
  const site = citySite(ctx.ground, ctx.quality);
  district(ctx.ground, site, scenery, rng, Math.round(scenery.towers * keep), Math.round(CANYON_PER_KM * lapKm * keep), add);
  skyline(ctx.ground, site, scenery, rng, Math.round(SKYLINE * keep), add);

  const objects: THREE.Object3D[] = [];
  const owned: { dispose(): void }[] = [];
  const geo = facadeBox();
  const mat = facadeMaterial({ palette, neon: CITY_NEON, baseShade: ao ? { amount: ao.buildingBase, height: ao.buildingHeight } : null });
  owned.push(geo, mat);
  if (boxes.length > 0) {
    const city = new THREE.InstancedMesh(geo, mat, boxes.length);
    boxes.forEach((m, i) => {
      city.setMatrixAt(i, m);
      city.setColorAt(i, tints[i]);
    });
    city.instanceMatrix.needsUpdate = true;
    city.computeBoundingSphere();
    city.name = 'cityBlocks';
    objects.push(city);
  }

  const signs = neonSigns(SIGN_DAY + (SIGN_DUSK - SIGN_DAY) * palette.dusk);
  owned.push(signs);
  const spots = billboards(ctx.corridors[0], scenery, rng);
  if (spots.boards.length > 0) {
    const boards = signBoards(signs, spots.boards, ctx.seed ^ 0xb111, 'billboards');
    owned.push(boards.geometry);
    objects.push(boards);
    const poleGeo = facadeBox();
    const poles = new THREE.InstancedMesh(poleGeo, ctx.lit, spots.poles.length);
    spots.poles.forEach((m, i) => poles.setMatrixAt(i, m));
    poleGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(poleGeo.attributes.position.count * 3).fill(1), 3));
    const pc = new THREE.Color(POLE_COLOUR);
    for (let i = 0; i < spots.poles.length; i++) poles.setColorAt(i, pc);
    poles.instanceMatrix.needsUpdate = true;
    poles.computeBoundingSphere();
    poles.name = 'billboardPoles';
    owned.push(poleGeo);
    objects.push(poles);
  }
  return {
    objects,
    update(time) {
      signs.update(time);
    },
    dispose() {
      for (const o of owned) o.dispose();
    },
  };
}

const UP = new THREE.Vector3(0, 1, 0);

type AddBox = (x: number, y: number, z: number, w: number, h: number, d: number, yaw: number, tint: THREE.Color) => void;

function wallTint(rng: Rng): THREE.Color {
  return new THREE.Color(WALLS[Math.floor(rng() * WALLS.length)]).multiplyScalar(0.85 + rng() * 0.3);
}

/**
 * Stands a building on its lot: the base reaches under the lowest ground round it (so no slope
 * opens a gap), the height counts from the highest ground under it (so no slope swallows it),
 * and the roof stops at the site's cap. False when the cap leaves too little to build.
 */
function build(site: CitySite, lot: Lot, rise: number, tint: THREE.Color, add: AddBox): boolean {
  const f = site.footing(lot);
  const top = Math.min(f.hi + rise, site.roofCap(lot));
  if (top - f.hi < MIN_RISE) return false;
  const base = f.lo - BASE_SINK;
  add(lot.x, base, lot.z, lot.w, top - base, lot.d, lot.yaw, tint);
  return true;
}

/**
 * Buildings on a street grid round the course: the canyon of high-rises lining it first (the
 * grid's blocks nearest the course fill first, a few lots per block), then the towers behind,
 * tallest furthest back. Each lot holds one building.
 */
function district(g: Ground, site: CitySite, scenery: CityScenery, rng: Rng, towers: number, canyon: number, add: AddBox): void {
  const S = g.views.flatMap((v) => v.ribbon.samples);
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const s of S) {
    x0 = Math.min(x0, s.pos.x);
    x1 = Math.max(x1, s.pos.x);
    z0 = Math.min(z0, s.pos.z);
    z1 = Math.max(z1, s.pos.z);
  }
  const yaw = rng() * Math.PI;
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const half = Math.hypot(x1 - x0, z1 - z0) / 2 + DISTRICT_REACH;
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
      if (rng() < plazas) {
        for (let q = 0; q < LOTS * LOTS; q++) taken.add(b.id * LOTS * LOTS + q);
        continue;
      }
      for (let q = 0; q < LOTS * LOTS && placed < count; q++) {
        const id = b.id * LOTS * LOTS + q;
        if (taken.has(id) || rng() < EMPTY_LOT) continue;
        const lu = ((q % LOTS) - (LOTS - 1) / 2) * lot;
        const lv = (Math.floor(q / LOTS) - (LOTS - 1) / 2) * lot;
        const here: Lot = { x: b.x + lu * c - lv * sn, z: b.z + lu * sn + lv * c, w: lot * range(rng, 0.6, 0.92), d: lot * range(rng, 0.6, 0.92), yaw: -yaw };
        if (!site.clear(here)) continue;
        if (!build(site, here, height(b.d), wallTint(rng), add)) continue;
        taken.add(id);
        placed++;
      }
    }
  };
  fill(blocks.filter((b) => b.d < CANYON_BAND), canyon, PLAZA_SHARE, () =>
    rng() < CANYON_LOW_SHARE ? range(rng, CANYON_LOW[0], CANYON_LOW[1]) : scenery.towerHeight * range(rng, CANYON_HEIGHT[0], CANYON_HEIGHT[1]),
  );
  fill(blocks.filter((b) => b.d >= CANYON_BAND * TOWER_START), towers, 0, (d) => scenery.towerHeight * range(rng, HEIGHT_SPREAD[0], HEIGHT_SPREAD[1]) * Math.min(1, TOWER_RAMP[0] + d / TOWER_RAMP[1]));
}
/** Share of lots left empty (a car park, a square): a solid wall of towers reads as a texture. */
const EMPTY_LOT = 0.2;
/** Buildings reach this far under the lowest ground round them, past the terrain mesh's own sink and skirts. */
const BASE_SINK = 3;

/** Taller towers ringing the horizon, some built as setback stacks. */
function skyline(g: Ground, site: CitySite, scenery: CityScenery, rng: Rng, count: number, add: AddBox): void {
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
    const h = scenery.towerHeight * range(rng, SKYLINE_HEIGHT[0], SKYLINE_HEIGHT[1]);
    const tint = wallTint(rng);
    if (rng() < SETBACK_SHARE) {
      // Tiers narrowing upward, each standing on the last; the first stands on the ground.
      const f = site.footing(lot);
      let base = f.lo - BASE_SINK;
      let top = f.hi;
      for (let t = 0; t < SETBACK_TIERS; t++) {
        const k = 1 - t * 0.25;
        top += (h / SETBACK_TIERS) * (t === 0 ? 1.3 : 0.85);
        add(x, base, z, lot.w * k, top - base, lot.w * k * 0.85, lot.yaw, tint);
        base = top;
      }
    } else build(site, lot, h, tint, add);
    placed++;
  }
}

/**
 * Billboards on poles standing just past the walls and run-off lips of the main loop, turned
 * toward oncoming racers: the board and pole matrices.
 */
function billboards(cor: Corridor, scenery: CityScenery, rng: Rng): { boards: THREE.Matrix4[]; poles: THREE.Matrix4[] } {
  const boards: THREE.Matrix4[] = [];
  const poles: THREE.Matrix4[] = [];
  const r = cor.ribbon;
  if (scenery.billboardsPerKm <= 0) return { boards, poles };
  const every = Math.max(1, Math.round(1000 / scenery.billboardsPerKm / r.step));
  const q = new THREE.Quaternion();
  for (let k = Math.floor(every / 2); k < r.samples.length; k += every) {
    const side = rng() < 0.5 ? -1 : 1;
    if (cor.gap(k) || cor.tunnel(k) || cor.deck(k) || cor.junction(k) || cor.open(k, side) || cor.drop(k, side)) continue;
    const prof = cor.profile(k, side);
    if (prof.hidden) continue;
    const walled = cor.shape.run[sideIndex(side)][k] < RUNOFF_MIN;
    // On a wall's top or a lip's crest, a little way back from the road.
    const top = prof.pts[walled ? 3 : 2];
    const out = { x: cor.shape.rx[k] * side, z: cor.shape.rz[k] * side };
    const x = top.x + out.x * BOARD_SETBACK;
    const z = top.z + out.z * BOARD_SETBACK;
    // Never over any road: a crossing or a neighbouring stretch may run just behind the wall.
    const near = cor.ground.nearest(x, z);
    if (near) {
      const smp = cor.ground.views[near.v].ribbon.samples[near.k];
      if (Math.abs(near.d) < (near.d < 0 ? smp.edgeL : smp.edgeR) + (BOARD_W / 2) * Math.sin(BOARD_TOE) + BOARD_CLEAR) continue;
    }
    const pole = range(rng, POLE_H[0], POLE_H[1]);
    const t = r.samples[k].tangent;
    // Face back down the road (toward −tangent), toed in toward the road.
    const face = Math.atan2(-t.x, -t.z) - side * BOARD_TOE;
    q.setFromAxisAngle(UP, face);
    boards.push(new THREE.Matrix4().compose(new THREE.Vector3(x, top.y + pole, z), q, new THREE.Vector3(BOARD_W, BOARD_H, 1)));
    poles.push(new THREE.Matrix4().compose(new THREE.Vector3(x, top.y - 1, z), q, new THREE.Vector3(POLE_W, pole + 1, POLE_W)));
  }
  return { boards, poles };
}
