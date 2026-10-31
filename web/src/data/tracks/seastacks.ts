import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// Afternoon among the sea stacks, raced clockwise: through the bay bends, slalom the rock
// fingers across the lagoon (or skim round them) and light over the rise into the stack
// corner, up and through Gull Head and out of its bore straight into the cliff left. Down the
// cliff esses to the gull hairpin, over the kicker and the headland esses, inland round the
// arch bay while the Arch Gap threads the stacks along the shore, then leap the two tide
// channels, through the tide chicane, and the freighter on the harbour road.
// Points are generated (arcs and straights) with their heights; the comments name the sections.
export const seastacks: TrackDef = {
  id: 'seastacks',
  name: 'Sea Stacks',
  blurb: 'Slalom the stacks, bore through Gull Head into a left, leap the tide channels.',
  difficulty: 3,
  course: 'circuit',
  laps: 3,
  seed: 1404,
  width: 46,
  runoff: 50,
  floor: 'water',
  points: [
    { x: 0, z: 0, y: 2 }, // 0: start straight
    { x: 130, z: 0, y: 2 },
    { x: 260, z: 0, y: 2 },
    { x: 390, z: 0, y: 2 },
    { x: 520, z: 0, y: 4 },
    { x: 650, z: 0, y: 7 }, // 5: bay bend L
    { x: 665.6, z: -1.4, y: 4.9 },
    { x: 680.8, z: -5.4, y: 3.8 },
    { x: 695, z: -12.1, y: 3.4 },
    { x: 824.9, z: -87.1, y: 2 }, // 9: bay bend R
    { x: 839.1, z: -93.7, y: 2 },
    { x: 854.3, z: -97.7, y: 2 },
    { x: 869.9, z: -99.1, y: 2 }, // 12: stack field
    { x: 994.9, z: -99.1, y: 2 },
    { x: 1119.9, z: -99.1, y: 2 },
    { x: 1244.9, z: -99.1, y: 2 },
    { x: 1369.9, z: -99.1, y: 2 },
    { x: 1494.9, z: -99.1, y: 3.3 },
    { x: 1619.9, z: -99.1, y: 7 }, // 18: stack R
    { x: 1629.8, z: -98.3, y: 6.2 },
    { x: 1639.4, z: -96, y: 4.8 },
    { x: 1648.5, z: -92.1, y: 4 },
    { x: 1656.9, z: -86.8, y: 4.4 },
    { x: 1664.4, z: -80.3, y: 5.2 },
    { x: 1670.7, z: -72.7, y: 6 }, // 24: gull climb
    { x: 1728, z: 9.2, y: 11.1 },
    { x: 1785.4, z: 91.2, y: 18 },
    { x: 1842.8, z: 173.1, y: 26 }, // 27: gull head
    { x: 1890.9, z: 241.9, y: 29.9 },
    { x: 1939.1, z: 310.7, y: 32.7 },
    { x: 1987.3, z: 379.5, y: 34.4 },
    { x: 2035.5, z: 448.3, y: 35 },
    { x: 2083.7, z: 517.1, y: 32.5 }, // 32: cliff L
    { x: 2091.5, z: 526.5, y: 32 },
    { x: 2100.9, z: 534.3, y: 31.4 },
    { x: 2111.4, z: 540.4, y: 31 },
    { x: 2122.9, z: 544.6, y: 30.7 },
    { x: 2134.9, z: 546.7, y: 30.4 },
    { x: 2147.1, z: 546.7, y: 30 }, // 38: cliff descent
    { x: 2241.7, z: 538.4, y: 25.2 },
    { x: 2336.4, z: 530.1, y: 22 },
    { x: 2431, z: 521.9, y: 23 },
    { x: 2525.7, z: 513.6, y: 24 }, // 42: cliff esses R
    { x: 2538.7, z: 513.6, y: 22.1 },
    { x: 2551.6, z: 515.8, y: 20.4 },
    { x: 2563.9, z: 520.3, y: 19.4 }, // 45: cliff esses L
    { x: 2576.2, z: 524.8, y: 18.7 },
    { x: 2589.1, z: 527.1, y: 18.2 },
    { x: 2602.1, z: 527.1, y: 18 }, // 48: cliff run
    { x: 2718.4, z: 516.9, y: 17.2 },
    { x: 2834.6, z: 506.7, y: 16.8 },
    { x: 2950.8, z: 496.6, y: 16 }, // 51: gull hairpin R
    { x: 2960.4, z: 496.6, y: 15.8 },
    { x: 2969.8, z: 498.2, y: 15.4 },
    { x: 2978.8, z: 501.5, y: 14.9 },
    { x: 2987.1, z: 506.3, y: 14.3 },
    { x: 2994.5, z: 512.5, y: 13.7 },
    { x: 3000.6, z: 519.8, y: 13.1 },
    { x: 3005.4, z: 528.1, y: 12.5 },
    { x: 3008.7, z: 537.1, y: 12 },
    { x: 3010.4, z: 546.6, y: 11.6 },
    { x: 3010.4, z: 556.1, y: 11.1 },
    { x: 3008.7, z: 565.6, y: 10.7 },
    { x: 3005.4, z: 574.6, y: 10.3 },
    { x: 3000.6, z: 582.9, y: 9.9 },
    { x: 2994.5, z: 590.2, y: 9.6 },
    { x: 2987.1, z: 596.4, y: 9.3 },
    { x: 2978.8, z: 601.2, y: 9 }, // 67: kicker run
    { x: 2906.3, z: 635, y: 7.2 },
    { x: 2833.8, z: 668.8, y: 6.2 },
    { x: 2761.3, z: 702.6, y: 7 },
    { x: 2688.8, z: 736.4, y: 11 }, // 71: headland esses L
    { x: 2679.5, z: 741.7, y: 9 },
    { x: 2671.1, z: 748.3, y: 7 },
    { x: 2663.8, z: 756.1, y: 7.2 },
    { x: 2657.8, z: 764.9, y: 7.8 }, // 75: headland esses R
    { x: 2650.8, z: 774.9, y: 8.6 },
    { x: 2642.1, z: 783.5, y: 9.4 },
    { x: 2632.2, z: 790.5, y: 9.9 },
    { x: 2621.1, z: 795.7, y: 9.9 },
    { x: 2609.3, z: 798.8, y: 9.6 },
    { x: 2597.2, z: 799.9, y: 8.9 },
    { x: 2585, z: 798.8, y: 8.1 }, // 82: headland esses L2
    { x: 2573.6, z: 797.7, y: 7.3 },
    { x: 2562.2, z: 798.3, y: 6.7 },
    { x: 2551, z: 800.7, y: 6.2 },
    { x: 2540.3, z: 804.7, y: 6 }, // 86: arch run
    { x: 2454.2, z: 844.8, y: 6.6 },
    { x: 2368.1, z: 885, y: 8 },
    { x: 2282, z: 925.1, y: 9.4 },
    { x: 2195.9, z: 965.3, y: 10 }, // 90: arch notch R
    { x: 2186.6, z: 968.7, y: 9.4 },
    { x: 2176.9, z: 970.7, y: 8.1 },
    { x: 2167, z: 971, y: 7 },
    { x: 2157.1, z: 969.8, y: 6.1 },
    { x: 2147.6, z: 967, y: 5.4 },
    { x: 2138.7, z: 962.8, y: 5 },
    { x: 2052.1, z: 912.8, y: 4.5 }, // 97: arch sweeper L
    { x: 1988.9, z: 883.3, y: 4.3 },
    { x: 1921.5, z: 865.3, y: 4.1 },
    { x: 1852.1, z: 859.2, y: 4 },
    { x: 1782.6, z: 865.3, y: 4 },
    { x: 1715.3, z: 883.3, y: 4 },
    { x: 1652.1, z: 912.8, y: 4 },
    { x: 1595, z: 952.8, y: 4 },
    { x: 1545.7, z: 1002.1, y: 4.1 },
    { x: 1505.7, z: 1059.2, y: 4.3 },
    { x: 1476.2, z: 1122.4, y: 4.5 },
    { x: 1458.2, z: 1189.7, y: 5 },
    { x: 1440.8, z: 1288.2, y: 9 }, // 109: arch exit R
    { x: 1438.3, z: 1297.8, y: 8.4 },
    { x: 1434.3, z: 1306.9, y: 7.2 },
    { x: 1428.9, z: 1315.2, y: 6 },
    { x: 1422.3, z: 1322.6, y: 4.8 },
    { x: 1414.6, z: 1328.8, y: 3.6 },
    { x: 1405.9, z: 1333.6, y: 3 }, // 115: tide run
    { x: 1306.2, z: 1380.1, y: 2.1 },
    { x: 1206.5, z: 1426.6, y: 2 }, // 117: tide causeway
    { x: 1157.1, z: 1449.7, y: 2 },
    { x: 1107.7, z: 1472.7, y: 2 },
    { x: 1058.2, z: 1495.8, y: 2 },
    { x: 1008.8, z: 1518.8, y: 2 }, // 121: channel bend R
    { x: 946.6, z: 1541.5, y: 2 },
    { x: 881.3, z: 1553, y: 2 },
    { x: 815.1, z: 1553, y: 2 },
    { x: 749.8, z: 1541.5, y: 2 },
    { x: 687.6, z: 1518.8, y: 2 },
    { x: 630.2, z: 1485.7, y: 2 },
    { x: 579.5, z: 1443.1, y: 2 }, // 128: tide channel
    { x: 476.2, z: 1339.8, y: 2 },
    { x: 372.8, z: 1236.5, y: 2 },
    { x: 269.5, z: 1133.2, y: 2 },
    { x: 166.2, z: 1029.8, y: 2 },
    { x: 62.9, z: 926.5, y: 2.4 },
    { x: -40.5, z: 823.2, y: 8 }, // 134: tide chicane L
    { x: -48.1, z: 816.6, y: 6.1 },
    { x: -56.7, z: 811.3, y: 4 },
    { x: -65.9, z: 807.3, y: 3.6 },
    { x: -75.7, z: 804.8, y: 3.3 }, // 138: tide chicane R
    { x: -85.4, z: 802.3, y: 3.1 },
    { x: -94.7, z: 798.4, y: 3 },
    { x: -103.2, z: 793.1, y: 3 },
    { x: -110.9, z: 786.5, y: 3 }, // 142: channel end
    { x: -193.4, z: 704, y: 3 },
    { x: -275.9, z: 621.5, y: 3.4 },
    { x: -358.4, z: 539, y: 9 }, // 145: harbour R
    { x: -365.3, z: 530.7, y: 8 },
    { x: -370.7, z: 521.4, y: 5.8 },
    { x: -374.4, z: 511.2, y: 4 },
    { x: -376.3, z: 500.6, y: 3 },
    { x: -376.3, z: 489.8, y: 2.3 },
    { x: -374.4, z: 479.1, y: 2 }, // 151: freighter run
    { x: -345.3, z: 370.5, y: 2.1 },
    { x: -316.2, z: 261.8, y: 2.4 },
    { x: -287.1, z: 153.1, y: 2.8 },
    { x: -258, z: 44.5, y: 3 }, // 155: final hairpin R
    { x: -254.7, z: 35.2, y: 3 },
    { x: -249.9, z: 26.7, y: 3 },
    { x: -243.8, z: 19, y: 3 },
    { x: -236.5, z: 12.4, y: 3 },
    { x: -228.3, z: 7.1, y: 2.8 },
    { x: -219.3, z: 3.2, y: 2.5 },
    { x: -209.8, z: 0.8, y: 2.2 },
    { x: -200, z: 0, y: 2 }, // 163: last
    { x: -100, z: 0, y: 2 },
  ],
  features: [
    // Boost cells cost line: S-chains on the straights, strings wide of the apexes and one
    // string across the road; none sits on the racing line.
    { kind: 'boostCells', at: 1, lateral: -14, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 1.75, lateral: 14, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 2.5, lateral: -14, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 3.25, lateral: 14, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 4, lateral: -14, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 69.4, lateral: -17, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 69.67, lateral: -6, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 69.93, lateral: 6, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 70.2, lateral: 17, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 101.4, lateral: 37, count: 4, spacing: 26 },
    { kind: 'boostCells', at: 120, lateral: -14, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 120.2, lateral: 14, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 120.4, lateral: -14, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 120.6, lateral: 14, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 120.8, lateral: -14, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 123.1, lateral: -18, count: 4, spacing: 26 },
    { kind: 'boostCells', at: 153.8, lateral: 30, count: 4, spacing: 26 },
    // The stacks stand in the road: slalom them or skim round.
    { kind: 'pillar', at: 14.4, lateral: -14, radius: 4 },
    { kind: 'pillar', at: 15, lateral: 6, radius: 3.5 },
    { kind: 'pillar', at: 15.6, lateral: -10, radius: 4.5 },
    { kind: 'pillar', at: 16.2, lateral: 10, radius: 3.5 },
    { kind: 'pillar', at: 16.8, lateral: -4, radius: 4 },
    { kind: 'boostPad', at: 13.2, lateral: 0 },
    { kind: 'boostPad', at: 24.9, lateral: 0 },
    // Gull Head: bored through, out into the light and straight into the cliff left.
    { kind: 'tunnel', from: 27.4, to: 32, ceiling: 15 },
    { kind: 'narrow', from: 27, to: 32.3, width: 30, blend: 70 },
    { kind: 'kicker', at: 68, length: 40, height: 2.5 },
    { kind: 'boostPad', at: 116.2, lateral: 0 },
    // The two tide channels.
    { kind: 'jump', at: 117.48, rampLength: 70, rampHeight: 5, gapLength: 50 },
    { kind: 'jump', at: 128.3, rampLength: 70, rampHeight: 5, gapLength: 55 },
    { kind: 'boostPad', at: 117.08, lateral: 0 },
    { kind: 'boostPad', at: 117.12, lateral: 0 },
    // A freighter steams out of the harbour channel across the causeway: only the seaward half
    // of the road stays open while her hull is across.
    {
      kind: 'hazard',
      hazard: { type: 'blocker', id: 'freighter', at: 152.8, opening: 24, offset: -12, height: 12, warn: 6, up: 5, period: 22, phase: 4 },
    },
    // Tight corners keep their inside run-off short, so the sand never folds over itself.
    { kind: 'runoff', from: 17.6, to: 24.4, amount: 20, side: 1 },
    { kind: 'runoff', from: 31.6, to: 38.4, amount: 20, side: -1 },
    { kind: 'runoff', from: 4.6, to: 8.4, amount: 24, side: -1 },
    { kind: 'runoff', from: 8.6, to: 12.4, amount: 24, side: 1 },
    { kind: 'runoff', from: 41.6, to: 45.4, amount: 24, side: 1 },
    { kind: 'runoff', from: 44.6, to: 48.4, amount: 24, side: -1 },
    { kind: 'runoff', from: 50.6, to: 67.4, amount: 14, side: 1 },
    { kind: 'runoff', from: 67, to: 70.2, amount: 22, side: 1 },
    { kind: 'runoff', from: 70.6, to: 75.4, amount: 22, side: -1 },
    { kind: 'runoff', from: 74.6, to: 82.4, amount: 20, side: 1 },
    { kind: 'runoff', from: 81.6, to: 86.4, amount: 22, side: -1 },
    { kind: 'runoff', from: 89.6, to: 96.4, amount: 20, side: 1 },
    { kind: 'runoff', from: 108.6, to: 115.4, amount: 20, side: 1 },
    { kind: 'runoff', from: 144.6, to: 151.4, amount: 20, side: 1 },
    { kind: 'runoff', from: 133.6, to: 138.4, amount: 22, side: -1 },
    { kind: 'runoff', from: 137.6, to: 142.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 154.6, to: 163.4, amount: 18, side: 1 },
  ],
  branches: [
    {
      id: 'archgap',
      kind: 'shortcut',
      name: 'Arch Gap',
      side: -1,
      from: 87.8,
      to: 116,
      width: 20,
      runoff: 0,
      points: [
        { x: 2210, z: 1003, y: 8 },
        { x: 1944, z: 1127, y: 6 },
        { x: 1679, z: 1251, y: 5 },
        { x: 1413, z: 1375, y: 4 },
      ],
      features: [
        // Threading the arches, then fallen stack rubble.
        { kind: 'arch', at: 2.6, opening: 12, offset: -3, height: 12 },
        { kind: 'arch', at: 3.0, opening: 12, offset: 3, height: 12 },
        { kind: 'rough', from: 3.3, to: 4.3, amount: 0.8 },
        { kind: 'boulders', from: 3.5, to: 4.1, count: 3, radius: 1.3 },
      ],
    },
  ],
  palette: { sky: 0x2a78d0, horizon: 0xc4e6f0, sand: 0xe8d6b0, road: 0xb0a898, rock: 0x7a6a5a, accent: 0xff3a6a, sun: 0xfff2d8, dusk: 0.15 },
};

export const seastacksScenery: TrackScenery = {
  biome: 'beach',
  boundary: 'rock',
  lagoons: [
    { from: 0.2, to: 18 },
    { from: 117, to: 134 },
  ],
  land: 0.3,
  landHeight: 8,
  islands: 10,
  stacks: 18,
  palmsPerKm: 12,
  hutsPerKm: 2,
  road: 'causeway',
  landmarks: [
    { kind: 'grandstand', at: 0.05, side: -1, distance: -148, straddle: true },
    { kind: 'regatta', at: 14.4, side: -1, distance: 180, afloat: true },
    { kind: 'cliffVillage', at: 25.5, side: 1, distance: 10, scale: 1.2 },
    { kind: 'lighthouse', at: 49.2, side: -1, distance: 40, afloat: true },
    { kind: 'whales', at: 131, side: 1, distance: 300, afloat: true },
    { kind: 'cruiseliner', at: 152.8, side: -1, distance: 30, afloat: true, scale: 0.35, hazard: 'freighter' },
  ],
};
