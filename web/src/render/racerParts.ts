// Low-poly part builders for the racer hulls. Every part is baked (transform + flat colour) into
// one non-indexed geometry per material, so a whole hull is a single draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** One lathe band: radius r at axial position z (forward = −Z), colour of the band starting here. */
export interface ProfilePoint {
  r: number;
  z: number;
  color: number;
}

const scratchColor = new THREE.Color();
const scratchMatrix = new THREE.Matrix4();
const scratchQuat = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchScale = new THREE.Vector3();
const scratchPos = new THREE.Vector3();

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

  /** Bakes `geo` (consumed) with a flat colour under `local` then the optional `frame`. */
  add(geo: THREE.BufferGeometry, color: number, local?: THREE.Matrix4, frame?: THREE.Matrix4): this {
    const flat = geo.index ? geo.toNonIndexed() : geo;
    if (flat !== geo) geo.dispose();
    flat.deleteAttribute('uv');
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
    this.parts.push(flat);
    return this;
  }

  /** Surface of revolution around the Z axis, one flat-coloured band per profile step. */
  lathe(profile: ProfilePoint[], segments: number, frame?: THREE.Matrix4, phase = 0): this {
    for (let i = 0; i < profile.length - 1; i++) {
      const a = profile[i];
      const b = profile[i + 1];
      if (a.r === 0 && b.r === 0) continue;
      // LatheGeometry spins around +Y; rotating +90° about X maps its Y axis onto +Z.
      const band = new THREE.LatheGeometry([new THREE.Vector2(a.r, a.z), new THREE.Vector2(b.r, b.z)], segments, phase);
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

  /** Straight round rod between two points (struts, cable stubs). */
  rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, segments: number, color: number, frame?: THREE.Matrix4): this {
    const len = a.distanceTo(b);
    const geo = new THREE.CylinderGeometry(radius, radius, len, segments, 1, true);
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    scratchScale.set(1, 1, 1);
    scratchMatrix.compose(mid, q, scratchScale);
    return this.add(geo, color, scratchMatrix.clone(), frame);
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  build(): THREE.BufferGeometry {
    if (this.parts.length === 0) throw new Error('PartBuilder.build: no parts added');
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw new Error('PartBuilder.build: parts have mismatched attributes');
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    merged.computeBoundingSphere();
    return merged;
  }
}

export function triangleCount(geo: THREE.BufferGeometry): number {
  return (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
}
