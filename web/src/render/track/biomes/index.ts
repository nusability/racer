import type { TrackPalette } from '../../../core/types.ts';
import type { TrackScenery } from '../../../data/tracks/scenery.ts';
import { beachKit } from './beach.ts';
import { cityKit } from './city.ts';
import { desertKit } from './desert.ts';
import { iceKit } from './ice.ts';
import { spaceKit } from './space.ts';
import type { BiomeKit } from './kit.ts';
import type { AoLook, SeaLook } from '../../look/lookTuning.ts';

/** The parts of a world's look a kit draws itself (null when off or not the world's). */
export interface KitLook {
  /** Baked occlusion; only kits with buildings of their own use it. */
  ao: AoLook | null;
  /** The look's water; only kits with a sea use it. */
  sea: SeaLook | null;
}

/** The look of a track's world, from its scenery (which names the biome). */
export function biomeKit(scenery: TrackScenery, palette: TrackPalette, look: KitLook): BiomeKit {
  switch (scenery.biome) {
    case 'desert':
      return desertKit(scenery, palette);
    case 'beach':
      return beachKit(scenery, palette, look.sea);
    case 'ice':
      return iceKit(scenery, palette);
    case 'city':
      return cityKit(scenery, palette, look.ao);
    case 'space':
      return spaceKit(scenery, palette);
  }
}

export type { BiomeKit } from './kit.ts';
