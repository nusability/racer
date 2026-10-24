import * as THREE from 'three';
import type { TrackPalette } from '../../../core/types.ts';
import type { BeachScenery } from '../../../data/tracks/scenery.ts';
import { ROCK_TILE, SEA_LEVEL } from '../config.ts';
import { fbm, smoothstep } from '../noise.ts';
import { rockTexture, sandTexture } from '../textures.ts';
import { buildCoastHorizon, buildCoastLife } from './coast.ts';
import type { BiomeKit } from './kit.ts';
import type { SeaLook } from '../../look/lookTuning.ts';
import { buildSea } from './water.ts';

// Coral Coast: the course runs over sand spits and causeways in a turquoise sea, with
// beaches and dune grass either side, islands and sea stacks offshore.

/** Depth of the open sea floor below the surface, metres. */
const SEA_FLOOR = 9;
/** Scale of the land/sea pattern and how sharp its coastline is. */
const COAST_SCALE = 650;
const COAST_SHARPNESS = 0.18;
const DUNE_WAVELENGTH = 90;
/** What a craft throws up skimming water. */
const SPRAY_WATER = 0xe6fbff;

/** `sea`: the world look's water (sky reflection, HDR glints), or null for the water as it always was. */
export function beachKit(scenery: BeachScenery, palette: TrackPalette, sea: SeaLook | null): BiomeKit {
  const dry = new THREE.Color(palette.sand);
  const wet = new THREE.Color(palette.sand).multiplyScalar(0.72).lerp(new THREE.Color(0x7a8a90), 0.2);
  const grass = new THREE.Color(0x7f9a44).lerp(new THREE.Color(palette.sand), 0.15);
  const rock = new THREE.Color(palette.rock);
  return {
    ground: {
      base: () => SEA_LEVEL - SEA_FLOOR,
      natural(g, x, z, ripple) {
        const mask = fbm(g.noise, x / COAST_SCALE + 3, z / COAST_SCALE + 3, 3) + (scenery.land - 0.5) * 0.9;
        const landT = smoothstep((mask + 0.05) / COAST_SHARPNESS);
        const along = x * g.windDir.x + z * g.windDir.z;
        const ridge = 1 - Math.abs(Math.sin((Math.PI * along) / DUNE_WAVELENGTH + fbm(g.noise, x / 200, z / 200, 2) * 2));
        const dunes = scenery.landHeight * (0.45 + 0.35 * ridge * ripple + 0.4 * fbm(g.noise, x / 300 + 9, z / 300 + 9, 2));
        return g.base + (SEA_LEVEL + 1 + dunes - g.base) * landT;
      },
      color(g, x, z, y, slope, out) {
        const above = y - SEA_LEVEL;
        const grain = g.noise(x / 7 + 50, z / 7 + 50) * 0.05;
        out.copy(wet).lerp(dry, smoothstep(above / 1.6));
        const tuft = smoothstep((above - 2.5) / 3) * (0.5 + 0.5 * g.noise(x / 25, z / 25));
        out.lerp(grass, tuft * 0.85);
        out.lerp(rock, smoothstep((slope - 0.45) / 0.3));
        return out.multiplyScalar(1 + grain);
      },
    },
    road: { surface: scenery.road, runoff: 'wetsand' },
    roadLight: 0,
    masonry: 'sandstone',
    pillar: { kind: 'rock' },
    ownPosts: false,
    cornerStands: true,
    detail: (seed, quality) => ({ sand: sandTexture(seed, quality), rock: rockTexture(seed, quality) }),
    dress(ctx) {
      const main = ctx.corridors[0];
      const water = buildSea(ctx.ground, palette, ctx.quality, sea);
      const horizonGeo = buildCoastHorizon(main, scenery, ctx.quality, ctx.seed).build(ROCK_TILE);
      const life = buildCoastLife(main, ctx.buoys, ctx.ground, scenery, ctx.quality, ctx.lit, ctx.seed);
      const objects: THREE.Object3D[] = [water.mesh, ...life.meshes];
      if (horizonGeo) {
        const m = new THREE.Mesh(horizonGeo, ctx.rock);
        m.name = 'coastHorizon';
        m.matrixAutoUpdate = false;
        objects.push(m);
      }
      return {
        objects,
        update(time) {
          water.update(time);
          life.update(time);
        },
        dispose() {
          water.dispose();
          life.dispose();
          horizonGeo?.dispose();
        },
      };
    },
    spray: { road: palette.road, runoff: palette.sand, water: SPRAY_WATER },
    // Volcanic coasts throw lava bombs: dark rock with a molten glow.
    debris: { color: palette.rock, glow: scenery.lava ? 1 : 0, dust: palette.sand, streak: SPRAY_WATER, shape: 'rock' },
  };
}
