// Developer-only viewer for the set-F (space) landmarks (landmark-viewer.html?set=f&kind=dockingArm,
// never linked from the game): a deck in the void under the station's palettes (render/landmarks/viewerRig.ts).
import type { TrackPalette } from '../../core/types.ts';
import { LANDMARKS_F } from './setF.ts';
import { runRigViewer, sweeper, type Placement } from './viewerRig.ts';

const PALETTES: Record<string, TrackPalette> = {
  station: { sky: 0x02030a, horizon: 0x05070e, sand: 0x3a4250, road: 0x30343e, rock: 0x6a7282, accent: 0x38d8ff, sun: 0xfff1dc, dusk: 0.85 },
  refinery: { sky: 0x03030a, horizon: 0x07060e, sand: 0x40404a, road: 0x34323a, rock: 0x6e6a66, accent: 0xffa53a, sun: 0xfff0d8, dusk: 0.8 },
  skim: { sky: 0x030209, horizon: 0x07050e, sand: 0x3e3a50, road: 0x302c3c, rock: 0x726a86, accent: 0xc77dff, sun: 0xfff0e0, dusk: 0.9 },
};

const PLACE: Record<keyof typeof LANDMARKS_F, Placement> = {
  dockingArm: { distance: 10, hazards: [sweeper('arm', 7, 8, 42, -42, 3.5, 1, 15)] },
  cargoHoist: { distance: 6, hazards: [{ type: 'dropper', id: 'pods', from: 0, to: 0, count: 3, radius: 2.8, period: 11, warn: 2.8, stay: 3, phase: 0 }] },
  blastDoor: { distance: 4, hazards: [{ type: 'blocker', id: 'airlock', at: 0, opening: 10, offset: 4, height: 9, warn: 3, up: 5, period: 16, phase: 0 }] },
  ventStack: { distance: 6, hazards: [{ type: 'gust', id: 'vent', from: 0, to: 0, strength: -8, on: 4, period: 12, phase: 0 }] },
  driftRock: { distance: 30, hazards: [sweeper('drift', 9, 18, 70, -70, 5, 0.5, 20)] },
};

runRigViewer({ set: 'F', factories: LANDMARKS_F, place: PLACE, palettes: PALETTES, defaultKind: 'dockingArm', defaultPalette: 'station', landed: 0x8c939c, ground: false });
