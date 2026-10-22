import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// Red-rock fangs grow out of the road; slalom them, then squeeze through the Jaw.
export const devilsteeth: TrackDef = {
  id: 'devilsteeth',
  name: "Devil's Teeth",
  blurb: 'Slalom a forest of red fangs, then thread the Jaw at fourteen metres wide.',
  difficulty: 4,
  laps: 3,
  seed: 606,
  width: 34,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 0, z: -700, y: 0 },
    { x: -100, z: -1400, y: 4 },
    { x: 100, z: -1900, y: 8 },
    { x: 600, z: -2100, y: 10 },
    { x: 1000, z: -1800, y: 10 },
    { x: 1100, z: -1300, y: 8 },
    { x: 1500, z: -1000, y: 6 },
    { x: 2000, z: -1100, y: 6 },
    { x: 2300, z: -700, y: 4 },
    { x: 2200, z: -100, y: 2 },
    { x: 1800, z: 300, y: 0 },
    { x: 1200, z: 400, y: 0 },
    { x: 700, z: 200, y: 0 },
    { x: 300, z: 450, y: 0 },
  ],
  features: [
    { kind: 'pillar', at: 0.5, lateral: -6, radius: 3 },
    { kind: 'pillar', at: 0.6, lateral: 7, radius: 3.5 },
    { kind: 'pillar', at: 0.7, lateral: -4, radius: 3 },
    { kind: 'pillar', at: 0.8, lateral: 8, radius: 4 },
    { kind: 'pillar', at: 0.9, lateral: -8, radius: 3 },
    { kind: 'canyon', from: 5.1, to: 5.9, wallHeight: 45 },
    { kind: 'narrow', from: 5.2, to: 5.8, width: 14, blend: 50 },
    { kind: 'kicker', at: 7.4, length: 40, height: 2.5 },
    { kind: 'pillar', at: 9.3, lateral: 5, radius: 4 },
    { kind: 'pillar', at: 9.4, lateral: -6, radius: 3 },
    { kind: 'pillar', at: 9.5, lateral: 6, radius: 3 },
    { kind: 'pillar', at: 9.6, lateral: -2, radius: 5 },
    { kind: 'pillar', at: 9.7, lateral: 9, radius: 3 },
    { kind: 'pillar', at: 9.8, lateral: -8, radius: 3.5 },
    { kind: 'boulders', from: 11.3, to: 11.9, count: 8, radius: 2.5 },
    { kind: 'boostPad', at: 12.5, lateral: 0 },
  ],
  palette: { sky: 0x5a8cc8, horizon: 0xeab088, sand: 0xc8784a, road: 0xa86a48, rock: 0x8a3020, accent: 0xffd040, sun: 0xffe6c0, dusk: 0.3 },
};

export const devilsteethScenery: TrackScenery = {
  mesas: 8,
  spires: 20,
  duneHeight: 5,
  scatter: 'rocks',
  scatterPerKm: 20,
  oases: [],
};
