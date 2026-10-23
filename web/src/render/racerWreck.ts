// The wreck of one skimmer: its breakable parts (skin bones, see racerBlueprint.ts) fly apart as
// rigid debris that tumbles, bounces and skids, trailing fire and black smoke, then burns down to
// a smoulder. Everything is preallocated per racer; nothing allocates once a wreck is running.
//
// The simulation runs in the "wreck frame": world-aligned axes centred on the model root, so
// gravity is −Y and the ground is a plane at `groundY`. It is written for slow motion: all motion
// integrates with the given dt, particles fade in, and emission carries fractional counts, so a
// 0.2× replay looks like the same wreck, just slower.
import * as THREE from 'three';
import type { PartSpec, Detail } from './racerBlueprint.ts';
import { ParticlePool } from './particlePool.ts';

export type WreckKind = 'impact' | 'fall' | 'explode';

// --- Tunables -------------------------------------------------------------------------------
const GRAVITY = 16;
/** Share of the racer's velocity the debris keeps: all of it would scatter parts hundreds of
 * metres down the track, out of the wreck camera's shot. */
const IMPULSE_CARRY = 0.38;
/** Outward burst speed (m/s) per kind, and the upward kick. */
const BURST = { impact: [5, 12], fall: [2, 6], explode: [12, 26] } as const;
const LIFT = { impact: [3, 9], fall: [0, 2], explode: [6, 15] } as const;
/** Canopies pop off upward: the most readable "it came apart" beat. */
const CANOPY_POP = 7;
/** Tumble rate (rad/s) for a part of size 1 m; smaller parts spin faster. */
const SPIN = [2, 7] as const;
/** Parts let go in sequence from the point of impact over this long (s): a visible rip. */
const RELEASE_SPREAD = 0.14;
const EXPLODE_RELEASE_DELAY = 0.06;
/** Ground contact. */
const BOUNCE = 0.32;
const SKID_DECEL = 26;
const GROUND_SPIN_DAMP = 3;
const SETTLE_SPEED = 0.6;
const CONTACT_SINK = 0.35;
const SPARK_IMPACT_SPEED = 4;
/** Falls: parts shrink away into the void after this long (s), over FALL_SHRINK seconds. */
const FALL_FADE_AT = 2.6;
const FALL_SHRINK = 1.2;
/** Burning: full fire for BURN_HOLD s, then decays (time constant BURN_DECAY) to a smoulder. */
const BURN_HOLD = 1.4;
const BURN_DECAY = 2.2;
const SMOULDER = 0.14;
/** Falling wrecks smoke and flicker rather than blaze: nothing hit hard enough to burst. */
const FALL_BURN = 0.35;
const BURN_END = 14;
const BURN_BY_KIND = { body: 1, fan: 1, wing: 0.7, ring: 0.6, fin: 0.35, canopy: 0.3 } as const;
/** Particles per second per metre of part size at full burn. */
const FIRE_RATE = { high: 26, low: 12 } as const;
const SMOKE_RATE = { high: 10, low: 5 } as const;
const FIRE_POOL = { high: 360, low: 150 } as const;
const SMOKE_POOL = { high: 320, low: 140 } as const;
const FIRE_COLORS = [new THREE.Color(0xfff0b0), new THREE.Color(0xffa030), new THREE.Color(0xff5a14), new THREE.Color(0xd6300c)];
const SMOKE_COLOR = new THREE.Color(0x161312);
const SPARK_COLOR = new THREE.Color(0xffd27a);
/** How long the fan discs take to spin down (time constant, s). */
const FAN_SPINDOWN = 1.3;

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpAxis = new THREE.Vector3();
const tmpCentre = new THREE.Vector3();
const tmpQuatCraft = new THREE.Quaternion();
const tmpScaleCraft = new THREE.Vector3();
const UNIT = new THREE.Vector3(1, 1, 1);

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomUnit(out: THREE.Vector3): THREE.Vector3 {
  do out.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
  while (out.lengthSq() > 1 || out.lengthSq() < 1e-4);
  return out.normalize();
}

