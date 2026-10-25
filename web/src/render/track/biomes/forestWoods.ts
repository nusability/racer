import * as THREE from 'three';
import { range, type Rng } from '../../../core/rng.ts';
import type { Ribbon } from '../../../core/track.ts';
import type { ForestClearing, ForestScenery } from '../../../data/tracks/scenery.ts';
import type { Corridor } from '../corridor.ts';
import type { Ground } from '../ground.ts';
import type { DressContext } from './kit.ts';
import { LOG_RADIUS, TRUNK_FLARE } from './forestProps.ts';
import { TRUNK_FRAME_WIDTH } from './forestPaint.ts';
import type { SpriteCells } from './forestSprites.ts';
import type { TrunkCells } from './forestTrunks.ts';

// Where everything in Elderwood stands. The trail's hard boundary is a colonnade of real trunks
// standing right at it, flare touching the line, so what a racer sees is what it hits; where no
// trunk can stand (a landmark, a herd's crossing, a glade, a town) a fallen log lies along the
// line instead, so the boundary always shows. Behind it a second rank closes the gaps and the
// deep woods layer back into the mist (impostors, both), ferns crowd the edges, shrubs and
// fallen logs the floor, and canopy clumps hang far overhead.

/** True giants are this big (barrel radius, m): 8–12 m across. */
const GIANT_RADIUS: readonly [number, number] = [4, 6];
/** Trunks rise to this share of the scenery's canopy height (they vanish into its shade). */
const TRUNK_HEIGHT: readonly [number, number] = [0.85, 1.15];
/**
 * A colonnade trunk's centre stands this many barrel radii past the boundary line: its flare
 * (forestProps.ts) meets the line at a hovering craft's height, so the bark is where the wall
 * collides; only the very toe of the roots reaches a little under the craft.
 */
const COLONNADE_SET = 1.45;
/**
 * A pillar's barrel is its collision radius over this: the flare round it is as wide as the
 * collision cylinder at a craft's height, slimmer above, a little wider at the very foot.
 */
const PILLAR_FLARE = 1.25;
/** The deep woods and the floor are scattered over stretches of trail this long (m). */
const SCATTER_SEGMENT = 50;
/** A trunk's foot sinks this far, so a slope or the edge's bank never shows daylight under its flare. */
const TREE_SINK = 1;
/** Along s, the colonnade walks this far past a spot where nothing can stand before trying again (m). */
const SKIP_STEP = 2;
/**
 * The rank behind the colonnade: the share of its trunks that have one behind, how far back
 * (m past the front trunk's flare) and its trunks' size (× the colonnade's radius range).
 */
const SECOND_RANK = 0.6;
const SECOND_BACK: readonly [number, number] = [3, 12];
const SECOND_SIZE = 0.9;
/** Smallest trunk worth squeezing into a narrow gap (a divider between two roads), barrel radius m. */
const MIN_TRUNK = 0.7;
/**
 * The deep woods start this far past the boundary (behind the two 3D ranks) and are densest in
 * this first band (m); further out they thin to DEEP_THIN of the scenery's density.
 */
const DEEP_START = 14;
const DEEP_BAND = 70;
const DEEP_THIN = 0.45;
/** Deep trunks' barrel radius (× the colonnade's range): some as big as the giants. */
const DEEP_RADIUS: readonly [number, number] = [0.8, 1.6];
/** Low quality keeps this share of the deep woods and the floor's sprites. */
const LOW_SHARE = 0.55;
/** A fallen log laid along the boundary where no trunk stands: its length and radius (m). */
const BARRIER_LOG: readonly [number, number] = [11, 0.85];
/** A herd's crossing keeps this many of its body radii clear either side of its line. */
const HERD_LANE = 1.8;
/** Clearings: trunks keep this far back from a glade's trail, and from a town's (m). */
const GLADE_CLEAR = 14;
const TOWN_CLEAR = 140;
/**
 * Ferns along each edge per metre at undergrowth 1, their size (m across) and where they grow
 * (m past the boundary; fronds spill a metre over it). Shrubs and floor ferns further out, per
 * hectare, and their size.
 */
