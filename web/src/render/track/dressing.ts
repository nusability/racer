import * as THREE from 'three';
import { mulberry32 } from '../../core/rng.ts';
import type { FlatBuilder, P3 } from './builder.ts';
import { RUNOFF_MIN, CHEVRON_RADIUS, CHEVRON_SPACING, FLAG_SPACING, MARKER_SPACING, START_ZONE } from './config.ts';
import type { Corridor } from './corridor.ts';
import { sideIndex } from './shape.ts';
import { quadFacing } from './paint.ts';

// Trackside furniture: the start gantry, grandstands, flags, distance markers and corner
// chevron boards. Lit props go into one merged mesh; their faces that must pop go into glow.

const GANTRY_HEIGHT = 17;
const GANTRY_BEAM = 4;
const STAND_TIERS = 7;
/** Length of a crowd stand on the outside of a corner, metres. */
const CORNER_STAND = 90;
const STAND_TIER_DEPTH = 3.2;
const STAND_TIER_RISE = 2.1;
/** Grandstand front edge, metres past the road edge (clear of barrier and shoulder lip). */
const STAND_SETBACK = 26;
/** Width of one crowd cell along a tier, metres. */
const CROWD_CELL = 2.4;
const CROWD_COLOURS = [0xe84a3a, 0xf2c94c, 0x3a7be8, 0xf4f0e8, 0x2bb673, 0xe87ad8, 0x22201e, 0xff8a3a];

export interface Basis {
  o: P3;
  /** Horizontal right and forward unit vectors. */
  r: P3;
  f: P3;
}

/** Ground-standing frame beside the road at sample k: world-up, track-aligned. */
export function basisAt(cor: Corridor, k: number, side: number, dx: number, y?: number): Basis {
  const kk = cor.idx(k);
  const rx = cor.shape.rx[kk];
  const rz = cor.shape.rz[kk];
  const o = cor.beside(kk, side, dx, 0);
  o.y = y ?? cor.ground.height(o.x, o.z);
  return { o, r: { x: rx, y: 0, z: rz }, f: { x: rz, y: 0, z: -rx } };
}

function at(B: Basis, x: number, y: number, z: number): P3 {
  return { x: B.o.x + B.r.x * x + B.f.x * z, y: B.o.y + y, z: B.o.z + B.r.z * x + B.f.z * z };
}

/** Axis-aligned box in a basis: x across, z along, y up from y0. */
export function box(b: FlatBuilder, B: Basis, x: number, z: number, w: number, d: number, y0: number, h: number, color: THREE.Color) {
  const c = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
    at(B, x + (i & 1 ? w / 2 : -w / 2), y0 + (i & 4 ? h : 0), z + (i & 2 ? d / 2 : -d / 2)),
  );
  const centre = at(B, x, y0 + h / 2, z);
  const faces = [
    [0, 1, 3, 2],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 3, 7, 5],
  ];
  for (const [p, q, r, s] of faces) {
    const m = { x: (c[p].x + c[r].x) / 2, y: (c[p].y + c[r].y) / 2, z: (c[p].z + c[r].z) / 2 };
    quadFacing(b, c[p], c[q], c[r], c[s], { x: m.x - centre.x, y: m.y - centre.y, z: m.z - centre.z }, color);
  }
}

/** Vertical panel in the basis facing -f (toward oncoming racers) unless flipped. */
function panel(b: FlatBuilder, B: Basis, x0: number, x1: number, y0: number, y1: number, z: number, color: THREE.Color, facing = -1) {
  const dir = { x: B.f.x * facing, y: 0, z: B.f.z * facing };
  quadFacing(b, at(B, x0, y0, z), at(B, x1, y0, z), at(B, x1, y1, z), at(B, x0, y1, z), dir, color);
}

export function buildDressing(cor: Corridor, props: FlatBuilder, seed: number, cornerStands: number): void {
  const rng = mulberry32(seed ^ 0x7a11);
  gantry(cor, props);
  grandstands(cor, props, rng, cornerStands);
  flags(cor, props);
  markers(cor, props);
  chevronBoards(cor, props);
}

