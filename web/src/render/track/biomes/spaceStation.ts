import * as THREE from 'three';
import { range, type Rng } from '../../../core/rng.ts';
import type { StationPlacement } from '../../../data/tracks/scenery.ts';
import type { P3 } from '../builder.ts';
import type { Quality } from '../config.ts';
import type { Corridor } from '../corridor.ts';
import type { Ground } from '../ground.ts';
import { StationMesh, axisFrame } from './stationMesh.ts';

// The megastructures looming off the course: each a station kilometres of hull long, built so
// it reads as a working place at every distance. Its silhouette carries it from afar: an
// octagonal spine broken by an open lattice neck, habitat drums standing through it under
// domes, a spoked wheel rising behind it, sphere tanks and a dish at one end, a solar mast,
// radiators hung under it, a gantry crane on its back. Its light carries it in between:
// hangar mouths and window decks glowing warm against the cool hull, running lights along its
// edges, red and green navigation lights at its extremities, beacons on its masts. Its plates,
// pipes and greebles carry it up close. One merged mesh per structure (stationMesh.ts) in the
// station material (render/stationMaterial.ts); its lights go to the shared light points.

/** Point lights drawn as glowing dots: world position, HDR colour, size (m) and blink (period s, 0 = steady; phase). */
export interface Lights {
  pos: number[];
  colour: number[];
  size: number[];
  blink: number[];
}

/** Structure keeps this far outside any road's hard boundary unless it is well above or below the road. */
const STRUCTURE_CLEAR = 12;
const ABOVE_CLEAR = 30;
const BELOW_CLEAR = 20;
/** Footprints are tested against the course every this many metres. */
const FOOTPRINT_STEP = 20;

/** Proportions of a megastructure, as shares of its spine's length L (one recipe scales to any size). */
const SPINE = {
  /** Octagonal spine radius, and its axis height over the road. */
  radius: 0.075,
  axis: 0.02,
  /** The spine runs in sections along L (shares, -0.5 … 0.5): a tapered bow, the fore hull, an open lattice neck, the aft hull (a little slimmer), a tank cluster. */
  bow: [-0.5, -0.45],
  fore: [-0.45, -0.12],
  neck: [-0.12, 0.04],
  aft: [0.04, 0.38],
  tanks: [0.38, 0.5],
  aftRadius: 0.86,
  /** The bow tapers to this share of the radius and carries a docking ring this big. */
  bowTip: 0.55,
  dockRing: 0.45,
  dockTube: 0.06,
  /** The neck's pressure core and its lattice (shares of the radius), bays (share of L). */
  neckCore: 0.35,
  neckTruss: 1.3,
  neckBay: 0.03,
  /** Collars round the hull every this share of L, this deep, standing this proud (share of the radius). */
  collarEvery: 0.05,
  collarDepth: 0.006,
  collarProud: 0.035,
} as const;

/** Habitat drums standing through the spine: how many per hull section, radius and reach above/below (shares of L), a foil band (share of the drum's height). */
const DRUMS = { perSection: 2, radius: [0.035, 0.055], above: [0.06, 0.16], below: [0.05, 0.14], foilBand: 0.08, sides: 24, ringEvery: 12 } as const;
/** The wheel: where along the spine, its radius and tube, its gap behind the spine, the hub (shares of L); spokes. */
const WHEEL = { at: 0.2, radius: 0.28, tube: 0.02, gap: 0.05, hubRadius: 0.045, hubLength: 0.06, spokes: 6, spokeRadius: 0.008, collars: 12, segments: 72, tubeSides: 10 } as const;
/** Sphere tanks round the stern lattice: how many, their radius (share of L). */
const TANKS = { count: 3, radius: 0.035, sides: 16, rings: 6 } as const;
/** The comm dish at the stern: radius, depth and mast (shares of L). */
const DISH = { radius: 0.04, depth: 0.012, mast: 0.03 } as const;
/** Solar mast on the fore hull: height, arms and panel size (shares of L). */
const SOLAR = { at: -0.3, height: 0.22, arms: 3, armReach: 0.11, panel: [0.09, 0.045], truss: 0.012, bay: 0.012 } as const;
/** Radiators hung under the fore hull: drop and panel size (shares of L), panels each side. */
const RADIATORS = { at: -0.25, drop: 0.15, panel: [0.07, 0.035], perSide: 3 } as const;
/** A gantry crane on the aft hull's back: legs apart, height (shares of L). */
const CRANE = { from: 0.1, to: 0.24, height: 0.05, truss: 0.008 } as const;
/** A command tower on the aft hull: footprint and tiers (shares of L). */
const TOWER = { at: 0.3, width: 0.05, height: 0.03, glass: 0.018 } as const;
/** Hangar mouths on the road face: how many per hull section, width (share of L), frame (m). */
const HANGARS = { perSection: 2, width: [0.03, 0.05], frame: 3, depth: 4, sill: 3 } as const;
/** Greebles on the hull's back and belly, per kilometre of hull. */
const GREEBLES_PER_KM = 320;
/** Pipe runs along the road face's edges: radius (share of the spine radius). */
const PIPE = 0.018;

