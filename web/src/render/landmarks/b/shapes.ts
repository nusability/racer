// Geometry, transform and colour helpers for the set-B landmarks.

import * as THREE from 'three';
import type { Rng } from '../../../core/rng.ts';
import type { V3 } from './motion.ts';

// --- Geometry helpers (all return fresh geometry, bases on y = 0 unless noted) ------------

export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
}
export function prism(rBottom: number, rTop: number, h: number, sides: number, open = false): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, rBottom, h, sides, 1, open).translate(0, h / 2, 0);
}
export function cone(r: number, h: number, sides: number): THREE.BufferGeometry {
  return new THREE.ConeGeometry(r, h, sides, 1, true).translate(0, h / 2, 0);
}
export function dome(r: number, wSeg: number, hSeg: number, squash = 1): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, wSeg, hSeg, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, squash, 1);
}
/** Centred sphere. */
export function ball(r: number, wSeg: number, hSeg: number): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, wSeg, hSeg);
}
/** Centred quad in the XY plane. */
export function quad(w: number, h: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(w, h);
}
export function tri(a: V3, b: V3, c: V3): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  return g;
}
/** Revolved profile of [radius, y] pairs, optionally just a wedge (balloon gores). */
export function lathe(profile: readonly (readonly [number, number])[], segs: number, phiStart = 0, phiLength = Math.PI * 2): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart, phiLength);
}
/** Thin strut between two points, in landmark space. */
export function beam(a: V3, b: V3, r: number, sides = 4): THREE.BufferGeometry {
  const from = new THREE.Vector3(...a);
  const dir = new THREE.Vector3(...b).sub(from);
  const length = dir.length();
  const g = new THREE.CylinderGeometry(r, r, length, sides, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  return g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}
/** Points along a rope hung between a and b, sagging by `sag` metres at the middle. */
export function catenary(a: V3, b: V3, sag: number, n: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  return out;
}

const scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const scratchQ = new THREE.Quaternion();

/** Transform: translate, yaw/pitch/roll (YXZ), scale. */
export function T(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s: number | V3 = 1): THREE.Matrix4 {
  scratchQ.setFromEuler(scratchEuler.set(rx, ry, rz, 'YXZ'));
  const sv = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), scratchQ, sv);
}

/** A local frame (position + yaw) for composing a structure from parts in its own coordinates. */
export class Frame {
  readonly base: THREE.Matrix4;
  constructor(x: number, y: number, z: number, readonly ry = 0, readonly s = 1) {
    this.base = T(x, y, z, ry, 0, 0, s);
  }
  m(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s: number | V3 = 1): THREE.Matrix4 {
    return this.base.clone().multiply(T(x, y, z, ry, rx, rz, s));
  }
  p(x: number, y: number, z: number): V3 {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(this.base);
    return [v.x, v.y, v.z];
  }
  dir(x: number, y: number, z: number): V3 {
    const v = new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.ry).normalize();
    return [v.x, v.y, v.z];
  }
}

// --- Colour helpers -----------------------------------------------------------------------

/** A colour nudged in hue, saturation and lightness by up to `amount`. */
export function vary(rng: Rng, color: THREE.ColorRepresentation, amount: number): THREE.Color {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h + (rng() - 0.5) * amount * 0.25, THREE.MathUtils.clamp(hsl.s + (rng() - 0.5) * amount, 0, 1), THREE.MathUtils.clamp(hsl.l + (rng() - 0.5) * amount, 0, 1));
}
export function mix(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}
export function shade(c: THREE.ColorRepresentation, k: number): THREE.Color {
  return new THREE.Color(c).multiplyScalar(k);
}
export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

/** Festival colours: saturated, warm-leaning, plus the track's own accent. */
export const FESTIVE = [0xe8443a, 0xf2a33a, 0xf4d03f, 0x3fb07f, 0x2f8fd8, 0x8e5bd8, 0xe85a9e, 0xf7efe0, 0x1fb5b0];
/** Lamp colours for strings of lights. */
export const LAMPS = [0xffd27a, 0xff9a4a, 0xff5a7a, 0x7ad8ff, 0xb4ff8a, 0xffffff];
