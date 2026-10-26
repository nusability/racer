import * as THREE from 'three';
import { range, type Rng } from '../../../core/rng.ts';
import { BEACON_HUE, SURFACE, type FacadeStyle, type NeonHue, type NeonMode, type NeonTrim, type Surface } from '../../facadeStyle.ts';
import type { CityParts, PartShape } from './cityParts.ts';

// One building going up on its plot: the archetypes (cityArchetypes.ts) lay out their pieces in
// the plot's own frame (x across it, z along it, y up in world metres) and this turns them into
// city parts, keeps every piece inside the plot (the site cleared the plot, not the air round
// it) and under its roof cap, and styles them with the district's grime and neon.

/** Where a building goes and what it may be. */
export interface Plot {
  /** Centre and yaw of the plot; every piece stays inside its w × d. */
  x: number;
  z: number;
  yaw: number;
  w: number;
  d: number;
  /** World y the building's foot reaches down to (under the lowest ground round it). */
  base: number;
  /** World y of the highest ground under it: heights count from here. */
  ground: number;
  /** World y no piece may rise above (the site's roof cap, or Infinity). */
  top: number;
  /** Height above ground asked of the building before its archetype's own spread. */
  rise: number;
  /** The plot's side that looks toward the course (+x, −x, +z, −z): where its signs and ads face. */
  face: Face;
  grime: number;
  neon: number;
  /** Build the small kit too: AC units, cables, rooftop clutter, small signs. */
  detail: boolean;
  rng: Rng;
  parts: CityParts;
}

export type Face = 0 | 1 | 2 | 3;
/** Outward normal of each face in the plot's frame. */
const FACE_N: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** A building lower than this over its ground is not worth building (the lot stays an open square). */
export const MIN_RISE = 8;
/** Per building, its grime strays this far either way from its district's. */
const GRIME_SPREAD = 0.18;
/** Per building, the share of its lit windows strays over this range of the hour's usual. */
const LIGHT_SPREAD: readonly [number, number] = [0.6, 1.35];
/** At full grime, this share of tubes is failing and this share dead. */
const FLICKER_AT_GRIME = 0.45;
const DEAD_AT_GRIME = 0.35;
/** Blade signs: how far they stand out from the wall at most (m), their thickness, and their height range (m). */
const BLADE_OUT = 3;
const BLADE_THICK = 0.6;
const BLADE_H: readonly [number, number] = [6, 16];
/** Flat signs and ad panels stand this far proud of the wall, and are this thick. */
const PANEL_OUT = 0.35;
const PANEL_THICK = 0.5;
/** A mast: its foot's width (m) per metre of height, but never thinner than this. */
const MAST_TAPER = 0.035;
const MAST_MIN = 0.9;

export class Builder {
  /** This building's own grime, light and neon colour. */
  readonly grime: number;
  readonly light: number;
  readonly hue: NeonHue;
  private readonly c: number;
  private readonly s: number;

  constructor(readonly p: Plot) {
    this.grime = clamp01(p.grime + range(p.rng, -GRIME_SPREAD, GRIME_SPREAD));
    // A run-down block is no darker for it: crowded flats burn their lights; grime dirties the walls.
    this.light = range(p.rng, LIGHT_SPREAD[0], LIGHT_SPREAD[1]);
    this.hue = Math.floor(p.rng() * 3) as NeonHue;
    this.c = Math.cos(p.yaw);
    this.s = Math.sin(p.yaw);
  }

  get rng(): Rng {
    return this.p.rng;
  }

  /** Height to build to over the ground: the plot's rise spread by this archetype, under the cap; 0 if too low to build. */
  height(spread: readonly [number, number]): number {
    const h = Math.min(this.p.rise * range(this.p.rng, spread[0], spread[1]), this.p.top - this.p.ground);
    return h >= MIN_RISE ? h : 0;
  }

  /** World y of a height over the ground. */
  y(h: number): number {
    return this.p.ground + h;
  }

  /** Room left above world y under the cap. */
  room(y: number): number {
    return this.p.top - y;
  }

  /**
   * A shape w × h × d standing at plot-frame (x, y, z) (y in world metres), turned by yaw in the
   * plot. Throws if it leaves the plot or rises through the cap: the site only cleared the plot.
   */
  put(shape: PartShape, x: number, y: number, z: number, w: number, h: number, d: number, tint: THREE.Color, style: FacadeStyle, yaw = 0): void {
    const reach = yaw === 0 ? [w / 2, d / 2] : [Math.hypot(w, d) / 2, Math.hypot(w, d) / 2];
    if (Math.abs(x) + reach[0] > this.p.w / 2 + EPS || Math.abs(z) + reach[1] > this.p.d / 2 + EPS) {
      throw new Error(`city part ${shape} at (${x.toFixed(1)}, ${z.toFixed(1)}) size ${w.toFixed(1)} × ${d.toFixed(1)} leaves its ${this.p.w.toFixed(1)} × ${this.p.d.toFixed(1)} plot`);
    }
    // A dome's unit shape is half as tall as its scale (a half sphere of diameter 1).
    const rise = shape === 'dome' ? h / 2 : h;
    if (y + rise > this.p.top + EPS) throw new Error(`city part ${shape} rises to ${(y + rise).toFixed(1)}, over the roof cap ${this.p.top.toFixed(1)}`);
    const [wx, wz] = this.world(x, z);
    this.p.parts.add(shape, wx, y, wz, w, h, d, this.p.yaw + yaw, tint, style);
  }

