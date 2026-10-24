// The rope bridge: a long plank bridge slung high across the trail between two giants, forty
// metres up, from a platform round one trunk to a platform round the other. Its deck sags in
// a long curve, hand ropes either side hung from it by a ladder of suspenders, lanterns at
// every few metres, and the whole span sways a little in the wind. Someone is always crossing.
// The course passes under it: a gateway into the deep woods.
//
// Placement: scenery (no hazard). Its origin is the NEAR anchor tree; the bridge runs from it
// across the course (local −Z) to the FAR anchor SPAN m away (×scale). Place it at side s,
// distance 4–12 (RADIUS is the near tree's footprint), on a stretch where the road plus both
// run-offs is under SPAN − 2·(distance + RADIUS) − 20 m wide, so the far tree stands clear
// beyond the far boundary; keep that far spot free of other landmarks and roads. The far
// trunk is rooted deep, so it meets the ground wherever the far side lies.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import { T, beam, box, catenary, prism, shade, vary } from '../b/shapes.ts';
import type { Motion, V3 } from '../b/motion.ts';
import { finishCoast } from '../c/kit.ts';
import { FERN, LANTERN, ROPE, TIMBER, WEATHERED, fern, giant, lantern, mossyRock } from './kit.ts';

const SALT = 0x40be;
/** The near anchor's footprint: the tree, its stair and its ferns. */
const RADIUS = 30;
/** From the near anchor's trunk to the far one's, metres, and the deck's height at the anchors. */
const SPAN = 200;
const DECK_Y = 46;
const SAG = 9;
const DECK_W = 3;
/** Planks along the span (high, low); suspenders every n-th plank. */
const PLANKS = { high: 70, low: 36 } as const;
const SUSPENDER_EVERY = 3;
/** Hand ropes stand this high over the deck at the anchors, sagging less than it. */
const RAIL_H = 1.6;
const RAIL_SAG = 7;
/** Anchor giants: height and radius; their platforms' reach past the bark. */
const ANCHOR_H = 120;
const ANCHOR_R = 7;
const PLATFORM_OUT = 8;
/** The far trunk's foot is sunk this far below the near one's, to meet any ground. */
const FAR_SINK = 30;
/** Lanterns along the span (high, low). */
const LANTERNS = { high: 12, low: 6 } as const;
const LANTERN_HALO = 3;
/** The span's sway: angle (radians) and rate (rad/s). */
const SWAY = 0.012;
const SWAY_RATE = 0.45;
/** A walker crossing: how far each way along the middle of the span (m) and how fast (rad/s). */
const WALK = 45;
const WALK_RATE = 0.06;

