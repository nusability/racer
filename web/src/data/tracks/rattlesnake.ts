import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// Linked esses on open sand, a walled run down Fang Gulch past the old mine, and a boulder
// spill you can thread or skirt. The Spine Cut slices straight through the first lobe.
export const rattlesnake: TrackDef = {
  id: 'rattlesnake',
  name: 'Rattlesnake Run',
  blurb: 'Esses on open sand, then down Fang Gulch past the old mine. Cut the Spine if you dare.',
  difficulty: 2,
  laps: 3,
  seed: 202,
  width: 48,
  runoff: 55,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 680, z: 0, y: 0 },
    { x: 1190, z: -128, y: 3 },
    { x: 1880, z: -520, y: 6 },
    { x: 1488, z: -1020, y: 8 },
    { x: 1742, z: -1488, y: 10 },
    { x: 2252, z: -1658, y: 10 },
    { x: 2762, z: -1488, y: 8 },
    { x: 2930, z: -935, y: 5 },
    { x: 2885, z: -298, y: 2 },
    { x: 2635, z: 212, y: 0 },
    { x: 2125, z: 552, y: 0 },
    { x: 1445, z: 680, y: 0 },
    { x: 765, z: 612, y: 0 },
    { x: 128, z: 552, y: 0 },
    { x: -340, z: 357, y: 0 },
    { x: -382, z: 51, y: 0 },
  ],
  features: [
    { kind: 'boostPad', at: 0.3, lateral: 0 },
    { kind: 'kicker', at: 0.6, length: 40, height: 2 },
    { kind: 'canyon', from: 7.5, to: 8.9, wallHeight: 42 },
    { kind: 'narrow', from: 7.4, to: 9.0, width: 32, blend: 80 },
    { kind: 'boulders', from: 10.25, to: 10.6, count: 9, radius: 3 },
    { kind: 'runoff', from: 10.2, to: 10.7, amount: 75, side: -1 },
    { kind: 'boostPad', at: 10.45, lateral: 0 },
    { kind: 'dunes', from: 12.1, to: 13.8, amplitude: 2, wavelength: 220 },
    { kind: 'boostPad', at: 14.2, lateral: -10 },
  ],
  branches: [
    {
      id: 'spine',
      name: 'Spine Cut',
      side: -1,
      from: 2.2,
      to: 3.9,
      width: 20,
      runoff: 0,
      points: [
        { x: 1520, z: -320, y: 4 },
        { x: 1600, z: -560, y: 6 },
        { x: 1580, z: -760, y: 8 },
      ],
      features: [
        { kind: 'pillar', at: 2.5, lateral: 4.5, radius: 2 },
        { kind: 'pillar', at: 2.85, lateral: -4.5, radius: 2 },
        { kind: 'pillar', at: 3.2, lateral: 4.5, radius: 2 },
        { kind: 'pillar', at: 3.55, lateral: -4, radius: 2 },
        { kind: 'boostPad', at: 4.3, lateral: 0 },
      ],
    },
  ],
  palette: { sky: 0x4f8ed0, horizon: 0xf0c890, sand: 0xe2a868, road: 0xc8905a, rock: 0xa8522e, accent: 0x2ad0a0, sun: 0xfff0d0, dusk: 0.1 },
};

export const rattlesnakeScenery: TrackScenery = {
  mesas: 12,
  spires: 10,
  duneHeight: 6,
  scatter: 'cacti',
  scatterPerKm: 16,
  boundary: 'rock',
  oases: [],
  landmarks: [
    { kind: 'grandstand', at: 0.12, side: -1, distance: 15 },
    { kind: 'mine', at: 7.9, side: -1, distance: 45 },
    { kind: 'cliffVillage', at: 9.4, side: -1, distance: 40, scale: 1.4 },
    { kind: 'wreck', at: 12.5, side: 1, distance: 30 },
    { kind: 'balloons', at: 4.5, side: 1, distance: 200 },
  ],
};
