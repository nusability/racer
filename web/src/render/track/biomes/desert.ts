import * as THREE from 'three';
import type { TrackPalette } from '../../../core/types.ts';
import type { DesertScenery } from '../../../data/tracks/scenery.ts';
import { buildHorizon } from '../horizon.ts';
import { buildInstanced } from '../instanced.ts';
import { fbm, smoothstep } from '../noise.ts';
import { rockTexture, sandTexture } from '../textures.ts';
import type { BiomeKit } from './kit.ts';
import { ROCK_TILE } from '../config.ts';

// The Mirage Desert: rolling dunes, sandstone mesas and spires, scatter of rocks, cacti,
// bones or glass shards.

/** Dune crest spacing, metres. */
const DUNE_WAVELENGTH = 130;
/** Long dunes that stay everywhere, coarse enough for the far terrain mesh. */
const BROAD_DUNE_WAVELENGTH = 420;
/** Scale of the broad swells under the dunes, metres. */
const SWELL_SCALE = 900;
/** The open desert sits this far under the lowest road. */
const FLOOR_BELOW_ROAD = 1.5;

export function desertKit(scenery: DesertScenery, palette: TrackPalette): BiomeKit {
  const sand = new THREE.Color(palette.sand);
  const sandDark = new THREE.Color(palette.sand).lerp(new THREE.Color(palette.rock), 0.25).multiplyScalar(0.82);
  const sandLight = new THREE.Color(palette.sand).lerp(new THREE.Color(0xffffff), 0.18);
  const h = scenery.duneHeight;
  return {
    ground: {
      base: (minRoadY) => minRoadY - FLOOR_BELOW_ROAD,
      natural(g, x, z, ripple) {
        const along = x * g.windDir.x + z * g.windDir.z;
        const warp = fbm(g.noise, x / 380, z / 380, 2) * 2.2;
        const ridge = 1 - Math.abs(Math.sin((Math.PI * along) / DUNE_WAVELENGTH + warp));
        const broad = 0.5 + 0.5 * Math.sin((Math.PI * along) / BROAD_DUNE_WAVELENGTH + warp * 0.5);
        const swell = fbm(g.noise, x / SWELL_SCALE + 40, z / SWELL_SCALE + 40, 3);
        return g.base + h * (0.7 * ridge * ridge * ripple + 0.9 * broad + 1.1 * swell);
      },
      color(g, x, z, y, slope, out) {
        const rel = h > 0 ? (y - g.base) / (h * 2) : 0.5;
        const grain = g.noise(x / 9 + 100, z / 9 + 100) * 0.04;
        const patch = fbm(g.noise, x / 160 + 7, z / 160 + 7, 2) * 0.07;
        out.copy(sandDark).lerp(sand, smoothstep(rel * 1.6 + 0.2));
        out.lerp(sandLight, smoothstep(rel - 0.4) * 0.8);
        out.multiplyScalar(1 + grain + patch - Math.min(0.25, slope * 0.35));
        return out;
      },
    },
    road: { surface: 'packed', runoff: 'sand' },
    roadLight: 0,
    masonry: 'sandstone',
    pillar: { kind: 'rock' },
    ownPosts: false,
    cornerStands: true,
    detail: (seed, quality) => ({ sand: sandTexture(seed, quality), rock: rockTexture(seed, quality) }),
    dress(ctx) {
      const main = ctx.corridors[0];
      const objects: THREE.Object3D[] = [];
      const horizon = buildHorizon(main, scenery, ctx.quality, ctx.seed).build(ROCK_TILE);
      if (horizon) {
        const m = new THREE.Mesh(horizon, ctx.rock);
        m.name = 'horizon';
        m.matrixAutoUpdate = false;
        objects.push(m);
      }
      objects.push(...buildInstanced(main, scenery, ctx.quality, ctx.lit, ctx.seed));
      return {
        objects,
        update() {},
        dispose() {
          horizon?.dispose();
        },
      };
    },
    spray: { road: palette.road, runoff: palette.sand, water: palette.sand },
    debris: { color: palette.rock, glow: 0, dust: palette.sand, streak: palette.sand, shape: 'rock' },
  };
}