/** Docking arms reaching toward the road: how many, their lattice, how close their tips come to the boundary, and their height. */
const ARMS: readonly [number, number] = [2, 4];
const ARM_TRUSS = 8;
const ARM_BAY = 8;
const ARM_MEMBER = 0.7;
const ARM_CLEAR = 26;
const ARM_HEIGHT: readonly [number, number] = [14, 46];
/** Lights along an arm's underside, metres apart. */
const ARM_LIGHT_SPACING = 18;

/** Paint (sRGB): hull panels pale to dark, structural steel, gold foil, solar cells, radiators, glass. */
const HULL = [0x9aa1ab, 0x868d97, 0x737a84, 0x8e8a84];
const STEEL = 0x6c737e;
const STEEL_DARK = 0x464b54;
const FOIL = 0xb08640;
const SOLAR_CELLS = 0x1c3466;
const RADIATOR = 0x80878f;
const GLASS = 0x2a3a52;
/** Emission (linear HDR): hangar interiors warm, the deck-level guide band cyan. */
const HANGAR_LIGHT = new THREE.Color(2.6, 1.7, 0.85);
const GUIDE = new THREE.Color(0.6, 2.2, 3);
const BAND_HEIGHT = 2.5;
/** Point lights (linear HDR): beacons red, navigation red and green, strobes white, floods warm, running lights pale. */
const BEACON_RED = new THREE.Color(3, 0.25, 0.15);
const NAV_GREEN = new THREE.Color(0.3, 3, 0.6);
const STROBE = new THREE.Color(3, 3, 3.2);
const FLOOD = new THREE.Color(2.4, 1.8, 1.1);
const RUNNING = new THREE.Color(1.2, 1.4, 1.7);
/** Light sizes, metres: big enough to read as a point at a kilometre. */
const BEACON_SIZE = 7;
const NAV_SIZE = 9;
const STROBE_SIZE = 10;
const FLOOD_SIZE = 5;
const RUNNING_SIZE = 2.6;
const GUIDE_SIZE = 2.2;
/** Blink periods (s): beacons slow, strobes quick. */
const BEACON_PERIOD: readonly [number, number] = [1.6, 2.6];
const STROBE_PERIOD = 1.1;
/** Running lights along the hull's edges, every this share of L. */
const RUNNING_EVERY = 0.025;

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

export function light(l: Lights, p: P3, c: THREE.Color, size: number, period: number, phase: number): void {
  l.pos.push(p.x, p.y, p.z);
  l.colour.push(c.r, c.g, c.b);
  l.size.push(size);
  l.blink.push(period, phase);
}

/**
 * A structure's site: a horizontal frame beside the course. Station coordinates are u along
 * the course, y up from the road's height there, w out from the course (0 at the structure's
 * nearest face).
 */
export class Site {
  /** Horizontal, away from the course. */
  readonly out: THREE.Vector3;
  /** f × up: the right-handed third axis of the frame; out is ± it. */
  private readonly side: THREE.Vector3;
  private readonly s: number;

  constructor(
    readonly g: Ground,
    readonly o: THREE.Vector3,
    readonly f: THREE.Vector3,
    out: THREE.Vector3,
  ) {
    this.side = new THREE.Vector3().crossVectors(f, UP);
    this.s = Math.sign(out.dot(this.side));
    this.out = this.side.clone().multiplyScalar(this.s);
  }

  p(u: number, y: number, w: number): THREE.Vector3 {
    return this.o.clone().addScaledVector(this.f, u).addScaledVector(UP, y).addScaledVector(this.out, w);
  }

  /** A rigid frame at (u, y, w) whose local y runs along u, y or w (local x is up for u and w, along for y). */
  frame(u: number, y: number, w: number, axis: 'u' | 'y' | 'w', spin = 0): THREE.Matrix4 {
    const dir = axis === 'u' ? this.f : axis === 'y' ? UP : this.out;
    return axisFrame(this.p(u, y, w), dir, spin, axis === 'y' ? this.f : UP);
  }

  /** The angle round a 'u' frame's axis at which a face looks back toward the course. */
  get toward(): number {
    return (this.s * Math.PI) / 2;
  }

  /** An axis-aligned box in station coordinates. */
  box(mesh: StationMesh, u0: number, u1: number, y0: number, y1: number, w0: number, w1: number): StationMesh {
    const m = new THREE.Matrix4().makeBasis(this.f, UP, this.side).setPosition(this.p((u0 + u1) / 2, (y0 + y1) / 2, (w0 + w1) / 2));
    return mesh.at(m).box(Math.abs(u1 - u0), Math.abs(y1 - y0), Math.abs(w1 - w0));
  }

  /** A flat quad facing the course at w (just proud of a face there), spanning u0..u1, y0..y1. */
  facing(mesh: StationMesh, u0: number, u1: number, y0: number, y1: number, w: number): StationMesh {
    const m = new THREE.Matrix4().makeBasis(this.f, UP, this.side).setPosition(this.p(0, 0, 0));
    const z = this.s * w;
    mesh.at(m).quad([u0, y0, z], [u1, y0, z], [u1, y1, z], [u0, y1, z], [0, 0, -this.s], [u0, y0], [u1, y0], [u1, y1], [u0, y1]);
    return mesh;
  }

