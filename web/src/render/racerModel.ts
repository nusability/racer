// A racer's 3D model plus its own effects (exhaust, binder, smoke). The race integrator places and
// orients `root` in the world; everything here is in craft space (forward −Z, up +Y).
//
// Draw calls per racer: hull, glow, pod, canopy, flaps, flames, binder, cables, halos, smoke = 10.
import * as THREE from 'three';
import type { RacerVisual } from '../core/types.ts';
import { buildBlueprint } from './racerStyles.ts';
import type { Blueprint, NozzleSpec } from './racerBlueprint.ts';
import { BinderBeams, CableRibbons, createFlameGeometry } from './racerFx.ts';
import { SoftPointBuffer } from './softPoints.ts';

export interface RacerViewState {
  speed: number;
  topSpeed: number;
  boosting: boolean;
  heat: number;
  damage: number;
  steer: number;
  airborne: boolean;
  crashed: boolean;
}

export interface RacerModel {
  root: THREE.Group;
  update(dt: number, time: number, v: RacerViewState): void;
  dispose(): void;
}

// --- Tunables -------------------------------------------------------------------------------
/** Flame length in metres: idle + per unit of speed/topSpeed, times (1 + boost multiplier). */
const FLAME_IDLE_LENGTH = 0.9;
const FLAME_SPEED_LENGTH = 3.2;
const FLAME_BOOST_MULT = 0.75;
const FLAME_BOOST_WIDEN = 0.3;
const FLAME_CORE_LENGTH = 0.5;
const FLAME_CORE_WIDTH = 0.5;
/** Additive brightness of the outer flame and the hot core; boost brightens both. */
const FLAME_OUTER_GAIN = 0.42;
const FLAME_CORE_GAIN = 0.6;
const FLAME_BOOST_GAIN = 0.25;
/** How far the inner core leans toward white-hot. */
const FLAME_CORE_WHITE = 0.4;
/** Exhaust/heat colours: hot engines drift toward HEAT_COLOR; boost toward white-hot. */
const HEAT_COLOR = new THREE.Color(0xff3c12);
const HEAT_TINT_MAX = 0.85;
const BOOST_WHITEN = 0.2;
/** How quickly smoothed inputs follow the sim (1/s). */
const BOOST_RESPONSE = 7;
const STEER_RESPONSE = 6;
/** Hover bob (m) and high-speed rattle (m at top speed). */
const HOVER_BOB = 0.06;
const HOVER_RATTLE = 0.035;
const AIRBORNE_RATTLE_SCALE = 0.3;
/** The pod swings outward against a turn and banks into it. */
const POD_SWAY_X = 0.35;
const POD_SWAY_YAW = 0.09;
const POD_BANK = 0.16;
/** Nozzle halo sprite size as a multiple of nozzle radius. */
const HALO_SIZE = 4.2;
const HALO_BOOST_GROW = 0.8;
const EMITTER_HALO_SIZE = 0.7;
const NOZZLE_HALO_ALPHA = 0.85;
const EMITTER_HALO_ALPHA = 0.9;
/** The pod's own thruster is a small trim jet: keep it from upstaging the engines. */
const POD_HALO_SCALE = 0.55;
/** Damage: hull darkens toward DAMAGE_TINT; smoke starts above DAMAGE_SMOKE_FROM. */
const DAMAGE_TINT = new THREE.Color(0x2a2522);
const DAMAGE_TINT_MAX = 0.75;
const DAMAGE_SMOKE_FROM = 0.3;
/** Smoke puffs per second at full damage / while crashed. */
const SMOKE_RATE_DAMAGE = 26;
const SMOKE_RATE_CRASHED = 40;
const SMOKE_LIFE = 0.9;
const SMOKE_SIZE_START = 0.5;
const SMOKE_SIZE_END = 3.2;
const SMOKE_POOL = { high: 40, low: 16 } as const;
const SMOKE_DARK = new THREE.Color(0x1c1a19);
const SMOKE_LIGHT = new THREE.Color(0x9a958e);
const SMOKE_SHADE_VARIATION = 0.25;
/** Share of forward speed a puff loses in craft space: 1 = left standing in the world, lower
 * keeps it entrained in the wake so the chase camera sees the trail. */
