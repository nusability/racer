import * as THREE from 'three';
import type { FlatBuilder, P3 } from './builder.ts';
import { TUNNEL_RIB_SPACING, TUNNEL_ROCK_ABOVE, TUNNEL_ROCK_WIDTH } from './config.ts';
import type { Corridor } from './corridor.ts';
import { quadFacing, rockQuad } from './paint.ts';

// Tunnels: a lit bore through a mesa. Walls at the road edge, a chamfered roof at the ceiling
// height, warm light strips and strobing ceiling ribs, and a hazard frame round each mouth.

/** Bore cross-section: walls rise to this fraction of the ceiling, then chamfer in. */
const TUNNEL_WALL_FRACTION = 0.62;
const TUNNEL_CHAMFER = 0.72;
/** The mesa foot sits this far under the road so the terrain never shows below it. */
const TUNNEL_FOOT = 8;
/** Lift of tunnel light strips off their rock face, metres. */
const LIGHT_INSET = 0.08;
const WARM = new THREE.Color(0xfff1c8);
/** A hanging hull's underside faces away from the star and the fill: darker than its sides. */
const UNDERSIDE_SHADE = 0.55;

export function mean(...p: P3[]): P3 {
  const o = { x: 0, y: 0, z: 0 };
  for (const q of p) {
    o.x += q.x / p.length;
    o.y += q.y / p.length;
    o.z += q.z / p.length;
  }
  return o;
}

export function sub(a: P3, b: P3): P3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** Bore (inner) and mesa (outer) outlines in the banked frame, left to right. */
function tunnelRing(cor: Corridor, k: number): { inner: P3[]; outer: P3[]; axis: P3 } {
  const kk = cor.idx(k);
  const smp = cor.ribbon.samples[kk];
  const h = smp.width / 2;
  const c = smp.ceiling;
  // A concrete underpass is a straight cast box; only rock is lumpy.
  const lumpy = cor.paint.masonry === 'sandstone' ? 1 : 0;
  const top = c + TUNNEL_ROCK_ABOVE * (0.85 + 0.3 * Math.abs(cor.noise(kk * 0.01, 7)) * lumpy);
  const w = TUNNEL_ROCK_WIDTH;
  const wobble = (i: number) => cor.noise(kk * 0.06 + i, i * 2.3) * 4 * lumpy;
  const inner: [number, number][] = [
    [-h, 0],
    [-h, c * TUNNEL_WALL_FRACTION],
    [-h * TUNNEL_CHAMFER, c],
    [h * TUNNEL_CHAMFER, c],
    [h, c * TUNNEL_WALL_FRACTION],
    [h, 0],
  ];
  // A mesa: talus foot, near-vertical cliffs, broad flat top.
  const outer: [number, number][] = [
    [-h - w, -TUNNEL_FOOT],
    [-h - w * 0.86 + wobble(1), top * 0.3],
    [-h - w * 0.8 + wobble(2), top + wobble(3) * 0.3],
    [h + w * 0.8 + wobble(4), top + wobble(5) * 0.3],
    [h + w * 0.86 + wobble(6), top * 0.3],
    [h + w, -TUNNEL_FOOT],
  ];
  return {
    inner: inner.map(([x, y]) => cor.banked(kk, x, y)),
    outer: outer.map(([x, y]) => cor.banked(kk, x, y)),
    axis: cor.banked(kk, 0, c * 0.5),
  };
}

export function tunnelStrip(cor: Corridor, b: FlatBuilder, ka: number, kb: number): void {
  const A = tunnelRing(cor, ka);
  const B = tunnelRing(cor, kb);
  const col = new THREE.Color();
  for (let i = 0; i < 5; i++) {
    const mid = mean(A.inner[i], A.inner[i + 1], B.inner[i], B.inner[i + 1]);
    const shade = i === 2 ? 0.28 : 0.38;
    quadFacing(b, A.inner[i], A.inner[i + 1], B.inner[i + 1], B.inner[i], sub(A.axis, mid), cor.paint.strata(mid.y, shade, col));
    const mo = mean(A.outer[i], A.outer[i + 1], B.outer[i], B.outer[i + 1]);
    if (i === 2) quadFacing(b, A.outer[i], A.outer[i + 1], B.outer[i + 1], B.outer[i], sub(mo, A.axis), cor.paint.strata(mo.y, 1.05, col));
    else rockQuad(b, cor.paint, A.outer[i], B.outer[i], B.outer[i + 1], A.outer[i + 1], sub(mo, A.axis), 0.95);
  }
  // With no ground to stand in, the mass is a hull hanging in the void: close its underside.
  if (cor.hanging) {
    const bottom = mean(A.outer[0], A.outer[5], B.outer[0], B.outer[5]);
    quadFacing(b, A.outer[0], A.outer[5], B.outer[5], B.outer[0], sub(bottom, A.axis), cor.paint.strata(bottom.y, UNDERSIDE_SHADE, col));
  }
  tunnelLights(cor, ka, kb);
}

