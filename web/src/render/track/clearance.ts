import * as THREE from 'three';
import type { Ribbon, Track } from '../../core/track.ts';
import type { TrackFeature } from '../../core/types.ts';
import { GRAVITY, PLANNED_TOP_SPEED } from '../../data/tuning.ts';
import { WRECK_CAM_HEIGHT } from '../cameraTuning.ts';
import { SKID_CLEARANCE } from '../racerBlueprint.ts';

// The clearance audit: no scenery stands where a racer drives or flies. Every ribbon of the
// course (main loop, routes, shortcuts) sweeps a drivable envelope: at each sample a box in the
// road's own frame, across the drivable width out to the hard boundaries and up from the skids
// to the clear height (the tunnel's ceiling, or the open-sky headroom riding on the arc of any
// jump), so it follows banks, loops and corkscrews. Every solid triangle of the built scene that
// is scenery is tested against those boxes exactly (separating axes), so a curved or long object
// is judged by its own shape, never by a bounding box. Something meant to span the road (a
// gantry, a footbridge, an arch, the start grandstand) passes when its legs stand outside the
// boundaries and its span clears the headroom; the course's own geometry and the hazards that
// enter the road on purpose have their own rules and are not scenery here. The scatter and
// placement rules ask the same envelope (Ground.envelope) before they put a piece down, so what
// they place passes; the audit catches whatever they did not ask about.

/** How high a crest lifts a racer at speed, metres: crests lighten it and rarely launch it. */
const CREST_LIFT = 1.5;
/**
 * Open-sky headroom over the drivable surface: over the highest camera that rides above a racer
 * on the ground (the wreck camera), with room for the lift a crest gives at speed. Over a jump
 * or a kicker it rides on the flight's arc. A footbridge, a lamp's arm or a sign may hang over
 * the road only above it.
 */
export const SCENERY_HEADROOM = WRECK_CAM_HEIGHT + CREST_LIFT;
/**
 * A boundary marker (pylon, lamp post, buoy) stands centred on its hard boundary: it may reach
 * this far inside it, half a post's width, and no further.
 */
const MARKER_SKIN = 0.6;
/** Flights are traced in steps this long, metres along the road. */
const FLIGHT_STEP = 2;
/** A flight that has not come down within this many metres is the track checker's problem, not ours. */
const FLIGHT_MAX = 3000;
/** The envelope starts at a skid's height above the drivable surface: anything lower passes under the craft. */
const ENVELOPE_FLOOR = SKID_CLEARANCE;
/**
 * Each sample's box reaches this share past halfway to its neighbours, so consecutive boxes
 * overlap and leave no seam on the outside of a bend, where boxes fan apart.
 */
const ALONG_SLACK = 0.15;
/** Spatial hash cell of the envelope, metres: about a sample box's size, so a query touches few cells. */
const CELL = 24;
/** Cell coordinates are packed into one number: this many cells per axis either side of the origin. */
const CELL_RANGE = 1 << 15;
/**
 * A bound landmark's moving body reaches this far along the road either side of where its
 * hazard acts (a ship's beam, a door's leaves, a beast's coils, a bucket wheel's boom swinging
 * in over the spill), metres.
 */
const BOUND_REACH = 60;
/** Touching the envelope is not reaching into it: a face flush with it (the wall closing a sprint's road) passes. */
const TOUCH = 1e-3;
/** Hits on one object further apart along the course than this are reported as separate spots, metres. */
const SPOT_GAP = 60;

/** How the audit treats a part of the scene. */
export type ClearanceRule =
  /** The course itself (road, run-off, walls, tunnels, decks, cells, pads): built to the envelope. */
  | 'course'
  /** A hazard that enters the road on purpose (sweepers, blockers, droppers, gameplay boulders): judged by the hazard rules. */
  | 'hazard'
  /** Not solid (light beams, halos, particles, birds, holograms, the sky): a racer flies through it. */
  | 'air'
  /** Set dressing: must stand clear of the envelope. */
  | 'scenery'
  /** A boundary marker on the hard boundary line: as scenery, but it may straddle the line by MARKER_SKIN. */
  | 'marker';

