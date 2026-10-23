// The invasion's strider as a course sweeper: it stands astride the road with its four feet
// planted beyond both edges, and drags its siege drill (the collision pillar) across the course
// at sweeperX, its hull riding over the drill and its legs re-solved every frame to stay planted.

import * as THREE from 'three';
import { sweeperX } from '../../../core/hazards.ts';
import type { HazardBinding } from '../types.ts';
import { RoadFrame, aim, type HazardOf } from './bound.ts';
import { T, cyl, type Rig } from './kit.ts';
import { HIP_Y, LEG, type Strider } from './strider.ts';

/** Feet stand this far outside the road edges and this far up/down the road, metres. */
const FOOT_OUT = 8;
const FOOT_S = 16;
/** Leg extension the scale is chosen for (of full reach), so knees never lock straight. */
const REACH_USE = 0.88;
const BOB = 0.8;
/** Drill grind ring glow and its height above the road, model units. */
const DRILL_TIP = 2;

export class BoundStrider {
  /** Hull position in local space, for targeting. */
  readonly body = new THREE.Vector3();
  /** Drill tip on the road in local space, for sparks. */
  readonly tip = new THREE.Vector3();
  private readonly feet: THREE.Vector3[] = [];
  private readonly f: RoadFrame;
  private readonly fwd: THREE.Vector3;
  private readonly up: THREE.Vector3;
  private readonly scale: number;
  private readonly inv = new THREE.Matrix4();
  private readonly v = new THREE.Vector3();

  constructor(
    rig: Rig,
    private readonly s: Strider,
    private readonly binding: HazardBinding,
    private readonly hazard: HazardOf<'sweeper'>,
    colours: { dark: THREE.Color; glow: THREE.Color },
  ) {
    const h = hazard;
    const d = h.def;
    this.f = new RoadFrame(binding, h.s0, (h.minX + h.maxX) / 2);
    this.fwd = this.f.es.clone().negate();
    this.up = this.f.ey.clone();
    // Big enough that a planted foot is in reach wherever the drill is along its sweep.
    const footXs = [h.minX - FOOT_OUT, h.maxX + FOOT_OUT];
    let need = 0;
    for (const bx of [d.xFrom, d.xTo]) for (const fx of footXs) need = Math.max(need, Math.hypot(fx - bx, FOOT_S));
    const reach = Math.sqrt((REACH_USE * (LEG.a + LEG.b)) ** 2 - (HIP_Y - 2) ** 2);
    this.scale = Math.max(1, need / reach);
    // The drill is the pillar the simulation collides with: its radius in model units.
    const r = d.radius / this.scale;
    rig.add(cyl(r, r * 1.15, HIP_Y - 10, 8), colours.dark, { bone: s.holder });
    rig.add(cyl(r * 1.25, r * 1.25, 0.8, 8), colours.glow, { bone: s.holder, m: T(0, DRILL_TIP, 0), layer: 'glow' });
    // Match each hip to the foot on its own side and end of the body.
    const right = new THREE.Vector3().crossVectors(this.up, this.fwd);
    const rightIsPlusX = right.dot(this.f.ex) > 0;
    for (const hip of s.hips) {
      const lateral = Math.sign(hip.position.x) * (rightIsPlusX ? 1 : -1);
      const along = -Math.sign(hip.position.z);
      this.feet.push(binding.toLocal(h.s0 + along * FOOT_S, lateral > 0 ? h.maxX + FOOT_OUT : h.minX - FOOT_OUT, 0, new THREE.Vector3()));
    }
  }

  /** Poses hull, head and legs for race time `time`; `aimAt` is what the gun head tracks. */
  pose(time: number, aimAt: THREE.Vector3): void {
    const { s, hazard } = this;
    const x = sweeperX(hazard.def, time);
    this.binding.toLocal(hazard.s0, x, Math.abs(Math.sin(time * 2.2)) * BOB, this.v);
    aim(s.holder, this.v, this.fwd, this.up);
    s.holder.scale.setScalar(this.scale * this.f.k);
    this.binding.toLocal(hazard.s0, x, 0, this.tip);
    s.holder.updateMatrix();
    this.inv.copy(s.holder.matrix).invert();
    this.body.set(0, HIP_Y, 0).applyMatrix4(s.holder.matrix);
    s.hips.forEach((hip, i) => solveLeg(hip, s.shins[i], this.v.copy(this.feet[i]).applyMatrix4(this.inv)));
    this.v.copy(aimAt).applyMatrix4(this.inv);
    s.head.rotation.y = Math.atan2(this.v.x - s.head.position.x, this.v.z - s.head.position.z);
  }
}

/**
 * Two-bone leg IK in the hip's vertical plane: yaw the hip at the foot, then bend the knee
 * upward (harvestman-style) so thigh and shin meet the planted foot. `target` is in the
 * hip's parent (hull) frame.
 */
function solveLeg(hip: THREE.Bone, shin: THREE.Bone, target: THREE.Vector3): void {
  const vx = target.x - hip.position.x;
  const vy = target.y - hip.position.y;
  const vz = target.z - hip.position.z;
  const yaw = Math.atan2(-vz, vx);
  const h = Math.hypot(vx, vz);
  const { a, b, alpha0, beta0 } = LEG;
  const dist = THREE.MathUtils.clamp(Math.hypot(h, vy), Math.abs(a - b) + 0.01, (a + b) * 0.999);
  const phi = Math.atan2(vy, h);
  const alpha = phi + Math.acos((a * a + dist * dist - b * b) / (2 * a * dist));
  const kx = a * Math.cos(alpha);
  const ky = a * Math.sin(alpha);
  const beta = Math.atan2(Math.sin(phi) * dist - ky, Math.cos(phi) * dist - kx);
  hip.rotation.set(0, yaw, alpha - alpha0);
  shin.rotation.z = beta - beta0 - (alpha - alpha0);
}
