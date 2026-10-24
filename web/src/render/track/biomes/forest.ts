import * as THREE from 'three';
import type { TrackPalette } from '../../../core/types.ts';
import { mulberry32, range, type Rng } from '../../../core/rng.ts';
import type { ForestClearing, ForestScenery } from '../../../data/tracks/scenery.ts';
import type { Ribbon } from '../../../core/track.ts';
import { CULL_MARGIN, FOG_FAR } from '../config.ts';
import { sunDirection } from '../environment.ts';
import type { Ground } from '../ground.ts';
import { fbm, smoothstep } from '../noise.ts';
import { mossTexture, mossyStoneTexture } from '../forestTextures.ts';
import type { BiomeKit, DressContext, Dressing } from './kit.ts';
import { mistGeometry, mistMaterial, poolGeometry, poolMaterial, shaftGeometry, shaftMaterial } from './forestAir.ts';
import {
  ceilingGeometry,
  deepTreeGeometry,
  fernPatchGeometry,
  lanternGeometry,
  lanternPostGeometry,
  logGeometry,
  waymarkerGeometry,
  giantGeometry,
  stamp,
  type ForestColours,
} from './forestProps.ts';

// Elderwood: a forest of giant ancient trees. The course runs along the forest floor between
// trunks many metres across, their crowns closing far overhead; ferns, fallen logs and mossy
// stones crowd the ground, mist drifts between the trunks and shafts of sun slant through the
// gaps. Readability first: the trail is a clear band of earth with the world's usual edge
// paint, the giants stand back past the hard boundary, and the boundary is marked by glowing
// waymarker stones (where other worlds have pylons) and lanterns on the walls.
//
// Cost: every tree kind is instanced, grouped into cells of the map so whole cells behind the
// camera or past the fog are culled; the static few (fallen logs, waymarkers, lanterns) merge
// into the course's own props and glow meshes. Shafts and mist are one draw each. Low quality
// keeps a share of everything, the simpler trunk and crown geometry, and no shafts.

/** The open forest floor sits this far under the lowest road. */
const FLOOR_BELOW_ROAD = 2;
/** Hummocks of root and moss near the course, and broad swells everywhere: height (m) and scale (m). */
const HUMMOCK = 2.2;
const HUMMOCK_SCALE = 45;
const SWELL = 9;
const SWELL_SCALE = 650;
/** Forested hills rising away from the course, so the woods never open onto a bare plain. */
const HILLS = 70;
const HILL_SCALE = 900;
const HILL_START = 0.3;
/** Patchwork of moss and leaf litter, and steep ground showing bare earth and stone. */
const PATCH_SCALE = 70;
const BANK_SLOPE: readonly [number, number] = [0.35, 0.8];
/** How much bare earth a steep bank shows, and the fine grain of light and dark over the floor. */
const BANK_EARTH = 0.6;
const GRAIN = 0.06;
/** The forest floor under the canopy is this much darker than the palette's (clearings are not). */
const FLOOR_SHADE = 0.7;
/** Moss, and a glade's grass, pulled from the palette's forest floor. */
const MOSS = 0x4f7a2a;
const MOSS_PULL = 0.45;
/** Share of the floor under moss (the rest is leaf litter), and how soft the patches' edges are. */
const MOSS_COVER = 0.3;
const GRASS = 0x8aa83a;
const GRASS_PULL = 0.6;
/** The bark of the giants (reddish, like the oldest real ones), a little of the palette's rock in it. */
const BARK = 0x8a4a2e;
const BARK_ROCK = 0.08;
const FERN = 0x4a7a2c;
const HEARTWOOD = 0xc8a070;
/** The trail glows faintly with the texture's own colour: under a closed canopy it must still read. */
const ROAD_LIGHT = 0.12;
/** Pillar trunks rise to this share of the scenery's tree height. */
const PILLAR_REACH = 0.85;

/** Low quality keeps this share of the woods, the floor dressing and the mist. */
const LOW_SHARE = 0.5;
/**
 * Lining giants stand as close as their roots allow and crowd there: the band past that they
 * spread over (m), how hard they crowd its near edge (distance out goes as rng^this), and the
 * band past the boundary the deep woods start from (m).
 */
