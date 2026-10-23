// The sand beast's body, shared by its free-running breach and its course-hazard roles: an
// armoured skull with three splaying jaws and a glowing gullet, then plated segments with a
// dorsal ridge and luminous flank stripes. Every segment is its own bone; callers pose them.

import * as THREE from 'three';
import type { TrackPalette } from '../../../core/types.ts';
import { T, box, col, cyl, mix, shade, type Particles, type Rig } from './kit.ts';

/** Head radius the skull is modelled at; other sizes scale from it. */
const HEAD_MODEL_R = 13;
const JAW_OPEN_MAX = 1.05;
/** Jaw petals, and how far they lean in over the gullet when shut. */
const JAWS = 5;
const JAW_REST = 0.42;

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
  // Dark, sand-scoured armour: it should read as ancient and immensely heavy, not bright.
  const carapace = mix(p.rock, 0x1a1618, 0.65);
  const plate = mix(carapace, p.sand, 0.18);
  return {
    sand: col(p.sand),
    carapace,
    plate,
    plateEdge: shade(plate, 1.18),
    belly: mix(p.sand, carapace, 0.55),
    lumen: shade(mix(p.accent, 0x40ffc0, 0.6), 0.8),
    maw: col(0xff5a20),
    tooth: col(0xffc070),
    gullet: col(0xffe0a0),
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
  // Skull: a heavy armoured collar wider than the body, brow plates stacked like shingles.
  rig.add(cyl(headR * 1.18, headR * 0.98, 18 * q, 7).rotateX(-Math.PI / 2).translate(0, 0, 0), c.carapace, H);
  for (let k = 0; k < 3; k++) {
    rig.add(box(headR * (1.9 - k * 0.3), headR * 0.28, 9 * q), k % 2 ? c.plate : c.plateEdge, { bone: head, m: T(0, headR * (1.02 + k * 0.1), (-4 - k * 6) * q, -0.12 - k * 0.05) });
  }
  // The gullet: a glowing funnel ringed with rows of glowing teeth.
  rig.add(new THREE.ConeGeometry(headR * 0.95, 12 * q, 9, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -5 * q), c.maw, { bone: head, layer: 'glow' });
  for (const [ring, n, len] of [[0.92, 14, 4.5], [0.6, 10, 3.2]] as const) {
    for (let t = 0; t < n; t++) {
      const a = (t / n) * Math.PI * 2 + ring;
      // Raked inward and forward, like a lamprey's.
      rig.add(new THREE.ConeGeometry(0.8 * q, len * q, 4).rotateX(Math.PI / 2).applyMatrix4(T(0, 0, 0, 0.9, 0, 0)), c.tooth, {
        bone: head,
        layer: 'glow',
        m: T(Math.cos(a) * headR * ring, Math.sin(a) * headR * ring, -1 * q, 0, 0, a - Math.PI / 2),
      });
    }
  }
  // Five armoured jaw petals around the rim: closed they form a blunt beak, open they splay.
  const jaws: THREE.Bone[] = [];
  for (let k = 0; k < JAWS; k++) {
    const pivot = rig.bone(head, 0, 0, 0);
    pivot.rotation.z = (k / JAWS) * Math.PI * 2;
    const jaw = rig.bone(pivot, 0, headR * 0.85, 0);
    rig.add(new THREE.ConeGeometry(headR * 0.62, 22 * q, 3).rotateX(Math.PI / 2).scale(1.25, 0.55, 1), k % 2 ? c.plate : c.carapace, { bone: jaw, m: T(0, 0, 10 * q) });
    for (let t = 0; t < 5; t++) {
      rig.add(new THREE.ConeGeometry(0.7 * q, 3.4 * q, 4).rotateX(Math.PI), c.tooth, { bone: jaw, layer: 'glow', m: T((t % 2 ? 1 : -1) * 1.6 * q, -1.4 * q, (3 + t * 3.4) * q) });
    }
    jaws.push(jaw);
  }

  // Body: overlapping armour bands. Each band flares toward the tail so its rear lip rides
  // over the next band's front, like a pangolin's scales, and the bands blur into one mass.
  const segs: Segment[] = [];
  for (let i = 0; i < nSeg; i++) {
    const r = radiusAt(i);
    const bone = rig.bone();
    const L = segLen * 1.5;
    rig.add(cyl(r * 0.9, r * 1.12, L, 7).rotateX(Math.PI / 2).translate(0, 0, -0.7 * L), c.carapace, { bone });
    rig.add(box(r * 1.35, r * 0.24, L * 0.9), i % 3 === 1 ? c.plateEdge : c.plate, { bone, m: T(0, r * 0.98, -0.4 * L, -0.07) });
    rig.add(box(r * 0.14, r * 0.3, L * 0.85), c.carapace, { bone, m: T(0, r * 1.18, -0.4 * L) });
    rig.add(box(r * 1.4, r * 0.3, L * 0.85), c.belly, { bone, m: T(0, -r * 0.9, -0.4 * L) });
    for (const sx of [-1, 1]) {
      rig.add(box(r * 0.3, r * 1.15, L * 0.9), c.plate, { bone, m: T(sx * r * 0.98, r * 0.05, -0.4 * L, 0, 0, sx * 0.3) });
      // Breathing vents low on the flank, on every other band.
      if (i % 2 === 0) rig.add(box(r * 0.05, r * 0.12, L * 0.45), c.lumen, { bone, layer: 'glow', m: T(sx * r * 1.12, -r * 0.35, -0.45 * L) });
    }
    if (i === nSeg - 1) rig.add(new THREE.ConeGeometry(r, r * 4, 7).rotateX(-Math.PI / 2), c.carapace, { bone, m: T(0, 0, -L - r * 1.6) });
    segs.push({ bone, r });
  }
  return { head, jaws, segs, headR };
}

/** Opens the jaws 0..1, with a slow working of the petals while they're open. */
export function setJaws(b: Beast, open: number, time: number): void {
  const a = JAW_OPEN_MAX * open;
  b.jaws.forEach((j, k) => (j.rotation.x = JAW_REST - a - Math.sin(time * 1.6 + k * 1.3) * 0.06 * open));
}

/**
 * Writes the beast's lamps from fixed slot `first`: two for the gullet, then one luminous spot
 * on every third segment. Returns the next free slot. Hidden parts get dark lamps.
 */
export function beastLamps(rig: Rig, b: Beast, glow: Particles, first: number, open: number, time: number, boost: number, c: BeastColours, out: THREE.Vector3): number {
  let li = first;
  if (b.head.scale.x > 0) {
    rig.local(b.head, 0, 0, -b.headR * 0.2, out);
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
    rig.local(s.bone, s.r * 1.15, -s.r * 0.35, -0.45 * s.r, out);
    glow.lamp(li++, out.x, out.y, out.z, s.r * 0.7, c.lumen, (0.3 + 0.2 * Math.sin(time * 0.9 - k * 0.7)) * boost);
  }
  return li;
}

/** Fixed lamp slots beastLamps uses for a beast of `nSeg` segments. */
export function beastLampCount(nSeg: number): number {
  return 2 + Math.ceil(nSeg / 3);
}
