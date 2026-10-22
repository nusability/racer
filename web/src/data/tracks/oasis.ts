import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// A lit bore straight through Table Mesa, and out into the palms and the boost lanes.
export const oasis: TrackDef = {
  id: 'oasis',
  name: 'Oasis Loop',
  blurb: 'Thread the lit bore under Table Mesa and burst out among the palms.',
  difficulty: 2,
  laps: 3,
  seed: 303,
  width: 36,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 0, z: -800, y: 2 },
    { x: 200, z: -1400, y: 6 },
    { x: 700, z: -1700, y: 10 },
    { x: 1300, z: -1650, y: 12 },
    { x: 1700, z: -1300, y: 12 },
    { x: 1800, z: -600, y: 10 },
    { x: 1700, z: -100, y: 6 },
    { x: 1350, z: 300, y: 2 },
    { x: 900, z: 450, y: 0 },
    { x: 500, z: 700, y: 0 },
    { x: 100, z: 800, y: 0 },
    { x: -250, z: 620, y: 0 },
    { x: -170, z: 300, y: 0 },
  ],
  features: [
    { kind: 'boostPad', at: 0.4, lateral: 0 },
    { kind: 'kicker', at: 1.4, length: 40, height: 2.5 },
    { kind: 'tunnel', from: 5.2, to: 6.0, ceiling: 16 },
    { kind: 'boostPad', at: 6.3, lateral: -8 },
    { kind: 'boostPad', at: 6.6, lateral: 8 },
    { kind: 'boostPad', at: 6.9, lateral: -8 },
    { kind: 'dunes', from: 9.2, to: 11.5, amplitude: 2, wavelength: 180 },
  ],
  palette: { sky: 0x3f86cf, horizon: 0xf5d9a6, sand: 0xe9c486, road: 0xcfa26a, rock: 0xb8743c, accent: 0x18b8c8, sun: 0xfff3d6, dusk: 0.05 },
};

export const oasisScenery: TrackScenery = {
  mesas: 9,
  spires: 5,
  duneHeight: 5,
  scatter: 'rocks',
  scatterPerKm: 10,
  oases: [
    { at: 6.5, side: 1 },
    { at: 6.8, side: -1 },
  ],
};
