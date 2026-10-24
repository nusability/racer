// The ground-effect skimmers: low, wide racing wings riding an air cushion, pushed by ducted
// fans at the back. Each must read differently from the chase camera, i.e. from behind and a
// little above: fan count and layout, wing planform and the fin silhouette.
import * as THREE from 'three';
import type { RacerVisual, RacerStyle } from '../core/types.ts';
import { placement } from './racerParts.ts';
import { BlueprintBuilder, DARK, METAL, SKID_Y, type Blueprint, type Detail } from './racerBlueprint.ts';

const SIDES = [-1, 1] as const;
/** Steer → flap deflection, radians. Ailerons move differentially (gain × −side). */
const RUDDER_GAIN = 0.45;
const AILERON_GAIN = 0.35;
const CANARD_GAIN = 0.45;

type StyleBuilder = (b: BlueprintBuilder) => void;

/** Mirror helper for outlines drawn on the right (+X) side. */
function mirrorOutline(right: [number, number][]): [number, number][] {
  return [...right, ...right.slice().reverse().map(([x, z]): [number, number] => [-x, z])];
}

/** Dustwing: a broad patched-up plank on two fans. Wide and stable-looking: the forgiving one. */
function skiff(b: BlueprintBuilder): void {
  const { p, s, a } = b.c;
  b.hull.slab(mirrorOutline([[1.3, -3.9], [3.2, -1.2], [3.5, 2.2], [1.0, 2.6]]), 0.32, -0.12, p);
  b.hull.slab(mirrorOutline([[1.0, -3.4], [2.8, -1.0], [3.0, 2.0], [0.9, 2.3]]), 0.14, -0.42, s);
  b.body({
    z: -4.6, length: 7.2, y: 0.02, radius: 0.82, squash: 0.62, segments: 8,
    shape: [[0.3, 0, a], [0.75, 0.08, p], [1, 0.3, p], [1, 0.62, s], [0.8, 0.88, s], [0.6, 1, DARK]],
    canopy: { from: 0.16, to: 0.44, width: 1.05, height: 0.42 },
  });
  for (const side of SIDES) {
    b.duct(side * 1.55, 0.36, 2.75, { radius: 0.62, length: 0.95, color: s, lip: a, segments: 14, vanes: 3 });
    b.hull.box(0.55, 0.4, 1.3, p, placement(side * 1.55, 0.0, 2.45));
    b.plate(side * 3.45, [[-1.4, -0.15], [-0.8, SKID_Y], [2.2, SKID_Y], [2.6, 0.15], [2.4, 0.55], [1.2, 0.55]], 0.1, p);
    b.plate(side * 3.47, [[1.2, 0.47], [2.4, 0.47], [2.42, 0.58], [1.2, 0.58]], 0.12, a);
    // Scrapyard patches: deliberately uneven sizes and angles.
    b.hull.box(0.9, 0.05, 0.7, side < 0 ? METAL : a, placement(side * 2.2, -0.09, -0.4, 0, side * 0.12, 0));
    b.hull.box(0.6, 0.05, 1.0, s, placement(side * 1.9, -0.09, 1.3, 0, -side * 0.2, 0));
    b.hull.box(0.08, 0.3, 0.5, METAL, placement(side * 0.85, 0.2, -1.6, 0, 0, side * 0.3));
    b.flap(placement(side * 2.65, -0.28, 2.3), [1.1, 0.08, 0.55], 'x', -side * AILERON_GAIN, s);
    b.flap(placement(side * 3.45, 0.2, 2.45), [0.08, 0.6, 0.5], 'y', RUDDER_GAIN, a);
    b.light(side * 3.5, 0.6, 1.0);
    b.tip(side * 3.45, 0.5, 2.45);
  }
  b.strip(new THREE.Vector3(-0.9, -0.22, 2.64), new THREE.Vector3(0.9, -0.22, 2.64), 0.07);
  b.cushion = { width: 6.4, length: 6.2, z: -0.5 };
}