function tunnelLights(cor: Corridor, ka: number, kb: number) {
  const g = cor.glow;
  const half = (k: number) => cor.ribbon.samples[cor.idx(k)].width / 2;
  const ceil = (k: number) => cor.ribbon.samples[cor.idx(k)].ceiling;
  const t = 0.35;
  // Each light line as lateral/height functions of the sample, from one edge to the other.
  const lines: [(k: number) => number, (k: number) => number, (k: number) => number, (k: number) => number, THREE.Color][] = [
    [
      (k) => half(k) - LIGHT_INSET - (1 - TUNNEL_CHAMFER) * half(k) * (0.5 - t / 2),
      (k) => ceil(k) * (TUNNEL_WALL_FRACTION + (1 - TUNNEL_WALL_FRACTION) * (0.5 - t / 2)),
      (k) => half(k) - LIGHT_INSET - (1 - TUNNEL_CHAMFER) * half(k) * (0.5 + t / 2),
      (k) => ceil(k) * (TUNNEL_WALL_FRACTION + (1 - TUNNEL_WALL_FRACTION) * (0.5 + t / 2)),
      WARM,
    ],
    [(k) => half(k) - LIGHT_INSET, () => 0.6, (k) => half(k) - LIGHT_INSET, () => 1.2, cor.paint.accent],
  ];
  const axis = cor.banked(ka, 0, ceil(ka) * 0.5);
  for (const side of [-1, 1]) {
    for (const [x0, y0, x1, y1, color] of lines) {
      const a0 = cor.banked(ka, side * x0(ka), y0(ka));
      const a1 = cor.banked(ka, side * x1(ka), y1(ka));
      const b0 = cor.banked(kb, side * x0(kb), y0(kb));
      const b1 = cor.banked(kb, side * x1(kb), y1(kb));
      quadFacing(g, a0, a1, b1, b0, sub(axis, a0), color);
    }
  }
  // Ceiling ribs: bright bars across the roof that strobe past at speed.
  const r = cor.ribbon;
  const s0 = ka * r.step;
  const s1 = kb * r.step;
  for (let s = Math.ceil(s0 / TUNNEL_RIB_SPACING) * TUNNEL_RIB_SPACING; s < s1; s += TUNNEL_RIB_SPACING) {
    const smp = r.sampleAt(s);
    const h = (smp.width / 2) * TUNNEL_CHAMFER;
    const y = smp.ceiling - LIGHT_INSET;
    const p = (ds: number, x: number) => r.toWorld(s + ds, x, y);
    quadFacing(g, p(0, -h), p(0, h), p(1.4, h), p(1.4, -h), sub(r.toWorld(s, 0, 0), p(0, 0)), WARM);
  }
}

/** The cliff face where the bore enters (dir -1) or leaves (dir 1) the mesa. */
export function portal(cor: Corridor, b: FlatBuilder, k: number, dir: number): void {
  const R = tunnelRing(cor, k);
  const t = cor.ribbon.samples[cor.idx(k)].tangent;
  const facing = { x: t.x * dir, y: t.y * dir, z: t.z * dir };
  for (let i = 0; i < 5; i++) rockQuad(b, cor.paint, R.inner[i], R.inner[i + 1], R.outer[i + 1], R.outer[i], facing, 0.85);
  // Hanging in the void, the face also closes under the road, down to the hull's underside.
  if (cor.hanging) rockQuad(b, cor.paint, R.outer[0], R.outer[5], R.inner[5], R.inner[0], facing, 0.85);
  // Hazard-lit frame around the mouth so the hole reads from far away.
  for (let i = 0; i < 5; i++) {
    const a = R.inner[i];
    const c2 = R.inner[i + 1];
    const lift = (p: P3, m: number): P3 => ({
      x: p.x + facing.x * 0.1 + (p.x - R.axis.x) * m,
      y: p.y + facing.y * 0.1 + (p.y - R.axis.y) * m,
      z: p.z + facing.z * 0.1 + (p.z - R.axis.z) * m,
    });
    quadFacing(cor.glow, lift(a, 0), lift(c2, 0), lift(c2, 0.08), lift(a, 0.08), facing, cor.paint.hazard);
  }
}
