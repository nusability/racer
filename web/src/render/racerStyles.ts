// The six racer silhouettes. Craft space: forward −Z, up +Y, origin at the craft centre; engines
// sit ahead (−Z) and the pod trails behind on cables. Each style must read differently from the
// chase camera, i.e. mostly from behind: engine count, spacing, girth and fin profile.
import * as THREE from 'three';
import type { RacerVisual, RacerStyle } from '../core/types.ts';
import { placement } from './racerParts.ts';
import { BlueprintBuilder, DARK, METAL, STEEL, engineFrame, type Blueprint, type Detail } from './racerBlueprint.ts';

const SIDES = [-1, 1] as const;
const HALF_PI = Math.PI / 2;
/** Fin outlines are drawn with +X running aft; this yaw lays them along the craft. */
const ALONG = -HALF_PI;
/** Steer → flap deflection, radians. */
const RUDDER_GAIN = 0.45;
const AILERON_GAIN = 0.35;

type StyleBuilder = (b: BlueprintBuilder) => void;

function twin(b: BlueprintBuilder): void {
  const { p, s, a } = b.c;
  const R = 0.55;
  const L = 5.6;
  for (const side of SIDES) {
    const f = engineFrame(side * 1.75, 0, -3.2);
    b.engine(f, {
      length: L, radius: R, segments: 10, nozzle: 0.74, spike: 0,
      shape: [[0.86, 0, a], [1, 0.06, p], [1, 0.27, s], [1.05, 0.33, p], [1.05, 0.6, p], [0.98, 0.68, METAL], [0.93, 0.84, DARK], [0.86, 1, DARK]],
    });
    // Scrapyard patch panels: deliberately uneven sizes and tilts.
    b.hull.box(0.08, 0.42, 1.0, s, placement(side * R * 1.02, 0.12, -0.9, 0, 0, side * 0.1), f);
    b.hull.box(0.08, 0.3, 0.7, METAL, placement(side * R * 1.0, -0.22, 0.4, 0, 0, -side * 0.15), f);
    b.hull.box(0.5, 0.06, 0.8, side < 0 ? METAL : s, placement(side * 0.08, R * 1.02, 0.2, 0, 0.08 * side, 0), f);
    b.hull.box(0.16, 0.16, 0.5, DARK, placement(side * R * 0.7, -R * 0.75, -1.6), f);
    b.hull.fin([[0, 0], [1.2, 0], [1.6, 0.85], [1.0, 0.85]], 0.07, p, placement(0, R * 0.85, 0.6, 0, ALONG, -side * 0.18), f);
    b.hull.fin([[1.0, 0.85], [1.6, 0.85], [1.65, 0.95], [1.05, 0.95]], 0.08, a, placement(0, R * 0.85, 0.6, 0, ALONG, -side * 0.18), f);
    b.flap(f, placement(side * 0.1, R * 0.85 + 0.5, 2.2, 0, 0, -side * 0.18), [0.06, 0.55, 0.45], 'y', RUDDER_GAIN, a);
    b.flap(f, placement(side * (R + 0.35), 0, 2.35), [0.6, 0.05, 0.4], 'x', -side * AILERON_GAIN, s);
    const tip = b.emitter(f, new THREE.Vector3(-side * R * 0.9, 0.05, -1.4), new THREE.Vector3(-side * 0.32, 0, 0));
    if (side < 0) b.binders.push([tip, new THREE.Vector3()]);
    else b.binders[0][1] = tip;
    b.cable(new THREE.Vector3(side * 1.35, 0.05, -0.6), new THREE.Vector3(side * 0.42, 0.08, 0.45));
  }
  b.podPivot.set(0, -0.05, 1.5);
  const pod = { length: 3.8, radius: 0.62, segments: 10, squash: 0.78, nozzle: 0.5,
    shape: [[0.28, 0, a], [0.75, 0.12, p], [1, 0.35, p], [1, 0.6, s], [0.85, 0.85, s], [0.55, 1, DARK]] as [number, number, number][],
    canopy: { from: 0.16, to: 0.5, width: 0.95, height: 0.45 } };
  b.podTub(pod);
  for (const side of SIDES) {
    b.pod.box(0.22, 0.3, 1.1, METAL, placement(side * 0.62, 0, 2.3, 0, 0, side * 0.2));
    b.pod.rod(new THREE.Vector3(side * 0.3, 0.3, 3.0), new THREE.Vector3(side * 0.42, 0.95, 3.6), 0.025, 4, STEEL);
  }
  b.pod.fin([[0, 0], [0.9, 0], [1.1, 0.55], [0.7, 0.55]], 0.06, p, placement(0, b.podTop(pod, 2.6) - 0.05, 2.6, 0, ALONG));
}

