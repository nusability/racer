// The time-trial ghost on screen: the glider its best run was set with, every part redrawn in
// one see-through tint so it reads at a glance as a ghost and never as a rival. It has no
// collision: it is never part of the race, only placed from the recorded poses.
import * as THREE from 'three';
import type { Ribbon } from '../core/track.ts';
import type { RacerVisual } from '../core/types.ts';
import type { GhostPose } from '../game/ghost.ts';
import { GHOST_OPACITY, GHOST_TINT } from '../game/trialTuning.ts';
import { createRacerModel, type RacerModel } from './racerModel.ts';
import { poseRibbonAt } from './racerPose.ts';

/** How much brighter the ghost's tint glows while its run was boosting. */
const GHOST_BOOST_BRIGHTEN = 1.6;

export class GhostModel {
  readonly glider: string;
  private readonly model: RacerModel;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly tint = new THREE.Color(GHOST_TINT);

  constructor(glider: string, visual: RacerVisual) {
    this.glider = glider;
    this.model = createRacerModel(visual, { detail: 'low', finish: null });
    this.material = new THREE.MeshBasicMaterial({ color: GHOST_TINT, transparent: true, opacity: GHOST_OPACITY, depthWrite: false, side: THREE.DoubleSide });
    this.model.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = this.material;
        // Drawn after the solid world, so the road and the player show through it.
        o.renderOrder = 1;
        o.castShadow = false;
      }
    });
    this.model.root.visible = false;
  }

  get root(): THREE.Object3D {
    return this.model.root;
  }

  /** Places the ghost; null hides it (no recorded pose for this moment). */
  show(ribbon: Ribbon | null, pose: GhostPose | null): void {
    if (!ribbon || !pose) {
      this.model.root.visible = false;
      return;
    }
    poseRibbonAt(ribbon, pose.s, pose.x, pose.y, pose.yaw, pose.pitch, pose.roll, this.model.root);
    this.material.color.copy(this.tint).multiplyScalar(pose.boosting ? GHOST_BOOST_BRIGHTEN : 1);
    this.model.root.visible = true;
  }

  hide(): void {
    this.model.root.visible = false;
  }

  dispose(): void {
    this.model.root.removeFromParent();
    this.model.dispose();
    this.material.dispose();
  }
}
