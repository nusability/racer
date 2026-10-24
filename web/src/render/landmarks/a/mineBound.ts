// The mine's bucket-wheel excavator as a course dropper, working right beside the road like the
// city's tower cranes: its crawlers stand just past the road edge (up on the rim where the road
// runs in a canyon), a little upstream of the drop zone. At rest its wheel bites a spoil bench
// along the roadside; each cycle it slews the boom in over the road and spills ore off the wheel
// that falls onto exactly the dropper's landing spots, landing as their 'warn' ends. The rocks
// lying on the road during 'down' (and the warning rings) are the track scene's.
//
// Everything road-relative is laid out on the first update, from the live binding: the track
// scene fills a binding's mapping in only after the landmark is built.

import * as THREE from 'three';
import { dropperItems, type DropItem } from '../../../core/hazards.ts';
import { GRAVITY, HAZARD_DROP_STAGGER, HAZARD_ROCK_HEIGHT } from '../../../data/tuning.ts';
import type { HazardBinding } from '../types.ts';
import { RoadFrame, cycleTime, type HazardOf } from './bound.ts';
import { rock, smooth, type Rig } from './kit.ts';

/** Slew axis this far past the road edge: the crawlers' half-width plus a working margin. */
const BASE_GAP = 26;
/** Height of the wheel's centre over the road while it spills, metres: high enough that the
 * ore visibly drops from it, low enough that the boom still reaches over from the roadside. */
const SPILL_HEIGHT = 30;
/** Boom swings in over the road, and back, in at most this many seconds (shortened to fit). */
const SWING = 3;
/** Share of the free time each swing may take: the rest it digs. */
const SWING_SHARE = 0.4;
/** Rest: the boom points downstream along the roadside, turned this far away from the road. */
const REST_AWAY = 0.15;
/** Luff limits, radians above horizontal. */
const LUFF_MIN = -0.7;
const LUFF_MAX = 1.1;
/** The boom is out a moment before the first rock leaves the wheel, and lingers after the last. */
const SPILL_LEAD = 0.3;
const DUMP_TAIL = 0.6;
/** The spoil bench the wheel digs at rest: its size over the wheel radius. */
const BENCH = 0.6;

/** The excavator's arm in its model units: what the bound layout solves with. */
export interface DiggerArm {
  /** Boom hinge: height over the crawlers' ground, and its forward offset from the slew axis. */
  pivotY: number;
  pivotZ: number;
  /** Hinge to wheel centre. */
  boomLen: number;
  wheelR: number;
  /** Model units → metres. */
  scale: number;
}

export interface DiggerPose {
  /** 0 = digging at rest, 1 = boom out over the road. */
  out: number;
  dumping: boolean;
  /** Slew bearing (local yaw of the boom's +Z) and luff (radians above horizontal). */
  slew: number;
  luff: number;
}

export class BoundDigger {
  /** Excavator placement in local space: base on the ground, crawlers along the road. */
  readonly base = new THREE.Vector3();
  baseYaw = 0;
  /** Local units per metre. */
  k = 1;
  private ready = false;
  private readonly frame: RoadFrame;
  private readonly binding: HazardBinding;
  private readonly hazard: HazardOf<'dropper'>;
  private readonly arm: DiggerArm;
  private readonly items: DropItem[] = [];
  private readonly rocks: THREE.Bone[] = [];
  private readonly from: THREE.Vector3[] = [];
  private readonly landed: boolean[] = [];
  private readonly bench: THREE.Bone;
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  /** Positions of the rocks in the air this frame (for their dust trails). */
  readonly falling: THREE.Vector3[] = [];
  /** Seconds each rock is in the air, and the dump window in the cycle. */
  private readonly flight: number;
  private readonly dumpFrom: number;
  private readonly dumpTo: number;
  private readonly swing: number;
  private slewDump = 0;
  private slewRest = 0;
  private luffDump = 0;
  private readonly luffRest: number;
  private readonly pose: DiggerPose = { out: 0, dumping: false, slew: 0, luff: 0 };

