// A skimmer's 3D model plus its own effects (fans, jets, air cushion, spray, wingtip vortices,
// smoke). The race integrator places and orients `root` in the world at SKIMMER_RIDE_HEIGHT above
// the ground; everything here is in craft space (forward −Z, up +Y).
//
// Draw calls per racer: hull, glow, canopy, flaps, fan discs, jets, cushion, vortices, halos,
// particles = 10. While wrecked: hull, glow, canopy, flaps, fan discs, fire, smoke, particles.
//
// The hull, glow and canopy are skinned with one bone per breakable part (racerBlueprint.ts), so
// shatter() flings the real parts apart without extra meshes; see racerWreck.ts.
import * as THREE from 'three';
import type { RacerVisual } from '../core/types.ts';
import { buildBlueprint } from './racerStyles.ts';
import type { Blueprint } from './racerBlueprint.ts';
import { CushionSheet, VortexTrails, createFanDiscGeometry, createJetGeometry } from './racerFx.ts';
import { SoftPointBuffer } from './softPoints.ts';
import { ParticlePool } from './particlePool.ts';
import { SKIMMER_RIDE_HEIGHT } from './skimmerTuning.ts';
import { WreckSim, type WreckKind } from './racerWreck.ts';
import type { GliderFinishLook } from './look/lookTuning.ts';

/**
 * A world look's paint-over-metal finish: the hull and canopy reflect `envMap` (a PMREM of the
 * world, look/env.ts). High detail only; without it the craft is drawn as it always was.
 */
export interface GliderFinish {
  envMap: THREE.Texture;
  look: GliderFinishLook;
}

export interface RacerViewState {
  speed: number;
  topSpeed: number;
  boosting: boolean;
  /** 0..1: tints the fan glow toward hot red. */
  heat: number;
  damage: number;
  steer: number;
  airborne: boolean;
  crashed: boolean;
  /** Colour of the surface under the craft (sand, water, snow…): the cushion spray takes it. */
  groundColor?: number;
}

export interface ShatterOptions {
  kind: WreckKind;
  /** World height of the ground under the wreck; defaults to SKIMMER_RIDE_HEIGHT below the root.
   * Ignored for 'fall' (there is no ground). */
  groundY?: number;
}

export interface RacerModel {
  root: THREE.Group;
  /** True from shatter() until reset(). */
  readonly wrecked: boolean;
  update(dt: number, time: number, v: RacerViewState): void;
  /** Breaks the craft apart. `impulse`: its world velocity at the crash (m/s). Leave `root` where
   * it is afterwards (keep it visible, stop posing it) and keep calling update(). */
  shatter(impulse: THREE.Vector3, opts: ShatterOptions): void;
  /** Reassembles the craft, intact and clean. */
  reset(): void;
  dispose(): void;
}

