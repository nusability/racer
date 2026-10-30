// Chase camera computed in track space, so it can never end up inside a canyon wall or
// above a tunnel ceiling, then converted to world space.

import * as THREE from 'three';
import type { Track } from '../core/track.ts';
import { makeFrame, type Frame } from '../core/track.ts';
import type { RacerState, Vec3 } from '../core/types.ts';
import {
  CAM_BACK_BOOST,
  CAM_BACK_MAX,
  CAM_BACK_MIN,
  CAM_CEILING_MARGIN,
  CAM_FOV_BOOST,
  CAM_FOV_MAX,
  CAM_FOV_MIN,
  CAM_HEIGHT,
  CAM_LATERAL_FOLLOW,
  CAM_LOOK_AHEAD,
  CAM_LOOK_HEIGHT,
  CAM_PORTRAIT_FOV_SCALE,
  CAM_SHAKE_DECAY,
  CAM_SMOOTH,
  CAM_UP_BLEND,
  CAM_UP_FOLLOW,
  CAM_WALL_MARGIN,
} from './cameraTuning.ts';

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  private x = 0;
  private y = CAM_HEIGHT;
  private back = CAM_BACK_MIN;
  private fov = CAM_FOV_MIN;
  private shake = 0;
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly tmp: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly frame = makeFrame();
  private readonly target = new THREE.Vector3();
  private readonly trackUp = new THREE.Vector3();
  private initialised = false;
  private branch = -1;
  private upFollow = CAM_UP_FOLLOW;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAM_FOV_MIN, aspect, 0.5, 3200);
  }

  addShake(amount: number) {
    this.shake = Math.min(1, this.shake + amount);
  }

  /** speedFrac: speed / topSpeed (can exceed 1 on boost). */
  update(dt: number, track: Track, p: RacerState, speedFrac: number, time: number) {
    const k = this.initialised ? 1 - Math.exp(-CAM_SMOOTH * dt) : 1;
    this.initialised = true;
    const boost = p.boosting ? 1 : 0;
    const backTarget = CAM_BACK_MIN + (CAM_BACK_MAX - CAM_BACK_MIN) * Math.min(1, speedFrac) + CAM_BACK_BOOST * boost;
    this.back += (backTarget - this.back) * k;

    // Keep the smoothed lateral offset continuous when the racer changes ribbon.
    if (p.branch !== this.branch) {
      const b = track.branches[p.branch < 0 ? this.branch : p.branch];
      this.x += p.branch < 0 ? b.junctionOffset : -b.junctionOffset;
      this.branch = p.branch;
    }
    const ribbon = track.ribbon(p.branch);
    const sCam = p.s - this.back;
    const half = Math.min(-ribbon.minXAt(sCam), ribbon.maxXAt(sCam)) - CAM_WALL_MARGIN;
    // Off the course it leans out over the open edge after the craft, so the road doesn't hide it.
    const xTarget = p.fall !== null ? p.x * CAM_LATERAL_FOLLOW : Math.max(-half, Math.min(half, p.x * CAM_LATERAL_FOLLOW));
    this.x += (xTarget - this.x) * k;
    // ...but it stays up at the road's height and watches the craft fall away.
    let yTarget = (p.fall !== null ? Math.max(p.y, 0) : p.y) + CAM_HEIGHT;
    const ceiling = Math.min(ribbon.ceilingAt(sCam), ribbon.ceilingAt(p.s));
    if (Number.isFinite(ceiling)) yTarget = Math.min(yTarget, ceiling - CAM_CEILING_MARGIN);
    // Over a chasm keep following the racer's height rather than the missing surface.
    this.y += (yTarget - this.y) * k;

    placeOnCourse(track, p.branch, sCam, this.x, this.y, this.tmp, this.frame);
    this.camera.position.set(this.tmp.x, this.tmp.y, this.tmp.z);
    this.trackUp.set(this.frame.up.x, this.frame.up.y, this.frame.up.z);

    if (p.fall !== null) this.target.set(p.fall.pos.x, p.fall.pos.y, p.fall.pos.z);
    else {
      placeOnCourse(track, p.branch, p.s + CAM_LOOK_AHEAD, p.x, p.y + CAM_LOOK_HEIGHT, this.tmp, this.frame);
      this.target.set(this.tmp.x, this.tmp.y, this.tmp.z);
    }

    // Follow the road's bank partly so turns lean, but never fully (nausea on phones) — except
    // where the road leaves the ground plane (loops, corkscrews): there only the road is "up".
    const upTarget = ribbon.isMagnet(p.s) || ribbon.isMagnet(sCam) ? 1 : CAM_UP_FOLLOW;
    this.upFollow += (upTarget - this.upFollow) * (1 - Math.exp(-CAM_UP_BLEND * dt));
    this.up.set(0, 1, 0).lerp(this.trackUp, this.upFollow).normalize();
    this.camera.up.copy(this.up);

    if (this.shake > 0) {
      const a = this.shake * this.shake;
      this.camera.position.x += Math.sin(time * 71) * a * 0.6;
      this.camera.position.y += Math.sin(time * 53 + 1.3) * a * 0.5;
      this.shake = Math.max(0, this.shake - CAM_SHAKE_DECAY * dt);
    }
    this.camera.lookAt(this.target);

    const fovTarget = CAM_FOV_MIN + (CAM_FOV_MAX - CAM_FOV_MIN) * Math.min(1, speedFrac) + CAM_FOV_BOOST * boost;
    this.fov += (fovTarget - this.fov) * k;
    this.camera.fov = this.camera.aspect < 1 ? this.fov * CAM_PORTRAIT_FOV_SCALE : this.fov;
    this.camera.updateProjectionMatrix();
  }

  /** Snap instead of easing on the next update (start, restart). */
  reset() {
    this.initialised = false;
    this.upFollow = CAM_UP_FOLLOW;
    this.branch = -1;
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

/**
 * A point on the racer's ribbon, continuing onto the main loop past either end of a branch
 * (the branch runs alongside the main road there), so the camera can trail behind or look
 * ahead across a junction.
 */
function placeOnCourse(track: Track, branch: number, s: number, x: number, y: number, out: Vec3, frame: Frame) {
  if (branch >= 0) {
    const b = track.branches[branch];
    if (s < 0) return track.toWorld(b.entryS + s, x + b.junctionOffset, y, out, frame);
    if (s > b.ribbon.length) return track.toWorld(b.exitS + s - b.ribbon.length, x + b.junctionOffset, y, out, frame);
    return b.ribbon.toWorld(s, x, y, out, frame);
  }
  return track.toWorld(s, x, y, out, frame);
}
