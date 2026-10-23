import * as THREE from 'three';
import type { Track } from '../../core/track.ts';
import type { TrackScenery } from '../../data/tracks/scenery.ts';
import { LANDMARKS, type Landmark } from '../landmarks/index.ts';
import { LANDMARK_PAD, LANDMARK_VIEW, SEA_LEVEL, type Quality } from './config.ts';
import type { Ground } from './ground.ts';

// Set pieces beside the course (a spaceport, a fair, a battle): built by the landmark modules,
// placed here beyond the hard boundary, with the ground levelled under them.

export interface PlacedLandmark {
  landmark: Landmark;
  /** World centre and footprint radius after scaling, for culling. */
  centre: THREE.Vector3;
  radius: number;
  /** Allowed to reach over the boundary; skipped by the clearance check. */
  straddle: boolean;
}

/** Landmarks nearer the boundary than this sit flush with the road edge. */
const CLOSE = 60;
const FLUSH_DROP = 0.35;
/** Sea bed under a floating landmark, so hulls and island skirts always stand in open water. */
const AFLOAT_BED = 6;

/**
 * Instantiates and positions every landmark. Must run before the corridor and terrain are
 * built, because it levels the ground they read.
 */
export function placeLandmarks(track: Track, scenery: TrackScenery, ground: Ground, quality: Quality): PlacedLandmark[] {
  const placed: PlacedLandmark[] = [];
  scenery.landmarks.forEach((p, i) => {
    const ribbon = p.branch === undefined ? track : branchRibbon(track, p.branch);
    const factory = LANDMARKS[p.kind];
    const landmark = factory({ seed: track.def.seed * 131 + i * 17, palette: track.def.palette, quality });
    const scale = p.scale ?? 1;
    const radius = landmark.radius * scale;
    if (p.distance < 0 && !p.straddle) throw new Error(`landmark ${p.kind} on ${track.def.id}: negative distance needs straddle`);
    const s = ribbon.paramToS(p.at);
    const f = ribbon.frameAt(s);
    const rl = Math.hypot(f.right.x, f.right.z);
    const rx = f.right.x / rl;
    const rz = f.right.z / rl;
    const edge = p.side > 0 ? ribbon.maxXAt(s) : -ribbon.minXAt(s);
    const out = edge + p.distance + radius;
    const x = f.pos.x + rx * p.side * out;
    const z = f.pos.z + rz * p.side * out;
    // Close to the course, level the ground with the road edge so the landmark meets it flush.
    const foot = ribbon.toWorld(s, p.side * edge, 0);
    const y = p.afloat ? SEA_LEVEL : p.distance < CLOSE ? foot.y - FLUSH_DROP : ground.height(x, z);
    ground.addPad(x, z, radius * LANDMARK_PAD, p.afloat ? SEA_LEVEL - AFLOAT_BED : y);
    ground.addFootprint(x, z, radius);
    // Local -Z faces the course: toward it is -side along the right vector.
    const tx = -rx * p.side;
    const tz = -rz * p.side;
    const g = landmark.group;
    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(-tx, -tz) + (p.heading ?? 0);
    g.scale.setScalar(scale);
    g.name = `landmark:${p.kind}`;
    placed.push({ landmark, centre: new THREE.Vector3(x, y, z), radius, straddle: p.straddle === true });
  });
  return placed;
}

function branchRibbon(track: Track, id: string) {
  const b = track.branches.find((x) => x.def.id === id);
  if (!b) throw new Error(`Track ${track.def.id}: no branch "${id}" for a landmark`);
  return b.ribbon;
}

/** Warns (dev aid) about landmarks whose footprint reaches onto some part of the course. */
export function checkLandmarkClearance(placed: PlacedLandmark[], ground: Ground): void {
  for (const p of placed) {
    if (p.straddle) continue;
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
