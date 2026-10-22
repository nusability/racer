// The windfarm: rows of strange desert wind and moisture machines. Helix spinners twist on
// their masts, sail towers turn canvas rotors like old mills grown huge, egg-beater rotors
// whirl, and dew towers spin their crowns over glowing condensers. Pipes run along the rows
// to tank farms breathing mist; red aviation lights blink across the field.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from './kit.ts';
import type { Motion, V3 } from './motion.ts';
import { T, ball, beam, box, cone, dome, mix, prism, shade, vary } from './shapes.ts';
import { quadPts } from './props.ts';

const SALT = 0x3171d;
const RADIUS = 215;
const ROWS: readonly { z: number; count: number }[] = [
  { z: -70, count: 8 },
  { z: 10, count: 7 },
  { z: 90, count: 8 },
];
const ROW_SPAN = 360;
/** On low quality every other machine in a row is left out. */
const LOW_STRIDE = 2;
const KINDS = ['helix', 'sail', 'beater', 'dew'] as const;
type Kind = (typeof KINDS)[number];
const BLINK = { depth: 1, freq: 2.1, sharp: 10 } as const;
const MIST = { high: 26, low: 12 } as const;
const CROWD = { high: 40, low: 16 } as const;

function aviationLight(kit: Kit, at: V3, phase: number, motion?: Motion): void {
  kit.lamp(new THREE.OctahedronGeometry(0.7), at, 0xff2a20, 6, motion, { depth: BLINK.depth, freq: BLINK.freq, phase, sharp: BLINK.sharp });
}

/** Vertical-axis helix: three blades twisting round the mast. */
function helix(kit: Kit, x: number, z: number, h: number, metal: THREE.Color, accent: THREE.Color): void {
  kit.solid.add(prism(2.2, 1.2, h, 6), metal, T(x, 0, z));
  const spin: Motion = { hub: [x, 0, z], axisA: [0, 1, 0], spinA: 1.1 + kit.rng() * 0.4 };
  const r = 8;
  const segs = 12;
  for (let b = 0; b < 3; b++) {
    let prev: V3 | null = null;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const a = (b / 3) * Math.PI * 2 + t * Math.PI * 1.2;
      const rr = r * Math.sin(Math.PI * (0.15 + 0.7 * t));
      const p: V3 = [x + Math.cos(a) * rr, h * 0.25 + t * h * 0.7, z + Math.sin(a) * rr];
      if (prev) kit.moving.add(beam(prev, p, 1.1, 3), b === 0 ? accent : shade(metal, 1.15), undefined, spin);
      prev = p;
    }
  }
  kit.moving.add(prism(3, 3, 2, 8), accent, T(x, h * 0.95, z), spin);
  aviationLight(kit, [x, h + 1.5, z], x * 0.01);
}

/** A sail tower: tapering tower with a canvas rotor facing the track. */
function sail(kit: Kit, x: number, z: number, h: number, metal: THREE.Color, accent: THREE.Color): void {
  const wall = mix(kit.palette.sand, 0xe8dcc4, 0.5);
  kit.solid.add(prism(7, 4, h, 8), wall, T(x, 0, z));
  kit.solid.add(cone(5.5, 7, 8), accent, T(x, h, z));
  const hub: V3 = [x, h - 2, z - 5];
  kit.solid.add(prism(1.2, 1.2, 5, 6).rotateX(Math.PI / 2), metal, T(x, h - 2, z - 2.5));
  const spin: Motion = { hub, axisA: [0, 0, 1], spinA: 0.5 + kit.rng() * 0.3 };
  const sails = 6;
  const len = h * 0.42;
  for (let i = 0; i < sails; i++) {
    const a = (i / sails) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const tip: V3 = [hub[0] + c * len, hub[1] + s * len, hub[2]];
    kit.moving.add(beam(hub, tip, 0.35, 3), shade(metal, 0.7), undefined, spin);
    // Canvas: a long triangle trailing the spar, stripes on alternate sails.
    const nx = -s;
    const ny = c;
    const w = len * 0.22;
    kit.moving.add(quadPts([hub[0] + c * 3, hub[1] + s * 3, hub[2] - 0.2], tip, [tip[0] + nx * w * 0.4, tip[1] + ny * w * 0.4, hub[2] - 0.2], [hub[0] + c * len * 0.4 + nx * w, hub[1] + s * len * 0.4 + ny * w, hub[2] - 0.2]), i % 2 ? 0xf3e6c8 : accent, undefined, spin);
  }
  kit.moving.add(ball(1.6, 6, 4), metal, T(...hub), spin);
  aviationLight(kit, [x, h + 7.5, z], x * 0.01);
  for (let k = 0; k < 4; k++) kit.lights.add(box(1.2, 1.8, 0.3), 0xffd090, T(x, 8 + k * h * 0.2, z - 6.2 + k * 0.6), undefined, { depth: 0.2, freq: 1, phase: k });
}