const EDGE_FERNS = 3;
const EDGE_FERN_SIZE: readonly [number, number] = [2, 4];
const EDGE_FERN_AT: readonly [number, number] = [0.4, 6];
const FLOOR_FERNS_PER_HA = 170;
const FLOOR_FERN_SIZE: readonly [number, number] = [1.8, 3.6];
const SHRUBS_PER_HA = 70;
const SHRUB_SIZE: readonly [number, number] = [3, 7];
/** The floor's ferns and shrubs grow out to this far past the boundary (beyond it fog takes them). */
const FLOOR_REACH = 90;
/** Fallen logs on the floor per kilometre at undergrowth 1, their length (m) and how far out. */
const LOGS_PER_KM = 12;
const LOG_LENGTH: readonly [number, number] = [12, 34];
const LOG_REACH: readonly [number, number] = [4, 70];
/**
 * Canopy clumps per kilometre at canopy 1, their width (m), height (× canopy height) and how
 * far either side of the trail they hang (m): over the trail, and over the woods out to their
 * depth, where they hang lower, round the trunks' tops, so no trunk ends against the sky.
 */
const CLUMPS_PER_KM = 300;
const CLUMP_SIZE: readonly [number, number] = [30, 70];
const CLUMP_HEIGHT: readonly [number, number] = [0.55, 0.9];
const CLUMP_SIDE = 70;
const WOODS_CLUMPS_PER_KM = 800;
const WOODS_CLUMP_SIZE: readonly [number, number] = [60, 110];
const WOODS_CLUMP_HEIGHT: readonly [number, number] = [0.6, 0.95];
/** Waymarker stones stand on the outside of bends tighter than this radius (m), this far apart. */
const WAYMARK_RADIUS = 450;
const WAYMARK_SPACING = 36;
/** A lantern hangs this far off the bark (m), this high (m). */
const LANTERN_OFF = 0.5;
const LANTERN_HEIGHT: readonly [number, number] = [3.5, 6];
/** Sprite shade spread (instance brightness). */
const SHADE: readonly [number, number] = [0.8, 1.1];

/** The sprite-atlas uses the woods place, by role (forest.ts builds the list). */
export interface SpriteUses {
  /** Trunk impostors of the deep woods (always sprites), one per trunk frame. */
  deep: number[];
  /** Impostors of the 3D trunks, shown only past the 3D range, one per trunk frame. */
  near: number[];
  ferns: number[];
  shrub: number;
  canopy: number;
}

export interface Woods {
  trunks: TrunkCells;
  sprites: SpriteCells;
  /** Fallen logs to stamp into the course's props: placement and tint. */
  logs: { m: THREE.Matrix4; c: THREE.Color }[];
  /** Waymarker stones (placement) on the bends. */
  stones: THREE.Matrix4[];
  /** Lanterns hung on the colonnade, where they glow. */
  lanterns: THREE.Vector3[];
}

/** The clearings' spans on the main loop, and which one covers a stretch of it. */
export class Clearings {
  private readonly spans: { s0: number; s1: number; style: ForestClearing['style'] }[];

  constructor(main: Ribbon, list: ForestClearing[]) {
    this.spans = list.map((c) => ({ s0: main.paramToS(c.from), s1: main.paramToS(c.to), style: c.style }));
  }

  /** The clearing at main-loop distance s, or null. */
  at(s: number): ForestClearing['style'] | null {
    for (const c of this.spans) {
      const inside = c.s0 <= c.s1 ? s >= c.s0 && s <= c.s1 : s >= c.s0 || s <= c.s1;
      if (inside) return c.style;
    }
    return null;
  }

  /** The clearing whose stretch of the main loop is nearest (x, z), with the distance past that road's boundary; null outside them. */
  near(g: Ground, x: number, z: number): { style: ForestClearing['style']; gap: number } | null {
    if (this.spans.length === 0) return null;
    const near = g.nearestOn(0, x, z);
    if (!near) return null;
    const smp = g.views[0].ribbon.samples[near.k];
    const style = this.at(smp.s);
    if (!style) return null;
    return { style, gap: Math.abs(near.d) - (near.d < 0 ? smp.edgeL : smp.edgeR) };
  }
}

