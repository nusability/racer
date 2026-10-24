import type * as THREE from 'three';
import type { Corridor } from '../corridor.ts';
import type { Quality } from '../config.ts';
import type { Ground } from '../ground.ts';
import type { RoadStyle } from '../textures.ts';
import type { Masonry } from '../paint.ts';
import type { DebrisLook } from '../scheduled.ts';
import type { Scatter } from '../corridor.ts';
import type { FlatBuilder } from '../builder.ts';
import type { LandmarkKind } from '../../landmarks/types.ts';

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
  /** Where the corridor put boundary markers: pylons on run-off lips, lamps on wall tops. */
  posts: Pick<Scatter, 'pylons' | 'lights'>;
  /**
   * The course's merged static meshes, still open: lit vertex-coloured props and unlit glow.
   * Small static dressing added here costs no draw call of its own.
   */
  props: FlatBuilder;
  glow: FlatBuilder;
  /** Shared materials: lit vertex-coloured, unlit vertex-coloured, textured rock. */
  lit: THREE.Material;
  unlit: THREE.Material;
  rock: THREE.Material;
  /** The world's fog far edge: nothing past it shows, so nothing past it need be drawn. */
  fogFar: number;
  /** The landmarks beside the course, placed: dressing keeps out of them. */
  landmarks: LandmarkSpot[];
}

/** Where a landmark stands: its centre, its footprint's radius, and whether a hazard drives it. */
export interface LandmarkSpot {
  kind: LandmarkKind;
  x: number;
  z: number;
  radius: number;
  /** Bound to a course hazard: its moving parts reach over the course (radius covers them). */
  bound: boolean;
}

/**
 * How the course's pillar obstacles look: rock columns (features.ts draws them), or 'kit': the
 * kit draws every pillar itself, at its collision radius (a forest's trunks, the same trees as
 * its colonnade).
 */
export type PillarLook = { kind: 'rock' } | { kind: 'kit' };

export interface BiomeKit {
  ground: GroundStyle;
  road: RoadStyle;
  /**
   * Street lighting on the road: how much of its own texture it shows with no sun on it
   * (0 = none, lit by sun and sky alone).
   */
  roadLight: number;
  /** What walls, tunnels and rock dressing are made of. */
  masonry: Masonry;
  pillar: PillarLook;
  /** Near-white detail maps multiplied over vertex colours. */
  detail(seed: number, quality: Quality): { sand: THREE.CanvasTexture; rock: THREE.CanvasTexture };
  dress(ctx: DressContext): Dressing;
  /**
   * The kit draws the boundary markers itself, in its own style, at DressContext.posts (a
   * forest's waymarker stones and lanterns); otherwise the shared pylons and lamp posts stand there.
   */
  ownPosts: boolean;
  /**
   * Concrete grandstands crowd the outside of the tightest corners. A wild world (the forest,
   * whose folk gather in its villages and towns) has none: they would stand in the deep woods.
   */
  cornerStands: boolean;
  /** What a craft kicks up: over the road, over run-off sand, over water (sRGB hex). */
  spray: { road: number; runoff: number; water: number };
  /**
   * What hazards throw onto the road and blow across it: dropped rocks (`glow` > 0 makes them
   * molten), the dust of their impact and the streaks of a gust (sRGB hex).
   */
  debris: DebrisLook;
}
