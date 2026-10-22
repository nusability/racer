import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// Climb onto the high plateau, bore through the summit, brake hard for the cliff hairpin,
// then fall back to the desert floor over a ladder of kickers.
export const mirageh: TrackDef = {
  id: 'mirageh',
  name: 'Mirage Heights',
  blurb: 'Climb to the summit bore, brake for the Cliff Hairpin, then fall off the mountain.',
  difficulty: 4,
  laps: 3,
  seed: 707,
  width: 32,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 0, z: -700, y: 10 },
    { x: 100, z: -1300, y: 40 },
    { x: 450, z: -1750, y: 75 },
    { x: 1000, z: -1900, y: 100 },
    { x: 1500, z: -1700, y: 120 },
    { x: 1800, z: -1200, y: 130 },
    { x: 1820, z: -600, y: 130 },
    { x: 1775, z: -300, y: 128 },
    { x: 1700, z: -170, y: 127 },
    { x: 1550, z: -170, y: 126 },
    { x: 1475, z: -300, y: 122 },
    { x: 1400, z: -900, y: 100 },
    { x: 1000, z: -1100, y: 75 },
    { x: 600, z: -800, y: 45 },
    { x: 500, z: -300, y: 20 },
    { x: 380, z: 400, y: 8 },
    { x: 60, z: 480, y: 2 },
  ],
  features: [
    { kind: 'boostPad', at: 0.3, lateral: 0 },
    { kind: 'tunnel', from: 5.3, to: 6.4, ceiling: 15 },
    { kind: 'kicker', at: 12.4, length: 40, height: 2 },
    { kind: 'kicker', at: 13.4, length: 40, height: 2 },
    { kind: 'kicker', at: 14.4, length: 40, height: 2.5 },
    { kind: 'boostPad', at: 15.5, lateral: 0 },
  ],
  palette: { sky: 0x4a7ec0, horizon: 0xf0b878, sand: 0xd8a060, road: 0xb88050, rock: 0x9a5030, accent: 0xff3a5a, sun: 0xffe0b0, dusk: 0.45 },
};

export const miragehScenery: TrackScenery = {
  mesas: 14,
  spires: 10,
  duneHeight: 8,
  scatter: 'rocks',
  scatterPerKm: 12,
  oases: [],
};
