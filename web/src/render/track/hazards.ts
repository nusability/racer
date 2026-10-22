import * as THREE from 'three';
import type { Ribbon } from '../../core/track.ts';
import type { Jump, TrackFeature } from '../../core/types.ts';
import { CHASM_DEPTH } from '../../data/tuning.ts';
import type { FlatBuilder, P3 } from './builder.ts';
import { CHASM_FLOOR_EXTRA } from './config.ts';
import type { Corridor } from './corridor.ts';
import { basisAt, box } from './dressing.ts';
import { quadFacing } from './paint.ts';
import { sideIndex } from './shape.ts';

// Everything that warns: chasm pits, lip hazard bands, ramp and kicker chevrons, landing marks
// and the start line. All of it is unlit paint so it reads in any light at 200 m/s.

/** Road paint floats this far above the surface (plus polygon offset) to avoid z-fighting. */
const DECAL_LIFT = 0.04;
const UP: P3 = { x: 0, y: 1, z: 0 };
const EMBER = new THREE.Color(0xff5a14);
const EMBER_DARK = new THREE.Color(0x5a0c04);
/** Hazard pylons at a jump lip: stacked bands, metres. */
const PYLON_BANDS = 9;
const PYLON_BAND = 1.2;
/** Sand rim round a chasm: covers the terrain cells that slope into the pit. */
const RIM = 30;
const RIM_LIFT = 0.3;
/** Size of one square on the chequered start line, metres. */
const CHECKER = 2;

export function buildHazards(cor: Corridor): void {
  for (const j of cor.ribbon.jumps) chasm(cor, j);
  for (const f of cor.view.features) {
    if (f.kind === 'jump') rampChevrons(cor, f);
    if (f.kind === 'kicker') kickerChevrons(cor, f);
  }
  if (cor.view.branch === null) startLine(cor);
}

export function decal(r: Ribbon, g: FlatBuilder, pts: [number, number][], color: THREE.Color): void {
  const w = pts.map(([s, x]) => r.toWorld(s, x, DECAL_LIFT));
  quadFacing(g, w[0], w[1], w[2], w[3], UP, color);
}

/** A chevron painted on the road pointing forward (dir 1) or sideways toward +x (dir 'side'). */
export function chevron(r: Ribbon, g: FlatBuilder, s: number, halfWidth: number, depth: number, thick: number, color: THREE.Color, x = 0): void {
  decal(r, g, [[s, x - halfWidth], [s + thick, x - halfWidth], [s + depth + thick, x], [s + depth, x]], color);
  decal(r, g, [[s + depth, x], [s + depth + thick, x], [s + thick, x + halfWidth], [s, x + halfWidth]], color);
}

function onGround(cor: Corridor, p: P3): P3 {
  return { x: p.x, y: cor.ground.height(p.x, p.z), z: p.z };
}

function lift(p: P3): P3 {
  return { x: p.x, y: p.y + RIM_LIFT, z: p.z };
}

function lastSurface(cor: Corridor, s: number, dir: number): number {
  let k = cor.idx(Math.round(cor.ribbon.wrap(s) / cor.ribbon.step));
  while (cor.ribbon.samples[k].gap) k = cor.idx(k + dir);
  return k;
}

