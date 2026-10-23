import * as THREE from 'three';
import { CHASM_DEPTH } from '../../data/tuning.ts';
import type { GroundStyle } from './biomes/kit.ts';
import {
  CHASM_FLOOR_EXTRA,
  FIELD_CELL,
  FIELD_REACH,
  GROUND_BLEND_MIN,
  GROUND_BLEND_PER_M,
  LAGOON_DEPTH,
  SEA_LEVEL,
  TERRAIN_SINK,
} from './config.ts';
import { smoothstep, valueNoise, type Noise2 } from './noise.ts';
import { sideIndex, type RibbonView } from './shape.ts';

/** Flat sand beside the corridor before the ground starts easing to the dunes. */
const SHOULDER_FLAT = 5;
/** The shoulder sits just under the road edge so nothing floats. */
const SHOULDER_DROP = 0.35;
/** Small dunes fade out between these distances from the course, metres. */
const DUNE_FADE_START = 260;
const DUNE_FADE_LENGTH = 260;
/** Past an open drop the ground lies this far below the road: a fall, not a step. */
export const DROP_FALL = 70;
/** Stamp every n-th sample into the nearest-sample field (refined exactly per query). */
const FIELD_STRIDE = 3;
/** A levelled landmark pad eases back into the dunes over this distance. */
const PAD_FADE = 60;

export interface Nearest {
  /** Index into the ribbon views. */
  v: number;
  k: number;
  /** Signed horizontal lateral offset from that ribbon's centreline (+ = right of travel). */
  d: number;
}

interface Pad {
  x: number;
  z: number;
  r: number;
  y: number;
}

/**
 * The desert floor: open dunes far away, easing to the road's level near every ribbon and
 * tucking under the corridor geometry so it never shows through road, run-off or walls.
 */
export class Ground {
  readonly base: number;
  /** Seeded noise and a prevailing wind direction, for the biome's ground shapes. */
  readonly noise: Noise2;
  readonly windDir: { x: number; z: number };
  /** Field cell → packed (view << 20 | k) of the nearest stamped sample, or -1. */
  private readonly field: Int32Array;
  private readonly fx0: number;
  private readonly fz0: number;
  private readonly fw: number;
  private readonly fh: number;
  private readonly pads: Pad[] = [];
  /** Landmark footprints: the corridor hides its boundary dressing inside them. */
  private readonly footprints: Pad[] = [];

  constructor(
    readonly views: RibbonView[],
    readonly style: GroundStyle,
    seed: number,
  ) {
    let minY = Infinity;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const v of views) {
      for (const p of v.ribbon.samples) {
        minY = Math.min(minY, p.pos.y);
        minX = Math.min(minX, p.pos.x);
        maxX = Math.max(maxX, p.pos.x);
        minZ = Math.min(minZ, p.pos.z);
        maxZ = Math.max(maxZ, p.pos.z);
      }
    }
    this.base = style.base(minY);
    this.noise = valueNoise(seed * 7 + 3);
    const a = seed * 0.7;
    this.windDir = { x: Math.cos(a), z: Math.sin(a) };