// --- Tunables -------------------------------------------------------------------------------
/** Jet length (m): idle + per unit of speed/topSpeed, times (1 + boost multiplier). */
const JET_IDLE_LENGTH = 0.5;
const JET_SPEED_LENGTH = 1.7;
const JET_BOOST_MULT = 1.0;
const JET_WIDTH = 0.85;
const JET_BOOST_WIDEN = 0.25;
const JET_CORE_LENGTH = 0.55;
const JET_CORE_WIDTH = 0.45;
/** Additive brightness of the outer jet and its core; boost adds on top. */
const JET_OUTER_GAIN = 0.3;
const JET_CORE_GAIN = 0.55;
const JET_BOOST_GAIN = 0.25;
const JET_CORE_WHITE = 0.45;
/** Fan ring glow: dim at rest, brighter with speed, flaring on boost. */
const FAN_GLOW_IDLE = 0.55;
const FAN_GLOW_SPEED = 0.45;
const FAN_GLOW_BOOST = 0.5;
const BOOST_WHITEN = 0.15;
/** Fan disc spin (rad/s) and brightness. */
const FAN_SPIN_IDLE = 9;
const FAN_SPIN_SPEED = 30;
const FAN_DISC_GAIN = 0.35;
const FAN_DISC_BOOST = 0.4;
/** Hot fans drift toward HEAT_COLOR. */
const HEAT_COLOR = new THREE.Color(0xff4a1a);
const HEAT_TINT_MAX = 0.5;
/** How quickly smoothed inputs follow the sim (1/s). */
const BOOST_RESPONSE = 7;
const STEER_RESPONSE = 6;
const GROUND_RESPONSE = 5;
/** Hover bob (m) and high-speed rattle (m at top speed); airborne craft stop buzzing. */
const HOVER_BOB = 0.04;
const HOVER_RATTLE = 0.025;
const AIRBORNE_RATTLE_SCALE = 0.3;
/** The craft rolls into its turns a little on its own, on top of the sim's roll. */
const STEER_BANK = 0.06;
/** Wingtip vortex trail length (m): grows in from VORTEX_FROM of top speed. */
const VORTEX_LENGTH = 9;
const VORTEX_FROM = 0.35;
const VORTEX_BOOST = 0.5;
const VORTEX_COLOR = new THREE.Color(0xeaf4ff);
const VORTEX_GLOW_MIX = 0.25;
const VORTEX_GAIN = 0.3;
/** Air cushion shimmer under the hull. */
const CUSHION_BASE = 0.25;
const CUSHION_SPEED = 0.35;
const CUSHION_GROUND_MIX = 0.5;
const DEFAULT_GROUND = 0xd9cfbf;
/** Halo sprite size as a multiple of fan radius, and of marker lights (m). */
const HALO_SIZE = 3.4;
const HALO_BOOST_GROW = 0.5;
const HALO_ALPHA = 0.75;
const LIGHT_HALO_SIZE = 0.45;
const LIGHT_HALO_ALPHA = 0.85;
/** Damage: facets char past their scorch threshold; smoke starts above DAMAGE_SMOKE_FROM. */
const SCORCH_REACH = 1.0;
const SCORCH_DARKEN = 0.75;
const DAMAGE_SMOKE_FROM = 0.3;
const SMOKE_RATE_DAMAGE = 26;
const SMOKE_RATE_CRASHED = 40;
const SMOKE_LIFE = [0.6, 1.1] as const;
const SMOKE_SIZE = [0.5, 3.2] as const;
const SMOKE_COLOR = new THREE.Color(0x1f1c1b);
/** Smoke keeps this share of the ground's rush past the craft: below 1 it stays entrained in the
 * wake long enough for the chase camera to see the trail. */
const SMOKE_DRIFT = 0.55;
/** Cushion spray thrown off the skirt (puffs per second at top speed). */
const SPRAY_RATE = { high: 70, low: 30 } as const;
const SPRAY_LIFE = [0.3, 0.6] as const;
const SPRAY_SIZE = [0.35, 2.0] as const;
const SPRAY_ALPHA = 0.4;
const SPRAY_LIGHTEN = 0.25;
const SPRAY_DRIFT = 0.6;
const SPRAY_GRAVITY = 9.8;
const PARTICLE_POOL = { high: 140, low: 60 } as const;
/** Wreck: the hull chars over this long (s); glow parts cool to embers. */
const WRECK_CHAR_TIME = 1.2;
const EMBER_COLOR = new THREE.Color(0xff4a10);
const EMBER_FLOOR = 0.12;

const UNIT_Z = new THREE.Vector3(0, 0, 1);
const WHITE = new THREE.Color(0xffffff);

const tmpMat = new THREE.Matrix4();
const tmpRot = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();
const tmpCore = new THREE.Color();
const tmpJet = new THREE.Color();
const tmpGround = new THREE.Color();
const tmpPose = new THREE.Matrix4();
const tmpWorldQuat = new THREE.Quaternion();
const tmpWorldPos = new THREE.Vector3();

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** `finish` applies to high detail only (low-detail hulls are Lambert, which has no roughness to blur a reflection). */
export function createRacerModel(visual: RacerVisual, opts: { detail: 'high' | 'low'; finish: GliderFinish | null }): RacerModel {
  return new SkimmerModel(visual, opts.detail, opts.detail === 'high' ? opts.finish : null);
}

