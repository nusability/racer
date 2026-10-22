import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// A bleached gorge spanned by rock ribs like a giant's skeleton; leap in, leap out.
export const bonecanyon: TrackDef = {
  id: 'bonecanyon',
  name: 'Bone Canyon',
  blurb: 'Seven stone ribs, every gap off-centre, in a gorge with no room to think.',
  difficulty: 3,
  laps: 3,
  seed: 404,
  width: 30,
  runoff: 0,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 0, z: -600, y: 0 },
    { x: -150, z: -1200, y: 4 },
    { x: -100, z: -1800, y: 8 },
    { x: 150, z: -2350, y: 10 },
    { x: 650, z: -2650, y: 10 },
    { x: 1200, z: -2600, y: 8 },
    { x: 1550, z: -2250, y: 6 },
    { x: 1600, z: -1500, y: 4 },
    { x: 1500, z: -900, y: 2 },
    { x: 1200, z: -400, y: 0 },
    { x: 800, z: -100, y: 0 },
    { x: 450, z: 300, y: 0 },
    { x: 100, z: 350, y: 0 },
  ],
  features: [
    { kind: 'jump', at: 0.35, rampLength: 60, rampHeight: 5, gapLength: 60 },
    { kind: 'canyon', from: 1.6, to: 3.6, wallHeight: 50 },
    { kind: 'narrow', from: 1.7, to: 3.5, width: 22, blend: 60 },
    { kind: 'arch', at: 2.1, opening: 13, offset: -4, height: 22 },
    { kind: 'arch', at: 2.25, opening: 13, offset: 4, height: 22 },
    { kind: 'arch', at: 2.4, opening: 13, offset: -3, height: 22 },
    { kind: 'arch', at: 2.55, opening: 12, offset: 4, height: 22 },
    { kind: 'arch', at: 2.7, opening: 12, offset: -4, height: 22 },
    { kind: 'arch', at: 2.85, opening: 13, offset: 2, height: 22 },
    { kind: 'arch', at: 3.0, opening: 14, offset: 0, height: 24 },
    { kind: 'jump', at: 7.3, rampLength: 70, rampHeight: 6, gapLength: 70 },
    { kind: 'boulders', from: 9.3, to: 10.0, count: 10, radius: 3 },
    { kind: 'boostPad', at: 11.3, lateral: 0 },
  ],
  branches: [],
  palette: { sky: 0x6a9cd0, horizon: 0xf2e6d0, sand: 0xe6d8bc, road: 0xc8b490, rock: 0xe8dcc4, accent: 0xd03020, sun: 0xfff6e6, dusk: 0.15 },
};

export const bonecanyonScenery: TrackScenery = {
  mesas: 10,
  spires: 12,
  duneHeight: 5,
  scatter: 'bones',
  scatterPerKm: 10,
  oases: [],
};