function needle(b: BlueprintBuilder): void {
  const { p, s, a } = b.c;
  const R = 0.36;
  const L = 8.2;
  for (const side of SIDES) {
    const f = engineFrame(side * 1.35, 0, -3.6);
    b.engine(f, {
      length: L, radius: R, segments: 8, nozzle: 0.78, spike: 1.2,
      shape: [[0.7, 0, s], [1, 0.07, p], [1, 0.42, p], [1.08, 0.46, s], [1.08, 0.52, p], [1, 0.84, p], [1.06, 0.9, s], [0.88, 1, DARK]],
    });
    // Long winglets swept back from mid-body: the needle's only width cue from behind.
    b.hull.fin([[0, 0], [0.75, 1.1], [0.75, 1.6], [0, 1.9]], 0.04, p, placement(side * R * 0.8, 0, 1.0, HALF_PI, 0, 0, side, 1, 1), f);
    b.hull.fin([[0.6, 0.95], [0.78, 1.1], [0.78, 1.6], [0.6, 1.6]], 0.05, s, placement(side * R * 0.8, 0, 1.0, HALF_PI, 0, 0, side, 1, 1), f);
    b.hull.fin([[0, 0], [1.0, 0], [1.3, 0.62], [1.05, 0.62]], 0.05, a, placement(0, R * 0.85, 2.6, 0, ALONG), f);
    b.hull.box(0.03, 0.03, 4.5, a, placement(side * R * 0.75, R * 0.7, -1.0), f);
    b.flap(f, placement(side * (R + 0.75), 0, 3.0), [0.4, 0.04, 0.32], 'x', -side * AILERON_GAIN, s);
    b.flap(f, placement(0, R + 0.5, 3.92), [0.05, 0.35, 0.3], 'y', RUDDER_GAIN, a);
    const tip = b.emitter(f, new THREE.Vector3(-side * R * 0.85, 0, -2.4), new THREE.Vector3(-side * 0.18, 0, 0));
    if (side < 0) b.binders.push([tip, new THREE.Vector3()]);
    else b.binders[0][1] = tip;
    b.cable(new THREE.Vector3(side * 1.1, 0, 0.3), new THREE.Vector3(side * 0.24, 0.02, 0.35));
  }
  b.podPivot.set(0, -0.1, 2.7);
  const pod = { length: 2.5, radius: 0.44, segments: 8, squash: 0.85, nozzle: 0.55,
    shape: [[0.08, 0, s], [0.55, 0.16, p], [1, 0.45, p], [0.95, 0.74, s], [0.55, 1, DARK]] as [number, number, number][],
    canopy: { from: 0.18, to: 0.5, width: 0.6, height: 0.3 } };
  b.podTub(pod);
  b.pod.fin([[0, 0], [0.8, 0], [1.0, 0.5], [0.75, 0.5]], 0.04, s, placement(0, b.podTop(pod, 1.6) - 0.04, 1.6, 0, ALONG));
}