function chasm(cor: Corridor, j: Jump) {
  const r = cor.ribbon;
  const kL = lastSurface(cor, j.lip, -1);
  const kG = lastSurface(cor, j.gapEnd, 1);
  const floorY = Math.min(r.samples[kL].pos.y, r.samples[kG].pos.y) - CHASM_DEPTH - CHASM_FLOOR_EXTRA;
  const env = cor.chunkAt(j.lip).rock;
  const paint = cor.paint;
  const top = new THREE.Color();
  const bottom = new THREE.Color();
  bottom.copy(paint.rockDark).multiplyScalar(0.15);
  // The pit reaches as far as the lip's cross-section on each side.
  const reach = (side: number) => cor.shape.outer[sideIndex(side)][kL] - cor.edge(kL, side);

  // Lip and landing faces: the corridor cross-section dropped straight to the floor.
  for (const [k, dir] of [[kL, 1], [kG, -1]] as const) {
    const t = r.samples[k].tangent;
    const facing = { x: t.x * dir, y: 0, z: t.z * dir };
    const left = cor.profile(k, -1).pts.slice().reverse();
    const right = cor.profile(k, 1).pts;
    const outline = [...left, ...right];
    const away = { x: -facing.x * RIM, z: -facing.z * RIM };
    for (let i = 0; i + 1 < outline.length; i++) {
      const a = outline[i];
      const b = outline[i + 1];
      paint.strata(a.y, 0.85, top);
      quadFacing(env, a, b, { ...b, y: floorY }, { ...a, y: floorY }, facing, top, top, bottom, bottom);
      // Past the lip's crest, a sand rim lips over the edge to hide terrain dipping into the pit.
      if (i < 4 || i >= outline.length - 5) {
        const ao = onGround(cor, { x: a.x + away.x, y: 0, z: a.z + away.z });
        const bo = onGround(cor, { x: b.x + away.x, y: 0, z: b.z + away.z });
        quadFacing(env, lift(a), lift(b), bo, ao, UP, cor.ground.color(a.x, a.z, a.y, 0, top));
      }
    }
    // Bands across the course at the edge: hazard stripes on the lip, white on the landing.
    const xl = -r.samples[k].edgeL;
    const xr = r.samples[k].edgeR;
    const blocks = Math.max(4, Math.round((xr - xl) / 3));
    for (let q = 0; q < blocks; q++) {
      const x0 = xl + ((xr - xl) * q) / blocks;
      const x1 = xl + ((xr - xl) * (q + 1)) / blocks;
      const p = (x: number, y: number) => {
        const w = cor.banked(k, x, y);
        return { x: w.x + facing.x * 0.06, y: w.y, z: w.z + facing.z * 0.06 };
      };
      const color = dir > 0 ? (q % 2 === 0 ? paint.hazard : paint.black) : q % 2 === 0 ? paint.white : paint.accent;
      quadFacing(cor.glow, p(x0, -1.6), p(x1, -1.6), p(x1, 0), p(x0, 0), facing, color);
    }
  }

  // Side walls and the glowing floor, station by station across the gap.
  const stations: number[] = [];
  for (let k = kL; k !== kG; k = cor.idx(k + 1)) {
    if (k === kL || (k - kL + cor.n) % cor.n % cor.stride === 0) stations.push(k);
  }
  stations.push(kG);
  for (let q = 0; q + 1 < stations.length; q++) {
    const a = stations[q];
    const b = stations[q + 1];
    for (const side of [-1, 1]) {
      const ta = onGround(cor, cor.beside(a, side, reach(side), 0));
      const tb = onGround(cor, cor.beside(b, side, reach(side), 0));
      const inward = { x: -side * cor.shape.rx[a], y: 0, z: -side * cor.shape.rz[a] };
      paint.strata(ta.y, 0.8, top);
      quadFacing(env, ta, tb, { ...tb, y: floorY }, { ...ta, y: floorY }, inward, top, top, bottom, bottom);
      const ao = onGround(cor, cor.beside(a, side, reach(side) + RIM, 0));
      const bo = onGround(cor, cor.beside(b, side, reach(side) + RIM, 0));
      quadFacing(env, lift(ta), lift(tb), bo, ao, UP, cor.ground.color(ta.x, ta.z, ta.y, 0, top));
    }
    // Floor: hot in the middle, dark at the walls.
    const xs = [-1, -0.4, 0, 0.4, 1];
    const at = (k: number, f: number) => {
      const side = f < 0 ? -1 : 1;
      if (f === 0) return { ...cor.banked(k, 0, 0), y: floorY };
      const p = cor.beside(k, side, reach(side), 0);
      const c = cor.banked(k, 0, 0);
      const m = Math.abs(f);
      return { x: c.x + (p.x - c.x) * m, y: floorY, z: c.z + (p.z - c.z) * m };
    };
    for (let i = 0; i < 4; i++) {
      const ca = Math.abs(xs[i]) < 0.5 ? EMBER : EMBER_DARK;
      const cb = Math.abs(xs[i + 1]) < 0.5 ? EMBER : EMBER_DARK;
      quadFacing(cor.glow, at(a, xs[i]), at(a, xs[i + 1]), at(b, xs[i + 1]), at(b, xs[i]), UP, ca, cb, cb, ca);
    }
  }

  // Landing zone: bars across the road and side lines so the target reads in the air.
  const land = kG * r.step;
  const half = r.samples[kG].width / 2;
  for (const [d0, d1] of [[6, 9], [14, 16], [21, 22.5]]) {
    decal(r, cor.glow, [[land + d0, -half + 1], [land + d0, half - 1], [land + d1, half - 1], [land + d1, -half + 1]], paint.white);
  }
  for (const side of [-1, 1]) {
    const x = side * (half - 1.5);
    decal(r, cor.glow, [[land, x - 0.6], [land, x + 0.6], [land + 80, x + 0.6], [land + 80, x - 0.6]], paint.accent);
  }
}

function rampChevrons(cor: Corridor, f: Extract<TrackFeature, { kind: 'jump' }>) {
  const r = cor.ribbon;
  const s0 = r.paramToS(f.at);
  const half = r.widthAt(s0) / 2;
  const count = 4;
  for (let i = 0; i < count; i++) {
    const s = s0 + f.rampLength * (0.25 + (0.7 * i) / count);
    chevron(r, cor.glow, s, half * 0.6, 10, 3.5, i % 2 === 0 ? cor.paint.hazard : cor.paint.white);
  }
  // Striped pylons at the lip, on the hard boundary: the chasm is invisible until you're on it.
  const kL = lastSurface(cor, s0 + f.rampLength, -1);
  for (const side of [-1, 1]) {
    const B = basisAt(cor, kL, side, 2.5, r.samples[kL].pos.y);
    for (let j = 0; j < PYLON_BANDS; j++) {
      box(cor.glow, B, 0, 0, 1.4, 1.4, j * PYLON_BAND - 1, PYLON_BAND, j % 2 ? cor.paint.black : cor.paint.hazard);
    }
  }
}

function kickerChevrons(cor: Corridor, f: Extract<TrackFeature, { kind: 'kicker' }>) {
  const r = cor.ribbon;
  const s0 = r.paramToS(f.at);
  const half = r.widthAt(s0) / 2;
  for (let i = 0; i < 2; i++) chevron(r, cor.glow, s0 + f.length * (0.25 + 0.35 * i), half * 0.45, 7, 2.6, cor.paint.hazard);
}

function startLine(cor: Corridor) {
  const r = cor.ribbon;
  const half = r.widthAt(0) / 2;
  const cols = Math.round((2 * half) / CHECKER);
  const w = (2 * half) / cols;
  for (let row = 0; row < 2; row++) {
    for (let c = 0; c < cols; c++) {
      const s = (row - 1) * CHECKER;
      const x = -half + c * w;
      const color = (row + c) % 2 === 0 ? cor.paint.white : cor.paint.black;
      decal(r, cor.glow, [[s, x], [s, x + w], [s + CHECKER, x + w], [s + CHECKER, x]], color);
    }
  }
}
