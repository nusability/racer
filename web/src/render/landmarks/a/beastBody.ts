// The sand beast's body, shared by its free-running breach and its course-hazard roles: an
// armoured skull with three splaying jaws and a glowing gullet, then plated segments with a
// dorsal ridge and luminous flank stripes. Every segment is its own bone; callers pose them.

import * as THREE from 'three';
import type { TrackPalette } from '../../../core/types.ts';
import { T, box, col, cyl, mix, shade, type Particles, type Rig } from './kit.ts';

/** Head radius the skull is modelled at; other sizes scale from it. */
const HEAD_MODEL_R = 13;
const JAW_OPEN_MAX = 0.75;

export interface BeastColours {
  sand: THREE.Color;
  carapace: THREE.Color;
  plate: THREE.Color;
  plateEdge: THREE.Color;
  belly: THREE.Color;
  lumen: THREE.Color;
  maw: THREE.Color;
  tooth: THREE.Color;
  gullet: THREE.Color;
}

export function beastColours(p: TrackPalette): BeastColours {
  const carapace = mix(p.rock, 0x2e2834, 0.45);
  const plate = mix(carapace, p.sand, 0.25);
  return {
    sand: col(p.sand),
    carapace,
    plate,
    plateEdge: shade(plate, 1.35),
    belly: mix(p.sand, 0xf4e8d8, 0.3),
    lumen: mix(p.accent, 0x70ffd0, 0.55),
    maw: col(0xff6a30),
    tooth: col(0xf4ecd8),
    gullet: col(0xfff0c0),
  };
}

export interface Segment {
  bone: THREE.Bone;
  r: number;
}

export interface Beast {
  head: THREE.Bone;
  jaws: THREE.Bone[];
  segs: Segment[];
  headR: number;
}

/**
 * Builds the beast into `rig`: `radiusAt(i)` gives segment i's radius (0 = just behind the
 * head), all in local units. The head's +Z is its snout; each segment's +Z points headward.
 */
export function buildBeast(
  rig: Rig,
  c: BeastColours,
  headR: number,
  nSeg: number,
  segLen: number,
  radiusAt: (i: number) => number,
  hi: boolean,
): Beast {
  const q = headR / HEAD_MODEL_R;
  const head = rig.bone();
  const H = { bone: head };
  rig.add(cyl(headR * 0.7, headR * 1.05, 16 * q, 6).rotateX(Math.PI / 2).translate(0, 0, -12 * q), c.carapace, H);
  rig.add(box(headR * 1.4, headR * 0.5, 14 * q), c.plate, { bone: head, m: T(0, headR * 0.75, -6 * q, -0.12) });
  rig.add(new THREE.CircleGeometry(headR * 0.6, 8), c.maw, { bone: head, layer: 'glow', m: T(0, 0, 3.5 * q) });
  const jaws: THREE.Bone[] = [];
  for (let k = 0; k < 3; k++) {
    const pivot = rig.bone(head, 0, 0, 3 * q);
    pivot.rotation.z = (k / 3) * Math.PI * 2;
    const jaw = rig.bone(pivot, 0, headR * 0.45, 0);
    rig.add(new THREE.ConeGeometry(headR * 0.55, 18 * q, 3).rotateX(Math.PI / 2).scale(1.3, 0.6, 1), c.plate, { bone: jaw, m: T(0, 0, 9 * q) });
    for (let t = 0; t < 4; t++) {
      rig.add(new THREE.ConeGeometry(0.9 * q, 3.5 * q, 4).rotateX(Math.PI), c.tooth, { bone: jaw, m: T((t - 1.5) * 1.8 * q, -1.6 * q, (4 + t * 3) * q) });
    }
    rig.add(box(0.5 * q, 0.5 * q, 12 * q), c.lumen, { bone: jaw, layer: 'glow', m: T(0, 1.4 * q, 8 * q) });
    jaws.push(jaw);
  }
  for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
    rig.add(cyl(0.25 * q, 0.6 * q, 16 * q, 4).rotateX(Math.PI / 2 - sy * 0.35).rotateY(sx * 0.6), c.plateEdge, { bone: head, m: T(sx * headR * 0.8, sy * headR * 0.4, -4 * q) });
  }

  const segs: Segment[] = [];
  for (let i = 0; i < nSeg; i++) {
    const r = radiusAt(i);
    const bone = rig.bone();
    const L = segLen * 1.18;
    rig.add(cyl(r, r * 1.04, L, 8).rotateX(Math.PI / 2).translate(0, 0, -L / 2), c.carapace, { bone });
    rig.add(box(r * 1.5, r * 0.38, L * 1.04), i % 2 ? c.plate : c.plateEdge, { bone, m: T(0, r * 0.9, 0, -0.16) });
    rig.add(box(r * 1.3, r * 0.3, L * 0.95), c.belly, { bone, m: T(0, -r * 0.85, 0) });
    for (const sx of [-1, 1]) {
      rig.add(box(r * 0.35, r * 1.1, L * 0.95), c.plate, { bone, m: T(sx * r * 0.92, r * 0.1, 0, 0, 0, sx * 0.25) });
      rig.add(box(r * 0.04, r * 0.18, L * 0.7), c.lumen, { bone, layer: 'glow', m: T(sx * r * 1.1, -r * 0.15, 0) });
    }
    if (i % 2 === 0 || !hi) rig.add(new THREE.ConeGeometry(r * 0.32, r * 1.1, 4).rotateX(-0.5), c.plateEdge, { bone, m: T(0, r * 1.35, -L * 0.1) });
    if (i === nSeg - 1) rig.add(new THREE.ConeGeometry(r, r * 3, 8).rotateX(-Math.PI / 2), c.carapace, { bone, m: T(0, 0, -L / 2 - r * 1.5) });
    segs.push({ bone, r });
  }
  return { head, jaws, segs, headR };
}