/** One place where scenery reaches into the drivable envelope. */
export interface ClearanceFinding {
  /** The scene object, by its path of names (instance number for instanced pieces). */
  what: string;
  /** Ribbon (-1 = main loop) and the spot of the first hit, in its track space. */
  branch: number;
  s0: number;
  s1: number;
  x: number;
  h: number;
  /** The hard boundary on that side, metres from the centreline, and the headroom there. */
  edge: number;
  head: number;
  /** World position of the first hit. */
  at: THREE.Vector3;
  /** Triangles that reach in. */
  tris: number;
}

/** A landmark bound to a hazard: it may enter the main road over the hazard's own span. */
export interface BoundSpan {
  group: THREE.Object3D;
  s0: number;
  s1: number;
}

/** The drivable envelope of every ribbon, hashed in space. */
export class CourseEnvelope {
  /** Per sample box (BOX numbers): centre, three axes (along, across, up), half extents, the centre's offset across the road. */
  private readonly box: Float64Array;
  /** Per sample box: world AABB min/max. */
  private readonly aabb: Float64Array;
  /** Which ribbon (-1 = main loop) and s each box belongs to. */
  readonly branchOf: Int32Array;
  readonly sOf: Float64Array;
  /** Where each ribbon's boxes start (main loop first). */
  private readonly first: number[] = [];
  private readonly cells = new Map<number, number[]>();
  private readonly stamp: Uint32Array;
  private tick = 0;

  /** `ribbons`: the main loop first, then the branches, each with the features it was built from. */
  constructor(ribbons: { ribbon: Ribbon; features: TrackFeature[] }[]) {
    const n = ribbons.reduce((a, r) => a + r.ribbon.samples.length, 0);
    this.box = new Float64Array(n * BOX);
    this.aabb = new Float64Array(n * 6);
    this.branchOf = new Int32Array(n);
    this.sOf = new Float64Array(n);
    this.stamp = new Uint32Array(n);
    let i = 0;
    ribbons.forEach(({ ribbon: r, features }, ri) => {
      const ns = r.samples.length;
      const flight = flightHeadroom(r, features);
      this.first.push(i);
      for (let k = 0; k < ns; k++, i++) {
        const smp = r.samples[k];
        const prev = r.samples[r.closed ? (k - 1 + ns) % ns : Math.max(0, k - 1)].pos;
        const next = r.samples[r.closed ? (k + 1) % ns : Math.min(ns - 1, k + 1)].pos;
        const p = smp.pos;
        const reach = Math.max(smp.edgeL, smp.edgeR);
        // Boxes fan apart on the outside of a bend by reach × curvature per metre along.
        const half = (Math.max(dist(prev, p), dist(p, next), r.step) / 2) * (1 + ALONG_SLACK + reach * Math.abs(smp.curvature));
        const u = new THREE.Vector3(smp.up.x, smp.up.y, smp.up.z).normalize();
        const rt = new THREE.Vector3(smp.right.x, smp.right.y, smp.right.z);
        rt.addScaledVector(u, -rt.dot(u)).normalize();
        const t = new THREE.Vector3().crossVectors(rt, u);
        const head = Number.isFinite(smp.ceiling) ? smp.ceiling : flight[k];
        const across = (smp.edgeR - smp.edgeL) / 2;
        const upMid = (ENVELOPE_FLOOR + head) / 2;
        // An open road ends at its first and last sample: their boxes reach only inward.
        const end = r.closed ? 0 : k === 0 ? 1 : k === ns - 1 ? -1 : 0;
        const c = new THREE.Vector3(p.x, p.y, p.z).addScaledVector(rt, across).addScaledVector(u, upMid).addScaledVector(t, (end * half) / 2);
        const e = [end === 0 ? half : half / 2, (smp.edgeL + smp.edgeR) / 2, (head - ENVELOPE_FLOOR) / 2];
        this.box.set([c.x, c.y, c.z, t.x, t.y, t.z, rt.x, rt.y, rt.z, u.x, u.y, u.z, e[0], e[1], e[2], across], i * BOX);
        for (let a = 0; a < 3; a++) {
          const ext = Math.abs(t.getComponent(a)) * e[0] + Math.abs(rt.getComponent(a)) * e[1] + Math.abs(u.getComponent(a)) * e[2];
          this.aabb[i * 6 + a] = c.getComponent(a) - ext;
          this.aabb[i * 6 + 3 + a] = c.getComponent(a) + ext;
        }
        this.branchOf[i] = ri - 1;
        this.sOf[i] = smp.s;
        this.eachCell(this.aabb, i * 6, (key) => {
          const list = this.cells.get(key);
          if (list) list.push(i);
          else this.cells.set(key, [i]);
        });
      }
    });
  }

