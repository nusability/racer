import * as THREE from 'three';
import type { TrackPalette } from '../../../core/types.ts';
import { mulberry32, range, type Rng } from '../../../core/rng.ts';
import type { ForestScenery } from '../../../data/tracks/scenery.ts';
import { sunDirection } from '../environment.ts';
import type { Ground } from '../ground.ts';
import { fbm, smoothstep } from '../noise.ts';
import { mossTexture, mossyStoneTexture } from '../forestTextures.ts';
import type { BiomeKit, DressContext, Dressing } from './kit.ts';
import { mistGeometry, mistMaterial, poolGeometry, poolMaterial, shaftGeometry, shaftMaterial } from './forestAir.ts';
import { barkTextures, spriteAtlas } from './forestPaint.ts';
import { logGeometry, stamp, trunkGeometry, waymarkerGeometry, type ForestColours } from './forestProps.ts';
import { SpriteCells, spriteGeometry, spriteMaterial, type SpriteUse } from './forestSprites.ts';
import { TrunkCells, trunkMaterial } from './forestTrunks.ts';
import { Clearings, plantWoods, type SpriteUses, type Woods } from './forestWoods.ts';

// Elderwood: the floor of a forest of colossal trunks. The course is a narrow trail of packed
// earth walled by a colonnade of real trunks at its very edge (they are the hard boundary:
// what you see is what you hit), a second rank behind them, then the deep woods layered back
// into green-grey mist as impostor sprites, ferns spilling over the trail's edges, the canopy a
// dark ceiling far overhead with a few bright gaps, shafts of sun and dapples on the trail.
//
// Cost: the near trunks are one instanced draw per map cell, drawn out to TRUNK_VIEW; past it
// and for every deeper trunk, fern, shrub and canopy clump, one sprite draw per (larger) cell,
// drawn out to the fog, which closes in a few hundred metres (config.ts): the woods fill the
// frame for a dozen draws. Low quality keeps fewer sides per trunk, a shorter 3D range, about
// half the sprites, no shafts, and its fog closes nearer.

/** The open forest floor sits this far under the lowest road. */
const FLOOR_BELOW_ROAD = 2;
/** Hummocks of root and moss near the course, and broad swells everywhere: height (m) and scale (m). */
const HUMMOCK = 1.6;
const HUMMOCK_SCALE = 40;
const SWELL = 9;
const SWELL_SCALE = 650;
/** Patchwork of moss and leaf litter, and steep ground showing bare earth. */
const PATCH_SCALE = 30;
const BANK_SLOPE: readonly [number, number] = [0.35, 0.8];
const BANK_EARTH = 0.6;
const GRAIN = 0.08;
/** The forest floor under the canopy is this much darker than the palette's (clearings are not). */
const FLOOR_SHADE = 0.62;
/** Moss, and a glade's grass, pulled from the palette's forest floor. */
const MOSS = 0x4f7a2a;
const MOSS_PULL = 0.45;
const MOSS_COVER = 0.4;
const GRASS = 0x8aa83a;
const GRASS_PULL = 0.6;
/** Redwood bark, a little of the palette's rock in it; fern and canopy greens; pale heartwood. */
const BARK = 0x74402a;
const BARK_ROCK = 0.08;
const FERN = 0x5a8a30;
const LEAVES = 0x23401f;
const HEARTWOOD = 0xc8a070;
/** Moss on a trunk's flare, as the bark's vertex tint (the bark texture × this reads moss green). */
const FLARE_MOSS = new THREE.Color(0.75, 1.15, 0.55);
/** Clearings: a glade's grass fades out over this far from the trail; a town's logged ground this far. */
const CLEARING_REACH = 160;
const GLADE_FADE = 90;
/** Near terrain tiles' cells (TERRAIN_CELLS_FAR divides them): the corridor's bank draws the floor finely by the trail. */
const FOREST_TERRAIN_CELLS = { high: 36, low: 20 } as const;
/** The trail glows faintly with its texture's own colour: under the canopy it must still read. */
const ROAD_LIGHT = 0.16;
/**
 * Cells (m a side) and draw ranges (m). Near trunks are drawn in 3D out to TRUNK_VIEW (their
 * impostors take over past it); ferns are knee-high and gone past FERN_VIEW, shrubs past
 * SHRUB_VIEW; everything else to the fog.
 */
