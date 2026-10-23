import * as THREE from 'three';
import type { FlatBuilder, P3 } from './builder.ts';
import { KERB_BLOCK } from './config.ts';
import type { Chunk, Corridor } from './corridor.ts';
import { DROP_FALL } from './ground.ts';
import { quadFacing, rockQuad } from './paint.ts';

// Road that leaves the ground: loops, corkscrews and bridge decks get guard rails, a structural
// underside and piers; open drops get a sheer face falling away from a hazard-painted edge.

/** Guard rail height and thickness at the hard boundary of a deck. */
const RAIL_HEIGHT = 1.3;
const RAIL_WIDTH = 0.5;
/** Depth of the deck structure under the road surface. */
const DECK_DEPTH = 1.6;
/** Painted hazard band along a drop edge, on the road surface. */
const DROP_BAND = 1.6;
const DROP_BAND_LIFT = 0.04;
/** Piers stand this far apart along a deck, metres. */
const PIER_SPACING = 46;
const PIER_WIDTH = 2.4;
/** Loop and corkscrew frames clear the swept road by this much. */
const FRAME_CLEAR = 7;
const FRAME_BEAM = 1.8;
/** Frames around a loop at these fractions of its span. */
const LOOP_FRAMES = [0.2, 0.35, 0.5, 0.65, 0.8];
/** Corkscrew frames every this many metres. */
const SCREW_FRAME_SPACING = 40;
const STEEL = new THREE.Color(0x5b6168);
const STEEL_DARK = new THREE.Color(0x34383e);

/** Rails, underside and side faces of a deck between stations a and b. */
export function deckStrip(cor: Corridor, c: Chunk, a: number, b: number): void {
  const up = (k: number): P3 => cor.ribbon.samples[cor.idx(k)].up;
  const down = (k: number): P3 => ({ x: -up(k).x, y: -up(k).y, z: -up(k).z });
  const L = (k: number) => -cor.edge(k, -1) - RAIL_WIDTH;
  const R = (k: number) => cor.edge(k, 1) + RAIL_WIDTH;
  // Underside.
  quadFacing(c.rock, cor.banked(a, L(a), -DECK_DEPTH), cor.banked(a, R(a), -DECK_DEPTH), cor.banked(b, R(b), -DECK_DEPTH), cor.banked(b, L(b), -DECK_DEPTH), down(a), STEEL_DARK);
  const block = Math.floor((((a + b) / 2) * cor.ribbon.step) / KERB_BLOCK) % 2 === 0;
  for (const side of [-1, 1]) {
    const inner = (k: number) => side * cor.edge(k, side);
    const outer = (k: number) => (side < 0 ? L(k) : R(k));
    const r = cor.ribbon.samples[cor.idx(a)].right;
    const out = { x: r.x * side, y: r.y * side, z: r.z * side };
    const inward = { x: -out.x, y: -out.y, z: -out.z };
    // Inner face of the rail, painted so the edge reads at speed (unlit).
    quadFacing(cor.glow, cor.banked(a, inner(a), 0), cor.banked(b, inner(b), 0), cor.banked(b, inner(b), RAIL_HEIGHT), cor.banked(a, inner(a), RAIL_HEIGHT), inward, block ? cor.paint.accent : cor.paint.white);
    // Rail top and the outer face down to the bottom of the deck.
    quadFacing(c.rock, cor.banked(a, inner(a), RAIL_HEIGHT), cor.banked(b, inner(b), RAIL_HEIGHT), cor.banked(b, outer(b), RAIL_HEIGHT), cor.banked(a, outer(a), RAIL_HEIGHT), up(a), STEEL);
    quadFacing(c.rock, cor.banked(a, outer(a), -DECK_DEPTH), cor.banked(b, outer(b), -DECK_DEPTH), cor.banked(b, outer(b), RAIL_HEIGHT), cor.banked(a, outer(a), RAIL_HEIGHT), out, STEEL_DARK, STEEL);
  }
}