/** Scarab GT: armoured catamaran; two hex sponsons, one huge central fan. */
function sponson(b: BlueprintBuilder): void {
  const { p, s, a } = b.c;
  for (const side of SIDES) {
    b.hull.lathe([
      { r: 0.47, z: -5.0, color: a }, { r: 0.77, z: -4.6, color: p }, { r: 0.85, z: -3.4, color: p },
      { r: 0.85, z: 2.2, color: s }, { r: 0.72, z: 4.2, color: DARK }, { r: 0.5, z: 4.6, color: DARK }, { r: 0, z: 4.62, color: DARK },
    ], 6, placement(side * 2.85, 0, 0, 0, 0, 0, 1, 0.75, 1), Math.PI / 6);
    b.hull.box(0.14, 0.62, 2.6, s, placement(side * 3.58, 0.02, -1.2));
    b.hull.box(0.17, 0.11, 2.7, a, placement(side * 3.62, 0.36, -1.2));
    b.hull.box(0.12, 0.45, 1.6, s, placement(side * 3.5, 0.0, 2.2));
    b.plate(side * 2.85, [[2.3, 0.45], [4.2, 0.45], [4.6, 1.3], [3.6, 1.3]], 0.14, p);
    b.flap(placement(side * 2.85, 0.95, 4.37), [0.1, 0.55, 0.45], 'y', RUDDER_GAIN, a);
    b.flap(placement(side * 1.75, -0.18, 3.62), [1.0, 0.1, 0.5], 'x', -side * AILERON_GAIN, s);
    b.light(side * 2.85, 0.25, -4.85);
    b.tip(side * 3.2, 0.5, 4.4);
  }
  b.hull.slab(mirrorOutline([[2.2, -3.4], [2.5, -2.6], [2.5, 3.6]]), 0.4, 0.02, s);
  // Ram bumper across the noses: the "shrugs off walls" read from the front.
  b.hull.box(6.6, 0.32, 0.3, DARK, placement(0, -0.22, -5.0));
  b.hull.box(6.7, 0.08, 0.32, a, placement(0, -0.03, -5.0));
  b.body({
    z: -4.2, length: 5.9, y: 0.2, radius: 1.0, squash: 0.6, segments: 6, phase: Math.PI / 6,
    shape: [[0.35, 0, DARK], [0.85, 0.1, p], [1, 0.35, p], [0.95, 0.75, s], [0.7, 1, s]],
    canopy: { from: 0.15, to: 0.45, width: 1.1, height: 0.4 },
  });
  b.duct(0, 0.55, 3.45, { radius: 1.05, length: 1.5, color: p, lip: a, segments: 16, vanes: 4 });
  b.hull.box(1.7, 0.55, 1.5, s, placement(0, 0.02, 3.2));
  b.strip(new THREE.Vector3(-2.4, 0.05, 3.63), new THREE.Vector3(-0.9, 0.05, 3.63), 0.08);
  b.strip(new THREE.Vector3(0.9, 0.05, 3.63), new THREE.Vector3(2.4, 0.05, 3.63), 0.08);
  b.cushion = { width: 7.2, length: 8.6, z: 0 };
}

/** Sirocco: a needle fuselage on a thin arrowhead wing, one slim fan in the tail. */
function dart(b: BlueprintBuilder): void {
  const { p, s, a } = b.c;
  b.body({
    z: -6.3, length: 10.3, y: 0.05, radius: 0.6, squash: 0.72, segments: 10,
    shape: [[0, 0, s], [0.35, 0.12, p], [0.8, 0.3, p], [1, 0.5, p], [0.95, 0.75, s], [0.75, 0.92, DARK], [0.7, 1, DARK]],
    canopy: { from: 0.2, to: 0.42, width: 0.78, height: 0.38 },
  });
  b.hull.slab(mirrorOutline([[0.6, -3.2], [3.3, 3.4], [3.1, 4.0], [0.5, 3.4]]), 0.16, -0.08, p);
  for (const side of SIDES) {
    // Leading-edge stripe: the only colour break on an otherwise bare blade.
    b.hull.slab([[side * 0.6, -3.0], [side * 0.95, -3.0], [side * 3.3, 3.25], [side * 3.1, 3.35]], 0.04, -0.06, s);
    b.plate(side * 3.25, [[2.6, -0.05], [3.4, SKID_Y + 0.1], [4.0, SKID_Y + 0.1], [4.1, -0.05]], 0.06, s);
    b.plate(side * 0.38, [[3.9, 0.7], [5.0, 0.7], [5.45, 1.55], [4.85, 1.55]], 0.06, p, -side * 0.45);
    b.flap(placement(side * 1.0, 0.05, -4.3), [0.9, 0.05, 0.45], 'x', -side * CANARD_GAIN, s);
    b.flap(placement(side * 1.9, -0.14, 3.5), [1.0, 0.06, 0.45], 'x', -side * AILERON_GAIN, a);
    b.light(side * 3.25, -0.02, 3.5);
    b.strip(new THREE.Vector3(side * 0.6, -0.12, 3.42), new THREE.Vector3(side * 3.05, -0.12, 3.98), 0.06);
    b.tip(side * 3.2, -0.02, 3.95);
  }
  b.duct(0, 0.22, 4.55, { radius: 0.6, length: 1.3, color: s, lip: a, segments: 14, vanes: 3 });
  b.light(0, 0.06, -6.25);
  b.cushion = { width: 5.6, length: 7.2, z: 1.0 };
}

