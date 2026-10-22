import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// Beginner course on a white salt pan: wide open sand either side, one forgiving leap in
// sight of the stands, and an easy walled cut past the spaceport to teach shortcuts.
export const sunpan: TrackDef = {
  id: 'sunpan',
  name: 'Sunpan Flats',
  blurb: 'Endless white salt, rockets lifting off, one easy leap. Learn to fly.',
  difficulty: 1,
  laps: 3,
  seed: 101,
  width: 54,
  runoff: 75,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 0, z: -792, y: 0 },
    { x: 0, z: -1496, y: 0 },
    { x: 176, z: -2068, y: 2 },
    { x: 704, z: -2420, y: 4 },
    { x: 1364, z: -2420, y: 6 },
    { x: 1848, z: -2068, y: 5 },
    { x: 1980, z: -1496, y: 3 },
    { x: 2376, z: -1100, y: 2 },
    { x: 2420, z: -572, y: 1 },
    { x: 2024, z: -176, y: 0 },
    { x: 1892, z: 352, y: 0 },
    { x: 1364, z: 792, y: 1 },
    { x: 616, z: 836, y: 2 },
    { x: 132, z: 484, y: 1 },
  ],
  features: [
    { kind: 'boostPad', at: 0.25, lateral: -10 },
    { kind: 'boostPad', at: 0.25, lateral: 10 },
    { kind: 'jump', at: 0.6, rampLength: 60, rampHeight: 5, gapLength: 45 },
    { kind: 'dunes', from: 3.2, to: 5.6, amplitude: 1.5, wavelength: 260 },
    { kind: 'boulders', from: 6.2, to: 6.5, count: 6, radius: 3 },
    { kind: 'boostPad', at: 6.35, lateral: 30 },
    { kind: 'kicker', at: 11.3, length: 40, height: 2.5 },
    { kind: 'dunes', from: 12.2, to: 13.6, amplitude: 2, wavelength: 240 },
    { kind: 'boostPad', at: 13.4, lateral: 0 },
  ],
  branches: [
    {
      id: 'saltcut',
      name: 'Salt Cut',
      side: 1,
      from: 6.5,
      to: 10.45,
      width: 22,
      runoff: 0,
      points: [
        { x: 1866, z: -1450, y: 3 },
        { x: 1855, z: -900, y: 2 },
        { x: 1878, z: -350, y: 1 },
      ],
      features: [
        { kind: 'kicker', at: 3.3, length: 40, height: 2 },
        { kind: 'boostPad', at: 4.2, lateral: 0 },
      ],
    },
  ],
  palette: { sky: 0x3d7fd0, horizon: 0xf3dfb8, sand: 0xeedcbc, road: 0xd8b07a, rock: 0xc07848, accent: 0xff5a2a, sun: 0xfff2d8, dusk: 0 },
};

export const sunpanScenery: TrackScenery = {
  mesas: 10,
  spires: 6,
  duneHeight: 4,
  scatter: 'rocks',
  scatterPerKm: 10,
  boundary: 'dune',
  oases: [],
  landmarks: [
    { kind: 'grandstand', at: 0.1, side: 1, distance: 15 },
    { kind: 'spaceport', at: 8.5, side: -1, distance: 60 },
    { kind: 'skyfleet', at: 2.5, side: -1, distance: 250 },
    { kind: 'balloons', at: 12.5, side: 1, distance: 120 },
  ],
};
