import * as THREE from 'three';
import type { FlatBuilder, P3 } from './builder.ts';
import { KERB_BLOCK, LIT_EDGE_BLOCKS } from './config.ts';
import type { Chunk, Corridor } from './corridor.ts';
import { DROP_FALL } from './ground.ts';
import { quadFacing, rockQuad } from './paint.ts';
import { beatIndex } from './rhythm.ts';

// Road that leaves the ground: loops, corkscrews and bridge decks get guard rails, a structural
// underside and piers; open drops get a sheer face falling away from a hazard-painted edge.
// With no ground at all (a deck in the void) nothing can stand on anything: the frames round a
// loop or a corkscrew close underneath into rings, joined by stringers into one floating cage
// held by thruster pods, and a bridge deck hangs from its own structure without piers.

/** Guard rail height and thickness at the hard boundary of a deck. */
const RAIL_HEIGHT = 1.3;
const RAIL_WIDTH = 0.5;
/** Depth of the deck structure under the road surface. */
const DECK_DEPTH = 1.6;
/** Painted hazard band along a drop edge, on the road surface. */
const DROP_BAND = 1.6;
const DROP_BAND_LIFT = 0.04;
/** Line of light along the top of a rail hanging in the void, metres tall. */
const RAIL_LIGHT = 0.22;
/** Lit strip along a deck's open edge, metres wide. */
const EDGE_LIGHT = 0.7;
/** Piers stand this far apart along a deck, metres. */
const PIER_SPACING = 46;
const PIER_WIDTH = 2.4;
/** Loop and corkscrew frames clear the swept road by this much. */
const FRAME_CLEAR = 7;
const FRAME_BEAM = 1.8;
/** Frames around a loop at these fractions of its road. */
const LOOP_FRAMES = [0.2, 0.35, 0.5, 0.65, 0.8];
/** Corkscrew frames every this many metres. */
const SCREW_FRAME_SPACING = 40;
/** A ring in the void: its light strips (share of the beam), stringers between rings, the thruster pods on its lower corners. */
const RING_LIGHT = 0.35;
const STRINGER = 0.9;
const POD = 2.6;
const STEEL = new THREE.Color(0x5b6168);
const STEEL_DARK = new THREE.Color(0x34383e);

