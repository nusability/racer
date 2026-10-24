import * as THREE from 'three';
import { mulberry32 } from '../../../core/rng.ts';
import { FlatBuilder, type P3 } from '../builder.ts';
import type { Quality } from '../config.ts';
import { quadFacing } from '../paint.ts';

// Elderwood's props, each built once around its own origin and then instanced (the giants'
// trunks and crown clumps, the deep woods' trees, fern patches) or stamped into the course's
// merged meshes (fallen logs, and the waymarker stones and lanterns that stand where other
// worlds put pylons and lamp posts). Colours are baked as they look; copies only vary the
// brightness (and a crown's green), so moss stays green on any bark.

/** Furrows spiral up the trunk this far per ring (radians). */
const TRUNK_TWIST = 0.07;
/** Buttress roots fanning out at the foot (high quality): how many, their reach (× radius) and height (× tree height). */
const ROOT_FINS = 5;
const ROOT_REACH = 2;
const ROOT_HEIGHT = 0.025;
/** Bark ridge and furrow shades; moss climbs one side up to this share of the height. */
const RIDGE = 1.1;
const FURROW = 0.66;
const MOSS_REACH = 0.22;
/** Foliage is this much darker underneath (the side seen from the trail) than on top. */
const CLUMP_UNDER = 0.45;
const CLUMP_TOP = 1.15;
/** Fern patch: ferns per patch, fronds per fern, frond length and rise (m), and spread of the patch. */
const FERNS = 3;
const FRONDS = 6;
const FROND_LENGTH = 2.6;
const FROND_RISE = 1.2;
const FROND_WIDTH = 0.55;
const PATCH_SPREAD = 2.6;
/** The bush behind a patch's ferns: [x, z, radius] (m), squashed this much, darker than the ferns. */
const BUSHES: readonly (readonly [number, number, number])[] = [[3.2, -2.6, 1.6]];
const BUSH_SQUASH = 0.7;
const BUSH_SHADE = 0.75;
/** Fallen log: facets, and its radius (it is a unit long, along x). */
const LOG_SIDES = 8;
const LOG_RADIUS = 0.09;
/** Waymarker stone: height, half-width at foot and top, and the rune band's height range (m). */
const STONE_H = 3.4;
/** Waymarkers line every course in their hundreds, merged into one mesh: four faces each. */
const STONE_SIDES = 4;
const STONE_FOOT = 0.55;
const STONE_TOP = 0.32;
const RUNE_BAND: readonly [number, number] = [2.3, 2.75];
/** Lantern post: height, the arm reaching over the road, the lantern's size (m). */
const LANTERN_POST = 7.5;
const LANTERN_ARM = 2.2;
const LANTERN_SIZE = 0.55;

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

/** Bark with furrows and moss up one side of the foot, per facet and ring. */
function barkColours(c: ForestColours, profile: readonly (readonly [number, number])[], sides: number, seed: number): THREE.Color[][] {
  const rng = mulberry32(seed);
  const shade = Array.from({ length: sides }, (_, i) => (i % 2 ? FURROW : RIDGE) * (0.9 + rng() * 0.2));
  return profile.map(([y]) =>
    Array.from({ length: sides }, (_, i) => {
      const col = c.bark.clone().multiplyScalar(shade[i]);
      const mossy = Math.max(0, 1 - Math.min(i, sides - i) / 2.5) * Math.max(0, 1 - Math.max(0, y) / MOSS_REACH);
      return col.lerp(c.moss, mossy);
    }),
  );
}

/** Buttress roots: thin fins from the flare out to the ground, both faces. */
function roots(b: FlatBuilder, c: ForestColours): void {
  const dark = c.bark.clone().multiplyScalar(0.8).lerp(c.moss, 0.35);
  for (let f = 0; f < ROOT_FINS; f++) {
    const a = (f / ROOT_FINS) * Math.PI * 2 + 0.4;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const top = { x: dx * 1.1, y: ROOT_HEIGHT, z: dz * 1.1 };
    const foot = { x: dx * 1.4, y: -0.005, z: dz * 1.4 };
    const tip = { x: dx * ROOT_REACH, y: -0.006, z: dz * ROOT_REACH };
    b.tri(top, foot, tip, dark);
    b.tri(top, tip, foot, dark);
  }
}

/** A lumpy ball of foliage (unit size) out of a jittered icosahedron, lighter on top and dark underneath. */
function foliage(b: FlatBuilder, colour: (light: number) => THREE.Color, place: (p: P3) => P3, seed: number): void {
  const rng = mulberry32(seed);
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const p = ico.getAttribute('position');
  // Shared corners take the same push, so a lump never opens a seam.
  const push = new Map<string, number>();
  const at = (i: number): P3 => {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let k = push.get(key);
    if (k === undefined) {
      k = 0.75 + rng() * 0.5;
      push.set(key, k);
    }
    return place({ x: x * k, y: y * k, z: z * k });
  };
  for (let i = 0; i < p.count; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    b.tri(at(i), at(i + 1), at(i + 2), colour(CLUMP_UNDER + (CLUMP_TOP - CLUMP_UNDER) * (0.5 + 0.5 * y)));
  }
  ico.dispose();
}

