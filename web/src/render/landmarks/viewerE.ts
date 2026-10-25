// Developer-only viewer for the set-E (city) landmarks (landmark-viewer.html?set=e&kind=maglev,
// never linked from the game): asphalt ground under dusk or night skies (render/landmarks/viewerRig.ts).
import type { TrackPalette } from '../../core/types.ts';
import { LANDMARKS_E } from './setE.ts';
import { runRigViewer, sweeper, type Placement } from './viewerRig.ts';

const PALETTES: Record<string, TrackPalette> = {
  dusk: { sky: 0x2a1650, horizon: 0xb05a8a, sand: 0x3a3844, road: 0x3c3e4a, rock: 0x2c2c36, accent: 0x3ff0ff, sun: 0xffb090, dusk: 0.65 },
  night: { sky: 0x160a30, horizon: 0x5a2a78, sand: 0x34323e, road: 0x3c3e4a, rock: 0x24242e, accent: 0xff3ad8, sun: 0xffd0f4, dusk: 0.8 },
  deep: { sky: 0x05040f, horizon: 0x221a3c, sand: 0x2a2a34, road: 0x30323c, rock: 0x202028, accent: 0xffb02e, sun: 0x9ab8ff, dusk: 1 },
};

const PLACE: Record<keyof typeof LANDMARKS_E, Placement> = {
  maglev: { distance: 20, hazards: [sweeper('train', 7, 6, 45, -45, 3, 2, 14)] },
  crane: { distance: 15, hazards: [{ type: 'dropper', id: 'girders', from: 0, to: 0, count: 5, radius: 3.5, period: 9, warn: 2.6, stay: 3, phase: 0 }] },
  demolition: { distance: 6, hazards: [{ type: 'blocker', id: 'facade', at: 0, opening: 8, offset: -4, height: 6, warn: 4, up: 5, period: 16, phase: 0 }] },
  cargoAirship: { distance: 30, hazards: [{ type: 'gust', id: 'downdraft', from: 0, to: 0, strength: 9, on: 6, period: 16, phase: 0 }] },
  skyscrapers: { distance: 30, hazards: [] },
  neonBillboards: { distance: 20, hazards: [] },
  stadium: { distance: 40, hazards: [] },
  hologramDragon: { distance: 60, hazards: [] },
  suspensionBridge: { distance: 40, hazards: [] },
  skyTram: { distance: 30, hazards: [] },
};

runRigViewer({ set: 'E', factories: LANDMARKS_E, place: PLACE, palettes: PALETTES, defaultKind: 'maglev', defaultPalette: 'night', landed: 0x8c939c, ground: true });
