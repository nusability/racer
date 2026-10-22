import * as THREE from 'three';
import { FlatBuilder, type P3 } from './builder.ts';
import type { Boundary, Scatter } from './corridor.ts';
import { quadFacing, type Paint } from './paint.ts';

// Boundary pylons along the run-off lips and lamp posts along the walls: hundreds of them,
// two instanced meshes each (lit body, unlit light), whatever the lap length.

const PYLON_HEIGHT = 4.5;
const PYLON_TIP = 1;
/** Energy fence between pylons: band height above the lip crest. */
const FENCE_Y: [number, number] = [2.2, 2.9];
const LAMP_HEIGHT = 10;
const LAMP_ARM = 3.5;
const UP = new THREE.Vector3(0, 1, 0);

function bodyOf(build: (b: FlatBuilder) => void): THREE.BufferGeometry {
  const b = new FlatBuilder();
  build(b);
  const g = b.build();
  if (!g) throw new Error('post geometry is empty');
  return g;
}

/** A box from (x0, y0, z0) to (x1, y1, z1) in local space, one colour. */
function cuboid(b: FlatBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: THREE.Color) {
  const p = (i: number): P3 => ({ x: i & 1 ? x1 : x0, y: i & 4 ? y1 : y0, z: i & 2 ? z1 : z0 });
  const centre = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 };
  for (const [a, bb, cc, d] of [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]) {
    const m = { x: (p(a).x + p(cc).x) / 2, y: (p(a).y + p(cc).y) / 2, z: (p(a).z + p(cc).z) / 2 };
    quadFacing(b, p(a), p(bb), p(cc), p(d), { x: m.x - centre.x, y: m.y - centre.y, z: m.z - centre.z }, c);
  }
}

function instance(geo: THREE.BufferGeometry, mat: THREE.Material, items: { p: P3; dir: P3 }[], name: string): THREE.InstancedMesh | null {
  if (items.length === 0) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  items.forEach((it, i) => {
    // Local +X points along dir (toward the road for lamps, outward for pylons).
    q.setFromAxisAngle(UP, Math.atan2(-it.dir.z, it.dir.x));
    m.compose(new THREE.Vector3(it.p.x, it.p.y, it.p.z), q, one);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = name;
  return mesh;
}

export function buildPosts(scatter: Scatter, paint: Paint, boundary: Boundary, glow: FlatBuilder, lit: THREE.Material, unlit: THREE.Material): THREE.InstancedMesh[] {
  const dark = paint.black.clone().multiplyScalar(2.4);
  const pylon = bodyOf((b) => {
    for (let i = 0; i < 4; i++) cuboid(b, -0.3, -1 + i * 1.1, -0.3, 0.3, i * 1.1 + 0.1, 0.3, i % 2 ? dark : paint.white);
  });
  const tip = bodyOf((b) => cuboid(b, -0.45, PYLON_HEIGHT - PYLON_TIP, -0.45, 0.45, PYLON_HEIGHT, 0.45, paint.accent));
  const lampPost = bodyOf((b) => {
    cuboid(b, -0.25, -1, -0.25, 0.25, LAMP_HEIGHT, 0.25, dark);
    cuboid(b, 0, LAMP_HEIGHT - 0.3, -0.15, LAMP_ARM, LAMP_HEIGHT, 0.15, dark);
  });
  const lampHead = bodyOf((b) => cuboid(b, LAMP_ARM - 1.2, LAMP_HEIGHT - 0.6, -0.4, LAMP_ARM + 0.2, LAMP_HEIGHT - 0.25, 0.4, new THREE.Color(0xfff1c8)));

  const pylons = scatter.pylons.map((p) => ({ p: p.p, dir: p.out }));
  const lamps = scatter.lights.map((l) => ({ p: l.p, dir: l.inward }));
  if (boundary === 'fence') {
    // Energy fence: a glowing band between neighbouring pylons on the same lip.
    const accent = paint.accent;
    for (let i = 0; i + 1 < scatter.pylons.length; i++) {
      for (let j = i + 1; j < Math.min(scatter.pylons.length, i + 4); j++) {
        const a = scatter.pylons[i];
        const b = scatter.pylons[j];
        if (a.view !== b.view || a.side !== b.side || Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z) > 60) continue;
        const q = (p: P3, y: number): P3 => ({ x: p.x, y: p.y + y, z: p.z });
        quadFacing(glow, q(a.p, FENCE_Y[0]), q(b.p, FENCE_Y[0]), q(b.p, FENCE_Y[1]), q(a.p, FENCE_Y[1]), { x: -a.out.x, y: 0, z: -a.out.z }, accent);
        quadFacing(glow, q(a.p, FENCE_Y[0]), q(b.p, FENCE_Y[0]), q(b.p, FENCE_Y[1]), q(a.p, FENCE_Y[1]), a.out, accent);
        break;
      }
    }
  }
  return [
    instance(pylon, lit, pylons, 'pylons'),
    instance(tip, unlit, pylons, 'pylonTips'),
    instance(lampPost, lit, lamps, 'lampPosts'),
    instance(lampHead, unlit, lamps, 'lamps'),
  ].filter((m): m is THREE.InstancedMesh => m !== null);
}
