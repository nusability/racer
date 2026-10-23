import type { TrackPalette } from '../../../core/types.ts';
import type { TrackScenery } from '../../../data/tracks/scenery.ts';
import { beachKit } from './beach.ts';
import { desertKit } from './desert.ts';
import type { BiomeKit } from './kit.ts';

/** The look of a track's world, from its scenery (which names the biome). */
export function biomeKit(scenery: TrackScenery, palette: TrackPalette): BiomeKit {
  switch (scenery.biome) {
    case 'desert':
      return desertKit(scenery, palette);
    case 'beach':
      return beachKit(scenery, palette);
  }
}

export type { BiomeKit } from './kit.ts';