const LINE_BAND = 16;
const LINE_CROWD = 2.2;
const DEEP_START = 40;
/** A giant's roots and flare reach this many trunk radii: nothing drivable inside them. */
const ROOT_CLEAR = 2.1;
/** Spread of tree height and of trunk radius. */
const HEIGHT_SPREAD: readonly [number, number] = [0.8, 1.3];
const RADIUS_SPREAD: readonly [number, number] = [0.7, 1.3];
/**
 * The deep woods beyond the lining giants: trunks per hectare (high, low), crowding toward the
 * course (their distance out goes as rng^DEEP_FALLOFF), and their radius (× the scenery's). Dense enough that
 * the woods close into haze: under a canopy the horizon is trunks, never sky.
 */
const DEEP_PER_HA = { high: 3.5, low: 1.6 } as const;
const DEEP_FALLOFF = 1.9;
const DEEP_RADIUS: readonly [number, number] = [0.6, 1.1];
/** The back wall: a dense row of giants at the woods' depth, every this many metres, so no sky shows between trunks at eye level. */
const BACK_SPACING = { high: 12, low: 18 } as const;
/**
 * Deep-woods trees keep this share of DEEP_START from any road, and back-wall trees this
 * share of the woods' depth (where another stretch of course runs near, they would crowd it).
 */
const DEEP_CLEAR = 0.6;
const BACK_CLEAR = 0.7;
/** Leaf greens of the canopy ceiling (sRGB), and how dark its slabs run. */
const LEAVES = [0x2f5a26, 0x3a6a2a, 0x2a4a22, 0x46702e, 0x355e30];
const CEILING_SHADE: readonly [number, number] = [0.6, 0.9];
/**
 * The ceiling at canopy 1: slabs per kilometre of lap, how far past the boundary they reach
 * (over the woods too: the sky shows only through gaps), their height (× tree height) and width (m).
 */
const CEILING_PER_KM = 100;
const CEILING_SIDE = 170;
const CEILING_HEIGHT: readonly [number, number] = [0.62, 0.9];
const CEILING_SIZE: readonly [number, number] = [50, 95];
/** Clearings keep the woods this far from the road; a glade's grass fades out over this much more. */
const CLEARING_REACH = 220;
const GLADE_FADE = 120;
/** Floor patches (ferns round a stone) and fallen logs per kilometre of lap at undergrowth 1. */
const PATCHES_PER_KM = 140;
const LOGS_PER_KM = 7;
/** Floor patches crowd the trail's edge, up to this far past the boundary, at this size; logs lie further in. */
const PATCH_REACH = 14;
const PATCH_SCALE_RANGE: readonly [number, number] = [1.4, 2.6];
const LOG_REACH = 160;
const LOG_LENGTH: readonly [number, number] = [14, 42];
/** Mist banks per kilometre of lap at mist 1, their size (m) and how far out they drift. */
const MIST_PER_KM = 34;
const MIST_WIDTH: readonly [number, number] = [40, 95];
const MIST_HEIGHT: readonly [number, number] = [9, 22];
const MIST_REACH: readonly [number, number] = [12, 420];
const MIST_OPACITY = 0.42;
/** Mist is the horizon haze, lifted toward white. */
const MIST_LIFT = 0.35;
/** Light shafts: radius (m), and the steepest-to-flattest they lean (radians above the horizon). */
const SHAFT_RADIUS: readonly [number, number] = [6, 14];
const SHAFT_MIN_ELEVATION = 0.8;
/** Shaft light, as a share of the sun's colour, by day and at deep dusk (warmer, stronger, lower). */
const SHAFT_DAY = 0.16;
const SHAFT_DUSK = 0.22;
/** Sun pools on the trail: per kilometre of lap, size (m), how much bigger than its shaft one at a shaft's foot is, and their light as a share of the sun's. */
const POOLS_PER_KM = 22;
const POOL_SIZE: readonly [number, number] = [4, 10];
const POOL_UNDER_SHAFT = 1.3;
const POOL_DAY = 0.35;
const POOL_DUSK = 0.45;
/** Pools lie this far over the road surface (plus polygon offset). */
const POOL_LIFT = 0.1;
/**
 * Lanterns glow past 1 so the bloom finds them under the canopy. The runes are lit like the
 * stone they are cut in (one lit mesh), so they are painted this much past white to glow anyway.
 */
const RUNE_GLOW = 2.4;
/** A waymarker stands at every n-th pylon spot, and is drawn out to this far (m). */
const WAYMARKER_EVERY = 2;
const WAYMARKER_VIEW = 900;
const LANTERN_GLOW = 1.8;
const LANTERN_COLOUR = 0xffc070;
/** What hazards throw: logs, the earth of their impact, leaves on the wind (sRGB). */
const DUST = 0x8a7a58;
const LEAF_STREAK = 0xc8d070;
const SPRAY_WATER = 0xd8efe6;