/**
 * A giant's trunk, in unit space (radius 1 above the flare, height 1 up into the canopy): a
 * straight, slowly tapering column with bark furrows, moss and buttress roots. From the trail
 * it fills the frame and rises out of it; its crown is the canopy ceiling (forest.ts), far
 * overhead, so the trunk carries none of its own.
 */
export function giantGeometry(c: ForestColours, quality: Quality): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const profile = quality === 'high' ? GIANT_PROFILE : GIANT_LOW_RINGS.map((i) => GIANT_PROFILE[i]);
  const sides = GIANT_SIDES[quality];
  const cols = barkColours(c, profile, sides, 0x7a11);
  skin(b, rings(profile, sides, TRUNK_TWIST), (i, r) => cols[r][i]);
  if (quality === 'high') roots(b, c);
  return finish(b, 'giant');
}
/**
 * The giant's trunk: ring heights (share of the tree) and radius multipliers, from the buried
 * root flare up into the crown. Straight and barely tapering: these are columns, not cones.
 */
const GIANT_PROFILE: readonly (readonly [number, number])[] = [
  [-0.04, 1.75],
  [0, 1.5],
  [0.03, 1.08],
  [0.5, 0.86],
  [0.8, 0.68],
  [1, 0.5],
];
const GIANT_LOW_RINGS = [0, 2, 3, 5];
const GIANT_SIDES = { high: 7, low: 5 } as const;
/**
 * A trunk of the deep woods (unit radius, unit height), as cheap as a tree can be: two crossed,
 * tapering planes, faced both ways. They stand from forty metres past the boundary into the
 * mist, rows deep, where only their silhouettes count; their tops fade into the haze (`mist`)
 * and the canopy ceiling closes over them.
 */
export function deepTreeGeometry(c: ForestColours, mist: THREE.Color): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const foot = c.bark.clone().multiplyScalar(FURROW);
  const top = c.bark.clone().lerp(mist, DEEP_FADE);
  for (const a of [0, Math.PI / 2]) {
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const p0 = { x: -dx * DEEP_FOOT, y: -0.03, z: -dz * DEEP_FOOT };
    const p1 = { x: dx * DEEP_FOOT, y: -0.03, z: dz * DEEP_FOOT };
    const p2 = { x: dx * DEEP_TOP, y: 1, z: dz * DEEP_TOP };
    const p3 = { x: -dx * DEEP_TOP, y: 1, z: -dz * DEEP_TOP };
    b.quad(p0, p1, p2, p3, foot, top);
    b.quad(p1, p0, p3, p2, foot, top);
  }
  return finish(b, 'deep tree');
}
/** The deep trunk's half-width at its foot and top (× radius), and how far its top fades into the haze. */
const DEEP_FOOT = 1.3;
const DEEP_TOP = 0.55;
const DEEP_FADE = 0.85;

/** A slab of the canopy ceiling (unit size, white: instances tint it their green), broad and thin. */
export function ceilingGeometry(): THREE.BufferGeometry {
  const b = new FlatBuilder();
  foliage(b, (v) => new THREE.Color(v, v, v), (p) => ({ x: p.x, y: p.y * CEILING_SQUASH, z: p.z }), 0xc10b);
  return finish(b, 'ceiling');
}
const CEILING_SQUASH = 0.22;

