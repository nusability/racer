import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// Esses that coil down into the first canyon, then spit you into a boulder field.
export const rattlesnake: TrackDef = {
  id: 'rattlesnake',
  name: 'Rattlesnake Run',
  blurb: 'Linked esses coil into Fang Gulch, then a field of loose boulders. Pick a line.',
  difficulty: 2,
  laps: 3,
  seed: 202,
  width: 34,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 700, z: 0, y: 0 },
    { x: 1100, z: -150, y: 3 },
    { x: 1340, z: -470, y: 6 },
    { x: 1190, z: -810, y: 8 },
    { x: 1350, z: -1150, y: 10 },
    { x: 1650, z: -1400, y: 10 },
    { x: 2000, z: -1250, y: 8 },
    { x: 2250, z: -900, y: 5 },
    { x: 2250, z: -400, y: 2 },
    { x: 2050, z: 50, y: 0 },
    { x: 1700, z: 400, y: 0 },
    { x: 1100, z: 550, y: 0 },
    { x: 500, z: 450, y: 0 },
    { x: -150, z: 430, y: 0 },
    { x: -480, z: 280, y: 0 },
    { x: -380, z: 20, y: 0 },
  ],
  features: [
    { kind: 'boostPad', at: 0.3, lateral: 0 },
    { kind: 'kicker', at: 0.6, length: 40, height: 2 },
    { kind: 'canyon', from: 7.4, to: 9.6, wallHeight: 40 },
    { kind: 'narrow', from: 7.5, to: 9.5, width: 24, blend: 60 },
    { kind: 'boulders', from: 10.2, to: 11.3, count: 14, radius: 3 },
    { kind: 'dunes', from: 12.1, to: 13.8, amplitude: 2, wavelength: 200 },
    { kind: 'boostPad', at: 13.2, lateral: -7 },
  ],
  palette: { sky: 0x4f8ed0, horizon: 0xf0c890, sand: 0xe2a868, road: 0xc8905a, rock: 0xa8522e, accent: 0x2ad0a0, sun: 0xfff0d0, dusk: 0.1 },
};

export const rattlesnakeScenery: TrackScenery = {
  mesas: 12,
  spires: 10,
  duneHeight: 6,
  scatter: 'cacti',
  scatterPerKm: 18,
  oases: [],
};
