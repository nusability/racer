// The sand beast's body: one continuous hide stretched over a chain of bones, so the worm bends
// as a single heavy tube instead of a stack of rigid blocks. The hide is ringed with armour
// bands that flare toward the tail, each rear lip riding over the next band like a pangolin's
// scales, dark and dusted with sand on the back, paler on the belly, the lips scoured bright.
// The head is an armoured collar round a maw of three heavy petals that splay open on a throat
// lined with rings of hooked teeth. Built in metres; callers pose and scale the bones.

import * as THREE from 'three';
import type { TrackPalette } from '../../../core/types.ts';
import { T, col, mix, mulberry32, shade, type Particles, type Rig } from './kit.ts';

/**
 * Profile of one armour band along its bone, from the bone (front, tucked under the band ahead)
 * back toward the tail: [z as a share of the band length behind the bone, radius over the
 * body radius]. The flare to 1.04 then the drop to the next band's 0.86 is the overlapping lip.
 */
const BAND: readonly (readonly [number, number])[] = [
  [0, 0.86],
  [0.55, 1],
  [0.86, 1.04],
];
/** The ring at the rear lip is scoured bright by the sand. */
const LIP_RING = 2;
/** Radial facets of the hide (high and low quality). */
const SIDES = { high: 14, low: 9 } as const;
/** Hide colour bands by angle from the spine: the back, the flanks, then the belly. */
const FLANK_FROM = 0.3;
const BELLY_FROM = 0.68;
/** Colour noise per vertex, and the share of back vertices dusted with sand. */
const COLOUR_JITTER = 0.07;
const SAND_DUST = 0.35;
/** Radius wobble per vertex: hide worn uneven, not turned on a lathe. */
const WOBBLE = 0.035;
/** The tail tapers over this share of the body, to this share of the radius. */
const TAIL_SHARE = 0.3;
const TAIL_TIP = 0.3;

// --- Head (in units of the head radius) ---
/** The skull: rings along the head's +Z (snout) from where the hide meets it to the rim. */
const COLLAR: readonly (readonly [number, number])[] = [
  [-1.15, 0.9],
  [-0.7, 1.02],
  [-0.25, 1],
  [0.12, 0.93],
];
/** A brow shield over the top of the skull: its arc (radians) and reach back from the rim. */
const BROW_ARC = 1.9;
const BROW: readonly [number, number] = [-0.95, 0.02];
const PETALS = 3;
const PETAL_LEN = 1.55;
/** Petals splay this far open (radians), working by WORK while they gape. */
const PETAL_OPEN = 1.05;
/** Share of its third of the rim each petal spans: the gaps between show the fleshy lip. */
const PETAL_SPAN = 0.82;
/** The fleshy lip round the rim, inside the petals: its tube radius over the head radius. */
const LIP = 0.13;
const PETAL_WORK = 0.06;
/** Teeth down each petal's inner face: rows, per row, length (head radii), and where the rows
 * start and how far apart they are (shares of the petal's length). */
const PETAL_TEETH = { rows: 4, per: 3, len: 0.26, from: 0.12, step: 0.2 } as const;
/** Throat: mouth radius, depth, and rings of teeth on its wall: [depth share, count, length]. */
const THROAT_R = 0.88;
const THROAT_DEPTH = 1.1;
/** Throat teeth rake back down the throat this far from pointing straight in, radians. */
const THROAT_RAKE = 0.5;
/** Petal teeth rake back toward the throat, radians. */
const PETAL_RAKE = 0.4;
const THROAT_RINGS: readonly (readonly [number, number, number])[] = [
  [0.15, 12, 0.3],
  [0.45, 10, 0.24],
  [0.75, 8, 0.18],
];

export interface BeastColours {
  sand: THREE.Color;
  carapace: THREE.Color;
  plate: THREE.Color;
  scour: THREE.Color;
  belly: THREE.Color;
  throat: THREE.Color;
  tooth: THREE.Color;
  gullet: THREE.Color;
}