export function createRopeBridge(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const rng = kit.rng;
  const dusk = opts.palette.dusk;
  const halo = LANTERN_HALO * (0.3 + 0.7 * dusk);
  const plank = vary(rng, TIMBER, 0.05);

  // --- The anchor giants, platforms round them at deck height, a stair up the near one ---
  const near: V3 = [0, 0, 0];
  const far: V3 = [0, -FAR_SINK, -SPAN];
  for (const [x, y, z] of [near, far]) {
    giant(kit, kit.solid, x, z, ANCHOR_H + (y < 0 ? FAR_SINK : 0), ANCHOR_R, rng, { base: y });
    const R = ANCHOR_R * 0.8 + PLATFORM_OUT;
    kit.solid.add(prism(R, R, 1, 14), plank, T(x, DECK_Y - 1, z));
    for (let p = 0; p < kit.q(14, 7); p++) {
      const a = (p / kit.q(14, 7)) * Math.PI * 2;
      kit.solid.add(box(0.25, RAIL_H, 0.25), WEATHERED, T(x + Math.cos(a) * (R - 0.3), DECK_Y, z + Math.sin(a) * (R - 0.3)));
      if (p % 2 === 0) kit.solid.add(beam([x + Math.cos(a) * ANCHOR_R * 0.8, DECK_Y - 10, z + Math.sin(a) * ANCHOR_R * 0.8], [x + Math.cos(a) * (R - 0.5), DECK_Y - 1, z + Math.sin(a) * (R - 0.5)], 0.3, 4), shade(WEATHERED, 0.8));
    }
    lantern(kit, [x, DECK_Y + 3, z - R + 0.5], 0.5, halo, x + z);
  }
  for (let y = 2; y < DECK_Y - 1; y += kit.q(1.8, 3.6)) {
    const a = y * 0.2;
    const rr = ANCHOR_R * (1 - (y / ANCHOR_H) * 0.5) + 1.6;
    kit.solid.add(box(3.2, 0.3, 1.2), plank, T(Math.cos(a) * rr, y, Math.sin(a) * rr, -a));
  }

  // --- The span: planks on a catenary, hand ropes, suspenders, lanterns; all swaying together ---
  const R = ANCHOR_R * 0.8 + PLATFORM_OUT;
  const a: V3 = [0, DECK_Y - 0.5, -R + 0.5];
  const b: V3 = [0, DECK_Y - 0.5, -SPAN + R - 0.5];
  const sway: Motion = { pivot: [0, DECK_Y + 20, -SPAN / 2], axisB: [0, 0, 1], swingB: SWAY, freq: SWAY_RATE, phase: 0 };
  const n = kit.q(PLANKS.high, PLANKS.low);
  const deck = catenary(a, b, SAG, n);
  for (let k = 0; k < n; k++) {
    const p = deck[k];
    const q = deck[k + 1];
    const pitch = Math.atan2(q[1] - p[1], p[2] - q[2]);
    kit.moving.add(box(DECK_W, 0.25, Math.abs(q[2] - p[2]) * 0.82), vary(rng, plank, 0.05), T(0, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, 0, pitch), sway);
  }
  for (const side of [-1, 1]) {
    const x = (side * DECK_W) / 2;
    const rail = catenary([x, a[1] + RAIL_H, a[2]], [x, b[1] + RAIL_H, b[2]], RAIL_SAG, n);
    for (let k = 0; k < n; k++) kit.moving.add(beam(rail[k], rail[k + 1], 0.07, 3), ROPE, undefined, sway);
    for (let k = 0; k <= n; k += SUSPENDER_EVERY) kit.moving.add(beam([x, deck[k][1], deck[k][2]], rail[k], 0.04, 3), ROPE, undefined, sway);
    // Stay ropes from the platforms' crowns down to the span's ends.
    kit.solid.add(beam([x, DECK_Y + 14, -R * 0.4], [x, a[1] + RAIL_H, a[2]], 0.08, 3), ROPE);
    kit.solid.add(beam([x, DECK_Y + 14, -SPAN + R * 0.4], [x, b[1] + RAIL_H, b[2]], 0.08, 3), ROPE);
  }
  const nL = kit.q(LANTERNS.high, LANTERNS.low);
  for (let l = 1; l <= nL; l++) {
    const k = Math.round((l / (nL + 1)) * n);
    const side = l % 2 ? -1 : 1;
    kit.lamp(new THREE.OctahedronGeometry(0.4), [(side * DECK_W) / 2, deck[k][1] + RAIL_H + 0.2, deck[k][2]], LANTERN, halo, sway, { depth: 0.15, freq: 2, phase: l, sharp: 1 });
  }
  // Someone crossing, back and forth over the middle of the span.
  kit.crowd({ x: 0, y: deck[Math.round(n / 2)][1] + 0.1, z: -SPAN / 2, ry: Math.PI, color: 0x6a5a3a, scale: 1.3, hop: 0.1, freq: 3, phase: 0, walk: WALK, walkFreq: WALK_RATE });

  // --- The near tree's foot: ferns and stones ---
  for (let i = 0; i < kit.q(16, 8); i++) {
    const ang = rng() * Math.PI * 2;
    const d = ANCHOR_R * 2 + rng() * (RADIUS - ANCHOR_R * 2);
    fern(kit.solid, Math.cos(ang) * d, Math.sin(ang) * d, 2.5 + rng() * 3, rng, FERN);
  }
  for (let i = 0; i < kit.q(4, 2); i++) mossyRock(kit.solid, (rng() - 0.5) * RADIUS * 1.6, (rng() - 0.5) * RADIUS * 1.6, 1.2 + rng() * 2, rng);

  return finishCoast(kit, RADIUS);
}