  /** Calls `fn` for every sample box whose AABB meets the AABB at `bb[o..o+6]`, each once. */
  near(bb: ArrayLike<number>, o: number, fn: (i: number) => void): void {
    this.tick++;
    this.eachCell(bb, o, (key) => {
      const list = this.cells.get(key);
      if (!list) return;
      for (const i of list) {
        if (this.stamp[i] === this.tick) continue;
        this.stamp[i] = this.tick;
        const a = i * 6;
        if (bb[o] > this.aabb[a + 3] || bb[o + 3] < this.aabb[a] || bb[o + 1] > this.aabb[a + 4] || bb[o + 4] < this.aabb[a + 1] || bb[o + 2] > this.aabb[a + 5] || bb[o + 5] < this.aabb[a + 2]) continue;
        fn(i);
      }
    });
  }

  /** Any sample box whose AABB meets this one. */
  touches(bb: ArrayLike<number>, o: number): boolean {
    let hit = false;
    this.near(bb, o, () => (hit = true));
    return hit;
  }

  /** Whether the triangle (world points) overlaps sample box i, its sides drawn in by `skin`: the separating-axis test. */
  triOverlaps(i: number, p: THREE.Vector3[], skin: number): boolean {
    const b = this.box;
    const o = i * BOX;
    const loc = TRI_LOCAL;
    for (let v = 0; v < 3; v++) {
      const dx = p[v].x - b[o];
      const dy = p[v].y - b[o + 1];
      const dz = p[v].z - b[o + 2];
      for (let a = 0; a < 3; a++) loc[v * 3 + a] = dx * b[o + 3 + a * 3] + dy * b[o + 4 + a * 3] + dz * b[o + 5 + a * 3];
    }
    return triBoxOverlap(loc, b[o + 12] - TOUCH, b[o + 13] - skin - TOUCH, b[o + 14] - TOUCH);
  }

  /**
   * The first sample box the triangle (world points) reaches into, its sides drawn in by `skin`,
   * or -1. `allowed` boxes are passed over.
   */
  hit(tri: THREE.Vector3[], skin: number, allowed: ((i: number) => boolean) | null = null): number {
    let found = -1;
    this.near(triBounds(tri), 0, (i) => {
      if (found >= 0 || (allowed && allowed(i))) return;
      if (this.triOverlaps(i, tri, skin)) found = i;
    });
    return found;
  }

  /**
   * Whether geometry `g` placed by `mat` stays clear of every ribbon's envelope, judged as the
   * audit will judge it under `rule`: for placing scenery where the audit passes it.
   */
  clearOf(g: THREE.BufferGeometry, mat: THREE.Matrix4, rule: 'scenery' | 'marker'): boolean {
    let clear = true;
    const skin = skinOf(rule);
    geometryTriangles(g, mat, null, this, (tri) => {
      if (clear && this.hit(tri, skin) >= 0) clear = false;
    });
    return clear;
  }

