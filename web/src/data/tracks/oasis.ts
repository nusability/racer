import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// A lit bore straight through Table Mesa, out into the palms of Sweetwater; the main road
// loops round the town while the Bazaar Run threads between its stalls.
export const oasis: TrackDef = {
  id: 'oasis',
  name: 'Oasis Loop',
  blurb: 'Thread the lit bore under Table Mesa, then race the long way round Sweetwater, or through its bazaar.',
  difficulty: 2,
  laps: 3,
  seed: 303,
  width: 50,
  runoff: 60,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 0, z: -900, y: 2 },
    { x: 250, z: -1600, y: 6 },
    { x: 850, z: -1950, y: 10 },
    { x: 1550, z: -1900, y: 12 },
    { x: 2000, z: -1500, y: 12 },
    { x: 2100, z: -700, y: 10 },
    { x: 2000, z: -150, y: 6 },
    { x: 1650, z: 300, y: 2 },
    { x: 1150, z: 750, y: 0 },
    { x: 430, z: 1640, y: 0 },
    { x: -300, z: 1470, y: 0 },
    { x: -420, z: 750, y: 0 },
    { x: -170, z: 330, y: 0 },
  ],
  features: [
    { kind: 'boostPad', at: 0.4, lateral: 0 },
    { kind: 'kicker', at: 1.4, length: 40, height: 2.5 },
    { kind: 'tunnel', from: 5.2, to: 6.0, ceiling: 16 },
    { kind: 'narrow', from: 5.1, to: 6.1, width: 34, blend: 80 },
    { kind: 'boostPad', at: 6.3, lateral: -10 },
    { kind: 'boostPad', at: 6.6, lateral: 10 },
    { kind: 'boostPad', at: 6.9, lateral: -10 },
    { kind: 'dunes', from: 9.4, to: 11.4, amplitude: 2, wavelength: 200 },
    { kind: 'boulders', from: 12.3, to: 12.6, count: 6, radius: 3 },
  ],
  branches: [
    {
      id: 'bazaar',
      name: 'Bazaar Run',
      side: 1,
      from: 9.1,
      to: 11.7,
      width: 18,
      runoff: 0,
      points: [
        { x: 780, z: 990, y: 0 },
        { x: 380, z: 1080, y: 0 },
        { x: 30, z: 1160, y: 0 },
        { x: -160, z: 1220, y: 0 },
        { x: -310, z: 1170, y: 0 },
      ],
      features: [
        { kind: 'arch', at: 2.55, opening: 11, offset: -3, height: 9 },
        { kind: 'boostPad', at: 3.5, lateral: 0 },
        { kind: 'arch', at: 4.45, opening: 11, offset: 2, height: 9 },
      ],
    },
  ],
  palette: { sky: 0x3f86cf, horizon: 0xf5d9a6, sand: 0xe9c486, road: 0xcfa26a, rock: 0xb8743c, accent: 0x18b8c8, sun: 0xfff3d6, dusk: 0.05 },
};

export const oasisScenery: TrackScenery = {
  mesas: 9,
  spires: 5,
  duneHeight: 5,
  scatter: 'rocks',
  scatterPerKm: 8,
  boundary: 'dune',
  oases: [
    { at: 6.5, side: 1 },
    { at: 6.8, side: -1 },
  ],
  landmarks: [
    { kind: 'fair', at: 0.15, side: 1, distance: 5 },
    { kind: 'bazaar', branch: 'bazaar', at: 3.5, side: 1, distance: -153, straddle: true },
    { kind: 'oasisTown', at: 7.4, side: 1, distance: 10, scale: 1.3 },
    { kind: 'balloons', at: 3.2, side: 1, distance: 150 },
  ],
};
