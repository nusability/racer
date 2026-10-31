import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// The coast's speed track, raced clockwise: two kilometres of causeway across the lagoon, where
// the whales breach right across the road, into the hairpin at its end. Then the villa chicane
// and the resort esses, up onto the bluff and along the clifftop esses, light over the crest
// into the balloon corner, down the cliff chicane to the shore, and out round the resort bay;
// the Sandbar Cut runs straight across the shallows inside it. The pier chicane brings it home.
// Points are generated (arcs and straights) with their heights; the comments name the sections.
export const lagoonloop: TrackDef = {
  id: 'lagoonloop',
  name: 'Lagoon Loop',
  blurb: 'Two kilometres flat out over the lagoon into a hairpin, then over the bluff and round the bay.',
  difficulty: 1,
  course: 'circuit',
  laps: 3,
  seed: 1202,
  width: 54,
  runoff: 50,
  floor: 'water',
  points: [
    { x: 0, z: 0, y: 3 }, // 0: causeway
    { x: 0, z: -162.5, y: 3 },
    { x: 0, z: -325, y: 3 },
    { x: 0, z: -487.5, y: 3 },
    { x: 0, z: -650, y: 3 }, // 4: causeway kink
    { x: -6, z: -765, y: 3 },
    { x: -24, z: -878.7, y: 3 }, // 6: whale straight
    { x: -57.8, z: -1037.7, y: 3 },
    { x: -91.6, z: -1196.6, y: 3 },
    { x: -125.4, z: -1355.5, y: 3 },
    { x: -159.2, z: -1514.5, y: 3 }, // 10: causeway hairpin R
    { x: -160.4, z: -1524.2, y: 3 },
    { x: -159.9, z: -1533.9, y: 3 },
    { x: -157.8, z: -1543.4, y: 3 },
    { x: -154.1, z: -1552.4, y: 3 },
    { x: -148.9, z: -1560.7, y: 3 },
    { x: -142.4, z: -1567.9, y: 3 },
    { x: -134.8, z: -1573.9, y: 3 },
    { x: -126.2, z: -1578.6, y: 3 },
    { x: -117, z: -1581.7, y: 3 },
    { x: -107.4, z: -1583.2, y: 3 },
    { x: -97.7, z: -1583.1, y: 3 },
    { x: -88.1, z: -1581.3, y: 3 },
    { x: -79, z: -1577.8, y: 3 },
    { x: -70.6, z: -1572.9, y: 3 },
    { x: -63.1, z: -1566.7, y: 3 }, // 25: resort approach
    { x: 4.1, z: -1499.5, y: 3 },
    { x: 71.2, z: -1432.3, y: 3 },
    { x: 138.4, z: -1365.1, y: 6 },
    { x: 205.6, z: -1298, y: 9 }, // 29: villa chicane L
    { x: 213.1, z: -1291.5, y: 7.8 },
    { x: 221.5, z: -1286.3, y: 6 },
    { x: 230.6, z: -1282.4, y: 4.7 },
    { x: 240.3, z: -1279.9, y: 4 }, // 33: villa chicane R
    { x: 249.9, z: -1277.4, y: 4 },
    { x: 259, z: -1273.5, y: 4.1 },
    { x: 267.4, z: -1268.3, y: 4.1 },
    { x: 274.9, z: -1261.9, y: 4.3 },
    { x: 352.7, z: -1184.1, y: 6.7 },
    { x: 430.5, z: -1106.3, y: 9.4 },
    { x: 508.3, z: -1028.5, y: 7.7 }, // 40: resort esses L
    { x: 517.2, z: -1020.9, y: 7 },
    { x: 527.3, z: -1014.7, y: 6.3 },
    { x: 538.1, z: -1010.2, y: 5.7 },
    { x: 549.6, z: -1007.5, y: 5.2 },
    { x: 561.3, z: -1006.5, y: 5 }, // 45: resort esses R
    { x: 573, z: -1005.6, y: 5 },
    { x: 584.5, z: -1002.9, y: 5 },
    { x: 595.4, z: -998.4, y: 5 },
    { x: 605.4, z: -992.2, y: 5.1 },
    { x: 614.3, z: -984.6, y: 5.2 }, // 50: resort climb
    { x: 685.1, z: -913.9, y: 8.8 },
    { x: 755.8, z: -843.2, y: 26.6 },
    { x: 826.5, z: -772.4, y: 40 }, // 53: bluff crest L
    { x: 838.4, z: -762.3, y: 38.6 },
    { x: 851.8, z: -754.1, y: 36.4 },
    { x: 866.3, z: -748, y: 36 },
    { x: 881.5, z: -744.4, y: 36 },
    { x: 897.2, z: -743.2, y: 36 }, // 58: bluff top
    { x: 997.2, z: -743.2, y: 36.4 },
    { x: 1097.2, z: -743.2, y: 36.8 },
    { x: 1197.2, z: -743.2, y: 37 }, // 61: clifftop esses R
    { x: 1208.1, z: -742.3, y: 36.9 },
    { x: 1218.8, z: -739.8, y: 36.5 },
    { x: 1229, z: -735.7, y: 36.1 },
    { x: 1238.5, z: -730.1, y: 35.5 }, // 65: clifftop esses L
    { x: 1249.3, z: -723.9, y: 34.9 },
    { x: 1261.1, z: -719.6, y: 34.4 },
    { x: 1273.5, z: -717.4, y: 34 },
    { x: 1286.1, z: -717.4, y: 34 },
    { x: 1298.4, z: -719.6, y: 34.2 },
    { x: 1310.2, z: -723.9, y: 34.5 },
    { x: 1321.1, z: -730.1, y: 34.8 }, // 72: clifftop esses R2
    { x: 1330.5, z: -735.7, y: 35.2 },
    { x: 1340.7, z: -739.8, y: 35.5 },
    { x: 1351.4, z: -742.3, y: 35.8 },
    { x: 1362.4, z: -743.2, y: 36 }, // 76: clifftop run
    { x: 1492.4, z: -743.2, y: 38.1 },
    { x: 1622.4, z: -743.2, y: 39.8 },
    { x: 1752.4, z: -743.2, y: 41.2 },
    { x: 1882.4, z: -743.2, y: 41.9 },
    { x: 2012.4, z: -743.2, y: 37 }, // 81: balloon R
    { x: 2024.2, z: -742.1, y: 36.4 },
    { x: 2035.6, z: -739.1, y: 36 },
    { x: 2046.4, z: -734, y: 35.7 },
    { x: 2056.1, z: -727.2, y: 35.4 },
    { x: 2064.5, z: -718.9, y: 35.2 },
    { x: 2071.3, z: -709.2, y: 34.9 },
    { x: 2076.3, z: -698.4, y: 34.7 },
    { x: 2079.3, z: -687, y: 34.4 },
    { x: 2080.4, z: -675.2, y: 34 }, // 90: bluff descent
    { x: 2080.4, z: -580.2, y: 29.1 },
    { x: 2080.4, z: -485.2, y: 24.6 },
    { x: 2080.4, z: -390.2, y: 24.9 },
    { x: 2080.4, z: -295.2, y: 27 }, // 94: cliff chicane L
    { x: 2081.2, z: -284.5, y: 24.9 },
    { x: 2083.6, z: -274.1, y: 22 },
    { x: 2087.6, z: -264.2, y: 20.7 },
    { x: 2093, z: -255, y: 19.7 }, // 98: cliff chicane R
    { x: 2098.5, z: -245.8, y: 19.1 },
    { x: 2102.5, z: -235.9, y: 18.7 },
    { x: 2104.9, z: -225.5, y: 18.4 },
    { x: 2105.7, z: -214.9, y: 18 }, // 102: cliff run
    { x: 2105.7, z: -104.9, y: 14.9 },
    { x: 2105.7, z: 5.1, y: 13.4 },
    { x: 2105.7, z: 115.1, y: 12.5 },
    { x: 2105.7, z: 225.1, y: 11 },
    { x: 2105.7, z: 335.1, y: 8 }, // 107: shore esses L
    { x: 2106.8, z: 347.7, y: 7.3 },
    { x: 2110, z: 359.8, y: 6.3 },
    { x: 2115.3, z: 371.1, y: 5.4 },
    { x: 2122.5, z: 381.4, y: 5 }, // 111: shore esses R
    { x: 2129.7, z: 391.7, y: 5 },
    { x: 2135, z: 403.1, y: 5.1 },
    { x: 2138.3, z: 415.2, y: 5.3 },
    { x: 2139.4, z: 427.7, y: 5.5 },
    { x: 2139.4, z: 511, y: 7.6 },
    { x: 2139.4, z: 594.4, y: 9.6 },
    { x: 2139.4, z: 677.7, y: 7.9 }, // 118: resort hairpin R
    { x: 2138.5, z: 688.1, y: 6.9 },
    { x: 2135.8, z: 698.2, y: 5.9 },
    { x: 2131.3, z: 707.7, y: 5 },
    { x: 2125.3, z: 716.3, y: 4.3 },
    { x: 2117.9, z: 723.7, y: 3.8 },
    { x: 2109.4, z: 729.7, y: 3.4 },
    { x: 2099.9, z: 734.1, y: 3.2 },
    { x: 2089.8, z: 736.8, y: 3 },
    { x: 2079.4, z: 737.7, y: 3 }, // 127: shore straight
    { x: 1962.7, z: 737.7, y: 3 },
    { x: 1846, z: 737.7, y: 3 },
    { x: 1729.4, z: 737.7, y: 3 }, // 130: shore L
    { x: 1718.6, z: 738.7, y: 3 },
    { x: 1708.2, z: 741.4, y: 3 },
    { x: 1698.4, z: 746, y: 3 },
    { x: 1689.5, z: 752.2, y: 3 },
    { x: 1681.9, z: 759.9, y: 3 },
    { x: 1675.7, z: 768.7, y: 3 },
    { x: 1600.7, z: 898.6, y: 3 }, // 137: resort sweeper R
    { x: 1554.7, z: 964.3, y: 3 },
    { x: 1498, z: 1021, y: 3 },
    { x: 1432.3, z: 1067, y: 3 },
    { x: 1359.6, z: 1100.9, y: 3.1 },
    { x: 1282.2, z: 1121.6, y: 3.1 },
    { x: 1202.3, z: 1128.6, y: 3.2 },
    { x: 1122.4, z: 1121.6, y: 3.2 },
    { x: 1045, z: 1100.9, y: 3.3 },
    { x: 972.3, z: 1067, y: 3.4 },
    { x: 906.6, z: 1021, y: 3.6 },
    { x: 849.9, z: 964.3, y: 3.7 },
    { x: 803.9, z: 898.6, y: 3.9 },
    { x: 766.4, z: 833.7, y: 5.6 },
    { x: 728.9, z: 768.7, y: 9 }, // 151: sandbar L
    { x: 722.7, z: 759.9, y: 7.9 },
    { x: 715.1, z: 752.2, y: 5.7 },
    { x: 706.3, z: 746, y: 4 },
    { x: 696.5, z: 741.4, y: 3.3 },
    { x: 686, z: 738.7, y: 3 },
    { x: 675.3, z: 737.7, y: 3 }, // 157: back straight
    { x: 603.8, z: 737.7, y: 3 },
    { x: 532.3, z: 737.7, y: 3 },
    { x: 460.9, z: 737.7, y: 5.5 },
    { x: 389.4, z: 737.7, y: 9 }, // 161: pier chicane L
    { x: 379.7, z: 738.5, y: 7 },
    { x: 370.2, z: 740.7, y: 5 },
    { x: 361.1, z: 744.3, y: 5 },
    { x: 352.7, z: 749.3, y: 5.1 }, // 165: pier chicane R
    { x: 344.3, z: 754.3, y: 5.1 },
    { x: 335.2, z: 757.9, y: 5.2 },
    { x: 325.7, z: 760.1, y: 5.3 },
    { x: 316, z: 760.9, y: 5.5 },
    { x: 232.7, z: 760.9, y: 7.1 },
    { x: 149.3, z: 760.9, y: 8.7 },
    { x: 66, z: 760.9, y: 6.7 }, // 172: final corner R
    { x: 54.5, z: 759.9, y: 5.6 },
    { x: 43.4, z: 756.9, y: 4.5 },
    { x: 33, z: 752, y: 3.6 },
    { x: 23.6, z: 745.4, y: 3.1 },
    { x: 15.4, z: 737.3, y: 3 },
    { x: 8.8, z: 727.9, y: 3 },
    { x: 4, z: 717.4, y: 3 },
    { x: 1, z: 706.3, y: 3 },
    { x: 0, z: 694.9, y: 3 }, // 181: last
    { x: 0, z: 347.4, y: 3 },
  ],
  features: [
    // Boost cells cost line: S-chains on the straights, strings wide of the apexes and one
    // string across the road; none sits on the racing line.
    { kind: 'boostCells', at: 0.2, lateral: -16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 0.35, lateral: 16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 0.5, lateral: -16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 0.65, lateral: 16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 0.8, lateral: -16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 9, lateral: -20, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 9.13, lateral: -7, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 9.27, lateral: 7, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 9.4, lateral: 20, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 103, lateral: -16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 103.5, lateral: 16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 104, lateral: -16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 104.5, lateral: 16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 105, lateral: -16, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 140.6, lateral: -36, count: 4, spacing: 26 },
    { kind: 'boostCells', at: 160, lateral: -22, count: 4, spacing: 26 },
    { kind: 'boostPad', at: 0.48, lateral: 0 },
    { kind: 'boostPad', at: 0.51, lateral: 0 },
    { kind: 'kicker', at: 1.2, length: 40, height: 2 },
    // The whales breach right across the causeway: only the seaward half stays open.
    {
      kind: 'hazard',
      hazard: { type: 'blocker', id: 'breach', at: 7.6, opening: 30, offset: 14, height: 9, warn: 3.5, up: 3, period: 14, phase: 0 },
    },
    { kind: 'boostPad', at: 51.2, lateral: 0 },
    { kind: 'repairCells', at: 58.6, lateral: 20, count: 3, spacing: 30 },
    { kind: 'boostPad', at: 127.75, lateral: 0 },
    { kind: 'boostPad', at: 182, lateral: 0 },
    { kind: 'boostPad', at: 182.04, lateral: 0 },
    { kind: 'dunes', from: 105.25, to: 107, amplitude: 1.2, wavelength: 180 },
    // Hairpin-tight corners keep their inside run-off short, so the sand never folds over itself.
    { kind: 'runoff', from: 9.5, to: 25.5, amount: 15, side: 1 },
    { kind: 'runoff', from: 80.6, to: 90.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 117.6, to: 127.4, amount: 10, side: 1 },
    { kind: 'runoff', from: 129.6, to: 136.4, amount: 16, side: -1 },
    { kind: 'runoff', from: 150.6, to: 157.4, amount: 16, side: -1 },
    { kind: 'runoff', from: 171.6, to: 181.4, amount: 25, side: 1 },
    { kind: 'runoff', from: 60.6, to: 65, amount: 25, side: 1 },
    { kind: 'runoff', from: 65, to: 72, amount: 25, side: -1 },
    { kind: 'runoff', from: 72, to: 76.4, amount: 25, side: 1 },
    { kind: 'runoff', from: 39.6, to: 50.4, amount: 22 },
    { kind: 'runoff', from: 106.6, to: 115.4, amount: 22 },
    { kind: 'runoff', from: 28.6, to: 33, amount: 22, side: -1 },
    { kind: 'runoff', from: 33, to: 37.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 93.6, to: 98, amount: 22, side: -1 },
    { kind: 'runoff', from: 98, to: 102.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 160.6, to: 165, amount: 22, side: -1 },
    { kind: 'runoff', from: 165, to: 169.4, amount: 22, side: 1 },
  ],
  branches: [
    {
      id: 'sandbar',
      kind: 'shortcut',
      name: 'Sandbar Cut',
      side: 1,
      from: 128.5,
      to: 159,
      width: 22,
      runoff: 0,
      points: [
        { x: 1725, z: 688, y: 3.5 },
        { x: 1370, z: 688, y: 3.5 },
        { x: 1016, z: 688, y: 3.5 },
        { x: 661, z: 688, y: 3.5 },
      ],
      features: [
        // Shell-and-rock bar, then a walled squeeze.
        { kind: 'rough', from: 2.6, to: 3.5, amount: 0.8 },
        { kind: 'narrow', from: 4.0, to: 4.8, width: 18 },
      ],
    },
  ],
  palette: { sky: 0x4a7fc8, horizon: 0xf2d4a8, sand: 0xf0d4a0, road: 0xb8a890, rock: 0x9a6a50, accent: 0x2ac8b0, sun: 0xffd8a0, dusk: 0.35 },
};

export const lagoonloopScenery: TrackScenery = {
  biome: 'beach',
  boundary: 'dune',
  lagoons: [
    { from: 0.3, to: 10 },
    { from: 130, to: 151 },
  ],
  land: 0.4,
  landHeight: 6,
  islands: 8,
  stacks: 5,
  palmsPerKm: 26,
  hutsPerKm: 5,
  road: 'causeway',
  landmarks: [
    { kind: 'grandstand', at: 0.05, side: 1, distance: -148, straddle: true },
    { kind: 'whales', at: 7.6, side: -1, distance: 20, afloat: true, hazard: 'breach' },
    { kind: 'pier', at: 1.4, side: -1, distance: 60, afloat: true },
    { kind: 'resort', at: 51.5, side: 1, distance: 10 },
    { kind: 'balloons', at: 78.5, side: -1, distance: 200 },
    { kind: 'airshow', at: 143, side: -1, distance: 250 },
  ],
};