export function forestKit(scenery: ForestScenery, palette: TrackPalette): BiomeKit {
  const floor = new THREE.Color(palette.sand);
  const moss = floor.clone().lerp(new THREE.Color(MOSS), MOSS_PULL);
  const earth = new THREE.Color(palette.road).multiplyScalar(0.8);
  const stone = new THREE.Color(palette.rock);
  const grass = floor.clone().lerp(new THREE.Color(GRASS), GRASS_PULL);
  const town = new THREE.Color(palette.road).lerp(new THREE.Color(HEARTWOOD), 0.25);
  const colours: ForestColours = {
    bark: new THREE.Color(BARK).lerp(stone, BARK_ROCK),
    moss,
    fern: new THREE.Color(FERN).lerp(moss, 0.3),
    stone,
    wood: new THREE.Color(HEARTWOOD),
  };
  let clearings: Clearings | null = null;
  const clearingsOf = (g: Ground) => (clearings ??= new Clearings(g.views[0].ribbon, scenery.clearings));
  return {
    ground: {
      base: (minRoadY) => minRoadY - FLOOR_BELOW_ROAD,
      natural(g, x, z, ripple) {
        const hummock = fbm(g.noise, x / HUMMOCK_SCALE + 11, z / HUMMOCK_SCALE + 11, 2) * HUMMOCK * ripple;
        const swell = fbm(g.noise, x / SWELL_SCALE + 5, z / SWELL_SCALE + 5, 3) * SWELL;
        const hill = Math.max(0, fbm(g.noise, x / HILL_SCALE + 40, z / HILL_SCALE + 40, 3) + 0.2);
        const away = 1 - smoothstep((ripple - HILL_START) / (1 - HILL_START));
        return g.base + hummock + swell + HILLS * hill * away;
      },
      color(g, x, z, _y, slope, out) {
        const patch = fbm(g.noise, x / PATCH_SCALE + 3, z / PATCH_SCALE + 3, 2);
        const grain = g.noise(x / 5 + 70, z / 5 + 70) * GRAIN;
        out.copy(floor).lerp(moss, smoothstep((patch + MOSS_COVER - 0.5) * 3 + 0.5));
        const open = clearingsOf(g).near(g, x, z);
        const openness = open ? 1 - smoothstep((open.gap - CLEARING_REACH * 0.5) / GLADE_FADE) : 0;
        if (open) out.lerp(open.style === 'glade' ? grass : town, openness);
        // Under the canopy the floor lies in shade; a clearing is in the open.
        out.multiplyScalar(FLOOR_SHADE + (1 - FLOOR_SHADE) * openness);
        out.lerp(earth, smoothstep((slope - BANK_SLOPE[0]) / (BANK_SLOPE[1] - BANK_SLOPE[0])) * BANK_EARTH);
        return out.multiplyScalar(1 + grain);
      },
    },
    road: { surface: scenery.road, runoff: 'litter' },
    roadLight: ROAD_LIGHT,
    masonry: 'sandstone',
    pillar: { kind: 'trunk', bark: colours.bark.getHex(), moss: moss.getHex(), height: scenery.treeHeight * PILLAR_REACH },
    ownPosts: true,
    cornerStands: false,
    detail: (seed, quality) => ({ sand: mossTexture(seed, quality), rock: mossyStoneTexture(seed, quality) }),
    dress: (ctx) => dressForest(ctx, scenery, palette, colours, clearingsOf(ctx.ground)),
    spray: { road: palette.road, runoff: palette.sand, water: SPRAY_WATER },
    debris: { color: colours.bark.getHex(), glow: 0, dust: DUST, streak: LEAF_STREAK, shape: 'log' },
  };
}

/** The clearings' spans on the main loop, and how far a point is from the road of one. */
class Clearings {
  private readonly spans: { s0: number; s1: number; style: ForestClearing['style'] }[];

  constructor(private readonly main: Ribbon, list: ForestClearing[]) {
    this.spans = list.map((c) => ({ s0: main.paramToS(c.from), s1: main.paramToS(c.to), style: c.style }));
  }

