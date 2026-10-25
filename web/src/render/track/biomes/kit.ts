import type * as THREE from 'three';
import type { Corridor } from '../corridor.ts';
import type { Quality } from '../config.ts';
import type { Ground } from '../ground.ts';
import type { RoadStyle } from '../textures.ts';
import type { Masonry } from '../paint.ts';
import type { DebrisLook } from '../scheduled.ts';

// A biome kit: everything about a world's look that is not the course itself. The corridor,
// hazards, junctions, pickups and landmarks are shared; the kit supplies the open ground, its
// colours and detail textures, the road's surface and everything dressing the horizon.

export interface GroundStyle {
  /** Height of the open world's floor, given the lowest road sample. */
  base(minRoadY: number): number;
  /** Open-world height ignoring the course; `ripple` (0..1) fades small detail far away. */
  natural(g: Ground, x: number, z: number, ripple: number): number;
  /** Ground colour at a point of height y and slope (rise per metre). */
  color(g: Ground, x: number, z: number, y: number, slope: number, out: THREE.Color): THREE.Color;
}

/** Scene objects a kit adds, with their per-frame animation. */
export interface Dressing {
  objects: THREE.Object3D[];
  update(time: number, camera: THREE.Vector3): void;
  dispose(): void;
}

export interface DressContext {
  /** The main loop's corridor first, then the shortcuts'. */
  corridors: Corridor[];
  ground: Ground;
  quality: Quality;
  seed: number;
  /** Floating markers the corridor placed on lagoon boundaries. */
  buoys: { x: number; y: number; z: number }[];
  /** Shared materials: lit vertex-coloured, textured rock. */
  lit: THREE.Material;
  rock: THREE.Material;
}

export interface BiomeKit {
  ground: GroundStyle;
  /**
   * Whether there is open ground under the course. Without it (space) no terrain is drawn and
   * every road outside a tunnel hangs in the void on a deck: rails where it is walled, a lit
   * open edge where it drops, a finished underside.
   */
  terrain: boolean;
  road: RoadStyle;
  /**
   * Street lighting on the road: how much of its own texture it shows with no sun on it
   * (0 = none, lit by sun and sky alone).
   */
  roadLight: number;
  /** What walls, tunnels and rock dressing are made of. */
  masonry: Masonry;
  /** Near-white detail maps multiplied over vertex colours. */
  detail(seed: number, quality: Quality): { sand: THREE.CanvasTexture; rock: THREE.CanvasTexture };
  dress(ctx: DressContext): Dressing;
  /** What a craft kicks up: over the road, over run-off sand, over water (sRGB hex). */
  spray: { road: number; runoff: number; water: number };
  /**
   * What hazards throw onto the road and blow across it: dropped rocks (`glow` > 0 makes them
   * molten), the dust of their impact and the streaks of a gust (sRGB hex).
   */
  debris: DebrisLook;
}
