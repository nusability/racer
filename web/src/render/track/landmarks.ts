import * as THREE from 'three';
import type { Track } from '../../core/track.ts';
import type { TrackScenery } from '../../data/tracks/scenery.ts';
import { LANDMARKS, type Landmark } from '../landmarks/index.ts';
import { LANDMARK_PAD, LANDMARK_VIEW, type Quality } from './config.ts';
import type { Ground } from './ground.ts';

// Set pieces beside the course (a spaceport, a fair, a battle): built by the landmark modules,
// placed here beyond the hard boundary, with the ground levelled under them.

export interface PlacedLandmark {
  landmark: Landmark;
  /** World centre and footprint radius after scaling, for culling. */
  centre: THREE.Vector3;
  radius: number;
}

/**
 * Instantiates and positions every landmark. Must run before the corridor and terrain are
 * built, because it levels the ground they read.
 */
export function placeLandmarks(track: Track, scenery: TrackScenery, ground: Ground, quality: Quality): PlacedLandmark[] {
  const placed: PlacedLandmark[] = [];
  scenery.landmarks.forEach((p, i) => {
    const factory = LANDMARKS[p.kind];
    const landmark = factory({ seed: track.def.seed * 131 + i * 17, palette: track.def.palette, quality });
    const scale = p.scale ?? 1;
    const radius = landmark.radius * scale;
    const s = track.paramToS(p.at);
    const f = track.frameAt(s);
    const rl = Math.hypot(f.right.x, f.right.z);
    const rx = f.right.x / rl;
    const rz = f.right.z / rl;
    const edge = p.side > 0 ? track.maxXAt(s) : -track.minXAt(s);
    const out = edge + p.distance + radius;
    const x = f.pos.x + rx * p.side * out;
    const z = f.pos.z + rz * p.side * out;
    const y = ground.height(x, z);
    ground.addPad(x, z, radius * LANDMARK_PAD, y);
    // Local -Z faces the track: toward the course is -side along the right vector.
    const tx = -rx * p.side;
    const tz = -rz * p.side;
    const g = landmark.group;
    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(-tx, -tz) + (p.heading ?? 0);
    g.scale.setScalar(scale);
    g.name = `landmark:${p.kind}`;
    placed.push({ landmark, centre: new THREE.Vector3(x, y, z), radius });
  });
  return placed;
}

/** Warns (dev aid) about landmarks whose footprint reaches onto some part of the course. */
export function checkLandmarkClearance(placed: PlacedLandmark[], ground: Ground): void {
  for (const p of placed) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const x = p.centre.x + Math.cos(a) * p.radius * 0.9;
      const z = p.centre.z + Math.sin(a) * p.radius * 0.9;
      if (!ground.clearOfCourse(x, z, -40)) {
        console.warn(`landmark ${p.landmark.group.name} overlaps the course near (${x.toFixed(0)}, ${z.toFixed(0)})`);
        break;
      }
    }
  }
}

/** Shows, hides and animates landmarks by distance from the camera. */
export function updateLandmarks(placed: PlacedLandmark[], quality: Quality, time: number, dt: number, cameraPos: THREE.Vector3): void {
  const view = LANDMARK_VIEW[quality];
  for (const p of placed) {
    // Horizon-sized pieces (a storm front kilometres wide) are always on; fog does the fading.
    const visible = p.radius > view || p.centre.distanceTo(cameraPos) - p.radius < view;
    p.landmark.group.visible = visible;
    if (visible) p.landmark.update(time, dt);
  }
}