  /** The clearing whose stretch of road is nearest (x, z), with the gap to that road's edge; null outside them. */
  near(g: Ground, x: number, z: number): { style: ForestClearing['style']; gap: number } | null {
    if (this.spans.length === 0) return null;
    const near = g.nearest(x, z);
    if (!near || near.v !== 0) return null;
    const style = this.at(this.main.samples[near.k].s);
    if (!style) return null;
    return { style, gap: edgeGap(g, near) };
  }

  /** The clearing at main-loop distance s, or null. */
  at(s: number): ForestClearing['style'] | null {
    for (const c of this.spans) {
      const inside = c.s0 <= c.s1 ? s >= c.s0 && s <= c.s1 : s >= c.s0 || s <= c.s1;
      if (inside) return c.style;
    }
    return null;
  }
}

/** Gap from a ground point to the hard boundary of the ribbon nearest it (negative inside it). */
function edgeGap(g: Ground, near: NonNullable<ReturnType<Ground['nearest']>>): number {
  const smp = g.views[near.v].ribbon.samples[near.k];
  return Math.abs(near.d) - (near.d < 0 ? smp.edgeL : smp.edgeR);
}

interface Item {
  m: THREE.Matrix4;
  c: THREE.Color;
}

/**
 * Instances grouped by map cell, so each cell is one draw that culls as a whole. The grid starts
 * at the woods' corner, so a course that fits one cell is one draw per kind, wherever it lies.
 */
class Cells {
  private readonly cells = new Map<string, Item[]>();
  constructor(
    private readonly size: number,
    private readonly origin: { x: number; z: number },
  ) {}

  add(x: number, z: number, m: THREE.Matrix4, c: THREE.Color): void {
    const key = `${Math.floor((x - this.origin.x) / this.size)},${Math.floor((z - this.origin.z) / this.size)}`;
    let list = this.cells.get(key);
    if (!list) this.cells.set(key, (list = []));
    list.push({ m, c });
  }

  meshes(geo: THREE.BufferGeometry, mat: THREE.Material, name: string): THREE.InstancedMesh[] {
    const out: THREE.InstancedMesh[] = [];
    for (const [key, list] of this.cells) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        mesh.setColorAt(i, it.c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = `${name}:${key}`;
      out.push(mesh);
    }
    return out;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const scratchQ = new THREE.Quaternion();

function matrix(x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), scratchQ.setFromAxisAngle(UP, yaw), new THREE.Vector3(sx, sy, sz));
}

function grey(rng: Rng, lo: number, hi: number): THREE.Color {
  const v = range(rng, lo, hi);
  return new THREE.Color(v, v, v);
}

interface Woods {
  giants: Cells;
  deep: Cells;
  floor: Cells;
  ceiling: Cells;
  stones: Cells;
}