  /** Lateral x off the centreline and height above the road of a world point, in sample box i's frame. */
  local(i: number, p: THREE.Vector3): { x: number; h: number } {
    const b = this.box;
    const o = i * BOX;
    const dx = p.x - b[o];
    const dy = p.y - b[o + 1];
    const dz = p.z - b[o + 2];
    const across = dx * b[o + 6] + dy * b[o + 7] + dz * b[o + 8];
    const up = dx * b[o + 9] + dy * b[o + 10] + dz * b[o + 11];
    return { x: across + b[o + 15], h: up + ENVELOPE_FLOOR + b[o + 14] };
  }

  /** The hard boundary of sample box i on the side of lateral x, metres from the centreline. */
  edge(i: number, x: number): number {
    const o = i * BOX;
    return x < 0 ? this.box[o + 13] - this.box[o + 15] : this.box[o + 13] + this.box[o + 15];
  }

  /** Headroom over sample k of ribbon `branch` (-1 = main loop). */
  headroom(branch: number, k: number): number {
    return this.head(this.first[branch + 1] + k);
  }

  /**
   * Whether the triangles in `pos` (x, y, z per corner) stay clear of the envelope, judged as
   * scenery: for a prop drawn into a merged builder, before it is kept.
   */
  clearOfTriangles(pos: ArrayLike<number>): boolean {
    const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let t = 0; t + 8 < pos.length; t += 9) {
      for (let c = 0; c < 3; c++) tri[c].set(pos[t + c * 3], pos[t + c * 3 + 1], pos[t + c * 3 + 2]);
      if (this.hit(tri, 0) >= 0) return false;
    }
    return true;
  }

  /** Headroom of sample box i over the road. */
  head(i: number): number {
    return ENVELOPE_FLOOR + 2 * this.box[i * BOX + 14];
  }

  private eachCell(bb: ArrayLike<number>, o: number, fn: (key: number) => void): void {
    const lo = [0, 1, 2].map((a) => Math.floor(bb[o + a] / CELL));
    const hi = [0, 1, 2].map((a) => Math.floor(bb[o + 3 + a] / CELL));
    for (let a = 0; a < 3; a++) {
      if (lo[a] < -CELL_RANGE || hi[a] >= CELL_RANGE) throw new Error(`clearance: geometry ${(lo[a] * CELL).toFixed(0)} m out on axis ${a}, past the envelope's hash range`);
    }
    for (let x = lo[0]; x <= hi[0]; x++) {
      for (let y = lo[1]; y <= hi[1]; y++) {
        for (let z = lo[2]; z <= hi[2]; z++) fn(((x + CELL_RANGE) * 2 * CELL_RANGE + (y + CELL_RANGE)) * 2 * CELL_RANGE + (z + CELL_RANGE));
      }
    }
  }
}

/** Numbers per sample box in CourseEnvelope.box. */
const BOX = 16;
const TRI_LOCAL = new Float64Array(9);

/**
 * Headroom over each sample of a ribbon: SCENERY_HEADROOM, raised along every jump's and
 * kicker's flight to the arc of the fastest racer we plan for (the highest arc: at any distance
 * past the lip a faster racer is higher) plus the same headroom over it.
 */