const UP = new THREE.Vector3(0, 1, 0);

export function plantWoods(ctx: DressContext, scenery: ForestScenery, clearings: Clearings, uses: SpriteUses, rng: Rng, woods: Woods): void {
  const g = ctx.ground;
  const keep = ctx.quality === 'high' ? 1 : LOW_SHARE;
  const gaps = [...hazardGaps(ctx), ...landmarkViews(ctx)];
  const bound = ctx.landmarks.filter((l) => l.bound);

  /** Something comes through the trail's edge here (a herd's lane, a falling giant, rolling logs): no trunk. */
  const atEdge = (x: number, z: number, r: number) => g.inFootprint(x, z) || gaps.some((gap) => gap(x, z, r));
  /** Inside a landmark: its own scenery stands there (a bound one's radius is all of it). */
  const inLandmark = (x: number, z: number, r: number) => g.inFootprint(x, z) || bound.some((l) => Math.hypot(x - l.x, z - l.z) < l.radius + r);
  /** Within a clearing's open ground (by its reach from the trail). */
  const inClearing = (x: number, z: number, r: number) => {
    const open = clearings.near(g, x, z);
    return open !== null && open.gap < (open.style === 'glade' ? GLADE_CLEAR : TOWN_CLEAR) + r;
  };
  /** A disc of radius r stands clear of every road (by `margin`) and of everything kept open. */
  const free = (x: number, z: number, r: number, margin: number) => g.boundaryGap(x, z) >= r + margin && !atEdge(x, z, r) && !inLandmark(x, z, r) && !inClearing(x, z, r);
  const trunkAt = (x: number, z: number, r: number, frame: number) => {
    const h = scenery.treeHeight * range(rng, TRUNK_HEIGHT[0], TRUNK_HEIGHT[1]);
    const y = g.height(x, z) - TREE_SINK;
    const shade = range(rng, SHADE[0], SHADE[1]);
    woods.trunks.add(x, y, z, rng() * Math.PI * 2, r, h, shade);
    woods.sprites.add(x, y, z, TRUNK_FRAME_WIDTH * 2 * r, h, uses.near[frame % uses.near.length], shade);
  };
  const radius = () => range(rng, scenery.trunkRadius[0], scenery.trunkRadius[1]);
  const deepTrunk = (x: number, z: number, r: number) => {
    const h = scenery.treeHeight * range(rng, TRUNK_HEIGHT[0], TRUNK_HEIGHT[1]);
    woods.sprites.add(x, g.height(x, z) - TREE_SINK, z, TRUNK_FRAME_WIDTH * 2 * r, h, uses.deep[Math.floor(rng() * uses.deep.length)], range(rng, SHADE[0], SHADE[1]));
  };

  for (const cor of ctx.corridors) {
    const r = cor.ribbon;
    const end = r.closed ? r.length : r.length - r.step;
    for (const side of [-1, 1]) {
      let next = radius();
      for (let s = rng() * scenery.trunkGap[1]; s < end; ) {
        const k = Math.round(s / r.step);
        if (!walled(cor, k, side)) {
          s += SKIP_STEP;
          continue;
        }
        const giant = rng() < (scenery.giantsPerKm / 2000) * (2 * TRUNK_FLARE * next + scenery.trunkGap[1]);
        let rad = giant ? range(rng, GIANT_RADIUS[0], GIANT_RADIUS[1]) : next;
        let p = cor.beside(k, side, COLONNADE_SET * rad, 0);
        // Where another road runs close (a fork's divider), a smaller trunk fits the gap.
        const room = g.boundaryGap(p.x, p.z) + COLONNADE_SET * rad;
        if (room < 2 * COLONNADE_SET * rad) {
          rad = room / (2 * COLONNADE_SET);
          p = cor.beside(k, side, COLONNADE_SET * rad, 0);
        }
        if (atEdge(p.x, p.z, 0) || inClearing(p.x, p.z, 0)) {
          // The boundary still shows where no trunk may stand: a fallen log along the line.
          barrierLog(cor, k, side, woods, rng);
          s += BARRIER_LOG[0];
          continue;
        }
        if (rad < MIN_TRUNK) {
          s += SKIP_STEP;
          continue;
        }
        trunkAt(p.x, p.z, rad, Math.floor(rng() * uses.near.length));
        next = radius();
        const gap = range(rng, scenery.trunkGap[0], scenery.trunkGap[1]);
        const advance = TRUNK_FLARE * (rad + next) + gap;
        // A lantern on the bark facing the trail, behind the line (the barrel stands back of the flare).
        if (rng() < (scenery.lanternsPerKm / 2000) * advance) {
          const q = cor.beside(k, side, (COLONNADE_SET - 1) * rad - LANTERN_OFF, 0);
          woods.lanterns.push(new THREE.Vector3(q.x, g.height(q.x, q.z) + range(rng, LANTERN_HEIGHT[0], LANTERN_HEIGHT[1]), q.z));
        }
        // The rank behind, staggered into the gap this trunk leaves: a step back from the trail,
        // so an impostor already (a racer never passes close enough to see it flat).
        if (rng() < SECOND_RANK) {
          const r2 = radius() * SECOND_SIZE;
          const k2 = Math.round((s + advance / 2) / r.step);
          if (walled(cor, k2, side)) {
            const q = cor.beside(k2, side, COLONNADE_SET * rad + TRUNK_FLARE * r2 + range(rng, SECOND_BACK[0], SECOND_BACK[1]), 0);
            if (free(q.x, q.z, TRUNK_FLARE * r2, 0)) deepTrunk(q.x, q.z, r2);
          }
        }
        s += advance;
      }
    }
  }

  // Trunks standing in the trail: the course's pillars, at their collision radius.
  for (const cor of ctx.corridors) {
    for (const o of cor.ribbon.obstacles) {
      if (o.kind !== 'pillar') continue;
      const p = cor.ribbon.toWorld(o.s, o.x, 0);
      trunkAt(p.x, p.z, o.radius / PILLAR_FLARE, Math.floor(rng() * uses.near.length));
    }
  }

  // The deep woods: impostors layered back into the mist, densest right behind the 3D ranks.
  for (const cor of ctx.corridors) {
    const r = cor.ribbon;
    const segment = SCATTER_SEGMENT;
    for (let s = 0; s < r.length; s += segment) {
      const k = Math.round(s / r.step);
      if (cor.gap(k) || cor.tunnel(k)) continue;
      for (const side of [-1, 1]) {
        if (cor.drop(k, side)) continue;
        for (const [from, to, share] of [
          [DEEP_START, DEEP_START + DEEP_BAND, 1],
          [DEEP_START + DEEP_BAND, scenery.forestDepth, DEEP_THIN],
        ] as const) {
          const n = poisson(rng, (scenery.woodsPerHa * share * keep * segment * (to - from)) / 10000);
          for (let i = 0; i < n; i++) {
            const kk = Math.round((s + rng() * segment) / r.step);
            const rad = radius() * range(rng, DEEP_RADIUS[0], DEEP_RADIUS[1]);
            const p = cor.beside(kk, side, range(rng, from, to), 0);
            if (!free(p.x, p.z, TRUNK_FLARE * rad, DEEP_START * 0.5)) continue;
            deepTrunk(p.x, p.z, rad);
          }
        }
      }
    }
  }

  floor(ctx, scenery, uses, rng, woods, keep, inLandmark);
  canopy(ctx, scenery, clearings, uses, rng, woods);
  waymarks(ctx, woods);
}

