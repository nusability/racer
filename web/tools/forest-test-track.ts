// Dev-only test scene for Elderwood (biome `forest`), built before its real tracks exist: a
// winding loop through the giants with one of each hazard bound to its set-F landmark, the
// other six landmarks beside the course, trunk pillars on the road, a ravine, a lumber-town
// clearing and a glade. Never in a world, a cup or quick race: the level viewer and a dev
// build reach it by id (ui/devTracks.ts). The by-day and dusk versions share the course.

import type { TrackDef, TrackPalette } from '../src/core/types.ts';
import type { ForestScenery } from '../src/data/tracks/scenery.ts';

/** Under the canopy by day: pale sky in the gaps, a green-grey mist, mossy floor, a pale earth trail. */
const DAY: TrackPalette = { sky: 0x8fb4c4, horizon: 0x7a9484, sand: 0x5a4e32, road: 0x8c6c48, rock: 0x6a6e62, accent: 0x7ff0c0, sun: 0xdcd0a8, dusk: 0.15 };
/** Late in the day: blue-green mist, the woods going dark, a low orange sun in the gaps. */
const DUSK: TrackPalette = { sky: 0x2c3c56, horizon: 0x4c6a76, sand: 0x3a3a26, road: 0x76583e, rock: 0x4a5250, accent: 0x8affd8, sun: 0xffb070, dusk: 0.75 };

const course: Omit<TrackDef, 'id' | 'name' | 'blurb' | 'palette'> = {
  difficulty: 2,
  course: 'circuit',
  laps: 2,
  seed: 6060,
  width: 18,
  runoff: 0,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 0, z: -400, y: 2 },
    { x: 60, z: -800, y: 6 },
    { x: 220, z: -1150, y: 10 },
    { x: 480, z: -1350, y: 12 },
    { x: 800, z: -1400, y: 10 },
    { x: 1100, z: -1300, y: 8 },
    { x: 1300, z: -1050, y: 6 },
    { x: 1350, z: -700, y: 4 },
    { x: 1250, z: -380, y: 3 },
    { x: 1300, z: -60, y: 5 },
    { x: 1500, z: 220, y: 9 },
    { x: 1650, z: 560, y: 12 },
    { x: 1550, z: 900, y: 10 },
    { x: 1250, z: 1080, y: 7 },
    { x: 900, z: 1100, y: 5 },
    { x: 600, z: 950, y: 4 },
    { x: 450, z: 650, y: 3 },
    { x: 250, z: 450, y: 2 },
    { x: 60, z: 300, y: 1 },
  ],
  features: [
    { kind: 'boostPad', at: 0.3, lateral: 0 },
    { kind: 'boostCells', at: 1.6, lateral: -5, count: 4, spacing: 30 },
    { kind: 'hazard', hazard: { type: 'blocker', id: 'fallen', at: 2.6, opening: 10, offset: -4, height: 6, warn: 4, up: 5, period: 18, phase: 0 } },
    // Giant trunks standing in the trail: pick a side.
    { kind: 'narrow', from: 4.1, to: 4.75, width: 26, blend: 70 },
    { kind: 'pillar', at: 4.3, lateral: -6, radius: 3 },
    { kind: 'pillar', at: 4.55, lateral: 6.5, radius: 3 },
    { kind: 'hazard', hazard: { type: 'sweeper', id: 'herd', at: 6.5, radius: 6, height: 10, xFrom: -70, xTo: 70, cross: 6, hold: 2, period: 26, phase: 4 } },
    // A mossy ravine.
    { kind: 'narrow', from: 7.3, to: 8.4, width: 26, blend: 60 },
    { kind: 'canyon', from: 7.4, to: 8.3, wallHeight: 24 },
    { kind: 'boostPad', at: 8.6, lateral: 0 },
    { kind: 'hazard', hazard: { type: 'dropper', id: 'logs', from: 9.25, to: 9.6, count: 4, radius: 3.2, period: 11, warn: 2.6, stay: 3, phase: 1 } },
    { kind: 'repairCells', at: 10.4, lateral: 5, count: 3, spacing: 28 },
    { kind: 'hazard', hazard: { type: 'gust', id: 'gap', from: 12.3, to: 12.7, strength: 10, on: 6, period: 16, phase: 2 } },
    { kind: 'narrow', from: 13.4, to: 13.8, width: 26, blend: 70 },
    { kind: 'pillar', at: 13.6, lateral: 0, radius: 4 },
    { kind: 'boostCells', at: 15.6, lateral: 0, count: 5, spacing: 30 },
    { kind: 'boostPad', at: 18.5, lateral: 0 },
  ],
  branches: [],
};

const scenery: ForestScenery = {
  biome: 'forest',
  boundary: 'trunks',
  road: 'trail',
  trunkRadius: [1.6, 3],
  giantsPerKm: 4,
  trunkGap: [1.5, 10],
  woodsPerHa: 50,
  forestDepth: 400,
  treeHeight: 100,
  canopy: 0.75,
  undergrowth: 1,
  mist: 0.6,
  lanternsPerKm: 0,
  shaftsPerKm: 9,
  clearings: [
    { from: 15.2, to: 16.9, style: 'town' },
    { from: 18.1, to: 18.9, style: 'glade' },
  ],
  landmarks: [
    { kind: 'fallingTree', at: 2.6, side: 1, distance: 4, hazard: 'fallen' },
    { kind: 'herd', at: 6.5, side: -1, distance: 20, hazard: 'herd' },
    { kind: 'logSlide', at: 9.42, side: 1, distance: 6, hazard: 'logs' },
    { kind: 'windRoar', at: 12.5, side: -1, distance: 10, hazard: 'gap' },
    { kind: 'treeVillage', at: 1.2, side: -1, distance: 30 },
    { kind: 'ropeBridge', at: 3.7, side: -1, distance: 8 },
    { kind: 'waterfall', at: 8.9, side: -1, distance: 40 },
    { kind: 'ruins', at: 11.2, side: -1, distance: 25 },
    { kind: 'glowGrove', at: 14.3, side: 1, distance: 20 },
    { kind: 'lumberTown', at: 16.05, side: 1, distance: 6 },
  ],
};

export const forestTest: TrackDef = { ...course, id: 'elderwoodtest', name: 'Elderwood Test', blurb: 'Dev test loop through the giants, by day.', palette: DAY };
export const forestTestDusk: TrackDef = { ...course, id: 'elderwooddusk', name: 'Elderwood Test (dusk)', blurb: 'Dev test loop through the giants, at dusk.', palette: DUSK };
export const forestTestScenery: ForestScenery = scenery;
