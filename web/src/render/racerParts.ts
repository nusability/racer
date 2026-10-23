// Low-poly part builders for the skimmer hulls. Every primitive is baked (transform + flat colour)
// into one non-indexed geometry per material, so a whole hull is a single draw call. Each
// primitive is also tagged with the breakable part it belongs to (as a one-bone skin index), so a
// wreck can fling the parts apart without separate meshes. Built hulls also carry a per-facet
// `scorch` threshold so damage chars the hull in patches (see racerModel.ts).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** One lathe band: radius r at axial position z (forward = −Z), colour of the band starting here. */
export interface ProfilePoint {
  r: number;
  z: number;
  color: number;
}

const scratchColor = new THREE.Color();
const scratchQuat = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchScale = new THREE.Vector3();
const scratchPos = new THREE.Vector3();
/** Chamfer on slab edges: catches a highlight so thin wings still read as solid. */
const SLAB_BEVEL = 0.06;

/** Decides which breakable part a primitive belongs to, from its centre (craft space). */
export interface PartAssigner {
  assign(centre: THREE.Vector3): number;
}

export function placement(
  x: number, y: number, z: number,
  rx = 0, ry = 0, rz = 0,
  sx = 1, sy = 1, sz = 1,
): THREE.Matrix4 {
  // X, then Y, then Z: lay a part flat, yaw it along the craft, then cant it about the craft axis.
  scratchEuler.set(rx, ry, rz, 'ZYX');
  scratchQuat.setFromEuler(scratchEuler);
  scratchPos.set(x, y, z);
  scratchScale.set(sx, sy, sz);
  return new THREE.Matrix4().compose(scratchPos, scratchQuat, scratchScale);
}

export class PartBuilder {
  private readonly parts: THREE.BufferGeometry[] = [];

  constructor(private readonly assigner: PartAssigner) {}

  /** Bakes `geo` (consumed) with a flat colour under `local` then the optional `frame`. */
  add(geo: THREE.BufferGeometry, color: number, local?: THREE.Matrix4, frame?: THREE.Matrix4): this {
    const flat = geo.index ? geo.toNonIndexed() : geo;
    if (flat !== geo) geo.dispose();
    flat.deleteAttribute('uv');
    flat.clearGroups();
    if (!flat.getAttribute('normal')) flat.computeVertexNormals();
    if (local) flat.applyMatrix4(local);
    if (frame) flat.applyMatrix4(frame);
    const count = flat.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    scratchColor.setHex(color);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = scratchColor.r;
      colors[i * 3 + 1] = scratchColor.g;
      colors[i * 3 + 2] = scratchColor.b;
    }
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    flat.computeBoundingBox();
    const part = this.assigner.assign((flat.boundingBox as THREE.Box3).getCenter(scratchPos));
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      skinIndex[i * 4] = part;
      skinWeight[i * 4] = 1;
    }
    flat.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    flat.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    this.parts.push(flat);
    return this;
  }

  /** Surface of revolution around the Z axis, one flat-coloured band per profile step. */
  lathe(profile: ProfilePoint[], segments: number, frame?: THREE.Matrix4, phase = 0, arc = Math.PI * 2): this {
    for (let i = 0; i < profile.length - 1; i++) {
      const a = profile[i];
      const b = profile[i + 1];
      if (a.r === 0 && b.r === 0) continue;
      // LatheGeometry spins around +Y; rotating +90° about X maps its Y axis onto +Z.
      const band = new THREE.LatheGeometry([new THREE.Vector2(a.r, a.z), new THREE.Vector2(b.r, b.z)], segments, phase, arc);
      band.rotateX(Math.PI / 2);
      this.add(band, a.color, undefined, frame);
    }
    return this;
  }

  box(w: number, h: number, d: number, color: number, local: THREE.Matrix4, frame?: THREE.Matrix4): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, local, frame);
  }

  /** A thin fin from a 2D outline (in its own XY plane), extruded `thickness` along local Z. */
  fin(outline: [number, number][], thickness: number, color: number, local: THREE.Matrix4, frame?: THREE.Matrix4): this {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    geo.translate(0, 0, -thickness / 2);
    return this.add(geo, color, local, frame);
  }

  /** A flat chamfered plate from a top-view outline of (x, z) points; its top face sits at `top`.
   * Plates straddling the centreline are cut in two so each side can break off on its own. */
  slab(outline: [number, number][], thickness: number, top: number, color: number, frame?: THREE.Matrix4): this {
    const hasLeft = outline.some(([x]) => x < -1e-6);
    const hasRight = outline.some(([x]) => x > 1e-6);
    if (hasLeft && hasRight) {
      this.slabPiece(clipHalfPlane(outline, -1), thickness, top, color, frame);
      return this.slabPiece(clipHalfPlane(outline, 1), thickness, top, color, frame);
    }
    return this.slabPiece(outline, thickness, top, color, frame);
  }

  private slabPiece(outline: [number, number][], thickness: number, top: number, color: number, frame?: THREE.Matrix4): this {
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
    const depth = Math.max(0.01, thickness - SLAB_BEVEL * 2);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: SLAB_BEVEL, bevelSize: SLAB_BEVEL, bevelSegments: 1,
    });
    // Shape Y becomes craft Z and the extrusion points down: +90° about X maps (x, y, z) to (x, −z, y).
    geo.rotateX(Math.PI / 2);
    geo.translate(0, top - SLAB_BEVEL, 0);
    return this.add(geo, color, undefined, frame);
  }

  /** Straight round rod between two points (struts, pylons). */
  rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, segments: number, color: number): this {
    const len = a.distanceTo(b);
    const geo = new THREE.CylinderGeometry(radius, radius, len, segments, 1, true);
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    scratchQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    scratchPos.addVectors(a, b).multiplyScalar(0.5);
    scratchScale.set(1, 1, 1);
    return this.add(geo, color, new THREE.Matrix4().compose(scratchPos, scratchQuat, scratchScale));
  }

  build(): THREE.BufferGeometry {
    if (this.parts.length === 0) throw new Error('PartBuilder.build: no parts added');
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw new Error('PartBuilder.build: parts have mismatched attributes');
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    merged.setAttribute('scorch', facetScorch(merged));
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Sutherland–Hodgman clip of a polygon to the side of x = 0 given by `side` (−1 or 1). */
function clipHalfPlane(poly: [number, number][], side: -1 | 1): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ina = a[0] * side >= 0;
    const inb = b[0] * side >= 0;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = a[0] / (a[0] - b[0]);
      out.push([0, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Deterministic per-facet threshold 0..1: low values char first, in blotches rather than noise. */
function facetScorch(geo: THREE.BufferGeometry): THREE.BufferAttribute {
  const pos = geo.getAttribute('position');
  const out = new Float32Array(pos.count);
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const blotch = Math.sin(x * 1.7 + z * 0.6) * Math.sin(z * 1.3 - y * 2.1 + x * 0.4);
    const grain = Math.sin(x * 9.1 + y * 7.3 + z * 5.7) * 0.25;
    const v = THREE.MathUtils.clamp(0.5 + blotch * 0.45 + grain, 0, 1);
    out[i] = out[i + 1] = out[i + 2] = v;
  }
  return new THREE.BufferAttribute(out, 1);
}