const TRUNK_CELL = 220;
const TRUNK_VIEW = { high: 220, low: 140 } as const;
const SPRITE_CELL = { high: 450, low: 450 } as const;
const FERN_VIEW = { high: 140, low: 90 } as const;
const SHRUB_VIEW = { high: 260, low: 180 } as const;
/** Waymarker runes glow past white so the bloom finds them under the canopy. */
const RUNE_GLOW = 2.2;
/** Lanterns: their warm light, past white so they bloom, and their size (m) and stretch. */
const LANTERN_COLOUR = 0xffc070;
const LANTERN_GLOW = 1.8;
const LANTERN_SIZE = 0.45;
const LANTERN_TALL = 1.4;
/** Light shafts: radius (m), the steepest-to-flattest they lean (radians above the horizon). */
const SHAFT_RADIUS: readonly [number, number] = [4, 10];
const SHAFT_MIN_ELEVATION = 0.8;
/** Shaft light, as a share of the sun's colour, by day and at deep dusk. */
const SHAFT_DAY = 0.2;
const SHAFT_DUSK = 0.26;
/** Sun dapples on the trail: per kilometre, size (m), one under every shaft, their light as a share of the sun's. */
const POOLS_PER_KM = 60;
const POOL_SIZE: readonly [number, number] = [2, 6];
const POOL_UNDER_SHAFT = 1.3;
const POOL_DAY = 0.42;
const POOL_DUSK = 0.5;
const POOL_LIFT = 0.1;
/** Mist banks per kilometre at mist 1, their size (m), how far out they drift, and their veil. */
const MIST_PER_KM = 40;
const MIST_WIDTH: readonly [number, number] = [30, 80];
const MIST_HEIGHT: readonly [number, number] = [8, 20];
const MIST_REACH: readonly [number, number] = [8, 240];
const MIST_OPACITY = 0.38;
/** Mist is the horizon haze, lifted toward white. */
const MIST_LIFT = 0.3;
/** Shafts and mist draw after the opaque world (they are blended over it). */
const AIR_ORDER = 4;
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
        return g.base + hummock + swell;
      },
      color(g, x, z, _y, slope, out) {
        const patch = fbm(g.noise, x / PATCH_SCALE + 3, z / PATCH_SCALE + 3, 2);
        const grain = g.noise(x / 4 + 70, z / 4 + 70) * GRAIN;
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
    pillar: { kind: 'kit' },
    terrainCells: FOREST_TERRAIN_CELLS,
    ownPosts: true,
    cornerStands: false,
    detail: (seed, quality) => ({ sand: mossTexture(seed, quality), rock: mossyStoneTexture(seed, quality) }),
    dress: (ctx) => dressForest(ctx, scenery, palette, colours, clearingsOf(ctx.ground)),
    spray: { road: palette.road, runoff: palette.sand, water: SPRAY_WATER },
    debris: { color: colours.bark.getHex(), glow: 0, dust: DUST, streak: LEAF_STREAK, shape: 'log' },
  };
}