/** A sheer face from the road edge down past where the ground fell away, and the hazard band. */
export function dropFace(cor: Corridor, c: Chunk, a: number, b: number, side: number): void {
  const kk = cor.idx(a);
  const out = { x: cor.shape.rx[kk] * side, y: 0, z: cor.shape.rz[kk] * side };
  const top = (k: number) => cor.banked(k, side * cor.edge(k, side), 0);
  const foot = (k: number): P3 => {
    const p = top(k);
    return { x: p.x, y: cor.shape.gy[cor.idx(k)] - DROP_FALL - 4, z: p.z };
  };
  rockQuad(c.rock, cor.paint, foot(a), foot(b), top(b), top(a), out, 0.7);
  // Chevron band on the road surface along the edge: yellow and black, unlit.
  const block = Math.floor((((a + b) / 2) * cor.ribbon.step) / (KERB_BLOCK / 2)) % 2 === 0;
  const lift = (k: number, x: number): P3 => cor.banked(k, x, DROP_BAND_LIFT);
  const e = (k: number) => side * cor.edge(k, side);
  const i = (k: number) => side * (cor.edge(k, side) - DROP_BAND);
  quadFacing(cor.glow, lift(a, i(a)), lift(b, i(b)), lift(b, e(b)), lift(a, e(a)), cor.ribbon.samples[kk].up, block ? cor.paint.hazard : cor.paint.black);
}

/** Piers under bridge decks, frames round loops and corkscrews. */
export function buildSupports(cor: Corridor): void {
  const r = cor.ribbon;
  const sh = cor.shape;
  const every = Math.round(PIER_SPACING / r.step);
  for (let k = 0; k < cor.n; k++) {
    if (!sh.bridge[k] || k % every !== 0) continue;
    pier(cor, k);
  }
  for (const f of cor.view.features) {
    if (f.kind === 'loop') {
      const s0 = r.paramToS(f.at);
      for (const t of LOOP_FRAMES) frame(cor, Math.round((s0 + f.span * t) / r.step), Math.abs(f.shift));
    }
    if (f.kind === 'corkscrew') {
      const s0 = r.paramToS(f.from);
      const s1 = r.paramToS(f.to);
      for (let s = s0 + SCREW_FRAME_SPACING / 2; s < s1; s += SCREW_FRAME_SPACING) frame(cor, Math.round(s / r.step), 0);
    }
  }
}

/** A pier from the ground to the deck's underside, standing clear of the road below. */
function pier(cor: Corridor, k: number) {
  const kk = cor.idx(k);
  const smp = cor.ribbon.samples[kk];
  const c = cor.chunkAt(smp.s);
  const top = cor.banked(kk, 0, -1);
  if (!cor.ground.clearOfCourse(top.x, top.z, 2)) return;
  const g = cor.ground.height(top.x, top.z) - 2;
  if (top.y - g < 3) return;
  column(c.rock, top.x, top.z, g, top.y, PIER_WIDTH, cor.shape.rx[kk], cor.shape.rz[kk]);
  // A cross-head under the deck.
  const a = cor.banked(kk, -smp.width / 2, -1);
  const b = cor.banked(kk, smp.width / 2, -1);
  quadFacing(c.rock, { ...a, y: a.y - FRAME_BEAM }, { ...b, y: b.y - FRAME_BEAM }, b, a, { x: smp.tangent.x, y: 0, z: smp.tangent.z }, STEEL_DARK, STEEL);
  quadFacing(c.rock, { ...a, y: a.y - FRAME_BEAM }, { ...b, y: b.y - FRAME_BEAM }, b, a, { x: -smp.tangent.x, y: 0, z: -smp.tangent.z }, STEEL_DARK, STEEL);
}

/**
 * A gantry the road runs through: two columns outside everything the road sweeps (the loop's
 * sideways shift included) and a beam over the top of the road's highest point at that station.
 */