function gantry(cor: Corridor, props: FlatBuilder) {
  const p = cor.paint;
  const s0 = cor.ribbon.samples[0];
  // The gantry spans the whole course, boundary to boundary, so nothing stands on drivable sand.
  const half = Math.max(s0.edgeL, s0.edgeR);
  const B = basisAt(cor, 0, 1, 0, s0.pos.y);
  B.o = { ...s0.pos };
  const dark = p.black.clone().multiplyScalar(2.2);
  for (const side of [-1, 1]) box(props, B, side * (half + 3), 0, 3, 3, -3, GANTRY_HEIGHT + 3, dark);
  box(props, B, 0, 0, 2 * half + 9, 3, GANTRY_HEIGHT - GANTRY_BEAM, GANTRY_BEAM, dark);
  // Banner faces both ways, chequer strip below it, accent stripe above.
  for (const facing of [-1, 1]) {
    const z = facing * 1.55;
    panel(cor.glow, B, -half - 4, half + 4, GANTRY_HEIGHT - GANTRY_BEAM + 0.9, GANTRY_HEIGHT - 0.4, z, p.accent, facing);
    const squares = 24;
    for (let i = 0; i < squares; i++) {
      const x0 = -half - 4 + ((2 * half + 8) * i) / squares;
      const x1 = -half - 4 + ((2 * half + 8) * (i + 1)) / squares;
      for (let r = 0; r < 2; r++) {
        const y0 = GANTRY_HEIGHT - GANTRY_BEAM + r * 0.45;
        panel(cor.glow, B, x0, x1, y0, y0 + 0.45, z, (i + r) % 2 ? p.white : p.black, facing);
      }
    }
  }
}

/** Stands at the start, plus crowds on the outside of the tightest corners. */
function grandstands(cor: Corridor, props: FlatBuilder, rng: () => number, cornerStands: number) {
  const track = cor.ribbon;
  const p = cor.paint;
  const crowd = CROWD_COLOURS.map((c) => new THREE.Color(c));
  const concrete = p.white.clone().multiplyScalar(0.62);
  const roofCol = p.accent.clone().multiplyScalar(0.9);
  const runs: [number, number, number][] = [
    [-1, -START_ZONE + 40, -60],
    [1, 40, START_ZONE - 60],
    [1, -START_ZONE + 60, -90],
  ];
  // Corner apexes: the sharpest curvature peaks, well apart, with open sand on the outside.
  const n = track.samples.length;
  const peaks: number[] = [];
  for (let k = 0; k < n; k++) {
    const c = Math.abs(track.samples[k].curvature);
    if (c < 1 / CHEVRON_RADIUS) continue;
    let isPeak = true;
    for (let d = -40; d <= 40 && isPeak; d++) if (Math.abs(track.samples[(k + d + n) % n].curvature) > c) isPeak = false;
    if (isPeak) peaks.push(k);
  }
  peaks.sort((a, b) => Math.abs(track.samples[b].curvature) - Math.abs(track.samples[a].curvature));
  for (const k of peaks) {
    if (runs.length - 3 >= cornerStands) break;
    const side = track.samples[k].curvature > 0 ? -1 : 1;
    const s = k * track.step;
    let ok = s > START_ZONE * 2 && s < track.length - START_ZONE * 2;
    for (let d = -CORNER_STAND / 2; d <= CORNER_STAND / 2 && ok; d += CROWD_CELL) ok = usable(cor, Math.round((s + d) / track.step), side);
    if (ok) runs.push([side, s - CORNER_STAND / 2, s + CORNER_STAND / 2]);
  }
  for (const [side, s0, s1] of runs) {
    const cells = Math.round((s1 - s0) / CROWD_CELL);
    for (let c = 0; c < cells; c++) {
      const s = s0 + (c + 0.5) * CROWD_CELL;
      const k = Math.round(track.wrap(s) / track.step);
      const B = basisAt(cor, k, side, 0);
      for (let t = 0; t < STAND_TIERS; t++) {
        const x = side * (STAND_SETBACK + (t + 0.5) * STAND_TIER_DEPTH);
        box(props, B, x, 0, STAND_TIER_DEPTH, CROWD_CELL, -4, 4 + t * STAND_TIER_RISE, concrete);
        const fans = crowd[Math.floor(rng() * crowd.length)];
        box(props, B, x - side * 0.6, 0, 1.2, CROWD_CELL * 0.8, t * STAND_TIER_RISE, 0.9 + rng() * 0.5, fans);
      }
      if (c % 6 === 0) {
        const xBack = side * (STAND_SETBACK + STAND_TIERS * STAND_TIER_DEPTH);
        box(props, B, xBack, 0, 0.5, 0.5, 0, STAND_TIERS * STAND_TIER_RISE + 6, concrete);
      }
      const roofY = STAND_TIERS * STAND_TIER_RISE + 5.5;
      box(props, B, side * (STAND_SETBACK + (STAND_TIERS * STAND_TIER_DEPTH) / 2 + 1), 0, STAND_TIERS * STAND_TIER_DEPTH + 4, CROWD_CELL, roofY, 0.6, c % 2 ? roofCol : p.white);
    }
  }
}

