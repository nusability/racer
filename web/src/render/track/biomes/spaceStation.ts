import * as THREE from 'three';
import { range, type Rng } from '../../../core/rng.ts';
import type { StationPlacement } from '../../../data/tracks/scenery.ts';
import type { FlatBuilder, P3 } from '../builder.ts';
import { TUNNEL_RIB_SPACING } from '../config.ts';
import type { Corridor } from '../corridor.ts';
import type { Ground } from '../ground.ts';
import { quadFacing } from '../paint.ts';

// The station's structure: megastructures looming off the course (a spine kilometres long and
// hundreds of metres tall, modules stacked on and hung under it, masts, radiator fins and
// docking arms reaching toward the road), the hull the tube runs through, gantries spanning the
// open deck and the ribs of the tube. Plated hull is one instanced draw of boxes whose plates
// and portholes the shader draws (render/hullPanels.ts: metre-scale detail reads as size);
// bare structure is one more; gantries and ribs
// are merged; every light is one point in one draw.

/** A box: its matrix (a unit box with its base at y = 0, see render/facade.ts) and tint. */
export interface Box {
  m: THREE.Matrix4;
  tint: THREE.Color;
}

/** Point lights drawn as glowing dots: world position, HDR colour, size (m) and blink (period s, 0 = steady; phase). */
export interface Lights {
  pos: number[];
  colour: number[];
  size: number[];
  blink: number[];
}

export interface StationParts {
  /** Plated hull with portholes (render/hullPanels.ts) and bare structure (lit, no windows). */
  windowed: Box[];
  bare: Box[];
  lights: Lights;
  /** Lit structure merged per draw (gantries, ribs) and their unlit light bands. */
  lit: FlatBuilder;
  glow: FlatBuilder;
}

/** Structure keeps this far outside any road's hard boundary unless it is well above or below the road. */
const STRUCTURE_CLEAR = 12;
const ABOVE_CLEAR = 30;
const BELOW_CLEAR = 20;
/** Footprints are tested against the course every this many metres. */
const FOOTPRINT_STEP = 20;

/** A megastructure's proportions, as shares of its spine's length. */
const SPINE_DEPTH = 0.16;
const SPINE_ABOVE = 0.14;
const SPINE_BELOW = 0.22;
/** Modules stacked on top of the spine and hung under it: one per this many metres of spine, each side. */
const MODULE_EVERY = 70;
const MODULE_WIDTH: readonly [number, number] = [25, 70];
const MODULE_HEIGHT: readonly [number, number] = [15, 120];
/** Masts on the spine: how many, their width and height (share of the spine length). */
const MASTS: readonly [number, number] = [3, 6];
const MAST_WIDTH = 6;
const MAST_HEIGHT: readonly [number, number] = [0.12, 0.3];
/** Radiator fins off the back of the spine: how many, their span along it, reach out and thickness. */
const FINS: readonly [number, number] = [4, 8];
const FIN_SPAN: readonly [number, number] = [50, 120];
const FIN_REACH: readonly [number, number] = [120, 280];
const FIN_THICK = 3;
/** Docking arms reaching toward the road: how many, their section, and how close their tips come to the boundary. */
const ARMS: readonly [number, number] = [2, 4];
const ARM_SECTION = 8;
const ARM_CLEAR = 26;
const ARM_HEIGHT: readonly [number, number] = [14, 46];
/** Lights along an arm's underside, metres apart. */
const ARM_LIGHT_SPACING = 18;
/** Hull tints: pale panels, dark panels, a warm oxidised steel. */
const HULL = [0x5e6878, 0x444c58, 0x545a62, 0x707a88];
const FIN_TINT = 0x262a32;
const MAST_TINT = 0x50565f;
/** Light colours (linear HDR): mast beacons red, floods warm, guide lights cyan. */
const BEACON_RED = new THREE.Color(3, 0.25, 0.15);
const FLOOD = new THREE.Color(2.4, 1.8, 1.1);
const GUIDE = new THREE.Color(0.6, 2.2, 3);
/** Light sizes, metres: big enough to read as a point at a kilometre. */
const BEACON_SIZE = 7;
const FLOOD_SIZE = 5;
const GUIDE_SIZE = 2.2;
/** Mast beacons blink once every this many seconds. */
const BEACON_PERIOD: readonly [number, number] = [1.6, 2.6];
/** A band of guide light along the spine's road face at deck height, and its brightness. */
const BAND_HEIGHT = 2.5;
const BAND_GLOW = 1.6;