/** Quadra Vex: a box wing (front and rear wings joined by side plates) with four fans abreast. */
function quadfan(b: BlueprintBuilder): void {
  const { p, s, a } = b.c;
  b.body({
    z: -5.0, length: 8.4, y: 0.05, radius: 0.72, squash: 0.62, segments: 10,
    shape: [[0.15, 0, a], [0.6, 0.1, p], [1, 0.32, p], [1, 0.7, s], [0.7, 1, s]],
    canopy: { from: 0.14, to: 0.42, width: 0.95, height: 0.42 },
  });
  b.hull.slab(mirrorOutline([[1.0, -3.6], [3.9, -3.0], [3.9, -1.7]]), 0.18, -0.3, s);
  b.hull.slab(mirrorOutline([[3.6, 1.3], [4.0, 1.6], [4.0, 3.0]]), 0.22, 0.28, p);
  for (const side of SIDES) {
    b.plate(side * 4.0, [[-3.2, -0.3], [-2.2, SKID_Y], [3.0, SKID_Y], [3.3, 0.55], [1.0, 0.55], [-1.6, -0.1]], 0.1, p);
    b.plate(side * 4.02, [[-2.2, SKID_Y], [3.0, SKID_Y], [3.0, SKID_Y + 0.12], [-2.0, SKID_Y + 0.12]], 0.12, a);
    for (const x of [1.2, 2.85]) {
      b.duct(side * x, 0.55, 2.55, { radius: 0.52, length: 0.9, color: s, lip: a, segments: 12, vanes: 3 });
    }
    b.flap(placement(side * 4.0, 0.2, 3.1), [0.08, 0.6, 0.5], 'y', RUDDER_GAIN, a);
    b.flap(placement(side * 2.9, -0.4, -1.7), [1.4, 0.06, 0.45], 'x', -side * AILERON_GAIN, s);
    b.light(side * 4.0, 0.6, 1.2);
    b.tip(side * 4.0, 0.5, 3.25);
  }
  b.strip(new THREE.Vector3(-4.0, 0.12, 3.04), new THREE.Vector3(4.0, 0.12, 3.04), 0.07);
  b.cushion = { width: 7.6, length: 6.8, z: -0.3 };
}

/** Twin Viper: forward-swept wing, big canards, twin booms ending in fans under canted fins. */
function swept(b: BlueprintBuilder): void {
  const { p, s, a } = b.c;
  b.body({
    z: -5.6, length: 7.6, y: 0.05, radius: 0.62, squash: 0.6, segments: 8, phase: Math.PI / 8,
    shape: [[0, 0, a], [0.5, 0.15, p], [1, 0.38, p], [0.9, 0.72, s], [0.6, 1, DARK]],
    canopy: { from: 0.22, to: 0.48, width: 0.7, height: 0.36 },
  });
  b.hull.slab(mirrorOutline([[0.4, -0.2], [3.7, -2.3], [3.8, -1.5], [0.6, 1.6]]), 0.18, -0.05, p);
  for (const side of SIDES) {
    b.hull.lathe([
      { r: 0.12, z: -1.2, color: s }, { r: 0.42, z: -0.4, color: p }, { r: 0.42, z: 3.3, color: s }, { r: 0.36, z: 4.0, color: DARK },
    ], b.seg(8), placement(side * 1.7, 0.05, 0, 0, 0, 0, 1, 0.8, 1));
    b.hull.box(0.07, 0.06, 4.0, a, placement(side * 1.7, 0.37, 1.5));
    b.duct(side * 1.7, 0.12, 4.5, { radius: 0.62, length: 1.0, color: s, lip: a, segments: 14, vanes: 3 });
    b.plate(side * 1.7, [[2.2, 0.35], [3.8, 0.35], [4.5, 1.7], [3.9, 1.7]], 0.07, p, -side * 0.35);
    b.plate(side * 1.7, [[3.9, 1.7], [4.5, 1.7], [4.62, 1.86], [4.02, 1.86]], 0.08, a, -side * 0.35);
    b.plate(side * 3.75, [[-2.3, -0.05], [-1.9, SKID_Y + 0.1], [-1.3, SKID_Y + 0.1], [-1.4, -0.05]], 0.07, s);
    b.flap(placement(side * 2.08, 1.05, 4.1, 0, 0, -side * 0.35), [0.07, 0.7, 0.45], 'y', RUDDER_GAIN, a);
    b.flap(placement(side * 1.0, 0.0, -4.2), [1.0, 0.06, 0.5], 'x', -side * CANARD_GAIN, s);
    b.light(side * 3.7, 0.02, -2.2);
    b.strip(new THREE.Vector3(side * 0.6, -0.11, 1.62), new THREE.Vector3(side * 3.8, -0.11, -1.48), 0.06);
    b.tip(side * 3.8, 0.02, -1.5);
  }
  b.cushion = { width: 6.4, length: 6.5, z: 0 };
}

