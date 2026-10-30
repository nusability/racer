// The camera of a sprint's end: once the player's craft has come to rest in the force field, it
// eases out of the chase view into a slow, cinematic vista. It cranes up and back from the craft
// and turns toward the scene's best view (the gas giant in space, the land beyond the road's end
// elsewhere), then keeps drifting while the results wait, so the craft slides slowly against the
// view. Like the wreck camera, it takes over from the chase camera where that left off.
//
// The race is over and the craft is still, so the move is a timed ease rather than springs: the
// same path at any frame rate.

import * as THREE from 'three';
import {
  CAM_PORTRAIT_FOV_SCALE,
  VISTA_CAM_BACK,
  VISTA_CAM_CRANE,
  VISTA_CAM_EASE,
  VISTA_CAM_FOV,
  VISTA_CAM_ORBIT,
  VISTA_CAM_PITCH,
  VISTA_CAM_PULL,
  VISTA_CAM_RISE,
} from './cameraTuning.ts';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class VistaCamera {
  /** Seconds since it took over; null until the player has come to rest. */
  private age: number | null = null;
  /** The view, flattened to a heading, and the pitch the camera looks along it at. */
  private readonly heading = new THREE.Vector3();
  private readonly pitch: number;
  private readonly fromPos = new THREE.Vector3();
  private readonly fromRot = new THREE.Quaternion();
  private fromFov = 0;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly rot = new THREE.Quaternion();
  private readonly m = new THREE.Matrix4();

  /** `view`: world direction toward what the vista must show, from the craft at rest. */
  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    view: THREE.Vector3,
  ) {
    this.heading.set(view.x, 0, view.z);
    if (this.heading.lengthSq() === 0) throw new Error('VistaCamera: the view is straight up or down, with no heading to turn to');
    this.heading.normalize();
    const elevation = Math.asin(view.y / view.length());
    const craft = -Math.atan2(VISTA_CAM_RISE, VISTA_CAM_BACK);
    this.pitch = Math.min(VISTA_CAM_PITCH[1], Math.max(VISTA_CAM_PITCH[0], (elevation + craft) / 2));
  }

  /** Seconds the vista has been shown (0 before it takes over). */
  get shown(): number {
    return this.age ?? 0;
  }

  /**
   * Once `resting`, takes the camera (from wherever the chase camera left it) and moves it on by
   * `real` seconds, framing the craft at `focus`. Returns whether it has the camera.
   */
  update(real: number, focus: THREE.Vector3, resting: boolean): boolean {
    if (this.age === null) {
      if (!resting) return false;
      this.age = 0;
      this.fromPos.copy(this.camera.position);
      this.fromRot.copy(this.camera.quaternion);
      this.fromFov = this.camera.fov;
    } else this.age += real;
    // Smootherstep: it leaves the chase and arrives at the vista with no jolt in speed.
    const u = Math.min(1, this.age / VISTA_CAM_EASE);
    const ease = u * u * u * (u * (u * 6 - 15) + 10);
    const drift = Math.max(0, this.age - VISTA_CAM_EASE);

    this.look.copy(this.heading).applyAxisAngle(WORLD_UP, VISTA_CAM_ORBIT * this.age);
    this.pos.copy(focus).addScaledVector(this.look, -(VISTA_CAM_BACK + VISTA_CAM_PULL * drift));
    this.pos.y += VISTA_CAM_RISE + VISTA_CAM_CRANE * drift;
    // It looks along the view itself, not at the craft: as it orbits, the craft drifts across the frame.
    this.look.copy(this.heading).multiplyScalar(Math.cos(this.pitch));
    this.look.y = Math.sin(this.pitch);
    this.rot.setFromRotationMatrix(this.m.lookAt(this.pos, this.look.add(this.pos), WORLD_UP));

    const cam = this.camera;
    cam.position.lerpVectors(this.fromPos, this.pos, ease);
    cam.quaternion.slerpQuaternions(this.fromRot, this.rot, ease);
    const fov = cam.aspect < 1 ? VISTA_CAM_FOV * CAM_PORTRAIT_FOV_SCALE : VISTA_CAM_FOV;
    cam.fov = this.fromFov + (fov - this.fromFov) * ease;
    cam.updateProjectionMatrix();
    return true;
  }

  /** Back to waiting for the craft to rest (a restarted race). */
  reset(): void {
    this.age = null;
  }
}
