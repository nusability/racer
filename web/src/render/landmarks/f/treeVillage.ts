// The tree village: the canopy folk's home, high in a ring of giants. Round platforms circle
// the trunks forty and sixty metres up, joined by sagging plank bridges strung with lanterns;
// stairs spiral up the trunks from the forest floor; under the platforms hang the dwellings,
// woven seed-pods with domed caps, round doorways glowing amber and smoke curling from their
// crowns. A basket lift creaks up and down on its rope, pennants of dyed leaf-cloth stir, and
// the folk stand at the rails watching the racers below.
//
// Placement: scenery (no hazard), side either, distance 20–60, scale 0.8–1.2. It is tall
// (≈120 m) and best seen from a straight approach.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import { T, beam, box, catenary, lathe, mix, prism, shade, vary } from '../b/shapes.ts';
import { bunting, lampString, rope } from '../b/props.ts';
import type { V3 } from '../b/motion.ts';
import { finishCoast, smoke } from '../c/kit.ts';
import { FERN, LANTERN, ROPE, TIMBER, WEATHERED, fern, giant, lantern, mossyRock } from './kit.ts';

const SALT = 0x7e111;
const RADIUS = 110;
/** The village giants: [x, z, height, radius]. */
const TREES: readonly (readonly [number, number, number, number])[] = [
  [-62, -10, 118, 7],
  [-5, 30, 126, 8],
  [55, -18, 112, 6.5],
  [20, -60, 104, 6],
];
/** Platforms on each trunk: [height, radius out from the bark]. */
const DECKS: readonly (readonly [number, number])[] = [
  [42, 11],
  [64, 8],
];
const DECK_T = 1.2;
const RAIL_H = 1.3;
/** Plank bridges between neighbouring trees' lower decks: sag (m) and planks per bridge (high, low). */
const BRIDGE_SAG = 6;
const PLANKS = { high: 28, low: 14 } as const;
const BRIDGE_W = 2.4;
/** Stair planks spiralling up each trunk, metres of rise per plank. */
const STAIR_RISE = { high: 1.6, low: 3.2 } as const;
/** Pod dwellings under each tree's decks, their height and girth (m). */
const PODS = { high: 4, low: 2 } as const;
const POD_H = 9;
const POD_R = 3.4;
/** The pod's profile: [radius share, height share] from the bottom tip up. */
const POD_PROFILE: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.45, 0.12],
  [0.9, 0.35],
  [1, 0.55],
  [0.85, 0.78],
  [0.5, 0.95],
  [0.2, 1],
];
/** The basket lift: travel (m) and rate (rad/s). */
const LIFT_TRAVEL = 18;
const LIFT_RATE = 0.25;
/** Folk at the rails per deck (high, low), drawn a little larger than life to read from the trail. */
const FOLK = { high: 7, low: 3 } as const;
const FOLK_SCALE = 1.3;
/** Pods' cloth and caps, the folk's clothes: muted dyes. */
const DYES: readonly number[] = [0x8a5a3a, 0x6a7a4a, 0x9a7a4a, 0x5a6a7a, 0x8a4a4a];
const LANTERN_HALO = 3.5;

