import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// A storm rolling in over a smoking volcano: black-sand beaches, a climb round the crater's
// flank, stacks in the surf and two cuts that leap the lava-black channels.
export const volcanoisle: TrackDef = {
  id: 'volcanoisle',
  name: 'Volcano Isle',
  blurb: 'Storm surf, black sand and a smoking crater. Climb the flank, leap the channels.',
  difficulty: 5,
  laps: 3,
  seed: 1606,
  width: 42,
  runoff: 35,
  points: [
    { x: 0, z: 0, y: 2.5 },
    { x: 0, z: -706, y: 4 },
    { x: 166, z: -1328, y: 20 },
    { x: 581, z: -1784, y: 45 },
    { x: 1162, z: -1950, y: 70 },
    { x: 1743, z: -1743, y: 90 },
    { x: 2034, z: -1245, y: 95 },
    { x: 1950, z: -706, y: 80 },
    { x: 2282, z: -290, y: 55 },
    { x: 2739, z: -166, y: 30 },
    { x: 2864, z: 374, y: 12 },
    { x: 2407, z: 706, y: 4 },
    { x: 1702, z: 581, y: 2.5 },
    { x: 1038, z: 706, y: 2.5 },
    { x: 415, z: 498, y: 2.5 },
  ],
  features: [],
  branches: [],
  palette: { sky: 0x2a3240, horizon: 0x7a8890, sand: 0x5a524c, road: 0x6a625a, rock: 0x3a3230, accent: 0xff5a1a, sun: 0xffb080, dusk: 0.6 },
};

export const volcanoisleScenery: TrackScenery = {
  biome: 'beach',
  boundary: 'rock',
  lagoons: [{ from: 12.2, to: 13.8 }],
  land: 0.4,
  landHeight: 10,
  islands: 6,
  stacks: 14,
  palmsPerKm: 6,
  hutsPerKm: 1,
  road: 'causeway',
  landmarks: [],
};
