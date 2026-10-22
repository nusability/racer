import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// Climb onto the high plateau among the wind turbines, bore through the summit, brake for the
// cliff hairpin, then fall back to the desert floor over a ladder of kickers.
export const mirageh: TrackDef = {
  id: 'mirageh',
  name: 'Mirage Heights',
  blurb: 'Climb past the wind farm, bore through the summit, and brake for the Cliff Hairpin.',
  difficulty: 4,
  laps: 3,
  seed: 707,
  width: 44,
  runoff: 45,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 0, z: -750, y: 10 },
    { x: 100, z: -1400, y: 40 },
    { x: 500, z: -1900, y: 75 },
    { x: 1100, z: -2050, y: 100 },
    { x: 1650, z: -1850, y: 120 },
    { x: 1950, z: -1300, y: 130 },
    { x: 2000, z: -650, y: 130 },
    { x: 1950, z: -300, y: 128 },
    { x: 1850, z: -130, y: 127 },
    { x: 1650, z: -100, y: 126 },
    { x: 1530, z: -250, y: 122 },
    { x: 1450, z: -800, y: 100 },
    { x: 1050, z: -1150, y: 75 },
    { x: 650, z: -900, y: 45 },
    { x: 550, z: -350, y: 20 },
    { x: 450, z: 300, y: 8 },
    { x: 390, z: 480, y: 4 },
    { x: 225, z: 550, y: 2 },
    { x: 60, z: 470, y: 1 },
  ],
  features: [
    { kind: 'boostPad', at: 0.3, lateral: 0 },
    { kind: 'tunnel', from: 5.3, to: 6.4, ceiling: 16 },
    { kind: 'narrow', from: 5.2, to: 6.5, width: 32, blend: 80 },
    { kind: 'walls', from: 8.3, to: 10.7, side: 1 },
    { kind: 'kicker', at: 13.4, length: 40, height: 2 },
    { kind: 'kicker', at: 14.4, length: 40, height: 2 },
    { kind: 'kicker', at: 15.4, length: 40, height: 2.5 },
    { kind: 'boostPad', at: 16.5, lateral: 0 },
  ],
  branches: [
    {
      id: 'cliffleap',
      name: 'Cliff Leap',
      side: -1,
      from: 12.15,
      to: 15.2,
      width: 20,
      runoff: 0,
      points: [
        { x: 1270, z: -985, y: 90 },
        { x: 1150, z: -1010, y: 84 },
        { x: 1030, z: -910, y: 74 },
        { x: 800, z: -630, y: 48 },
        { x: 630, z: -410, y: 28 },
      ],
      features: [
        { kind: 'boostPad', at: 3.85, lateral: 0 },
        { kind: 'jump', at: 4.0, rampLength: 100, rampHeight: 3, gapLength: 35 },
      ],
    },
  ],
  palette: { sky: 0x4a7ec0, horizon: 0xf0b878, sand: 0xd8a060, road: 0xb88050, rock: 0x9a5030, accent: 0xff3a5a, sun: 0xffe0b0, dusk: 0.45 },
};

export const miragehScenery: TrackScenery = {
  mesas: 14,
  spires: 10,
  duneHeight: 8,
  scatter: 'rocks',
  scatterPerKm: 10,
  boundary: 'rock',
  oases: [],
  landmarks: [
    { kind: 'grandstand', at: 0.1, side: 1, distance: 15 },
    { kind: 'windfarm', at: 4.0, side: -1, distance: 60 },
    { kind: 'cliffVillage', at: 9.6, side: -1, distance: 40 },
    { kind: 'colossus', at: 14.5, side: -1, distance: 150 },
    { kind: 'balloons', at: 2.0, side: 1, distance: 200 },
  ],
};