/** Hull modules round the tube: one per this many metres of tube, on top of the hull and hung under it. */
const HULL_MODULE_EVERY = 55;
/** The tube's hull (render/track/tunnel.ts) tops out about this high over the road and sits this deep under it. */
const HULL_TOP = 42;
const HULL_FOOT = -7;
/** Modules keep inside this lateral reach from the centreline, so they stand on the hull, not beside it. */
const HULL_REACH = 62;
const HULL_MODULE_HEIGHT: readonly [number, number] = [10, 70];

/** Gantries over the open deck: spacing, clear height over the road, section, and how far outside the boundary their legs stand. */
const GATE_SPACING = 64;
const GATE_HEIGHT = 10;
const GATE_BEAM = 1.6;
const GATE_LEG = 1.4;
const GATE_LEG_GAP = 1.6;
/** Legs reach under the deck's underside (render/track/deck.ts: 1.6 m deep), tied to it by an outrigger. */
const GATE_FOOT = -2.4;
const OUTRIGGER: readonly [number, number] = [-1.5, -0.6];
/** Gantry light: the band under the beam, the strips up the legs (HDR). */
const GATE_LIGHT = new THREE.Color(1.9, 2.1, 2.3);
const GATE_STEEL = new THREE.Color(0x4a505a);

/** Tube ribs: their depth along the road, how far they stand in from the bore, and from what height up the walls. */
const RIB_DEPTH = 1.2;
const RIB_INSET = 0.8;
const RIB_FOOT = 2.8;
/** Bore shape (render/track/tunnel.ts): walls rise to this share of the ceiling, the roof chamfers in to this share of the half width. */
const BORE_WALL = 0.62;
const BORE_CHAMFER = 0.72;
/** Ribs keep this far inside the tube's mouths. */
const RIB_MOUTH_CLEAR = 8;
/** Every rib's inner face is a light band; every n-th one is accent-coloured (HDR). */
const RIB_LIGHT = new THREE.Color(1.6, 1.75, 2);
const RIB_ACCENT_EVERY = 4;
const RIB_ACCENT_GAIN = 2.4;
const RIB_STEEL = new THREE.Color(0x585e68);

const UP = new THREE.Vector3(0, 1, 0);

/** Whether a box (horizontal footprint corners, vertical span) keeps clear of every road. */
export function clearOfRoads(g: Ground, corners: P3[], y0: number, y1: number): boolean {
  const [a, b, , d] = corners;
  const nu = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / FOOTPRINT_STEP));
  const nv = Math.max(1, Math.ceil(Math.hypot(d.x - a.x, d.z - a.z) / FOOTPRINT_STEP));
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const x = a.x + ((b.x - a.x) * i) / nu + ((d.x - a.x) * j) / nv;
      const z = a.z + ((b.z - a.z) * i) / nu + ((d.z - a.z) * j) / nv;
      const near = g.nearest(x, z);
      if (!near) continue;
      const smp = g.views[near.v].ribbon.samples[near.k];
      if (Math.abs(near.d) > (near.d < 0 ? smp.edgeL : smp.edgeR) + STRUCTURE_CLEAR) continue;
      if (y0 > smp.pos.y + ABOVE_CLEAR || y1 < smp.pos.y - BELOW_CLEAR) continue;
      return false;
    }
  }
  return true;
}

/** A horizontal frame for boxes: origin, along (horizontal), out (horizontal, away from the road). */
interface Frame {
  o: THREE.Vector3;
  f: THREE.Vector3;
  out: THREE.Vector3;
}

/**
 * Adds a box spanning `along` ± w/2, `out` from o to o + d, and y0..y1 (absolute heights), when
 * it keeps clear of the course. False when it would not.
 */
function put(g: Ground, list: Box[], fr: Frame, along: number, w: number, o: number, d: number, y0: number, y1: number, tint: THREE.Color): boolean {
  const c = (u: number, v: number): P3 => {
    const p = fr.o.clone().addScaledVector(fr.f, u).addScaledVector(fr.out, v);
    return { x: p.x, y: 0, z: p.z };
  };
  const corners = [c(along - w / 2, o), c(along + w / 2, o), c(along + w / 2, o + d), c(along - w / 2, o + d)];
  if (!clearOfRoads(g, corners, y0, y1)) return false;
  const z = new THREE.Vector3().crossVectors(fr.f, UP);
  const centre = fr.o.clone().addScaledVector(fr.f, along).addScaledVector(fr.out, o + d / 2);
  // The unit box's local z must span the out direction: its basis is (f, up, f × up), and the
  // out axis is ± that, which a symmetric box does not care about.
  const m = new THREE.Matrix4().makeBasis(fr.f, UP, z).scale(new THREE.Vector3(w, y1 - y0, d)).setPosition(centre.x, y0, centre.z);
  list.push({ m, tint });
  return true;
}