/** Opens the jaws 0..1, with a hungry tremor while they're open. */
export function setJaws(b: Beast, open: number, time: number): void {
  const a = JAW_OPEN_MAX * open;
  for (const j of b.jaws) j.rotation.x = -a - Math.sin(time * 6) * 0.05 * a;
}

/**
 * Writes the beast's lamps from fixed slot `first`: two for the gullet, then one luminous spot
 * on every third segment. Returns the next free slot. Hidden parts get dark lamps.
 */
export function beastLamps(rig: Rig, b: Beast, glow: Particles, first: number, open: number, time: number, boost: number, c: BeastColours, out: THREE.Vector3): number {
  let li = first;
  if (b.head.scale.x > 0) {
    rig.local(b.head, 0, 0, b.headR * 0.46, out);
    glow.lamp(li++, out.x, out.y, out.z, b.headR * 2.3 * (0.3 + open), c.maw, (0.5 + open) * boost);
    glow.lamp(li++, out.x, out.y, out.z, b.headR * 1.1, c.gullet, boost);
  } else {
    glow.lamp(li++, 0, -1000, 0, 0, c.maw, 0);
    glow.lamp(li++, 0, -1000, 0, 0, c.maw, 0);
  }
  for (let k = 0; k * 3 < b.segs.length; k++) {
    const s = b.segs[k * 3];
    if (s.bone.scale.x === 0) {
      glow.lamp(li++, 0, -1000, 0, 0, c.lumen, 0);
      continue;
    }
    rig.local(s.bone, s.r * 1.15, -s.r * 0.15, 0, out);
    glow.lamp(li++, out.x, out.y, out.z, s.r * 1.2, c.lumen, (0.45 + 0.35 * Math.sin(time * 3 - k)) * boost);
  }
  return li;
}

/** Fixed lamp slots beastLamps uses for a beast of `nSeg` segments. */
export function beastLampCount(nSeg: number): number {
  return 2 + Math.ceil(nSeg / 3);
}