function heavy(b: BlueprintBuilder): void {
  const { p, s, a } = b.c;
  const R = 0.85;
  const L = 5.4;
  for (const side of SIDES) {
    const f = engineFrame(side * 2.15, 0, -3.0);
    b.engine(f, {
      length: L, radius: R, segments: 6, nozzle: 0.7, spike: 0, phase: Math.PI / 6,
      shape: [[0.86, 0, a], [1, 0.05, p], [1, 0.24, p], [1.07, 0.29, s], [1.07, 0.7, s], [1, 0.75, p], [0.96, 0.9, METAL], [0.9, 1, DARK]],
    });
    // Intake grille bars and bolted armour slabs sell the hauler mass.
    for (const y of [-0.32, 0, 0.32]) b.hull.box(R * 1.45, 0.08, 0.1, METAL, placement(0, y, -L / 2 + 0.3), f);
    b.hull.box(0.16, 0.95, 1.9, s, placement(side * R * 0.98, 0, -0.3), f);
    b.hull.box(0.2, 0.18, 1.95, a, placement(side * R * 1.02, 0.48, -0.3), f);
    b.hull.box(0.9, 0.16, 1.5, s, placement(0, R * 0.92, 0.4), f);
    b.hull.box(0.7, 0.14, 1.2, DARK, placement(0, -R * 0.92, -0.6), f);
    b.hull.fin([[0, 0], [0.9, 0], [1.1, 0.5], [0.45, 0.5]], 0.14, p, placement(0, R * 0.95, 1.2, 0, ALONG), f);
    b.flap(f, placement(0, R + 0.25, 2.33), [0.1, 0.42, 0.4], 'y', RUDDER_GAIN, a);
    b.flap(f, placement(side * (R + 0.25), -0.2, 2.5), [0.5, 0.07, 0.38], 'x', -side * AILERON_GAIN, s);
    for (const [z, i] of [[-1.3, 0], [0.9, 1]] as const) {
      const tip = b.emitter(f, new THREE.Vector3(-side * R * 0.95, 0, z), new THREE.Vector3(-side * 0.38, 0, 0));
      if (side < 0) b.binders.push([tip, new THREE.Vector3()]);
      else b.binders[i][1] = tip;
    }
    b.cable(new THREE.Vector3(side * 1.55, 0.25, -0.4), new THREE.Vector3(side * 0.55, 0.2, 0.4));
    b.cable(new THREE.Vector3(side * 1.55, -0.3, -0.4), new THREE.Vector3(side * 0.6, -0.2, 0.5));
  }
  b.podPivot.set(0, 0, 1.3);
  const pod = { length: 3.8, radius: 0.85, segments: 6, squash: 0.8, nozzle: 0.5, phase: Math.PI / 6,
    shape: [[0.42, 0, DARK], [0.85, 0.08, s], [1, 0.3, p], [1, 0.7, p], [0.88, 0.9, s], [0.6, 1, DARK]] as [number, number, number][],
    canopy: { from: 0.2, to: 0.48, width: 1.0, height: 0.42 } };
  b.podTub(pod);
  for (const side of SIDES) {
    b.pod.box(0.14, 0.55, 2.2, s, placement(side * 0.86, -0.05, 2.0));
    b.pod.box(0.18, 0.12, 2.25, a, placement(side * 0.88, 0.25, 2.0));
  }
}

function quad(b: BlueprintBuilder): void {
  const { p, s, a } = b.c;
  const R = 0.4;
  const L = 5.2;
  const X = 1.55;
  const Y = 0.52;
  const binderTips: THREE.Vector3[] = [];
  for (const side of SIDES) {
    for (const up of SIDES) {
      const f = engineFrame(side * X, up * Y, -3.1);
      b.engine(f, {
        length: L, radius: R, segments: 8, nozzle: 0.74, spike: 0.3,
        shape: [[0.8, 0, s], [1, 0.06, p], [1, 0.4, p], [1.06, 0.44, a], [1, 0.5, p], [1, 0.8, s], [0.92, 0.92, DARK], [0.86, 1, DARK]],
      });
      binderTips.push(b.emitter(f, new THREE.Vector3(-side * R * 0.9, 0, -1.2), new THREE.Vector3(-side * 0.25, 0, 0)));
      b.cable(new THREE.Vector3(side * (X - 0.3), up * Y, -0.6), new THREE.Vector3(side * 0.42, up * 0.16, 0.42));
    }
    // Pylon plates bind each vertical pair into one block; the rudder rides their trailing edge.
    const pylon = engineFrame(side * X, 0, -3.1);
    b.hull.fin([[0, -0.5], [2.4, -0.62], [2.4, 0.62], [0, 0.5]], 0.07, s, placement(0, 0, 0.2, 0, ALONG), pylon);
    b.hull.fin([[0, -0.4], [1.0, -0.42], [1.0, 0.42], [0, 0.4]], 0.08, p, placement(0, 0, -2.2, 0, ALONG), pylon);
    b.hull.box(0.1, 0.12, 2.42, a, placement(side * 0.02, 0, 1.4), pylon);
    b.flap(pylon, placement(0, 0, 2.62), [0.06, 0.95, 0.45], 'y', RUDDER_GAIN, a);
  }
  // Tips are pushed left-bottom, left-top, right-bottom, right-top.
  b.binders.push([binderTips[0], binderTips[2]], [binderTips[1], binderTips[3]]);
  b.podPivot.set(0, -0.1, 1.6);
  const pod = { length: 3.4, radius: 0.62, segments: 8, squash: 0.75, nozzle: 0.5,
    shape: [[0.2, 0, a], [0.7, 0.12, s], [1, 0.35, p], [1, 0.65, p], [0.8, 0.88, s], [0.5, 1, DARK]] as [number, number, number][],
    canopy: { from: 0.15, to: 0.5, width: 0.85, height: 0.4 } };
  b.podTub(pod);
  for (const side of SIDES) {
    b.pod.fin([[0, 0], [0.7, 0], [0.9, 0.4], [0.5, 0.4]], 0.05, s, placement(side * 0.35, b.podTop(pod, 2.4) - 0.08, 2.4, 0, ALONG, side * 0.5));
  }
}

