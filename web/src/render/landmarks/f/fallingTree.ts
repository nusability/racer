// The falling tree: an old giant at the roadside, its bark gone silver, its crown half dying,
// standing among living giants like a warning. Bound as a blocker, it comes down across the
// road: through the warning it creaks and sways, harder and harder, shedding bark and leaves,
// then it lets go, tearing its whole root plate out of the ground, and topples across the
// trail to land exactly as 'down' begins, its upper trunk and crown crashing into the woods
// on the far side and the root plate standing up behind its foot like a wall of earth. The
// length over the opening shatters on impact; the rest lies there as the bar. Through the
// first of the quiet time it is cleared (sinking into the litter in a cloud of sawdust), and
// the next old giant of the stand rises in its place behind the screen of ferns.
//
// Placement: bind to a blocker (`hazard`), side either, distance 2–8 (the hinge stands
// HINGE_OUT m past the road edge whatever the distance), scale 1. The trunk is TRUNK_BULK × the
// blocker's `height` thick; keep `height` 5–7 so it reads as a trunk, and the opening ≥ 8 m.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { blockerStage } from '../../../core/hazards.ts';
import { T, beam, mix, prism, shade, vary } from '../b/shapes.ts';
import { brush, col } from '../a/kit.ts';
import { BARK, DEAD_BARK, FERN, MOSS, RigKit, RoadFrame, bindHazard, fern, giant, hide, leafColour, mossyRock, smooth01 } from './kit.ts';

const SALT = 0xfa11e;
const RADIUS = 70;
/** The hinge (the trunk's road-side foot) stands this far past the road edge on the landmark's side. */
const HINGE_OUT = 3;
/** The trunk's girth over the blocker's collision height: a giant, lying higher than the bar it is. */
const TRUNK_BULK = 2;
/** Trunk pieces along the felled length; a piece shorter than this (m) is not worth one. */
const CHUNKS = 10;
const MIN_PART = 0.5;
/** Share of the warning spent creaking and swaying; the rest is the fall. */
const CREAK_SHARE = 0.6;
/** Sway at the end of the creaking (radians) and its rate (rad/s); the lean the fall starts from. */
const SWAY = 0.05;
const SWAY_RATE = 2.6;
const LEAN = 0.06;
/** Share of the quiet time spent clearing the trunk, then the next giant rises from this share. */
const CLEAR = 0.15;
const REGROW_FROM = 0.35;
/** The trunk past the road (m), then the crown: its limbs' length (m), how many (high, low), foliage clump size (m). */
const UPPER_TRUNK = 45;
const CROWN_LEN = 34;
const LIMBS = { high: 10, low: 6 } as const;
const CLUMP: readonly [number, number] = [9, 16];
/** The root plate: radius and depth (× trunk thickness), roots hanging under it, and the lean at which it starts to tear up (radians). */
const ROOT_PLATE = 1.5;
const PLATE_DEPTH = 0.3;
const ROOT_STRANDS = { high: 16, low: 8 } as const;
const PLATE_FROM = 0.04;
/** Living giants of the stand round the dead one: [x, z, height, radius] in landmark space. */
const STAND: readonly (readonly [number, number, number, number])[] = [
  [-38, -20, 150, 4.5],
  [30, -5, 165, 5],
  [-12, 35, 140, 4],
  [45, 40, 155, 4.5],
];
const DUST_RATE = 0.05;
const DEAD_LEAF = 0x8a7a50;