export function beastColours(p: TrackPalette): BeastColours {
  // Dark, sand-scoured armour: it should read as ancient and immensely heavy, not bright.
  const carapace = mix(p.rock, 0x1a1512, 0.8);
  const plate = mix(carapace, p.sand, 0.12);
  return {
    sand: col(p.sand),
    carapace,
    plate,
    scour: mix(plate, p.sand, 0.5),
    belly: mix(p.sand, carapace, 0.55),
    throat: col(0x3a0c0a),
    tooth: col(0xd8cbb0),
    gullet: col(0xff6a28),
  };
}

export interface Segment {
  bone: THREE.Bone;
  /** Body radius at this band, metres. */
  r: number;
}

export interface Beast {
  head: THREE.Bone;
  petals: THREE.Bone[];
  segs: Segment[];
  headR: number;
  /** Metres from the head bone back to the first band's bone. */
  neck: number;
}

/**
 * Builds the beast into `rig`: a head of radius `headR`, then `nSeg` bands `segLen` apart of
 * body radius `r` (tapering at the tail). The head's +Z is its snout; each band's +Z points
 * headward and its hide reaches back to the next band's bone.
 */
export function buildBeast(rig: Rig, c: BeastColours, r: number, headR: number, nSeg: number, segLen: number, quality: 'high' | 'low', seed: number): Beast {
  const rng = mulberry32(seed);
  const hi = quality === 'high';
  const head = rig.bone();
  const petals = buildHead(rig, head, c, headR, hi, rng);
  const segs: Segment[] = [];
  for (let i = 0; i < nSeg; i++) {
    const u = i / (nSeg - 1);
    const taper = u < 1 - TAIL_SHARE ? 1 : 1 - (1 - TAIL_TIP) * ((u - (1 - TAIL_SHARE)) / TAIL_SHARE);
    segs.push({ bone: rig.bone(), r: r * taper });
  }
  buildHide(rig, segs, c, segLen, SIDES[quality], rng);
  const last = segs[nSeg - 1];
  rig.add(new THREE.ConeGeometry(last.r * 0.9, last.r * 3, SIDES[quality]).rotateX(-Math.PI / 2).translate(0, 0, -segLen * 0.86 - last.r * 1.5), c.carapace, { bone: last.bone });
  return { head, petals, segs, headR, neck: beastNeck(headR) };
}

/** Metres from the head bone back to where the hide begins, for a head of radius `headR`. */
export function beastNeck(headR: number): number {
  return headR * -COLLAR[0][0];
}

/** The hide: rings on every band (BAND), stretched band to band; the last band closes on its own. */
function buildHide(rig: Rig, segs: Segment[], c: BeastColours, segLen: number, sides: number, rng: () => number): void {
  const rings: { bone: THREE.Bone; z: number; r: number; lip: boolean }[] = [];
  for (const s of segs) for (let k = 0; k < BAND.length; k++) rings.push({ bone: s.bone, z: -BAND[k][0] * segLen, r: BAND[k][1] * s.r, lip: k === LIP_RING });
  // Per-ring vertex positions (bone frame) and colours.
  const ringPos: Float32Array[] = [];
  const ringCol: Float32Array[] = [];
  const tmp = new THREE.Color();
  for (const ring of rings) {
    const p = new Float32Array(sides * 3);
    const q = new Float32Array(sides * 3);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const rr = ring.r * (1 + (rng() - 0.5) * 2 * WOBBLE);
      p[j * 3] = Math.sin(a) * rr;
      p[j * 3 + 1] = Math.cos(a) * rr;
      p[j * 3 + 2] = ring.z;
      // 0 on the spine, 1 under the belly.
      const around = Math.abs(a > Math.PI ? a - Math.PI * 2 : a) / Math.PI;
      const base = around < FLANK_FROM ? c.carapace : around < BELLY_FROM ? c.plate : c.belly;
      tmp.copy(ring.lip && around < BELLY_FROM ? c.scour : base);
      if (around < FLANK_FROM && rng() < SAND_DUST) tmp.lerp(c.sand, 0.35);
      tmp.multiplyScalar(1 + (rng() - 0.5) * 2 * COLOUR_JITTER);
      q[j * 3] = tmp.r;
      q[j * 3 + 1] = tmp.g;
      q[j * 3 + 2] = tmp.b;
    }
    ringPos.push(p);
    ringCol.push(q);
  }
  // The rings of one band are rigid; between bands the hide stretches, so the stretch's
  // vertices are authored in the next band's frame: its first ring is AT that band's bone.
  const pos: number[] = [];
  const colr: number[] = [];
  const bones: THREE.Bone[] = [];
  const vert = (ri: number, j: number) => {
    const jj = j % sides;
    const p = ringPos[ri];
    const q = ringCol[ri];
    pos.push(p[jj * 3], p[jj * 3 + 1], p[jj * 3 + 2]);
    colr.push(q[jj * 3], q[jj * 3 + 1], q[jj * 3 + 2]);
    bones.push(rings[ri].bone);
  };
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let j = 0; j < sides; j++) {
      // Quad (ri, j) (ri, j+1) (ri+1, j+1) (ri+1, j), wound to face outward.
      vert(ri, j);
      vert(ri, j + 1);
      vert(ri + 1, j);
      vert(ri, j + 1);
      vert(ri + 1, j + 1);
      vert(ri + 1, j);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rig.addSkin(geo, bones, new Float32Array(colr));
}

