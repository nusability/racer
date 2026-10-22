// Places a racer model in the world from its track-space state, interpolated between two
// simulation steps so motion is smooth at any display rate.

import * as THREE from 'three';
import type { Track } from '../core/track.ts';
import { makeFrame } from '../core/track.ts';
import type { RacerState, Vec3 } from '../core/types.ts';
import { POSE_MAX_PITCH, POSE_VISUAL_HOVER } from './cameraTuning.ts';

export interface PoseSnapshot {
  s: number;
  x: number;
  y: number;
  yaw: number;
  roll: number;
  vy: number;
  speed: number;
}

export function snapshot(r: RacerState, out: PoseSnapshot): PoseSnapshot {
  out.s = r.s;
  out.x = r.x;
  out.y = r.y;
  out.yaw = r.yaw;
  out.roll = r.roll;
  out.vy = r.vy;
  out.speed = r.speed;
  return out;
}

export function emptySnapshot(): PoseSnapshot {
  return { s: 0, x: 0, y: 0, yaw: 0, roll: 0, vy: 0, speed: 0 };
}

/** Blend a → b by alpha, unwrapping s across the start line. */
export function lerpSnapshot(track: Track, a: PoseSnapshot, b: PoseSnapshot, alpha: number, out: PoseSnapshot) {
  out.s = track.wrap(a.s + track.delta(a.s, b.s) * alpha);
  out.x = a.x + (b.x - a.x) * alpha;
  out.y = a.y + (b.y - a.y) * alpha;
  out.yaw = a.yaw + (b.yaw - a.yaw) * alpha;
  out.roll = a.roll + (b.roll - a.roll) * alpha;
  out.vy = a.vy + (b.vy - a.vy) * alpha;
  out.speed = a.speed + (b.speed - a.speed) * alpha;
  return out;
}

const frame = makeFrame();
const p: Vec3 = { x: 0, y: 0, z: 0 };
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const t = new THREE.Vector3();
const rgt = new THREE.Vector3();
const u = new THREE.Vector3();
const basis = new THREE.Matrix4();
const rollQ = new THREE.Quaternion();
const zAxis = new THREE.Vector3(0, 0, 1);

/** Writes position + orientation into obj. Forward of the model is −Z. */
export function poseObject(track: Track, s: PoseSnapshot, obj: THREE.Object3D) {
  track.toWorld(s.s, s.x, s.y + POSE_VISUAL_HOVER, p, frame);
  obj.position.set(p.x, p.y, p.z);
  t.set(frame.tangent.x, frame.tangent.y, frame.tangent.z);
  rgt.set(frame.right.x, frame.right.y, frame.right.z);
  u.set(frame.up.x, frame.up.y, frame.up.z);

  // Heading relative to the track, then pitch from vertical motion relative to the road.
  const cy = Math.cos(s.yaw);
  const sy = Math.sin(s.yaw);
  fwd.copy(t).multiplyScalar(cy).addScaledVector(rgt, sy);
  const relVy = s.vy - s.speed * track.slopeAt(s.s);
  const pitch = Math.max(-POSE_MAX_PITCH, Math.min(POSE_MAX_PITCH, Math.atan2(relVy, Math.max(1, s.speed))));
  fwd.multiplyScalar(Math.cos(pitch)).addScaledVector(u, Math.sin(pitch)).normalize();
  right.crossVectors(fwd, u).normalize();
  up.crossVectors(right, fwd).normalize();
  // Model space: +X right, +Y up, −Z forward.
  basis.makeBasis(right, up, fwd.negate());
  obj.quaternion.setFromRotationMatrix(basis);
  rollQ.setFromAxisAngle(zAxis, -s.roll);
  obj.quaternion.multiply(rollQ);
}