function flightHeadroom(r: Ribbon, features: TrackFeature[]): Float64Array {
  const head = new Float64Array(r.samples.length).fill(SCENERY_HEADROOM);
  for (const f of features) {
    if (f.kind !== 'jump' && f.kind !== 'kicker') continue;
    const s0 = r.paramToS(f.at);
    const run = f.kind === 'jump' ? f.rampLength : f.length;
    const rise = f.kind === 'jump' ? f.rampHeight : f.height;
    // Both ramps rise as t², so they leave the lip at twice their mean slope.
    const slope = (2 * rise) / run;
    const launch = r.wrap(s0 + run);
    const y0 = r.elevationAt(launch);
    for (let d = FLIGHT_STEP; d < FLIGHT_MAX; d += FLIGHT_STEP) {
      const s = r.wrap(launch + d);
      if (!r.closed && (s >= r.length || s <= 0)) break;
      const over = y0 + slope * d - (GRAVITY * d * d) / (2 * PLANNED_TOP_SPEED * PLANNED_TOP_SPEED) - r.elevationAt(s);
      if (over <= 0 && !r.isGap(s)) break;
      const k = Math.round(s / r.step) % r.samples.length;
      head[k] = Math.max(head[k], over + SCENERY_HEADROOM);
    }
  }
  return head;
}

function dist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Triangle (box-local coordinates, 9 numbers) against the box ±(ex, ey, ez): Akenine-Möller's
 * separating-axis test (the box's 3 faces, the triangle's plane, the 9 edge cross products).
 */
function triBoxOverlap(v: Float64Array, ex: number, ey: number, ez: number): boolean {
  const e = [ex, ey, ez];
  for (let a = 0; a < 3; a++) {
    const lo = Math.min(v[a], v[3 + a], v[6 + a]);
    const hi = Math.max(v[a], v[3 + a], v[6 + a]);
    if (lo > e[a] || hi < -e[a]) return false;
  }
  const f = [
    [v[3] - v[0], v[4] - v[1], v[5] - v[2]],
    [v[6] - v[3], v[7] - v[4], v[8] - v[5]],
    [v[0] - v[6], v[1] - v[7], v[2] - v[8]],
  ];
  // The 9 axes: unit box axis × triangle edge.
  for (const ed of f) {
    for (let a = 0; a < 3; a++) {
      // axis = unit(a) × ed
      const ax = a === 0 ? [0, -ed[2], ed[1]] : a === 1 ? [ed[2], 0, -ed[0]] : [-ed[1], ed[0], 0];
      const p0 = ax[0] * v[0] + ax[1] * v[1] + ax[2] * v[2];
      const p1 = ax[0] * v[3] + ax[1] * v[4] + ax[2] * v[5];
      const p2 = ax[0] * v[6] + ax[1] * v[7] + ax[2] * v[8];
      const r = e[0] * Math.abs(ax[0]) + e[1] * Math.abs(ax[1]) + e[2] * Math.abs(ax[2]);
      if (Math.min(p0, p1, p2) > r || Math.max(p0, p1, p2) < -r) return false;
    }
  }
  // The triangle's plane.
  const n = [f[0][1] * f[1][2] - f[0][2] * f[1][1], f[0][2] * f[1][0] - f[0][0] * f[1][2], f[0][0] * f[1][1] - f[0][1] * f[1][0]];
  const d = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
  const r = e[0] * Math.abs(n[0]) + e[1] * Math.abs(n[1]) + e[2] * Math.abs(n[2]);
  return Math.abs(d) <= r;
}

/**
 * Every top-level object the track scene builds, by name (trailing numbers dropped): what it is
 * to the audit. A name missing here fails the audit, so new scenery cannot slip past it.
 */