export class WreckSim {
  readonly fire: ParticlePool;
  readonly smoke: ParticlePool;
  /** Rest → wreck-frame transform of each part (identity while intact). */
  readonly partMatrix: THREE.Matrix4[];
  private readonly pos: THREE.Vector3[];
  private readonly quat: THREE.Quaternion[];
  private readonly vel: THREE.Vector3[];
  private readonly spin: THREE.Vector3[];
  private readonly kick: THREE.Vector3[];
  private readonly spinKick: THREE.Vector3[];
  private readonly release: Float32Array;
  private readonly burn: Float32Array;
  private readonly settled: Uint8Array;
  private readonly fireCarry: Float32Array;
  private readonly smokeCarry: Float32Array;
  private readonly restInverse: THREE.Matrix4[];
  private groundY = 0;
  private hasGround = true;
  private fanAngle = 0;
  age = 0;
  active = false;

  constructor(
    private readonly parts: PartSpec[],
    private readonly bones: THREE.Bone[],
    private readonly detail: Detail,
  ) {
    const n = parts.length;
    const vecs = () => parts.map(() => new THREE.Vector3());
    this.pos = vecs();
    this.vel = vecs();
    this.spin = vecs();
    this.kick = vecs();
    this.spinKick = vecs();
    this.quat = parts.map(() => new THREE.Quaternion());
    this.partMatrix = parts.map(() => new THREE.Matrix4());
    this.restInverse = parts.map((p) => new THREE.Matrix4().makeTranslation(-p.centre.x, -p.centre.y, -p.centre.z));
    this.release = new Float32Array(n);
    this.burn = new Float32Array(n);
    this.settled = new Uint8Array(n);
    this.fireCarry = new Float32Array(n);
    this.smokeCarry = new Float32Array(n);
    this.fire = new ParticlePool(FIRE_POOL[detail], 'additive', 1.6);
    this.smoke = new ParticlePool(SMOKE_POOL[detail], 'normal', 0.8);
    // Fire draws over its own smoke.
    this.smoke.buf.points.renderOrder = 2;
    this.fire.buf.points.renderOrder = 3;
    this.fire.buf.points.visible = false;
    this.smoke.buf.points.visible = false;
  }

  /**
   * `impulse`: the racer's velocity at the crash (m/s, wreck frame = world axes).
   * `craftPose`: where the intact craft sits in the wreck frame.
   * `groundY`: ground height in the wreck frame, or null for a fall into the void.
   */
  start(kind: WreckKind, impulse: THREE.Vector3, craftPose: THREE.Matrix4, groundY: number | null): void {
    this.hasGround = groundY !== null;
    this.groundY = groundY ?? 0;
    this.age = 0;
    this.active = true;
    this.fanAngle = 0;
    craftPose.decompose(tmpCentre, tmpQuatCraft, tmpScaleCraft);
    // Parts nearest the leading edge of the impact rip away first.
    const lead = tmpAxis.copy(impulse).normalize();
    let minLead = Infinity;
    let maxLead = -Infinity;
    for (let i = 0; i < this.parts.length; i++) {
      this.pos[i].copy(this.parts[i].centre).applyMatrix4(craftPose);
      const d = this.pos[i].dot(lead);
      minLead = Math.min(minLead, d);
      maxLead = Math.max(maxLead, d);
    }
    const burst = BURST[kind];
    const lift = LIFT[kind];
    for (let i = 0; i < this.parts.length; i++) {
      const part = this.parts[i];
      this.quat[i].copy(tmpQuatCraft);
      this.vel[i].copy(impulse).multiplyScalar(IMPULSE_CARRY);
      this.spin[i].set(0, 0, 0);
      // Outward from the craft centre, roughened so mirrored parts don't fly symmetrically.
      tmpV.subVectors(this.pos[i], tmpCentre);
      tmpV.y *= 0.3;
      if (tmpV.lengthSq() < 1e-4) randomUnit(tmpV);
      tmpV.normalize().add(randomUnit(this.kick[i]).multiplyScalar(0.45)).normalize();
      const light = 1 / Math.max(0.7, part.size);
      this.kick[i].copy(tmpV).multiplyScalar(rand(burst[0], burst[1]) * Math.sqrt(light));
      this.kick[i].y += rand(lift[0], lift[1]) + (part.kind === 'canopy' ? CANOPY_POP : 0);
      randomUnit(this.spinKick[i]).multiplyScalar(rand(SPIN[0], SPIN[1]) * light * (kind === 'explode' ? 1.5 : 1));
      const order = maxLead > minLead ? (maxLead - this.pos[i].dot(lead)) / (maxLead - minLead) : 0;
      this.release[i] = order * RELEASE_SPREAD + (kind === 'explode' ? EXPLODE_RELEASE_DELAY : 0);
      this.burn[i] = BURN_BY_KIND[part.kind] * (kind === 'fall' ? FALL_BURN : 1);
      this.settled[i] = 0;
      this.fireCarry[i] = 0;
      this.smokeCarry[i] = 0;
      this.bones[i].scale.copy(UNIT);
    }
    this.fire.buf.points.visible = true;
    this.smoke.buf.points.visible = true;
    this.initialBurst(kind, tmpCentre, impulse);
    this.writeBones();
  }