/** Collar, throat with its teeth, and the three petals (returned, as hinge bones). */
function buildHead(rig: Rig, head: THREE.Bone, c: BeastColours, hr: number, hi: boolean, rng: () => number): THREE.Bone[] {
  const H = { bone: head };
  const sides = hi ? SIDES.high : SIDES.low;
  // Skull: a lathe along +Z, carrying on from the hide, under a heavy brow shield.
  const lathe = new THREE.LatheGeometry(COLLAR.map(([z, rr]) => new THREE.Vector2(rr * hr, z * hr)), sides).rotateX(Math.PI / 2);
  rig.add(lathe, c.carapace, H);
  const browLen = (BROW[1] - BROW[0]) * hr;
  const brow = new THREE.CylinderGeometry(hr * 1.07, hr * 1.1, browLen, 6, 1, true, -BROW_ARC / 2, BROW_ARC).rotateX(Math.PI / 2).rotateZ(Math.PI);
  rig.add(brow, c.scour, { bone: head, m: T(0, 0, ((BROW[0] + BROW[1]) / 2) * hr) });
  // The throat: an inward-facing funnel into the dark, its wall ringed with hooked teeth.
  const rimZ = COLLAR[COLLAR.length - 1][0];
  rig.add(inward(new THREE.ConeGeometry(hr * THROAT_R, THROAT_DEPTH * hr, sides, 1, true).rotateX(-Math.PI / 2).translate(0, 0, (rimZ - THROAT_DEPTH / 2) * hr)), c.throat, H);
  rig.add(new THREE.CircleGeometry(hr * 0.32, 8), c.gullet, { bone: head, layer: 'glow', m: T(0, 0, (rimZ - THROAT_DEPTH * 0.85) * hr) });
  for (const [depth, n, len] of hi ? THROAT_RINGS : THROAT_RINGS.slice(0, 2)) {
    const z = (rimZ - depth * THROAT_DEPTH) * hr;
    const ringR = hr * THROAT_R * (1 - depth);
    for (let t = 0; t < n; t++) {
      const a = (t / n) * Math.PI * 2 + depth * 3;
      // Pointing in toward the axis and raked back down the throat, like a lamprey's.
      rig.add(tooth(len * hr), c.tooth, { bone: head, m: T(Math.sin(a) * ringR, Math.cos(a) * ringR, z, 0, 0, -a).multiply(T(0, 0, 0, Math.PI + THROAT_RAKE)) });
    }
  }
  // Petals: each a third of a cone round the rim, hinged at the rim on its centre line.
  const petals: THREE.Bone[] = [];
  const thetaLen = ((Math.PI * 2) / PETALS) * PETAL_SPAN;
  const rimR = COLLAR[COLLAR.length - 1][1] * hr;
  rig.add(new THREE.TorusGeometry(rimR * (1 - LIP), LIP * hr, 5, sides * 2), c.throat, { bone: head, m: T(0, 0, rimZ * hr) });
  for (let k = 0; k < PETALS; k++) {
    const turn = rig.bone(head, 0, 0, rimZ * hr);
    turn.rotation.z = (k / PETALS) * Math.PI * 2;
    const hinge = rig.bone(turn, 0, rimR, 0);
    // Cone apex forward (+Z), its base on the rim: centred on +Y so the petal's spine is up.
    const shell = () => new THREE.ConeGeometry(rimR, PETAL_LEN * hr, 7, 1, true, -thetaLen / 2, thetaLen).rotateX(Math.PI / 2).rotateZ(Math.PI).translate(0, -rimR, (PETAL_LEN / 2) * hr);
    rig.add(shell(), k === 0 ? c.carapace : c.plate, { bone: hinge });
    rig.add(inward(shell().scale(0.94, 0.94, 0.97).translate(0, -0.06 * rimR, 0)), c.throat, { bone: hinge });
    for (let row = 0; row < PETAL_TEETH.rows; row++) {
      const along = (PETAL_TEETH.from + row * PETAL_TEETH.step) * PETAL_LEN;
      const reach = 1 - along / PETAL_LEN;
      for (let t = 0; t < PETAL_TEETH.per; t++) {
        const a = ((t + 0.5) / PETAL_TEETH.per - 0.5) * thetaLen * 0.8;
        const x = Math.sin(a) * rimR * reach * 0.9;
        const y = -rimR + Math.cos(a) * rimR * reach * 0.9;
        rig.add(tooth(PETAL_TEETH.len * hr * (0.7 + rng() * 0.5) * reach), c.tooth, { bone: hinge, m: T(x, y, along * hr, 0, 0, Math.PI - a).multiply(T(0, 0, 0, -PETAL_RAKE)) });
      }
    }
    petals.push(hinge);
  }
  return petals;
}