function dressForest(ctx: DressContext, scenery: ForestScenery, palette: TrackPalette, colours: ForestColours, clearings: Clearings): Dressing {
  const rng = mulberry32(ctx.seed ^ 0xf0e5);
  const q = ctx.quality;
  const keep = q === 'high' ? 1 : LOW_SHARE;
  const g = ctx.ground;
  // The woods' corner: the course's bounds, pushed out past the back wall.
  const corner = { x: Infinity, z: Infinity };
  for (const v of g.views) {
    for (const p of v.ribbon.samples) {
      corner.x = Math.min(corner.x, p.pos.x - scenery.forestDepth - BACK_SPACING[q] * 2);
      corner.z = Math.min(corner.z, p.pos.z - scenery.forestDepth - BACK_SPACING[q] * 2);
    }
  }
  const woods: Woods = { giants: new Cells(GIANT_CELL[q], corner), deep: new Cells(DEEP_CELL[q], corner), floor: new Cells(FERN_CELL, corner), ceiling: new Cells(DEEP_CELL[q], corner), stones: new Cells(STONE_CELL, corner) };
  const lapKm = ctx.corridors[0].ribbon.length / 1000;

  /** Where nothing may stand: on or near any road (with margin), in a landmark, a clearing or a loop's swing. */
  const blocked = (x: number, z: number, margin: number, inClearing: number) => {
    const near = g.nearest(x, z);
    if (near) {
      const gap = edgeGap(g, near);
      const sh = g.views[near.v].shape;
      const extra = sh.magnet[near.k] || sh.deck[near.k] || sh.tunnel[near.k] ? MAGNET_CLEAR : 0;
      if (gap < margin + extra) return true;
      if (near.v === 0 && gap < inClearing && clearings.at(g.views[0].ribbon.samples[near.k].s)) return true;
    }
    return g.inFootprint(x, z);
  };
  const plant = (cells: Cells, x: number, z: number, h: number, r: number) => {
    cells.add(x, z, matrix(x, g.height(x, z) - TREE_SINK, z, rng() * Math.PI * 2, r, h, r), grey(rng, 0.8, 1.1));
  };

  // --- The colonnade: giants lining every ribbon, trunks rising straight out of sight ---
  for (const cor of ctx.corridors) {
    const r = cor.ribbon;
    const every = Math.max(1, Math.round(2000 / Math.max(1, scenery.treesPerKm * keep) / r.step));
    for (let k0 = 0; k0 < r.samples.length; k0 += every) {
      for (const side of [-1, 1]) {
        const k = cor.idx(k0 + (side > 0 ? Math.floor(every / 2) : 0) + Math.floor((rng() - 0.5) * every * 0.6));
        if (cor.gap(k) || cor.tunnel(k) || cor.deck(k) || cor.junction(k) || cor.open(k, side) || cor.drop(k, side)) continue;
        const h = scenery.treeHeight * range(rng, HEIGHT_SPREAD[0], HEIGHT_SPREAD[1]);
        const rad = scenery.trunkRadius * range(rng, RADIUS_SPREAD[0], RADIUS_SPREAD[1]);
        const p = cor.beside(k, side, rad * ROOT_CLEAR + 1 + Math.pow(rng(), LINE_CROWD) * LINE_BAND, 0);
        if (blocked(p.x, p.z, rad * ROOT_CLEAR, CLEARING_REACH)) continue;
        plant(woods.giants, p.x, p.z, h, rad);
      }
    }
  }

  // --- The deep woods: rows of trunks crowding toward the course, thinning into the mist ---
  const main = ctx.corridors[0];
  const deepArea = (main.ribbon.length * 2 * Math.max(0, scenery.forestDepth - DEEP_START)) / 10000;
  const deep = Math.round(deepArea * DEEP_PER_HA[q]);
  for (let i = 0, tries = 0; i < deep && tries < deep * 4; tries++) {
    const k = Math.floor(rng() * main.n);
    const side = rng() < 0.5 ? -1 : 1;
    if (main.gap(k)) continue;
    const p = main.beside(k, side, DEEP_START + Math.pow(rng(), DEEP_FALLOFF) * (scenery.forestDepth - DEEP_START), 0);
    if (blocked(p.x, p.z, DEEP_START * DEEP_CLEAR, CLEARING_REACH)) continue;
    plant(woods.deep, p.x, p.z, scenery.treeHeight * range(rng, HEIGHT_SPREAD[0], HEIGHT_SPREAD[1]), scenery.trunkRadius * range(rng, DEEP_RADIUS[0], DEEP_RADIUS[1]));
    i++;
  }
  const backEvery = Math.max(1, Math.round(BACK_SPACING[q] / main.ribbon.step));
  for (let k = 0; k < main.n; k += backEvery) {
    if (main.gap(k)) continue;
    for (const side of [-1, 1]) {
      const p = main.beside(k, side, scenery.forestDepth + rng() * BACK_SPACING[q] * 2, 0);
      if (blocked(p.x, p.z, scenery.forestDepth * BACK_CLEAR, CLEARING_REACH)) continue;
      plant(woods.deep, p.x, p.z, scenery.treeHeight * range(rng, 0.9, 1.3), scenery.trunkRadius * range(rng, 0.8, 1.2));
    }
  }

  // --- The forest floor: ferns crowding the trail's edges, fallen logs further in ---
  const logs: Item[] = [];
  const floorAt = (reach: number, margin: number) => {
    const cor = ctx.corridors[Math.floor(rng() * ctx.corridors.length)];
    const k = Math.floor(rng() * cor.n);
    const side = rng() < 0.5 ? -1 : 1;
    if (cor.gap(k) || cor.tunnel(k) || cor.open(k, side) || cor.drop(k, side)) return null;
    const p = cor.beside(k, side, margin + Math.pow(rng(), 1.4) * reach, 0);
    if (blocked(p.x, p.z, margin, 0)) return null;
    return p;
  };
  const patches = Math.round(scenery.undergrowth * PATCHES_PER_KM * lapKm * keep);
  for (let i = 0; i < patches; i++) {
    const p = floorAt(PATCH_REACH, PATCH_MARGIN);
    if (!p) continue;
    const s = range(rng, PATCH_SCALE_RANGE[0], PATCH_SCALE_RANGE[1]);
    woods.floor.add(p.x, p.z, matrix(p.x, g.height(p.x, p.z) - 0.15, p.z, rng() * Math.PI * 2, s, s * range(rng, 0.8, 1.2), s), grey(rng, 0.8, 1.15));
  }
  const nLogs = Math.round(scenery.undergrowth * LOGS_PER_KM * lapKm * keep);
  for (let i = 0; i < nLogs; i++) {
    const L = range(rng, LOG_LENGTH[0], LOG_LENGTH[1]);
    const p = floorAt(LOG_REACH, L / 2 + PATCH_MARGIN);
    if (!p) continue;
    const t = range(rng, 0.7, 1.2);
    logs.push({ m: matrix(p.x, g.height(p.x, p.z) - L * 0.02, p.z, rng() * Math.PI * 2, L, L * t, L * t), c: grey(rng, 0.85, 1.1) });
  }

  canopyCeiling(ctx, scenery, clearings, rng, woods.ceiling);
  markers(ctx, colours, rng, woods.stones);

  // --- Build ---
  const owned: { dispose(): void }[] = [];
  const objects: THREE.Object3D[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    owned.push(x);
    return x;
  };
  // Each kind is drawn out to its own distance: the giants until the mist and the trunks in
  // front hide them, the deep woods to the fog, ferns only near.
  const drawn: { mesh: THREE.InstancedMesh; view: number }[] = [];
  for (const [cells, geo, name, view] of [
    [woods.giants, own(giantGeometry(colours, q)), 'giants', GIANT_VIEW[q]],
    [woods.deep, own(deepTreeGeometry(colours, new THREE.Color(palette.horizon))), 'deepWoods', FOG_FAR[q] + CULL_MARGIN],
    [woods.floor, own(fernPatchGeometry(colours)), 'ferns', FERN_VIEW],
    [woods.ceiling, own(ceilingGeometry()), 'canopyCeiling', FOG_FAR[q] + CULL_MARGIN],
    [woods.stones, own(waymarkerGeometry(colours, new THREE.Color(palette.accent).multiplyScalar(RUNE_GLOW))), 'waymarkers', WAYMARKER_VIEW],
  ] as const) {
    for (const mesh of cells.meshes(geo, ctx.lit, name)) {
      drawn.push({ mesh, view });
      objects.push(mesh);
    }
  }
  // Logs and the boundary's waymarkers and lanterns are static and few: merged into the course's own props and glow.
  if (logs.length > 0) {
    const log = logGeometry(colours);
    for (const it of logs) stamp(ctx.props, log, it.m, it.c);
    log.dispose();
  }

  const air = buildAir(ctx, scenery, palette, clearings, rng, keep, own);
  objects.push(...air.objects);

  return {
    objects,
    update(time, camera) {
      air.update(time);
      for (const { mesh, view } of drawn) {
        const bs = mesh.boundingSphere;
        if (bs) mesh.visible = bs.center.distanceTo(camera) - bs.radius < view;
      }
    },
    dispose() {
      for (const o of owned) o.dispose();
    },
  };
}

