import * as THREE from 'three';
import type { Track } from '../../core/track.ts';
import type { TrackScenery } from '../../data/tracks/scenery.ts';
import { LANDMARKS, type Landmark } from '../landmarks/index.ts';
import type { HazardBinding, LandmarkKind } from '../landmarks/types.ts';
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
  /**
   * Where its hazard crosses the course, for a bound landmark: its moving parts reach far
   * past its footprint, so it stays on while that spot is in view.
   */
  hazardAt: THREE.Vector3 | null;
}

/** Landmarks nearer the boundary than this sit flush with the road edge. */
const CLOSE = 60;
const FLUSH_DROP = 0.35;
/** Sea bed under a floating landmark, so hulls and island skirts always stand in open water. */
const AFLOAT_BED = 6;
/** Landmarks drawn in the sky round the camera: no pad, no footprint, never culled. */
const SKY = new Set<LandmarkKind>(['auroraSky']);

/**
 * Instantiates and positions every landmark. Must run before the corridor and terrain are
 * built, because it levels the ground they read.
 */
export function placeLandmarks(track: Track, scenery: TrackScenery, ground: Ground, quality: Quality): PlacedLandmark[] {
  const placed: PlacedLandmark[] = [];
  scenery.landmarks.forEach((p, i) => {
    const ribbon = p.branch === undefined ? track : branchRibbon(track, p.branch);
    const factory = LANDMARKS[p.kind];
    // A bound landmark maps track space into its own local space; the inverse placement is
    // filled in once it has been placed below.
    const toLocal = new THREE.Matrix4();
    const hazard = p.hazard === undefined ? undefined : bindHazard(track, p.hazard, toLocal);
    const landmark = factory({ seed: track.def.seed * 131 + i * 17, palette: track.def.palette, quality, hazard });
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
    // A sky piece (the aurora) hangs round the viewer: it stands on no ground.
    // A bound landmark's radius reaches its moving parts out over the course: only its base
    // is levelled, and it claims no footprint (that would bare the ground under the road).
    if (!SKY.has(p.kind)) {
      ground.addPad(x, z, radius * LANDMARK_PAD, p.afloat ? SEA_LEVEL - AFLOAT_BED : y);
      ground.addFootprint(x, z, radius);
    }
    // Local -Z faces the course: toward it is -side along the right vector.
    const tx = -rx * p.side;
    const tz = -rz * p.side;
    const g = landmark.group;
    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(-tx, -tz) + (p.heading ?? 0);
    g.scale.setScalar(scale);
    g.name = `landmark:${p.kind}`;
    g.updateMatrixWorld(true);
    toLocal.copy(g.matrixWorld).invert();
    const spot = hazard ? track.toWorld((hazard.hazard.s0 + hazard.hazard.s1) / 2, 0, 0) : null;
    placed.push({ landmark, centre: new THREE.Vector3(x, y, z), radius, straddle: p.straddle === true || SKY.has(p.kind), hazardAt: spot ? new THREE.Vector3(spot.x, spot.y, spot.z) : null });
  });
  return placed;
}

function bindHazard(track: Track, id: string, toLocal: THREE.Matrix4): HazardBinding {
  const hazard = track.hazards.find((h) => h.def.id === id);
  if (!hazard) throw new Error(`Track ${track.def.id}: no hazard "${id}" on the main loop to bind a landmark to`);
  return {
    hazard,
    toLocal(s, x, y, out) {
      const w = track.toWorld(s, x, y);
      return out.set(w.x, w.y, w.z).applyMatrix4(toLocal);
    },
  };
}

function branchRibbon(track: Track, id: string) {
  const b = track.branches.find((x) => x.def.id === id);
  if (!b) throw new Error(`Track ${track.def.id}: no branch "${id}" for a landmark`);
  return b.ribbon;
}

/** Warns (dev aid) about landmarks whose footprint reaches onto some part of the course. */
export function checkLandmarkClearance(placed: PlacedLandmark[], ground: Ground): void {
  for (const p of placed) {
    // A bound landmark reaches over the road on purpose (that is its job).
    if (p.straddle || p.hazardAt !== null) continue;
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
    const visible = p.radius > view || p.centre.distanceTo(cameraPos) - p.radius < view || (p.hazardAt !== null && p.hazardAt.distanceTo(cameraPos) < view);
    p.landmark.group.visible = visible;
    if (visible) p.landmark.update(time, dt);
  }
}