/** Halo Comet: a flat elliptical ring wing around a sleek fuselage; the ring's edge glows. */
function ringwing(b: BlueprintBuilder): void {
  const { p, s, a } = b.c;
  const RING_SQUASH = 0.42;
  const RING_R = 3.3;
  // The ring's lowest point skims just above the ground like the other craft's skids.
  const RING_Y = SKID_Y + RING_R * RING_SQUASH;
  const ring = placement(0, RING_Y, 0, 0, 0, 0, 1, RING_SQUASH, 1);
  const segs = b.detail === 'high' ? 32 : 20;
  // Airfoil section swept round the Z axis: thin leading edge, fat middle, sharp glowing tail,
  // built as four arcs, each its own breakable part, so the ring snaps into pieces in a wreck.
  const RING_ARCS = 4;
  const arcSegs = segs / RING_ARCS;
  for (let i = 0; i < RING_ARCS; i++) {
    // Offset by an eighth turn so the breaks fall diagonally, not through the fuselage struts.
    const start = (i + 0.5) * (Math.PI * 2 / RING_ARCS);
    const arc = Math.PI * 2 / RING_ARCS;
    b.ownPart('ring', () => {
      b.hull.lathe([
        { r: RING_R, z: 0.9, color: p }, { r: RING_R + 0.14, z: 1.25, color: p }, { r: RING_R + 0.1, z: 2.2, color: p },
        { r: RING_R, z: 2.75, color: s }, { r: RING_R - 0.08, z: 2.75, color: s }, { r: RING_R - 0.12, z: 1.6, color: s },
        { r: RING_R - 0.04, z: 0.95, color: a }, { r: RING_R, z: 0.9, color: p },
      ], arcSegs, ring, start, arc);
      b.glow.lathe([{ r: RING_R - 0.07, z: 2.6, color: 0xffffff }, { r: RING_R - 0.07, z: 2.77, color: 0xffffff }], arcSegs, ring, start, arc);
    });
  }
  b.body({
    z: -5.8, length: 10.0, y: 0.15, radius: 0.58, squash: 0.75, segments: 12,
    shape: [[0, 0, s], [0.4, 0.12, p], [0.85, 0.3, p], [1, 0.5, p], [0.9, 0.78, s], [0.7, 1, DARK]],
    canopy: { from: 0.12, to: 0.42, width: 0.72, height: 0.36 },
  });
  b.hull.slab(mirrorOutline([[0.4, 0.9], [RING_R - 0.05, 1.3], [RING_R - 0.05, 2.4], [0.4, 2.7]]), 0.14, RING_Y + 0.07, s);
  b.duct(0, 0.22, 4.5, { radius: 0.72, length: 1.2, color: p, lip: s, segments: 16, vanes: 4 });
  b.plate(0, [[3.9, 0.95], [5.0, 0.95], [5.4, 1.6], [4.9, 1.6]], 0.07, s);
  b.flap(placement(0, 1.3, 5.0), [0.06, 0.5, 0.4], 'y', RUDDER_GAIN, a);
  for (const side of SIDES) {
    b.flap(placement(side * 0.8, 0.12, -4.0), [0.7, 0.05, 0.35], 'x', -side * CANARD_GAIN, s);
    b.flap(placement(side * 1.9, RING_Y - 0.02, 2.62), [1.2, 0.06, 0.4], 'x', -side * AILERON_GAIN, a);
    b.light(side * (RING_R + 0.14), RING_Y, 1.2);
    b.tip(side * RING_R, RING_Y, 2.8);
  }
  b.cushion = { width: 6.6, length: 7.5, z: 0 };
}

