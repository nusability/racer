// The wind gap: a notch in a ridge of mossy rock beside the trail where the canopy is broken
// open, two storm-split giants standing guard either side of it and a stand of young trees
// in the gap itself. Wind funnels through it. Bound as a gust, it roars: the young trees bow
// toward the push, the giants' broken crowns heave, and a torrent of leaves streams out of the
// gap and across the trail in the direction racers are pushed, thickest at the gust's peak, so
// the push can be read before it is felt.
//
// Placement: bind to a gust (`hazard`), side either (the leaves come from upwind, whichever
// side that is), distance 5–20, scale 1. The leaves fill the gust's whole span; spans of
// 150–300 m read best.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { gustStrength } from '../../../core/hazards.ts';
import { T, mix, prism, shade, vary } from '../b/shapes.ts';
import { brush, col } from '../a/kit.ts';
import { BARK, FERN, LEAVES, MOSS, RigKit, RoadFrame, STONE, bindHazard, clump, fern, giant, leafColour, mossyRock } from './kit.ts';

const SALT = 0x3141d;
const RADIUS = 130;
/** The ridge either side of the gap: knolls along local X, how far back, and the gap's half-width. */
const RIDGE_Z = RADIUS * 0.25;
const GAP = 34;
const KNOLLS = { high: 9, low: 5 } as const;
/** Young trees in the gap that bow with the wind: how many, their height and radius (m). */
const SAPLINGS = { high: 9, low: 5 } as const;
const SAPLING_H: readonly [number, number] = [28, 44];
const SAPLING_R: readonly [number, number] = [0.9, 1.5];
/** How far they bow at full push (radians), and their flutter in it. */
const BOW = 0.32;
const FLUTTER = 0.05;
const FLUTTER_RATE = 7;
/** Leaves streamed across the trail per second at full push (high, low), and their speed (m/s). */
const LEAF_RATE = { high: 320, low: 140 } as const;
const LEAF_SPEED: readonly [number, number] = [22, 34];
/** Leaves start this far upwind of the drivable width and fly at these heights (m). */
const LEAF_START = 30;
const LEAF_HEIGHT: readonly [number, number] = [0.5, 14];
/** Below this share of the push no leaves fly. */
const LEAF_MIN = 0.08;
const AUTUMN: readonly number[] = [0xb8862e, 0x8a4a22, 0xc9a04a, 0x9a3a1e];

interface Sapling {
  bone: THREE.Bone;
  phase: number;
}

