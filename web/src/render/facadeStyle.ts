// What a facade instance looks like, packed into the four floats the facade shader reads per
// instance (render/facade.ts): its surface, how grimy it is, how many of its windows are lit,
// and its neon (colour, a steady, failing or dead tube, where it runs, and whether the piece
// stands on the street or up in the air).

/** The surfaces the shader draws; the numbers are the shader's own. */
export const SURFACE = {
  /** A grid of office windows, lit in runs along a floor (one tenant). */
  office: 0,
  /** Mirrored curtain glass: tall narrow panes, few lit floors, the sky's glow in the glass. */
  curtain: 1,
  /** Continuous ribbon windows between floor bands. */
  ribbon: 2,
  /** Concrete panel flats: small windows, some boarded or broken. */
  slab: 3,
  /** Flats with a balcony lip and railing on every storey. */
  balcony: 4,
  /** A capsule hotel: a dense grid of small pods, most lit, each its own colour. */
  capsule: 5,
  /** Corrugated cladding, panel seams, a few high windows and hazard stripes at the base. */
  industrial: 6,
  /** An unfinished shell: floor slabs and columns round a dark interior, scaffold mesh above. */
  shell: 7,
  /** A sign panel of abstract glyphs (no lettering) in neon. */
  sign: 8,
  /** A giant animated holo-ad face. */
  holo: 9,
  /** Bare panels: plant, pipes, masts, pads, spires. */
  plain: 10,
  /** A sky garden: planting with lamps among it. */
  garden: 11,
  /** A landing pad: lit edge and a ring marked on its deck. */
  pad: 12,
} as const;
export type Surface = (typeof SURFACE)[keyof typeof SURFACE];

/** The neon a piece may wear: one of the city's three colours, or the red of an aviation beacon. */
export type NeonHue = 0 | 1 | 2 | 3;
export const BEACON_HUE: NeonHue = 3;
/** A tube that burns steadily, one failing (it flickers, a beacon blinks), or one long dead. */
export type NeonMode = 'steady' | 'flicker' | 'dead';
/** Where the neon runs: nowhere, a band under the roofline, up the corners, or both. */
export type NeonTrim = 'none' | 'crown' | 'edges' | 'both';

export interface FacadeStyle {
  surface: Surface;
  /** 0 clean … 1 decayed: streaks, stains, boarded windows, dark shopfronts. */
  grime: number;
  /** Share of the usual lit windows (1 = the hour's usual; 0 = dark). */
  light: number;
  hue: NeonHue;
  mode: NeonMode;
  trim: NeonTrim;
  /** Stands on another piece rather than the street: no shopfronts and no street shade. */
  elevated: boolean;
}

const MODES: Record<NeonMode, number> = { steady: 0, flicker: 1, dead: 2 };
const TRIMS: Record<NeonTrim, number> = { none: 0, crown: 1, edges: 2, both: 3 };

/**
 * The instance's four floats: surface, grime, light, and a code (hue + 4·mode + 16·trim +
 * 64·elevated) small enough that a float holds it exactly. A negative code is the plain
 * office look of an unstyled facade (render/facade.ts).
 */
export function packStyle(s: FacadeStyle, out: Float32Array, i: number): void {
  if (s.grime < 0 || s.grime > 1) throw new Error(`facade grime ${s.grime} is outside 0..1`);
  if (s.light < 0) throw new Error(`facade light ${s.light} is negative`);
  out[i * 4] = s.surface;
  out[i * 4 + 1] = s.grime;
  out[i * 4 + 2] = s.light;
  out[i * 4 + 3] = s.hue + 4 * MODES[s.mode] + 16 * TRIMS[s.trim] + 64 * (s.elevated ? 1 : 0);
}
