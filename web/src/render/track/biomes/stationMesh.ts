import * as THREE from 'three';

// Station geometry, merged: every part of a structure (hull, drums, domes, rings, trusses,
// panels, light strips) goes into one buffer, so a whole megastructure is one draw. Parts are
// built in a canonical local frame and placed by a rigid matrix. Every vertex carries what the
// station material (render/stationMaterial.ts) needs to draw its detail: a surface coordinate
// in metres (plates, windows and cells keep their real size on any part), the surface kind, a
// seed, and a baked contact shade where a part meets the big bodies it is bolted to.

/** What a surface is made of; the material draws each differently (render/stationMaterial.ts). */
export const SURFACE = { hull: 0, steel: 1, radiator: 2, solar: 3, glow: 4, glass: 5, hangar: 6, sign: 7, hazard: 8, foil: 9 } as const;
export type Surface = keyof typeof SURFACE;

/**
 * Contact shade: a vertex this close (m) to a registered body's surface darkens toward
 * 1 - CONTACT_DARK, the occlusion where a module, collar or strut meets the hull.
 */
const CONTACT_FALLOFF = 7;
const CONTACT_DARK = 0.5;

/** A body later parts darken against: a capsule (segment a–b, radius r). */
interface Occluder {
  a: THREE.Vector3;
  b: THREE.Vector3;
  r: number;
}

const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const AB = new THREE.Vector3();

export class StationMesh {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly col: number[] = [];
  private readonly surf: number[] = [];
  private readonly occluders: Occluder[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly nm = new THREE.Matrix3();
  private kind: number = SURFACE.hull;
  private readonly tint = new THREE.Color(1, 1, 1);
  private seed = 0;
  /** Whether the vertices being added take the contact shade. */
  private contact = true;

  get triangles(): number {
    return this.pos.length / 9;
  }

  /** Places the following parts: local x, y, z through this rigid matrix. */
  at(m: THREE.Matrix4): this {
    // Windings are chosen in the local frame: a mirroring matrix would turn every face inside out.
    if (m.determinant() <= 0) throw new Error('StationMesh.at: the frame must be a rotation (no mirroring)');
    this.m.copy(m);
    this.nm.getNormalMatrix(m);
    return this;
  }

  /** Paints the following parts. Glow and sign tints are HDR emission; the others albedo. */
  paint(kind: Surface, tint: THREE.Color | number, seed = 0, contact = true): this {
    this.kind = SURFACE[kind];
    if (typeof tint === 'number') this.tint.set(tint);
    else this.tint.copy(tint);
    this.seed = seed;
    this.contact = contact;
    return this;
  }

  /** Registers a body (world capsule) that parts added after it darken against where they touch it. */
  occluder(a: THREE.Vector3, b: THREE.Vector3, r: number): this {
    this.occluders.push({ a: a.clone(), b: b.clone(), r });
    return this;
  }

  private shadeAt(p: THREE.Vector3): number {
    if (!this.contact) return 1;
    let d = Infinity;
    for (const o of this.occluders) {
      AB.subVectors(o.b, o.a);
      const len2 = AB.lengthSq();
      const t = len2 > 0 ? Math.max(0, Math.min(1, tmpV.subVectors(p, o.a).dot(AB) / len2)) : 0;
      const dist = tmpV.copy(o.a).addScaledVector(AB, t).distanceTo(p) - o.r;
      d = Math.min(d, Math.abs(dist));
    }
    return d === Infinity ? 1 : 1 - CONTACT_DARK * Math.exp(-d / CONTACT_FALLOFF);
  }

  /** One vertex: local position, local normal, surface coordinate (m). */
  private vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): void {
    const p = tmpV.set(x, y, z).applyMatrix4(this.m);
    const px = p.x;
    const py = p.y;
    const pz = p.z;
    const shade = this.shadeAt(p);
    const n = tmpN.set(nx, ny, nz).applyMatrix3(this.nm).normalize();
    this.pos.push(px, py, pz);
    this.nrm.push(n.x, n.y, n.z);
    this.col.push(this.tint.r * shade, this.tint.g * shade, this.tint.b * shade);
    this.surf.push(u, v, this.kind, this.seed);
  }