export function createTreeVillage(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const rng = kit.rng;
  const dusk = opts.palette.dusk;
  const halo = LANTERN_HALO * (0.4 + 0.6 * dusk);
  const plank = vary(rng, TIMBER, 0.05);
  const smokes = kit.particles(false, 0.8);
  TREES.forEach(([x, z, h, r], t) => {
    giant(kit, kit.solid, x, z, h, r, rng);
    DECKS.forEach(([y, out]) => {
      const R = r * (1 - (y / h) * 0.5) + out;
      // The platform, its rail of posts and a rope rail, and struts under it to the trunk.
      kit.solid.add(prism(R, R, DECK_T, 16), plank, T(x, y - DECK_T, z));
      kit.solid.add(prism(R + 0.3, R + 0.3, 0.4, 16, true), shade(TIMBER, 0.7), T(x, y - DECK_T - 0.2, z));
      const posts = kit.q(16, 8);
      for (let p = 0; p < posts; p++) {
        const a = (p / posts) * Math.PI * 2;
        kit.solid.add(box(0.25, RAIL_H, 0.25), WEATHERED, T(x + Math.cos(a) * (R - 0.3), y, z + Math.sin(a) * (R - 0.3)));
        if (p % 2 === 0) kit.solid.add(beam([x + Math.cos(a) * (r * 0.95), y - 12, z + Math.sin(a) * (r * 0.95)], [x + Math.cos(a) * (R - 0.5), y - DECK_T, z + Math.sin(a) * (R - 0.5)], 0.35, 4), shade(WEATHERED, 0.8));
      }
      kit.solid.add(prism(R - 0.25, R - 0.25, 0.12, 16, true), ROPE, T(x, y + RAIL_H - 0.1, z));
      // Lanterns on the rail, folk at it.
      for (let l = 0; l < 4; l++) {
        const a = (l / 4) * Math.PI * 2 + t;
        lantern(kit, [x + Math.cos(a) * (R - 0.3), y + RAIL_H + 0.5, z + Math.sin(a) * (R - 0.3)], 0.35, halo, t * 3 + l);
      }
      for (let f = 0; f < kit.q(FOLK.high, FOLK.low); f++) {
        // Toward the course (−Z) half of the ring, where they can see the racers.
        const a = -Math.PI / 2 + (rng() - 0.5) * Math.PI * 1.2;
        kit.crowd({ x: x + Math.cos(a) * (R - 1.4), y: y - 0.1, z: z + Math.sin(a) * (R - 1.4), ry: Math.atan2(Math.cos(a), Math.sin(a)), color: vary(rng, DYES[Math.floor(rng() * DYES.length)], 0.1), scale: FOLK_SCALE, hop: 0.2, freq: 3 + rng() * 2, phase: rng() * 10, sharp: 2, raise: 0.6, walk: rng() < 0.3 ? 2 : 0, walkFreq: 0.4 });
      }
    });
    // The stair: planks spiralling up the trunk to the lower deck.
    const rise = kit.q(STAIR_RISE.high, STAIR_RISE.low);
    for (let y = 2; y < DECKS[0][0] - 1; y += rise) {
      const a = y * 0.18 + t;
      const rr = r * (1 - (y / h) * 0.5) + 1.6;
      kit.solid.add(box(3.2, 0.3, 1.2), plank, T(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, -a));
    }
    // Pods hanging under the lower deck, each from a rope, glowing doorway toward the trail.
    for (let p = 0; p < kit.q(PODS.high, PODS.low); p++) {
      const a = (p / kit.q(PODS.high, PODS.low)) * Math.PI * 2 + rng();
      const rr = r + DECKS[0][1] * 0.65;
      const px = x + Math.cos(a) * rr;
      const pz = z + Math.sin(a) * rr;
      const top = DECKS[0][0] - DECK_T - 2;
      const s = 0.8 + rng() * 0.4;
      const cloth = vary(rng, DYES[Math.floor(rng() * DYES.length)], 0.08);
      kit.solid.add(lathe(POD_PROFILE.map(([pr, py]) => [pr * POD_R * s, py * POD_H * s] as const), kit.q(10, 7)), cloth, T(px, top - POD_H * s - 3, pz));
      kit.solid.add(new THREE.ConeGeometry(POD_R * s * 0.8, 2.6 * s, kit.q(10, 7)), shade(TIMBER, 0.75), T(px, top - 3 + 0.4, pz));
      kit.solid.add(beam([px, top - 3, pz], [px, top, pz], 0.12, 3), ROPE);
      // Doorway and a window, facing out from the trunk.
      const ox = Math.cos(a);
      const oz = Math.sin(a);
      kit.lamp(new THREE.CircleGeometry(0.9 * s, 8).rotateY(Math.atan2(ox, oz)), [px + ox * POD_R * s * 0.98, top - POD_H * s * 0.55 - 3, pz + oz * POD_R * s * 0.98], LANTERN, halo * 0.6, undefined, { depth: 0.25, freq: 0.9, phase: p });
      if (p === 0) smoke(smokes, rng, [px, top - 2, pz], { count: kit.q(18, 8), color: mix(0xc8c8c0, opts.palette.horizon, 0.3), size: 3, rise: 2.5, wind: [1.5, 0, 0.5], period: 7, spread: 2 });
    }
  });

  // Plank bridges between the lower decks, lanterns strung along them; pennants between the upper ones.
  const pairs: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ];
  for (const [i, j] of pairs) {
    const [ax, az, , ar] = TREES[i];
    const [bx, bz, , br] = TREES[j];
    const d = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / d;
    const uz = (bz - az) / d;
    const y = DECKS[0][0] - DECK_T / 2;
    const a: V3 = [ax + ux * (ar + DECKS[0][1] - 1), y, az + uz * (ar + DECKS[0][1] - 1)];
    const b: V3 = [bx - ux * (br + DECKS[0][1] - 1), y, bz - uz * (br + DECKS[0][1] - 1)];
    const n = kit.q(PLANKS.high, PLANKS.low);
    const pts = catenary(a, b, BRIDGE_SAG, n);
    const yaw = Math.atan2(-uz, ux);
    for (let k = 0; k < n; k++) {
      const p = pts[k];
      const q = pts[k + 1];
      kit.solid.add(box(Math.hypot(q[0] - p[0], q[2] - p[2]) * 0.8, 0.25, BRIDGE_W), plank, T((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, yaw));
    }
    const side: V3 = [-uz * BRIDGE_W * 0.55, 0, ux * BRIDGE_W * 0.55];
    for (const sgn of [-1, 1]) {
      rope(kit, [a[0] + side[0] * sgn, a[1] + RAIL_H, a[2] + side[2] * sgn], [b[0] + side[0] * sgn, b[1] + RAIL_H, b[2] + side[2] * sgn], BRIDGE_SAG);
    }
    lampString(kit, [a[0], a[1] + RAIL_H + 2, a[2]], [b[0], b[1] + RAIL_H + 2, b[2]], BRIDGE_SAG + 1, kit.q(8, 4), 0.3, halo * 0.5, [LANTERN]);
    const y2 = DECKS[1][0] + RAIL_H;
    bunting(kit, [ax, y2 + 4, az], [bx, y2 + 4, bz], 5, kit.q(14, 7), 1.6);
  }

  // The basket lift: rope from the high deck to the floor, a basket riding it.
  const [lx, lz, , lr] = TREES[1];
  const liftX = lx;
  const liftZ = lz - lr - DECKS[0][1] - 2;
  kit.solid.add(beam([liftX, 0, liftZ], [liftX, DECKS[1][0] + 4, liftZ], 0.1, 3), ROPE);
  kit.solid.add(beam([lx, DECKS[1][0] + 4, lz], [liftX, DECKS[1][0] + 4, liftZ], 0.4, 4), WEATHERED);
  const lift = { drift: [0, LIFT_TRAVEL, 0] as V3, driftFreq: LIFT_RATE, phase: 0 };
  kit.moving.add(box(3, 2, 3), shade(TIMBER, 0.8), T(liftX, LIFT_TRAVEL + 4, liftZ), lift);
  kit.lamp(new THREE.OctahedronGeometry(0.4), [liftX, LIFT_TRAVEL + 6.6, liftZ], LANTERN, halo * 0.5, lift);

  // The forest floor under it: ferns, stones, a woodpile.
  for (let i = 0; i < kit.q(40, 18); i++) fern(kit.solid, (rng() - 0.5) * RADIUS * 1.8, (rng() - 0.5) * RADIUS * 1.6, 3 + rng() * 3, rng, FERN);
  for (let i = 0; i < kit.q(8, 4); i++) mossyRock(kit.solid, (rng() - 0.5) * RADIUS * 1.6, (rng() - 0.5) * RADIUS * 1.4, 1.5 + rng() * 2, rng);
  for (let i = 0; i < 6; i++) kit.solid.add(prism(0.5, 0.5, 6, 6).rotateZ(Math.PI / 2), shade(TIMBER, 0.7), T(10, 0.5 + Math.floor(i / 3) * 0.95, -20 + (i % 3) * 1.05));

  return finishCoast(kit, RADIUS);
}
