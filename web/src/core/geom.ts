// Small vector and spline helpers shared by the track builders. Plain objects, no three.js.

import type { Vec3 } from './types.ts';

export interface Frame {
  pos: Vec3;
  tangent: Vec3;
  right: Vec3;
  up: Vec3;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function makeFrame(): Frame {
  return { pos: vec3(), tangent: vec3(), right: vec3(), up: vec3() };
}

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  if (l === 0) throw new Error('normalize: zero-length vector (degenerate track geometry)');
  v.x /= l;
  v.y /= l;
  v.z /= l;
  return v;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

export function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Centripetal Catmull-Rom between p1 and p2. */
export function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const alpha = 0.5;
  const d = (a: Vec3, b: Vec3) => Math.max(1e-4, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) ** alpha);
  const t0 = 0;
  const t1 = t0 + d(p0, p1);
  const t2 = t1 + d(p1, p2);
  const t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a: Vec3, b: Vec3, ta: number, tb: number) => {
    const w = (u - ta) / (tb - ta);
    return vec3(a.x + (b.x - a.x) * w, a.y + (b.y - a.y) * w, a.z + (b.z - a.z) * w);
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}
