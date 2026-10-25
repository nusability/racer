import * as THREE from 'three';
import { FlatBuilder, type P3 } from '../builder.ts';
import type { Quality } from '../config.ts';
import { quadFacing } from '../paint.ts';

// Elderwood's 3D props. The near trunk is built once in unit space and instanced in its
// thousands (forestTrunks.ts); the few static ones (fallen logs, the waymarker stones on the
// bends) are stamped into the course's merged meshes.

/** Fallen log: facets, and its radius (it is a unit long, along x). */
const LOG_SIDES = 8;
export const LOG_RADIUS = 0.09;
/** Waymarker stone: height, half-width at foot and top, and the rune band's height range (m). */
const STONE_H = 1.6;
const STONE_SIDES = 4;
const STONE_FOOT = 0.4;
const STONE_TOP = 0.24;
const RUNE_BAND: readonly [number, number] = [1.0, 1.3];

export interface ForestColours {
  bark: THREE.Color;
  moss: THREE.Color;
  fern: THREE.Color;
  stone: THREE.Color;
  wood: THREE.Color;
}

function finish(b: FlatBuilder, what: string): THREE.BufferGeometry {
  const g = b.build();
  if (!g) throw new Error(`forest ${what} geometry is empty`);
  return g;
}

/** Rings of points round the y axis at the profile's heights; ring i is twisted by i × twist. */
function rings(profile: readonly (readonly [number, number])[], sides: number, twist: number): P3[][] {
  return profile.map(([y, r], i) =>
    Array.from({ length: sides }, (_, j) => {
      const a = (j / sides) * Math.PI * 2 + i * twist;
      return { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
    }),
  );
}

/** Quads between neighbouring rings, each facet coloured by `tint(facet, ringIndex)`. */
function skin(b: FlatBuilder, pts: P3[][], tint: (facet: number, ring: number) => THREE.Color): void {
  const sides = pts[0].length;
  for (let r = 0; r + 1 < pts.length; r++) {
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const A = pts[r][i];
      const mid = { x: (A.x + pts[r][j].x) / 2, y: 0, z: (A.z + pts[r][j].z) / 2 };
      quadFacing(b, A, pts[r][j], pts[r + 1][j], pts[r + 1][i], mid, tint(i, r), tint(i, r), tint(i, r + 1), tint(i, r + 1));
    }
  }
}

/**
 * A near trunk in unit space (radius 1 above the flare, height 1 up into the canopy), smooth
 * shaded with bark UVs (u round it, v up it) for the bark texture and its normal map: a
 * straight, barely tapering column rising out of a root flare. Vertex colours tint the bark:
 * moss on the flare, and the canopy's shade darkening it toward the top, out of frame.
 */
export function trunkGeometry(quality: Quality, mossTint: THREE.Color): THREE.BufferGeometry {
  const profile = TRUNK_PROFILE[quality];
  const sides = TRUNK_SIDES[quality];
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  const white = new THREE.Color(1, 1, 1);
  const c = new THREE.Color();
  profile.forEach(([y, r], i) => {
    // The surface's slope here (from its neighbours) tilts the normal off horizontal.
    const [y0, r0] = profile[Math.max(0, i - 1)];
    const [y1, r1] = profile[Math.min(profile.length - 1, i + 1)];
    const tilt = Math.atan2(r0 - r1, (y1 - y0) * TRUNK_ASPECT);
    const moss = Math.max(0, 1 - Math.max(0, y) / TRUNK_MOSS_UP);
    const shade = 1 - (1 - TRUNK_SHADE_TOP) * Math.max(0, (y - TRUNK_SHADE_FROM) / (1 - TRUNK_SHADE_FROM));
    c.copy(white).lerp(mossTint, moss).multiplyScalar(shade);
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      nrm.push(Math.cos(a) * Math.cos(tilt), Math.sin(tilt), Math.sin(a) * Math.cos(tilt));
      uv.push((j / sides) * BARK_ROUND, y * BARK_UP);
      col.push(c.r, c.g, c.b);
    }
  });
  const row = sides + 1;
  for (let i = 0; i + 1 < profile.length; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * row + j;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}
/**
 * The trunk's rings: height (share of the tree, from the buried foot) and radius (× the
 * barrel's). The flare spreads to TRUNK_FLARE at the ground and is back to the barrel a few
 * metres up; low quality keeps the flare's shape with fewer rings.
 */
