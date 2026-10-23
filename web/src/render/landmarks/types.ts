// Contract for landmark set pieces: big, unique, animated scenery placed beside a track
// (a spaceport, a fair, a battle). Presentation only; the simulation never sees them.

import type * as THREE from 'three';
import type { TrackPalette } from '../../core/types.ts';

export type LandmarkKind =
  // Set A: machines and spectacle
  | 'spaceport'
  | 'invasion'
  | 'wreck'
  | 'skyfleet'
  | 'mine'
  | 'stormwall'
  | 'sandbeast'
  // Set B: people and places
  | 'bazaar'
  | 'fair'
  | 'grandstand'
  | 'oasisTown'
  | 'cliffVillage'
  | 'colossus'
  | 'windfarm'
  | 'balloons'
  // Set C: the coast
  | 'lighthouse'
  | 'pier'
  | 'cruiseliner'
  | 'regatta'
  | 'resort'
  | 'harbor'
  | 'volcano'
  | 'whales'
  | 'beachParty'
  | 'airshow';

export interface LandmarkOptions {
  /** Seeds every layout choice, so a placement looks the same on every visit. */
  seed: number;
  palette: TrackPalette;
  quality: 'low' | 'high';
}

export interface Landmark {
  /**
   * Built around its own origin on flat ground (y = 0 is the ground), facing −Z toward the
   * track. The track scene positions, rotates and scales it.
   */
  group: THREE.Group;
  /** Horizontal radius it occupies on the ground, metres (for spacing and culling). */
  radius: number;
  /** Animate. Called every frame while the landmark is within view distance. */
  update(time: number, dt: number): void;
  dispose(): void;
}

export type LandmarkFactory = (opts: LandmarkOptions) => Landmark;