function split(b: BlueprintBuilder): void {
  const { p, s, a } = b.c;
  const R = 0.48;
  const L = 6.0;
  const SPLAY = 0.13;
  for (const side of SIDES) {
    const f = engineFrame(side * 1.9, 0, -3.0, -side * SPLAY);
    b.engine(f, {
      length: L, radius: R, segments: 6, nozzle: 0.72, spike: 0.7,
      shape: [[0.5, 0, a], [0.9, 0.08, p], [1, 0.2, p], [1, 0.55, s], [1.07, 0.6, p], [0.95, 0.86, s], [0.86, 1, DARK]],
    });
    // Tall swept dorsal blade, a smaller ventral one and an outboard wing: the split's sharp X.
    b.hull.fin([[0, 0], [2.0, 0], [3.0, 1.5], [2.5, 1.5]], 0.07, p, placement(0, R * 0.8, -0.4, 0, ALONG, -side * 0.25), f);
    b.hull.fin([[2.5, 1.5], [3.0, 1.5], [3.12, 1.65], [2.62, 1.65]], 0.08, a, placement(0, R * 0.8, -0.4, 0, ALONG, -side * 0.25), f);
    b.hull.fin([[0, 0], [1.5, 0], [2.1, 0.8], [1.7, 0.8]], 0.06, s, placement(0, -R * 0.8, 0.4, Math.PI, ALONG, side * 0.3), f);
    b.hull.fin([[0, 0], [1.4, 1.0], [1.4, 1.5], [0, 1.6]], 0.05, s, placement(side * R * 0.85, 0, 0.6, HALF_PI, 0, 0, side, 1, 1), f);
    b.hull.box(0.04, 0.04, 3.2, a, placement(side * R * 0.9, R * 0.35, -0.6), f);
    b.flap(f, placement(side * 0.25, R * 0.8 + 0.95, 2.6, 0, 0, -side * 0.25), [0.06, 0.6, 0.45], 'y', RUDDER_GAIN, a);
    b.flap(f, placement(side * (R + 1.15), 0, 2.15), [0.55, 0.05, 0.4], 'x', -side * AILERON_GAIN, s);
    const tip = b.emitter(f, new THREE.Vector3(-side * R * 0.9, 0, -2.0), new THREE.Vector3(-side * 0.3, 0, 0));
    if (side < 0) b.binders.push([tip, new THREE.Vector3()]);
    else b.binders[0][1] = tip;
    b.cable(new THREE.Vector3(-side * R * 0.6, 0, L / 2 - 0.3).applyMatrix4(f), new THREE.Vector3(side * 0.35, 0.05, 0.45));
  }
  b.podPivot.set(0, -0.05, 1.3);
  const pod = { length: 3.8, radius: 0.55, segments: 6, squash: 0.7, nozzle: 0.55,
    shape: [[0.05, 0, a], [0.55, 0.18, p], [1, 0.42, p], [0.95, 0.7, s], [0.6, 1, DARK]] as [number, number, number][],
    canopy: { from: 0.22, to: 0.52, width: 0.72, height: 0.36 } };
  b.podTub(pod);
  for (const side of SIDES) {
    b.pod.fin([[0, 0], [0.9, 0], [1.3, 0.75], [1.0, 0.75]], 0.05, p, placement(side * 0.25, b.podTop(pod, 2.5) - 0.08, 2.5, 0, ALONG, side * 0.55));
  }
}

