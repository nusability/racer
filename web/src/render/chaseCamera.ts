// Chase camera computed in track space, so it can never end up inside a canyon wall or
// above a tunnel ceiling, then converted to world space.

import * as THREE from 'three';
import type { Track } from '../core/track.ts';
import { makeFrame } from '../core/track.ts';
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

    const sCam = p.s - this.back;
    const half = track.widthAt(sCam) / 2 - CAM_WALL_MARGIN;
    const xTarget = Math.max(-half, Math.min(half, p.x * CAM_LATERAL_FOLLOW));
    this.x += (xTarget - this.x) * k;
    let yTarget = p.y + CAM_HEIGHT;
    const ceiling = Math.min(track.ceilingAt(sCam), track.ceilingAt(p.s));
    if (Number.isFinite(ceiling)) yTarget = Math.min(yTarget, ceiling - CAM_CEILING_MARGIN);
    // Over a chasm keep following the racer's height rather than the missing surface.
    this.y += (yTarget - this.y) * k;

    track.toWorld(sCam, this.x, this.y, this.tmp, this.frame);
    this.camera.position.set(this.tmp.x, this.tmp.y, this.tmp.z);
    this.trackUp.set(this.frame.up.x, this.frame.up.y, this.frame.up.z);

    track.toWorld(p.s + CAM_LOOK_AHEAD, p.x, p.y + CAM_LOOK_HEIGHT, this.tmp, this.frame);
    this.target.set(this.tmp.x, this.tmp.y, this.tmp.z);

    // Follow the road's bank partly so turns lean, but never fully (nausea on phones).
    this.up.set(0, 1, 0).lerp(this.trackUp, CAM_UP_FOLLOW).normalize();
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

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