function frame(cor: Corridor, k: number, shift: number) {
  const kk = cor.idx(k);
  const smp = cor.ribbon.samples[kk];
  const c = cor.chunkAt(smp.s);
  const rx = cor.shape.rx[kk];
  const rz = cor.shape.rz[kk];
  const reach = Math.max(cor.edge(kk, -1), cor.edge(kk, 1)) + RAIL_WIDTH + FRAME_CLEAR + shift;
  // The highest point of the cross-section at this station (road or its back, rails included).
  let topY = -Infinity;
  for (const x of [-reach, 0, reach]) for (const y of [-DECK_DEPTH, RAIL_HEIGHT]) topY = Math.max(topY, cor.banked(kk, Math.max(-smp.width / 2, Math.min(smp.width / 2, x)), y).y);
  topY += FRAME_CLEAR * 0.5;
  const mid = { x: cor.shape.gx[kk], z: cor.shape.gz[kk] };
  // For a loop the sideways shift is to the right of the entry centreline.
  const centre = shift > 0 ? { x: mid.x + rx * (shift / 2), z: mid.z + rz * (shift / 2) } : { x: smp.pos.x, z: smp.pos.z };
  const legs: P3[] = [];
  for (const side of [-1, 1]) {
    const x = centre.x + rx * side * (reach - shift / 2);
    const z = centre.z + rz * side * (reach - shift / 2);
    const g = cor.ground.height(x, z) - 2;
    column(c.rock, x, z, g, topY, FRAME_BEAM, rx, rz);
    legs.push({ x, y: topY, z });
  }
  const [a, b] = legs;
  const fw = { x: (-rz * FRAME_BEAM) / 2, y: 0, z: (rx * FRAME_BEAM) / 2 };
  const lo = (p: P3, s: number): P3 => ({ x: p.x + fw.x * s, y: p.y, z: p.z + fw.z * s });
  const hi = (p: P3, s: number): P3 => ({ x: p.x + fw.x * s, y: p.y + FRAME_BEAM, z: p.z + fw.z * s });
  quadFacing(c.rock, lo(a, 1), lo(b, 1), hi(b, 1), hi(a, 1), { x: fw.x, y: 0, z: fw.z }, STEEL);
  quadFacing(c.rock, lo(a, -1), lo(b, -1), hi(b, -1), hi(a, -1), { x: -fw.x, y: 0, z: -fw.z }, STEEL);
  quadFacing(c.rock, hi(a, -1), hi(b, -1), hi(b, 1), hi(a, 1), { x: 0, y: 1, z: 0 }, cor.paint.accent);
  quadFacing(c.rock, lo(a, -1), lo(b, -1), lo(b, 1), lo(a, 1), { x: 0, y: -1, z: 0 }, STEEL_DARK);
}

/** A square steel column from y0 to y1, aligned with the course's right vector. */
function column(b: FlatBuilder, x: number, z: number, y0: number, y1: number, w: number, rx: number, rz: number) {
  const h = w / 2;
  const fx = -rz;
  const fz = rx;
  const corner = (u: number, v: number, y: number): P3 => ({ x: x + rx * u * h + fx * v * h, y, z: z + rz * u * h + fz * v * h });
  const sides: [number, number, number, number][] = [
    [-1, -1, 1, -1],
    [1, -1, 1, 1],
    [1, 1, -1, 1],
    [-1, 1, -1, -1],
  ];
  for (const [u0, v0, u1, v1] of sides) {
    const out = { x: rx * (u0 + u1) + fx * (v0 + v1), y: 0, z: rz * (u0 + u1) + fz * (v0 + v1) };
    quadFacing(b, corner(u0, v0, y0), corner(u1, v1, y0), corner(u1, v1, y1), corner(u0, v0, y1), out, STEEL_DARK, STEEL);
  }
}