  /**
   * A flat quad a–b–c–d (local), its front toward normal n, with surface coordinates per
   * corner. The winding is chosen from n, so callers never track handedness.
   */
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], ua: number[], ub: number[], uc: number[], ud: number[]): void {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const front = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] >= 0;
    const order = front ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    const uvs = front ? [ua, ub, uc, ua, uc, ud] : [ua, uc, ub, ua, ud, uc];
    for (let i = 0; i < 6; i++) this.vert(order[i][0], order[i][1], order[i][2], n[0], n[1], n[2], uvs[i][0], uvs[i][1]);
  }

  /** A flat triangle (local), its front toward n. */
  tri(a: number[], b: number[], c: number[], n: number[], ua: number[], ub: number[], uc: number[]): void {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const front = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] >= 0;
    const order = front ? [a, b, c] : [a, c, b];
    const uvs = front ? [ua, ub, uc] : [ua, uc, ub];
    for (let i = 0; i < 3; i++) this.vert(order[i][0], order[i][1], order[i][2], n[0], n[1], n[2], uvs[i][0], uvs[i][1]);
  }

  /** A smooth quad: each corner its own normal (curved surfaces); front from the corners' mean normal. */
  private smoothQuad(p: number[][], n: number[][], uv: number[][]): void {
    const [a, b, c] = p;
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const mx = n[0][0] + n[1][0] + n[2][0] + n[3][0];
    const my = n[0][1] + n[1][1] + n[2][1] + n[3][1];
    const mz = n[0][2] + n[1][2] + n[2][2] + n[3][2];
    const front = (uy * vz - uz * vy) * mx + (uz * vx - ux * vz) * my + (ux * vy - uy * vx) * mz >= 0;
    const idx = front ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of idx) this.vert(p[i][0], p[i][1], p[i][2], n[i][0], n[i][1], n[i][2], uv[i][0], uv[i][1]);
  }

  /**
   * A box centred on the local origin, w × h × d along x, y, z. Each face's surface coordinate
   * is its own plane in metres (walls: along, up; roof and floor: x, z), so plates line up
   * across a box's walls. `faces` leaves faces out where something always covers them (`ends`
   * are the ±z faces).
   */
  box(w: number, h: number, d: number, faces: { top?: boolean; bottom?: boolean; ends?: boolean } = {}): this {
    const x = w / 2;
    const y = h / 2;
    const z = d / 2;
    // ±x walls: u along z, v up.
    for (const s of [-1, 1]) this.quad([s * x, -y, -z], [s * x, -y, z], [s * x, y, z], [s * x, y, -z], [s, 0, 0], [-z, -y], [z, -y], [z, y], [-z, y]);
    // ±z walls: u along x, v up.
    if (faces.ends !== false) for (const s of [-1, 1]) this.quad([-x, -y, s * z], [x, -y, s * z], [x, y, s * z], [-x, y, s * z], [0, 0, s], [-x, -y], [x, -y], [x, y], [-x, y]);
    if (faces.top !== false) this.quad([-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z], [0, 1, 0], [-x, -z], [x, -z], [x, z], [-x, z]);
    if (faces.bottom !== false) this.quad([-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [0, -1, 0], [-x, -z], [x, -z], [x, z], [-x, z]);
    return this;
  }

  /**
   * A frustum along local y, centred on the origin: radius r0 at the bottom, r1 at the top,
   * `seg` sides, `rings` bands up its length (so the contact shade can vary along it). The
   * surface coordinate is (arc, height), or (height, arc) when `along` is set: plates and
   * window rows then run down the length of a lying hull instead of round it. `phase` turns
   * the sides (a polygon's flat face can then face a chosen way).
   */
  cylinder(r0: number, r1: number, len: number, seg: number, opts: { rings?: number; caps?: boolean; along?: boolean; phase?: number; smooth?: boolean } = {}): this {
    const rings = opts.rings ?? 1;
    const phase = opts.phase ?? 0;
    const smooth = opts.smooth ?? true;
    const slope = (r0 - r1) / len;
    const rm = (r0 + r1) / 2;
    const uvOf = (a: number, y: number) => (opts.along ? [y, a * rm] : [a * rm, y]);
    for (let i = 0; i < seg; i++) {
      const a0 = phase + (i / seg) * Math.PI * 2;
      const a1 = phase + ((i + 1) / seg) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      for (let j = 0; j < rings; j++) {
        const t0 = j / rings;
        const t1 = (j + 1) / rings;
        const y0 = -len / 2 + len * t0;
        const y1 = -len / 2 + len * t1;
        const ra = r0 + (r1 - r0) * t0;
        const rb = r0 + (r1 - r0) * t1;
        const P = (a: number, r: number, y: number) => [Math.cos(a) * r, y, Math.sin(a) * r];
        const N = (a: number) => {
          const aa = smooth ? a : am;
          const l = Math.hypot(1, slope);
          return [Math.cos(aa) / l, slope / l, Math.sin(aa) / l];
        };
        this.smoothQuad([P(a0, ra, y0), P(a1, ra, y0), P(a1, rb, y1), P(a0, rb, y1)], [N(a0), N(a1), N(a1), N(a0)], [uvOf(a0, y0), uvOf(a1, y0), uvOf(a1, y1), uvOf(a0, y1)]);
      }
      if (opts.caps) {
        for (const [y, r, s] of [[-len / 2, r0, -1], [len / 2, r1, 1]] as const) {
          if (r <= 0) continue;
          this.tri([0, y, 0], [Math.cos(a0) * r, y, Math.sin(a0) * r], [Math.cos(a1) * r, y, Math.sin(a1) * r], [0, s, 0], [0, 0], [Math.cos(a0) * r, Math.sin(a0) * r], [Math.cos(a1) * r, Math.sin(a1) * r]);
        }
      }
    }
    return this;
  }

  /** A flat ring on the local xz plane at height y, from radius r0 to r1, facing ±y (`facing`); sides as `cylinder`. */
  annulus(r0: number, r1: number, y: number, seg: number, facing: number, phase = 0): this {
    for (let i = 0; i < seg; i++) {
      const a0 = phase + (i / seg) * Math.PI * 2;
      const a1 = phase + ((i + 1) / seg) * Math.PI * 2;
      const P = (a: number, r: number) => [Math.cos(a) * r, y, Math.sin(a) * r];
      const U = (a: number, r: number) => [Math.cos(a) * r, Math.sin(a) * r];
      this.quad(P(a0, r0), P(a1, r0), P(a1, r1), P(a0, r1), [0, facing, 0], U(a0, r0), U(a1, r0), U(a1, r1), U(a0, r1));
    }
    return this;
  }

  /** A dome on the local xz plane, rising along +y: radius r, height r × `rise`. */
  dome(r: number, seg: number, rings: number, rise = 1): this {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      for (let j = 0; j < rings; j++) {
        const l0 = (j / rings) * (Math.PI / 2);
        const l1 = ((j + 1) / rings) * (Math.PI / 2);
        const P = (a: number, l: number) => [Math.cos(a) * Math.cos(l) * r, Math.sin(l) * r * rise, Math.sin(a) * Math.cos(l) * r];
        // The normal of the squashed sphere: the gradient of its implicit form.
        const N = (a: number, l: number) => {
          const v = new THREE.Vector3(Math.cos(a) * Math.cos(l), Math.sin(l) / rise, Math.sin(a) * Math.cos(l)).normalize();
          return [v.x, v.y, v.z];
        };
        const U = (a: number, l: number) => [a * r * Math.cos(l), l * r];
        this.smoothQuad([P(a0, l0), P(a1, l0), P(a1, l1), P(a0, l1)], [N(a0, l0), N(a1, l0), N(a1, l1), N(a0, l1)], [U(a0, l0), U(a1, l0), U(a1, l1), U(a0, l1)]);
      }
    }
    return this;
  }

  /**
   * A ring in the local xz plane round the y axis: major radius R, tube radius r. The surface
   * coordinate runs round the ring (u) and round the tube (v), so window rows follow the ring.
   * `arc` limits it to a section, from angle a0 to a1.
   */
  torus(R: number, r: number, seg: number, tube: number, arc: readonly [number, number] = [0, Math.PI * 2]): this {
    for (let i = 0; i < seg; i++) {
      const t0 = arc[0] + ((arc[1] - arc[0]) * i) / seg;
      const t1 = arc[0] + ((arc[1] - arc[0]) * (i + 1)) / seg;
      for (let j = 0; j < tube; j++) {
        const p0 = (j / tube) * Math.PI * 2;
        const p1 = ((j + 1) / tube) * Math.PI * 2;
        const P = (t: number, p: number) => [Math.cos(t) * (R + Math.cos(p) * r), Math.sin(p) * r, Math.sin(t) * (R + Math.cos(p) * r)];
        const N = (t: number, p: number) => [Math.cos(t) * Math.cos(p), Math.sin(p), Math.sin(t) * Math.cos(p)];
        const U = (t: number, p: number) => [t * R, p * r];
        this.smoothQuad([P(t0, p0), P(t1, p0), P(t1, p1), P(t0, p1)], [N(t0, p0), N(t1, p0), N(t1, p1), N(t0, p1)], [U(t0, p0), U(t1, p0), U(t1, p1), U(t0, p1)]);
      }
    }
    return this;
  }

  /** A box from world point a to b: section w (across, perpendicular to `up`) by h (along `up`); `faces.ends` are the a and b faces. */
  beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, up: THREE.Vector3, faces: { ends?: boolean } = {}): this {
    this.at(alongFrame(a, b, up));
    // The local frame's z runs a → b: a box that deep along it.
    return this.box(w, h, a.distanceTo(b), faces);
  }

  /**
   * A square lattice truss from world a to b: four chords, a frame every `bay` metres and a
   * diagonal across each side of each bay. `size` is the chord spacing, `member` a member's
   * section. Its far faces are seen through it, so it reads as a lattice from any side.
   */
  truss(a: THREE.Vector3, b: THREE.Vector3, size: number, bay: number, member: number, up: THREE.Vector3): this {
    const f = alongFrame(a, b, up);
    const x = new THREE.Vector3().setFromMatrixColumn(f, 0);
    const y = new THREE.Vector3().setFromMatrixColumn(f, 1);
    const len = a.distanceTo(b);
    const bays = Math.max(1, Math.round(len / bay));
    const h = size / 2;
    const corner = (i: number, t: number) => {
      const sx = i === 0 || i === 3 ? -h : h;
      const sy = i < 2 ? -h : h;
      return new THREE.Vector3().lerpVectors(a, b, t).addScaledVector(x, sx).addScaledVector(y, sy);
    };
    // Members run diagonal and across: their section's "up" is the truss's own axis-normal.
    for (let i = 0; i < 4; i++) this.beam(corner(i, 0), corner(i, 1), member, member, y, { ends: false });
    const ring = [0, 1, 2, 3, 0];
    for (let k = 0; k <= bays; k++) {
      const t = k / bays;
      for (let i = 0; i < 4; i++) {
        const p = corner(ring[i], t);
        const q = corner(ring[i + 1], t);
        this.beam(p, q, member * 0.8, member * 0.8, i % 2 ? x : y, { ends: false });
        if (k < bays) {
          // Diagonals alternate direction bay to bay: the zig-zag of a real lattice.
          const t1 = (k + 1) / bays;
          const [s, e] = k % 2 ? [corner(ring[i], t), corner(ring[i + 1], t1)] : [corner(ring[i + 1], t), corner(ring[i], t1)];
          this.beam(s, e, member * 0.6, member * 0.6, i % 2 ? x : y, { ends: false });
        }
      }
    }
    return this;
  }

  build(): THREE.BufferGeometry | null {
    if (this.pos.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.surf, 4));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * A rigid frame at a whose local z runs toward b and whose local y is `up` made perpendicular
 * to it (any other direction when `up` is parallel to a–b).
 */
export function alongFrame(a: THREE.Vector3, b: THREE.Vector3, up: THREE.Vector3): THREE.Matrix4 {
  const z = new THREE.Vector3().subVectors(b, a).normalize();
  let y = up.clone().addScaledVector(z, -up.dot(z));
  if (y.lengthSq() < 1e-6) y = Math.abs(z.y) < 0.9 ? new THREE.Vector3(0, 1, 0).addScaledVector(z, -z.y) : new THREE.Vector3(1, 0, 0).addScaledVector(z, -z.x);
  y.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  const mid = new THREE.Vector3().lerpVectors(a, b, 0.5);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(mid);
}

/** A rigid frame at o with local y along `axis` (x and z any perpendicular pair, turned by `spin` about it). */
export function axisFrame(o: THREE.Vector3, axis: THREE.Vector3, spin = 0, ref = new THREE.Vector3(1, 0, 0)): THREE.Matrix4 {
  const y = axis.clone().normalize();
  let x = ref.clone().addScaledVector(y, -ref.dot(y));
  if (x.lengthSq() < 1e-6) x = new THREE.Vector3(0, 0, 1).addScaledVector(y, -y.z);
  x.normalize().applyAxisAngle(y, spin);
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(o);
}