function dressForest(ctx: DressContext, scenery: ForestScenery, palette: TrackPalette, colours: ForestColours, clearings: Clearings): Dressing {
  const rng = mulberry32(ctx.seed ^ 0xf0e5);
  const q = ctx.quality;
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    owned.push(x);
    return x;
  };
  // The woods' corner: the course's bounds, pushed out past the deepest trees.
  const corner = { x: Infinity, z: Infinity };
  for (const v of ctx.ground.views) {
    for (const p of v.ribbon.samples) {
      corner.x = Math.min(corner.x, p.pos.x - scenery.forestDepth * 2);
      corner.z = Math.min(corner.z, p.pos.z - scenery.forestDepth * 2);
    }
  }
  // Past the fog's far edge nothing shows: sprites (and their cells) stop there.
  const sight = ctx.fogFar;
  const atlas = spriteAtlas(ctx.seed, q, { bark: colours.bark, moss: colours.moss, fern: colours.fern, leaves: new THREE.Color(LEAVES) });
  own(atlas.texture);
  // The atlas's frames, each with the range it draws at, by role.
  const list: SpriteUse[] = [];
  const use = (frame: (typeof atlas.frames)[number], near: number, far: number) => list.push({ frame, near, far }) - 1;
  const trunkFrames = atlas.frames.filter((f) => f.kind === 'trunk');
  const kind = (k: string) => atlas.frames.filter((f) => f.kind === k);
  const uses: SpriteUses = {
    deep: trunkFrames.map((f) => use(f, 0, sight)),
    near: trunkFrames.map((f) => use(f, TRUNK_VIEW[q], sight)),
    ferns: kind('fern').map((f) => use(f, 0, FERN_VIEW[q])),
    shrub: use(kind('shrub')[0], 0, SHRUB_VIEW[q]),
    canopy: use(kind('canopy')[0], 0, sight),
  };
  const woods: Woods = { trunks: new TrunkCells(TRUNK_CELL, corner), sprites: new SpriteCells(SPRITE_CELL[q], corner), logs: [], stones: [], lanterns: [] };
  plantWoods(ctx, scenery, clearings, uses, rng, woods);

  const bark = barkTextures(ctx.seed, q, colours.bark);
  own(bark.map);
  own(bark.normal);
  const drawn: { mesh: THREE.InstancedMesh; view: number }[] = [];
  const objects: THREE.Object3D[] = [];
  for (const mesh of woods.trunks.meshes(own(trunkGeometry(q, FLARE_MOSS)), own(trunkMaterial(bark.map, bark.normal)), 'trunks')) {
    drawn.push({ mesh, view: TRUNK_VIEW[q] });
    objects.push(mesh);
  }
  for (const mesh of woods.sprites.meshes(own(spriteGeometry()), own(spriteMaterial(atlas.texture, list)), 'woods')) {
    drawn.push({ mesh, view: sight });
    objects.push(mesh);
  }
  // Logs and waymarkers are static and few: merged into the course's own props.
  if (woods.logs.length > 0) {
    const log = logGeometry(colours);
    for (const it of woods.logs) stamp(ctx.props, log, it.m, it.c);
    log.dispose();
  }
  if (woods.stones.length > 0) {
    const stone = waymarkerGeometry(colours, new THREE.Color(palette.accent).multiplyScalar(RUNE_GLOW));
    for (const m of woods.stones) stamp(ctx.props, stone, m, WHITE);
    stone.dispose();
  }

  // Lanterns glow unlit, merged into the course's glow mesh.
  const lamp = new THREE.OctahedronGeometry(LANTERN_SIZE);
  const lampColour = new THREE.Color(LANTERN_COLOUR).multiplyScalar(LANTERN_GLOW);
  const lp = lamp.getAttribute('position');
  for (const at of woods.lanterns) {
    for (let i = 0; i < lp.count; i += 3) {
      const v = (j: number) => ({ x: at.x + lp.getX(i + j), y: at.y + lp.getY(i + j) * LANTERN_TALL, z: at.z + lp.getZ(i + j) });
      ctx.glow.tri(v(0), v(1), v(2), lampColour);
    }
  }
  lamp.dispose();

  const air = buildAir(ctx, scenery, palette, clearings, rng, own);
  objects.push(...air.objects);
  for (const mesh of air.culled) {
    drawn.push({ mesh, view: sight });
    objects.push(mesh);
  }

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
const WHITE = new THREE.Color(1, 1, 1);

interface Item {
  m: THREE.Matrix4;
  c: THREE.Color;
}

