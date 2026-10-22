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

  /**
   * `tile` (metres) adds box-projected UVs: each face takes the world plane it faces most, so
   * one tiling texture wraps cliffs, ledges and tops without stretching or hand-made seams.
   */
  build(tile?: number): THREE.BufferGeometry | null {
    if (this.pos.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    if (tile !== undefined) g.setAttribute('uv', new THREE.Float32BufferAttribute(boxUv(this.pos, g.attributes.normal.array, tile), 2));
    g.computeBoundingSphere();
    return g;
  }
}

function boxUv(pos: number[], nrm: ArrayLike<number>, tile: number): number[] {
  const uv: number[] = [];
  for (let t = 0; t < pos.length; t += 9) {
    const nx = Math.abs(nrm[t]);
    const ny = Math.abs(nrm[t + 1]);
    const nz = Math.abs(nrm[t + 2]);
    for (let v = 0; v < 9; v += 3) {
      const x = pos[t + v] / tile;
      const y = pos[t + v + 1] / tile;
      const z = pos[t + v + 2] / tile;
      // Vertical faces keep v = height, so strata in the texture run level all round a cliff.
      if (ny >= nx && ny >= nz) uv.push(x, z);
      else if (nx >= nz) uv.push(z, y);
      else uv.push(x, y);
    }
  }
  return uv;
}

/** Indexed grid-like surfaces with smooth normals (road, terrain). */
export class SmoothBuilder {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];
  private readonly uv: number[] = [];
  private readonly idx: number[] = [];
  private readonly nrm: number[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }
  get triangles(): number {
    return this.idx.length / 3;
  }

  /** Pass a normal for every vertex or none: given normals replace the computed ones. */
  vertex(p: P3, c: THREE.Color, u = 0, v = 0, n?: P3): number {
    if (n) this.nrm.push(n.x, n.y, n.z);
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
    if (this.nrm.length === 0) g.computeVertexNormals();
    else if (this.nrm.length === this.pos.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    else throw new Error('SmoothBuilder: normals given for some vertices but not all');
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