const SCENE_RULES: Record<string, ClearanceRule> = {
  road: 'course',
  sand: 'course',
  rock: 'course',
  terrain: 'course',
  sea: 'course',
  harbourWater: 'course',
  horizon: 'course',
  coastHorizon: 'course',
  boostPads: 'course',
  padBeacons: 'course',
  boostCells: 'course',
  boostCellsHalos: 'course',
  repairCells: 'course',
  repairCellsHalos: 'course',
  forceField: 'course',
  streetMarkings: 'course',
  // A street's barrier: the hard boundary itself.
  debrisFence: 'course',
  forkSigns: 'course',
  // A space course's own tube and the bore it flies through.
  tubeHull: 'course',
  bore: 'course',
  // Lit seams and edges of the course, hazard bands, banners: flat faces on course and props.
  glow: 'course',
  hazardLamps: 'hazard',
  hazardRings: 'hazard',
  hazardShadows: 'hazard',
  hazardDust: 'hazard',
  hazardDebris: 'hazard',
  hazardBars: 'hazard',
  hazardBodies: 'hazard',
  gustStreaks: 'hazard',
  boulders: 'hazard',
  gulls: 'air',
  stationLights: 'air',
  props: 'scenery',
  pylons: 'marker',
  pylonTips: 'marker',
  lamps: 'marker',
  lampPosts: 'marker',
  buoys: 'marker',
  palms: 'scenery',
  pines: 'scenery',
  peaks: 'scenery',
  seracs: 'scenery',
  huts: 'scenery',
  lifeguardTowers: 'scenery',
  surfFlags: 'scenery',
  duneGrass: 'scenery',
  scatterRocks: 'scenery',
  'scatter-rocks': 'scenery',
  'scatter-cacti': 'scenery',
  'scatter-bones': 'scenery',
  'scatter-shards': 'scenery',
  billboards: 'scenery',
  billboardPoles: 'scenery',
  'city-box': 'scenery',
  'city-cylinder': 'scenery',
  'city-dome': 'scenery',
  'city-spire': 'scenery',
  'city-twist': 'scenery',
  megastructure: 'scenery',
  gantries: 'scenery',
  solarArrays: 'scenery',
  asteroids: 'scenery',
  farAsteroids: 'scenery',
};

/** Landmarks that are weather or sky, not things: nothing in them is solid. */
const AIRY_LANDMARKS = new Set(['stormwall', 'auroraSky']);

/** A landmark's meshes by name: what each is to the audit (unnamed ones are its solid parts). */
const LANDMARK_PART_RULES: Record<string, ClearanceRule> = {
  '': 'scenery',
  solid: 'scenery',
  moving: 'scenery',
  crowd: 'scenery',
  lights: 'scenery',
  screen: 'scenery',
  facades: 'scenery',
  boards: 'scenery',
  water: 'scenery',
  'rig-solid': 'scenery',
  'rig-glow': 'scenery',
  barge: 'scenery',
  tug: 'scenery',
  craneLoad: 'scenery',
  leviathan: 'scenery',
  leviathanHead: 'scenery',
  leviathanTail: 'scenery',
  passJets: 'scenery',
  lavaBombs: 'air',
  beams: 'air',
  'rig-beam': 'air',
  dragon: 'air',
  aurora: 'air',
};

/** Which rule a scene object falls under, from its path of names below the track's group. */
export function clearanceRule(path: string[]): ClearanceRule {
  const top = path[0];
  if (top.startsWith('landmark:')) {
    if (AIRY_LANDMARKS.has(top.slice('landmark:'.length))) return 'air';
    const part = path.length > 1 ? path[path.length - 1] : '';
    const rule = LANDMARK_PART_RULES[part];
    if (!rule) throw new Error(`clearance: no rule for landmark part "${path.join('/')}" (add it to LANDMARK_PART_RULES)`);
    return rule;
  }
  const rule = SCENE_RULES[top.replace(/[\d:]+$/, '')];
  if (!rule) throw new Error(`clearance: no rule for scene object "${top}" (add it to SCENE_RULES)`);
  return rule;
}

/**
 * Audits the built scene's top-level objects (the track group's children, or some of them):
 * every scenery triangle against the course's envelope. `bound`
 * landmarks may reach into the main road over their hazard's span (that is their job), nowhere
 * else. A mesh may name per-instance rules (`userData.clearance`, one per instance) where one
 * instanced kit holds both course and scenery pieces. Returns one finding per object and spot.
 */