/** A patch of the forest floor: a few ferns in front of a low bush, on its own origin (ground at y = 0). */
export function fernPatchGeometry(c: ForestColours): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const rng = mulberry32(0xfe24);
  const tip = c.fern.clone().lerp(new THREE.Color(0xc8d860), 0.25);
  for (let f = 0; f < FERNS; f++) {
    const a0 = (f / FERNS) * Math.PI * 2;
    const cx = Math.cos(a0) * PATCH_SPREAD * (0.4 + rng() * 0.6);
    const cz = Math.sin(a0) * PATCH_SPREAD * (0.4 + rng() * 0.6);
    const size = 0.7 + rng() * 0.6;
    for (let k = 0; k < FRONDS; k++) {
      const a = (k / FRONDS) * Math.PI * 2 + rng() * 0.5;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const l = FROND_LENGTH * size;
      const w = FROND_WIDTH * size;
      // A frond rises and arches out: base at the crown, mid high, tip drooping to the ground.
      const base = { x: cx, y: 0.1, z: cz };
      const midL = { x: cx + dx * l * 0.5 - dz * w, y: FROND_RISE * size, z: cz + dz * l * 0.5 + dx * w };
      const midR = { x: cx + dx * l * 0.5 + dz * w, y: FROND_RISE * size, z: cz + dz * l * 0.5 - dx * w };
      const end = { x: cx + dx * l, y: 0.25 * size, z: cz + dz * l };
      // One face, turned up: ferns are seen from above and from the trail beside them.
      quadFacing(b, base, midR, end, midL, { x: 0, y: 1, z: 0 }, c.fern, c.fern, tip, c.fern);
    }
  }
  // Low bushes behind the ferns: the undergrowth that hides the forest floor's distance.
  BUSHES.forEach(([bx, bz, r], i) => {
    foliage(b, (v) => c.fern.clone().multiplyScalar(v * BUSH_SHADE), (p) => ({ x: bx + p.x * r, y: r * BUSH_SQUASH * 0.6 + p.y * r * BUSH_SQUASH, z: bz + p.z * r }), 0xb05 + i);
  });
  return finish(b, 'fern patch');
}

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
 * A waymarker: a tapered, mossy standing stone with a band of runes near its top. One lit mesh:
 * the runes' colour (`rune`) is painted past white so they glow under any light.
 */
export function waymarkerGeometry(c: ForestColours, rune: THREE.Color): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const sides = STONE_SIDES;
  const profile: [number, number][] = [
    [-1, STONE_FOOT],
    [RUNE_BAND[0], STONE_TOP * 1.15],
    [STONE_H, STONE_TOP],
  ];
  const pts = rings(profile, sides, 0.15);
  const mossy = c.stone.clone().lerp(c.moss, 0.55);
  // Moss on the foot, bare stone above.
  skin(b, pts, (i, r) => (r === 0 ? mossy : c.stone.clone().multiplyScalar(i % 2 ? 0.86 : 1)));
  const top = { x: 0, y: STONE_H + 0.35, z: 0 };
  const last = pts[pts.length - 1];
  for (let i = 0; i < sides; i++) b.tri(last[(i + 1) % sides], last[i], top, mossy);
  const band = rings([[RUNE_BAND[0], STONE_TOP * 1.15 + 0.03], [RUNE_BAND[1], STONE_TOP * 1.1 + 0.03]], sides, 0.15);
  skin(b, band, () => rune);
  return finish(b, 'waymarker');
}

/** A lantern post (lit part): a crooked timber post with an arm reaching toward the road (+X). */
export function lanternPostGeometry(c: ForestColours): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const post = rings([[-1, 0.28], [LANTERN_POST * 0.5, 0.22], [LANTERN_POST, 0.18]], 5, 0.4);
  skin(b, post, (i) => c.wood.clone().multiplyScalar(i % 2 ? 0.55 : 0.7));
  const arm0 = { x: 0, y: LANTERN_POST - 0.2, z: 0 };
  const arm1 = { x: LANTERN_ARM, y: LANTERN_POST + 0.3, z: 0 };
  const w = 0.12;
  const wood = c.wood.clone().multiplyScalar(0.6);
  quadFacing(b, { ...arm0, z: -w }, { ...arm1, z: -w }, { ...arm1, y: arm1.y + w * 2, z: -w }, { ...arm0, y: arm0.y + w * 2, z: -w }, { x: 0, y: 0, z: -1 }, wood);
  quadFacing(b, { ...arm0, z: w }, { ...arm1, z: w }, { ...arm1, y: arm1.y + w * 2, z: w }, { ...arm0, y: arm0.y + w * 2, z: w }, { x: 0, y: 0, z: 1 }, wood);
  quadFacing(b, { ...arm0, y: arm0.y + w * 2, z: -w }, { ...arm1, y: arm1.y + w * 2, z: -w }, { ...arm1, y: arm1.y + w * 2, z: w }, { ...arm0, y: arm0.y + w * 2, z: w }, { x: 0, y: 1, z: 0 }, wood);
  return finish(b, 'lantern post');
}

/** The lantern itself (unlit): a glowing bulb of a lamp hung from the arm's end. */
export function lanternGeometry(glow: THREE.Color): THREE.BufferGeometry {
  const b = new FlatBuilder();
  const ico = new THREE.IcosahedronGeometry(LANTERN_SIZE, 0);
  const p = ico.getAttribute('position');
  const y = LANTERN_POST - 0.6;
  for (let i = 0; i < p.count; i += 3) {
    const v = (j: number): P3 => ({ x: LANTERN_ARM + p.getX(i + j), y: y + p.getY(i + j) * 1.3, z: p.getZ(i + j) });
    b.tri(v(0), v(1), v(2), glow);
  }
  ico.dispose();
  return finish(b, 'lantern');
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