/** The side of sample k is bounded by the kit's trunks (not a junction, chasm, drop, tunnel or canyon). */
function walled(cor: Corridor, k: number, side: number): boolean {
  return !(cor.gap(k) || cor.tunnel(k) || cor.deck(k) || cor.junction(k) || cor.open(k, side) || cor.drop(k, side) || cor.shape.canyon[cor.idx(k)] > 0);
}

/** A fallen log along the boundary at sample k, resting against the line from outside. */
function barrierLog(cor: Corridor, k: number, side: number, woods: Woods, rng: Rng): void {
  const [len, rad] = BARRIER_LOG;
  const kk = cor.idx(k + Math.round(len / 2 / cor.ribbon.step));
  const p = cor.beside(kk, side, rad, 0);
  const t = cor.ribbon.samples[kk].tangent;
  const yaw = Math.atan2(-t.z, t.x);
  // Bedded a little into the floor; the log geometry is a unit long with radius LOG_RADIUS.
  const y = cor.ground.height(p.x, p.z) - rad * LOG_BED;
  const thick = rad / LOG_RADIUS;
  woods.logs.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(p.x, y, p.z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(len * 1.15, thick, thick)), c: new THREE.Color().setScalar(range(rng, 0.8, 1.05)) });
}
/** A barrier log sinks this share of its radius into the floor. */
const LOG_BED = 0.3;