  /** Whether a station-coordinate box keeps clear of every road. */
  clear(u0: number, u1: number, y0: number, y1: number, w0: number, w1: number): boolean {
    const c = (u: number, w: number) => this.p(u, 0, w);
    return clearOfRoads(this.g, [c(u0, w0), c(u1, w0), c(u1, w1), c(u0, w1)], this.o.y + y0, this.o.y + y1);
  }
}

function hullTint(rng: Rng): THREE.Color {
  return new THREE.Color(HULL[Math.floor(rng() * HULL.length)]).multiplyScalar(range(rng, 0.9, 1.08));
}

/** The site beside sample k on `side`, `gap` metres out from the hard boundary, at the road's height there. */
export function siteBeside(cor: Corridor, k: number, side: number, gap: number): Site {
  const kk = cor.idx(k);
  const smp = cor.ribbon.samples[kk];
  const b = cor.beside(kk, side, gap, smp.pos.y);
  const out = new THREE.Vector3(cor.shape.rx[kk] * side, 0, cor.shape.rz[kk] * side);
  const f = new THREE.Vector3(smp.tangent.x, 0, smp.tangent.z).normalize();
  return new Site(cor.ground, new THREE.Vector3(b.x, b.y, b.z), f, out);
}

/** A megastructure beside the course (see the header), as one mesh. Throws when its spine would cut the course. */
export function megastructure(cor: Corridor, p: StationPlacement, rng: Rng, quality: Quality, lights: Lights): StationMesh {
  const site = siteBeside(cor, Math.round(cor.ribbon.paramToS(p.at) / cor.ribbon.step), p.side, p.distance);
  const L = p.length;
  const R = L * SPINE.radius;
  // The octagon's apothem: its flat road face stands at w = 0, so its axis is this far out.
  const apo = R * Math.cos(Math.PI / 8);
  const ys = L * SPINE.axis;
  if (!site.clear(-L / 2, L / 2, ys - R, ys + R, 0, 2 * apo)) {
    throw new Error(`space: the station at ${p.at} (${p.length} m, ${p.distance} m out) cuts the course`);
  }
  const mesh = new StationMesh();
  const spineTint = hullTint(rng);
  const at = (share: readonly [number, number]) => [share[0] * L, share[1] * L] as const;
  const fore = at(SPINE.fore);
  const aft = at(SPINE.aft);
  const neck = at(SPINE.neck);
  const bow = at(SPINE.bow);
  const tanks = at(SPINE.tanks);
  const aftR = R * SPINE.aftRadius;

  // The spine: the fore and aft hulls, octagonal, a flat face toward the course.
  const hull = (u0: number, u1: number, r: number, seed: number) => {
    mesh.at(site.frame((u0 + u1) / 2, ys, apo, 'u')).paint('hull', spineTint, seed).cylinder(r, r, u1 - u0, 8, { along: true, phase: site.toward - Math.PI / 8, smooth: false, caps: true });
    mesh.occluder(site.p(u0, ys, apo), site.p(u1, ys, apo), r * Math.cos(Math.PI / 8));
  };
  hull(fore[0], fore[1], R, 1);
  hull(aft[0], aft[1], aftR, 2);
  // The bow tapers to a docking ring.
  mesh.at(site.frame((bow[0] + bow[1]) / 2, ys, apo, 'u')).paint('hull', spineTint, 3).cylinder(R * SPINE.bowTip, R, bow[1] - bow[0], 8, { along: true, phase: site.toward - Math.PI / 8, smooth: false, caps: true });
  mesh.at(site.frame(bow[0], ys, apo, 'u')).paint('steel', STEEL, 4).torus(R * SPINE.dockRing, R * SPINE.dockTube, 32, 8);

  // The neck: a pressure core and pipes inside an open lattice; stars show through it.
  const core = R * SPINE.neckCore;
  mesh.at(site.frame((neck[0] + neck[1]) / 2, ys, apo, 'u')).paint('foil', FOIL, 5).cylinder(core, core, neck[1] - neck[0], 16, { along: true, rings: 4 });
  mesh.occluder(site.p(neck[0], ys, apo), site.p(neck[1], ys, apo), core);
  mesh.paint('steel', STEEL_DARK, 6).truss(site.p(neck[0], ys, apo), site.p(neck[1], ys, apo), R * SPINE.neckTruss, L * SPINE.neckBay, R * 0.035, UP);
  for (const [dy, dw] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const off = core * 1.45;
    mesh.at(site.frame((neck[0] + neck[1]) / 2, ys + dy * off, apo + dw * off, 'u')).paint('steel', STEEL, 7).cylinder(R * 0.06, R * 0.06, neck[1] - neck[0], 8, { along: true });
  }

  // Collars round both hulls: the rhythm that gives the spine its scale from afar.
  for (const [u0, u1, r] of [[fore[0], fore[1], R], [aft[0], aft[1], aftR]] as const) {
    const step = L * SPINE.collarEvery;
    const depth = L * SPINE.collarDepth;
    for (let u = u0 + step / 2; u < u1 - depth; u += step) {
      const rc = r * (1 + SPINE.collarProud);
      const fr = site.frame(u, ys, apo, 'u');
      mesh.at(fr).paint('steel', STEEL_DARK, 8).cylinder(rc, rc, depth, 8, { along: true, phase: site.toward - Math.PI / 8, smooth: false });
      mesh.annulus(r, rc, -depth / 2, 8, -1, site.toward - Math.PI / 8).annulus(r, rc, depth / 2, 8, 1, site.toward - Math.PI / 8);
      // Two running lights on the collar's road-face corners.
      for (const dy of [-1, 1]) light(lights, site.p(u, ys + dy * rc * Math.sin(Math.PI / 8), -0.5 - rc + r), RUNNING, RUNNING_SIZE, 0, 0);
    }
  }

  // Pipe runs along the road face's top and bottom edges.
  if (quality === 'high') {
    for (const [u0, u1, r] of [[fore[0], fore[1], R], [aft[0], aft[1], aftR]] as const) {
      for (const dy of [-1, 1]) {
        const y = ys + dy * r * Math.sin(Math.PI / 8);
        const w = apo - r * Math.cos(Math.PI / 8) + R * PIPE * 1.5;
        mesh.at(site.frame((u0 + u1) / 2, y, w, 'u')).paint('steel', STEEL, 9).cylinder(R * PIPE, R * PIPE, u1 - u0, 6, { along: true });
      }
    }
  }

  // The guide band at deck height along both hulls' road faces: it ties the hull's scale to the road's.
  for (const [u0, u1, r] of [[fore[0], fore[1], R], [aft[0], aft[1], aftR]] as const) {
    const face = apo - r * Math.cos(Math.PI / 8);
    site.facing(mesh.paint('glow', GUIDE, 0, false), u0, u1, 0, BAND_HEIGHT, face - 0.3);
  }

  // Hangar mouths in the road faces, over the guide band, lit warm from within.
  for (const [u0, u1, r] of [[fore[0], fore[1], R], [aft[0], aft[1], aftR]] as const) {
    const face = apo - r * Math.cos(Math.PI / 8);
    const top = ys + r * Math.sin(Math.PI / 8) - HANGARS.frame * 2;
    const bottom = BAND_HEIGHT + HANGARS.sill;
    const slot = (u1 - u0) / HANGARS.perSection;
    for (let i = 0; i < HANGARS.perSection; i++) {
      const w = L * range(rng, HANGARS.width[0], HANGARS.width[1]);
      const c = u0 + slot * (i + 0.5) + range(rng, -0.25, 0.25) * (slot - w);
      hangar(mesh, site, lights, c - w / 2, c + w / 2, bottom, top, face);
    }
  }

  // Habitat drums through the hulls, domed.
  for (const [u0, u1] of [fore, aft] as const) {
    for (let i = 0; i < DRUMS.perSection; i++) {
      const slot = (u1 - u0) / DRUMS.perSection;
      const r = L * range(rng, DRUMS.radius[0], DRUMS.radius[1]);
      const u = u0 + slot * (i + 0.5) + range(rng, -0.2, 0.2) * slot;
      const top = ys + apo + L * range(rng, DRUMS.above[0], DRUMS.above[1]);
      const bottom = ys - apo - L * range(rng, DRUMS.below[0], DRUMS.below[1]);
      if (!site.clear(u - r, u + r, bottom - r, top + r, apo - r, apo + r)) continue;
      drum(mesh, site, lights, rng, u, apo, r, bottom, top, quality);
    }
  }

  // The wheel behind the aft hull.
  const wu = L * WHEEL.at;
  const wr = L * WHEEL.radius;
  const wc = apo + aftR + L * WHEEL.gap + (L * WHEEL.hubLength) / 2;
  if (site.clear(wu - wr, wu + wr, ys - wr, ys + wr, wc - L * WHEEL.tube, wc + L * WHEEL.tube)) wheel(mesh, site, lights, L, wu, ys, apo + aftR, wc, quality);

  // The stern: a lattice spine with sphere tanks round it and a dish at its end.
  mesh.paint('steel', STEEL_DARK, 20).truss(site.p(tanks[0], ys, apo), site.p(tanks[1], ys, apo), R * 0.8, L * SPINE.neckBay, R * 0.03, UP);
  for (let i = 0; i < TANKS.count; i++) {
    const a = (i / TANKS.count) * Math.PI * 2 + rng();
    const tr = L * TANKS.radius;
    const u = tanks[0] + (tanks[1] - tanks[0]) * ((i + 0.5) / TANKS.count);
    const y = ys + Math.cos(a) * R * 0.9;
    const w = apo + Math.max(0, Math.sin(a)) * R * 0.9;
    if (!site.clear(u - tr, u + tr, y - tr, y + tr, w - tr, w + tr)) continue;
    const tint = i % 2 ? FOIL : HULL[0];
    for (const dir of [1, -1]) mesh.at(axisFrame(site.p(u, y, w), UP.clone().multiplyScalar(dir))).paint(i % 2 ? 'foil' : 'hull', tint, 21 + i).dome(tr, TANKS.sides, TANKS.rings);
    mesh.at(site.frame(u, y, w, 'u')).paint('steel', STEEL, 24).cylinder(tr * 1.03, tr * 1.03, tr * 0.12, TANKS.sides, {});
  }
  dish(mesh, site, lights, L, tanks[1], ys, apo);

  // A solar mast on the fore hull's back, radiators under it.
  if (site.clear(L * SOLAR.at - L * SOLAR.armReach * 1.5, L * SOLAR.at + L * SOLAR.armReach * 1.5, ys + apo, ys + apo + L * SOLAR.height, apo - 10, apo + 10)) solarMast(mesh, site, lights, L, ys + apo, apo);
  if (site.clear(L * RADIATORS.at - L * RADIATORS.panel[0] * 1.2, L * RADIATORS.at + L * RADIATORS.panel[0] * 1.2, ys - apo - L * RADIATORS.drop, ys - apo, apo - 10, apo + 10)) radiators(mesh, site, L, ys - apo, apo);
  // A gantry crane and a command tower on the aft hull's back.
  crane(mesh, site, lights, L, ys + aftR * Math.cos(Math.PI / 8), apo);
  tower(mesh, site, lights, rng, L, ys + aftR * Math.cos(Math.PI / 8), apo, aftR);

  if (quality === 'high') {
    greebles(mesh, site, rng, fore[0], fore[1], ys, apo, R);
    greebles(mesh, site, rng, aft[0], aft[1], ys, apo, aftR);
  }

  docking(mesh, site, lights, rng, p.distance, L);

  // Navigation lights at the extremities: red to one end, green to the other, strobes over them.
  light(lights, site.p(bow[0] - R * SPINE.dockTube, ys, apo), BEACON_RED, NAV_SIZE, 0, 0);
  light(lights, site.p(tanks[1] + L * DISH.mast, ys, apo), NAV_GREEN, NAV_SIZE, 0, 0);
  for (const u of [bow[0], tanks[1]]) light(lights, site.p(u, ys + R, apo), STROBE, STROBE_SIZE, STROBE_PERIOD, rng());
  // Running lights along the road faces' top and bottom edges.
  for (const [u0, u1, r] of [[fore[0], fore[1], R], [aft[0], aft[1], aftR]] as const) {
    const face = apo - r * Math.cos(Math.PI / 8);
    for (let u = u0; u <= u1; u += L * RUNNING_EVERY) {
      for (const dy of [-1, 1]) light(lights, site.p(u, ys + dy * r * Math.sin(Math.PI / 8), face - 1), RUNNING, RUNNING_SIZE, 0, 0);
    }
  }
  return mesh;
}