export const TRUNK_FLARE = 1.75;
const TRUNK_PROFILE: Record<Quality, readonly (readonly [number, number])[]> = {
  high: [
    [-0.02, 1.95],
    [0, TRUNK_FLARE],
    [0.006, 1.42],
    [0.016, 1.18],
    [0.035, 1.05],
    [0.1, 1.0],
    [0.4, 0.95],
    [0.75, 0.88],
    [1, 0.82],
  ],
  low: [
    [-0.02, 1.95],
    [0, TRUNK_FLARE],
    [0.016, 1.18],
    [0.1, 1.0],
    [1, 0.82],
  ],
};
const TRUNK_SIDES = { high: 12, low: 8 } as const;
/** A typical trunk is this many times taller than it is wide: the flare's normals lean by it. */
const TRUNK_ASPECT = 30;
/** Bark tiles: repeats round the trunk and up its (unit) height. */
const BARK_ROUND = 2;
const BARK_UP = 12;
/** Moss on the flare (share of the height), and the canopy's shade toward the top. */
const TRUNK_MOSS_UP = 0.03;
const TRUNK_SHADE_FROM = 0.5;
const TRUNK_SHADE_TOP = 0.35;

/** A fallen log along x (unit length, centred), resting on y = 0: moss along its top, pale broken ends. */
export function logGeometry(c: ForestColours): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const ring = (x: number, k: number): P3[] =>
    Array.from({ length: LOG_SIDES }, (_, i) => {
      const a = (i / LOG_SIDES) * Math.PI * 2;
      return { x, y: LOG_RADIUS + Math.sin(a) * LOG_RADIUS * k, z: Math.cos(a) * LOG_RADIUS * k };
    });
  const A = ring(-0.5, 1);
  const B = ring(0.5, 0.85);
  for (let i = 0; i < LOG_SIDES; i++) {
    const j = (i + 1) % LOG_SIDES;
    const up = Math.sin(((i + 0.5) / LOG_SIDES) * Math.PI * 2) > 0.3;
    const col = up ? c.bark.clone().lerp(c.moss, 0.65) : c.bark.clone().multiplyScalar(i % 2 ? 0.7 : 0.9);
    quadFacing(b, A[i], B[i], B[j], A[j], { x: 0, y: A[i].y - LOG_RADIUS, z: A[i].z }, col);
  }
  // The broken ends: the heartwood, pale and ragged.
  const heart = c.wood;
  for (const [R, x, dir] of [[A, -0.5, -1], [B, 0.5, 1]] as const) {
    const centre = { x: x + dir * 0.02, y: LOG_RADIUS, z: 0 };
    for (let i = 0; i < LOG_SIDES; i++) {
      const j = (i + 1) % LOG_SIDES;
      if (dir > 0) b.tri(R[i], centre, R[j], heart);
      else b.tri(R[j], centre, R[i], heart);
    }
  }
  return finish(b, 'log');
}

/**
 * A waymarker: a small tapered, mossy standing stone with a band of runes near its top. One lit
 * mesh: the runes' colour (`rune`) is painted past white so they glow under any light.
 */
export function waymarkerGeometry(c: ForestColours, rune: THREE.Color): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const sides = STONE_SIDES;
  const pts = rings(
    [
      [-1, STONE_FOOT],
      [RUNE_BAND[0], STONE_TOP * 1.15],
      [STONE_H, STONE_TOP],
    ],
    sides,
    0.15,
  );
  const mossy = c.stone.clone().lerp(c.moss, 0.55);
  skin(b, pts, (i, r) => (r === 0 ? mossy : c.stone.clone().multiplyScalar(i % 2 ? 0.86 : 1)));
  const top = { x: 0, y: STONE_H + 0.2, z: 0 };
  const last = pts[pts.length - 1];
  for (let i = 0; i < sides; i++) b.tri(last[(i + 1) % sides], last[i], top, mossy);
  const band = rings(
    [
      [RUNE_BAND[0], STONE_TOP * 1.15 + 0.03],
      [RUNE_BAND[1], STONE_TOP * 1.1 + 0.03],
    ],
    sides,
    0.15,
  );
  skin(b, band, () => rune);
  return finish(b, 'waymarker');
}

/** Appends a built prop (positions and colours) to a merged builder, moved by `m`, its colours × `tint`. */
export function stamp(b: FlatBuilder, geo: THREE.BufferGeometry, m: THREE.Matrix4, tint: THREE.Color): void {
  const p = geo.getAttribute('position');
  const c = geo.getAttribute('color');
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const k = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  for (let i = 0; i < p.count; i += 3) {
    for (let j = 0; j < 3; j++) {
      v[j].fromBufferAttribute(p, i + j).applyMatrix4(m);
      k[j].setRGB(c.getX(i + j), c.getY(i + j), c.getZ(i + j)).multiply(tint);
    }
    b.tri(v[0], v[1], v[2], k[0], k[1], k[2]);
  }
}
