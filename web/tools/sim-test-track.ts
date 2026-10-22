// A synthetic track for the headless sim check: wide open sand run-off, a walled canyon, a
// tunnel, a jump, a boulder field and a pillar to choose a side of, boost pads and cells (on
// and off the line), and one shortcut branch with its own boulders and cells. It exercises every simulation path without waiting for real tracks.

import type { TrackDef } from '../src/core/types.ts';

export const simTestTrack: TrackDef = {
  id: 'simtest',
  name: 'Sim Test Loop',
  blurb: 'Synthetic loop for the headless simulation check.',
  difficulty: 3,
  laps: 3,
  seed: 4242,
  width: 40,
  runoff: 50,
  points: [
    { x: 0, z: 0, y: 0 },
    { x: 0, z: -1500, y: 0 },
    { x: 300, z: -1900, y: 4 },
    { x: 1000, z: -1900, y: 6 },
    { x: 1400, z: -1500, y: 4 },
    { x: 1400, z: 0, y: 0 },
    { x: 1150, z: 350, y: 0 },
    { x: 800, z: 250, y: 0 },
    { x: 450, z: 450, y: 0 },
    { x: 150, z: 350, y: 0 },
  ],
  features: [
    { kind: 'boostPad', at: 0.1, lateral: 0 },
    { kind: 'boostPad', at: 4.1, lateral: -6 },
    { kind: 'boostCells', at: 0.55, lateral: 0, count: 4, spacing: 30 },
    { kind: 'boostCells', at: 4.6, lateral: -6, count: 5, spacing: 30 },
    { kind: 'boostCells', at: 3.2, lateral: 14, count: 5, spacing: 30 },
    { kind: 'boostCells', at: 8.3, lateral: -10, count: 4, spacing: 30 },
    { kind: 'jump', at: 0.3, rampLength: 70, rampHeight: 6, gapLength: 70 },
    { kind: 'boulders', from: 2.45, to: 2.85, count: 10, radius: 3 },
    { kind: 'dunes', from: 3.2, to: 3.8, amplitude: 3, wavelength: 150 },
    { kind: 'pillar', at: 4.3, lateral: 4, radius: 5 },
    { kind: 'canyon', from: 4.5, to: 5.2, wallHeight: 40 },
    { kind: 'narrow', from: 4.6, to: 5.1, width: 24 },
    { kind: 'tunnel', from: 5.5, to: 5.9, ceiling: 14 },
    { kind: 'kicker', at: 5.3, length: 40, height: 2.5 },
    { kind: 'arch', at: 7.5, opening: 16, offset: 4, height: 24 },
    { kind: 'walls', from: 8.2, to: 8.8 },
  ],
  branches: [
    {
      id: 'cut',
      name: 'Test Cut',
      side: 1,
      from: 0.75,
      to: 2.35,
      width: 22,
      runoff: 0,
      points: [
        { x: 110, z: -1520, y: 0 },
        { x: 290, z: -1740, y: 2 },
      ],
      features: [
        { kind: 'boulders', from: 2.2, to: 2.9, count: 6, radius: 2.5 },
        { kind: 'boostCells', at: 3.1, lateral: 0, count: 5, spacing: 25 },
      ],
    },
  ],
  palette: { sky: 0x4a8fd6, horizon: 0xf0c890, sand: 0xe0b070, road: 0xc89058, rock: 0xa0583a, accent: 0xff5a2a, sun: 0xfff0d0, dusk: 0 },
};