function flags(cor: Corridor, props: FlatBuilder) {
  const track = cor.ribbon;
  const p = cor.paint;
  const pole = p.white.clone().multiplyScalar(0.8);
  let i = 0;
  for (let s = -START_ZONE; s <= START_ZONE; s += FLAG_SPACING, i++) {
    const k = Math.round(track.wrap(s) / track.step) % track.samples.length;
    for (const side of [-1, 1]) {
      if (!usable(cor, k, side)) continue;
      const B = basisAt(cor, k, side, 6);
      box(props, B, 0, 0, 0.35, 0.35, -1, 11, pole);
      const flag = (i + (side > 0 ? 1 : 0)) % 2 ? p.accent : p.white;
      panel(cor.glow, B, -side * 0.2, -side * 3.6, 7.6, 10.6, 0, flag, -1);
      panel(cor.glow, B, -side * 0.2, -side * 3.6, 7.6, 10.6, 0, flag, 1);
    }
  }
}

/** Room beside the course for a prop: open run-off on that side, no chasm, tunnel or junction. */
function usable(cor: Corridor, k: number, side: number): boolean {
  const kk = cor.idx(k);
  return !cor.ribbon.samples[kk].gap && !cor.tunnel(kk) && !cor.open(kk, side) && cor.shape.run[sideIndex(side)][kk] >= RUNOFF_MIN;
}

/** Posts every MARKER_SPACING: tall accent boards each kilometre, white ones between. */
function markers(cor: Corridor, props: FlatBuilder) {
  const track = cor.ribbon;
  const p = cor.paint;
  const post = p.black.clone().multiplyScalar(2);
  for (let s = MARKER_SPACING; s < track.length - START_ZONE; s += MARKER_SPACING) {
    const k = Math.round(s / track.step);
        const km = Math.round(s / MARKER_SPACING) % 2 === 0;
    for (const side of [-1, 1]) {
      if (!usable(cor, k, side)) continue;
      const B = basisAt(cor, k, side, 5);
      const h = km ? 10 : 7;
      box(props, B, 0, 0, 0.5, 0.5, -1, h, post);
      panel(cor.glow, B, -1.6, 1.6, h - 3, h, -0.3, km ? p.accent : p.white);
      panel(cor.glow, B, -1.2, 1.2, h - 2.2, h - 1.6, -0.35, p.black);
    }
  }
}

/** Chevron boards on the outside of tight corners, pointing the way round. */
function chevronBoards(cor: Corridor, props: FlatBuilder) {
  const track = cor.ribbon;
  const p = cor.paint;
  const back = p.black.clone().multiplyScalar(1.4);
  const n = track.samples.length;
  const every = Math.round(CHEVRON_SPACING / track.step);
  for (let k = 0; k < n; k += every) {
    const curv = track.samples[k].curvature;
    if (Math.abs(curv) < 1 / CHEVRON_RADIUS) continue;
    const side = curv > 0 ? -1 : 1;
    const turn = -side;
    if (!usable(cor, k, side)) continue;
    const B = basisAt(cor, k, side, 4.5);
    box(props, B, 0, 0.4, 0.3, 0.3, -1, 2.2, back);
    box(props, B, 2.2, 0.4, 0.3, 0.3, -1, 2.2, back);
    panel(cor.glow, B, -1.6, 3.8, 1.2, 4.6, 0, p.black);
    for (let c = 0; c < 2; c++) {
      const x0 = -0.9 + c * 2.4;
      const tip = x0 + turn * 0.9 + (turn > 0 ? 0 : 1.5);
      const base = tip - turn * 0.9;
      quadFacing(cor.glow, at(B, base, 1.5, -0.05), at(B, base + turn * 0.6, 1.5, -0.05), at(B, tip + turn * 0.6, 2.9, -0.05), at(B, tip, 2.9, -0.05), { x: -B.f.x, y: 0, z: -B.f.z }, p.hazard);
      quadFacing(cor.glow, at(B, tip, 2.9, -0.05), at(B, tip + turn * 0.6, 2.9, -0.05), at(B, base + turn * 0.6, 4.3, -0.05), at(B, base, 4.3, -0.05), { x: -B.f.x, y: 0, z: -B.f.z }, p.hazard);
    }
  }
}
