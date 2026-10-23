// Synthetic tracks for the headless sim check, so every simulation path is exercised without
// waiting for real tracks. The loop has wide sand run-off, a walled canyon, a tunnel, a jump,
// a boulder field, a pillar to choose a side of, boost pads and cells, a vertical loop, a
// corkscrew, an open drop edge, a slick patch, repair cells, one of each hazard, and a
// shortcut branch with its own boulders and cells. The figure-8 has a flat crossing.

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
    { kind: 'loop', at: 0.62, radius: 26, span: 60, shift: 9, settle: 80 },
    { kind: 'corkscrew', from: 4.05, to: 4.2, turns: 1 },
    { kind: 'drop', from: 7.0, to: 7.4, side: 1 },
    { kind: 'slick', from: 6.7, to: 6.95, grip: 0.5 },
    { kind: 'repairCells', at: 5.95, lateral: 0, count: 3, spacing: 30 },
    { kind: 'hazard', hazard: { type: 'sweeper', id: 'beast', at: 2.1, radius: 6, height: 10, xFrom: -40, xTo: 40, cross: 4, hold: 1, period: 14, phase: 0 } },
    { kind: 'hazard', hazard: { type: 'dropper', id: 'digger', from: 6.2, to: 6.6, count: 4, radius: 3, period: 9, warn: 1.5, stay: 4, phase: 2 } },
    { kind: 'hazard', hazard: { type: 'blocker', id: 'gate', at: 8.5, opening: 14, offset: 0, height: 8, warn: 1.5, up: 4, period: 12, phase: 3 } },
    { kind: 'hazard', hazard: { type: 'gust', id: 'downdraft', from: 3.0, to: 3.15, strength: 40, on: 3, period: 7, phase: 0 } },
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

/**
 * A figure-8 (a lemniscate of Bernoulli sampled at twelve points) that crosses itself at road
 * level in the middle: the flat crossing's cross traffic.
 */
const LEMNISCATE_SCALE = 1300;
const LEMNISCATE_POINTS = 12;
const figure8Points = Array.from({ length: LEMNISCATE_POINTS }, (_, k) => {
  const t = (2 * Math.PI * k) / LEMNISCATE_POINTS;
  const d = 1 + Math.sin(t) ** 2;
  return { x: (LEMNISCATE_SCALE * Math.cos(t)) / d, z: (LEMNISCATE_SCALE * Math.sin(t) * Math.cos(t)) / d, y: 0 };
});

export const simFigure8: TrackDef = {
  id: 'simeight',
  name: 'Sim Figure Eight',
  blurb: 'Synthetic figure-8 with a flat crossing.',
  difficulty: 2,
  laps: 3,
  seed: 808,
  width: 30,
  runoff: 20,
  points: figure8Points,
  // The lemniscate passes the origin at t = π/2 and 3π/2: control points 3 and 9.
  features: [{ kind: 'crossing', at: 3, other: 9, style: 'flat' }],
  branches: [],
  palette: simTestTrack.palette,
};
