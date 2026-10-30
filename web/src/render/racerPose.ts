// Places a racer model in the world from its track-space state, interpolated between two
// simulation steps so motion is smooth at any display rate.

import * as THREE from 'three';
import type { Ribbon, Track } from '../core/track.ts';
import { makeFrame } from '../core/track.ts';
import type { RacerState, Vec3 } from '../core/types.ts';
import { POSE_FALL_PITCH_RATE, POSE_FALL_TUMBLE, POSE_MAX_PITCH, POSE_VISUAL_HOVER } from './cameraTuning.ts';

export interface PoseSnapshot {
  branch: number;
  s: number;
  x: number;
  y: number;
  yaw: number;
  roll: number;
  vy: number;
  speed: number;
  /** Falling free of the course (RacerState.fall): its world position and velocity, and how long. */
  falling: boolean;
  fall: { pos: Vec3; vel: Vec3; time: number };
}

export function snapshot(r: RacerState, out: PoseSnapshot): PoseSnapshot {
  out.branch = r.branch;
  out.s = r.s;
  out.x = r.x;
  out.y = r.y;
  out.yaw = r.yaw;
  out.roll = r.roll;
  out.vy = r.vy;
  out.speed = r.speed;
  out.falling = r.fall !== null;
  if (r.fall !== null) {
    Object.assign(out.fall.pos, r.fall.pos);
    Object.assign(out.fall.vel, r.fall.vel);
    out.fall.time = r.fall.time;
  }
  return out;
}

export function emptySnapshot(): PoseSnapshot {
  return { branch: -1, s: 0, x: 0, y: 0, yaw: 0, roll: 0, vy: 0, speed: 0, falling: false, fall: { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, time: 0 } };
}

/**
 * Blend a → b by alpha, unwrapping s across the start line. Across a hand-over between the
 * main loop and a branch the two s values live on different ribbons, so take b as is.
 */
export function lerpSnapshot(track: Track, a: PoseSnapshot, b: PoseSnapshot, alpha: number, out: PoseSnapshot) {
  if (a.branch !== b.branch || a.falling !== b.falling) {
    copySnapshot(b, out);
    return out;
  }
  const ribbon = track.ribbon(b.branch);
  out.branch = b.branch;
  out.s = ribbon.wrap(a.s + ribbon.delta(a.s, b.s) * alpha);
  out.x = a.x + (b.x - a.x) * alpha;
  out.y = a.y + (b.y - a.y) * alpha;
  out.yaw = a.yaw + (b.yaw - a.yaw) * alpha;
  out.roll = a.roll + (b.roll - a.roll) * alpha;
  out.vy = a.vy + (b.vy - a.vy) * alpha;
  out.speed = a.speed + (b.speed - a.speed) * alpha;
  out.falling = b.falling;
  if (b.falling) {
    const mix = (p: Vec3, q: Vec3, o: Vec3) => {
      o.x = p.x + (q.x - p.x) * alpha;
      o.y = p.y + (q.y - p.y) * alpha;
      o.z = p.z + (q.z - p.z) * alpha;
    };
    mix(a.fall.pos, b.fall.pos, out.fall.pos);
    mix(a.fall.vel, b.fall.vel, out.fall.vel);
    out.fall.time = a.fall.time + (b.fall.time - a.fall.time) * alpha;
  }
  return out;
}

/** b into out, keeping out's own nested objects (snapshots are reused every frame). */
function copySnapshot(b: PoseSnapshot, out: PoseSnapshot) {
  const { pos, vel } = out.fall;
  Object.assign(out, b, { fall: out.fall });
  Object.assign(pos, b.fall.pos);
  Object.assign(vel, b.fall.vel);
  out.fall.time = b.fall.time;
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
  if (s.falling) poseFalling(s, obj);
  else poseOnRibbon(track.ribbon(s.branch), s, obj);
}

/**
 * Falling free of the course: intact, heading along its flight, the nose dropping and the
 * craft rolling over toward the side it went off (x > 0: off the right edge) as it tumbles.
 */
function poseFalling(s: PoseSnapshot, obj: THREE.Object3D) {
  const { pos, vel, time } = s.fall;
  obj.position.set(pos.x, pos.y + POSE_VISUAL_HOVER, pos.z);
  const yaw = Math.atan2(-vel.x, -vel.z);
  const pitch = Math.max(-Math.PI / 2, Math.atan2(vel.y, Math.max(1, Math.hypot(vel.x, vel.z))) - POSE_FALL_PITCH_RATE * time);
  const roll = -Math.sign(s.x) * POSE_FALL_TUMBLE * time;
  fallEuler.set(pitch, yaw, roll, 'YXZ');
  obj.quaternion.setFromEuler(fallEuler);
}

const fallEuler = new THREE.Euler();

function poseOnRibbon(track: Ribbon, s: PoseSnapshot, obj: THREE.Object3D) {
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
  // The sim's roll already includes the road bank, which the banked frame applied above.
  rollQ.setFromAxisAngle(zAxis, -(s.roll - track.bankAt(s.s)));
  obj.quaternion.multiply(rollQ);
}