const SMOKE_DRAG_BEHIND = 0.55;

const UNIT_Z = new THREE.Vector3(0, 0, 1);
const WHITE = new THREE.Color(0xffffff);

const tmpMat = new THREE.Matrix4();
const tmpRot = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();
const tmpCore = new THREE.Color();
const tmpFlame = new THREE.Color();

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function createRacerModel(visual: RacerVisual, opts: { detail: 'high' | 'low' }): RacerModel {
  return new RacerModelImpl(visual, opts.detail);
}

class RacerModelImpl implements RacerModel {
  readonly root = new THREE.Group();
  private readonly craft = new THREE.Group();
  private readonly podGroup = new THREE.Group();
  private readonly bp: Blueprint;
  private readonly hullMat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
  private readonly canopyMat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private readonly flameMat: THREE.MeshBasicMaterial;
  private readonly binderMat: THREE.MeshBasicMaterial;
  private readonly flapGeo: THREE.BoxGeometry;
  private readonly flameGeo: THREE.BufferGeometry;
  private readonly flaps: THREE.InstancedMesh;
  private readonly flames: THREE.InstancedMesh;
  private readonly binder: BinderBeams;
  private readonly cables: CableRibbons;
  private readonly halos: SoftPointBuffer;
  private readonly smoke: SoftPointBuffer;
  private readonly glowColor: THREE.Color;
  /** Every exhaust in craft space; pod thrusters are re-derived each frame from the pod pose. */
  private readonly allNozzles: NozzleSpec[];
  private readonly smokeVel: Float32Array;
  private readonly smokeLife: Float32Array;
  private readonly smokeTint: Float32Array;
  private smokeNext = 0;
  private smokeCarry = 0;
  private boost = 0;
  private steer = 0;