/**
 * The canopy ceiling over the course: broad, thin slabs of foliage high overhead, gaps between
 * them where the sky and the light come through. How many by the scenery's canopy; none over
 * clearings.
 */
function canopyCeiling(ctx: DressContext, scenery: ForestScenery, clearings: Clearings, rng: Rng, slabs: Cells): void {
  for (const cor of ctx.corridors) {
    const r = cor.ribbon;
    const count = Math.round((scenery.canopy * CEILING_PER_KM * r.length) / 1000);
    for (let i = 0; i < count; i++) {
      const k = Math.floor(rng() * cor.n);
      const smp = r.samples[k];
      if (cor.gap(k) || cor.tunnel(k) || (cor.vi === 0 && clearings.at(smp.s))) continue;
      const x = range(rng, -smp.edgeL - CEILING_SIDE, smp.edgeR + CEILING_SIDE);
      const p = r.toWorld(smp.s, x, scenery.treeHeight * range(rng, CEILING_HEIGHT[0], CEILING_HEIGHT[1]));
      const w = range(rng, CEILING_SIZE[0], CEILING_SIZE[1]);
      const leaf = new THREE.Color(LEAVES[Math.floor(rng() * LEAVES.length)]).multiplyScalar(range(rng, CEILING_SHADE[0], CEILING_SHADE[1]));
      slabs.add(p.x, p.z, matrix(p.x, p.y, p.z, rng() * Math.PI, w, w, w * range(rng, 0.6, 1)), leaf);
    }
  }
}
/** Trees keep this much further from loops, corkscrews, decks and tunnels (their road swings wide or overhead). */
const MAGNET_CLEAR = 80;
/** A giant's base sinks this far, so a slope never shows daylight under its flare. */
const TREE_SINK = 1;
/**
 * Cells (m a side) and draw distances (m) per kind. Giants past GIANT_VIEW stand behind rows of
 * nearer trunks, a third into the fog; ferns are knee-high and less than a pixel past FERN_VIEW.
 */