  constructor(rig: Rig, binding: HazardBinding, hazard: HazardOf<'dropper'>, arm: DiggerArm, rockColour: THREE.Color, benchColour: THREE.Color) {
    this.binding = binding;
    this.hazard = hazard;
    this.arm = arm;
    const d = hazard.def;
    this.frame = new RoadFrame(binding, (hazard.s0 + hazard.s1) / 2, (hazard.minX + hazard.maxX) / 2);
    // A rock dropped off the bottom of the wheel lands in this time; if the warning is shorter
    // it is thrown down harder (see updateRocks), so it still lands as the warning ends.
    this.flight = Math.min(d.warn, Math.sqrt((2 * (SPILL_HEIGHT - arm.wheelR * arm.scale)) / GRAVITY));
    this.dumpFrom = d.warn - this.flight - SPILL_LEAD;
    this.dumpTo = d.warn + (d.count - 1) * HAZARD_DROP_STAGGER + DUMP_TAIL;
    this.swing = Math.min(SWING, (d.period - (this.dumpTo - this.dumpFrom)) * SWING_SHARE);
    if (this.swing <= 0) throw new Error(`mine: dropper ${d.id} leaves the digger no time to swing (period ${d.period}s)`);
    this.luffRest = Math.asin((arm.wheelR - arm.pivotY) / arm.boomLen);
    for (let i = 0; i < d.count; i++) {
      const b = rig.bone();
      // Unit rock, scaled per frame to the course's lying-rock proportions so the hand-off doesn't pop.
      rig.add(rock(1, 0), rockColour, { bone: b });
      b.scale.setScalar(0);
      this.rocks.push(b);
      this.from.push(new THREE.Vector3());
      this.landed.push(false);
    }
    this.bench = rig.bone();
    rig.add(rock(1, 1).scale(BENCH * 1.4, BENCH * 0.45, BENCH), benchColour, { bone: this.bench });
    this.bench.scale.setScalar(0);
  }

  /** Lays the digger out against the road; called on the first update, once the binding is live. */
  private layout(): void {
    const h = this.hazard;
    const a = this.arm;
    const f = this.frame.refresh();
    this.k = f.k;
    const side = f.originSide();
    const edge = side > 0 ? h.maxX : h.minX;
    const sMid = (h.s0 + h.s1) / 2;
    const xMid = (h.minX + h.maxX) / 2;
    // Solve the luff that holds the wheel at SPILL_HEIGHT; that fixes the boom's reach, and the
    // base stands upstream by however much of that reach the road's width does not take up.
    const across = BASE_GAP + Math.abs(edge - xMid);
    const wall0 = this.binding.wallAt?.(sMid) ?? 0;
    let luff = clampLuff(Math.asin(clamp1(((SPILL_HEIGHT - wall0) / a.scale - a.pivotY) / a.boomLen)));
    let reach = a.scale * (a.pivotZ + a.boomLen * Math.cos(luff));
    if (reach < across) {
      // Too short at that height: raise the boom until it reaches straight across.
      luff = clampLuff(Math.acos(clamp1((across / a.scale - a.pivotZ) / a.boomLen)));
      reach = across;
    }
    const upstream = Math.sqrt(Math.max(0, reach * reach - across * across));
    const sBase = sMid - upstream;
    const wall = this.binding.wallAt?.(sBase) ?? 0;
    this.binding.toLocal(sBase, edge + side * BASE_GAP, wall, this.base);
    // Crawlers along the road, facing downstream.
    this.binding.toLocal(sBase + 1, edge + side * BASE_GAP, wall, this.v).sub(this.base);
    this.baseYaw = Math.atan2(this.v.x, this.v.z);
    this.binding.toLocal(sMid, xMid, wall, this.w).sub(this.base);
    this.slewDump = Math.atan2(this.w.x, this.w.z);
    // Rest: downstream along the roadside, turned away from the road.
    this.slewRest = this.baseYaw - REST_AWAY * turnToward(this.v, this.w);
    this.luffDump = luff;
    // The spoil bench under the wheel at rest.
    const restReach = a.scale * (a.pivotZ + a.boomLen * Math.cos(this.luffRest)) * this.k;
    this.bench.position.set(this.base.x + Math.sin(this.slewRest) * restReach, this.base.y, this.base.z + Math.cos(this.slewRest) * restReach);
    this.bench.scale.setScalar(a.wheelR * a.scale * this.k);
    this.ready = true;
  }