export function createWindRoar(opts: LandmarkOptions): Landmark {
  const ik = new RigKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('windRoar', opts, ['gust'] as const, {
    def: { type: 'gust', id: 'free', from: 0, to: 0, strength: 10, on: 6, period: 16, phase: 0 },
    roadZ: -RADIUS * 0.9,
    lateral: -1,
    minX: -14,
    maxX: 14,
    span: 200,
  });
  const def = bound.def;

  // --- The ridge: mossy knolls either side of the gap ---
  const nK = ik.q(KNOLLS.high, KNOLLS.low);
  for (let i = 0; i < nK; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (GAP + rng() * RADIUS * 0.7);
    const z = RIDGE_Z + (rng() - 0.5) * 40;
    const r = 14 + rng() * 16;
    kit.solid.add(new THREE.IcosahedronGeometry(r, 1), vary(rng, STONE, 0.08), T(x, r * 0.15, z, rng() * 3, 0, 0, [1.4, 0.8, 1]));
    kit.solid.add(new THREE.IcosahedronGeometry(r * 0.95, 1), vary(rng, MOSS, 0.08), T(x, r * 0.3, z, rng() * 3, 0, 0, [1.35, 0.6, 0.95]));
  }
  // The storm-split giants at the gap's shoulders: tall snags, crowns torn, leaning into the wind's path.
  for (const side of [-1, 1]) {
    const x = side * (GAP + 12);
    const z = RIDGE_Z - 10;
    giant(kit, kit.solid, x, z, 95, 6.5, rng, { crown: false, lean: 0.06, leanDir: side > 0 ? Math.PI : 0 });
    // The split top: jagged spikes of torn wood, and the surviving boughs.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      kit.solid.add(new THREE.ConeGeometry(1.4, 6 + rng() * 8, 4).translate(0, 3, 0), shade(BARK, 1.1), T(x - side * 9 + Math.cos(a) * 2, 95 * 0.95, z + Math.sin(a) * 2));
    }
    for (let k = 0; k < 3; k++) {
      clump(kit.moving, [x + (rng() - 0.5) * 20, 60 + k * 10, z + (rng() - 0.5) * 20], 14 + rng() * 6, leafColour(rng), rng, { pivot: [x, 55, z], axisB: [0, 0, 1], swingB: 0.02, freq: 0.6 + rng() * 0.3, phase: rng() * 6 });
    }
  }
  // The gap's floor: ferns streaming one way, boulders.
  for (let i = 0; i < kit.q(34, 16); i++) {
    const x = (rng() - 0.5) * GAP * 2.4;
    const z = -RADIUS * 0.5 + rng() * RADIUS * 0.9;
    fern(kit.moving, x, z, 3 + rng() * 3, rng, FERN, { pivot: [x, 0, z], axisB: [0, 0, 1], swingB: 0.08, freq: 1.5 + rng(), phase: rng() * 6 });
  }
  for (let i = 0; i < kit.q(6, 3); i++) mossyRock(kit.solid, (rng() - 0.5) * GAP * 2, -RADIUS * 0.4 + rng() * RADIUS * 0.6, 2 + rng() * 3, rng);

  // --- The saplings: slender trunks and crowns on bones, bowing with the push ---
  const saplings: Sapling[] = [];
  for (let i = 0; i < ik.q(SAPLINGS.high, SAPLINGS.low); i++) {
    const bone = rig.bone(rig.root, (rng() - 0.5) * GAP * 1.6, 0, -RADIUS * 0.3 + rng() * RADIUS * 0.45);
    const hgt = SAPLING_H[0] + rng() * (SAPLING_H[1] - SAPLING_H[0]);
    const r = SAPLING_R[0] + rng() * (SAPLING_R[1] - SAPLING_R[0]);
    rig.add(prism(r, r * 0.4, hgt, 6).translate(0, -1, 0), vary(rng, BARK, 0.1), { bone });
    for (let k = 0; k < 3; k++) {
      const y = hgt * (0.6 + k * 0.17);
      rig.add(new THREE.IcosahedronGeometry(1, 0), leafColour(rng), { bone, m: T((rng() - 0.5) * 3, y, (rng() - 0.5) * 3, rng() * 3, 0, 0, [5 - k, 3.2 - k * 0.6, 5 - k]) });
    }
    saplings.push({ bone, phase: rng() * 6 });
  }

  const cloud = ik.cloud(ik.q(900, 400), 0, false, 1.4);
  const leafBrushes = [...AUTUMN, ...LEAVES].map((c) => brush({ life: 2.6, size0: 1.9, size1: 1.6, c0: col(c), c1: mix(c, FERN, 0.3), alpha: 0.95, keep: 0.98, lift: -1.2 }));
  const h = bound.hazard;
  const road = new RoadFrame(bound.binding);
  const axis = new THREE.Vector3();
  const P = new THREE.Vector3();
  const q = new THREE.Quaternion();
  let leafAcc = 0;

  function update(time: number, dt: number): void {
    const push = gustStrength(def, time) / Math.max(1e-6, Math.abs(def.strength));
    const dir = Math.sign(def.strength) || 1;
    road.at((h.s0 + h.s1) / 2);
    // Bow toward the push: about the road's direction, tipping the tops across it.
    axis.copy(road.along);
    for (const s of saplings) {
      const lean = BOW * push + FLUTTER * push * Math.sin(time * FLUTTER_RATE + s.phase) + 0.01 * Math.sin(time * 0.7 + s.phase);
      s.bone.quaternion.copy(q.setFromAxisAngle(axis, -dir * lean));
    }
    rig.sync();
    if (dt <= 0 || push < LEAF_MIN) return;
    leafAcc += dt * ik.q(LEAF_RATE.high, LEAF_RATE.low) * push;
    while (leafAcc >= 1) {
      leafAcc -= 1;
      const s = h.s0 + rng() * (h.s1 - h.s0);
      road.at(s);
      const x = (dir > 0 ? h.minX : h.maxX) - dir * rng() * LEAF_START;
      road.point(x, LEAF_HEIGHT[0] + rng() * (LEAF_HEIGHT[1] - LEAF_HEIGHT[0]), P);
      const v = (LEAF_SPEED[0] + rng() * (LEAF_SPEED[1] - LEAF_SPEED[0])) * road.unit * dir;
      cloud.emit(leafBrushes[Math.floor(rng() * leafBrushes.length)], P.x, P.y, P.z, road.across.x * v + (rng() - 0.5) * 3, (rng() - 0.3) * 3, road.across.z * v + (rng() - 0.5) * 3);
    }
  }

  return ik.finish(RADIUS, RADIUS * 1.8, 110, update);
}