function light(l: Lights, p: P3, c: THREE.Color, size: number, period: number, phase: number): void {
  l.pos.push(p.x, p.y, p.z);
  l.colour.push(c.r, c.g, c.b);
  l.size.push(size);
  l.blink.push(period, phase);
}

function hullTint(rng: Rng): THREE.Color {
  return new THREE.Color(HULL[Math.floor(rng() * HULL.length)]).multiplyScalar(0.85 + rng() * 0.3);
}

/** The horizontal frame beside sample k on `side`, `gap` metres out from the hard boundary, at height y. */
function frameBeside(cor: Corridor, k: number, side: number, gap: number, y: number): Frame {
  const kk = cor.idx(k);
  const b = cor.beside(kk, side, gap, y);
  const out = new THREE.Vector3(cor.shape.rx[kk] * side, 0, cor.shape.rz[kk] * side);
  const t = cor.ribbon.samples[kk].tangent;
  const f = new THREE.Vector3(t.x, 0, t.z).normalize();
  return { o: new THREE.Vector3(b.x, b.y, b.z), f, out };
}

/** A megastructure beside the course (see the header). Throws when its spine would cut the course. */
export function megastructure(cor: Corridor, p: StationPlacement, rng: Rng, parts: StationParts): void {
  const g = cor.ground;
  const k = Math.round(cor.ribbon.paramToS(p.at) / cor.ribbon.step);
  const y0 = cor.ribbon.samples[cor.idx(k)].pos.y;
  const fr = frameBeside(cor, k, p.side, p.distance, y0);
  const L = p.length;
  const D = L * SPINE_DEPTH;
  const top = y0 + L * SPINE_ABOVE;
  const bottom = y0 - L * SPINE_BELOW;
  if (!put(g, parts.windowed, fr, 0, L, 0, D, bottom, top, hullTint(rng))) {
    throw new Error(`space: the station at ${p.at} (${p.length} m, ${p.distance} m out) cuts the course`);
  }
  // A band of guide light along the face toward the road, at deck height: it ties the hull's
  // scale to the road's.
  const face = (u: number, y: number): P3 => {
    const q = fr.o.clone().addScaledVector(fr.f, u).addScaledVector(fr.out, -0.3);
    return { x: q.x, y, z: q.z };
  };
  const toward = { x: -fr.out.x, y: 0, z: -fr.out.z };
  const band = new THREE.Color().copy(GUIDE).multiplyScalar(BAND_GLOW / GUIDE.b);
  quadFacing(parts.glow, face(-L / 2, y0), face(L / 2, y0), face(L / 2, y0 + BAND_HEIGHT), face(-L / 2, y0 + BAND_HEIGHT), toward, band);
  const modules = Math.round(L / MODULE_EVERY);
  for (const up of [1, -1]) {
    for (let i = 0; i < modules; i++) {
      const w = range(rng, MODULE_WIDTH[0], MODULE_WIDTH[1]);
      const d = D * range(rng, 0.3, 0.9);
      const h = range(rng, MODULE_HEIGHT[0], MODULE_HEIGHT[1]);
      const along = range(rng, -L / 2 + w / 2, L / 2 - w / 2);
      const o = range(rng, 0, D - d);
      if (up > 0) put(g, parts.windowed, fr, along, w, o, d, top - 1, top + h, hullTint(rng));
      else put(g, parts.windowed, fr, along, w, o, d, bottom - h, bottom + 1, hullTint(rng));
    }
  }
  const masts = Math.round(range(rng, MASTS[0], MASTS[1]));
  for (let i = 0; i < masts; i++) {
    const along = range(rng, -L / 2, L / 2);
    const o = range(rng, 0.2, 0.8) * D;
    const h = L * range(rng, MAST_HEIGHT[0], MAST_HEIGHT[1]);
    const up = rng() < 0.7 ? 1 : -1;
    const [a, b] = up > 0 ? [top, top + h] : [bottom - h, bottom];
    if (!put(g, parts.bare, fr, along, MAST_WIDTH, o, MAST_WIDTH, a, b, new THREE.Color(MAST_TINT))) continue;
    const tip = fr.o.clone().addScaledVector(fr.f, along).addScaledVector(fr.out, o + MAST_WIDTH / 2);
    light(parts.lights, { x: tip.x, y: up > 0 ? b + BEACON_SIZE / 2 : a - BEACON_SIZE / 2, z: tip.z }, BEACON_RED, BEACON_SIZE, range(rng, BEACON_PERIOD[0], BEACON_PERIOD[1]), rng());
  }
  const fins = Math.round(range(rng, FINS[0], FINS[1]));
  for (let i = 0; i < fins; i++) {
    const span = range(rng, FIN_SPAN[0], FIN_SPAN[1]);
    const y = range(rng, bottom + FIN_THICK, top - FIN_THICK);
    put(g, parts.bare, fr, range(rng, -L / 2 + span / 2, L / 2 - span / 2), span, D, range(rng, FIN_REACH[0], FIN_REACH[1]), y, y + FIN_THICK, new THREE.Color(FIN_TINT));
  }
  const arms = Math.round(range(rng, ARMS[0], ARMS[1]));
  for (let i = 0; i < arms; i++) {
    const along = range(rng, -L * 0.4, L * 0.4);
    const reach = p.distance - ARM_CLEAR;
    if (reach <= 0) break;
    const y = y0 + range(rng, ARM_HEIGHT[0], ARM_HEIGHT[1]);
    if (!put(g, parts.bare, fr, along, ARM_SECTION, -reach, reach, y, y + ARM_SECTION, new THREE.Color(MAST_TINT))) continue;
    for (let o = -reach + ARM_LIGHT_SPACING / 2; o < 0; o += ARM_LIGHT_SPACING) {
      const q = fr.o.clone().addScaledVector(fr.f, along).addScaledVector(fr.out, o);
      light(parts.lights, { x: q.x, y: y - 0.5, z: q.z }, GUIDE, GUIDE_SIZE, 0, 0);
    }
    const tip = fr.o.clone().addScaledVector(fr.f, along).addScaledVector(fr.out, -reach);
    light(parts.lights, { x: tip.x, y: y + ARM_SECTION / 2, z: tip.z }, BEACON_RED, BEACON_SIZE * 0.7, range(rng, BEACON_PERIOD[0], BEACON_PERIOD[1]), rng());
  }
  // Floodlights along the spine's top edge, facing the road.
  for (let u = -L / 2; u <= L / 2; u += L / 12) {
    const q = fr.o.clone().addScaledVector(fr.f, u).addScaledVector(fr.out, -1);
    light(parts.lights, { x: q.x, y: top - 3, z: q.z }, FLOOD, FLOOD_SIZE, 0, 0);
  }
}