/**
 * Where a hazard comes through the trail's edge, no trunk may stand there (main loop, track
 * space): a herd's lane either side of its crossing line, out as far as it walks; the span a
 * falling giant lands across, both sides; the stretch rolling logs come down onto.
 */
function hazardGaps(ctx: DressContext): ((x: number, z: number, r: number) => boolean)[] {
  const main = ctx.corridors[0].ribbon;
  const inSpan = (s0: number, s1: number, reach: number) => (x: number, z: number, r: number) => {
    const near = ctx.ground.nearestOn(0, x, z);
    if (!near || Math.abs(near.d) > reach) return false;
    const s = main.samples[near.k].s;
    return main.delta(s0 - r, s) >= 0 && main.delta(s, s1 + r) >= 0;
  };
  return main.hazards.flatMap((h) => {
    const d = h.def;
    switch (d.type) {
      case 'sweeper': {
        const half = d.radius * HERD_LANE;
        return [inSpan(h.s0 - half, h.s0 + half, Math.max(Math.abs(d.xFrom), Math.abs(d.xTo)))];
      }
      case 'blocker':
        return [inSpan(h.s0 - FALL_CLEAR, h.s0 + FALL_CLEAR, FALL_REACH)];
      case 'dropper':
        return [inSpan(h.s0 - CHUTE_CLEAR, h.s1 + CHUTE_CLEAR, CHUTE_REACH)];
      case 'gust':
        return [];
    }
  });
}
/**
 * A set piece beside the trail (a waterfall, ruins, the tree village) is seen from it: the woods
 * open between the trail and the landmark over the stretch it faces (its footprint's width,
 * SIGHTLINE of it), no colonnade there (a log marks the boundary) and no trees in between.
 */
function landmarkViews(ctx: DressContext): ((x: number, z: number, r: number) => boolean)[] {
  return ctx.landmarks.flatMap((l) => {
    if (l.bound) return [];
    const at = ctx.ground.nearest(l.x, l.z);
    if (!at) return [];
    const ribbon = ctx.ground.views[at.v].ribbon;
    const s0 = ribbon.samples[at.k].s;
    const side = Math.sign(at.d);
    const half = l.radius * SIGHTLINE;
    return [
      (x: number, z: number, r: number) => {
        const near = ctx.ground.nearestOn(at.v, x, z);
        if (!near || Math.sign(near.d) !== side || Math.abs(near.d) - r > Math.abs(at.d)) return false;
        return Math.abs(ribbon.delta(s0, ribbon.samples[near.k].s)) < half + r;
      },
    ];
  });
}
/** The share of a landmark's footprint radius, either side of it along the trail, that the woods open to show it. */
const SIGHTLINE = 0.8;
/** A falling giant's trunk lands across this much of the trail's length either side of its line, out to this far (m). */
const FALL_CLEAR = 9;
const FALL_REACH = 60;
/** Rolling logs come down the chute over the dropper's span and this much either side, from this far out (m). */
const CHUTE_CLEAR = 10;
const CHUTE_REACH = 40;

