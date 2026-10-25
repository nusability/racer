// Developer-only viewer for the set-D (ice) landmarks (landmark-viewer.html?set=d&kind=icebreaker,
// never linked from the game): a snowfield under day, dusk or night skies (render/landmarks/viewerRig.ts).
import type { TrackPalette } from '../../core/types.ts';
import { LANDMARKS_D } from './setD.ts';
import { runRigViewer, sweeper, type Placement } from './viewerRig.ts';

const PALETTES: Record<string, TrackPalette> = {
  day: { sky: 0x3d86d8, horizon: 0xd4e6f2, sand: 0xe8f0f8, road: 0x6a7686, rock: 0x4e5866, accent: 0x2ad0ff, sun: 0xfff6e8, dusk: 0.1 },
  dusk: { sky: 0x232a66, horizon: 0xf0a090, sand: 0xd6d2ea, road: 0x585a72, rock: 0x3c3a52, accent: 0xff60c0, sun: 0xffa070, dusk: 0.8 },
  night: { sky: 0x040a22, horizon: 0x1c2c58, sand: 0x9fb0d0, road: 0x363c52, rock: 0x262a3a, accent: 0x40ffd0, sun: 0x9ab8ff, dusk: 1 },
};

const PLACE: Record<keyof typeof LANDMARKS_D, Placement> = {
  icebreaker: {
    distance: 30,
    hazards: [
      { type: 'blocker', id: 'ram', at: 0, opening: 9, offset: -6, height: 9, warn: 4, up: 5, period: 16, phase: 0 },
      sweeper('hull', 14, 14, 60, -2, 7, 2, 20),
    ],
  },
  avalancheSlope: { distance: 15, hazards: [{ type: 'dropper', id: 'snow', from: 0, to: 0, count: 6, radius: 3.5, period: 9, warn: 2.4, stay: 3, phase: 0 }] },
  glacierWall: { distance: 8, hazards: [{ type: 'blocker', id: 'calve', at: 0, opening: 8, offset: -5, height: 7, warn: 5, up: 5, period: 18, phase: 0 }] },
  mammothHerd: { distance: 20, hazards: [sweeper('herd', 6, 9, -70, 20, 18, 3, 50)] },
  iceStation: { distance: 20, hazards: [{ type: 'gust', id: 'wash', from: 0, to: 0, strength: -9, on: 6, period: 16, phase: 0 }] },
  skiJump: { distance: -292, hazards: [] },
  icePalace: { distance: 40, hazards: [] },
  frozenFalls: { distance: 30, hazards: [] },
  auroraSky: { distance: -3012, hazards: [] },
  snowcatConvoy: { distance: 25, hazards: [sweeper('cat', 5, 6, -60, 22, 6, 2, 18)] },
};

runRigViewer({ set: 'D', factories: LANDMARKS_D, place: PLACE, palettes: PALETTES, defaultKind: 'icebreaker', defaultPalette: 'day', landed: 0xdfe8f4, ground: true });