/** Egg-beater rotor: bowed blades between a hub ring at the foot and the mast top. */
function beater(kit: Kit, x: number, z: number, h: number, metal: THREE.Color, accent: THREE.Color): void {
  kit.solid.add(prism(1.6, 1.2, h, 6), metal, T(x, 0, z));
  kit.solid.add(prism(5, 6, 6, 8), shade(metal, 0.8), T(x, 0, z));
  const spin: Motion = { hub: [x, 0, z], axisA: [0, 1, 0], spinA: 1.6 + kit.rng() * 0.5 };
  const segs = 10;
  const bulge = h * 0.2;
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2;
    let prev: V3 | null = null;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const r = 1.5 + bulge * Math.sin(Math.PI * t);
      const p: V3 = [x + Math.cos(a) * r, 8 + t * (h - 10), z + Math.sin(a) * r];
      if (prev) kit.moving.add(beam(prev, p, 0.7, 3), b === 1 ? accent : 0xf2efe6, undefined, spin);
      prev = p;
    }
  }
  aviationLight(kit, [x, h + 1, z], x * 0.01 + 1);
}

/** Dew tower: a pinched lattice that catches fog, with a spinning crown and glowing condenser. */
function dew(kit: Kit, x: number, z: number, h: number, metal: THREE.Color, accent: THREE.Color): void {
  const struts = 12;
  for (let i = 0; i < struts; i++) {
    const a = (i / struts) * Math.PI * 2;
    const twist = Math.PI * 0.55;
    const lo: V3 = [x + Math.cos(a) * 12, 0, z + Math.sin(a) * 12];
    const mid: V3 = [x + Math.cos(a + twist / 2) * 5, h * 0.55, z + Math.sin(a + twist / 2) * 5];
    const hi: V3 = [x + Math.cos(a + twist) * 9, h, z + Math.sin(a + twist) * 9];
    kit.solid.add(beam(lo, mid, 0.35, 3), metal);
    kit.solid.add(beam(mid, hi, 0.35, 3), metal);
  }
  kit.solid.add(prism(9.5, 9.5, 1.4, 12, true), accent, T(x, h - 0.7, z));
  kit.lamp(prism(5.5, 5.5, 3, 12, true), [x, 4, z], mix(0x7ad8ff, kit.palette.accent, 0.3), 12, undefined, { depth: 0.3, freq: 0.9, phase: x });
  const spin: Motion = { hub: [x, h, z], axisA: [0, 1, 0], spinA: 0.8 };
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    kit.moving.add(quadPts([x, h + 1, z], [x + Math.cos(a) * 11, h + 3, z + Math.sin(a) * 11], [x + Math.cos(a + 0.35) * 11, h + 6, z + Math.sin(a + 0.35) * 11], [x, h + 6, z]), i % 2 ? accent : 0xf2efe6, undefined, spin);
  }
  aviationLight(kit, [x, h + 8, z], x * 0.01 + 2);
}

const BUILDERS: Record<Kind, typeof helix> = { helix, sail, beater, dew };