/** Knuth's Poisson draw: how many of something with mean `mean` land in one patch. */
function poisson(rng: Rng, mean: number): number {
  if (mean > 30) return Math.round(mean + (rng() + rng() + rng() - 1.5) * Math.sqrt(mean) * 1.15);
  const L = Math.exp(-mean);
  let k = 0;
  for (let p = rng(); p > L; p *= rng()) k++;
  return k;
}

type Kept = (x: number, z: number, r: number) => boolean;

/** Ferns crowding both edges, shrubs and ferns over the floor, fallen logs among the trunks. */
function floor(ctx: DressContext, scenery: ForestScenery, uses: SpriteUses, rng: Rng, woods: Woods, keep: number, kept: Kept): void {
  const g = ctx.ground;
  const lush = scenery.undergrowth * keep;
  for (const cor of ctx.corridors) {
    const r = cor.ribbon;
    for (const side of [-1, 1]) {
      const step = 1 / (EDGE_FERNS * lush);
      for (let s = rng() * step; s < r.length; s += step * range(rng, 0.5, 1.5)) {
        const k = Math.round(s / r.step);
        if (cor.gap(k) || cor.tunnel(k) || cor.deck(k) || cor.open(k, side) || cor.drop(k, side)) continue;
        const p = cor.beside(k, side, range(rng, EDGE_FERN_AT[0], EDGE_FERN_AT[1]), 0);
        if (g.boundaryGap(p.x, p.z) < EDGE_FERN_AT[0] * 0.5 || kept(p.x, p.z, 0)) continue;
        const w = range(rng, EDGE_FERN_SIZE[0], EDGE_FERN_SIZE[1]);
        woods.sprites.add(p.x, g.height(p.x, p.z) - 0.2, p.z, w, w * range(rng, 0.7, 1), uses.ferns[Math.floor(rng() * uses.ferns.length)], range(rng, SHADE[0], SHADE[1]));
      }
      // The floor further out: ferns and shrubs scattered over a band along this side.
      const segment = SCATTER_SEGMENT;
      for (let s = 0; s < r.length; s += segment) {
        const k = Math.round(s / r.step);
        if (cor.gap(k) || cor.tunnel(k) || cor.drop(k, side)) continue;
        const area = (segment * FLOOR_REACH) / 10000;
        for (const [perHa, size, use] of [
          [FLOOR_FERNS_PER_HA, FLOOR_FERN_SIZE, -1],
          [SHRUBS_PER_HA, SHRUB_SIZE, uses.shrub],
        ] as const) {
          const n = poisson(rng, perHa * area * lush);
          for (let i = 0; i < n; i++) {
            const kk = Math.round((s + rng() * segment) / r.step);
            // Crowding toward the trail, where they are seen.
            const p = cor.beside(kk, side, EDGE_FERN_AT[1] + Math.pow(rng(), 1.6) * FLOOR_REACH, 0);
            if (g.boundaryGap(p.x, p.z) < EDGE_FERN_AT[1] || kept(p.x, p.z, 0)) continue;
            const w = range(rng, size[0], size[1]);
            const u = use < 0 ? uses.ferns[Math.floor(rng() * uses.ferns.length)] : use;
            woods.sprites.add(p.x, g.height(p.x, p.z) - 0.3, p.z, w, w * range(rng, 0.6, 0.9), u, range(rng, SHADE[0], SHADE[1]));
          }
        }
      }
    }
    const nLogs = Math.round(((LOGS_PER_KM * r.length) / 1000) * lush);
    for (let i = 0; i < nLogs; i++) {
      const k = Math.floor(rng() * r.samples.length);
      const side = rng() < 0.5 ? -1 : 1;
      if (cor.gap(k) || cor.tunnel(k) || cor.drop(k, side)) continue;
      const L = range(rng, LOG_LENGTH[0], LOG_LENGTH[1]);
      const p = cor.beside(k, side, range(rng, LOG_REACH[0], LOG_REACH[1]) + L / 2, 0);
      if (g.boundaryGap(p.x, p.z) < L / 2 + 2 || kept(p.x, p.z, L / 2)) continue;
      const t = range(rng, 0.7, 1.2);
      woods.logs.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(p.x, g.height(p.x, p.z) - L * 0.02, p.z), new THREE.Quaternion().setFromAxisAngle(UP, rng() * Math.PI * 2), new THREE.Vector3(L, L * t, L * t)), c: new THREE.Color().setScalar(range(rng, 0.8, 1.05)) });
    }
  }
}