  /** Where the boom should be at race time `time`. */
  update(time: number): DiggerPose {
    if (!this.ready) this.layout();
    const d = this.hazard.def;
    const t = cycleTime(time, d.period, d.phase);
    const sinceFrom = (((t - this.dumpFrom) % d.period) + d.period) % d.period;
    const span = this.dumpTo - this.dumpFrom;
    const toFrom = d.period - sinceFrom;
    let out = 0;
    if (sinceFrom < span) out = 1;
    else if (sinceFrom < span + this.swing) out = 1 - smooth((sinceFrom - span) / this.swing);
    else if (toFrom < this.swing) out = smooth(1 - toFrom / this.swing);
    const p = this.pose;
    p.out = out;
    p.dumping = sinceFrom < span;
    p.slew = this.slewRest + shortAngle(this.slewDump - this.slewRest) * smooth(out);
    p.luff = this.luffRest + (this.luffDump - this.luffRest) * smooth(out);
    return p;
  }

  /**
   * Poses the rocks: each leaves the wheel (`tip`, local) `flight` seconds before it lands on its
   * spot, on a true ballistic arc; `onLand` fires once per rock at the moment it lands.
   */
  updateRocks(time: number, tip: THREE.Vector3, onLand: (at: THREE.Vector3) => void): void {
    this.falling.length = 0;
    const d = this.hazard.def;
    const k = this.k;
    dropperItems(this.hazard, time, this.items);
    this.items.forEach((it, i) => {
      const b = this.rocks[i];
      const left = it.stage === 'warn' ? (1 - it.progress) * d.warn : -1;
      if (left < 0 || left > this.flight) {
        if (it.stage === 'down' && !this.landed[i]) {
          this.binding.toLocal(it.s, it.x, 0, this.v);
          onLand(this.v);
        }
        this.landed[i] = it.stage === 'down';
        b.scale.setScalar(0);
        return;
      }
      this.landed[i] = false;
      const f = this.from[i];
      if (b.scale.x === 0) f.copy(tip);
      const u = 1 - left / this.flight;
      const tau = u * this.flight;
      this.binding.toLocal(it.s, it.x, (d.radius * HAZARD_ROCK_HEIGHT) / 2, this.v);
      // Vertical: from the wheel to the spot in `flight` under gravity (local units).
      const g = GRAVITY * k;
      const vy = (this.v.y - f.y + 0.5 * g * this.flight * this.flight) / this.flight;
      b.position.set(f.x + (this.v.x - f.x) * u, f.y + vy * tau - 0.5 * g * tau * tau, f.z + (this.v.z - f.z) * u);
      b.rotation.set(u * 5 + i, u * 3, 0);
      b.scale.set(d.radius * k, (d.radius * HAZARD_ROCK_HEIGHT * k) / 2, d.radius * k);
      this.falling.push(b.position);
    });
  }
}

function clamp1(x: number): number {
  return Math.max(-1, Math.min(1, x));
}

function clampLuff(a: number): number {
  return Math.max(LUFF_MIN, Math.min(LUFF_MAX, a));
}

/** The short way round from one bearing to another, radians in (−π, π]. */
function shortAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** +1 if turning from horizontal `a` toward `b` is a positive yaw, else −1. */
function turnToward(a: THREE.Vector3, b: THREE.Vector3): number {
  return a.z * b.x - a.x * b.z >= 0 ? 1 : -1;
}