/** Hull material whose facets char toward black as `uScorch` (damage) passes their threshold. */
function scorchable<T extends THREE.MeshStandardMaterial | THREE.MeshLambertMaterial>(mat: T, uniform: { value: number }): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uScorch = uniform;
    shader.vertexShader = 'attribute float scorch;\nvarying float vScorch;\n'
      + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvScorch = scorch;');
    shader.fragmentShader = 'uniform float uScorch;\nvarying float vScorch;\n'
      + shader.fragmentShader.replace('#include <color_fragment>',
        `#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - clamp((uScorch * ${SCORCH_REACH.toFixed(2)} - vScorch) * 4.0, 0.0, 1.0) * ${SCORCH_DARKEN.toFixed(2)};`);
  };
  mat.customProgramCacheKey = () => 'scorch';
  return mat;
}

class SkimmerModel implements RacerModel {
  readonly root = new THREE.Group();
  /** World-aligned while wrecked (cancels the root's rotation), identity otherwise. */
  private readonly wreckFrame = new THREE.Group();
  private readonly craft = new THREE.Group();
  private readonly bones: THREE.Bone[];
  private readonly skeleton: THREE.Skeleton;
  private readonly wreck: WreckSim;
  private readonly bp: Blueprint;
  private readonly detail: 'high' | 'low';
  private readonly scorch = { value: 0 };
  private readonly hullMat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
  private readonly canopyMat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private readonly additiveMats: THREE.MeshBasicMaterial[];
  private readonly flapGeo: THREE.BoxGeometry;
  private readonly discGeo: THREE.BufferGeometry;
  private readonly jetGeo: THREE.BufferGeometry;
  private readonly flaps: THREE.InstancedMesh;
  private readonly discs: THREE.InstancedMesh;
  private readonly jets: THREE.InstancedMesh;
  private readonly vortexMat: THREE.MeshBasicMaterial;
  private readonly vortices: VortexTrails;
  private readonly cushion: CushionSheet;
  private readonly halos: SoftPointBuffer;
  private readonly particles: ParticlePool;
  private readonly glowColor: THREE.Color;
  private fanAngle = 0;
  private boost = 0;
  private steer = 0;
  private grounded = 1;
  private sprayCarry = 0;
  private smokeCarry = 0;