    // Nearest-sample field: each coarse cell remembers the closest stamped sample.
    this.fx0 = minX - FIELD_REACH;
    this.fz0 = minZ - FIELD_REACH;
    this.fw = Math.ceil((maxX - minX + 2 * FIELD_REACH) / FIELD_CELL) + 1;
    this.fh = Math.ceil((maxZ - minZ + 2 * FIELD_REACH) / FIELD_CELL) + 1;
    this.field = new Int32Array(this.fw * this.fh).fill(-1);
    const dist = new Float32Array(this.fw * this.fh).fill(Infinity);
    const r = Math.ceil(FIELD_REACH / FIELD_CELL);
    views.forEach((view, vi) => {
      const sh = view.shape;
      for (let k = 0; k < sh.gx.length; k += FIELD_STRIDE) {
        // A bridge deck is in the air: the ground under it follows the road below.
        if (sh.bridge[k]) continue;
        const p = { x: sh.gx[k], z: sh.gz[k] };
        const cx = Math.round((p.x - this.fx0) / FIELD_CELL);
        const cz = Math.round((p.z - this.fz0) / FIELD_CELL);
        for (let j = Math.max(0, cz - r); j <= Math.min(this.fh - 1, cz + r); j++) {
          for (let i = Math.max(0, cx - r); i <= Math.min(this.fw - 1, cx + r); i++) {
            const dx = this.fx0 + i * FIELD_CELL - p.x;
            const dz = this.fz0 + j * FIELD_CELL - p.z;
            const d2 = dx * dx + dz * dz;
            const c = j * this.fw + i;
            if (d2 < dist[c]) {
              dist[c] = d2;
              this.field[c] = (vi << 20) | k;
            }
          }
        }
      }
    });
  }

  /** Level the ground for a landmark: a disc at height y blending out over PAD_FADE. */
  addPad(x: number, z: number, r: number, y: number): void {
    this.pads.push({ x, z, r, y });
  }

  /** Mark a landmark footprint: no boundary lip, wall or terrain sink inside it. */
  addFootprint(x: number, z: number, r: number): void {
    this.footprints.push({ x, z, r, y: 0 });
  }

  inFootprint(x: number, z: number): boolean {
    return this.footprints.some((f) => Math.hypot(x - f.x, z - f.z) < f.r);
  }

  /** The closest centreline sample of any ribbon (horizontally), or null when far away. */
  nearest(x: number, z: number): Nearest | null {
    const i = Math.round((x - this.fx0) / FIELD_CELL);
    const j = Math.round((z - this.fz0) / FIELD_CELL);
    if (i < 0 || j < 0 || i >= this.fw || j >= this.fh) return null;
    const packed = this.field[j * this.fw + i];
    if (packed < 0) return null;
    const v = packed >> 20;
    const view = this.views[v];
    const { gx, gz } = view.shape;
    const n = gx.length;
    const closed = view.ribbon.closed;
    const d2 = (k: number) => (gx[k] - x) ** 2 + (gz[k] - z) ** 2;
    // Walk downhill along the ribbon from the stamped sample to the exact local minimum.
    let k = packed & 0xfffff;
    let best = d2(k);
    for (const dir of [1, -1]) {
      for (;;) {
        const q = closed ? (k + dir + n) % n : k + dir;
        if (q < 0 || q >= n || view.shape.bridge[q]) break;
        const dq = d2(q);
        if (dq >= best) break;
        best = dq;
        k = q;
      }
    }
    const d = (x - gx[k]) * view.shape.rx[k] + (z - gz[k]) * view.shape.rz[k];
    return { v, k, d };
  }

  /**
   * Open-world height, ignoring the course. Small detail only ripples near the course: far out
   * the coarse terrain mesh couldn't sample it, and fog hides it anyway.
   */
  natural(x: number, z: number, near: Nearest | null = this.nearest(x, z)): number {
    const ripple = near ? 1 - smoothstep((Math.abs(near.d) - DUNE_FADE_START) / DUNE_FADE_LENGTH) : 0;
    return this.style.natural(this, x, z, ripple);
  }

  /** Height of the road surface at lateral x of sample k on view v (the road is banked). */
  roadY(v: number, k: number, x: number): number {
    const smp = this.views[v].ribbon.samples[k];
    return smp.pos.y + smp.right.y * x;
  }

  /**
   * The visible ground surface: road level by the corridor, easing out to the dunes. Nothing
   * rises inside the drivable width (road and run-off up to the hard boundary): the ease only
   * starts past the boundary, after landmark pads, so no dune, sand bar or pad edge ever
   * stands where a craft can fly.
   */
  height(x: number, z: number, near: Nearest | null = this.nearest(x, z)): number {
    let h = this.natural(x, z, near);
    for (const p of this.pads) {
      const t = smoothstep((Math.hypot(x - p.x, z - p.z) - p.r) / PAD_FADE);
      h = p.y + (h - p.y) * t;
    }
    if (near) {
      const smp = this.views[near.v].ribbon.samples[near.k];
      const half = smp.width / 2;
      const out = Math.max(0, Math.abs(near.d) - half);
      const sh = this.views[near.v].shape;
      const side = sideIndex(near.d);
      const falls = sh.drop[side][near.k] || (sh.magnet[near.k] && !sh.loop[near.k]);
      // Beside a lagoon the ground drops to a shallow sea bed: the run-off is water. Past a
      // drop, and under a corkscrew, it falls far away; under a loop it is the loop's baseline.
      const roadSide = sh.water[near.k]
        ? SEA_LEVEL - LAGOON_DEPTH
        : falls
          ? sh.gy[near.k] - DROP_FALL
          : sh.loop[near.k]
            ? sh.gy[near.k] - SHOULDER_DROP
            : this.roadY(near.v, near.k, Math.sign(near.d) * half) - SHOULDER_DROP;
      const flat = falls ? SHOULDER_FLAT : Math.max(SHOULDER_FLAT, sh.run[side][near.k] + SHOULDER_FLAT);
      const blend = Math.max(GROUND_BLEND_MIN, Math.abs(h - roadSide) * GROUND_BLEND_PER_M);
      h = roadSide + (h - roadSide) * smoothstep((out - flat) / blend);
    }
    return h;
  }

  /** Terrain mesh height: as height(), but sunk wherever corridor geometry covers it. */
  meshHeight(x: number, z: number): number {
    const near = this.nearest(x, z);
    const h = this.height(x, z, near);
    if (!near) return h;
    const view = this.views[near.v];
    const smp = view.ribbon.samples[near.k];
    const covered = Math.abs(near.d) < view.shape.outer[sideIndex(near.d)][near.k] - 2;
    if (!covered) return h;
    if (smp.gap) return smp.pos.y - CHASM_DEPTH - CHASM_FLOOR_EXTRA - 4;
    // Inside a landmark's footprint the boundary dressing is hidden, so the ground shows.
    const edge = near.d > 0 ? smp.edgeR : smp.edgeL;
    if (Math.abs(near.d) > edge + 1 && this.inFootprint(x, z)) return h;
    // Lagoon run-off is open water over a shallow bed: nothing covers it, so don't sink it.
    if (view.shape.water[near.k] && Math.abs(near.d) > smp.width / 2 + 1) return h;
    const tilt = view.shape.loop[near.k] ? 0 : Math.abs(smp.right.y) * smp.width * 0.5;
    return Math.min(h, view.shape.gy[near.k] - tilt) - TERRAIN_SINK;
  }

  /** True when (x, z) is at least `margin` past the corridor geometry of every ribbon. */
  clearOfCourse(x: number, z: number, margin: number): boolean {
    const near = this.nearest(x, z);
    if (!near) return true;
    return Math.abs(near.d) > this.views[near.v].shape.outer[sideIndex(near.d)][near.k] + margin;
  }

  /** Ground colour from the biome. */
  color(x: number, z: number, y: number, slope: number, out: THREE.Color): THREE.Color {
    return this.style.color(this, x, z, y, slope, out);
  }
}