/**
 * Lumen Shard: a flat mag-lev wedge. Its whole outline is traced in light (leading edges and a
 * full-width tail bar), it rides on two glowing levitation pads instead of a skirt, and three
 * small thrusters sit close together in the chopped tail. From behind: a wide dark blade with a
 * light bar over a tight fan cluster.
 */
function wedge(b: BlueprintBuilder): void {
  const { p, s, a } = b.c;
  const TIP_X = 3.4;
  const TAIL_Z = 3.75;
  const NOSE_Z = -6.1;
  b.hull.slab(mirrorOutline([[0.25, NOSE_Z], [TIP_X, 2.9], [TIP_X, TAIL_Z - 0.1], [0.8, TAIL_Z]]), 0.22, -0.05, p);
  // A thinner second-colour layer under the blade: a two-tone edge that catches the eye side on.
  b.hull.slab(mirrorOutline([[0.3, NOSE_Z + 0.6], [TIP_X - 0.25, 2.8], [TIP_X - 0.25, TAIL_Z - 0.3], [0.8, TAIL_Z - 0.2]]), 0.16, -0.27, s);
  b.body({
    z: -5.4, length: 9.0, y: 0.0, radius: 0.78, squash: 0.48, segments: 6, phase: Math.PI / 6,
    shape: [[0, 0, a], [0.45, 0.12, p], [1, 0.4, s], [1, 0.8, p], [0.7, 1, DARK]],
    canopy: { from: 0.32, to: 0.6, width: 0.9, height: 0.34 },
  });
  // Spine fairing that blends the fuselage into the thrusters.
  b.hull.slab(mirrorOutline([[0.5, 1.0], [1.7, 2.6], [1.7, 3.3], [0.5, 3.4]]), 0.4, 0.3, p);
  for (const x of [-1.05, 0, 1.05]) {
    b.duct(x, 0.28, 3.6, { radius: 0.4, length: 0.8, color: s, lip: a, segments: 12, vanes: 3 });
  }
  b.strip(new THREE.Vector3(-1.75, 0.82, 3.25), new THREE.Vector3(1.75, 0.82, 3.25), 0.08);
  b.strip(new THREE.Vector3(-TIP_X + 0.1, -0.12, TAIL_Z - 0.02), new THREE.Vector3(TIP_X - 0.1, -0.12, TAIL_Z - 0.02), 0.07);
  for (const side of SIDES) {
    // Leading-edge light, nose to wingtip: the shard's outline at night and in tunnels.
    b.strip(new THREE.Vector3(side * 0.32, -0.04, NOSE_Z + 0.15), new THREE.Vector3(side * (TIP_X + 0.02), -0.04, 2.95), 0.07);
    // Levitation pads: dark rails under the blade, glowing where they ride the field.
    b.hull.box(0.5, 0.24, 6.4, DARK, placement(side * 1.9, SKID_Y + 0.2, -0.2));
    b.strip(new THREE.Vector3(side * 1.9, SKID_Y + 0.06, -3.3), new THREE.Vector3(side * 1.9, SKID_Y + 0.06, 2.9), 0.12);
    // Wingtip fins, leaning in, their top edges lit.
    b.plate(side * TIP_X, [[2.0, -0.1], [3.65, -0.1], [3.95, 0.85], [3.25, 0.85]], 0.08, s, side * 0.28);
    b.flap(placement(side * 3.27, 0.38, 3.7), [0.07, 0.5, 0.35], 'y', RUDDER_GAIN, a);
    b.flap(placement(side * 2.4, -0.16, TAIL_Z - 0.35), [1.1, 0.06, 0.4], 'x', -side * AILERON_GAIN, a);
    b.light(side * (TIP_X + 0.05), -0.02, 2.95);
    b.tip(side * TIP_X, 0.0, TAIL_Z);
  }
  b.light(0, 0.0, NOSE_Z + 0.2);
  b.cushion = { width: 6.4, length: 8.6, z: -0.8 };
}