export function auditClearance(objects: readonly THREE.Object3D[], track: Track, env: CourseEnvelope, bound: BoundSpan[]): ClearanceFinding[] {
  for (const o of objects) o.updateWorldMatrix(true, true);
  const found = new Map<string, ClearanceFinding[]>();
  const record = (what: string, i: number, tri: THREE.Vector3[]) => {
    const branch = env.branchOf[i];
    const s = env.sOf[i];
    const spots = found.get(what) ?? [];
    found.set(what, spots);
    const near = spots.find((f) => f.branch === branch && s >= f.s0 - SPOT_GAP && s <= f.s1 + SPOT_GAP);
    if (near) {
      near.s0 = Math.min(near.s0, s);
      near.s1 = Math.max(near.s1, s);
      near.tris++;
      return;
    }
    const at = new THREE.Vector3().add(tri[0]).add(tri[1]).add(tri[2]).divideScalar(3);
    const l = env.local(i, at);
    spots.push({ what, branch, s0: s, s1: s, x: l.x, h: l.h, edge: env.edge(i, l.x), head: env.head(i), at, tris: 1 });
  };
  for (const top of objects) {
    const span = bound.find((b) => b.group === top);
    const allowed = span ? (i: number) => env.branchOf[i] === -1 && inSpan(track, env.sOf[i], span) : null;
    top.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const path: string[] = [top.name];
      const below: string[] = [];
      for (let p: THREE.Object3D | null = o; p && p !== top; p = p.parent) if (p.name) below.unshift(p.name);
      path.push(...below);
      const rule = clearanceRule(path);
      const perInstance = o.userData.clearance as ClearanceRule[] | undefined;
      if (!perInstance && !checked(rule)) return;
      const name = path.join('/');
      meshTriangles(o, env, (inst, tri) => {
        const r = perInstance && inst >= 0 ? perInstance[inst] : rule;
        if (!checked(r)) return;
        const hit = env.hit(tri, skinOf(r), allowed);
        if (hit >= 0) record(inst < 0 ? name : `${name}#${inst}`, hit, tri);
      });
    });
  }
  return [...found.values()].flat();
}

function checked(rule: ClearanceRule): boolean {
  return rule === 'scenery' || rule === 'marker';
}

function skinOf(rule: ClearanceRule): number {
  return rule === 'marker' ? MARKER_SKIN : 0;
}

/** One line naming a finding, for the console and the scenery check. */
export function describeFinding(track: Track, f: ClearanceFinding): string {
  const where = f.branch < 0 ? 'main loop' : `branch ${track.branches[f.branch].def.name}`;
  const along = f.s1 > f.s0 ? `s=${f.s0.toFixed(0)}..${f.s1.toFixed(0)}` : `s=${f.s0.toFixed(0)}`;
  const across = `x=${f.x.toFixed(1)} (boundary ${f.x < 0 ? '-' : '+'}${f.edge.toFixed(1)}), ${f.h.toFixed(1)} m up (headroom ${f.head.toFixed(1)})`;
  return `${f.what} in the ${where} at ${along} ${across}, world (${f.at.x.toFixed(0)}, ${f.at.y.toFixed(0)}, ${f.at.z.toFixed(0)}), ${f.tris} triangle${f.tris === 1 ? '' : 's'}`;
}

/** Logs every finding as a console error, one line each (the game and the level viewer). */
export function reportClearance(track: Track, found: ClearanceFinding[]): void {
  if (found.length === 0) return;
  console.error(`clearance audit: ${found.length} spot${found.length === 1 ? '' : 's'} on ${track.def.id} where scenery stands in the drivable envelope`);
  for (const f of found) console.error(`clearance audit: ${describeFinding(track, f)}`);
}

function inSpan(track: Track, s: number, span: BoundSpan): boolean {
  return track.delta(span.s0 - BOUND_REACH, s) >= 0 && track.delta(s, span.s1 + BOUND_REACH) >= 0;
}

const TRI_BB = new Float64Array(6);