  private initialBurst(kind: WreckKind, centre: THREE.Vector3, impulse: THREE.Vector3): void {
    // Going over an edge is a scrape and a tumble, not a blast: sparks only.
    if (kind === 'fall') {
      this.sparks(centre, impulse, 24);
      return;
    }
    const n = Math.round((kind === 'explode' ? 50 : 16) * (this.detail === 'high' ? 1 : 0.5));
    const big = kind === 'explode' ? 2.2 : 1;
    for (let i = 0; i < n; i++) {
      randomUnit(tmpV);
      const c = FIRE_COLORS[i % FIRE_COLORS.length];
      this.fire.spawn(
        centre.x + tmpV.x * 1.5, centre.y + tmpV.y * 0.8, centre.z + tmpV.z * 1.5,
        impulse.x * IMPULSE_CARRY * 0.6 + tmpV.x * 9 * big, tmpV.y * 5 * big + 3, impulse.z * IMPULSE_CARRY * 0.6 + tmpV.z * 9 * big,
        rand(0.5, 1.1), rand(1.2, 2.2) * big, rand(3, 6) * big, c, 0.85, 2.6, -3,
      );
    }
    this.sparks(centre, impulse, kind === 'explode' ? 50 : 30);
  }

  private sparks(at: THREE.Vector3, vel: THREE.Vector3, count: number): void {
    const n = Math.round(count * (this.detail === 'high' ? 1 : 0.5));
    for (let i = 0; i < n; i++) {
      randomUnit(tmpV);
      this.fire.spawn(
        at.x, at.y, at.z,
        vel.x * 0.4 + tmpV.x * 16, Math.abs(tmpV.y) * 12 + 2, vel.z * 0.4 + tmpV.z * 16,
        rand(0.25, 0.6), rand(0.14, 0.24), 0.04, SPARK_COLOR, 1, 1.5, 22,
      );
    }
  }

  update(dt: number): void {
    if (!this.active) return;
    this.age += dt;
    this.fanAngle += dt * 40 * Math.exp(-this.age / FAN_SPINDOWN);
    for (let i = 0; i < this.parts.length; i++) {
      this.integrate(i, dt);
      this.emit(i, dt);
    }
    this.writeBones();
    this.fire.update(dt);
    this.smoke.update(dt);
  }

  private integrate(i: number, dt: number): void {
    const pos = this.pos[i];
    const vel = this.vel[i];
    const spin = this.spin[i];
    const size = this.parts[i].size;
    if (this.release[i] > 0) {
      this.release[i] -= dt;
      if (this.release[i] <= 0) {
        vel.add(this.kick[i]);
        spin.copy(this.spinKick[i]);
      }
    }
    if (this.settled[i]) return;
    vel.y -= GRAVITY * dt;
    pos.addScaledVector(vel, dt);
    const w = spin.length();
    if (w > 1e-4) {
      tmpQ.setFromAxisAngle(tmpAxis.copy(spin).divideScalar(w), w * dt);
      this.quat[i].premultiply(tmpQ);
    }
    if (this.hasGround) {
      const floor = this.groundY + size * CONTACT_SINK;
      if (pos.y < floor) {
        pos.y = floor;
        if (vel.y < 0) {
          const hit = -vel.y;
          vel.y = hit * BOUNCE;
          if (hit > SPARK_IMPACT_SPEED) {
            tmpV.set(pos.x, this.groundY + 0.1, pos.z);
            this.sparks(tmpV, vel, 8 + hit * 1.5);
            // A hard landing knocks the tumble into a new axis.
            spin.add(randomUnit(tmpAxis).multiplyScalar(hit * 0.15 / Math.max(0.7, size)));
          }
        }
        // Skidding: constant deceleration while touching, and the tumble scrubs off.
        const h = Math.hypot(vel.x, vel.z);
        if (h > 0) {
          const k = Math.max(0, h - SKID_DECEL * dt) / h;
          vel.x *= k;
          vel.z *= k;
          if (h > 12 && Math.random() < dt * 30) {
            tmpV.set(pos.x, this.groundY + 0.1, pos.z);
            this.sparks(tmpV, vel, 3);
          }
        }
        spin.multiplyScalar(Math.max(0, 1 - GROUND_SPIN_DAMP * dt));
        if (this.release[i] <= 0 && vel.lengthSq() < SETTLE_SPEED * SETTLE_SPEED && Math.abs(vel.y) < 1) {
          vel.set(0, 0, 0);
          spin.set(0, 0, 0);
          this.settled[i] = 1;
        }
      }
    } else if (this.age > FALL_FADE_AT) {
      this.bones[i].scale.setScalar(Math.max(0.001, 1 - (this.age - FALL_FADE_AT) / FALL_SHRINK));
    }
  }

