// A preallocated pool of soft point particles with simple ballistics (drag, gravity) and a
// fade in/out. Spawning overwrites the oldest particle; nothing allocates after construction.
import * as THREE from 'three';
import { SoftPointBuffer } from './softPoints.ts';

/** Particles fade in over 1/FADE_IN of their life so they never pop. */
const FADE_IN = 10;

export class ParticlePool {
  readonly buf: SoftPointBuffer;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly drag: Float32Array;
  private readonly gravity: Float32Array;
  private next = 0;
  private live = 0;

  constructor(readonly capacity: number, mode: 'additive' | 'normal', hardness: number) {
    this.buf = new SoftPointBuffer(capacity, mode, hardness);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.alpha0 = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
  }

  spawn(
    px: number, py: number, pz: number, vx: number, vy: number, vz: number,
    life: number, size0: number, size1: number, color: THREE.Color, alpha: number, drag: number, gravity: number,
  ): void {
    const i = this.next;
    this.next = (i + 1) % this.capacity;
    const b = this.buf;
    b.position[i * 3] = px;
    b.position[i * 3 + 1] = py;
    b.position[i * 3 + 2] = pz;
    b.color[i * 3] = color.r;
    b.color[i * 3 + 1] = color.g;
    b.color[i * 3 + 2] = color.b;
    b.size[i] = size0;
    b.alpha[i] = 0;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = size0;
    this.size1[i] = size1;
    this.alpha0[i] = alpha;
    this.drag[i] = drag;
    this.gravity[i] = gravity;
    this.live = this.capacity;
  }

  update(dt: number): void {
    if (this.live === 0) return;
    const b = this.buf;
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      const left = this.life[i] - dt;
      this.life[i] = left;
      if (left <= 0) {
        b.alpha[i] = 0;
        continue;
      }
      alive++;
      const t = 1 - left / this.maxLife[i];
      const k = Math.max(0, 1 - this.drag[i] * dt);
      const o = i * 3;
      this.vel[o] *= k;
      this.vel[o + 1] = this.vel[o + 1] * k - this.gravity[i] * dt;
      this.vel[o + 2] *= k;
      b.position[o] += this.vel[o] * dt;
      b.position[o + 1] += this.vel[o + 1] * dt;
      b.position[o + 2] += this.vel[o + 2] * dt;
      b.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      b.alpha[i] = this.alpha0[i] * (1 - t) * Math.min(1, t * FADE_IN);
    }
    // Once everything has died, one last commit zeroes the buffer and further frames are free.
    this.live = alive;
    b.commit();
  }

  dispose(): void {
    this.buf.dispose();
  }
}
