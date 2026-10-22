import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// A sandstorm rolling over the badlands: every hazard in the book, packed tight.
export const stormfront: TrackDef = {
  id: 'stormfront',
  name: 'Stormfront',
  blurb: 'The storm is coming in. Chasms, fangs, the Needle arch and a black bore. Survive.',
  difficulty: 5,
  laps: 3,
  seed: 808,
  width: 32,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 0, z: -800, y: 0 },
    { x: 100, z: -1500, y: 8 },
    { x: 500, z: -1900, y: 16 },
    { x: 1100, z: -1900, y: 20 },
    { x: 1500, z: -1500, y: 18 },
    { x: 1500, z: -900, y: 14 },
    { x: 1900, z: -600, y: 10 },
    { x: 2400, z: -800, y: 8 },
    { x: 2800, z: -400, y: 6 },
    { x: 2700, z: 200, y: 4 },
    { x: 2200, z: 500, y: 2 },
    { x: 1600, z: 400, y: 0 },
    { x: 1000, z: 600, y: 0 },
    { x: 400, z: 500, y: 0 },
  ],
  features: [
    { kind: 'jump', at: 0.4, rampLength: 80, rampHeight: 6, gapLength: 70 },
    { kind: 'canyon', from: 1.5, to: 3.3, wallHeight: 55 },
    { kind: 'narrow', from: 1.6, to: 3.2, width: 20, blend: 60 },
    { kind: 'arch', at: 2.2, opening: 11, offset: 4, height: 20 },
    { kind: 'pillar', at: 2.5, lateral: -3, radius: 3 },
    { kind: 'arch', at: 2.8, opening: 11, offset: -4, height: 20 },
    { kind: 'tunnel', from: 5.2, to: 5.9, ceiling: 13 },
    { kind: 'boulders', from: 6.3, to: 6.9, count: 10, radius: 3 },
    { kind: 'pillar', at: 8.3, lateral: -6, radius: 3 },
    { kind: 'pillar', at: 8.4, lateral: 6, radius: 3 },
    { kind: 'pillar', at: 8.5, lateral: -2, radius: 4 },
    { kind: 'pillar', at: 8.6, lateral: 8, radius: 3 },
    { kind: 'narrow', from: 8.75, to: 8.95, width: 13, blend: 40 },
    { kind: 'kicker', at: 10.3, length: 40, height: 3 },
    { kind: 'jump', at: 12.2, rampLength: 80, rampHeight: 6, gapLength: 75 },
    { kind: 'boostPad', at: 13.6, lateral: 0 },
  ],
  palette: { sky: 0x3a3a4e, horizon: 0xb48a62, sand: 0xa8805a, road: 0x8e6c4a, rock: 0x5e3a30, accent: 0xffc820, sun: 0xffb070, dusk: 0.7 },
};

export const stormfrontScenery: TrackScenery = {
  mesas: 12,
  spires: 16,
  duneHeight: 7,
  scatter: 'rocks',
  scatterPerKm: 16,
  oases: [],
};