const GIANT_CELL = { high: 1600, low: 1600 } as const;
const GIANT_VIEW = { high: 1400, low: 1000 } as const;
const DEEP_CELL = { high: 3500, low: 3500 } as const;
const FERN_CELL = 1000;
const STONE_CELL = 2000;
const FERN_VIEW = 400;
/** Floor dressing keeps this far past the hard boundary. */
const PATCH_MARGIN = 2;

function instancedItems(geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[], name: string): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    mesh.setMatrixAt(i, it.m);
    mesh.setColorAt(i, it.c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = name;
  return mesh;
}

/** Waymarker stones on the run-off lips and lanterns on the walls, where other worlds put pylons and lamps. */
/**
 * Waymarker stones at the pylon spots (every WAYMARKER_EVERY-th), as instances in cells drawn
 * only near; lanterns on the walls, few, stamped into the course's props and glow.
 */
function markers(ctx: DressContext, colours: ForestColours, rng: Rng, stones: Cells): void {
  ctx.posts.pylons.forEach((p, i) => {
    if (i % WAYMARKER_EVERY !== 0) return;
    stones.add(p.p.x, p.p.z, matrix(p.p.x, p.p.y, p.p.z, rng() * Math.PI * 2, 1, range(rng, 0.85, 1.15), 1), grey(rng, 0.85, 1.1));
  });
  if (ctx.posts.lights.length > 0) {
    const post = lanternPostGeometry(colours);
    const lamp = lanternGeometry(new THREE.Color(LANTERN_COLOUR).multiplyScalar(LANTERN_GLOW));
    for (const l of ctx.posts.lights) {
      const m = matrix(l.p.x, l.p.y, l.p.z, Math.atan2(-l.inward.z, l.inward.x), 1, 1, 1);
      stamp(ctx.props, post, m, WHITE);
      stamp(ctx.glow, lamp, m, WHITE);
    }
    post.dispose();
    lamp.dispose();
  }
}
const WHITE = new THREE.Color(1, 1, 1);