/** A hangar mouth in a road face at w = face: a hazard-striped frame standing proud, the bay's light inside, floods at its head. */
function hangar(mesh: StationMesh, site: Site, lights: Lights, u0: number, u1: number, y0: number, y1: number, face: number): void {
  const F = HANGARS.frame;
  const front = face - HANGARS.depth;
  site.facing(mesh.paint('hangar', HANGAR_LIGHT, 0, false), u0, u1, y0, y1, face - 0.2);
  mesh.paint('steel', STEEL_DARK, 30);
  site.box(mesh, u0 - F, u0, y0 - F, y1 + F, front, face);
  site.box(mesh, u1, u1 + F, y0 - F, y1 + F, front, face);
  site.box(mesh, u0, u1, y1, y1 + F, front, face);
  site.box(mesh, u0, u1, y0 - F, y0, front, face);
  // The frame's face is striped, so the mouth reads as a place craft come and go.
  mesh.paint('hazard', 0xffffff, 31);
  site.facing(mesh, u0 - F, u1 + F, y1, y1 + F, front - 0.05);
  site.facing(mesh, u0 - F, u1 + F, y0 - F, y0, front - 0.05);
  for (const u of [u0, u1]) light(lights, site.p(u, y1 + F / 2, front - 1), FLOOD, FLOOD_SIZE, 0, 0);
}