/** A tank farm: domed condensers, a water ball on legs and a pump house, breathing mist. */
function tankFarm(kit: Kit, x: number, z: number, mist: (at: V3) => void): void {
  const white = 0xe8e4dc;
  for (let i = 0; i < 3; i++) {
    const tx = x + (i - 1) * 16;
    kit.solid.add(prism(6, 6, 12, 10), white, T(tx, 0, z));
    kit.solid.add(dome(6, 10, 3), shade(white, 0.92), T(tx, 12, z));
    kit.lights.add(box(8, 1.2, 0.4), 0x7ad8ff, T(tx, 6, z - 6), undefined, { depth: 0.5, freq: 1.2, phase: i });
    mist([tx, 16, z]);
  }
  for (const [dx, dz] of [[-5, -5], [5, -5], [5, 5], [-5, 5]] as const) kit.solid.add(beam([x + dx, 0, z + 30 + dz], [x + dx * 0.4, 22, z + 30 + dz * 0.4], 0.5, 4), 0x6a7078);
  kit.solid.add(ball(9, 10, 6), mix(white, kit.palette.accent, 0.25), T(x, 30, z + 30));
  kit.solid.add(box(14, 7, 10), shade(white, 0.85), T(x + 28, 0, z + 8));
  kit.lights.add(box(10, 1.5, 0.3), 0xffd090, T(x + 28, 4, z + 2.9), undefined, { depth: 0.1, freq: 1, phase: 0 });
}

export function createWindfarm(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const { rng } = kit;
  const metal = mix(0xc8ccd0, kit.palette.sand, 0.25);
  const accent = new THREE.Color(kit.palette.accent);
  const pipe = 0x8a8f96;
  const mistPts = kit.particles(false, 1.2);
  const mistCol = mix(0xffffff, kit.palette.horizon, 0.3);
  const mist = (at: V3) => {
    for (let i = 0; i < kit.q(MIST.high, MIST.low); i++) {
      mistPts.add(at, [0.8 + rng() * 0.8, 1.6 + rng(), (rng() - 0.5)], mistCol, 3, { period: 8, lifetime: 8, phase: (i / kit.q(MIST.high, MIST.low)) * 8, grow: 0.5 }, { fadeIn: 0.2 });
    }
  };

  let index = Math.floor(rng() * KINDS.length);
  ROWS.forEach((row, r) => {
    const step = ROW_SPAN / (row.count - 1);
    const x0 = -ROW_SPAN / 2 + (r % 2 ? step / 2 : 0);
    const bases: V3[] = [];
    for (let i = 0; i < row.count; i++) {
      if (!kit.high && i % LOW_STRIDE === 1) continue;
      const x = x0 + i * step + (rng() - 0.5) * 8;
      const z = row.z + (rng() - 0.5) * 10;
      // Rows mix kinds so each one reads as a skyline, not a fence.
      const kind = KINDS[(index + i + r) % KINDS.length];
      const h = kind === 'sail' ? 70 + rng() * 25 : kind === 'dew' ? 50 + rng() * 15 : 80 + rng() * 30;
      BUILDERS[kind](kit, x, z, h, vary(rng, metal, 0.05), accent);
      bases.push([x, 1.4, z - (kind === 'dew' ? 13 : 7)]);
    }
    index++;
    // A pipe along the row joining every base, on little trestles.
    for (let i = 0; i + 1 < bases.length; i++) {
      kit.solid.add(beam(bases[i], bases[i + 1], 0.8, 6), pipe);
      kit.solid.add(box(1, 1.4, 1), 0x5a5a60, T((bases[i][0] + bases[i + 1][0]) / 2, 0, bases[i][2]));
    }
    const end = bases[bases.length - 1];
    kit.solid.add(beam(end, [ROW_SPAN / 2 + 30, 1.4, end[2]], 0.8, 6), pipe);
  });
  // The rows' pipes drain to a manifold and a tank farm at the east end.
  kit.solid.add(beam([ROW_SPAN / 2 + 30, 1.4, ROWS[0].z], [ROW_SPAN / 2 + 30, 1.4, ROWS[ROWS.length - 1].z], 1.1, 6), pipe);
  tankFarm(kit, ROW_SPAN / 2 + 10, 20, mist);

  for (let i = 0; i < kit.q(CROWD.high, CROWD.low); i++) {
    const row = ROWS[i % ROWS.length];
    kit.crowd({ x: (rng() - 0.5) * ROW_SPAN, y: 0, z: row.z - 12, ry: Math.PI / 2, color: rng() < 0.5 ? 0xf2a33a : 0xe8e4dc, hop: 0.1, freq: 7, phase: rng() * 100, walk: 4 + rng() * 8, walkFreq: 0.1 });
  }
  return kit.finish(RADIUS);
}