/** Light shafts over the course and mist banks between the trunks. */
function buildAir(ctx: DressContext, scenery: ForestScenery, palette: TrackPalette, clearings: Clearings, rng: Rng, keep: number, own: <T extends { dispose(): void }>(x: T) => T): { objects: THREE.Object3D[]; update(time: number): void } {
  const objects: THREE.Object3D[] = [];
  const main = ctx.corridors[0];
  const r = main.ribbon;
  const lapKm = r.length / 1000;

  // Shafts lean away from the sun, never flatter than SHAFT_MIN_ELEVATION (a dusk sun is low).
  const sun = sunDirection(palette);
  const el = Math.max(SHAFT_MIN_ELEVATION, Math.asin(sun.y));
  const flat = Math.hypot(sun.x, sun.z) || 1;
  const dir = new THREE.Vector3((sun.x / flat) * Math.cos(el), Math.sin(el), (sun.z / flat) * Math.cos(el));
  const tilt = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  const shafts: Item[] = [];
  // Low detail draws no shafts: without the post pass each overlapping face is tone-mapped on
  // its own and the sum blows out, and their fill is what a weak GPU can least afford.
  const nShafts = ctx.quality === 'high' ? Math.round(scenery.shaftsPerKm * lapKm) : 0;
  for (let i = 0; i < nShafts; i++) {
    const k = Math.floor(rng() * main.n);
    const smp = r.samples[k];
    if (main.gap(k) || main.tunnel(k) || clearings.at(smp.s)) continue;
    const x = range(rng, -smp.edgeL, smp.edgeR) * 0.9;
    const foot = r.toWorld(smp.s, x, -1);
    const rad = range(rng, SHAFT_RADIUS[0], SHAFT_RADIUS[1]);
    const len = (scenery.treeHeight * CEILING_HEIGHT[0]) / dir.y;
    shafts.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(foot.x, foot.y, foot.z), tilt, new THREE.Vector3(rad, len, rad)), c: new THREE.Color(1, 1, 1) });
  }
  // Dappled pools of sun on the trail: one at each shaft's foot, more scattered between.
  const pools: Item[] = [];
  const pool = (s: number, x: number, size: number) => {
    const f = r.frameAt(s);
    const p = r.toWorld(s, x, POOL_LIFT);
    // Lying in the banked road: x = right, y = road up, z = right × up.
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(f.right.x, f.right.y, f.right.z), new THREE.Vector3(f.up.x, f.up.y, f.up.z), new THREE.Vector3(-f.tangent.x, -f.tangent.y, -f.tangent.z));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromRotationMatrix(basis), new THREE.Vector3(size, 1, size * range(rng, 0.6, 1.6)));
    pools.push({ m, c: grey(rng, 0.6, 1) });
  };
  for (const it of shafts) {
    const at = new THREE.Vector3().setFromMatrixPosition(it.m);
    const near = ctx.ground.nearest(at.x, at.z);
    if (near && near.v === 0) pool(r.samples[near.k].s, near.d, new THREE.Vector3().setFromMatrixScale(it.m).x * POOL_UNDER_SHAFT);
  }
  const nPools = Math.round(POOLS_PER_KM * lapKm);
  for (let i = 0; i < nPools; i++) {
    const k = Math.floor(rng() * main.n);
    const smp = r.samples[k];
    if (main.gap(k) || main.tunnel(k) || clearings.at(smp.s)) continue;
    pool(smp.s, range(rng, -smp.width / 2, smp.width / 2) * 0.9, range(rng, POOL_SIZE[0], POOL_SIZE[1]));
  }
  if (pools.length > 0) {
    const sunlight = new THREE.Color(palette.sun).multiplyScalar(POOL_DAY + (POOL_DUSK - POOL_DAY) * palette.dusk);
    const mesh = instancedItems(own(poolGeometry()), own(poolMaterial(sunlight)), pools, 'sunPools');
    mesh.renderOrder = AIR_ORDER;
    objects.push(mesh);
  }

  if (shafts.length > 0) {
    const light = new THREE.Color(palette.sun).multiplyScalar(SHAFT_DAY + (SHAFT_DUSK - SHAFT_DAY) * palette.dusk);
    const mesh = instancedItems(own(shaftGeometry()), own(shaftMaterial(light)), shafts, 'lightShafts');
    mesh.renderOrder = AIR_ORDER;
    objects.push(mesh);
  }

  // Mist banks off the road, among the trunks.
  const mists: Item[] = [];
  const nMist = Math.round(scenery.mist * MIST_PER_KM * lapKm * keep);
  for (let i = 0; i < nMist; i++) {
    const cor = ctx.corridors[Math.floor(rng() * ctx.corridors.length)];
    const k = Math.floor(rng() * cor.n);
    const side = rng() < 0.5 ? -1 : 1;
    if (cor.gap(k) || cor.tunnel(k)) continue;
    const p = cor.beside(k, side, range(rng, MIST_REACH[0], MIST_REACH[1]), 0);
    const near = ctx.ground.nearest(p.x, p.z);
    if (near && edgeGap(ctx.ground, near) < MIST_REACH[0]) continue;
    const w = range(rng, MIST_WIDTH[0], MIST_WIDTH[1]);
    mists.push({ m: matrix(p.x, ctx.ground.height(p.x, p.z) - 1, p.z, 0, w, range(rng, MIST_HEIGHT[0], MIST_HEIGHT[1]), 1), c: new THREE.Color(1, 1, 1) });
  }
  let mistMat: THREE.ShaderMaterial | null = null;
  if (mists.length > 0) {
    const haze = new THREE.Color(palette.horizon).lerp(new THREE.Color(0xffffff), MIST_LIFT);
    mistMat = own(mistMaterial(haze, MIST_OPACITY));
    const mesh = instancedItems(own(mistGeometry()), mistMat, mists, 'mist');
    // Billboards turn to the camera, so the instances' own bounds are not where they draw.
    mesh.frustumCulled = false;
    mesh.renderOrder = AIR_ORDER;
    objects.push(mesh);
  }
  return {
    objects,
    update(time) {
      if (mistMat) mistMat.uniforms.uTime.value = time;
    },
  };
}
/** Shafts and mist draw after the opaque world (they are blended over it). */
const AIR_ORDER = 4;