  constructor(visual: RacerVisual, detail: 'high' | 'low', finish: GliderFinish | null) {
    this.detail = detail;
    this.bp = buildBlueprint(visual, detail);
    this.glowColor = new THREE.Color(visual.glow);
    const f = finish?.look;
    this.hullMat = scorchable(detail === 'high'
      ? new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: f ? f.roughness : 0.5, metalness: f ? f.metalness : 0.2, side: THREE.DoubleSide })
      : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), this.scorch);
    this.canopyMat = detail === 'high'
      ? new THREE.MeshStandardMaterial({ color: 0x3f6a86, roughness: f ? f.canopyRoughness : 0.12, metalness: f ? f.canopyMetalness : 0.4, flatShading: true, emissive: 0x0e2230 })
      : new THREE.MeshLambertMaterial({ color: 0x3f6a86, flatShading: true, emissive: 0x0e2230 });
    if (finish && this.hullMat instanceof THREE.MeshStandardMaterial && this.canopyMat instanceof THREE.MeshStandardMaterial) {
      for (const m of [this.hullMat, this.canopyMat]) {
        m.envMap = finish.envMap;
        m.envMapIntensity = finish.look.envIntensity;
      }
    }
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    // Additive blending is order independent, so double-sided needs no separate back-face pass.
    const additive = () => new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, toneMapped: false, forceSinglePass: true,
    });
    const discMat = additive();
    const jetMat = additive();
    this.vortexMat = additive();
    this.additiveMats = [discMat, jetMat, this.vortexMat];

    this.root.add(this.wreckFrame);
    this.wreckFrame.add(this.craft);
    // One bone per breakable part, resting at the part's centre; the inverse bind matrix moves the
    // part's vertices to that pivot so the bone spins it about its own middle.
    this.bones = this.bp.parts.map((p) => {
      const bone = new THREE.Bone();
      bone.position.copy(p.centre);
      return bone;
    });
    this.craft.add(...this.bones);
    this.skeleton = new THREE.Skeleton(this.bones, this.bp.parts.map((p) => new THREE.Matrix4().makeTranslation(-p.centre.x, -p.centre.y, -p.centre.z)));
    ([[this.bp.hull, this.hullMat], [this.bp.glow, this.glowMat], [this.bp.canopy, this.canopyMat]] as const).forEach(([geo, mat]) => {
      const mesh = new THREE.SkinnedMesh(geo, mat);
      mesh.bind(this.skeleton, new THREE.Matrix4());
      // Debris flies far outside the rest bounds.
      mesh.frustumCulled = false;
      this.craft.add(mesh);
    });
    this.wreck = new WreckSim(this.bp.parts, this.bones, detail);
    this.wreck.reset();
    this.craft.add(this.wreck.smoke.buf.points, this.wreck.fire.buf.points);

    // Flaps: a unit box hinged at its leading edge, one instance each, sharing the hull look.
    this.flapGeo = new THREE.BoxGeometry(1, 1, 1);
    this.flapGeo.translate(0, 0, 0.5);
    const flapVerts = this.flapGeo.getAttribute('position').count;
    this.flapGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(flapVerts * 3).fill(1), 3));
    this.flapGeo.setAttribute('scorch', new THREE.BufferAttribute(new Float32Array(flapVerts).fill(0.5), 1));
    this.flaps = new THREE.InstancedMesh(this.flapGeo, this.hullMat, Math.max(1, this.bp.flaps.length));
    this.bp.flaps.forEach((f, i) => this.flaps.setColorAt(i, tmpColor.setHex(f.color)));
    this.flaps.count = this.bp.flaps.length;
    this.flaps.frustumCulled = false;
    this.craft.add(this.flaps);

    const fans = this.bp.fans.length;
    this.discGeo = createFanDiscGeometry(detail);
    this.discs = new THREE.InstancedMesh(this.discGeo, discMat, fans);
    this.jetGeo = createJetGeometry(detail);
    this.jets = new THREE.InstancedMesh(this.jetGeo, jetMat, fans * 2);
    for (const m of [this.discs, this.jets]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      for (let i = 0; i < m.count; i++) m.setColorAt(i, WHITE);
      this.craft.add(m);
    }

    this.cushion = new CushionSheet(this.bp.cushion, detail);
    this.vortices = new VortexTrails(this.bp.tips, detail, this.vortexMat);
    this.craft.add(this.cushion.mesh, this.vortices.mesh);

    this.halos = new SoftPointBuffer(fans + this.bp.lights.length, 'additive', 2.2);
    this.bp.fans.forEach((f, i) => this.halos.position.set([f.exit.x, f.exit.y, f.exit.z + 0.1], i * 3));
    this.bp.lights.forEach((l, i) => this.halos.position.set([l.x, l.y, l.z], (fans + i) * 3));
    this.particles = new ParticlePool(PARTICLE_POOL[detail], 'normal', 0.9);
    this.craft.add(this.halos.points, this.particles.buf.points);
  }

  get wrecked(): boolean {
    return this.wreck.active;
  }

  update(dt: number, time: number, v: RacerViewState): void {
    if (this.wreck.active) {
      this.updateWreck(dt);
      return;
    }
    const speedFrac = v.topSpeed > 0 ? Math.max(0, v.speed / v.topSpeed) : 0;
    this.boost += ((v.boosting && !v.crashed ? 1 : 0) - this.boost) * clamp01(dt * BOOST_RESPONSE);
    this.steer += (v.steer - this.steer) * clamp01(dt * STEER_RESPONSE);
    this.grounded += ((v.airborne || v.crashed ? 0 : 1) - this.grounded) * clamp01(dt * GROUND_RESPONSE);

    this.updatePose(time, speedFrac, v.airborne);
    this.updateFlaps();
    this.updateFans(dt, time, speedFrac, v);
    tmpGround.setHex(v.groundColor ?? DEFAULT_GROUND);
    tmpColor.copy(this.glowColor).lerp(tmpGround, CUSHION_GROUND_MIX);
    this.cushion.update(time, this.grounded * (CUSHION_BASE + CUSHION_SPEED * Math.min(1, speedFrac) + this.boost * 0.2), tmpColor);
    const vortexLen = v.crashed ? 0 : VORTEX_LENGTH * clamp01((speedFrac - VORTEX_FROM) / (1 - VORTEX_FROM)) * (1 + this.boost * VORTEX_BOOST);
    this.vortexMat.color.copy(VORTEX_COLOR).lerp(this.glowColor, VORTEX_GLOW_MIX).multiplyScalar(VORTEX_GAIN * (1 + this.boost * 0.5));
    this.vortices.update(time, vortexLen, this.steer);
    this.emitParticles(dt, speedFrac, v);
    this.particles.update(dt);
    this.scorch.value = clamp01(v.damage);
  }

  private updatePose(time: number, speedFrac: number, airborne: boolean): void {
    const rattle = HOVER_RATTLE * Math.min(1.3, speedFrac) * (airborne ? AIRBORNE_RATTLE_SCALE : 1);
    // Incommensurate sines give an organic hover without per-frame randomness.
    this.craft.position.y = Math.sin(time * 2.1) * HOVER_BOB
      + (Math.sin(time * 31.7) + Math.sin(time * 47.3 + 1.1)) * 0.5 * rattle;
    this.craft.rotation.z = -this.steer * STEER_BANK + Math.sin(time * 1.7) * 0.01 + Math.sin(time * 23.1) * rattle * 0.25;
    this.craft.rotation.x = Math.sin(time * 1.3 + 0.7) * 0.006;
  }

  private updateFlaps(): void {
    const flaps = this.bp.flaps;
    for (let i = 0; i < flaps.length; i++) {
      const f = flaps[i];
      tmpRot.makeRotationAxis(f.axis, f.gain * this.steer);
      tmpMat.multiplyMatrices(this.wreck.partMatrix[f.part], f.base).multiply(tmpRot).scale(f.size);
      this.flaps.setMatrixAt(i, tmpMat);
    }
    this.flaps.instanceMatrix.needsUpdate = true;
  }

  private updateFans(dt: number, time: number, speedFrac: number, v: RacerViewState): void {
    const s = Math.min(1, speedFrac);
    const alive = v.crashed ? 0 : 1;
    // Fan colour: glow → heat red; boost pushes it toward white-hot and flares the rings.
    tmpColor.copy(this.glowColor).lerp(HEAT_COLOR, Math.pow(clamp01(v.heat), 2) * HEAT_TINT_MAX).lerp(WHITE, this.boost * BOOST_WHITEN);
    this.glowMat.color.copy(tmpColor).multiplyScalar(alive * (FAN_GLOW_IDLE + FAN_GLOW_SPEED * s + FAN_GLOW_BOOST * this.boost));
    tmpCore.copy(tmpColor).lerp(WHITE, JET_CORE_WHITE).multiplyScalar(alive * (JET_CORE_GAIN + this.boost * JET_BOOST_GAIN));
    tmpJet.copy(tmpColor).multiplyScalar(alive * (JET_OUTER_GAIN + this.boost * JET_BOOST_GAIN));

    this.fanAngle = (this.fanAngle + dt * alive * (FAN_SPIN_IDLE + FAN_SPIN_SPEED * s) * (1 + this.boost * 0.5)) % (Math.PI * 2);
    const baseLen = (JET_IDLE_LENGTH + JET_SPEED_LENGTH * s) * (1 + this.boost * JET_BOOST_MULT);
    const widen = 1 + this.boost * JET_BOOST_WIDEN;
    const fans = this.bp.fans;
    for (let i = 0; i < fans.length; i++) {
      const f = fans[i];
      // Each fan gets its own phase so a row of discs doesn't strobe in lockstep.
      tmpQuat.setFromAxisAngle(UNIT_Z, this.fanAngle + i * 0.9);
      tmpScale.setScalar(f.radius * 0.97);
      this.discs.setMatrixAt(i, tmpMat.compose(f.pos, tmpQuat, tmpScale));
      this.discs.setColorAt(i, tmpColor.copy(this.glowMat.color).multiplyScalar(FAN_DISC_GAIN + this.boost * FAN_DISC_BOOST));

      let gate = 1;
      if (v.damage > 0.6) {
        // A wrecked fan coughs: brief dips in thrust.
        gate = Math.sin(time * 17 + i * 3.3) + Math.sin(time * 29 + i) > 1.4 ? 0.35 : 1;
      }
      const shimmer = 1 + 0.07 * Math.sin(time * 47 + i * 1.7) + 0.05 * Math.sin(time * 73 + i)
        + this.boost * 0.12 * Math.sin(time * 91 + i * 2.3);
      const len = baseLen * shimmer * gate + 0.001;
      const r = f.radius * JET_WIDTH * widen;
      tmpQuat.setFromUnitVectors(UNIT_Z, f.dir);
      this.jets.setMatrixAt(i * 2, tmpMat.compose(f.exit, tmpQuat, tmpScale.set(r, r, len)));
      this.jets.setColorAt(i * 2, tmpJet);
      tmpScale.set(r * JET_CORE_WIDTH, r * JET_CORE_WIDTH, len * JET_CORE_LENGTH);
      this.jets.setMatrixAt(i * 2 + 1, tmpMat.compose(f.exit, tmpQuat, tmpScale));
      this.jets.setColorAt(i * 2 + 1, tmpCore);

      const h = this.halos;
      const g = this.glowMat.color;
      h.color[i * 3] = g.r;
      h.color[i * 3 + 1] = g.g;
      h.color[i * 3 + 2] = g.b;
      h.size[i] = f.radius * HALO_SIZE * (1 + this.boost * HALO_BOOST_GROW);
      h.alpha[i] = alive * HALO_ALPHA;
    }
    for (let i = fans.length; i < this.halos.alpha.length; i++) {
      // Marker lights blink in a slow pair rhythm, like race-car rain lights.
      const blink = Math.sin(time * 6 + (i % 2) * Math.PI) > -0.2 ? 1 : 0.25;
      this.halos.color[i * 3] = this.glowColor.r;
      this.halos.color[i * 3 + 1] = this.glowColor.g;
      this.halos.color[i * 3 + 2] = this.glowColor.b;
      this.halos.size[i] = LIGHT_HALO_SIZE;
      this.halos.alpha[i] = alive * LIGHT_HALO_ALPHA * blink;
    }
    this.halos.commit();
    for (const m of [this.discs, this.jets]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /** Spray off the cushion skirt and damage smoke; both live in craft space, so a particle left
   * standing in the world moves aft at the craft's speed. */
  private emitParticles(dt: number, speedFrac: number, v: RacerViewState): void {
    const c = this.bp.cushion;
    const groundY = -SKIMMER_RIDE_HEIGHT + 0.1;
    const rush = v.speed;
    this.sprayCarry += SPRAY_RATE[this.detail] * Math.min(1, speedFrac) * this.grounded * dt;
    tmpColor.setHex(v.groundColor ?? DEFAULT_GROUND).lerp(WHITE, SPRAY_LIGHTEN);
    while (this.sprayCarry >= 1) {
      this.sprayCarry -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      this.particles.spawn(
        side * c.width * rand(0.25, 0.5), groundY, c.z + c.length * rand(0.2, 0.5),
        side * rand(2, 7), rand(2, 5), rush * SPRAY_DRIFT,
        rand(SPRAY_LIFE[0], SPRAY_LIFE[1]), SPRAY_SIZE[0], SPRAY_SIZE[1], tmpColor, SPRAY_ALPHA, 0, SPRAY_GRAVITY,
      );
    }
    let smokeRate = 0;
    if (v.damage > DAMAGE_SMOKE_FROM) smokeRate += SMOKE_RATE_DAMAGE * (v.damage - DAMAGE_SMOKE_FROM) / (1 - DAMAGE_SMOKE_FROM);
    if (v.crashed) smokeRate += SMOKE_RATE_CRASHED;
    this.smokeCarry += smokeRate * dt;
    while (this.smokeCarry >= 1) {
      this.smokeCarry -= 1;
      const f = this.bp.fans[Math.floor(Math.random() * this.bp.fans.length)];
      this.particles.spawn(
        f.exit.x + rand(-0.5, 0.5) * f.radius, f.exit.y + rand(-0.5, 0.5) * f.radius, f.exit.z,
        rand(-1, 1), rand(1.2, 2.7), 4 + rush * SMOKE_DRIFT,
        rand(SMOKE_LIFE[0], SMOKE_LIFE[1]), SMOKE_SIZE[0], SMOKE_SIZE[1], SMOKE_COLOR, 0.55, 0, -1,
      );
    }
  }

  shatter(impulse: THREE.Vector3, opts: ShatterOptions): void {
    // Re-express everything in a world-aligned frame at the root, so debris falls along world −Y.
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldQuaternion(tmpWorldQuat);
    this.root.getWorldPosition(tmpWorldPos);
    this.wreckFrame.quaternion.copy(tmpWorldQuat).invert();
    this.craft.updateMatrix();
    tmpPose.makeRotationFromQuaternion(tmpWorldQuat).multiply(this.craft.matrix);
    this.craft.position.set(0, 0, 0);
    this.craft.rotation.set(0, 0, 0);
    const groundY = opts.kind === 'fall' ? null : opts.groundY !== undefined ? opts.groundY - tmpWorldPos.y : -SKIMMER_RIDE_HEIGHT;
    this.wreck.start(opts.kind, impulse, tmpPose, groundY);
    this.steer = 0;
    for (const m of [this.jets, this.cushion.mesh, this.vortices.mesh, this.halos.points]) m.visible = false;
  }

  reset(): void {
    this.wreck.reset();
    this.wreckFrame.quaternion.identity();
    this.particles.clear();
    this.scorch.value = 0;
    this.boost = 0;
    this.steer = 0;
    this.grounded = 1;
    for (const m of [this.jets, this.cushion.mesh, this.vortices.mesh, this.halos.points]) m.visible = true;
  }

  private updateWreck(dt: number): void {
    const w = this.wreck;
    w.update(dt);
    this.scorch.value = clamp01(w.age / WRECK_CHAR_TIME);
    const glow = w.glowLevel;
    this.glowMat.color.copy(this.glowColor).lerp(EMBER_COLOR, 1 - glow).multiplyScalar(Math.max(EMBER_FLOOR, glow));
    this.updateFlaps();
    const fans = this.bp.fans;
    for (let i = 0; i < fans.length; i++) {
      const f = fans[i];
      tmpQuat.setFromAxisAngle(UNIT_Z, w.fanSpin + i * 0.9);
      tmpScale.setScalar(f.radius * 0.97);
      tmpMat.compose(f.pos, tmpQuat, tmpScale).premultiply(w.partMatrix[f.part]);
      this.discs.setMatrixAt(i, tmpMat);
      this.discs.setColorAt(i, tmpColor.copy(this.glowMat.color).multiplyScalar(FAN_DISC_GAIN * glow));
    }
    this.discs.instanceMatrix.needsUpdate = true;
    if (this.discs.instanceColor) this.discs.instanceColor.needsUpdate = true;
    this.particles.update(dt);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.wreck.dispose();
    this.skeleton.dispose();
    for (const g of [this.bp.hull, this.bp.glow, this.bp.canopy, this.flapGeo, this.discGeo, this.jetGeo]) g.dispose();
    for (const m of [this.hullMat, this.canopyMat, this.glowMat, ...this.additiveMats]) m.dispose();
    this.flaps.dispose();
    this.discs.dispose();
    this.jets.dispose();
    this.vortices.dispose();
    this.cushion.dispose();
    this.halos.dispose();
    this.particles.dispose();
  }
}