export function createFallingTree(opts: LandmarkOptions): Landmark {
  const ik = new RigKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('fallingTree', opts, ['blocker'] as const, {
    def: { type: 'blocker', id: 'free', at: 0, opening: 10, offset: -6, height: 6, warn: 4, up: 5, period: 18, phase: 0 },
    roadZ: -RADIUS * 0.95,
    lateral: -1,
    minX: -16,
    maxX: 16,
  });
  const def = bound.def;
  // Drawn a little thicker than the bar it is: a giant must read as one from far down the trail.
  const thick = def.height * TRUNK_BULK;
  const bark = col(DEAD_BARK);

  // --- The stand: living giants behind, ferns and mossy stones screening the foot ---
  for (const [x, z, h, r] of STAND) giant(kit, kit.solid, x, z, h, r, rng);
  for (let i = 0; i < kit.q(26, 12); i++) fern(kit.solid, (rng() - 0.5) * RADIUS * 1.6, -RADIUS * 0.4 + rng() * RADIUS * 1.2, 3 + rng() * 3, rng);
  for (let i = 0; i < kit.q(8, 4); i++) mossyRock(kit.solid, (rng() - 0.5) * RADIUS * 1.5, -RADIUS * 0.3 + rng() * RADIUS, 1.5 + rng() * 2.5, rng);
  // An older fallen giant, long since mossed over, lying along the stand.
  kit.solid.add(prism(3.2, 2.6, 60, 9).rotateZ(Math.PI / 2), mix(DEAD_BARK, MOSS, 0.55), T(-5, 3, 18, 0.2));

  // --- The felled trunk: pieces on bones, a unit round log behind the hinge plane ---
  const chunks: THREE.Bone[] = [];
  for (let i = 0; i < CHUNKS; i++) {
    const bone = rig.bone();
    // Unit trunk piece: its axis along Y from −1 up to 0, centred half a unit behind the hinge (−X).
    rig.add(prism(0.5, 0.5, 1, 9).translate(-0.5, -1, 0), vary(rng, shade(bark, i % 2 ? 0.92 : 1), 0.04), { bone });
    rig.add(prism(0.52, 0.52, 0.08, 9).translate(-0.5, -0.6, 0), shade(bark, 0.6), { bone });
    chunks.push(bone);
  }
  // The crown: the rest of the trunk past the road, then a broken crown of limbs, its foliage
  // half green, half dying, authored from the felled length's top up (+Y).
  const crown = rig.bone();
  const axis = -thick / 2;
  rig.add(prism(thick * 0.5, thick * 0.32, UPPER_TRUNK, 9).translate(axis, 0, 0), vary(rng, bark, 0.04), { bone: crown });
  const nLimbs = ik.q(LIMBS.high, LIMBS.low);
  for (let i = 0; i < nLimbs; i++) {
    const a = (i / nLimbs) * Math.PI * 2 + rng();
    const y0 = UPPER_TRUNK * (0.55 + rng() * 0.45);
    const len = CROWN_LEN * (0.5 + rng() * 0.5);
    const end: [number, number, number] = [axis + Math.cos(a) * len * 0.75, y0 + len * 0.6, Math.sin(a) * len * 0.75];
    rig.add(beam([axis, y0, 0], end, thick * 0.12, 5), shade(bark, 0.9), { bone: crown });
    const leafy = i % 3 !== 0;
    const size = CLUMP[0] + rng() * (CLUMP[1] - CLUMP[0]);
    rig.add(new THREE.IcosahedronGeometry(1, ik.q(1, 0)), leafy ? leafColour(rng) : mix(DEAD_LEAF, leafColour(rng), 0.3), { bone: crown, m: T(end[0], end[1], end[2], rng() * 3, 0, 0, [size, size * 0.5, size]) });
  }
  // The root plate: the disc of earth and roots the giant tears out of the ground as it goes,
  // standing up as a wall behind its foot once it is down. In units of the trunk's thickness.
  const plate = rig.bone();
  rig.add(prism(ROOT_PLATE, ROOT_PLATE * 0.85, PLATE_DEPTH, 12).translate(-0.5, -PLATE_DEPTH, 0), mix(opts.palette.road, 0x3a2a1c, 0.5), { bone: plate });
  rig.add(prism(ROOT_PLATE * 1.02, ROOT_PLATE, 0.04, 12).translate(-0.5, -0.02, 0), mix(opts.palette.sand, MOSS, 0.5), { bone: plate });
  for (let k = 0; k < ik.q(ROOT_STRANDS.high, ROOT_STRANDS.low); k++) {
    const a = rng() * Math.PI * 2;
    const r = ROOT_PLATE * (0.2 + rng() * 0.75);
    const len = 0.4 + rng() * 0.7;
    rig.add(new THREE.ConeGeometry(0.06 + rng() * 0.06, len, 4).rotateX(Math.PI).translate(-0.5 + Math.cos(a) * r, -PLATE_DEPTH - len / 2, Math.sin(a) * r), shade(BARK, 0.7), { bone: plate });
  }
  // The crater it leaves.
  const crater = rig.bone();
  rig.add(new THREE.CircleGeometry(ROOT_PLATE * 0.9, 12).rotateX(-Math.PI / 2).translate(-0.5, 0.01, 0), mix(opts.palette.road, 0x1a120c, 0.6), { bone: crater });

  const cloud = ik.cloud(ik.q(420, 220), 0, false, 0.75);
  cloud.setFogScale(0.6);
  const dust = brush({ life: 3, size0: 4, size1: 18, c0: col(0x9a8a6a), c1: mix(0x9a8a6a, opts.palette.horizon, 0.5), alpha: 0.75, keep: 0.4, lift: 0.4 });
  const chips = brush({ life: 1.6, size0: 0.9, size1: 0.6, c0: shade(bark, 0.8), c1: shade(bark, 0.6), alpha: 1, keep: 0.8, lift: -9 });
  const leaves = brush({ life: 3.5, size0: 1.2, size1: 1, c0: col(DEAD_LEAF), c1: mix(FERN, DEAD_LEAF, 0.5), alpha: 0.95, keep: 0.6, lift: -1.5 });

  const h = bound.hazard;
  const road = new RoadFrame(bound.binding);
  const hinge = new THREE.Vector3();
  const fall = new THREE.Vector3();
  const P = new THREE.Vector3();
  let wasDown = false;
  let dustAcc = 0;
  const pose = { theta: 0, sink: 0, length: 0, yaw: 0, fallen: false };

  /** Poses `count` pieces (from index `first`) over [a, b] metres from the hinge; returns the next index. */
  function layPart(a: number, b: number, count: number, first: number, opening: boolean): number {
    const k = road.unit;
    for (let j = 0; j < count; j++) {
      const bone = chunks[first + j];
      const top = a + ((b - a) * (j + 1)) / count;
      const len = (b - a) / count;
      if (len <= 0 || pose.sink >= 1 || (opening && pose.fallen)) {
        hide(bone);
        continue;
      }
      bone.position.copy(hinge).addScaledVector(fall, top * Math.sin(pose.theta) * k);
      bone.position.y = hinge.y + (top * Math.cos(pose.theta) - pose.sink * (pose.fallen ? thick : pose.length + UPPER_TRUNK + CROWN_LEN)) * k;
      bone.rotation.order = 'YXZ';
      bone.rotation.set(0, pose.yaw, -pose.theta);
      bone.scale.set(thick * k, len * k, thick * k);
    }
    return first + count;
  }

  function update(time: number, dt: number): void {
    road.at(h.s0);
    const k = road.unit;
    const home = road.origin.dot(road.across) > 0 ? -1 : 1;
    const edge = home > 0 ? h.maxX : h.minX;
    const hingeX = edge + home * HINGE_OUT;
    road.point(hingeX, 0, hinge);
    fall.copy(road.across).multiplyScalar(-home);
    const farX = home > 0 ? h.minX : h.maxX;
    const length = Math.abs(hingeX - farX) + 1;
    const openA = def.offset - def.opening / 2;
    const openB = def.offset + def.opening / 2;

    const st = blockerStage(def, time);
    let theta = 0;
    let sink = 0;
    let creak = 0;
    if (st.stage === 'warn') {
      if (st.progress < CREAK_SHARE) {
        creak = st.progress / CREAK_SHARE;
        theta = LEAN * smooth01(creak) + SWAY * creak * creak * Math.sin(time * SWAY_RATE * (1 + creak));
      } else {
        const u = (st.progress - CREAK_SHARE) / (1 - CREAK_SHARE);
        theta = LEAN + (Math.PI / 2 - LEAN) * u * u;
      }
    } else if (st.stage === 'down') {
      theta = Math.PI / 2;
    } else if (st.progress < CLEAR) {
      theta = Math.PI / 2;
      sink = smooth01(st.progress / CLEAR);
    } else {
      sink = 1 - smooth01((st.progress - REGROW_FROM) / (1 - REGROW_FROM));
    }
    pose.fallen = theta >= Math.PI / 2 - 1e-6;
    pose.theta = theta;
    pose.sink = sink;
    pose.length = length;
    pose.yaw = RoadFrame.yaw(fall);
    // Cut where the opening's edges fall, so the length over it shatters and the rest covers
    // the blocked spans exactly.
    const nearEdge = home > 0 ? Math.max(openA, openB) : Math.min(openA, openB);
    const farEdge = home > 0 ? Math.min(openA, openB) : Math.max(openA, openB);
    const dNear = THREE.MathUtils.clamp(Math.abs(hingeX - nearEdge), 0, length);
    const dFar = THREE.MathUtils.clamp(Math.abs(hingeX - farEdge), dNear, length);
    const nFar = length - dFar > MIN_PART ? Math.max(1, Math.round(((length - dFar) / length) * (CHUNKS - 1))) : 0;
    let ci = layPart(0, dNear, CHUNKS - 1 - nFar, 0, false);
    ci = layPart(dNear, dFar, 1, ci, true);
    layPart(dFar, length, nFar, ci, false);
    // The crown rides the trunk's top; it is gone once the trunk is cleared.
    if (sink >= 1) hide(crown);
    else {
      crown.position.copy(hinge).addScaledVector(fall, length * Math.sin(theta) * k);
      crown.position.y = hinge.y + (length * Math.cos(theta) - sink * (pose.fallen ? thick : length + UPPER_TRUNK + CROWN_LEN)) * k;
      crown.rotation.order = 'YXZ';
      crown.rotation.set(0, pose.yaw, -theta);
      crown.scale.setScalar(k);
    }
    // The root plate tears up with the trunk and goes with it when it is cleared.
    if (theta < PLATE_FROM || sink >= 1) {
      hide(plate);
      hide(crater);
    } else {
      plate.position.copy(hinge);
      plate.position.y -= sink * thick * ROOT_PLATE * k;
      plate.rotation.order = 'YXZ';
      plate.rotation.set(0, pose.yaw, -theta);
      plate.scale.setScalar(thick * k);
      crater.position.copy(hinge);
      crater.rotation.set(0, pose.yaw, 0);
      crater.scale.setScalar(thick * k);
    }
    rig.sync();

    if (dt <= 0) return;
    if (st.stage === 'down' && !wasDown) {
      // Impact: dust along the length, the opening's piece bursting into chips, the crown's leaves.
      for (let i = 0; i < 40; i++) {
        road.point(hingeX - home * rng() * length, 1, P);
        cloud.emit(dust, P.x, P.y, P.z, (rng() - 0.5) * 14, 2 + rng() * 7, (rng() - 0.5) * 14);
      }
      for (let i = 0; i < 30; i++) {
        road.point(def.offset + (rng() - 0.5) * def.opening, thick * 0.5, P);
        cloud.emit(chips, P.x, P.y, P.z, (rng() - 0.5) * 18, 6 + rng() * 10, (rng() - 0.5) * 18);
      }
      for (let i = 0; i < 24; i++) {
        road.point(hingeX + home * thick * rng() * ROOT_PLATE, thick * rng() * ROOT_PLATE, P);
        cloud.emit(dust, P.x, P.y, P.z, home * road.across.x * 6 + (rng() - 0.5) * 8, 2 + rng() * 5, home * road.across.z * 6 + (rng() - 0.5) * 8);
      }
      for (let i = 0; i < 30; i++) {
        road.point(farX - home * (UPPER_TRUNK * 0.5 + rng() * (UPPER_TRUNK + CROWN_LEN)), 3, P);
        cloud.emit(leaves, P.x, P.y, P.z, (rng() - 0.5) * 12, 3 + rng() * 8, (rng() - 0.5) * 12);
      }
    }
    wasDown = st.stage === 'down';
    dustAcc += dt;
    while (dustAcc > DUST_RATE) {
      dustAcc -= DUST_RATE;
      if (creak > 0 && rng() < creak) {
        // Bark shedding from the straining trunk, leaves shaken from the crown.
        road.point(hingeX + home * thick * 0.5, length * (0.2 + rng() * 0.6), P);
        cloud.emit(chips, P.x, P.y, P.z, (rng() - 0.5) * 3, 0, (rng() - 0.5) * 3);
        road.point(hingeX + home * (thick * 0.5 + (rng() - 0.5) * 20), length + CROWN_LEN * rng(), P);
        cloud.emit(leaves, P.x, P.y, P.z, (rng() - 0.5) * 4, -1, (rng() - 0.5) * 4);
      }
      if (st.stage === 'idle' && st.progress < CLEAR) {
        road.point(hingeX - home * rng() * length, 1, P);
        cloud.emit(dust, P.x, P.y, P.z, (rng() - 0.5) * 6, 2 + rng() * 3, (rng() - 0.5) * 6);
      }
    }
  }

  return ik.finish(RADIUS, RADIUS * 3, 180, update);
}