  constructor(visual: RacerVisual, detail: 'high' | 'low') {
    this.bp = buildBlueprint(visual, detail);
    this.glowColor = new THREE.Color(visual.glow);
    const lit = detail === 'high'
      ? new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.62, metalness: 0.18, side: THREE.DoubleSide })
      : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    this.hullMat = lit;
    this.canopyMat = detail === 'high'
      ? new THREE.MeshStandardMaterial({ color: 0x4a7088, roughness: 0.15, metalness: 0.35, flatShading: true, emissive: 0x10222e })
      : new THREE.MeshLambertMaterial({ color: 0x4a7088, flatShading: true, emissive: 0x10222e });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    // Additive blending is order independent, so double-sided needs no separate back-face pass.
    const additive = {
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, toneMapped: false, forceSinglePass: true,
    } as const;
    this.flameMat = new THREE.MeshBasicMaterial(additive);
    this.binderMat = new THREE.MeshBasicMaterial({ ...additive, color: this.glowColor });

    this.root.add(this.craft);
    this.craft.add(new THREE.Mesh(this.bp.hull, this.hullMat));
    this.craft.add(new THREE.Mesh(this.bp.glow, this.glowMat));
    this.podGroup.position.copy(this.bp.podPivot);
    this.podGroup.add(new THREE.Mesh(this.bp.pod, this.hullMat));
    this.podGroup.add(new THREE.Mesh(this.bp.canopy, this.canopyMat));
    this.craft.add(this.podGroup);

    // Flaps: a unit box hinged at its leading edge, one instance each.
    this.flapGeo = new THREE.BoxGeometry(1, 1, 1);
    this.flapGeo.translate(0, 0, 0.5);
    this.flapGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.flapGeo.getAttribute('position').count * 3).fill(1), 3));
    this.flaps = new THREE.InstancedMesh(this.flapGeo, this.hullMat, Math.max(1, this.bp.flaps.length));
    this.bp.flaps.forEach((f, i) => this.flaps.setColorAt(i, tmpColor.setHex(f.color)));
    this.flaps.count = this.bp.flaps.length;
    this.flaps.frustumCulled = false;
    this.craft.add(this.flaps);

    this.allNozzles = [...this.bp.nozzles, ...this.bp.podNozzles.map((n) => ({ pos: n.pos.clone(), dir: n.dir.clone(), radius: n.radius }))];
    this.flameGeo = createFlameGeometry(detail);
    this.flames = new THREE.InstancedMesh(this.flameGeo, this.flameMat, this.allNozzles.length * 2);
    this.flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flames.frustumCulled = false;
    for (let i = 0; i < this.flames.count; i++) this.flames.setColorAt(i, WHITE);
    this.craft.add(this.flames);

    this.binder = new BinderBeams(this.bp.binders, detail, this.binderMat);
    this.craft.add(this.binder.mesh);
    this.cables = new CableRibbons(this.bp.cables, detail, this.hullMat);
    this.craft.add(this.cables.mesh);

    const emitterCount = this.bp.binders.length * 2;
    this.halos = new SoftPointBuffer(this.allNozzles.length + emitterCount, 'additive', 2.2);
    this.bp.binders.forEach(([a, b], i) => {
      const base = this.allNozzles.length + i * 2;
      this.halos.position.set([a.x, a.y, a.z, b.x, b.y, b.z], base * 3);
    });
    this.craft.add(this.halos.points);

    const pool = SMOKE_POOL[detail];
    this.smoke = new SoftPointBuffer(pool, 'normal', 0.8);
    this.smokeVel = new Float32Array(pool * 3);
    this.smokeLife = new Float32Array(pool);
    this.smokeTint = new Float32Array(pool);
    this.craft.add(this.smoke.points);
  }

  update(dt: number, time: number, v: RacerViewState): void {
    const speedFrac = v.topSpeed > 0 ? Math.max(0, v.speed / v.topSpeed) : 0;
    this.boost += ((v.boosting && !v.crashed ? 1 : 0) - this.boost) * clamp01(dt * BOOST_RESPONSE);
    this.steer += (v.steer - this.steer) * clamp01(dt * STEER_RESPONSE);

    this.updatePose(time, speedFrac, v.airborne);
    this.updateFlaps();
    const thrust = this.updateExhaust(time, speedFrac, v);
    this.cables.update(this.podGroup.matrix, time);
    this.binder.mesh.visible = !v.crashed;
    if (!v.crashed) this.binder.update(dt, time, clamp01(0.3 + this.boost * 0.7 + speedFrac * 0.2));
    this.binderMat.color.copy(this.glowColor).multiplyScalar(0.85 + Math.sin(time * 37) * 0.15 + this.boost * 0.4);
    this.updateHalos(thrust, v.crashed);
    this.updateSmoke(dt, v);

    this.hullMat.color.copy(WHITE).lerp(DAMAGE_TINT, clamp01(v.damage) * DAMAGE_TINT_MAX);
  }

  private updatePose(time: number, speedFrac: number, airborne: boolean): void {
    const rattle = HOVER_RATTLE * Math.min(1.3, speedFrac) * (airborne ? AIRBORNE_RATTLE_SCALE : 1);
    // Incommensurate sines give an organic hover without per-frame randomness.
    this.craft.position.y = Math.sin(time * 2.1) * HOVER_BOB
      + (Math.sin(time * 31.7) + Math.sin(time * 47.3 + 1.1)) * 0.5 * rattle;
    this.craft.rotation.z = Math.sin(time * 1.7) * 0.012 + Math.sin(time * 23.1) * rattle * 0.25;
    this.craft.rotation.x = Math.sin(time * 1.3 + 0.7) * 0.008;
    const p = this.bp.podPivot;
    this.podGroup.position.set(p.x - this.steer * POD_SWAY_X, p.y + Math.sin(time * 2.6 + 1) * 0.05, p.z);
    this.podGroup.rotation.set(Math.sin(time * 1.9) * 0.02, -this.steer * POD_SWAY_YAW, -this.steer * POD_BANK + Math.sin(time * 2.3) * 0.015);
    this.podGroup.updateMatrix();
  }

  private updateFlaps(): void {
    const flaps = this.bp.flaps;
    for (let i = 0; i < flaps.length; i++) {
      const f = flaps[i];
      tmpRot.makeRotationAxis(f.axis, f.gain * this.steer);
      tmpMat.multiplyMatrices(f.base, tmpRot).scale(f.size);
      this.flaps.setMatrixAt(i, tmpMat);
    }
    this.flaps.instanceMatrix.needsUpdate = true;
  }

  /** Returns the shared thrust factor (0 = flames out) for the halos. */
  private updateExhaust(time: number, speedFrac: number, v: RacerViewState): number {
    const engines = this.bp.nozzles.length;
    for (let i = 0; i < this.bp.podNozzles.length; i++) {
      const src = this.bp.podNozzles[i];
      const dst = this.allNozzles[engines + i];
      dst.pos.copy(src.pos).applyMatrix4(this.podGroup.matrix);
      dst.dir.copy(src.dir).transformDirection(this.podGroup.matrix);
    }
    // Nozzle colour: glow → heat red; boost pushes it toward white-hot.
    const heatTint = Math.pow(clamp01(v.heat), 2) * HEAT_TINT_MAX;
    tmpColor.copy(this.glowColor).lerp(HEAT_COLOR, heatTint);
    tmpColor.lerp(WHITE, this.boost * BOOST_WHITEN);
    this.glowMat.color.copy(tmpColor).multiplyScalar(v.crashed ? 0.15 : 1);
    tmpCore.copy(tmpColor).lerp(WHITE, FLAME_CORE_WHITE).multiplyScalar(FLAME_CORE_GAIN + this.boost * FLAME_BOOST_GAIN);
    tmpFlame.copy(tmpColor).multiplyScalar(FLAME_OUTER_GAIN + this.boost * FLAME_BOOST_GAIN);

    const thrust = v.crashed ? 0 : 1;
    const baseLen = (FLAME_IDLE_LENGTH + FLAME_SPEED_LENGTH * Math.min(1, speedFrac)) * (1 + this.boost * FLAME_BOOST_MULT);
    const widen = 1 + this.boost * FLAME_BOOST_WIDEN;
    for (let i = 0; i < this.allNozzles.length; i++) {
      const n = this.allNozzles[i];
      const isPod = i >= engines;
      let gate = thrust;
      if (v.damage > 0.6) {
        // A wrecked engine coughs: brief dips in thrust.
        gate *= Math.sin(time * 17 + i * 3.3) + Math.sin(time * 29 + i) > 1.4 ? 0.35 : 1;
      }
      const shimmer = 1 + 0.08 * Math.sin(time * 47 + i * 1.7) + 0.05 * Math.sin(time * 73 + i)
        + this.boost * 0.14 * Math.sin(time * 91 + i * 2.3);
      const len = baseLen * shimmer * gate * (isPod ? 0.4 : 1) + 0.001;
      const r = n.radius * widen * (0.95 + 0.05 * Math.sin(time * 61 + i));
      tmpQuat.setFromUnitVectors(UNIT_Z, n.dir);
      tmpScale.set(r, r, len);
      tmpMat.compose(n.pos, tmpQuat, tmpScale);
      this.flames.setMatrixAt(i * 2, tmpMat);
      this.flames.setColorAt(i * 2, tmpFlame);
      tmpScale.set(r * FLAME_CORE_WIDTH, r * FLAME_CORE_WIDTH, len * FLAME_CORE_LENGTH);
      tmpMat.compose(n.pos, tmpQuat, tmpScale);
      this.flames.setMatrixAt(i * 2 + 1, tmpMat);
      this.flames.setColorAt(i * 2 + 1, tmpCore);
    }
    this.flames.instanceMatrix.needsUpdate = true;
    if (this.flames.instanceColor) this.flames.instanceColor.needsUpdate = true;
    return thrust;
  }

  private updateHalos(thrust: number, crashed: boolean): void {
    const h = this.halos;
    const nozzles = this.allNozzles;
    const glow = this.glowMat.color;
    for (let i = 0; i < nozzles.length; i++) {
      const n = nozzles[i];
      tmpPos.copy(n.pos).addScaledVector(n.dir, n.radius * 0.6);
      h.position[i * 3] = tmpPos.x;
      h.position[i * 3 + 1] = tmpPos.y;
      h.position[i * 3 + 2] = tmpPos.z;
      h.color[i * 3] = glow.r;
      h.color[i * 3 + 1] = glow.g;
      h.color[i * 3 + 2] = glow.b;
      h.size[i] = n.radius * HALO_SIZE * (1 + this.boost * HALO_BOOST_GROW) * (i >= this.bp.nozzles.length ? POD_HALO_SCALE : 1);
      h.alpha[i] = thrust * NOZZLE_HALO_ALPHA;
    }
    for (let i = nozzles.length; i < h.alpha.length; i++) {
      h.color[i * 3] = this.glowColor.r;
      h.color[i * 3 + 1] = this.glowColor.g;
      h.color[i * 3 + 2] = this.glowColor.b;
      h.size[i] = EMITTER_HALO_SIZE * (1 + this.boost * 0.5);
      h.alpha[i] = crashed ? 0 : EMITTER_HALO_ALPHA;
    }
    h.commit();
  }

  private updateSmoke(dt: number, v: RacerViewState): void {
    let rate = 0;
    if (v.damage > DAMAGE_SMOKE_FROM) rate += SMOKE_RATE_DAMAGE * (v.damage - DAMAGE_SMOKE_FROM) / (1 - DAMAGE_SMOKE_FROM);
    if (v.crashed) rate += SMOKE_RATE_CRASHED;
    const pool = this.smokeLife.length;
    this.smokeCarry += rate * dt;
    const behind = v.speed * SMOKE_DRAG_BEHIND;
    while (this.smokeCarry >= 1) {
      this.smokeCarry -= 1;
      const i = this.smokeNext;
      this.smokeNext = (i + 1) % pool;
      const n = this.allNozzles[Math.floor(Math.random() * this.bp.nozzles.length)];
      tmpDir.copy(n.dir);
      this.smoke.position[i * 3] = n.pos.x + (Math.random() - 0.5) * n.radius;
      this.smoke.position[i * 3 + 1] = n.pos.y + (Math.random() - 0.5) * n.radius;
      this.smoke.position[i * 3 + 2] = n.pos.z;
      this.smokeVel[i * 3] = tmpDir.x * 4 + (Math.random() - 0.5) * 2;
      this.smokeVel[i * 3 + 1] = 1.2 + Math.random() * 1.5;
      this.smokeVel[i * 3 + 2] = tmpDir.z * 4 + behind;
      this.smokeLife[i] = SMOKE_LIFE * (0.7 + Math.random() * 0.6);
      // Slight per-puff shade variation keeps the oily trail from reading as one flat blob.
      this.smokeTint[i] = Math.random() * SMOKE_SHADE_VARIATION;
    }
    for (let i = 0; i < pool; i++) {
      const life = this.smokeLife[i];
      if (life <= 0) {
        this.smoke.alpha[i] = 0;
        continue;
      }
      const left = life - dt;
      this.smokeLife[i] = left;
      const t = 1 - Math.max(0, left) / SMOKE_LIFE;
      this.smoke.position[i * 3] += this.smokeVel[i * 3] * dt;
      this.smoke.position[i * 3 + 1] += this.smokeVel[i * 3 + 1] * dt;
      this.smoke.position[i * 3 + 2] += this.smokeVel[i * 3 + 2] * dt;
      this.smoke.size[i] = SMOKE_SIZE_START + (SMOKE_SIZE_END - SMOKE_SIZE_START) * t;
      this.smoke.alpha[i] = left > 0 ? 0.55 * (1 - t) * Math.min(1, t * 8) : 0;
      tmpColor.copy(SMOKE_DARK).lerp(SMOKE_LIGHT, this.smokeTint[i]);
      this.smoke.color[i * 3] = tmpColor.r;
      this.smoke.color[i * 3 + 1] = tmpColor.g;
      this.smoke.color[i * 3 + 2] = tmpColor.b;
    }
    this.smoke.commit();
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const g of [this.bp.hull, this.bp.glow, this.bp.pod, this.bp.canopy, this.flapGeo, this.flameGeo]) g.dispose();
    for (const m of [this.hullMat, this.canopyMat, this.glowMat, this.flameMat, this.binderMat]) m.dispose();
    this.flaps.dispose();
    this.flames.dispose();
    this.binder.dispose();
    this.cables.dispose();
    this.halos.dispose();
    this.smoke.dispose();
  }
}
