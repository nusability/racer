// The six ground-effect skimmers: low, wide racing wings riding an air cushion, pushed by ducted
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
  // Airfoil section swept round the Z axis: thin leading edge, fat middle, sharp glowing tail.
  b.hull.lathe([
    { r: RING_R, z: 0.9, color: p }, { r: RING_R + 0.14, z: 1.25, color: p }, { r: RING_R + 0.1, z: 2.2, color: p },
    { r: RING_R, z: 2.75, color: s }, { r: RING_R - 0.08, z: 2.75, color: s }, { r: RING_R - 0.12, z: 1.6, color: s },
    { r: RING_R - 0.04, z: 0.95, color: a }, { r: RING_R, z: 0.9, color: p },
  ], segs, ring);
  b.glow.lathe([{ r: RING_R - 0.07, z: 2.6, color: 0xffffff }, { r: RING_R - 0.07, z: 2.77, color: 0xffffff }], segs, ring);
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

const STYLES: Record<RacerStyle, StyleBuilder> = { skiff, sponson, dart, quadfan, swept, ringwing };

export function buildBlueprint(visual: RacerVisual, detail: Detail): Blueprint {
  const b = new BlueprintBuilder(visual, detail);
  STYLES[visual.style](b);
  return b.build();
}
