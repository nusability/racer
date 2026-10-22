// Merged geometry buckets: one material's triangles (or point sprites) with their motion.

import * as THREE from 'three';
import { KINETIC_ATTRS, type Motion, type Twinkle, type V3 } from './motion.ts';

// --- Buckets ------------------------------------------------------------------------------

const DEFAULT_TWINKLE: Twinkle = { depth: 0, freq: 0, phase: 0, sharp: 1 };
const scratchV = new THREE.Vector3();
const IDENTITY = new THREE.Matrix4();

function len(a: V3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function dist(a: V3, b: V3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

interface BucketKind {
  kinetic?: boolean;
  twinkle?: boolean;
  /** Point sprites (one vertex per add) with a world-size attribute. */
  sized?: boolean;
}

/** Accumulates triangles (or points) for one material into a single merged geometry. */
export class Bucket {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];
  private readonly size: number[] = [];
  private readonly tw: number[] = [];
  private readonly kin: number[][] = KINETIC_ATTRS.map(() => []);
  /** Conservative reach of any vertex from the origin over all motion, for culling. */
  private reach = 0;
  private readonly c = new THREE.Color();

  constructor(private readonly kind: BucketKind) {}

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m: THREE.Matrix4 = IDENTITY, motion?: Motion, tw?: Twinkle): void {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const p = src.getAttribute('position');
    this.c.set(color);
    for (let i = 0; i < p.count; i++) {
      scratchV.fromBufferAttribute(p, i).applyMatrix4(m);
      this.push(scratchV.x, scratchV.y, scratchV.z, motion, tw);
    }
    if (src !== geo) src.dispose();
  }

  /** One point sprite (sized buckets only). */
  point(p: V3, color: THREE.ColorRepresentation, size: number, motion?: Motion, tw?: Twinkle): void {
    this.c.set(color);
    this.size.push(size);
    this.push(p[0], p[1], p[2], motion, tw);
  }

  private push(x: number, y: number, z: number, motion: Motion | undefined, tw: Twinkle | undefined): void {
    this.pos.push(x, y, z);
    this.col.push(this.c.r, this.c.g, this.c.b);
    if (this.kind.twinkle) {
      const t = tw ?? DEFAULT_TWINKLE;
      this.tw.push(t.depth, t.freq, t.phase, t.sharp ?? 1);
    }
    if (!this.kind.kinetic) {
      this.reach = Math.max(this.reach, Math.hypot(x, y, z));
      return;
    }
    const m = motion ?? {};
    const hub = m.hub ?? [0, 0, 0];
    const pivot = m.pivot ?? hub;
    const axA = m.axisA ?? [0, 1, 0];
    const axB = m.axisB ?? [0, 1, 0];
    const drift = m.drift ?? [0, 0, 0];
    const k = this.kin;
    k[0].push(hub[0], hub[1], hub[2], m.upright ? 1 : 0);
    k[1].push(axA[0], axA[1], axA[2], m.spinA ?? 0);
    k[2].push(pivot[0], pivot[1], pivot[2], m.spinB ?? 0);
    k[3].push(axB[0], axB[1], axB[2], m.swingB ?? 0);
    k[4].push(m.swingA ?? 0, m.freq ?? 0, m.phase ?? 0, m.hop ?? 0);
    k[5].push(drift[0], drift[1], drift[2], m.driftFreq ?? 0);
    const v: V3 = [x, y, z];
    this.reach = Math.max(this.reach, len(hub) + dist(pivot, hub) + dist(v, pivot) + len(drift) + (m.hop ?? 0));
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.kind.sized) g.setAttribute('aSize', new THREE.Float32BufferAttribute(this.size, 1));
    if (this.kind.twinkle) g.setAttribute('aTwinkle', new THREE.Float32BufferAttribute(this.tw, 4));
    if (this.kind.kinetic) KINETIC_ATTRS.forEach((name, i) => g.setAttribute(name, new THREE.Float32BufferAttribute(this.kin[i], 4)));
    // Motion moves vertices off their rest positions, so bound the whole sweep instead.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), this.reach);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-this.reach, -this.reach, -this.reach), new THREE.Vector3(this.reach, this.reach, this.reach));
    return g;
  }
}