/** A habitat drum standing through the spine: banded with foil, collared, domed over (glass) and under (hull), a mast on its crown. */
function drum(mesh: StationMesh, site: Site, lights: Lights, rng: Rng, u: number, w: number, r: number, bottom: number, top: number, quality: Quality): void {
  const h = top - bottom;
  const mid = (top + bottom) / 2;
  mesh.at(site.frame(u, mid, w, 'y')).paint('hull', hullTint(rng), 40 + Math.floor(rng() * 50)).cylinder(r, r, h, DRUMS.sides, { rings: Math.ceil(h / DRUMS.ringEvery) });
  mesh.occluder(site.p(u, bottom, w), site.p(u, top, w), r);
  const by = range(rng, bottom + h * 0.15, top - h * 0.15);
  mesh.at(site.frame(u, by, w, 'y')).paint('foil', FOIL, 41).cylinder(r * 1.015, r * 1.015, h * DRUMS.foilBand, DRUMS.sides, {});
  for (const y of [bottom + 1.5, top - 1.5]) {
    mesh.at(site.frame(u, y, w, 'y')).paint('steel', STEEL_DARK, 42).cylinder(r * 1.04, r * 1.04, 3, DRUMS.sides, {});
    mesh.annulus(r, r * 1.04, 1.5, DRUMS.sides, 1).annulus(r, r * 1.04, -1.5, DRUMS.sides, -1);
  }
  // Glass observation dome over, hull dome under.
  const glass = rng() < 0.6;
  mesh.at(site.frame(u, top, w, 'y')).paint(glass ? 'glass' : 'hull', glass ? GLASS : hullTint(rng), 43).dome(r, DRUMS.sides, 6, glass ? 0.55 : 0.35);
  mesh.at(axisFrame(site.p(u, bottom, w), UP.clone().negate())).paint('hull', hullTint(rng), 44).dome(r, DRUMS.sides, 5, 0.5);
  if (quality === 'high') {
    // A mast from the crown with a beacon.
    const crown = top + r * (glass ? 0.55 : 0.35);
    const mh = r * range(rng, 0.8, 1.6);
    mesh.at(site.frame(u, crown + mh / 2, w, 'y')).paint('steel', STEEL, 45).cylinder(r * 0.04, r * 0.015, mh, 6, {});
    light(lights, site.p(u, crown + mh + BEACON_SIZE / 2, w), BEACON_RED, BEACON_SIZE, range(rng, BEACON_PERIOD[0], BEACON_PERIOD[1]), rng());
  }
}

