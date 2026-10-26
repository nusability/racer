import * as THREE from 'three';
import type { TrackPalette } from '../../../core/types.ts';
import { mulberry32, range, type Rng } from '../../../core/rng.ts';
import type { CityScenery } from '../../../data/tracks/scenery.ts';
import { RUNOFF_MIN } from '../config.ts';
import type { Corridor } from '../corridor.ts';
import { fbm, smoothstep } from '../noise.ts';
import { sideIndex } from '../shape.ts';
import { concreteTexture, pavingTexture } from '../textures.ts';
import { CITY_NEON, facadeMaterial } from '../../facade.ts';
import { facadeBox } from '../../facadeGeometry.ts';
import { neonSigns, signBoards } from '../../neonSigns.ts';
import type { BiomeKit, DressContext, Dressing } from './kit.ts';
import { citySite } from './citySite.ts';
import { CANYON_PER_KM, placeCity } from './cityDistricts.ts';
import { CityParts } from './cityParts.ts';
import type { AoLook } from '../../look/lookTuning.ts';

// Neon Meridian: a night city. Dark asphalt streets and pale plazas off the course, a canyon of
// lit high-rises lining it on a street grid (broken by low blocks and open squares, and kept
// low round the inside of corners so the road ahead stays in view), towers behind them, a
// skyline of taller towers ringing the horizon, and neon billboards on poles along the walls.
// The buildings are a dozen archetypes, glorious to run-down, mixed by district
// (cityDistricts.ts, cityArchetypes.ts), drawn from a five-shape instanced kit whose windows,
// grime and neon the shader draws (render/facade.ts). The road keeps the contrast: dark laned
// asphalt between bright edge lines, accent-and-white kerbs and pale concrete barriers.

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
/** Low quality keeps this share of every building (canyon, towers and skyline) and none of the small kit: less fill on a weak GPU. */
const LOW_SHARE = 0.55;
/** Skyline towers on the horizon. */
const SKYLINE = 150;
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
    terrain: true,
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
    detail: (seed, quality) => ({ sand: pavingTexture(seed, quality), rock: concreteTexture(seed, quality) }),
    dress: (ctx) => dressCity(ctx, scenery, palette, ao),
    spray: { road: palette.road, runoff: SPRAY_CONCRETE, water: SPRAY_CONCRETE },
    debris: { color: STEEL, glow: 0, dust: DUST, streak: LITTER, shape: 'girder' },
  };
}

function dressCity(ctx: DressContext, scenery: CityScenery, palette: TrackPalette, ao: AoLook | null): Dressing {
  const rng = mulberry32(ctx.seed ^ 0xc17e);
  const keep = ctx.quality === 'high' ? 1 : LOW_SHARE;
  const lapKm = ctx.corridors[0].ribbon.length / 1000;
  const parts = new CityParts();
  const counts = { canyon: Math.round(CANYON_PER_KM * lapKm * keep), towers: Math.round(scenery.towers * keep), skyline: Math.round(SKYLINE * keep) };
  placeCity(ctx.ground, citySite(ctx.ground, ctx.quality), scenery, ctx.seed ^ 0xc17e, counts, ctx.quality === 'high', parts);

  const objects: THREE.Object3D[] = [];
  const owned: { dispose(): void }[] = [];
  const mat = facadeMaterial({ palette, neon: CITY_NEON, baseShade: ao ? { amount: ao.buildingBase, height: ao.buildingHeight } : null, styled: true });
  const city = parts.meshes(mat);
  owned.push(mat, ...city.geometries);
  objects.push(...city.objects);

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
      mat.time.value = time;
    },
    dispose() {
      for (const o of owned) o.dispose();
    },
  };
}

const UP = new THREE.Vector3(0, 1, 0);

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