/** Clumps of the canopy far overhead: a dark ceiling over trail and woods, gaps between them. */
function canopy(ctx: DressContext, scenery: ForestScenery, clearings: Clearings, uses: SpriteUses, rng: Rng, woods: Woods): void {
  for (const cor of ctx.corridors) {
    const r = cor.ribbon;
    const lay = (perKm: number, overTrail: boolean, place: (smp: (typeof r.samples)[number], k: number) => { x: number; y: number; z: number } | null, size: readonly [number, number], height: readonly [number, number]) => {
      const n = Math.round((scenery.canopy * perKm * r.length) / 1000);
      for (let i = 0; i < n; i++) {
        const k = Math.floor(rng() * r.samples.length);
        const smp = r.samples[k];
        // A clearing is open to the sky over the trail; the woods round it keep their canopy.
        if (cor.gap(k) || cor.tunnel(k) || (overTrail && cor.vi === 0 && clearings.at(smp.s))) continue;
        const p = place(smp, k);
        if (!p) continue;
        const w = range(rng, size[0], size[1]);
        woods.sprites.add(p.x, p.y + scenery.treeHeight * range(rng, height[0], height[1]), p.z, w, w * range(rng, 0.4, 0.7), uses.canopy, range(rng, 0.6, 1));
      }
    };
    lay(CLUMPS_PER_KM, true, (smp) => r.toWorld(smp.s, range(rng, -smp.edgeL - CLUMP_SIDE, smp.edgeR + CLUMP_SIDE), 0), CLUMP_SIZE, CLUMP_HEIGHT);
    lay(
      WOODS_CLUMPS_PER_KM,
      false,
      (smp, k) => {
        const side = rng() < 0.5 ? -1 : 1;
        const p = cor.beside(k, side, range(rng, CLUMP_SIDE, scenery.forestDepth), 0);
        return ctx.ground.boundaryGap(p.x, p.z) < CLUMP_SIDE * 0.5 ? null : { x: p.x, y: smp.pos.y, z: p.z };
      },
      WOODS_CLUMP_SIZE,
      WOODS_CLUMP_HEIGHT,
    );
  }
}

/** Glowing waymarker stones along the outside of the bends: the way reads at speed without paint. */
function waymarks(ctx: DressContext, woods: Woods): void {
  for (const cor of ctx.corridors) {
    const r = cor.ribbon;
    const every = Math.max(1, Math.round(WAYMARK_SPACING / r.step));
    for (let k = 0; k < r.samples.length; k += every) {
      const smp = r.samples[k];
      if (Math.abs(smp.curvature) < 1 / WAYMARK_RADIUS) continue;
      // The outside of the bend: away from the side it turns to.
      const side = smp.curvature > 0 ? -1 : 1;
      if (!walled(cor, k, side)) continue;
      const p = cor.beside(k, side, STONE_BACK, 0);
      if (ctx.ground.boundaryGap(p.x, p.z) < STONE_BACK * 0.5) continue;
      woods.stones.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, ctx.ground.height(p.x, p.z), p.z), new THREE.Quaternion().setFromAxisAngle(UP, k * 1.7), new THREE.Vector3(1, 1, 1)));
    }
  }
}
/** A waymarker stands this far past the boundary, among the colonnade's roots. */
const STONE_BACK = 0.6;