  /** A box strung between plot-frame points (y in world metres), both inside the plot and under the cap. */
  beam(a: readonly [number, number, number], b: readonly [number, number, number], w: number, d: number, tint: THREE.Color, style: FacadeStyle): void {
    for (const q of [a, b]) {
      if (Math.abs(q[0]) > this.p.w / 2 + EPS || Math.abs(q[2]) > this.p.d / 2 + EPS || q[1] > this.p.top + EPS) throw new Error('city beam leaves its plot');
    }
    const [ax, az] = this.world(a[0], a[2]);
    const [bx, bz] = this.world(b[0], b[2]);
    this.p.parts.beam(new THREE.Vector3(ax, a[1], az), new THREE.Vector3(bx, b[1], bz), w, d, tint, style);
  }

  /**
   * A facade style for this building. Neon trim is the building's own when asked for ('auto'
   * draws it from the district's neon), and a tube fails or dies more often the grimier it is.
   */
  look(surface: Surface, o: { trim?: NeonTrim | 'auto'; hue?: NeonHue; elevated?: boolean; light?: number; grime?: number; mode?: NeonMode } = {}): FacadeStyle {
    const trim = o.trim === 'auto' ? this.autoTrim() : (o.trim ?? 'none');
    return {
      surface,
      grime: clamp01(o.grime ?? this.grime),
      light: this.light * (o.light ?? 1),
      hue: o.hue ?? this.hue,
      mode: o.mode ?? this.tube(),
      trim,
      elevated: o.elevated ?? false,
    };
  }

  /** A neon trim drawn from the district's neon: none, a crown band, corner strips or both. */
  autoTrim(): NeonTrim {
    const r = this.p.rng();
    if (r > this.p.neon) return 'none';
    const k = r / Math.max(this.p.neon, EPS);
    return k < 0.5 ? 'crown' : k < 0.8 ? 'edges' : 'both';
  }

  private tube(): NeonMode {
    const r = this.p.rng();
    return r < this.grime * DEAD_AT_GRIME ? 'dead' : r < this.grime * (DEAD_AT_GRIME + FLICKER_AT_GRIME) ? 'flicker' : 'steady';
  }

  /** A mast standing at plot-frame (x, y, z), up to h tall (less under the cap), a blinking beacon at its tip. */
  mast(x: number, y: number, z: number, h: number, tint: THREE.Color): void {
    const tall = Math.min(h, this.room(y));
    if (tall < MIN_RISE / 2) return;
    const w = Math.max(MAST_MIN, tall * MAST_TAPER);
    this.put('spire', x, y, z, w, tall, w, tint, this.look(SURFACE.plain, { trim: 'crown', hue: BEACON_HUE, mode: 'flicker', elevated: true }));
  }

  /**
   * A blade sign standing out square from face `f` of a body hw × hd (half sizes) centred at
   * (cx, cz), `at` (−1..1) along the face: as far out as the plot allows, up to BLADE_OUT.
   */
  blade(f: Face, hw: number, hd: number, at: number, y: number, mode?: NeonMode, cx = 0, cz = 0): void {
    const [nx, nz] = FACE_N[f];
    const margin = nx !== 0 ? this.p.w / 2 - (hw + nx * cx) : this.p.d / 2 - (hd + nz * cz);
    const out = Math.min(BLADE_OUT, margin);
    if (out < 1) return;
    const h = Math.min(range(this.p.rng, BLADE_H[0], BLADE_H[1]), this.room(y));
    if (h < BLADE_H[0] / 2) return;
    const style = this.look(SURFACE.sign, { hue: Math.floor(this.p.rng() * 3) as NeonHue, elevated: true, ...(mode ? { mode } : {}) });
    const along = at * (nx !== 0 ? hd : hw) * 0.8;
    if (nx !== 0) this.put('box', cx + nx * (hw + out / 2), y, cz + along, out, h, BLADE_THICK, DARK, style);
    else this.put('box', cx + along, y, cz + nz * (hd + out / 2), BLADE_THICK, h, out, DARK, style);
  }

  /** A flat panel (a sign or a holo-ad) w wide and h tall on face `f` of a body hw × hd, centred `at` (−1..1) along it. */
  panel(f: Face, hw: number, hd: number, at: number, y: number, w: number, h: number, style: FacadeStyle): void {
    const [nx, nz] = FACE_N[f];
    const tall = Math.min(h, this.room(y));
    if (tall <= 0) return;
    const off = PANEL_OUT + PANEL_THICK / 2;
    if (nx !== 0) this.put('box', nx * (hw + off), y, at * (hd - w / 2), PANEL_THICK, tall, w, DARK, style);
    else this.put('box', at * (hw - w / 2), y, nz * (hd + off), w, tall, PANEL_THICK, DARK, style);
  }

  private world(x: number, z: number): [number, number] {
    return [this.p.x + x * this.c + z * this.s, this.p.z - x * this.s + z * this.c];
  }
}

/** Slack for rounding in the plot checks, metres. */
const EPS = 1e-3;
/** Signs are dark boxes the shader lights. */
const DARK = new THREE.Color(0x202028);

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** One of a palette's tints (sRGB hex), a little lighter or darker. */
export function tint(rng: Rng, palette: readonly number[]): THREE.Color {
  return new THREE.Color(palette[Math.floor(rng() * palette.length)]).multiplyScalar(0.85 + rng() * 0.3);
}

/** The face opposite `f`. */
export function opposite(f: Face): Face {
  return (f ^ 1) as Face;
}

/** Whether a face's normal runs along the plot's x. */
export function onX(f: Face): boolean {
  return f < 2;
}
