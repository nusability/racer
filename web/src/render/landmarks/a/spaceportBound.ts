// The spaceport as a course gust: a heavy hauler comes in low and slow over the road at the
// gust's span exactly during its on-window, lift jets roaring, and its downdraft blasts dust
// across the course in the push's direction; then it climbs away. Idle traffic carries on.

import * as THREE from 'three';
import { gustStrength } from '../../../core/hazards.ts';
import type { HazardBinding } from '../types.ts';
import { RoadFrame, aim, cycleTime, type HazardOf } from './bound.ts';
import { buildHauler, type Craft, type CraftColours } from './craft.ts';
import { brush, mix, type Particles, type Rig } from './kit.ts';
import type { TrackPalette } from '../../../core/types.ts';

const SHIP_SCALE = 2.6;
/** Belly height over the road while it pushes, metres. */
const LOW = 30;
/** Approach and departure: seconds, how far out it comes from, how high it climbs. */
const LEAD = 9;
const FAR = 520;
const CLIMB = 260;
/** Share of the road's half width it drifts across during the on-window. */
const DRIFT = 0.9;
const LAMPS = 4;
const EMIT_STEP = 0.04;

export class GustShip {
  readonly craft: Craft;
  readonly frame: RoadFrame;
  private readonly holder: THREE.Bone;
  private readonly sMid: number;
  private readonly centre: number;
  private readonly half: number;
  private readonly dir: number;
  private readonly lead: number;
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly up: THREE.Vector3;
  private readonly push: THREE.Vector3;
  private readonly blast: ReturnType<typeof brush>;
  private acc = 0;

  constructor(
    rig: Rig,
    private readonly binding: HazardBinding,
    private readonly hazard: HazardOf<'gust'>,
    colours: CraftColours,
    palette: TrackPalette,
  ) {
    const h = hazard;
    const d = h.def;
    this.sMid = (h.s0 + h.s1) / 2;
    this.centre = (h.minX + h.maxX) / 2;
    this.half = (h.maxX - h.minX) / 2;
    this.dir = Math.sign(d.strength) || 1;
    this.lead = Math.max(1, Math.min(LEAD, (d.period - d.on) / 2 - 0.2));
    this.frame = new RoadFrame(binding, this.sMid, this.centre);
    this.up = this.frame.ey.clone().normalize();
    this.push = this.frame.ex.clone().normalize().multiplyScalar(this.dir);
    this.holder = rig.bone();
    this.craft = buildHauler(rig, this.holder, SHIP_SCALE, colours);
    const k = this.frame.k;
    this.blast = brush({ life: 2.6, size0: 6 * k, size1: 30 * k, c0: mix(palette.sand, 0xffffff, 0.15), c1: mix(palette.sand, palette.horizon, 0.5), alpha: 0.6, keep: 0.7, lift: 0.5 * k });
  }

  /** Lateral position and height (track metres) at cycle time t, or null while it's away. */
  private place(t: number, out: THREE.Vector3): THREE.Vector3 | null {
    const d = this.hazard.def;
    const edge = DRIFT * this.half;
    if (t < d.on) return out.set(this.centre + this.dir * (-edge + 2 * edge * (t / d.on)), LOW, 0);
    if (t < d.on + this.lead) {
      const v = (t - d.on) / this.lead;
      return out.set(this.centre + this.dir * (edge + FAR * v * v), LOW + CLIMB * v * v, 0);
    }
    if (t > d.period - this.lead) {
      const v = (d.period - t) / this.lead;
      return out.set(this.centre - this.dir * (edge + FAR * v * v), LOW + CLIMB * v * v, 0);
    }
    return null;
  }

  /** Poses the ship for race time `time`. */
  pose(time: number): void {
    const d = this.hazard.def;
    const t = cycleTime(time, d.period, d.phase);
    const a = this.place(t, this.p);
    const b = this.place(cycleTime(time + 0.1, d.period, d.phase), this.q);
    if (!a) {
      this.holder.scale.setScalar(0);
      return;
    }
    const k = this.frame.k;
    this.binding.toLocal(this.sMid, a.x, a.y, this.p);
    if (b) this.binding.toLocal(this.sMid, b.x, b.y, this.q);
    // Nose along its track over the ground, pitched by the climb but never steeper than 25°.
    this.fwd.copy(this.push);
    if (b) {
      this.q.sub(this.p);
      const climb = this.q.dot(this.up) / Math.max(1e-3, Math.abs(this.q.dot(this.push)));
      this.fwd.addScaledVector(this.up, THREE.MathUtils.clamp(climb, -0.45, 0.45));
    }
    aim(this.holder, this.p, this.fwd, this.up);
    this.holder.scale.setScalar(k);
    const pushing = t < d.on;
    const flick = 0.85 + 0.15 * Math.sin(time * 37);
    this.craft.lift.scale.set(1, (pushing ? 1.4 : 0.7) * flick, 1);
    this.craft.main.scale.set(1, 1, Math.max(0.001, (t > d.on ? 1 : 0.25) * flick));
  }

  /** Lamps from fixed slot `first` (returns the next), and the downdraft's dust across the road. */
  effects(time: number, dt: number, rig: Rig, glow: Particles, smoke: Particles, first: number, warm: THREE.Color, evt: () => number): number {
    let li = first;
    const shown = this.holder.scale.x > 0;
    for (let i = 0; i < LAMPS; i++) {
      const n = this.craft.liftNozzles[i];
      if (!shown || !n) {
        glow.lamp(li++, 0, -1000, 0, 0, warm, 0);
        continue;
      }
      rig.local(this.craft.body, n.x, n.y - 4, n.z, this.p);
      glow.lamp(li++, this.p.x, this.p.y, this.p.z, 22 * SHIP_SCALE * this.frame.k * this.craft.lift.scale.y, warm, 0.8);
    }
    const d = this.hazard.def;
    const power = Math.abs(gustStrength(d, time)) / Math.abs(d.strength);
    if (dt <= 0 || power <= 0) return li;
    const k = this.frame.k;
    this.acc += dt;
    while (this.acc > EMIT_STEP) {
      this.acc -= EMIT_STEP;
      // Blown flat across the course in the push's direction, thicker as the push peaks.
      for (let n = 0; n < Math.ceil(power * 3); n++) {
        const h = this.hazard;
        this.binding.toLocal(h.s0 + (h.s1 - h.s0) * evt(), h.minX - 8 + (h.maxX - h.minX + 16) * evt(), 1 + evt() * 3, this.p);
        const sp = (18 + evt() * 16) * k;
        smoke.emit(this.blast, this.p.x, this.p.y, this.p.z, this.push.x * sp + this.up.x * 2 * k, this.push.y * sp + this.up.y * 2 * k, this.push.z * sp + this.up.z * 2 * k);
      }
    }
    return li;
  }
}

export const GUST_LAMPS = LAMPS;
