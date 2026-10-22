import * as THREE from 'three';

// Geometry accumulators. Merging everything per chunk into a handful of buffers is what keeps
// the course inside the phone draw-call budget.

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Non-indexed triangles with one colour per vertex. Every face gets its own vertices, so
 * normals come out faceted (the low-poly look) and colours stay crisp per face.
 */
export class FlatBuilder {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];

  get triangles(): number {
    return this.pos.length / 9;
  }

  /** Counter-clockwise when seen from the front. */
  tri(a: P3, b: P3, c: P3, ca: THREE.Color, cb: THREE.Color = ca, cc: THREE.Color = ca): void {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  }

  /** a-b-c-d counter-clockwise from the front. Colours: bottom pair (a, b), top pair (c, d). */
  quad(a: P3, b: P3, c: P3, d: P3, lo: THREE.Color, hi: THREE.Color = lo): void {
    this.tri(a, b, c, lo, lo, hi);
    this.tri(a, c, d, lo, hi, hi);
  }

  build(): THREE.BufferGeometry | null {
    if (this.pos.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** Indexed grid-like surfaces with smooth normals (road, terrain). */
export class SmoothBuilder {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];
  private readonly uv: number[] = [];
  private readonly idx: number[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }
  get triangles(): number {
    return this.idx.length / 3;
  }

  vertex(p: P3, c: THREE.Color, u = 0, v = 0): number {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  build(withUv: boolean): THREE.BufferGeometry | null {
    if (this.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** Shared scratch colour helpers: palette hex → linear colour, scaled. */
export function tint(hex: number, k = 1, out = new THREE.Color()): THREE.Color {
  out.setHex(hex);
  return out.multiplyScalar(k);
}

export function mixHex(a: number, b: number, t: number, out = new THREE.Color()): THREE.Color {
  const cb = new THREE.Color(b);
  return out.setHex(a).lerp(cb, t);
}