  /** Burn level of part i now: full, then decaying to a smoulder, then out. */
  private burnLevel(i: number): number {
    if (this.age > BURN_END) return 0;
    const decay = this.age < BURN_HOLD ? 1 : SMOULDER + (1 - SMOULDER) * Math.exp(-(this.age - BURN_HOLD) / BURN_DECAY);
    return this.burn[i] * decay;
  }

  private emit(i: number, dt: number): void {
    const level = this.burnLevel(i);
    if (level <= 0) return;
    if (!this.hasGround && this.age > FALL_FADE_AT + FALL_SHRINK) return;
    const size = this.parts[i].size;
    const pos = this.pos[i];
    const vel = this.vel[i];
    this.fireCarry[i] += FIRE_RATE[this.detail] * level * size * dt;
    while (this.fireCarry[i] >= 1) {
      this.fireCarry[i] -= 1;
      randomUnit(tmpV).multiplyScalar(size * 0.45);
      const c = FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)];
      // Flames inherit some of the part's motion so a flying chunk drags a tail of fire.
      this.fire.spawn(
        pos.x + tmpV.x, pos.y + tmpV.y, pos.z + tmpV.z,
        vel.x * 0.55 + tmpV.x, vel.y * 0.55 + rand(1.5, 4), vel.z * 0.55 + tmpV.z,
        rand(0.3, 0.65), size * rand(0.5, 0.8), size * rand(1.2, 1.9) * (0.5 + level * 0.5), c, 0.9, 2.2, -4,
      );
    }
    this.smokeCarry[i] += SMOKE_RATE[this.detail] * (level + 0.25) * size * dt;
    while (this.smokeCarry[i] >= 1) {
      this.smokeCarry[i] -= 1;
      randomUnit(tmpV).multiplyScalar(size * 0.4);
      this.smoke.spawn(
        pos.x + tmpV.x, pos.y + tmpV.y + size * 0.3, pos.z + tmpV.z,
        vel.x * 0.3 + rand(-0.8, 0.8), vel.y * 0.3 + rand(1.5, 3.5), vel.z * 0.3 + rand(-0.8, 0.8),
        rand(2.2, 3.8), size * rand(0.9, 1.3), size * rand(3.5, 5.5), SMOKE_COLOR, 0.6, 0.9, -2.2,
      );
    }
  }

  private writeBones(): void {
    for (let i = 0; i < this.parts.length; i++) {
      this.bones[i].position.copy(this.pos[i]);
      this.bones[i].quaternion.copy(this.quat[i]);
      this.partMatrix[i].compose(this.pos[i], this.quat[i], this.bones[i].scale).multiply(this.restInverse[i]);
    }
  }

  /** Fan disc spin angle while wrecked (they wind down). */
  get fanSpin(): number {
    return this.fanAngle;
  }

  /** How bright the wreck's glow parts still are (embers dying out). */
  get glowLevel(): number {
    return Math.exp(-this.age / 0.9);
  }

  /** Back to intact: bones at rest, particles gone. */
  reset(): void {
    this.active = false;
    this.age = 0;
    for (let i = 0; i < this.parts.length; i++) {
      this.pos[i].copy(this.parts[i].centre);
      this.quat[i].identity();
      this.bones[i].scale.copy(UNIT);
    }
    this.writeBones();
    this.fire.clear();
    this.smoke.clear();
    this.fire.buf.points.visible = false;
    this.smoke.buf.points.visible = false;
  }

  dispose(): void {
    this.fire.dispose();
    this.smoke.dispose();
  }
}