/** Modules on top of the tube's hull and hung under it, so it reads as station, not a slab. */
export function hullModules(cor: Corridor, rng: Rng, parts: StationParts): void {
  const every = Math.round(HULL_MODULE_EVERY / cor.ribbon.step);
  for (let k = 0; k < cor.n; k += every) {
    if (!cor.tunnel(k)) continue;
    const y0 = cor.ribbon.samples[k].pos.y;
    const side = rng() < 0.5 ? -1 : 1;
    // Frames from the centreline: out spans across the hull from one side.
    const fr = frameBeside(cor, k, side, 0, y0);
    fr.o.addScaledVector(fr.out, -cor.edge(k, side));
    const w = range(rng, MODULE_WIDTH[0], MODULE_WIDTH[1] * 0.7);
    const d = range(rng, 20, HULL_REACH);
    const o = range(rng, -HULL_REACH, HULL_REACH - d);
    const h = range(rng, HULL_MODULE_HEIGHT[0], HULL_MODULE_HEIGHT[1]);
    const tint = hullTint(rng);
    // Over and under the tube the boxes never touch the road: the hull is between.
    if (rng() < 0.6) parts.windowed.push(boxAt(fr, 0, w, o, d, y0 + HULL_TOP - 1, y0 + HULL_TOP + h, tint));
    else parts.windowed.push(boxAt(fr, 0, w, o, d, y0 + HULL_FOOT - h, y0 + HULL_FOOT + 1, tint));
  }
}