/** The spoked wheel standing behind the spine (in the plane along and up), its hub on a spar to the hull's back. */
function wheel(mesh: StationMesh, site: Site, lights: Lights, L: number, u: number, y: number, back: number, wc: number, quality: Quality): void {
  const R = L * WHEEL.radius;
  const r = L * WHEEL.tube;
  const hubR = L * WHEEL.hubRadius;
  const hubL = L * WHEEL.hubLength;
  const fr = site.frame(u, y, wc, 'w');
  mesh.at(fr).paint('hull', HULL[1], 50).torus(R, r, WHEEL.segments, WHEEL.tubeSides);
  // Collars round the ring's tube.
  for (let i = 0; i < WHEEL.collars; i++) {
    const t = (i / WHEEL.collars) * Math.PI * 2;
    mesh.at(fr).paint('steel', STEEL_DARK, 51).torus(R, r * 1.12, 2, WHEEL.tubeSides, [t - 0.012, t + 0.012]);
  }
  // The hub and the spar back to the hull.
  mesh.at(fr).paint('hull', HULL[0], 52).cylinder(hubR, hubR, hubL, 24, { caps: true });
  mesh.at(site.frame(u, y, wc + hubL / 2, 'w')).paint('glass', GLASS, 53).dome(hubR * 0.8, 24, 5, 0.5);
  const spar = (back + wc - hubL / 2) / 2;
  mesh.at(site.frame(u, y, spar, 'w')).paint('foil', FOIL, 54).cylinder(hubR * 0.4, hubR * 0.4, wc - hubL / 2 - back + 2, 16, { rings: 3 });
  mesh.occluder(site.p(u, y, wc - hubL / 2), site.p(u, y, wc + hubL / 2), hubR);
  // Spokes from the hub to the ring, each with a lift tube beside it.
  for (let i = 0; i < WHEEL.spokes; i++) {
    const t = (i / WHEEL.spokes) * Math.PI * 2;
    const dir = new THREE.Vector3().addScaledVector(site.f, Math.cos(t)).addScaledVector(UP, Math.sin(t));
    const len = R - r - hubR;
    const mid = site.p(u, y, wc).addScaledVector(dir, hubR + len / 2);
    mesh.at(axisFrame(mid, dir)).paint('steel', STEEL, 55).cylinder(L * WHEEL.spokeRadius, L * WHEEL.spokeRadius, len + r, 10, { rings: 2 });
    if (quality === 'high') {
      const lift = mid.clone().addScaledVector(site.out, L * WHEEL.spokeRadius * 2.2);
      mesh.at(axisFrame(lift, dir)).paint('hull', HULL[2], 56).cylinder(L * WHEEL.spokeRadius * 0.6, L * WHEEL.spokeRadius * 0.6, len, 8, {});
    }
  }
  // Red and green at its ends along the course, strobes at its crown and keel, running lights round it.
  light(lights, site.p(u - R - r, y, wc), BEACON_RED, NAV_SIZE, 0, 0);
  light(lights, site.p(u + R + r, y, wc), NAV_GREEN, NAV_SIZE, 0, 0);
  light(lights, site.p(u, y + R + r, wc), STROBE, STROBE_SIZE, STROBE_PERIOD, 0.5);
  light(lights, site.p(u, y - R - r, wc), STROBE, STROBE_SIZE, STROBE_PERIOD, 0);
  for (let i = 0; i < WHEEL.collars * 2; i++) {
    const t = ((i + 0.5) / (WHEEL.collars * 2)) * Math.PI * 2;
    light(lights, site.p(u + Math.cos(t) * R, y + Math.sin(t) * R, wc - r - 0.5), RUNNING, RUNNING_SIZE * 1.5, 0, 0);
  }
}

/** The comm dish at the stern: a mast along the spine's axis and a dish facing out along it. */
function dish(mesh: StationMesh, site: Site, lights: Lights, L: number, u: number, y: number, w: number): void {
  const r = L * DISH.radius;
  const d = L * DISH.depth;
  const mast = L * DISH.mast;
  mesh.at(site.frame(u + mast / 2, y, w, 'u')).paint('steel', STEEL, 60).cylinder(r * 0.12, r * 0.08, mast, 8, {});
  // A dish is two shells: the bowl and its back, so it is solid from any side.
  const fr = site.frame(u + mast + d / 2, y, w, 'u');
  mesh.at(fr).paint('hull', HULL[0], 61).cylinder(r * 0.15, r, d, 24, {});
  mesh.at(site.frame(u + mast + d * 0.8, y, w, 'u')).paint('steel', STEEL, 62).cylinder(r * 0.05, r * 0.97, d * 0.6, 24, {});
  light(lights, site.p(u + mast + d * 2.5, y, w), BEACON_RED, BEACON_SIZE, 2.2, 0.3);
}

