// Pooled race effects in world space. Three draw calls total: one soft (normal-blended) point
// pool for dust/smoke/debris, one additive point pool for sparks/fire/flashes and one instanced
// mesh of shock rings. Everything is preallocated; spawning overwrites the oldest particle.
import * as THREE from 'three';
import { ParticlePool } from './particlePool.ts';
import { SKIMMER_RIDE_HEIGHT } from './skimmerTuning.ts';

const POOL_SOFT = { high: 1600, low: 650 } as const;
const POOL_GLOW = { high: 700, low: 320 } as const;
const RING_COUNT = 8;
/** Effects spawned further than this from the camera are skipped (m). */
const SPAWN_RANGE = 320;

// Dust: per call, `amount` × this many puffs (fractional counts carry over between calls).
const DUST_PER_CALL = { high: 2.0, low: 0.9 } as const;
const DUST_SPREAD = 2.6;
/** Puffs start just above the ground under the hovering craft. */
const DUST_DROP = SKIMMER_RIDE_HEIGHT - 0.15;
const DUST_LIFE = [0.7, 1.3] as const;
const DUST_SIZE = [1.2, 6.0] as const;
// Low on purpose: a racer tailing another must still see the road through its dust.
const DUST_ALPHA = 0.1;
const DUST_LIFT = [1.5, 5.5] as const;
/** Dust is dragged along in the racer's wake: it starts with this share of the racer's velocity
 * and bleeds it off, so from the chase camera it streams back past the lens instead of being
 * left behind in a single frame at 200 m/s. */
const DUST_CARRY = 0.9;
const DUST_DRAG = 1.1;
/** Puffs start this far ahead of the racer origin: under the wing, where the cushion pushes. */
const DUST_LEAD = 3;
/** Sun-lit sand in the air reads lighter than the ground it came from. */
const DUST_LIGHTEN = 0.3;

const SPARK_COUNT = [8, 40] as const;
const SPARK_SPEED = [25, 75] as const;
const SPARK_LIFE = [0.18, 0.5] as const;
const SPARK_COLOR = new THREE.Color(0xffd890);
const SPARK_GRAVITY = 22;

const FIRE_COLORS = [new THREE.Color(0xffe2a0), new THREE.Color(0xff8a2a), new THREE.Color(0xff4a12)];
const SMOKE_COLOR = new THREE.Color(0x2b2622);
const DEBRIS_COLOR = new THREE.Color(0x15110f);

const BOOST_RING_LIFE = 0.5;
const BOOST_RING_SIZE = [2.5, 15] as const;
/** Shock rings and boost sparkles ride forward at about racing speed so they slide back past
 * the chase camera instead of vanishing behind in one frame. */
const BOOST_CARRY = 165;

