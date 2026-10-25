import * as THREE from 'three';
import type { Corridor } from '../corridor.ts';
import { valueNoise } from '../noise.ts';
import { hullOutline } from '../tunnel.ts';

// A tunnel bored through a giant asteroid: a lumpy sleeve of rock round the tube, swelling from
// the portals to a fat middle and closing at each end onto the tube's hull, so the tube dives
// into the rock at one portal and out at the other. It is one hollow surface facing outward:
// from inside the tube nothing of it shows (the tube's own walls are all there is), and no rock
// face ever crosses the bore the way a chain of solid rocks would. One draw per bore.

/** The sleeve: a ring every this many metres along the bore, this many points round it. */
const RING_STEP = 14;
const RING_POINTS = 24;
/** Its swell over the hull, metres: at the middle of the bore, and at the mouths. */
const SWELL = 70;
const MOUTH = 3;
/** The swell grows from the mouths as a sine to this power (under 1: the rock bulks up quickly). */
const SWELL_SHAPE = 0.6;
/** Its cross-section is wider than tall (the rock lies along the tube), and lumpy: share of the swell, and the lumps' size (m). */
const SQUASH = 0.8;
const LUMP = 0.22;
const LUMP_SIZE = 45;
/** Rock tones (sRGB): carbonaceous grey toward rust, darker in the hollows. */
const ROCK = new THREE.Color(0x4e4a46);
const RUST = new THREE.Color(0x6a5440);
const HOLLOW = 0.35;

/** The sleeve round main-road tunnel span s0..s1, as one vertex-coloured geometry. Throws when there is no tunnel there. */
export function boreGeometry(cor: Corridor, s0: number, s1: number, seed: number): THREE.BufferGeometry {
  const r = cor.ribbon;
  const noise = valueNoise(seed);
  const n01 = (x: number, y: number) => (noise(x, y) + 1) / 2;
  /** The hull outline at s and its centre height (the mouths' own samples are open sky: use the bore's, just inside). */
  const hullAt = (s: number, inward: number) => {
    const smp = r.sampleAt(s);
    const ceiling = Number.isFinite(smp.ceiling) ? smp.ceiling : r.sampleAt(s + inward * RING_STEP).ceiling;
    if (!Number.isFinite(ceiling)) throw new Error(`spaceBores: no tunnel at s=${s.toFixed(0)} to bore`);
    const hull = hullOutline(smp.width / 2, ceiling);
    const ys = hull.map(([, y]) => y);
    return { hull, cy: (Math.max(...ys) + Math.min(...ys)) / 2, k: cor.idx(Math.round(s / r.step)) };
  };
  const steps = Math.max(2, Math.round((s1 - s0) / RING_STEP));
  const rings: { p: THREE.Vector3; shade: number }[][] = [];
  for (let i = 0; i <= steps; i++) {
    const s = s0 + ((s1 - s0) * i) / steps;
    const { hull, cy, k } = hullAt(s, i === 0 ? 1 : -1);
    const end = i === 0 || i === steps;
    const swell = MOUTH + (SWELL - MOUTH) * Math.sin((Math.PI * i) / steps) ** SWELL_SHAPE;
    const ring: { p: THREE.Vector3; shade: number }[] = [];
    for (let q = 0; q < RING_POINTS; q++) {
      const a = (q / RING_POINTS) * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      // The hull's extent this way from the bore's centre, then the rock past it.
      const inner = reachAlong(hull, cy, dx, dy);
      const n = n01((s + q * 37) / LUMP_SIZE, (q * 13) / 4);
      const thick = end ? MOUTH : Math.max(MOUTH, swell * (1 + (n - 0.5) * 2 * LUMP));
      const squash = end ? 1 : SQUASH;
      const p = cor.banked(k, dx * (inner + thick), cy + dy * (inner + thick * squash));
      ring.push({ p: new THREE.Vector3(p.x, p.y, p.z), shade: 1 - HOLLOW * (1 - n) });
    }
    rings.push(ring);
  }

  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const tri = (...v: { p: THREE.Vector3; shade: number }[]) => {
    for (const { p, shade } of v) {
      pos.push(p.x, p.y, p.z);
      c.copy(ROCK).lerp(RUST, n01(p.x / LUMP_SIZE, p.z / LUMP_SIZE)).multiplyScalar(shade);
      col.push(c.r, c.g, c.b);
    }
  };
  // The sleeve, its faces turned out of the rock.
  for (let i = 0; i < steps; i++) {
    for (let q = 0; q < RING_POINTS; q++) {
      const q1 = (q + 1) % RING_POINTS;
      const [a, b, cc, d] = [rings[i][q], rings[i][q1], rings[i + 1][q1], rings[i + 1][q]];
      tri(a, d, cc);
      tri(a, cc, b);
    }
  }
  // Mouth caps: from the sleeve's end ring onto the hull outline, so the rock closes round the tube.
  for (const [i, s, dir] of [[0, s0, -1], [steps, s1, 1]] as const) {
    const { hull, cy, k } = hullAt(s, -dir);
    const at = (q: number) => {
      const a = (q / RING_POINTS) * Math.PI * 2;
      const inner = reachAlong(hull, cy, Math.cos(a), Math.sin(a));
      const p = cor.banked(k, Math.cos(a) * inner, cy + Math.sin(a) * inner);
      return { p: new THREE.Vector3(p.x, p.y, p.z), shade: 1 };
    };
    for (let q = 0; q < RING_POINTS; q++) {
      const q1 = (q + 1) % RING_POINTS;
      const [a, b, ia, ib] = [rings[i][q], rings[i][q1], at(q), at(q1)];
      // Facing out of the mouth: back along the road at the near end, on along it at the far one.
      if (dir > 0) {
        tri(a, ib, b);
        tri(a, ia, ib);
      } else {
        tri(a, b, ib);
        tri(a, ib, ia);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** How far a ray from (0, cy) along (dx, dy) runs before it leaves the hull outline (a convex polygon round it). */
function reachAlong(hull: [number, number][], cy: number, dx: number, dy: number): number {
  let best = 0;
  for (let i = 0; i < hull.length; i++) {
    const [ax, ay] = hull[i];
    const [bx, by] = hull[(i + 1) % hull.length];
    // Solve (0, cy) + t (dx, dy) = a + u (b - a) for the edge a–b.
    const ex = bx - ax;
    const ey = by - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (ax * ey - (ay - cy) * ex) / den;
    const u = (ax * dy - (ay - cy) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
  }
  return best;
}
