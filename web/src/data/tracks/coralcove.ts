import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// The Coral Coast's first lesson, raced clockwise: the lagoon causeway and a gentle leap over
// the reef channel, then up onto the lighthouse headland, light over its crest into a left, and
// round the lighthouse hairpin at the top. Down through the dune esses past the beach party,
// along the lagoon under the air show into the whale chicane, inland round the cove (the Reef
// Run cuts straight along the reef flats outside it), and over the dune ridge into the west
// corner and the final hairpin.
// Points are generated (arcs and straights) with their heights; the comments name the sections.
export const coralcove: TrackDef = {
  id: 'coralcove',
  name: 'Coral Cove',
  blurb: 'Hop the reef channel, brake for the lighthouse hairpin, wave at the beach party.',
  difficulty: 1,
  course: 'circuit',
  laps: 3,
  seed: 1101,
  width: 54,
  runoff: 50,
  floor: 'water',
  points: [
    { x: 0, z: 0, y: 3 }, // 0: start straight
    { x: 216.7, z: 0, y: 3 },
    { x: 433.3, z: 0, y: 3 },
    { x: 650, z: 0, y: 3 }, // 3: harbour R
    { x: 662.4, z: 1, y: 3 },
    { x: 674.5, z: 4, y: 3 },
    { x: 686, z: 8.8, y: 3 },
    { x: 696.6, z: 15.4, y: 3 },
    { x: 706, z: 23.7, y: 3 },
    { x: 713.9, z: 33.3, y: 3 },
    { x: 782.7, z: 131.6, y: 3 }, // 10: harbour L
    { x: 796.2, z: 147.6, y: 3 },
    { x: 812.2, z: 161, y: 3 },
    { x: 830.3, z: 171.5, y: 3 }, // 13: reef jump straight
    { x: 946.8, z: 225.8, y: 3 },
    { x: 1063.4, z: 280.2, y: 3 },
    { x: 1179.9, z: 334.5, y: 3 },
    { x: 1296.4, z: 388.8, y: 3 },
    { x: 1412.9, z: 443.2, y: 3 },
    { x: 1529.5, z: 497.5, y: 6.6 },
    { x: 1646, z: 551.8, y: 7.5 }, // 20: regatta L
    { x: 1656.6, z: 555.7, y: 6.3 },
    { x: 1667.8, z: 557.7, y: 5.1 },
    { x: 1679.1, z: 557.7, y: 4.3 },
    { x: 1690.3, z: 555.7, y: 4 },
    { x: 1700.9, z: 551.8, y: 4.2 },
    { x: 1710.7, z: 546.2, y: 4.8 },
    { x: 1719.4, z: 538.9, y: 5.5 },
    { x: 1726.7, z: 530.2, y: 6 },
    { x: 1898.8, z: 284.5, y: 14.5 }, // 29: headland climb R
    { x: 1906.2, z: 275.7, y: 14.8 },
    { x: 1915, z: 268.3, y: 15.1 },
    { x: 1924.9, z: 262.5, y: 15.5 },
    { x: 1935.8, z: 258.6, y: 15.8 },
    { x: 1947.1, z: 256.6, y: 16.1 },
    { x: 1958.6, z: 256.6, y: 16.5 },
    { x: 1969.9, z: 258.6, y: 16.8 },
    { x: 1980.7, z: 262.5, y: 17.2 },
    { x: 1990.7, z: 268.3, y: 17.6 },
    { x: 1999.5, z: 275.7, y: 18 }, // 39: climb to crest
    { x: 2061.4, z: 337.5, y: 20.8 },
    { x: 2123.2, z: 399.4, y: 24.1 },
    { x: 2185.1, z: 461.3, y: 29.6 },
    { x: 2247, z: 523.1, y: 38 }, // 43: crest L
    { x: 2258.9, z: 533.3, y: 36.2 },
    { x: 2272.3, z: 541.5, y: 33.5 },
    { x: 2286.8, z: 547.5, y: 33 },
    { x: 2302.1, z: 551.2, y: 33.1 },
    { x: 2317.7, z: 552.4, y: 33.2 }, // 48: lighthouse run
    { x: 2542.7, z: 552.4, y: 38 },
    { x: 2767.7, z: 552.4, y: 42 }, // 50: lighthouse hairpin R
    { x: 2777, z: 553.2, y: 42 },
    { x: 2786, z: 555.6, y: 42 },
    { x: 2794.5, z: 559.4, y: 42 },
    { x: 2802.2, z: 564.6, y: 42 },
    { x: 2808.9, z: 571, y: 42 },
    { x: 2814.5, z: 578.5, y: 42 },
    { x: 2818.7, z: 586.8, y: 42 },
    { x: 2821.4, z: 595.7, y: 42 },
    { x: 2822.6, z: 604.9, y: 42 },
    { x: 2822.3, z: 614.2, y: 42 },
    { x: 2820.4, z: 623.3, y: 42 },
    { x: 2816.9, z: 631.9, y: 42 },
    { x: 2812.1, z: 639.9, y: 42 },
    { x: 2806, z: 646.9, y: 42 },
    { x: 2798.8, z: 652.8, y: 42 },
    { x: 2790.7, z: 657.4, y: 42 },
    { x: 2781.9, z: 660.6, y: 42 }, // 67: descent
    { x: 2588.8, z: 712.3, y: 41 },
    { x: 2395.6, z: 764.1, y: 34 }, // 69: dune esses L
    { x: 2383.7, z: 768.3, y: 33.2 },
    { x: 2372.7, z: 774.3, y: 32.2 },
    { x: 2362.7, z: 781.9, y: 31.1 },
    { x: 2354.1, z: 791, y: 29.9 },
    { x: 2347, z: 801.4, y: 28.6 }, // 74: dune esses R
    { x: 2339, z: 812.8, y: 27.1 },
    { x: 2329.1, z: 822.6, y: 25.5 },
    { x: 2317.7, z: 830.6, y: 23.9 },
    { x: 2305.1, z: 836.5, y: 22.3 },
    { x: 2291.6, z: 840.1, y: 20.6 },
    { x: 2277.7, z: 841.4, y: 19 },
    { x: 2263.8, z: 840.1, y: 17.5 }, // 81: dune esses L2
    { x: 2249.1, z: 838.9, y: 15.9 },
    { x: 2234.3, z: 840.1, y: 14.4 },
    { x: 2220, z: 844, y: 13.1 },
    { x: 2206.6, z: 850.2, y: 12 }, // 85: beach party
    { x: 2120, z: 900.2, y: 6 },
    { x: 2033.4, z: 950.2, y: 3.1 },
    { x: 1946.7, z: 1000.2, y: 10.2 },
    { x: 1860.1, z: 1050.2, y: 4 }, // 89: party corner R
    { x: 1850.7, z: 1054.7, y: 4 },
    { x: 1840.6, z: 1057.4, y: 4.2 },
    { x: 1830.1, z: 1058.3, y: 4.3 },
    { x: 1819.7, z: 1057.4, y: 4.6 },
    { x: 1809.6, z: 1054.7, y: 4.9 },
    { x: 1800.1, z: 1050.2, y: 5.2 },
    { x: 1791.6, z: 1044.2, y: 5.6 }, // 96: dune hump
    { x: 1740.5, z: 1001.4, y: 8.5 },
    { x: 1689.4, z: 958.5, y: 10.7 },
    { x: 1638.4, z: 915.7, y: 8.6 }, // 99: flypast bend L
    { x: 1609.8, z: 895.7, y: 4.9 },
    { x: 1578.2, z: 881, y: 3 },
    { x: 1544.5, z: 871.9, y: 3 },
    { x: 1509.8, z: 868.9, y: 3 }, // 103: flypast straight
    { x: 1427.3, z: 868.9, y: 3 },
    { x: 1344.8, z: 868.9, y: 3 },
    { x: 1262.3, z: 868.9, y: 3 },
    { x: 1179.8, z: 868.9, y: 10 }, // 107: whale chicane L
    { x: 1170.4, z: 869.6, y: 9.7 },
    { x: 1161.3, z: 871.8, y: 8.8 },
    { x: 1152.6, z: 875.4, y: 7.8 },
    { x: 1144.5, z: 880.4, y: 6.7 },
    { x: 1137.4, z: 886.5, y: 6 }, // 112: whale chicane R
    { x: 1130.2, z: 892.6, y: 5.6 },
    { x: 1122.2, z: 897.5, y: 5.3 },
    { x: 1113.5, z: 901.1, y: 5.1 },
    { x: 1104.3, z: 903.3, y: 5 },
    { x: 1095, z: 904, y: 5 }, // 117: back straight
    { x: 1044.1, z: 904, y: 5.9 },
    { x: 993.3, z: 904, y: 7.8 },
    { x: 942.5, z: 904, y: 9.6 },
    { x: 891.7, z: 904, y: 8.7 }, // 121: notch R
    { x: 880.9, z: 903.1, y: 7 },
    { x: 870.5, z: 900.3, y: 5.3 },
    { x: 860.7, z: 895.7, y: 4 },
    { x: 851.8, z: 889.5, y: 3.4 },
    { x: 844.2, z: 881.9, y: 3.1 },
    { x: 838, z: 873, y: 3 },
    { x: 763, z: 743.1, y: 3 }, // 128: notch sweeper L
    { x: 723, z: 686, y: 3 },
    { x: 673.7, z: 636.7, y: 3 },
    { x: 616.6, z: 596.7, y: 3 },
    { x: 553.4, z: 567.3, y: 3.1 },
    { x: 486.1, z: 549.2, y: 3.1 },
    { x: 416.6, z: 543.1, y: 3.2 },
    { x: 347.1, z: 549.2, y: 3.2 },
    { x: 279.8, z: 567.3, y: 3.3 },
    { x: 216.6, z: 596.7, y: 3.4 },
    { x: 159.5, z: 636.7, y: 3.6 },
    { x: 110.2, z: 686, y: 3.7 },
    { x: 70.2, z: 743.1, y: 3.9 },
    { x: 32.7, z: 808.1, y: 6 },
    { x: -4.8, z: 873, y: 10 }, // 142: notch exit R
    { x: -11, z: 881.9, y: 9 },
    { x: -18.7, z: 889.5, y: 6.8 },
    { x: -27.5, z: 895.7, y: 5 },
    { x: -37.3, z: 900.3, y: 4 },
    { x: -47.7, z: 903.1, y: 3.3 },
    { x: -58.5, z: 904, y: 3 }, // 148: rejoin straight
    { x: -141.8, z: 904, y: 7.4 },
    { x: -225.2, z: 904, y: 15.6 },
    { x: -308.5, z: 904, y: 20 }, // 151: west corner R
    { x: -319.3, z: 903.1, y: 19.9 },
    { x: -329.7, z: 900.3, y: 19.6 },
    { x: -339.5, z: 895.7, y: 19.3 },
    { x: -348.4, z: 889.5, y: 18.8 },
    { x: -356, z: 881.9, y: 18.2 },
    { x: -362.2, z: 873, y: 17.6 },
    { x: -366.8, z: 863.2, y: 17 },
    { x: -369.6, z: 852.8, y: 16.5 },
    { x: -370.5, z: 842, y: 16 },
    { x: -370.5, z: 768.7, y: 12.5 },
    { x: -370.5, z: 695.4, y: 14.4 },
    { x: -370.5, z: 622, y: 19 }, // 163: cove esses L
    { x: -371.3, z: 612, y: 17.6 },
    { x: -373.6, z: 602.3, y: 15 },
    { x: -377.5, z: 593, y: 13.3 },
    { x: -382.7, z: 584.4, y: 12.1 },
    { x: -389.3, z: 576.8, y: 11.1 }, // 168: cove esses R
    { x: -395.8, z: 569.2, y: 10.2 },
    { x: -401, z: 560.6, y: 9.5 },
    { x: -404.9, z: 551.3, y: 8.9 },
    { x: -407.2, z: 541.5, y: 8.4 },
    { x: -408, z: 531.5, y: 8 }, // 173: cove run
    { x: -408, z: 436.8, y: 5.6 },
    { x: -408, z: 342.1, y: 5 },
    { x: -408, z: 247.4, y: 5.9 },
    { x: -408, z: 152.7, y: 9.8 },
    { x: -408, z: 58, y: 7.5 }, // 178: final hairpin R
    { x: -407.1, z: 47.9, y: 6.1 },
    { x: -404.5, z: 38.2, y: 4.8 },
    { x: -400.2, z: 29, y: 3.7 },
    { x: -394.4, z: 20.7, y: 3.1 },
    { x: -387.3, z: 13.6, y: 3 },
    { x: -379, z: 7.8, y: 3 },
    { x: -369.8, z: 3.5, y: 3 },
    { x: -360.1, z: 0.9, y: 3 },
    { x: -350, z: 0, y: 3 }, // 187: last
  ],
  features: [
    // Boost cells cost line: S-chains on the straights, strings wide of the apexes and one
    // string across the road; none sits on the racing line.
    { kind: 'boostCells', at: 0.6, lateral: -16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 0.75, lateral: 16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 0.9, lateral: -16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 1.05, lateral: 16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 1.2, lateral: -16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 17.2, lateral: -20, count: 4, spacing: 26 },
    { kind: 'boostCells', at: 48.4, lateral: -20, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 48.6, lateral: -7, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 48.8, lateral: 7, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 49, lateral: 20, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 86.2, lateral: -16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 86.4, lateral: 16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 86.6, lateral: -16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 86.8, lateral: 16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 87, lateral: -16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 100.2, lateral: 41, count: 4, spacing: 26 },
    { kind: 'boostCells', at: 160.6, lateral: -41, count: 4, spacing: 26 },
    { kind: 'boostPad', at: 0.3, lateral: -10 },
    { kind: 'boostPad', at: 0.3, lateral: 10 },
    { kind: 'boostPad', at: 13.1, lateral: 0 },
    { kind: 'boostPad', at: 13.14, lateral: 0 },
    // The reef channel: a gentle leap a rookie clears at any speed, the landing on a long straight.
    { kind: 'jump', at: 13.4, rampLength: 60, rampHeight: 4, gapLength: 40 },
    // A pad into the lighthouse hairpin: free speed you must scrub off again.
    { kind: 'boostPad', at: 49.5, lateral: 0 },
    { kind: 'boostPad', at: 103.6, lateral: 0 },
    { kind: 'boostPad', at: 103.64, lateral: 0 },
    { kind: 'dunes', from: 103.2, to: 105.8, amplitude: 1.2, wavelength: 200 },
    // Hairpin-tight corners keep their inside run-off short, so the sand never folds over itself
    // (and where two legs run side by side, their run-offs never meet).
    { kind: 'runoff', from: 2.6, to: 9, amount: 20, side: 1 },
    { kind: 'runoff', from: 19.6, to: 29.5, amount: 20, side: -1 },
    { kind: 'runoff', from: 28.6, to: 39.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 48, to: 69.5, amount: 12, side: 1 },
    { kind: 'runoff', from: 88.6, to: 96.5, amount: 18, side: 1 },
    { kind: 'runoff', from: 106.4, to: 112.6, amount: 12, side: -1 },
    { kind: 'runoff', from: 111.4, to: 117.6, amount: 12, side: 1 },
    { kind: 'runoff', from: 150.6, to: 160.4, amount: 20, side: 1 },
    { kind: 'runoff', from: 120.6, to: 127.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 141.6, to: 148.4, amount: 22, side: 1 },
    // The dune esses fall steeply and bank both ways: short run-off keeps it on the dunes' line.
    { kind: 'runoff', from: 68.6, to: 85.4, amount: 22 },
    { kind: 'runoff', from: 28.4, to: 39, amount: 30, side: -1 },
    { kind: 'runoff', from: 162.6, to: 168, amount: 22, side: -1 },
    { kind: 'runoff', from: 168, to: 173.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 177.6, to: 187.4, amount: 18, side: 1 },
    // The air display's jets scream low over the lagoon road: their wash pushes you aside.
    {
      kind: 'hazard',
      hazard: { type: 'gust', id: 'flypast', from: 104, to: 106, strength: -4, on: 4, period: 14, phase: 0 },
    },
  ],
  branches: [
    {
      id: 'reefrun',
      kind: 'shortcut',
      name: 'Reef Run',
      side: -1,
      from: 117.4,
      to: 149.5,
      width: 22,
      runoff: 0,
      points: [
        { x: 888, z: 949, y: 5 },
        { x: 568, z: 951, y: 5 },
        { x: 249, z: 952, y: 5 },
        { x: -71, z: 954, y: 6 },
      ],
      features: [
        // Dead coral rubble, coral heads to thread, then a squeeze.
        { kind: 'rough', from: 2.5, to: 3.8, amount: 0.55 },
        { kind: 'boulders', from: 4.7, to: 5.2, count: 4, radius: 1.4 },
        { kind: 'narrow', from: 5.25, to: 5.8, width: 18 },
      ],
    },
  ],
  palette: { sky: 0x2f8be0, horizon: 0xd8f0f4, sand: 0xf3e2b8, road: 0xc9c2b0, rock: 0x8a7a6a, accent: 0xff6a3a, sun: 0xfff6e0, dusk: 0 },
};

export const coralcoveScenery: TrackScenery = {
  biome: 'beach',
  boundary: 'dune',
  lagoons: [
    { from: 0.2, to: 20 },
    { from: 99, to: 107 },
  ],
  land: 0.35,
  landHeight: 5,
  islands: 9,
  stacks: 8,
  palmsPerKm: 22,
  hutsPerKm: 4,
  road: 'causeway',
  landmarks: [
    { kind: 'grandstand', at: 0.05, side: -1, distance: -148, straddle: true },
    { kind: 'regatta', at: 24, side: 1, distance: 150, afloat: true },
    // On the headland top, beside the hairpin it names.
    { kind: 'lighthouse', at: 58.5, side: -1, distance: 10 },
    { kind: 'beachParty', at: 86.2, side: -1, distance: 10 },
    { kind: 'whales', at: 104.4, side: -1, distance: 200, afloat: true },
    { kind: 'airshow', at: 105, side: -1, distance: 150, hazard: 'flypast' },
  ],
};
