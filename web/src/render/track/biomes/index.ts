import type { TrackPalette } from '../../../core/types.ts';
import type { TrackScenery } from '../../../data/tracks/scenery.ts';
import { beachKit } from './beach.ts';
import { cityKit } from './city.ts';
import { desertKit } from './desert.ts';
import { iceKit } from './ice.ts';
import type { BiomeKit } from './kit.ts';
import type { AoLook } from '../../look/lookTuning.ts';

/**
 * The look of a track's world, from its scenery (which names the biome). `ao` is the world
 * look's baked occlusion when on; only kits with buildings of their own use it.
 */
export function biomeKit(scenery: TrackScenery, palette: TrackPalette, ao: AoLook | null): BiomeKit {
  switch (scenery.biome) {
    case 'desert':
      return desertKit(scenery, palette);
    case 'beach':
      return beachKit(scenery, palette);
    case 'ice':
      return iceKit(scenery, palette);
    case 'city':
      return cityKit(scenery, palette, ao);
  }
}

export type { BiomeKit } from './kit.ts';