const tmpColor = new THREE.Color();
const tmpGlow = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpMat = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const UNIT_Z = new THREE.Vector3(0, 0, 1);

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class Effects {
  private readonly soft: ParticlePool;
  private readonly glow: ParticlePool;
  private readonly rings: THREE.InstancedMesh;
  private readonly ringGeo: THREE.BufferGeometry;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly ringLife = new Float32Array(RING_COUNT);
  private readonly ringCarry = new Float32Array(RING_COUNT);
  private readonly ringPos: THREE.Vector3[] = [];
  private readonly ringDir: THREE.Vector3[] = [];
  private readonly ringColor: THREE.Color[] = [];
  private ringNext = 0;
  private readonly dustPerCall: number;
  private dustCarry = 0;
  private readonly cameraPos = new THREE.Vector3();
  private cameraKnown = false;

  constructor(private readonly scene: THREE.Scene, private readonly quality: 'low' | 'high') {
    this.soft = new ParticlePool(POOL_SOFT[quality], 'normal', 0.9);
    this.glow = new ParticlePool(POOL_GLOW[quality], 'additive', 1.8);
    this.dustPerCall = DUST_PER_CALL[quality];
    this.ringGeo = createShockRingGeometry(quality === 'high' ? 40 : 24);
    this.ringMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, toneMapped: false, forceSinglePass: true,
    });
    this.rings = new THREE.InstancedMesh(this.ringGeo, this.ringMat, RING_COUNT);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.frustumCulled = false;
    for (let i = 0; i < RING_COUNT; i++) {
      this.ringPos.push(new THREE.Vector3());
      this.ringDir.push(new THREE.Vector3(0, 0, -1));
      this.ringColor.push(new THREE.Color());
      this.rings.setMatrixAt(i, tmpMat.makeScale(0, 0, 0));
      this.rings.setColorAt(i, tmpColor.setRGB(0, 0, 0));
    }
    // Soft first so additive fire and sparks land on top of the smoke they burst out of.
    this.soft.buf.points.renderOrder = 1;
    this.glow.buf.points.renderOrder = 2;
    this.rings.renderOrder = 2;
    scene.add(this.soft.buf.points, this.glow.buf.points, this.rings);
  }

  private inRange(pos: THREE.Vector3): boolean {
    return !this.cameraKnown || pos.distanceToSquared(this.cameraPos) < SPAWN_RANGE * SPAWN_RANGE;
  }

  update(dt: number, camera: THREE.Camera): void {
    camera.getWorldPosition(this.cameraPos);
    this.cameraKnown = true;
    this.soft.update(dt);
    this.glow.update(dt);
    for (let i = 0; i < RING_COUNT; i++) {
      if (this.ringLife[i] <= 0) continue;
      this.ringLife[i] -= dt;
      const t = 1 - Math.max(0, this.ringLife[i]) / BOOST_RING_LIFE;
      const dir = this.ringDir[i];
      this.ringPos[i].addScaledVector(dir, this.ringCarry[i] * dt * (1 - t * 0.5));
      const ease = 1 - (1 - t) * (1 - t);
      const s = BOOST_RING_SIZE[0] + (BOOST_RING_SIZE[1] - BOOST_RING_SIZE[0]) * ease;
      tmpQuat.setFromUnitVectors(UNIT_Z, dir);
      tmpScale.set(s, s, s);
      this.rings.setMatrixAt(i, tmpMat.compose(this.ringPos[i], tmpQuat, this.ringLife[i] > 0 ? tmpScale : tmpScale.set(0, 0, 0)));
      this.rings.setColorAt(i, tmpColor.copy(this.ringColor[i]).multiplyScalar((1 - t) * 1.4));
    }
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
  }

  /** Sand kicked up under a hovering racer; call every frame while it is on the ground.
   * `pos`: the racer's hover position (model root). `vel`: its world velocity (m/s).
   * `amount` 0..1 (≈ speed / top speed). `color`: the ground's sand colour. */
  dust(pos: THREE.Vector3, vel: THREE.Vector3, amount: number, color: number): void {
    if (!this.inRange(pos)) return;
    this.dustCarry += Math.max(0, amount) * this.dustPerCall;
    const speed = vel.length();
    const lead = speed > 1 ? DUST_LEAD / speed : 0;
    while (this.dustCarry >= 1) {
      this.dustCarry -= 1;
      tmpColor.setHex(color).lerp(WHITE, DUST_LIGHTEN).multiplyScalar(rand(0.9, 1.05));
      this.soft.spawn(
        pos.x + vel.x * lead + rand(-DUST_SPREAD, DUST_SPREAD), pos.y - DUST_DROP + rand(-0.3, 0.3), pos.z + vel.z * lead + rand(-DUST_SPREAD, DUST_SPREAD),
        vel.x * DUST_CARRY + rand(-5, 5), rand(DUST_LIFT[0], DUST_LIFT[1]) * (0.5 + amount), vel.z * DUST_CARRY + rand(-5, 5),
        rand(DUST_LIFE[0], DUST_LIFE[1]), DUST_SIZE[0], DUST_SIZE[1] * (0.6 + amount * 0.6), tmpColor, DUST_ALPHA, DUST_DRAG, 0.8,
      );
    }
  }

  /** Wall scrape: a fan of sparks along `dir`. `intensity` 0..1. */
  sparks(pos: THREE.Vector3, dir: THREE.Vector3, intensity: number): void {
    if (!this.inRange(pos)) return;
    const n = Math.round((SPARK_COUNT[0] + (SPARK_COUNT[1] - SPARK_COUNT[0]) * Math.min(1, intensity)) * (this.quality === 'high' ? 1 : 0.5));
    for (let i = 0; i < n; i++) {
      const sp = rand(SPARK_SPEED[0], SPARK_SPEED[1]);
      this.glow.spawn(
        pos.x, pos.y + rand(-0.4, 0.4), pos.z,
        dir.x * sp + rand(-12, 12), dir.y * sp + rand(2, 14), dir.z * sp + rand(-12, 12),
        rand(SPARK_LIFE[0], SPARK_LIFE[1]), rand(0.12, 0.22), 0.05, SPARK_COLOR, 1, 2.5, SPARK_GRAVITY,
      );
    }
  }

  /** Crash: fireball, sparks, flying debris and a lingering smoke column. */
  explosion(pos: THREE.Vector3, vel: THREE.Vector3, color: number): void {
    if (!this.inRange(pos)) return;
    const q = this.quality === 'high' ? 1 : 0.5;
    const racerGlow = tmpGlow.setHex(color);
    for (let i = 0; i < 34 * q; i++) {
      randomInSphere(tmpPos);
      const c = i % 5 === 0 ? racerGlow : FIRE_COLORS[i % FIRE_COLORS.length];
      this.glow.spawn(
        pos.x + tmpPos.x, pos.y + tmpPos.y, pos.z + tmpPos.z,
        vel.x + tmpPos.x * 14, vel.y + tmpPos.y * 10 + 4, vel.z + tmpPos.z * 14,
        rand(0.45, 0.95), rand(2.5, 4), rand(7, 12), c, 1, 3.2, -2,
      );
    }
    for (let i = 0; i < 26 * q; i++) {
      randomInSphere(tmpPos);
      this.soft.spawn(
        pos.x + tmpPos.x * 2, pos.y + tmpPos.y, pos.z + tmpPos.z * 2,
        vel.x * 0.3 + tmpPos.x * 6, rand(3, 9), vel.z * 0.3 + tmpPos.z * 6,
        rand(1.8, 3.2), rand(3, 5), rand(10, 16), SMOKE_COLOR, 0.65, 1.0, -1.5,
      );
    }
    for (let i = 0; i < 20 * q; i++) {
      randomInSphere(tmpPos);
      this.soft.spawn(
        pos.x, pos.y, pos.z,
        vel.x + tmpPos.x * 38, Math.abs(tmpPos.y) * 30 + 8, vel.z + tmpPos.z * 38,
        rand(0.9, 1.6), rand(0.35, 0.6), 0.3, DEBRIS_COLOR, 1, 0.4, 28,
      );
    }
    tmpPos.set(0, 0, -1);
    this.sparks(pos, tmpPos, 1);
    this.addRing(pos, UPWARD, FIRE_COLORS[1], 0);
  }

  /** Dust ring blown out when a racer lands. `intensity` 0..1. */
  landing(pos: THREE.Vector3, intensity: number): void {
    if (!this.inRange(pos)) return;
    const k = Math.min(1, intensity);
    const n = Math.round((10 + 26 * k) * (this.quality === 'high' ? 1 : 0.5));
    tmpColor.setHex(LANDING_DUST);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.1, 0.1);
      const sp = rand(9, 20) * (0.5 + k);
      this.soft.spawn(
        pos.x + Math.cos(a) * 1.5, pos.y - DUST_DROP, pos.z + Math.sin(a) * 1.5,
        Math.cos(a) * sp, rand(1, 4), Math.sin(a) * sp,
        rand(0.8, 1.3), 1.5, 5 + 3 * k, tmpColor, 0.4, 2.2, 0.5,
      );
    }
  }

  /** Shock ring and a spray of sparkles when boost kicks in. `forward` is the racer's heading. */
  boostBurst(pos: THREE.Vector3, forward: THREE.Vector3, color: number): void {
    if (!this.inRange(pos)) return;
    tmpColor.setHex(color);
    this.addRing(pos, forward, tmpColor, BOOST_CARRY);
    const n = this.quality === 'high' ? 28 : 12;
    for (let i = 0; i < n; i++) {
      randomInSphere(tmpPos);
      tmpPos.addScaledVector(forward, -tmpPos.dot(forward)).normalize();
      const sp = rand(12, 26);
      this.glow.spawn(
        pos.x + tmpPos.x, pos.y + tmpPos.y, pos.z + tmpPos.z,
        forward.x * BOOST_CARRY * 0.8 + tmpPos.x * sp, forward.y * BOOST_CARRY * 0.8 + tmpPos.y * sp, forward.z * BOOST_CARRY * 0.8 + tmpPos.z * sp,
        rand(0.25, 0.45), rand(0.25, 0.4), 0.05, tmpColor, 1, 1.5, 0,
      );
    }
  }

  private addRing(pos: THREE.Vector3, dir: THREE.Vector3, color: THREE.Color, carry: number): void {
    const i = this.ringNext;
    this.ringNext = (i + 1) % RING_COUNT;
    this.ringLife[i] = BOOST_RING_LIFE;
    this.ringPos[i].copy(pos);
    this.ringDir[i].copy(dir).normalize();
    this.ringColor[i].copy(color);
    this.ringCarry[i] = carry;
  }

  dispose(): void {
    this.scene.remove(this.soft.buf.points, this.glow.buf.points, this.rings);
    this.soft.dispose();
    this.glow.dispose();
    this.rings.dispose();
    this.ringGeo.dispose();
    this.ringMat.dispose();
  }
}

const UPWARD = new THREE.Vector3(0, 1, 0);
const LANDING_DUST = 0xc9a477;

function randomInSphere(out: THREE.Vector3): THREE.Vector3 {
  do out.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
  while (out.lengthSq() > 1);
  return out;
}

/** Flat annulus (unit outer radius, normal +Z) with a bright rim fading to both edges. */
function createShockRingGeometry(segments: number): THREE.BufferGeometry {
  const radii = [0.72, 0.93, 1.0];
  const bright = [0, 1, 0];
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  for (let s = 0; s <= segments; s++) {
    const a = (s / segments) * Math.PI * 2;
    for (let r = 0; r < radii.length; r++) {
      positions.push(Math.cos(a) * radii[r], Math.sin(a) * radii[r], 0);
      colors.push(bright[r], bright[r], bright[r]);
    }
  }
  for (let s = 0; s < segments; s++) {
    for (let r = 0; r < radii.length - 1; r++) {
      const a = s * radii.length + r;
      const b = a + radii.length;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(index);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}