/** A lattice mast with solar wings: arms each side along the course, panels on them, the cells' blue a colour against the hull. */
function solarMast(mesh: StationMesh, site: Site, lights: Lights, L: number, base: number, w: number): void {
  const u = L * SOLAR.at;
  const top = base + L * SOLAR.height;
  const size = L * SOLAR.truss;
  mesh.paint('steel', STEEL_DARK, 70).truss(site.p(u, base, w), site.p(u, top, w), size, L * SOLAR.bay, size * 0.12, site.f);
  for (let i = 0; i < SOLAR.arms; i++) {
    const y = base + L * SOLAR.height * ((i + 1) / (SOLAR.arms + 0.5));
    for (const s of [-1, 1]) {
      const reach = L * SOLAR.armReach;
      mesh.paint('steel', STEEL, 71).beam(site.p(u + (s * size) / 2, y, w), site.p(u + s * reach, y, w), size * 0.3, size * 0.3, UP);
      const pw = L * SOLAR.panel[0];
      const ph = L * SOLAR.panel[1];
      const c = u + s * (size / 2 + pw / 2 + 2);
      mesh.paint('solar', SOLAR_CELLS, 72);
      site.box(mesh, c - pw / 2, c + pw / 2, y - ph - 1, y - 1, w - 0.4, w + 0.4);
      site.box(mesh, c - pw / 2, c + pw / 2, y + 1, y + ph + 1, w - 0.4, w + 0.4);
    }
  }
  light(lights, site.p(u, top + BEACON_SIZE / 2, w), BEACON_RED, BEACON_SIZE, 1.9, 0.7);
}

/** Radiators hung under the hull on a lattice: pale ribbed panels each side of it. */
function radiators(mesh: StationMesh, site: Site, L: number, base: number, w: number): void {
  const u = L * RADIATORS.at;
  const bottom = base - L * RADIATORS.drop;
  const size = L * SOLAR.truss;
  mesh.paint('steel', STEEL_DARK, 80).truss(site.p(u, base, w), site.p(u, bottom, w), size, L * SOLAR.bay, size * 0.12, site.f);
  const pw = L * RADIATORS.panel[0];
  const ph = L * RADIATORS.panel[1];
  for (let i = 0; i < RADIATORS.perSide; i++) {
    const y = base - L * RADIATORS.drop * ((i + 0.6) / RADIATORS.perSide);
    for (const s of [-1, 1]) {
      const c = u + s * (size / 2 + pw / 2 + 1);
      mesh.paint('radiator', RADIATOR, 81);
      site.box(mesh, c - pw / 2, c + pw / 2, y - ph / 2, y + ph / 2, w - 0.5, w + 0.5);
      mesh.paint('steel', STEEL, 82).beam(site.p(u, y + ph / 2, w), site.p(c + (s * pw) / 2, y + ph / 2, w), 1.4, 1.4, UP);
    }
  }
}

/** A gantry crane over the aft hull's back: lattice legs, a lattice beam, a lit trolley. */
function crane(mesh: StationMesh, site: Site, lights: Lights, L: number, deck: number, w: number): void {
  const u0 = L * CRANE.from;
  const u1 = L * CRANE.to;
  const top = deck + L * CRANE.height;
  const size = L * CRANE.truss;
  mesh.paint('steel', STEEL_DARK, 90);
  for (const u of [u0, u1]) {
    mesh.truss(site.p(u, deck, w), site.p(u, top, w), size, size * 1.5, size * 0.14, site.f);
    mesh.paint('hazard', 0xffffff, 91);
    site.box(mesh, u - size, u + size, deck, deck + size * 0.6, w - size, w + size);
    mesh.paint('steel', STEEL_DARK, 90);
  }
  mesh.truss(site.p(u0 - size, top + size / 2, w), site.p(u1 + size, top + size / 2, w), size, size * 1.5, size * 0.14, UP);
  const tu = u0 + (u1 - u0) * 0.35;
  mesh.paint('hull', HULL[3], 92);
  site.box(mesh, tu - size, tu + size, top - size * 0.8, top, w - size * 0.8, w + size * 0.8);
  light(lights, site.p(tu, top - size, w - size), FLOOD, FLOOD_SIZE, 0, 0);
  for (const u of [u0, u1]) light(lights, site.p(u, top + size * 1.2, w), BEACON_RED, BEACON_SIZE * 0.7, 2.4, u > u0 ? 0.5 : 0);
}

