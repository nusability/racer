import type { TrackDef } from '../../core/types.ts';
import type { TrackScenery } from './scenery.ts';

// The coast's technical track and its figure of eight, a plank road at sunset. The seafront
// lobe runs clockwise: along the quay into the harbour hairpin, the boatyard chicane, under
// the bridge and into the fair lobe (anticlockwise): the fair chicane, the fair esses over a
// rise, the pier hairpin and the harbour road where a ship's hull swings across the channel.
// Then up over the deck chicane and the bridge, round the seafront and inland up the hill round
// the pavilion; the Promenade runs straight along the seafront below it.
// Points are generated (arcs and straights) with their heights; the comments name the sections.
export const boardwalk: TrackDef = {
  id: 'boardwalk',
  name: 'Boardwalk',
  blurb: 'A figure of eight in planks: tight seafront corners, the bridge, and a ship crossing the road.',
  difficulty: 2,
  course: 'circuit',
  laps: 3,
  seed: 1303,
  width: 40,
  runoff: 35,
  floor: 'water',
  points: [
    { x: 0, z: 0, y: 4 }, // 0: quay
    { x: -67.2, z: 67.2, y: 3.8 },
    { x: -134.4, z: 134.4, y: 3.6 },
    { x: -201.5, z: 201.5, y: 3.3 },
    { x: -268.7, z: 268.7, y: 3.1 }, // 4: lifeguard chicane L
    { x: -281, z: 283.4, y: 3 },
    { x: -290.6, z: 300, y: 3 }, // 6: lifeguard chicane R
    { x: -300.2, z: 316.6, y: 3 },
    { x: -312.5, z: 331.3, y: 3 }, // 8: quay end
    { x: -370.9, z: 389.6, y: 3 },
    { x: -429.2, z: 448, y: 3 },
    { x: -487.5, z: 506.3, y: 6 },
    { x: -545.9, z: 564.6, y: 9 }, // 12: harbour hairpin R
    { x: -553.6, z: 571.1, y: 8.5 },
    { x: -562.4, z: 576.2, y: 7.2 },
    { x: -571.9, z: 579.6, y: 5.7 },
    { x: -581.8, z: 581.4, y: 4.4 },
    { x: -591.9, z: 581.4, y: 3.7 },
    { x: -601.9, z: 579.6, y: 3.3 },
    { x: -611.4, z: 576.2, y: 3.1 },
    { x: -620.1, z: 571.1, y: 3 },
    { x: -627.9, z: 564.6, y: 3 }, // 21: boatyard
    { x: -663.2, z: 529.3, y: 3.8 },
    { x: -698.6, z: 493.9, y: 5.2 },
    { x: -734, z: 458.6, y: 6 }, // 24: boatyard chicane L
    { x: -741.8, z: 451.8, y: 5.1 },
    { x: -750.6, z: 446.3, y: 4 },
    { x: -760.2, z: 442.3, y: 3.6 },
    { x: -770.2, z: 439.7, y: 3.3 }, // 28: boatyard chicane R
    { x: -780.3, z: 437.1, y: 3.1 },
    { x: -789.8, z: 433, y: 3 },
    { x: -798.6, z: 427.6, y: 3 },
    { x: -806.5, z: 420.8, y: 3 }, // 32: under bridge
    { x: -1041.7, z: 185.6, y: 3 },
    { x: -1276.9, z: -49.6, y: 3 },
    { x: -1512.1, z: -284.7, y: 3 },
    { x: -1747.2, z: -519.9, y: 3 }, // 36: fair road
    { x: -1785, z: -557.6, y: 3 },
    { x: -1822.7, z: -595.4, y: 5.1 },
    { x: -1860.4, z: -633.1, y: 7 }, // 39: fair chicane L
    { x: -1869.5, z: -640.7, y: 6.3 },
    { x: -1879.7, z: -646.6, y: 6 },
    { x: -1890.9, z: -650.7, y: 6 }, // 42: fair chicane R
    { x: -1902, z: -654.7, y: 6.1 },
    { x: -1912.3, z: -660.6, y: 6.2 },
    { x: -1921.3, z: -668.3, y: 6.3 },
    { x: -1985, z: -731.9, y: 7.3 },
    { x: -2048.6, z: -795.5, y: 8 }, // 47: fair L
    { x: -2056.6, z: -802.3, y: 7.6 },
    { x: -2065.7, z: -807.5, y: 6.7 },
    { x: -2075.5, z: -811.1, y: 5.8 },
    { x: -2085.8, z: -812.9, y: 5.1 },
    { x: -2096.3, z: -812.9, y: 5 },
    { x: -2106.6, z: -811.1, y: 5.1 },
    { x: -2116.4, z: -807.5, y: 5.2 },
    { x: -2125.5, z: -802.3, y: 5.4 },
    { x: -2133.5, z: -795.5, y: 5.6 }, // 56: fair run
    { x: -2187.2, z: -741.8, y: 7.7 },
    { x: -2241, z: -688.1, y: 9 },
    { x: -2294.7, z: -634.3, y: 8.1 },
    { x: -2348.4, z: -580.6, y: 8.6 },
    { x: -2402.2, z: -526.8, y: 11 }, // 61: fair esses R
    { x: -2411, z: -519.4, y: 11.8 },
    { x: -2421, z: -513.7, y: 11.9 },
    { x: -2431.8, z: -509.8, y: 11 }, // 64: fair esses L
    { x: -2442.6, z: -505.8, y: 9.6 },
    { x: -2452.5, z: -500.1, y: 8.1 },
    { x: -2461.4, z: -492.7, y: 7 },
    { x: -2468.7, z: -483.9, y: 6.2 },
    { x: -2474.5, z: -473.9, y: 5.5 },
    { x: -2478.4, z: -463.1, y: 5 }, // 70: fair esses R2
    { x: -2482.4, z: -452.3, y: 4.5 },
    { x: -2488.1, z: -442.3, y: 4.2 },
    { x: -2495.5, z: -433.5, y: 4 }, // 73: pier run
    { x: -2557.4, z: -371.6, y: 3.5 },
    { x: -2619.3, z: -309.8, y: 3.2 },
    { x: -2681.1, z: -247.9, y: 3.1 },
    { x: -2743, z: -186, y: 3 }, // 77: pier hairpin L
    { x: -2749.3, z: -178.6, y: 3 },
    { x: -2754.2, z: -170.2, y: 3 },
    { x: -2757.7, z: -161.1, y: 3 },
    { x: -2759.6, z: -151.5, y: 3 },
    { x: -2759.9, z: -141.8, y: 3 },
    { x: -2758.5, z: -132.1, y: 3 },
    { x: -2755.6, z: -122.8, y: 3 },
    { x: -2751.1, z: -114.1, y: 3 },
    { x: -2745.2, z: -106.4, y: 3 },
    { x: -2738.2, z: -99.7, y: 3 },
    { x: -2730, z: -94.2, y: 3 },
    { x: -2721.1, z: -90.3, y: 3 },
    { x: -2711.7, z: -87.8, y: 3 },
    { x: -2702, z: -87, y: 3 }, // 91: harbour road
    { x: -2627, z: -87, y: 3 },
    { x: -2552, z: -87, y: 3 },
    { x: -2477, z: -87, y: 4.7 },
    { x: -2402, z: -87, y: 7 }, // 95: channel chicane R
    { x: -2391.3, z: -86.2, y: 6.2 },
    { x: -2380.9, z: -83.8, y: 5 },
    { x: -2371, z: -79.8, y: 4.4 },
    { x: -2361.8, z: -74.3, y: 3.9 }, // 99: channel chicane L
    { x: -2352.6, z: -68.9, y: 3.5 },
    { x: -2342.7, z: -64.9, y: 3.2 },
    { x: -2332.3, z: -62.5, y: 3.1 },
    { x: -2321.7, z: -61.7, y: 3 }, // 103: channel road
    { x: -2221.7, z: -61.7, y: 3 },
    { x: -2121.7, z: -61.7, y: 3 },
    { x: -2021.7, z: -61.7, y: 3 }, // 106: channel bend L
    { x: -2010.1, z: -62.6, y: 3.1 },
    { x: -1998.8, z: -65.3, y: 3.2 },
    { x: -1988.1, z: -69.8, y: 3.4 },
    { x: -1978.2, z: -75.8, y: 3.7 },
    { x: -1969.4, z: -83.4, y: 4 }, // 111: bridge approach
    { x: -1852, z: -200.7, y: 10.4 },
    { x: -1734.7, z: -318, y: 17.5 },
    { x: -1617.3, z: -435.4, y: 20 },
    { x: -1500, z: -552.7, y: 20 },
    { x: -1382.7, z: -670.1, y: 20 },
    { x: -1265.3, z: -787.4, y: 20.2 },
    { x: -1148, z: -904.7, y: 22 }, // 118: deck chicane R
    { x: -1138.4, z: -912.8, y: 22 },
    { x: -1127.5, z: -919.1, y: 22 },
    { x: -1115.7, z: -923.4, y: 22 }, // 121: deck chicane L
    { x: -1103.9, z: -927.7, y: 22 },
    { x: -1093, z: -933.9, y: 22 },
    { x: -1083.4, z: -942, y: 22 }, // 124: bridge
    { x: -1012.7, z: -1012.7, y: 23.9 },
    { x: -942, z: -1083.4, y: 27 },
    { x: -871.3, z: -1154.1, y: 27.8 }, // 127: seafront R
    { x: -863, z: -1161.1, y: 27.6 },
    { x: -853.7, z: -1166.5, y: 27.5 },
    { x: -843.5, z: -1170.2, y: 27.3 },
    { x: -832.9, z: -1172.1, y: 27.1 },
    { x: -822.1, z: -1172.1, y: 26.9 },
    { x: -811.4, z: -1170.2, y: 26.6 },
    { x: -801.3, z: -1166.5, y: 26.3 },
    { x: -791.9, z: -1161.1, y: 26.1 },
    { x: -783.6, z: -1154.1, y: 26 }, // 136: seafront run
    { x: -712.9, z: -1083.4, y: 26.2 },
    { x: -642.2, z: -1012.7, y: 27.2 }, // 138: pavilion R
    { x: -635.7, z: -1005.1, y: 27.4 },
    { x: -630.5, z: -996.5, y: 27.6 },
    { x: -626.8, z: -987.2, y: 27.9 },
    { x: -624.6, z: -977.4, y: 28.2 },
    { x: -624.1, z: -967.3, y: 28.8 },
    { x: -625.1, z: -957.4, y: 29.5 },
    { x: -627.8, z: -947.7, y: 30 },
    { x: -662, z: -853.7, y: 33.6 }, // 146: pavilion sweeper L
    { x: -680.9, z: -783, y: 35.9 },
    { x: -687.3, z: -710.1, y: 37.8 },
    { x: -680.9, z: -637.1, y: 39.4 },
    { x: -662, z: -566.4, y: 40.7 },
    { x: -631, z: -500.1, y: 41.5 },
    { x: -589, z: -440.1, y: 41.9 },
    { x: -537.3, z: -388.3, y: 42 },
    { x: -477.3, z: -346.3, y: 41.9 },
    { x: -411, z: -315.4, y: 41.6 },
    { x: -340.2, z: -296.4, y: 40.9 },
    { x: -267.3, z: -290.1, y: 39.8 },
    { x: -194.4, z: -296.4, y: 37.9 },
    { x: -123.7, z: -315.4, y: 35.2 },
    { x: -29.7, z: -349.6, y: 30 }, // 160: pavilion exit R
    { x: -20, z: -352.2, y: 28.9 },
    { x: -10, z: -353.3, y: 27.1 },
    { x: 0, z: -352.7, y: 25 },
    { x: 9.8, z: -350.6, y: 22.8 },
    { x: 19.1, z: -346.8, y: 19.9 },
    { x: 27.7, z: -341.7, y: 17.2 },
    { x: 35.4, z: -335.2, y: 16 }, // 167: promenade run
    { x: 70.7, z: -299.8, y: 17 },
    { x: 106.1, z: -264.5, y: 19 },
    { x: 141.4, z: -229.1, y: 20 }, // 170: seafront R2
    { x: 148.4, z: -220.8, y: 19 },
    { x: 153.8, z: -211.5, y: 16.7 },
    { x: 157.5, z: -201.3, y: 13.7 },
    { x: 159.3, z: -190.7, y: 11 },
    { x: 159.3, z: -179.9, y: 9.2 },
    { x: 157.5, z: -169.2, y: 7.6 },
    { x: 153.8, z: -159.1, y: 6.4 },
    { x: 148.4, z: -149.7, y: 5.4 },
    { x: 141.4, z: -141.4, y: 5 }, // 179: start straight
    { x: 70.7, z: -70.7, y: 4.2 },
  ],
  features: [
    // Boost cells cost line: S-chains on the straights, strings wide of the apexes and one
    // string across the road; none sits on the racing line.
    { kind: 'boostCells', at: 1.2, lateral: -12, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 1.7, lateral: 12, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 2.2, lateral: -12, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 2.7, lateral: 12, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 3.2, lateral: -12, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 57, lateral: -12, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 57.38, lateral: 12, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 57.75, lateral: -12, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 58.13, lateral: 12, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 58.5, lateral: -12, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 103.9, lateral: -15, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 104.2, lateral: -5, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 104.5, lateral: 5, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 104.8, lateral: 15, count: 1, spacing: 30 },
    { kind: 'boostCells', at: 151.2, lateral: 34, count: 4, spacing: 26 },
    { kind: 'boostCells', at: 124.6, lateral: -12, count: 4, spacing: 26 },
    { kind: 'crossing', at: 35.54, other: 113.81, style: 'bridge' },
    { kind: 'boostPad', at: 9.2, lateral: 0 },
    { kind: 'boostPad', at: 33.2, lateral: 0 },
    { kind: 'repairCells', at: 74.2, lateral: 14, count: 3, spacing: 28 },
    // A ship's hull swings across the harbour channel.
    {
      kind: 'hazard',
      hazard: { type: 'sweeper', id: 'channel', at: 92.4, radius: 10, height: 18, xFrom: -95, xTo: 95, cross: 4, hold: 2, period: 18, phase: 0 },
    },
    { kind: 'boostPad', at: 112.05, lateral: 0 },
    { kind: 'boostPad', at: 112.09, lateral: 0 },
    { kind: 'kicker', at: 8.4, length: 40, height: 2 },
    // Tight corners keep their inside run-off short, so the sand never folds over itself.
    { kind: 'runoff', from: 11.6, to: 21.4, amount: 20, side: 1 },
    { kind: 'runoff', from: 94.6, to: 99.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 98.6, to: 103.4, amount: 22, side: -1 },
    { kind: 'runoff', from: 23.6, to: 28.4, amount: 22, side: -1 },
    { kind: 'runoff', from: 27.6, to: 32.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 46.6, to: 56.4, amount: 22, side: -1 },
    { kind: 'runoff', from: 60.6, to: 64.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 63.6, to: 70.4, amount: 22, side: -1 },
    { kind: 'runoff', from: 69.6, to: 73.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 38.6, to: 42.4, amount: 22, side: -1 },
    { kind: 'runoff', from: 41.6, to: 45.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 117.6, to: 121.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 120.6, to: 124.4, amount: 22, side: -1 },
    { kind: 'runoff', from: 76.6, to: 91.4, amount: 18, side: -1 },
    { kind: 'runoff', from: 126.6, to: 136.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 137.6, to: 145.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 159.6, to: 167.4, amount: 22, side: 1 },
    { kind: 'runoff', from: 169.6, to: 179.4, amount: 25, side: 1 },
  ],
  branches: [
    {
      id: 'promenade',
      kind: 'shortcut',
      name: 'Promenade',
      side: -1,
      from: 136.5,
      to: 168.8,
      width: 18,
      runoff: 0,
      points: [
        { x: -628, z: -1055, y: 26 },
        { x: -396, z: -823, y: 24 },
        { x: -163, z: -590, y: 21 },
        { x: 69, z: -358, y: 18 },
      ],
      features: [
        // Storm-broken planking up to the pillars.
        { kind: 'rough', from: 2.6, to: 3.4, amount: 0.85 },
        { kind: 'pillar', at: 4.2, lateral: -4, radius: 2 },
        { kind: 'pillar', at: 4.5, lateral: 4, radius: 2 },
      ],
    },
  ],
  palette: { sky: 0x3a3a7a, horizon: 0xff9a6a, sand: 0xe8b890, road: 0x9a7452, rock: 0x6a4a4a, accent: 0xffd23a, sun: 0xff8a50, dusk: 0.75 },
};

export const boardwalkScenery: TrackScenery = {
  biome: 'beach',
  boundary: 'dune',
  lagoons: [{ from: 73, to: 106 }],
  land: 0.5,
  landHeight: 6,
  islands: 7,
  stacks: 4,
  palmsPerKm: 18,
  hutsPerKm: 9,
  road: 'boardwalk',
  landmarks: [
    { kind: 'grandstand', at: 0.05, side: 1, distance: -148, straddle: true },
    { kind: 'fair', at: 58.5, side: 1, distance: 10 },
    { kind: 'harbor', at: 92.4, side: 1, distance: 20, afloat: true, hazard: 'channel' },
    { kind: 'pier', at: 84, side: 1, distance: 30, afloat: true },
    { kind: 'cruiseliner', at: 2, side: -1, distance: 350, afloat: true },
    { kind: 'beachParty', at: 168.5, side: -1, distance: 20 },
  ],
};
