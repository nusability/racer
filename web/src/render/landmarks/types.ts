// Contract for landmark set pieces: big, unique, animated scenery placed beside a track
// (a spaceport, a fair, a battle). Presentation only; the simulation never sees them.

import type * as THREE from 'three';
import type { TrackPalette } from '../../core/types.ts';
import type { CourseHazard } from '../../core/hazards.ts';

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
  | 'airshow'
  // Set D: the ice
  | 'icebreaker'
  | 'avalancheSlope'
  | 'glacierWall'
  | 'mammothHerd'
  | 'iceStation'
  | 'skiJump'
  | 'icePalace'
  | 'frozenFalls'
  | 'auroraSky'
  | 'snowcatConvoy'
  // Set E: the city
  | 'maglev'
  | 'crane'
  | 'demolition'
  | 'cargoAirship'
  | 'skyscrapers'
  | 'neonBillboards'
  | 'stadium'
  | 'hologramDragon'
  | 'suspensionBridge'
  | 'skyTram'
  // Set F: space
  | 'dockingArm'
  | 'cargoHoist'
  | 'blastDoor'
  | 'ventStack'
  | 'driftRock';

/**
 * A landmark that IS part of the course (the sand beast that crosses the road, the digger
 * dropping rocks on it, the ship whose downdraft pushes racers): it animates from the same
 * schedule the simulation collides with. Read the state with the functions in core/hazards.ts.
 */
export interface HazardBinding {
  hazard: CourseHazard;
  /** Track space (main-loop s, x, height y above the road) → this landmark's local space. */
  toLocal(s: number, x: number, y: number, out: THREE.Vector3): THREE.Vector3;
  /**
   * Height of the canyon walls' rim over the road edge at s, metres (0 where the road is open),
   * for a landmark that stands beside the road. Absent on a viewer's virtual road, which has
   * no walls.
   */
  wallAt?(s: number): number;
}

export interface LandmarkOptions {
  /** Seeds every layout choice, so a placement looks the same on every visit. */
  seed: number;
  palette: TrackPalette;
  quality: 'low' | 'high';
  /** Set when the placement binds this landmark to a course hazard. */
  hazard?: HazardBinding;
}

export interface Landmark {
  /**
   * Built around its own origin on flat ground (y = 0 is the ground), facing −Z toward the
   * track. The track scene positions, rotates and scales it.
   */
  group: THREE.Group;
  /** Horizontal radius it occupies on the ground, metres (for spacing and culling). */
  radius: number;
  /**
   * Animate. Called every frame while the landmark is within view distance. `time` is race
   * time (the hazard schedules' clock), so a bound landmark stays in step with collisions.
   */
  update(time: number, dt: number): void;
  dispose(): void;
}

export type LandmarkFactory = (opts: LandmarkOptions) => Landmark;
