import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// A dusk sprint over fused glass sand: huge sweepers, three chasms back to back, and a sand
// beast breaching beside the Gullet, a cut that leaps its widest crack.
export const glasssea: TrackDef = {
  id: 'glasssea',
  name: 'Glass Sea',
  blurb: 'Dusk over fused sand. Flat out, the Triple Leap, and a beast in the dunes.',
  difficulty: 3,
  laps: 2,
  seed: 505,
  width: 56,
  runoff: 80,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 0, z: -752, y: 0 },
    { x: 0, z: -1504, y: 0 },
    { x: 141, z: -2115, y: 2 },
    { x: 658, z: -2538, y: 4 },
    { x: 1363, z: -2585, y: 6 },
    { x: 1974, z: -2209, y: 8 },
    { x: 2209, z: -1598, y: 8 },
    { x: 2726, z: -1081, y: 6 },
    { x: 2773, z: -423, y: 4 },
    { x: 2303, z: 141, y: 2 },
    { x: 1645, z: 517, y: 0 },
    { x: 940, z: 564, y: 0 },
    { x: 423, z: 470, y: 0 },
    { x: 75, z: 357, y: 0 },
  ],
  features: [
    { kind: 'jump', at: 0.25, rampLength: 100, rampHeight: 6, gapLength: 60 },
    { kind: 'jump', at: 1.0, rampLength: 100, rampHeight: 6, gapLength: 65 },
    { kind: 'jump', at: 1.75, rampLength: 100, rampHeight: 6, gapLength: 70 },
    { kind: 'boostPad', at: 4.5, lateral: 0 },
    { kind: 'dunes', from: 5.3, to: 6.6, amplitude: 2, wavelength: 300 },
    { kind: 'boulders', from: 11.3, to: 11.55, count: 6, radius: 3.5 },
    { kind: 'boostPad', at: 12.6, lateral: -12 },
    { kind: 'boostPad', at: 12.6, lateral: 12 },
  ],
  branches: [
    {
      id: 'gullet',
      name: "Beast's Gullet",
      side: 1,
      from: 6.9,
      to: 10.1,
      width: 22,
      runoff: 0,
      points: [
        { x: 2250, z: -1300, y: 8 },
        { x: 2330, z: -800, y: 7 },
        { x: 2380, z: -300, y: 5 },
        { x: 2350, z: -50, y: 3 },
      ],
      features: [
        { kind: 'boostPad', at: 2.4, lateral: 0 },
        { kind: 'jump', at: 2.75, rampLength: 100, rampHeight: 6, gapLength: 75 },
      ],
    },
  ],
  palette: { sky: 0x2c2458, horizon: 0xff9a62, sand: 0xd9927a, road: 0xa8706a, rock: 0x6a3a58, accent: 0x40e0ff, sun: 0xffa060, dusk: 0.8 },
};

export const glassseaScenery: TrackScenery = {
  mesas: 8,
  spires: 6,
  duneHeight: 3,
  scatter: 'shards',
  scatterPerKm: 12,
  boundary: 'fence',
  oases: [],
  landmarks: [
    { kind: 'grandstand', at: 0.1, side: 1, distance: 15 },
    { kind: 'sandbeast', at: 8.4, side: -1, distance: 120 },
    { kind: 'skyfleet', at: 4.8, side: 1, distance: 300 },
    { kind: 'wreck', at: 12.2, side: -1, distance: 90 },
    { kind: 'balloons', at: 2.6, side: -1, distance: 200 },
  ],
};
