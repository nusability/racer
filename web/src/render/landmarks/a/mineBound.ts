// The mine's bucket-wheel excavator as a course dropper: it stands right at the road edge, and
// each cycle it raises its boom and slews it out over the course, then spills rocks off the
// wheel that fall onto exactly the dropper's landing spots, landing at the end of their 'warn'.
// The rocks lying on the road during 'down' (and the warning shadows) are the track scene's.

import * as THREE from 'three';
import { dropperItems, type DropItem } from '../../../core/hazards.ts';
import { HAZARD_DROP_STAGGER, HAZARD_ROCK_HEIGHT } from '../../../data/tuning.ts';
import type { HazardBinding } from '../types.ts';
import { RoadFrame, cycleTime, type HazardOf } from './bound.ts';
import { rock, smooth, type Rig } from './kit.ts';

/** Gap from the road edge to the excavator's slew axis, metres. */
const BASE_GAP = 46;
/** Slew from its rest bearing out over the road, and back, seconds (shortened to fit). */
const SWING = 4;
/** Rest bearing: boom swung aside, along the road, radians from facing it. */
const REST_SLEW = 1.35;
/** Rocks keep spilling this long after the last one lands, seconds. */
const DUMP_TAIL = 0.6;

export interface DiggerPose {
  /** 0 = at rest, 1 = boom out over the road dumping. */
  out: number;
  dumping: boolean;
}

export class BoundDigger {
  readonly frame: RoadFrame;
  /** Excavator placement in local space: base on the ground, yaw so its front faces the road. */
  readonly base = new THREE.Vector3();
  readonly yaw: number;
  private readonly items: DropItem[] = [];
  private readonly rocks: THREE.Bone[] = [];
  private readonly from: THREE.Vector3[] = [];
  private readonly landed: boolean[] = [];
  private readonly v = new THREE.Vector3();
  private readonly dumpEnd: number;
  private readonly swing: number;

  constructor(
    rig: Rig,
    private readonly binding: HazardBinding,
    private readonly hazard: HazardOf<'dropper'>,
    rockColour: THREE.Color,
  ) {
    const h = hazard;
    const d = h.def;
    this.frame = new RoadFrame(binding, (h.s0 + h.s1) / 2, (h.minX + h.maxX) / 2);
    const side = this.frame.originSide();
    binding.toLocal((h.s0 + h.s1) / 2, (side > 0 ? h.maxX : h.minX) + side * BASE_GAP, 0, this.base);
    this.base.y = 0;
    const toRoad = this.frame.ex.clone().multiplyScalar(-side);
    this.yaw = Math.atan2(toRoad.x, toRoad.z);
    this.dumpEnd = d.warn + (d.count - 1) * HAZARD_DROP_STAGGER + DUMP_TAIL;
    this.swing = Math.max(0.5, Math.min(SWING, (d.period - this.dumpEnd) / 2.5));
    const r = d.radius * this.frame.k;
    for (let i = 0; i < d.count; i++) {
      const b = rig.bone();
      // The same proportions the course gives a lying rock, so the hand-off doesn't pop.
      rig.add(rock(1, 0), rockColour, { bone: b, m: new THREE.Matrix4().makeScale(r, (r * HAZARD_ROCK_HEIGHT) / 2, r) });
      b.scale.setScalar(0);
      this.rocks.push(b);
      this.from.push(new THREE.Vector3());
      this.landed.push(false);
    }
  }

  /** Horizontal reach the boom must make from the slew axis to over the road centre, metres. */
  reachToCentre(): number {
    return BASE_GAP + (this.hazard.maxX - this.hazard.minX) / 2;
  }

  /** Where the boom should be at race time `time`. */
  pose(time: number): DiggerPose {
    const d = this.hazard.def;
    const t = cycleTime(time, d.period, d.phase);
    let out = 0;
    if (t < this.dumpEnd) out = 1;
    else if (t < this.dumpEnd + this.swing) out = 1 - smooth((t - this.dumpEnd) / this.swing);
    else if (t > d.period - this.swing) out = smooth((t - (d.period - this.swing)) / this.swing);
    return { out, dumping: t < this.dumpEnd };
  }

  /** Bearing of the boom for an `out` amount (0 rest, 1 over the road), radians. */
  slewFor(out: number): number {
    return REST_SLEW * (1 - out);
  }

  /**
   * Poses the falling rocks from the wheel (`tip`, local) to their landing spots; calls
   * `onLand` once per rock at the moment it lands.
   */
  updateRocks(time: number, tip: THREE.Vector3, onLand: (at: THREE.Vector3) => void): void {
    const d = this.hazard.def;
    dropperItems(this.hazard, time, this.items);
    this.items.forEach((it, i) => {
      const b = this.rocks[i];
      if (it.stage !== 'warn') {
        if (it.stage === 'down' && !this.landed[i]) {
          this.binding.toLocal(it.s, it.x, 0, this.v);
          onLand(this.v);
        }
        this.landed[i] = it.stage === 'down';
        b.scale.setScalar(0);
        return;
      }
      this.landed[i] = false;
      // Spilled off the wheel with no vertical speed: straight-line across, falling with u².
      const p = it.progress;
      if (p < 0.05 || b.scale.x === 0) this.from[i].copy(tip);
      this.binding.toLocal(it.s, it.x, (d.radius * HAZARD_ROCK_HEIGHT) / 2, this.v);
      const f = this.from[i];
      b.position.set(f.x + (this.v.x - f.x) * p, f.y + (this.v.y - f.y) * p * p, f.z + (this.v.z - f.z) * p);
      b.rotation.set(p * 5 + i, p * 3, 0);
      b.scale.setScalar(1);
    });
  }
}
