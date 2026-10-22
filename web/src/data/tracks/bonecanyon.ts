import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// A bleached gorge spanned by stone ribs like a giant's skeleton; leap in, leap out, and
// a fallen colossus watching from the dunes.
export const bonecanyon: TrackDef = {
  id: 'bonecanyon',
  name: 'Bone Canyon',
  blurb: 'Seven stone ribs over a bleached gorge, every gap off-centre. The Marrow Leap skips the bend.',
  difficulty: 3,
  laps: 3,
  seed: 404,
  width: 46,
  runoff: 45,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 0, z: -712, y: 0 },
    { x: -190, z: -1378, y: 4 },
    { x: -142, z: -2042, y: 8 },
    { x: 142, z: -2660, y: 10 },
    { x: 650, z: -3400, y: 10 },
    { x: 1500, z: -3400, y: 8 },
    { x: 1995, z: -2660, y: 6 },
    { x: 2090, z: -1852, y: 4 },
    { x: 1948, z: -1092, y: 2 },
    { x: 1568, z: -475, y: 0 },
    { x: 1000, z: -200, y: 0 },
    { x: 480, z: 280, y: 0 },
    { x: 80, z: 360, y: 0 },
  ],
  features: [
    { kind: 'jump', at: 0.4, rampLength: 60, rampHeight: 5, gapLength: 55 },
    { kind: 'canyon', from: 1.7, to: 3.6, wallHeight: 50 },
    { kind: 'narrow', from: 1.6, to: 3.7, width: 34, blend: 80 },
    { kind: 'arch', at: 2.15, opening: 18, offset: -7, height: 22 },
    { kind: 'arch', at: 2.3, opening: 18, offset: 7, height: 22 },
    { kind: 'arch', at: 2.45, opening: 18, offset: -5, height: 22 },
    { kind: 'arch', at: 2.6, opening: 17, offset: 7, height: 22 },
    { kind: 'arch', at: 2.75, opening: 18, offset: -7, height: 22 },
    { kind: 'arch', at: 2.9, opening: 18, offset: 4, height: 22 },
    { kind: 'arch', at: 3.05, opening: 22, offset: 0, height: 24 },
    { kind: 'boostPad', at: 3.35, lateral: 0 },
    { kind: 'jump', at: 8.1, rampLength: 70, rampHeight: 6, gapLength: 65 },
    { kind: 'boulders', from: 10.2, to: 10.5, count: 7, radius: 3 },
    { kind: 'runoff', from: 10.1, to: 10.6, amount: 70, side: 1 },
    { kind: 'boostPad', at: 12.3, lateral: 0 },
  ],
  branches: [
    {
      id: 'marrow',
      name: 'Marrow Leap',
      side: 1,
      from: 4.25,
      to: 6.75,
      width: 20,
      runoff: 0,
      points: [
        { x: 500, z: -3080, y: 10 },
        { x: 900, z: -3160, y: 11 },
        { x: 1300, z: -3160, y: 10 },
        { x: 1700, z: -3060, y: 8 },
      ],
      features: [
        { kind: 'boostPad', at: 2.5, lateral: 0 },
        { kind: 'jump', at: 3.0, rampLength: 60, rampHeight: 5, gapLength: 50 },
      ],
    },
  ],
  palette: { sky: 0x6a9cd0, horizon: 0xf2e6d0, sand: 0xe6d8bc, road: 0xc8b490, rock: 0xe8dcc4, accent: 0xd03020, sun: 0xfff6e6, dusk: 0.15 },
};

export const bonecanyonScenery: TrackScenery = {
  mesas: 10,
  spires: 12,
  duneHeight: 5,
  scatter: 'bones',
  scatterPerKm: 8,
  boundary: 'rock',
  oases: [],
  landmarks: [
    { kind: 'grandstand', at: 0.1, side: -1, distance: 15 },
    { kind: 'colossus', at: 5.5, side: -1, distance: 120 },
    { kind: 'cliffVillage', at: 2.5, side: 1, distance: 40 },
    { kind: 'wreck', at: 9.5, side: 1, distance: 80 },
    { kind: 'mine', at: 3.4, side: -1, distance: 30 },
  ],
};
