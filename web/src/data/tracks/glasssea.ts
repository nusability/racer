import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// A dusk sprint over fused glass sand: huge sweepers and three chasms back to back.
export const glasssea: TrackDef = {
  id: 'glasssea',
  name: 'Glass Sea',
  blurb: 'Dusk over fused sand. Flat out, and three chasms in a row: the Triple Leap.',
  difficulty: 3,
  laps: 2,
  seed: 505,
  width: 40,
  runoff: 0,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 0, z: -792, y: 0 },
    { x: 0, z: -1584, y: 0 },
    { x: 132, z: -2200, y: 2 },
    { x: 616, z: -2596, y: 4 },
    { x: 1320, z: -2640, y: 6 },
    { x: 1936, z: -2288, y: 8 },
    { x: 2200, z: -1672, y: 8 },
    { x: 2112, z: -968, y: 6 },
    { x: 2376, z: -352, y: 4 },
    { x: 2288, z: 264, y: 2 },
    { x: 1760, z: 616, y: 0 },
    { x: 1056, z: 616, y: 0 },
    { x: 528, z: 440, y: 0 },
    { x: 88, z: 396, y: 0 },
  ],
  features: [
    { kind: 'jump', at: 0.25, rampLength: 100, rampHeight: 6, gapLength: 70 },
    { kind: 'jump', at: 1.0, rampLength: 100, rampHeight: 6, gapLength: 75 },
    { kind: 'jump', at: 1.75, rampLength: 100, rampHeight: 6, gapLength: 80 },
    { kind: 'boostPad', at: 4.5, lateral: 0 },
    { kind: 'dunes', from: 7.2, to: 8.6, amplitude: 2, wavelength: 300 },
    { kind: 'jump', at: 9.2, rampLength: 100, rampHeight: 6, gapLength: 70 },
    { kind: 'boostPad', at: 12.3, lateral: -8 },
    { kind: 'boostPad', at: 12.3, lateral: 8 },
  ],
  branches: [],
  palette: { sky: 0x2c2458, horizon: 0xff9a62, sand: 0xd9927a, road: 0xa8706a, rock: 0x6a3a58, accent: 0x40e0ff, sun: 0xffa060, dusk: 0.8 },
};

export const glassseaScenery: TrackScenery = {
  mesas: 8,
  spires: 6,
  duneHeight: 3,
  scatter: 'shards',
  scatterPerKm: 16,
  oases: [],
};