/** Rails, underside and side faces of a deck between stations a and b. */
export function deckStrip(cor: Corridor, c: Chunk, a: number, b: number): void {
  const up = (k: number): P3 => cor.ribbon.samples[cor.idx(k)].up;
  const down = (k: number): P3 => ({ x: -up(k).x, y: -up(k).y, z: -up(k).z });
  const L = (k: number) => -cor.edge(k, -1) - RAIL_WIDTH;
  const R = (k: number) => cor.edge(k, 1) + RAIL_WIDTH;
  // Underside: plain steel, left to the light to darken. A loop or corkscrew turns it to face
  // the racers coming in, so a colour with the shade baked in reads as a black hole there.
  quadFacing(c.rock, cor.banked(a, L(a), -DECK_DEPTH), cor.banked(a, R(a), -DECK_DEPTH), cor.banked(b, R(b), -DECK_DEPTH), cor.banked(b, L(b), -DECK_DEPTH), down(a), STEEL);
  const mid = ((a + b) / 2) * cor.ribbon.step;
  // In the void the rails and open edges are lines of light (below): uneven blocks, so they never strobe.
  const block = (cor.hanging ? beatIndex(LIT_EDGE_BLOCKS, cor.ribbon.length, mid) + 1 : Math.floor(mid / KERB_BLOCK)) % 2 === 0;
  // Seen from outside, a stunt deck is traced by its rails: their outer faces carry the kerb
  // paint too, so the ribbon's two edges read against its underside from any side.
  const stunt = cor.shape.magnet[cor.idx(a)] === 1 && cor.shape.magnet[cor.idx(b)] === 1;
  for (const side of [-1, 1]) {
    const inner = (k: number) => side * cor.edge(k, side);
    const outer = (k: number) => (side < 0 ? L(k) : R(k));
    const r = cor.ribbon.samples[cor.idx(a)].right;
    const out = { x: r.x * side, y: r.y * side, z: r.z * side };
    const inward = { x: -out.x, y: -out.y, z: -out.z };
    // An open drop has no rail (falling off is a wreck there, so nothing may look like a wall):
    // the deck's edge face, and a lit strip along the edge so it reads at speed.
    if (cor.drop(a, side) || cor.drop(b, side)) {
      quadFacing(c.rock, cor.banked(a, inner(a), -DECK_DEPTH), cor.banked(b, inner(b), -DECK_DEPTH), cor.banked(b, inner(b), 0), cor.banked(a, inner(a), 0), out, STEEL_DARK, STEEL);
      const strip = (k: number) => side * (cor.edge(k, side) - EDGE_LIGHT);
      const lift = (k: number, x: number) => cor.banked(k, x, DROP_BAND_LIFT);
      quadFacing(cor.glow, lift(a, strip(a)), lift(b, strip(b)), lift(b, inner(b)), lift(a, inner(a)), up(a), block ? cor.paint.accent : cor.paint.white);
      continue;
    }
    if (cor.hanging) {
      // A rail in the void is lit steel with a line of light along its top: the edge reads at
      // speed without a wall of paint between the road and the view.
      quadFacing(c.rock, cor.banked(a, inner(a), 0), cor.banked(b, inner(b), 0), cor.banked(b, inner(b), RAIL_HEIGHT - RAIL_LIGHT), cor.banked(a, inner(a), RAIL_HEIGHT - RAIL_LIGHT), inward, STEEL_DARK, STEEL);
      quadFacing(cor.glow, cor.banked(a, inner(a), RAIL_HEIGHT - RAIL_LIGHT), cor.banked(b, inner(b), RAIL_HEIGHT - RAIL_LIGHT), cor.banked(b, inner(b), RAIL_HEIGHT), cor.banked(a, inner(a), RAIL_HEIGHT), inward, block ? cor.paint.accent : cor.paint.white);
    } else {
      // Inner face of the rail, painted so the edge reads at speed (unlit).
      quadFacing(cor.glow, cor.banked(a, inner(a), 0), cor.banked(b, inner(b), 0), cor.banked(b, inner(b), RAIL_HEIGHT), cor.banked(a, inner(a), RAIL_HEIGHT), inward, block ? cor.paint.accent : cor.paint.white);
    }
    // Rail top and the outer face down to the bottom of the deck.
    quadFacing(c.rock, cor.banked(a, inner(a), RAIL_HEIGHT), cor.banked(b, inner(b), RAIL_HEIGHT), cor.banked(b, outer(b), RAIL_HEIGHT), cor.banked(a, outer(a), RAIL_HEIGHT), up(a), STEEL);
    if (stunt) {
      quadFacing(c.rock, cor.banked(a, outer(a), -DECK_DEPTH), cor.banked(b, outer(b), -DECK_DEPTH), cor.banked(b, outer(b), 0), cor.banked(a, outer(a), 0), out, STEEL_DARK, STEEL);
      quadFacing(cor.glow, cor.banked(a, outer(a), 0), cor.banked(b, outer(b), 0), cor.banked(b, outer(b), RAIL_HEIGHT), cor.banked(a, outer(a), RAIL_HEIGHT), out, block ? cor.paint.accent : cor.paint.white);
    } else {
      quadFacing(c.rock, cor.banked(a, outer(a), -DECK_DEPTH), cor.banked(b, outer(b), -DECK_DEPTH), cor.banked(b, outer(b), RAIL_HEIGHT), cor.banked(a, outer(a), RAIL_HEIGHT), out, STEEL_DARK, STEEL);
    }
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
  for (const l of r.loops) {
    const sweep = [Math.ceil(l.s0 / r.step), Math.floor(l.s1 / r.step)] as const;
    cage(cor, LOOP_FRAMES.map((t) => frame(cor, Math.round((l.s0 + (l.s1 - l.s0) * t) / r.step), l.shift, sweep)));
  }
  for (const f of cor.view.features) {
    if (f.kind === 'corkscrew') {
      const s0 = r.paramToS(f.from);
      const s1 = r.paramToS(f.to);
      const sweep = [Math.ceil(s0 / r.step), Math.floor(s1 / r.step)] as const;
      const rings: Ring[] = [];
      for (let s = s0 + SCREW_FRAME_SPACING / 2; s < s1; s += SCREW_FRAME_SPACING) rings.push(frame(cor, Math.round(s / r.step), 0, sweep));
      cage(cor, rings);
    }
  }
}

/** A frame's four corners (left and right, bottom and top), for the stringers of a cage in the void. */
type Ring = { k: number; corners: [P3, P3, P3, P3] };

/** In the void, stringers join consecutive rings at their corners into one rigid cage. */
function cage(cor: Corridor, rings: Ring[]): void {
  if (!cor.hanging) return;
  for (let i = 0; i + 1 < rings.length; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    const c = cor.chunkAt(cor.ribbon.samples[cor.idx(a.k)].s);
    for (let q = 0; q < 4; q++) bar(c.rock, a.corners[q], b.corners[q], STRINGER);
  }
}

/** A pier from the ground to the deck's underside, standing clear of the road below. */
function pier(cor: Corridor, k: number) {
  const kk = cor.idx(k);
  const smp = cor.ribbon.samples[kk];
  const c = cor.chunkAt(smp.s);
  const top = cor.banked(kk, 0, -1);
  // A deck in the void hangs from its own structure: there is nothing for a pier to stand on.
  if (cor.hanging) return;
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
 * sideways shift included, to whichever side it goes) and a beam over the top of every part of
 * the stunt that passes under it. A loop's crown and a corkscrew's rolled edges pass the frame's
 * plane away from the station it stands at, so the beam clears the whole `sweep` of samples.
 */
function frame(cor: Corridor, k: number, shift: number, sweep: readonly [number, number]): Ring {
  const kk = cor.idx(k);
  const smp = cor.ribbon.samples[kk];
  const c = cor.chunkAt(smp.s);
  const rx = cor.shape.rx[kk];
  const rz = cor.shape.rz[kk];
  const reach = Math.max(cor.edge(kk, -1), cor.edge(kk, 1)) + RAIL_WIDTH + FRAME_CLEAR + Math.abs(shift);
  // Centred between the entry and the shifted exit, on the ground the stunt stands on.
  const centre = { x: cor.shape.gx[kk] + rx * (shift / 2), z: cor.shape.gz[kk] + rz * (shift / 2) };
  // The highest point (road, its back or a rail top) within reach of the beam's plane.
  let topY = -Infinity;
  let lowY = Infinity;
  for (let q = sweep[0]; q <= sweep[1]; q++) {
    for (const x of [-cor.edge(q, -1) - RAIL_WIDTH, 0, cor.edge(q, 1) + RAIL_WIDTH]) {
      for (const y of [-DECK_DEPTH, RAIL_HEIGHT]) {
        const p = cor.banked(q, x, y);
        const along = (p.x - centre.x) * -rz + (p.z - centre.z) * rx;
        if (Math.abs(along) < FRAME_BEAM / 2 + FRAME_CLEAR) {
          topY = Math.max(topY, p.y);
          lowY = Math.min(lowY, p.y);
        }
      }
    }
  }
  topY += FRAME_CLEAR * 0.5;
  // In the void the frame closes into a ring under the lowest part of the stunt it passes.
  const footY = (x: number, z: number) => (cor.hanging ? lowY - FRAME_CLEAR * 0.5 - FRAME_BEAM : cor.ground.height(x, z) - 2);
  const legs: P3[] = [];
  const feet: P3[] = [];
  for (const side of [-1, 1]) {
    const x = centre.x + rx * side * (reach - Math.abs(shift) / 2);
    const z = centre.z + rz * side * (reach - Math.abs(shift) / 2);
    const g = footY(x, z);
    column(c.rock, x, z, g, topY, FRAME_BEAM, rx, rz);
    legs.push({ x, y: topY, z });
    feet.push({ x, y: g, z });
    if (cor.hanging) {
      // The leg's inner face is a strip of light, and a thruster pod holds each lower corner.
      const inward = { x: -rx * side, y: 0, z: -rz * side };
      const fx = (-rz * FRAME_BEAM * RING_LIGHT) / 2;
      const fz = (rx * FRAME_BEAM * RING_LIGHT) / 2;
      const ix = x - (rx * side * FRAME_BEAM) / 2 - rx * side * 0.05;
      const iz = z - (rz * side * FRAME_BEAM) / 2 - rz * side * 0.05;
      quadFacing(cor.glow, { x: ix - fx, y: g + FRAME_BEAM, z: iz - fz }, { x: ix + fx, y: g + FRAME_BEAM, z: iz + fz }, { x: ix + fx, y: topY, z: iz + fz }, { x: ix - fx, y: topY, z: iz - fz }, inward, cor.paint.accent);
      column(c.rock, x + rx * side * POD * 0.6, z + rz * side * POD * 0.6, g - POD * 0.4, g + POD * 0.6, POD, rx, rz);
      const n = { x: 0, y: -1, z: 0 };
      const h = POD * 0.35;
      const px = x + rx * side * POD * 0.6;
      const pz = z + rz * side * POD * 0.6;
      quadFacing(cor.glow, { x: px - h, y: g - POD * 0.41, z: pz - h }, { x: px + h, y: g - POD * 0.41, z: pz - h }, { x: px + h, y: g - POD * 0.41, z: pz + h }, { x: px - h, y: g - POD * 0.41, z: pz + h }, n, cor.paint.white);
    }
  }
  const [a, b] = legs;
  const fw = { x: (-rz * FRAME_BEAM) / 2, y: 0, z: (rx * FRAME_BEAM) / 2 };
  const lo = (p: P3, s: number): P3 => ({ x: p.x + fw.x * s, y: p.y, z: p.z + fw.z * s });
  const hi = (p: P3, s: number): P3 => ({ x: p.x + fw.x * s, y: p.y + FRAME_BEAM, z: p.z + fw.z * s });
  quadFacing(c.rock, lo(a, 1), lo(b, 1), hi(b, 1), hi(a, 1), { x: fw.x, y: 0, z: fw.z }, STEEL);
  quadFacing(c.rock, lo(a, -1), lo(b, -1), hi(b, -1), hi(a, -1), { x: -fw.x, y: 0, z: -fw.z }, STEEL);
  quadFacing(c.rock, hi(a, -1), hi(b, -1), hi(b, 1), hi(a, 1), { x: 0, y: 1, z: 0 }, cor.paint.accent);
  quadFacing(c.rock, lo(a, -1), lo(b, -1), lo(b, 1), lo(a, 1), { x: 0, y: -1, z: 0 }, STEEL_DARK);
  if (cor.hanging) {
    // The bottom beam closes the ring under the stunt, its top face lit like the legs.
    const [fa, fb] = feet;
    const up = (p: P3, s: number): P3 => ({ x: p.x + fw.x * s, y: p.y + FRAME_BEAM, z: p.z + fw.z * s });
    const dn = (p: P3, s: number): P3 => ({ x: p.x + fw.x * s, y: p.y, z: p.z + fw.z * s });
    quadFacing(c.rock, dn(fa, 1), dn(fb, 1), up(fb, 1), up(fa, 1), { x: fw.x, y: 0, z: fw.z }, STEEL);
    quadFacing(c.rock, dn(fa, -1), dn(fb, -1), up(fb, -1), up(fa, -1), { x: -fw.x, y: 0, z: -fw.z }, STEEL);
    quadFacing(c.rock, dn(fa, -1), dn(fb, -1), dn(fb, 1), dn(fa, 1), { x: 0, y: -1, z: 0 }, STEEL_DARK);
    const lit = (p: P3, s: number): P3 => ({ x: p.x + fw.x * s * RING_LIGHT, y: p.y + FRAME_BEAM + 0.05, z: p.z + fw.z * s * RING_LIGHT });
    quadFacing(cor.glow, lit(fa, -1), lit(fb, -1), lit(fb, 1), lit(fa, 1), { x: 0, y: 1, z: 0 }, cor.paint.accent);
  }
  const [fa, fb] = feet;
  return { k: kk, corners: [{ ...fa, y: fa.y + FRAME_BEAM / 2 }, { ...fb, y: fb.y + FRAME_BEAM / 2 }, { ...a, y: a.y + FRAME_BEAM / 2 }, { ...b, y: b.y + FRAME_BEAM / 2 }] };
}

/** A square steel bar of width w from p to q (any direction). */
function bar(b: FlatBuilder, p: P3, q: P3, w: number) {
  const d = new THREE.Vector3(q.x - p.x, q.y - p.y, q.z - p.z).normalize();
  const side = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(side, d).normalize();
  const h = w / 2;
  const at = (o: P3, u: number, v: number): P3 => ({ x: o.x + side.x * u * h + up.x * v * h, y: o.y + side.y * u * h + up.y * v * h, z: o.z + side.z * u * h + up.z * v * h });
  for (const [u0, v0, u1, v1] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
    const out = { x: side.x * (u0 + u1) + up.x * (v0 + v1), y: side.y * (u0 + u1) + up.y * (v0 + v1), z: side.z * (u0 + u1) + up.z * (v0 + v1) };
    quadFacing(b, at(p, u0, v0), at(p, u1, v1), at(q, u1, v1), at(q, u0, v0), out, STEEL_DARK, STEEL);
  }
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