/** A box in a frame without the clearance test (for structure the tube's hull separates from the road). */
function boxAt(fr: Frame, along: number, w: number, o: number, d: number, y0: number, y1: number, tint: THREE.Color): Box {
  const z = new THREE.Vector3().crossVectors(fr.f, UP);
  const centre = fr.o.clone().addScaledVector(fr.f, along).addScaledVector(fr.out, o + d / 2);
  return { m: new THREE.Matrix4().makeBasis(fr.f, UP, z).scale(new THREE.Vector3(w, y1 - y0, d)).setPosition(centre.x, y0, centre.z), tint };
}

/** A point in the road frame of sample k: lateral x, height y, ds metres along. */
function roadPoint(cor: Corridor, k: number, x: number, y: number, ds: number): P3 {
  const smp = cor.ribbon.samples[cor.idx(k)];
  const p = cor.banked(k, x, y);
  return { x: p.x + smp.tangent.x * ds, y: p.y + smp.tangent.y * ds, z: p.z + smp.tangent.z * ds };
}

/** A box in the road frame: x0..x1 across, y0..y1 up, ds0..ds1 along. */
function roadBox(b: FlatBuilder, cor: Corridor, k: number, x0: number, x1: number, y0: number, y1: number, ds0: number, ds1: number, c: THREE.Color): void {
  const P = (i: number) => roadPoint(cor, k, i & 1 ? x1 : x0, i & 4 ? y1 : y0, i & 2 ? ds1 : ds0);
  const centre = roadPoint(cor, k, (x0 + x1) / 2, (y0 + y1) / 2, (ds0 + ds1) / 2);
  for (const [p, q, r, s] of [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]) {
    const m = P(p);
    const n = P(r);
    quadFacing(b, P(p), P(q), P(r), P(s), { x: (m.x + n.x) / 2 - centre.x, y: (m.y + n.y) / 2 - centre.y, z: (m.z + n.z) / 2 - centre.z }, c);
  }
}

/**
 * Gantries spanning the open deck between `from` and `to` (main-road s): legs just outside the
 * hard boundary (tied under the deck), a beam close overhead with a band of light under it.
 */
export function gantries(cor: Corridor, s0: number, s1: number, parts: StationParts): void {
  const r = cor.ribbon;
  for (let s = s0; s <= s1; s += GATE_SPACING) {
    const k = cor.idx(Math.round(s / r.step));
    if (cor.tunnel(k) || cor.gap(k) || cor.junction(k) || cor.open(k, -1) || cor.open(k, 1)) continue;
    const xl = -cor.edge(k, -1) - GATE_LEG_GAP;
    const xr = cor.edge(k, 1) + GATE_LEG_GAP;
    const h = GATE_HEIGHT;
    const half = GATE_LEG / 2;
    for (const [inner, outer] of [[xl, xl - GATE_LEG], [xr, xr + GATE_LEG]]) {
      roadBox(parts.lit, cor, k, Math.min(inner, outer), Math.max(inner, outer), GATE_FOOT, h + GATE_BEAM, -half, half, GATE_STEEL);
      // Tied back under the deck so the leg stands on something.
      const edge = Math.sign(inner) * cor.edge(k, inner < 0 ? -1 : 1);
      roadBox(parts.lit, cor, k, Math.min(edge, inner), Math.max(edge, inner), OUTRIGGER[0], OUTRIGGER[1], -half * 0.6, half * 0.6, GATE_STEEL);
      // A strip of light up the leg's face toward the road.
      const side = Math.sign(inner);
      const a = roadPoint(cor, k, inner - side * 0.05, 0.5, -half * 0.5);
      const b = roadPoint(cor, k, inner - side * 0.05, 0.5, half * 0.5);
      const c = roadPoint(cor, k, inner - side * 0.05, h, half * 0.5);
      const d = roadPoint(cor, k, inner - side * 0.05, h, -half * 0.5);
      const toRoad = cor.ribbon.samples[k].right;
      quadFacing(parts.glow, a, b, c, d, { x: -toRoad.x * side, y: -toRoad.y * side, z: -toRoad.z * side }, GATE_LIGHT);
    }
    roadBox(parts.lit, cor, k, xl, xr, h, h + GATE_BEAM, -half, half, GATE_STEEL);
    const down = cor.ribbon.samples[k].up;
    quadFacing(parts.glow, roadPoint(cor, k, xl, h - 0.05, -half * 0.6), roadPoint(cor, k, xr, h - 0.05, -half * 0.6), roadPoint(cor, k, xr, h - 0.05, half * 0.6), roadPoint(cor, k, xl, h - 0.05, half * 0.6), { x: -down.x, y: -down.y, z: -down.z }, GATE_LIGHT);
  }
}