/** Items grouped by map cell (AIR_CELL a side), one instanced mesh each, so whole cells cull by distance. */
function cellMeshes(geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[], name: string): THREE.InstancedMesh[] {
  const cells = new Map<string, Item[]>();
  const p = new THREE.Vector3();
  for (const it of items) {
    p.setFromMatrixPosition(it.m);
    const key = `${Math.floor(p.x / AIR_CELL)},${Math.floor(p.z / AIR_CELL)}`;
    let list = cells.get(key);
    if (!list) cells.set(key, (list = []));
    list.push(it);
  }
  return [...cells].map(([key, list]) => {
    const mesh = instancedItems(geo, mat, list, `${name}:${key}`);
    mesh.renderOrder = AIR_ORDER;
    return mesh;
  });
}
/** Shafts and sun pools are gathered in cells this big (m), culled past the fog. */
const AIR_CELL = 400;

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

/** Light shafts slanting onto the trail, sun dapples on it, and mist banks between the trunks. */
function buildAir(ctx: DressContext, scenery: ForestScenery, palette: TrackPalette, clearings: Clearings, rng: Rng, own: <T extends { dispose(): void }>(x: T) => T): { objects: THREE.Object3D[]; culled: THREE.InstancedMesh[]; update(time: number): void } {
  const objects: THREE.Object3D[] = [];
  const culled: THREE.InstancedMesh[] = [];
  const main = ctx.corridors[0];
  const r = main.ribbon;
  const lapKm = r.length / 1000;
  const UP = new THREE.Vector3(0, 1, 0);

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
    const len = (scenery.treeHeight * 0.7) / dir.y;
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
    pools.push({ m, c: new THREE.Color().setScalar(range(rng, 0.6, 1)) });
  };
  for (const it of shafts) {
    const at = new THREE.Vector3().setFromMatrixPosition(it.m);
    const near = ctx.ground.nearestOn(0, at.x, at.z);
    if (near) pool(r.samples[near.k].s, near.d, new THREE.Vector3().setFromMatrixScale(it.m).x * POOL_UNDER_SHAFT);
  }
  const nPools = Math.round(POOLS_PER_KM * lapKm);
  for (let i = 0; i < nPools; i++) {
    const k = Math.floor(rng() * main.n);
    const smp = r.samples[k];
    if (main.gap(k) || main.tunnel(k) || clearings.at(smp.s)) continue;
    pool(smp.s, range(rng, -smp.width / 2, smp.width / 2) * 0.85, range(rng, POOL_SIZE[0], POOL_SIZE[1]));
  }
  if (pools.length > 0) {
    const sunlight = new THREE.Color(palette.sun).multiplyScalar(POOL_DAY + (POOL_DUSK - POOL_DAY) * palette.dusk);
    culled.push(...cellMeshes(own(poolGeometry()), own(poolMaterial(sunlight)), pools, 'sunPools'));
  }
  if (shafts.length > 0) {
    const light = new THREE.Color(palette.sun).multiplyScalar(SHAFT_DAY + (SHAFT_DUSK - SHAFT_DAY) * palette.dusk);
    culled.push(...cellMeshes(own(shaftGeometry()), own(shaftMaterial(light)), shafts, 'lightShafts'));
  }

  // Mist banks off the trail, among the trunks.
  const mists: Item[] = [];
  const nMist = Math.round(scenery.mist * MIST_PER_KM * lapKm * (ctx.quality === 'high' ? 1 : 0.5));
  for (let i = 0; i < nMist; i++) {
    const cor = ctx.corridors[Math.floor(rng() * ctx.corridors.length)];
    const k = Math.floor(rng() * cor.n);
    const side = rng() < 0.5 ? -1 : 1;
    if (cor.gap(k) || cor.tunnel(k)) continue;
    const p = cor.beside(k, side, range(rng, MIST_REACH[0], MIST_REACH[1]), 0);
    if (ctx.ground.boundaryGap(p.x, p.z) < MIST_REACH[0]) continue;
    const w = range(rng, MIST_WIDTH[0], MIST_WIDTH[1]);
    mists.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(p.x, ctx.ground.height(p.x, p.z) - 1, p.z), new THREE.Quaternion(), new THREE.Vector3(w, range(rng, MIST_HEIGHT[0], MIST_HEIGHT[1]), 1)), c: new THREE.Color(1, 1, 1) });
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
    culled,
    update(time) {
      if (mistMat) mistMat.uniforms.uTime.value = time;
    },
  };
}