/** A hooked tooth along +Y from the origin, base 0.3 of its length wide. */
function tooth(len: number): THREE.BufferGeometry {
  return new THREE.ConeGeometry(len * 0.17, len, 4).translate(0, len / 2, 0);
}

/** Turns a surface to face inward (seen from inside a funnel or a petal's hollow). */
function inward(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const p = g.getAttribute('position');
  for (let t = 0; t < p.count; t += 3) {
    const x = p.getX(t + 1), y = p.getY(t + 1), z = p.getZ(t + 1);
    p.setXYZ(t + 1, p.getX(t + 2), p.getY(t + 2), p.getZ(t + 2));
    p.setXYZ(t + 2, x, y, z);
  }
  g.deleteAttribute('normal');
  return g;
}

/** Opens the maw 0..1, the petals working slowly while it gapes. */
export function setMaw(b: Beast, open: number, time: number): void {
  // A negative turn about the hinge tips the petal's point out, away from the axis.
  b.petals.forEach((p, k) => (p.rotation.x = -(PETAL_OPEN + Math.sin(time * 1.7 + k * 2.1) * PETAL_WORK) * open));
}

/** Lamp slots beastLamps uses. */
export const BEAST_LAMPS = 2;

/** The throat's glow (two fixed lamp slots from `first`), dark when the head is hidden. */
export function beastLamps(rig: Rig, b: Beast, glow: Particles, first: number, open: number, boost: number, c: BeastColours, out: THREE.Vector3): void {
  if (b.head.scale.x === 0) {
    glow.lamp(first, 0, -1000, 0, 0, c.gullet, 0);
    glow.lamp(first + 1, 0, -1000, 0, 0, c.gullet, 0);
    return;
  }
  const k = b.head.scale.x;
  rig.local(b.head, 0, 0, -b.headR * THROAT_DEPTH * 0.6, out);
  glow.lamp(first, out.x, out.y, out.z, b.headR * k * 1.8 * open, c.gullet, 0.7 * open * boost);
  glow.lamp(first + 1, out.x, out.y, out.z, b.headR * k * 0.7, shade(c.gullet, 1.2), 0.5 * open * boost);
}