/** The bore's outline at sample k (banked frame: lateral, height), left wall foot to right wall foot. */
function bore(cor: Corridor, k: number): [number, number][] {
  const smp = cor.ribbon.samples[cor.idx(k)];
  const h = smp.width / 2;
  const c = smp.ceiling;
  return [
    [-h, RIB_FOOT],
    [-h, c * BORE_WALL],
    [-h * BORE_CHAMFER, c],
    [h * BORE_CHAMFER, c],
    [h, c * BORE_WALL],
    [h, RIB_FOOT],
  ];
}

/** The outline moved `d` toward the bore's inside (mitred at the corners). */
function inset(line: [number, number][], d: number): [number, number][] {
  const n = line.length;
  // Inward normal of segment i (the outline runs left foot → over the top → right foot, so inward is to its right).
  const normal = (i: number): [number, number] => {
    const [x0, y0] = line[i];
    const [x1, y1] = line[i + 1];
    const l = Math.hypot(x1 - x0, y1 - y0);
    return [(y1 - y0) / l, -(x1 - x0) / l];
  };
  return line.map(([x, y], i) => {
    const a = normal(Math.max(0, i - 1));
    const b = normal(Math.min(n - 2, i));
    const mx = a[0] + b[0];
    const my = a[1] + b[1];
    const l = Math.hypot(mx, my);
    const k = d / Math.max(0.5, (mx * a[0] + my * a[1]) / l) / l;
    return [x + mx * k, y + my * k];
  });
}

/** Ribs round the tube at every ceiling light (TUNNEL_RIB_SPACING): steel frames whose inner faces are bands of light. */
export function ribs(cor: Corridor, parts: StationParts): void {
  const r = cor.ribbon;
  const clear = Math.round(RIB_MOUTH_CLEAR / r.step);
  let n = 0;
  for (let s = TUNNEL_RIB_SPACING; s < r.length; s += TUNNEL_RIB_SPACING) {
    const k = Math.round(s / r.step);
    if (!cor.tunnel(k - clear) || !cor.tunnel(k + clear)) continue;
    const outer = bore(cor, k);
    const inner = inset(outer, RIB_INSET);
    const smp = r.samples[cor.idx(k)];
    const fwd = smp.tangent;
    const back = { x: -fwd.x, y: -fwd.y, z: -fwd.z };
    const P = (q: [number, number], ds: number) => roadPoint(cor, k, q[0], q[1], ds);
    const axis = cor.banked(k, 0, smp.ceiling / 2);
    const band = new THREE.Color().copy(n++ % RIB_ACCENT_EVERY === 0 ? cor.paint.accent.clone().multiplyScalar(RIB_ACCENT_GAIN) : RIB_LIGHT);
    for (let i = 0; i + 1 < outer.length; i++) {
      for (const [ds, dir] of [[-RIB_DEPTH / 2, back], [RIB_DEPTH / 2, fwd]] as const) {
        quadFacing(parts.lit, P(outer[i], ds), P(outer[i + 1], ds), P(inner[i + 1], ds), P(inner[i], ds), dir, RIB_STEEL);
      }
      const a = P(inner[i], -RIB_DEPTH / 2);
      const mid = P([(inner[i][0] + inner[i + 1][0]) / 2, (inner[i][1] + inner[i + 1][1]) / 2], 0);
      quadFacing(parts.glow, a, P(inner[i + 1], -RIB_DEPTH / 2), P(inner[i + 1], RIB_DEPTH / 2), P(inner[i], RIB_DEPTH / 2), { x: axis.x - mid.x, y: axis.y - mid.y, z: axis.z - mid.z }, band);
    }
    // The feet: the rib's underside where it stops above the wall's foot.
    for (const i of [0, outer.length - 1]) {
      const down = { x: -smp.up.x, y: -smp.up.y, z: -smp.up.z };
      quadFacing(parts.lit, P(outer[i], -RIB_DEPTH / 2), P(inner[i], -RIB_DEPTH / 2), P(inner[i], RIB_DEPTH / 2), P(outer[i], RIB_DEPTH / 2), down, RIB_STEEL);
    }
  }
}
