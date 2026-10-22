import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// Beginner course on a white salt pan: wide, flowing, one forgiving leap in sight of the stands.
export const sunpan: TrackDef = {
  id: 'sunpan',
  name: 'Sunpan Flats',
  blurb: 'A blinding salt pan and one easy leap over the Long Crack. Learn to fly.',
  difficulty: 1,
  laps: 3,
  seed: 101,
  width: 40,
  runoff: 0,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 0, z: -700, y: 0 },
    { x: 0, z: -1500, y: 0 },
    { x: 150, z: -2050, y: 2 },
    { x: 600, z: -2350, y: 4 },
    { x: 1150, z: -2250, y: 6 },
    { x: 1500, z: -1850, y: 5 },
    { x: 1600, z: -1250, y: 2 },
    { x: 1550, z: -500, y: 0 },
    { x: 1350, z: 100, y: 0 },
    { x: 900, z: 500, y: 2 },
    { x: 400, z: 550, y: 3 },
    { x: 80, z: 350, y: 1 },
  ],
  features: [
    { kind: 'boostPad', at: 0.2, lateral: -8 },
    { kind: 'boostPad', at: 0.2, lateral: 8 },
    { kind: 'jump', at: 0.55, rampLength: 60, rampHeight: 5, gapLength: 50 },
    { kind: 'kicker', at: 1.7, length: 40, height: 2.5 },
    { kind: 'dunes', from: 4.2, to: 5.6, amplitude: 1.5, wavelength: 240 },
    { kind: 'boostPad', at: 6.9, lateral: 0 },
    { kind: 'kicker', at: 7.4, length: 40, height: 2.5 },
    { kind: 'dunes', from: 7.8, to: 8.9, amplitude: 2.5, wavelength: 220 },
    { kind: 'boostPad', at: 10.5, lateral: 6 },
  ],
  branches: [],
  palette: { sky: 0x3d7fd0, horizon: 0xf3dfb8, sand: 0xeedcbc, road: 0xd8b07a, rock: 0xc07848, accent: 0xff5a2a, sun: 0xfff2d8, dusk: 0 },
};

export const sunpanScenery: TrackScenery = {
  mesas: 10,
  spires: 6,
  duneHeight: 4,
  scatter: 'rocks',
  scatterPerKm: 14,
  oases: [],
};