/** A command tower on the aft hull: a hull block, a glass observation tier, a roof with masts. */
function tower(mesh: StationMesh, site: Site, lights: Lights, rng: Rng, L: number, deck: number, w: number, r: number): void {
  const u = L * TOWER.at;
  const half = (L * TOWER.width) / 2;
  const depth = r * Math.sin(Math.PI / 8) * 0.8;
  const h = L * TOWER.height;
  const g = L * TOWER.glass;
  mesh.paint('hull', hullTint(rng), 100);
  site.box(mesh, u - half, u + half, deck, deck + h, w - depth, w + depth);
  mesh.paint('glass', GLASS, 101);
  site.box(mesh, u - half * 0.9, u + half * 0.9, deck + h, deck + h + g, w - depth * 0.9, w + depth * 0.9);
  mesh.paint('hull', hullTint(rng), 102);
  site.box(mesh, u - half * 1.05, u + half * 1.05, deck + h + g, deck + h + g + 2.5, w - depth * 1.05, w + depth * 1.05);
  for (const s of [-1, 1]) {
    const mh = h * 0.9;
    mesh.at(site.frame(u + s * half * 0.6, deck + h + g + mh / 2, w, 'y')).paint('steel', STEEL, 103).cylinder(0.9, 0.5, mh, 6, {});
    light(lights, site.p(u + s * half * 0.6, deck + h + g + mh + BEACON_SIZE / 2, w), BEACON_RED, BEACON_SIZE * 0.8, range(rng, BEACON_PERIOD[0], BEACON_PERIOD[1]), rng());
  }
}

/** Greebles on a hull's back and belly: equipment boxes, tanks, pipe stubs and small domes. */
function greebles(mesh: StationMesh, site: Site, rng: Rng, u0: number, u1: number, ys: number, apo: number, r: number): void {
  const n = Math.round(((u1 - u0) / 1000) * GREEBLES_PER_KM);
  const halfFace = r * Math.sin(Math.PI / 8) * 0.9;
  const faceY = r * Math.cos(Math.PI / 8);
  const tints = [HULL[0], HULL[1], HULL[2], STEEL, FOIL];
  for (let i = 0; i < n; i++) {
    const up = rng() < 0.6 ? 1 : -1;
    const u = range(rng, u0 + 4, u1 - 4);
    const w = apo + range(rng, -halfFace, halfFace);
    const base = ys + up * faceY;
    const roll = rng();
    const tint = tints[Math.floor(rng() * tints.length)];
    const kind = tint === FOIL ? 'foil' : tint === STEEL ? 'steel' : 'hull';
    if (roll < 0.55) {
      const bw = range(rng, 3, 16);
      const bd = range(rng, 3, Math.min(14, halfFace));
      const bh = range(rng, 1.5, 9);
      mesh.paint(kind, tint, 110 + i);
      site.box(mesh, u - bw / 2, u + bw / 2, up > 0 ? base : base - bh, up > 0 ? base + bh : base, w - bd / 2, w + bd / 2);
    } else if (roll < 0.75) {
      const tr = range(rng, 2, 6);
      const th = range(rng, 4, 12);
      mesh.at(site.frame(u, base + (up * th) / 2, w, 'y')).paint(kind, tint, 110 + i).cylinder(tr, tr, th, 10, { caps: true });
    } else if (roll < 0.9) {
      const pr = range(rng, 0.6, 1.6);
      const pl = range(rng, 12, 60);
      mesh.at(site.frame(u, base + up * pr, w, 'u')).paint('steel', STEEL, 110 + i).cylinder(pr, pr, pl, 6, { along: true, caps: true });
    } else {
      const dr = range(rng, 3, 9);
      mesh.at(axisFrame(site.p(u, base, w), UP.clone().multiplyScalar(up))).paint(rng() < 0.5 ? 'glass' : 'hull', rng() < 0.5 ? GLASS : HULL[0], 110 + i).dome(dr, 12, 3, 0.6);
    }
  }
}

/** Docking arms reaching toward the road: lattice booms round a pressure tube, a docking ring at the tip, guide lights under them. */
function docking(mesh: StationMesh, site: Site, lights: Lights, rng: Rng, distance: number, L: number): void {
  const reach = distance - ARM_CLEAR;
  if (reach <= 0) return;
  const arms = Math.round(range(rng, ARMS[0], ARMS[1]));
  for (let i = 0; i < arms; i++) {
    const u = range(rng, -L * 0.4, L * 0.4);
    const y = range(rng, ARM_HEIGHT[0], ARM_HEIGHT[1]);
    if (!site.clear(u - ARM_TRUSS, u + ARM_TRUSS, y - ARM_TRUSS, y + ARM_TRUSS, -reach, 0)) continue;
    mesh.paint('steel', STEEL_DARK, 120 + i).truss(site.p(u, y, 0), site.p(u, y, -reach), ARM_TRUSS, ARM_BAY, ARM_MEMBER, UP);
    mesh.at(site.frame(u, y, -reach / 2, 'w')).paint('hull', HULL[0], 121).cylinder(ARM_TRUSS * 0.28, ARM_TRUSS * 0.28, reach, 10, { rings: 2 });
    mesh.at(site.frame(u, y, -reach, 'w')).paint('steel', STEEL, 122).torus(ARM_TRUSS * 0.55, ARM_TRUSS * 0.12, 16, 6);
    for (let o = -reach + ARM_LIGHT_SPACING / 2; o < 0; o += ARM_LIGHT_SPACING) light(lights, site.p(u, y - ARM_TRUSS / 2 - 0.5, o), GUIDE, GUIDE_SIZE, 0, 0);
    light(lights, site.p(u, y + ARM_TRUSS * 0.75, -reach), BEACON_RED, BEACON_SIZE * 0.7, range(rng, BEACON_PERIOD[0], BEACON_PERIOD[1]), rng());
  }
}
