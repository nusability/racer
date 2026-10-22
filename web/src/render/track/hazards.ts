import * as THREE from 'three';
import type { Track } from '../../core/track.ts';
import type { Jump, TrackFeature } from '../../core/types.ts';
import { CHASM_DEPTH } from '../../data/tuning.ts';
import type { FlatBuilder, P3 } from './builder.ts';
import { CHASM_FLOOR_EXTRA, CHASM_SIDE } from './config.ts';
import type { Corridor } from './corridor.ts';
import { basisAt, box } from './dressing.ts';
import { quadFacing } from './paint.ts';

// Everything that warns: chasm pits, lip hazard bands, ramp and kicker chevrons, landing marks
// and the start line. All of it is unlit paint so it reads in any light at 200 m/s.

/** Road paint floats this far above the surface (plus polygon offset) to avoid z-fighting. */
const DECAL_LIFT = 0.04;
const UP: P3 = { x: 0, y: 1, z: 0 };
const EMBER = new THREE.Color(0xff5a14);
const EMBER_DARK = new THREE.Color(0x5a0c04);
/** Spacing of outline points where a crack crosses open ground, metres. */
const CRACK_STEP = 16;
/** Hazard pylons at a jump lip: stacked bands, metres. */
const PYLON_BANDS = 9;
const PYLON_BAND = 1.2;
/** Sand rim round a chasm: covers the terrain cells that slope into the pit. */
const RIM = 30;
const RIM_LIFT = 0.3;
/** Size of one square on the chequered start line, metres. */
const CHECKER = 2;

export function buildHazards(cor: Corridor): void {
  const track = cor.track;
  for (const j of track.jumps) chasm(cor, j);
  for (const f of track.def.features) {
    if (f.kind === 'jump') rampChevrons(cor, f);
    if (f.kind === 'kicker') kickerChevrons(cor, f);
  }
  startLine(cor);
}

function decal(track: Track, g: FlatBuilder, pts: [number, number][], color: THREE.Color) {
  const w = pts.map(([s, x]) => track.toWorld(s, x, DECAL_LIFT));
  quadFacing(g, w[0], w[1], w[2], w[3], UP, color);
}

/** A forward-pointing chevron painted on the road: tip at s + depth. */
function chevron(track: Track, g: FlatBuilder, s: number, halfWidth: number, depth: number, thick: number, color: THREE.Color) {
  decal(track, g, [[s, -halfWidth], [s + thick, -halfWidth], [s + depth + thick, 0], [s + depth, 0]], color);
  decal(track, g, [[s + depth, 0], [s + depth + thick, 0], [s + thick, halfWidth], [s, halfWidth]], color);
}

function onGround(cor: Corridor, p: P3): P3 {
  return { x: p.x, y: cor.ground.height(p.x, p.z), z: p.z };
}

function lift(p: P3): P3 {
  return { x: p.x, y: p.y + RIM_LIFT, z: p.z };
}

function lastSurface(track: Track, s: number, dir: number): number {
  const n = track.samples.length;
  let k = Math.round(track.wrap(s) / track.step) % n;
  while (track.samples[k].gap) k = (k + dir + n) % n;
  return k;
}