/**
 * Orbis Gyre: twin round hulls with a big ring fan raised between them on a bridge wing, and a
 * small fan in each hull's tail. From behind: one large glowing ring over two small ones, which
 * no other glider has. The ring's outer rim carries a light band.
 */
function gyre(b: BlueprintBuilder): void {
  const { p, s, a } = b.c;
  const HULL_X = 2.7;
  const RING = { y: 0.78, z: 2.9, r: 1.15 };
  for (const side of SIDES) {
    b.hull.lathe([
      { r: 0, z: -5.6, color: a }, { r: 0.32, z: -5.2, color: a }, { r: 0.58, z: -4.3, color: p }, { r: 0.7, z: -2.6, color: p },
      { r: 0.7, z: 0.2, color: s }, { r: 0.7, z: 0.9, color: p }, { r: 0.6, z: 3.4, color: DARK }, { r: 0.48, z: 3.9, color: DARK },
    ], b.seg(10), placement(side * HULL_X, -0.05, 0, 0, 0, 0, 1, 0.78, 1));
    b.duct(side * HULL_X, -0.05, 4.25, { radius: 0.46, length: 0.8, color: p, lip: a, segments: 12, vanes: 3 });
    // Light strip along each hull's crown.
    b.strip(new THREE.Vector3(side * HULL_X, 0.52, -4.0), new THREE.Vector3(side * HULL_X, 0.52, 2.6), 0.07);
    b.plate(side * HULL_X, [[1.6, 0.4], [3.6, 0.4], [4.2, 1.45], [3.3, 1.45]], 0.09, s, -side * 0.15);
    b.flap(placement(side * (HULL_X + 0.1), 1.0, 3.75, 0, 0, -side * 0.15), [0.07, 0.55, 0.4], 'y', RUDDER_GAIN, a);
    b.plate(side * (HULL_X + 0.55), [[-3.0, -0.1], [-2.4, SKID_Y], [2.4, SKID_Y], [3.0, -0.1]], 0.08, DARK);
    // Struts from the hulls up to the ring.
    b.hull.rod(new THREE.Vector3(side * (HULL_X - 0.45), 0.25, RING.z), new THREE.Vector3(side * (RING.r + 0.15), RING.y, RING.z), 0.11, b.seg(6), s);
    b.flap(placement(side * 1.6, -0.06, 1.35), [0.9, 0.06, 0.45], 'x', -side * AILERON_GAIN, a);
    b.light(side * HULL_X, 0.05, -5.45);
    b.tip(side * (HULL_X + 0.55), 0.0, 3.9);
  }
  // The bridge wing joining the hulls, swept back under the ring.
  b.hull.slab(mirrorOutline([[0.4, -2.6], [HULL_X, -1.6], [HULL_X, 1.2], [1.3, 3.2], [0.4, 3.3]]), 0.2, 0.0, p);
  b.body({
    z: -5.0, length: 6.6, y: 0.12, radius: 0.62, squash: 0.68, segments: 10,
    shape: [[0, 0, s], [0.5, 0.15, p], [1, 0.45, p], [0.85, 0.8, s], [0.55, 1, DARK]],
    canopy: { from: 0.16, to: 0.5, width: 0.8, height: 0.38 },
  });
  const ring = b.duct(0, RING.y, RING.z, { radius: RING.r, length: 1.1, color: s, lip: a, segments: 20, vanes: 6 });
  b.onPart(ring, () => {
    // The rim light band: thin, round the outside of the shroud, so the ring reads from any angle.
    const band = placement(0, RING.y, RING.z);
    b.glow.lathe([{ r: RING.r * 1.2, z: -0.12, color: 0xffffff }, { r: RING.r * 1.2, z: 0.12, color: 0xffffff }], b.seg(20), band);
  });
  b.light(0, 0.1, -4.95);
  b.cushion = { width: 7.0, length: 9.0, z: -0.4 };
}

const STYLES: Record<RacerStyle, StyleBuilder> = { skiff, sponson, dart, quadfan, swept, ringwing, wedge, gyre };

export function buildBlueprint(visual: RacerVisual, detail: Detail): Blueprint {
  const b = new BlueprintBuilder(visual, detail);
  STYLES[visual.style](b);
  return b.build();
}