function triBounds(t: THREE.Vector3[]): Float64Array {
  TRI_BB[0] = Math.min(t[0].x, t[1].x, t[2].x);
  TRI_BB[1] = Math.min(t[0].y, t[1].y, t[2].y);
  TRI_BB[2] = Math.min(t[0].z, t[1].z, t[2].z);
  TRI_BB[3] = Math.max(t[0].x, t[1].x, t[2].x);
  TRI_BB[4] = Math.max(t[0].y, t[1].y, t[2].y);
  TRI_BB[5] = Math.max(t[0].z, t[1].z, t[2].z);
  return TRI_BB;
}

/**
 * Every world-space triangle of a mesh (each instance of an instanced one, skinned ones posed),
 * skipping a whole instance when its bounds meet no envelope box. `inst` is -1 for a plain mesh.
 */
function meshTriangles(m: THREE.Mesh, env: CourseEnvelope, fn: (inst: number, tri: THREE.Vector3[]) => void): void {
  const instanced = m instanceof THREE.InstancedMesh;
  const skinned = m instanceof THREE.SkinnedMesh ? m : null;
  if (skinned) skinned.skeleton.update();
  const mat = new THREE.Matrix4();
  const inst = new THREE.Matrix4();
  const count = instanced ? m.count : 1;
  for (let j = 0; j < count; j++) {
    mat.copy(m.matrixWorld);
    if (instanced) {
      m.getMatrixAt(j, inst);
      // Hidden instances are scaled to nothing.
      if (Math.abs(inst.determinant()) < HIDDEN_DET) continue;
      mat.multiply(inst);
    }
    geometryTriangles(m.geometry, mat, skinned, env, (tri) => fn(instanced ? j : -1, tri));
  }
}

const GT_V = new THREE.Vector3();
const GT_TRI = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const GT_BOX = new THREE.Box3();
const GT_BB = new Float64Array(6);

/**
 * The world-space triangles of geometry `g` placed by `mat` (posed by `skinned`'s bones when
 * given), or none when its bounds meet no envelope box (a skinned pose is always walked: its
 * bind-pose bounds say nothing of it).
 */
function geometryTriangles(g: THREE.BufferGeometry, mat: THREE.Matrix4, skinned: THREE.SkinnedMesh | null, env: CourseEnvelope, fn: (tri: THREE.Vector3[]) => void): void {
  const pos = g.attributes.position;
  if (!pos) return;
  if (!skinned) {
    if (!g.boundingBox) g.computeBoundingBox();
    const box = g.boundingBox;
    if (!box) throw new Error('clearance: geometry without bounds');
    GT_BOX.copy(box).applyMatrix4(mat);
    GT_BB.set([GT_BOX.min.x, GT_BOX.min.y, GT_BOX.min.z, GT_BOX.max.x, GT_BOX.max.y, GT_BOX.max.z]);
    if (!env.touches(GT_BB, 0)) return;
  }
  const index = g.index;
  const total = index ? index.count : pos.count;
  const first = g.drawRange.start;
  const end = Math.min(total, first + g.drawRange.count);
  const world = new Float64Array(pos.count * 3);
  for (let q = 0; q < pos.count; q++) {
    if (skinned) skinned.getVertexPosition(q, GT_V);
    else GT_V.fromBufferAttribute(pos, q);
    GT_V.applyMatrix4(mat);
    world[q * 3] = GT_V.x;
    world[q * 3 + 1] = GT_V.y;
    world[q * 3 + 2] = GT_V.z;
  }
  for (let t = first - (first % 3); t + 2 < end; t += 3) {
    for (let c = 0; c < 3; c++) {
      const q = index ? index.getX(t + c) : t + c;
      GT_TRI[c].set(world[q * 3], world[q * 3 + 1], world[q * 3 + 2]);
    }
    fn(GT_TRI);
  }
}

/** An instance matrix whose determinant is under this is a hidden one (scaled to nothing). */
const HIDDEN_DET = 1e-12;