function ring(b: BlueprintBuilder): void {
  const { p, s, a } = b.c;
  const R = 0.36;
  const L = 5.8;
  const RING_R = 2.1;
  const RING_SQUASH = 0.6;
  const RING_Z = -3.6;
  const tubular = b.detail === 'high' ? 28 : 18;
  const ringFrame = placement(0, 0, RING_Z, 0, 0, 0, 1, RING_SQUASH, 1);
  b.hull.add(new THREE.TorusGeometry(RING_R, 0.2, 6, tubular), p, ringFrame);
  b.hull.add(new THREE.TorusGeometry(RING_R + 0.06, 0.08, 4, tubular), s, placement(0, 0, RING_Z - 0.2, 0, 0, 0, 1, RING_SQUASH, 1));
  b.glow.add(new THREE.TorusGeometry(RING_R - 0.22, 0.05, 4, tubular), 0xffffff, ringFrame);
  for (const side of SIDES) {
    const f = engineFrame(side * 1.6, 0, -3.0);
    b.engine(f, {
      length: L, radius: R, segments: 10, nozzle: 0.76, spike: 0.8,
      shape: [[0.6, 0, s], [0.95, 0.1, p], [1, 0.3, p], [1, 0.72, p], [1.05, 0.78, s], [0.92, 0.9, p], [0.82, 1, DARK]],
    });
    // Struts hang each engine inside the ring at its widest point.
    for (const up of SIDES) {
      b.hull.rod(new THREE.Vector3(side * 1.45, up * R * 0.7, RING_Z), new THREE.Vector3(side * 1.05, up * 1.02, RING_Z), 0.06, 5, a);
    }
    b.hull.box(0.03, 0.03, 4.0, s, placement(side * R * 0.7, R * 0.72, 0.4), f);
    b.flap(f, placement(side * (R + 0.3), 0, 2.4), [0.5, 0.04, 0.38], 'x', -side * AILERON_GAIN, s);
    b.flap(f, placement(0, R + 0.25, 2.4), [0.05, 0.42, 0.36], 'y', RUDDER_GAIN, a);
    b.hull.fin([[0, 0], [0.9, 0], [1.2, 0.5], [0.9, 0.5]], 0.05, p, placement(0, R * 0.85, 1.5, 0, ALONG), f);
    const tip = b.emitter(f, new THREE.Vector3(-side * R * 0.9, 0, RING_Z + 3.0), new THREE.Vector3(-side * 0.2, 0, 0));
    if (side < 0) b.binders.push([tip, new THREE.Vector3()]);
    else b.binders[0][1] = tip;
    b.cable(new THREE.Vector3(side * 1.3, 0, -0.3), new THREE.Vector3(side * 0.3, 0.05, 0.6));
  }
  b.podPivot.set(0, -0.1, 1.5);
  const pod = { length: 4.2, radius: 0.5, segments: 12, squash: 0.8, nozzle: 0.55,
    shape: [[0, 0, s], [0.45, 0.14, p], [0.85, 0.33, p], [1, 0.55, p], [0.92, 0.78, s], [0.5, 1, a]] as [number, number, number][],
    canopy: { from: 0.12, to: 0.6, width: 0.72, height: 0.34 } };
  b.podTub(pod);
  b.pod.fin([[0, 0], [1.0, 0], [1.35, 0.55], [1.05, 0.55]], 0.05, s, placement(0, b.podTop(pod, 2.9) - 0.05, 2.9, 0, ALONG));
}

const STYLES: Record<RacerStyle, StyleBuilder> = { twin, needle, heavy, quad, split, ring };

export function buildBlueprint(visual: RacerVisual, detail: Detail): Blueprint {
  const b = new BlueprintBuilder(visual, detail);
  STYLES[visual.style](b);
  return b.build();
}