function chasm(cor: Corridor, j: Jump) {
  const track = cor.track;
  const n = track.samples.length;
  const kL = lastSurface(track, j.lip, -1);
  const kG = lastSurface(track, j.gapEnd, 1);
  const floorY = Math.min(track.samples[kL].pos.y, track.samples[kG].pos.y) - CHASM_DEPTH - CHASM_FLOOR_EXTRA;
  const env = cor.envAt(j.lip);
  const paint = cor.paint;
  const top = new THREE.Color();
  const bottom = new THREE.Color();

  // Lip and landing faces: the corridor cross-section dropped straight to the floor.
  for (const [k, dir] of [[kL, 1], [kG, -1]] as const) {
    const t = track.samples[k].tangent;
    const facing = { x: t.x * dir, y: 0, z: t.z * dir };
    // The crack runs on past the corridor: extend the outline across open ground.
    const past = (side: number) => {
      const pts: P3[] = [];
      for (let dx = cor.shape.reach[k] + CRACK_STEP; dx < CHASM_SIDE + CRACK_STEP / 2; dx += CRACK_STEP) {
        pts.push(onGround(cor, cor.beside(k, side, Math.min(dx, CHASM_SIDE), 0)));
      }
      // One more point past the side wall so the rim flange turns the corner.
      pts.push(onGround(cor, cor.beside(k, side, CHASM_SIDE + RIM, 0)));
      return pts;
    };
    const pl = past(-1).reverse();
    const pr = past(1);
    const outline = [...pl, ...cor.profile(k, -1).pts.slice().reverse(), ...cor.profile(k, 1).pts, ...pr];
    const away = { x: -facing.x * RIM, z: -facing.z * RIM };
    for (let i = 0; i + 1 < outline.length; i++) {
      const a = outline[i];
      const b = outline[i + 1];
      const open = i < pl.length - 1 || i >= outline.length - pr.length;
      if (open || i === pl.length - 1 || i === outline.length - pr.length - 1) {
        // Sand rim lipping over the edge hides the terrain where it dips into the pit.
        const ao = onGround(cor, { x: a.x + away.x, y: 0, z: a.z + away.z });
        const bo = onGround(cor, { x: b.x + away.x, y: 0, z: b.z + away.z });
        quadFacing(env, lift(a), lift(b), bo, ao, UP, cor.ground.color(a.x, a.z, a.y, 0, top));
      }
      if (i === 0 || i === outline.length - 2) continue;
      paint.strata(a.y, 0.85, top);
      bottom.copy(paint.rockDark).multiplyScalar(0.15);
      quadFacing(env, a, b, { ...b, y: floorY }, { ...a, y: floorY }, facing, top, top, bottom, bottom);
    }
    // Bands across the road at the edge: hazard stripes on the lip, white on the landing.
    const half = track.samples[k].width / 2;
    const blocks = Math.max(4, Math.round((2 * half) / 2.5));
    for (let q = 0; q < blocks; q++) {
      const x0 = -half + (2 * half * q) / blocks;
      const x1 = -half + (2 * half * (q + 1)) / blocks;
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
  for (let k = kL; k !== kG; k = (k + 1) % n) {
    if (k === kL || (k - kL + n) % n % cor.stride === 0) stations.push(k);
  }
  stations.push(kG);
  for (let q = 0; q + 1 < stations.length; q++) {
    const a = stations[q];
    const b = stations[q + 1];
    for (const side of [-1, 1]) {
      const ta = cor.beside(a, side, CHASM_SIDE, 0);
      const tb = cor.beside(b, side, CHASM_SIDE, 0);
      ta.y = cor.ground.height(ta.x, ta.z);
      tb.y = cor.ground.height(tb.x, tb.z);
      const inward = { x: -side * cor.shape.rx[a], y: 0, z: -side * cor.shape.rz[a] };
      paint.strata(ta.y, 0.8, top);
      bottom.copy(paint.rockDark).multiplyScalar(0.15);
      quadFacing(env, ta, tb, { ...tb, y: floorY }, { ...ta, y: floorY }, inward, top, top, bottom, bottom);
      const ao = onGround(cor, cor.beside(a, side, CHASM_SIDE + RIM, 0));
      const bo = onGround(cor, cor.beside(b, side, CHASM_SIDE + RIM, 0));
      quadFacing(env, lift(ta), lift(tb), bo, ao, UP, cor.ground.color(ta.x, ta.z, ta.y, 0, top));
    }
    // Floor: hot in the middle, dark at the walls.
    const span = track.samples[a].width / 2 + CHASM_SIDE;
    const xs = [-span, -span * 0.4, 0, span * 0.4, span];
    for (let i = 0; i < 4; i++) {
      const p = (k: number, x: number) => ({ ...cor.beside(k, Math.sign(x) || 1, Math.abs(x) - track.samples[k].width / 2, 0), y: floorY });
      const pa0 = xs[i] === 0 ? { ...cor.banked(a, 0, 0), y: floorY } : p(a, xs[i]);
      const pa1 = xs[i + 1] === 0 ? { ...cor.banked(a, 0, 0), y: floorY } : p(a, xs[i + 1]);
      const pb0 = xs[i] === 0 ? { ...cor.banked(b, 0, 0), y: floorY } : p(b, xs[i]);
      const pb1 = xs[i + 1] === 0 ? { ...cor.banked(b, 0, 0), y: floorY } : p(b, xs[i + 1]);
      const ca = Math.abs(xs[i]) / span < 0.5 ? EMBER : EMBER_DARK;
      const cb = Math.abs(xs[i + 1]) / span < 0.5 ? EMBER : EMBER_DARK;
      quadFacing(cor.glow, pa0, pa1, pb1, pb0, UP, ca, cb, cb, ca);
    }
  }

  // Landing zone: bars across the road and side lines so the target reads in the air.
  const land = kG * track.step;
  const half = track.samples[kG].width / 2;
  for (const [d0, d1] of [[6, 9], [14, 16], [21, 22.5]]) {
    decal(track, cor.glow, [[land + d0, -half + 1], [land + d0, half - 1], [land + d1, half - 1], [land + d1, -half + 1]], paint.white);
  }
  for (const side of [-1, 1]) {
    const x = side * (half - 1.5);
    decal(track, cor.glow, [[land, x - 0.6], [land, x + 0.6], [land + 80, x + 0.6], [land + 80, x - 0.6]], paint.accent);
  }
}

function rampChevrons(cor: Corridor, f: Extract<TrackFeature, { kind: 'jump' }>) {
  const track = cor.track;
  const s0 = track.paramToS(f.at);
  const half = track.widthAt(s0) / 2;
  const count = 4;
  for (let i = 0; i < count; i++) {
    const s = s0 + f.rampLength * (0.25 + (0.7 * i) / count);
    chevron(track, cor.glow, s, half * 0.6, 10, 3.5, i % 2 === 0 ? cor.paint.hazard : cor.paint.white);
  }
  // Striped pylons either side of the lip: the chasm itself is invisible until you're on it.
  const kL = lastSurface(track, s0 + f.rampLength, -1);
  for (const side of [-1, 1]) {
    const B = basisAt(cor, kL, side, 2.5, track.samples[kL].pos.y);
    for (let j = 0; j < PYLON_BANDS; j++) {
      box(cor.glow, B, 0, 0, 1.4, 1.4, j * PYLON_BAND - 1, PYLON_BAND, j % 2 ? cor.paint.black : cor.paint.hazard);
    }
  }
}

function kickerChevrons(cor: Corridor, f: Extract<TrackFeature, { kind: 'kicker' }>) {
  const track = cor.track;
  const s0 = track.paramToS(f.at);
  const half = track.widthAt(s0) / 2;
  for (let i = 0; i < 2; i++) chevron(track, cor.glow, s0 + f.length * (0.25 + 0.35 * i), half * 0.45, 7, 2.6, cor.paint.hazard);
}

function startLine(cor: Corridor) {
  const track = cor.track;
  const half = track.widthAt(0) / 2;
  const cols = Math.round((2 * half) / CHECKER);
  const w = (2 * half) / cols;
  for (let row = 0; row < 2; row++) {
    for (let c = 0; c < cols; c++) {
      const s = (row - 1) * CHECKER;
      const x = -half + c * w;
      const color = (row + c) % 2 === 0 ? cor.paint.white : cor.paint.black;
      decal(track, cor.glow, [[s, x], [s, x + w], [s + CHECKER, x + w], [s + CHECKER, x]], color);
    }
  }
}
