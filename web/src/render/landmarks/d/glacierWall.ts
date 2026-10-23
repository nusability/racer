// The glacier wall: a towering face of blue ice, columned and split by dark crevasses, seracs
// teetering along its crest, meltwater pouring from its lip into a glowing pool. Bound as a
// blocker, a slab of the face calves: cracks flare along its back during 'warn', it leans, then
// topples across the road to land exactly as 'down' begins. The piece over the opening shatters
// on impact; the rest lies there as the bar until the slab collapses into slush when it ends.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { blockerStage } from '../../../core/hazards.ts';
import { T, box, mix, prism, shade, vary } from '../b/shapes.ts';
import { smoke } from '../c/kit.ts';
import { brush, glowBoost } from '../a/kit.ts';
import { ICE, ICE_DARK, ICE_DEEP, IceKit, RoadFrame, bindHazard, hide, smooth01 } from './kit.ts';

const SALT = 0x91ac1;
const RADIUS = 220;
/** The face runs along local X at this z, from −HALF_W to HALF_W. */
const FACE_Z = -RADIUS * 0.82;
const HALF_W = RADIUS * 0.95;
const FACE_H = 115;
const COLUMNS = { high: 34, low: 20 } as const;
const SERACS = { high: 22, low: 11 } as const;
const FALLS: readonly number[] = [-0.55, 0.38];
/** Calving slab: width along the road, chunks along its length. */
const SLAB_W = 7;
/** A slab part shorter than this (metres) is not worth a chunk. */
const MIN_PART = 0.5;
const CHUNKS = 14;
/** Share of the warning spent cracking; the rest is the fall. */
const CRACK_SHARE = 0.68;
const LEAN = 0.06;
/** Share of the idle time spent collapsing the fallen slab, then regrowing the next one. */
const COLLAPSE = 0.12;
const REGROW_FROM = 0.25;
const DUST_RATE = 0.05;
/** Share of columns whose middle band is self-lit, its brightness, and how much fades by night. */
const LIT_SHARE = 0.4;
const LIT_GLOW = 0.8;
const LIT_DUSK = 0.45;
const CREVASSE_GLOW = 0.6;


export function createGlacierWall(opts: LandmarkOptions): Landmark {
  const ik = new IceKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('glacierWall', opts, ['blocker'] as const, {
    def: { type: 'blocker', id: 'free', at: 0, opening: 8, offset: 3, height: 7, warn: 5, up: 4, period: 20, phase: 0 },
    roadZ: -RADIUS * 0.97,
    lateral: -1,
    minX: -10,
    maxX: 10,
  });
  const def = bound.def;
  const boost = glowBoost(opts.palette);
  const snow = ik.snow;
  const deep = mix(ICE_DEEP, opts.palette.sky, 0.15);
  const dusk = opts.palette.dusk;
  const iceGlow = LIT_GLOW * (1 - LIT_DUSK * dusk);

  // --- The face: columns of ice, deep blue at the foot to white at the crest ---
  const n = ik.q(COLUMNS.high, COLUMNS.low);
  const colW = (2 * HALF_W) / n;
  for (let i = 0; i < n; i++) {
    const x = -HALF_W + (i + 0.5) * colW;
    const edge = 1 - smooth01((Math.abs(x) - HALF_W * 0.7) / (HALF_W * 0.3));
    const h = FACE_H * (0.7 + rng() * 0.4) * (0.35 + 0.65 * edge);
    const z = FACE_Z + (rng() - 0.3) * 9;
    const d = 30 + rng() * 20;
    const w = colW * (0.9 + rng() * 0.3);
    // Leaning back a touch, as a calving face does; each column a little different in tone.
    const m = T(x, 0, z + d / 2, (rng() - 0.5) * 0.12, -0.04 - rng() * 0.05);
    const base = vary(rng, mix(ICE, deep, 0.62), 0.05);
    kit.solid.add(box(w, h * 0.3, d), base, m);
    // Some columns hold light in their middle band: the blue that thick ice glows with.
    const mid = vary(rng, mix(ICE, deep, 0.28), 0.05);
    if (rng() < LIT_SHARE) kit.lights.add(box(w * 0.98, h * 0.42, d), shade(mid, iceGlow), m.clone().multiply(T(0, h * 0.3, 0.5)));
    else kit.solid.add(box(w * 0.98, h * 0.42, d), mid, m.clone().multiply(T(0, h * 0.3, 0.5)));
    kit.solid.add(box(w * 0.96, h * 0.16, d), vary(rng, mix(ICE, snow, 0.35), 0.03), m.clone().multiply(T(0, h * 0.72, 1)));
    // Jagged serac spikes along the crest of each column.
    for (let k = 0; k < 2; k++) kit.solid.add(new THREE.ConeGeometry(w * 0.4, h * (0.08 + rng() * 0.16), 4).translate(0, h * 0.05, 0), mix(snow, ICE, 0.15 + k * 0.2), m.clone().multiply(T((rng() - 0.5) * w * 0.5, h * 0.88, 4 + k * d * 0.4, rng() * 3)));
    // Strata: thin pale bands of old snow layers across the ice.
    if (rng() < 0.5) kit.solid.add(box(w * 1.01, 1.2, d * 0.98), mix(snow, ICE, 0.4), m.clone().multiply(T(0, h * (0.15 + rng() * 0.5), 0.2)));
    // Crevasses: dark by day, glowing a deep cold blue at night.
    if (rng() < 0.4) kit.lights.add(box(1.4, h * (0.4 + rng() * 0.4), 4), mix(ICE_DARK, 0x30b0ff, CREVASSE_GLOW * dusk), T(x + w / 2, 0, z - 0.5));
  }
  // Behind the face: the glacier tongue climbing away, its crest broken into seracs.
  kit.solid.add(box(2 * HALF_W, 4, RADIUS * 0.9), snow, T(0, FACE_H * 0.85, FACE_Z + RADIUS * 0.45 + 30, 0, -0.08));
  for (let i = 0; i < ik.q(SERACS.high, SERACS.low); i++) {
    const x = (rng() - 0.5) * 2 * HALF_W * 0.85;
    const z = FACE_Z + 22 + rng() * 60;
    const s = 6 + rng() * 10;
    kit.solid.add(box(s, s * (1 + rng()), s * 0.8), vary(rng, mix(ICE, snow, 0.4), 0.05), T(x, FACE_H * 0.82, z, rng() * 3, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5));
  }
  for (let i = 0; i < ik.q(10, 5); i++) {
    const x = (rng() - 0.5) * 2 * HALF_W * 0.8;
    kit.solid.add(box(2.4, 0.4, 60 + rng() * 40), ICE_DARK, T(x, FACE_H * 0.87 + 4, FACE_Z + 90, (rng() - 0.5) * 0.3, -0.08));
  }
  // Meltwater: a glowing ribbon down the face, spray at the foot and a pool of bright blue.
  const spray = kit.particles(false, 0.8);
  for (const fx of FALLS) {
    const x = fx * HALF_W;
    kit.lamp(box(5, FACE_H * 0.8, 0.5), [x, 0, FACE_Z - 4], mix(0x9ae8ff, 0xffffff, 0.3), 0, undefined, { depth: 0.35, freq: 7, phase: x, sharp: 2 });
    kit.moving.add(box(3, FACE_H * 0.8, 0.6), 0xe8fbff, T(x, 0, FACE_Z - 4.4), { drift: [0.8, 0, 0], driftFreq: 9, phase: x });
    kit.lamp(new THREE.CircleGeometry(22, 12).rotateX(-Math.PI / 2), [x, 0.15, FACE_Z - 16], mix(0x30b8e8, opts.palette.sky, 0.2), 0, undefined, { depth: 0.15, freq: 1.3, phase: x });
    kit.solid.add(prism(24, 23, 0.6, 12), mix(ICE, snow, 0.5), T(x, -0.4, FACE_Z - 16));
    smoke(spray, rng, [x, 1, FACE_Z - 6], { count: ik.q(28, 14), color: 0xf4fcff, size: 7, rise: 6, wind: [2, 0, -5], period: 3.5, spread: 8, grow: 0.6 });
  }
  // Boulders of old calvings round the foot.
  for (let i = 0; i < ik.q(16, 8); i++) {
    const x = (rng() - 0.5) * 2 * HALF_W * 0.9;
    const s = 3 + rng() * 6;
    kit.solid.add(new THREE.IcosahedronGeometry(s, 0), vary(rng, mix(ICE, snow, 0.3), 0.06), T(x, s * 0.3, FACE_Z - 10 - rng() * 25, rng() * 3, rng(), 0, [1, 0.7, 1]));
  }

  // --- The calving slab: chunks on bones, posed from the road; a crack line behind it ---
  const chunks: THREE.Bone[] = [];
  const slabCol = mix(ICE, deep, 0.35);
  for (let i = 0; i < CHUNKS; i++) {
    const bone = rig.bone();
    const c = i % 3 === 0 ? shade(slabCol, 1.08) : slabCol;
    // Unit block from the bone back toward the hinge (−Y) and toward the face (−X): fallen,
    // that −X is up, so the slab lies on the road rather than half under it.
    rig.add(box(1, 1, 1).translate(-0.5, -1, 0), c, { bone });
    if (i === CHUNKS - 1) rig.add(box(1.04, 0.1, 1.04).translate(-0.5, -0.1, 0), snow, { bone });
    chunks.push(bone);
  }
  const crack = rig.bone();
  rig.add(box(1, 1, 1), 0xbff4ff, { bone: crack, layer: 'glow' });

  const cloud = ik.cloud(ik.q(420, 210), 0, false, 0.7);
  cloud.setFogScale(0.6);
  const dust = brush({ life: 2.8, size0: 4, size1: 20, c0: mix(snow, 0xffffff, 0.5), c1: mix(snow, opts.palette.horizon, 0.5), alpha: 0.75, keep: 0.4, lift: 0.6 });
  const shards = brush({ life: 1.6, size0: 2.5, size1: 1, c0: mix(ICE, 0xffffff, 0.5), c1: new THREE.Color(ICE), alpha: 0.95, keep: 0.85, lift: -16 });

  const h = bound.hazard;
  const road = new RoadFrame(bound.binding);
  const hinge = new THREE.Vector3();
  const fall = new THREE.Vector3();
  const P = new THREE.Vector3();
  let wasDown = false;
  let dustAcc = 0;
  let fallen = false;
  const pose = { theta: 0, sink: 0, length: 0, yaw: 0 };

  /** Poses `count` chunks (from index `first`) over [a, b] metres from the hinge; returns the next index. */
  function layPart(a: number, b: number, count: number, first: number, opening: boolean): number {
    const k = road.unit;
    const thick = def.height;
    for (let j = 0; j < count; j++) {
      const bone = chunks[first + j];
      const top = a + ((b - a) * (j + 1)) / count;
      const len = (b - a) / count;
      // On impact the piece over the opening shatters, leaving the opening clear.
      if (len <= 0 || pose.sink >= 1 || (opening && fallen)) {
        hide(bone);
        continue;
      }
      // Hinge at the face's foot; the slab's far end swings over onto the far road edge.
      bone.position.copy(hinge).addScaledVector(fall, top * Math.sin(pose.theta) * k);
      bone.position.y = hinge.y + (top * Math.cos(pose.theta) - pose.sink * (fallen ? thick : pose.length)) * k;
      bone.rotation.order = 'YXZ';
      bone.rotation.set(0, pose.yaw, -pose.theta);
      bone.scale.set(thick * k, len * k, SLAB_W * k);
    }
    return first + count;
  }

  function update(time: number, dt: number): void {
    road.at(h.s0);
    const k = road.unit;
    // The face's side of the road, and where the cross-section at s0 meets the face's foot.
    const home = road.origin.dot(road.across) > 0 ? -1 : 1;
    const towardFace = road.across.z * home;
    const t = Math.abs(towardFace) > 1e-3 ? (FACE_Z - road.origin.z) / (towardFace * k) : (home > 0 ? h.maxX : -h.minX) + 20;
    const hingeX = home * t;
    road.point(hingeX, 0, hinge);
    hinge.y = 0;
    fall.copy(road.across).multiplyScalar(-home);
    const farX = home > 0 ? h.minX : h.maxX;
    const length = Math.abs(hingeX - farX) + 2;
    const openA = def.offset - def.opening / 2;
    const openB = def.offset + def.opening / 2;

    const st = blockerStage(def, time);
    let theta = 0;
    let sink = 0;
    let crackGlow = 0;
    if (st.stage === 'warn') {
      if (st.progress < CRACK_SHARE) {
        theta = LEAN * smooth01(st.progress / CRACK_SHARE);
        crackGlow = st.progress / CRACK_SHARE;
      } else {
        const u = (st.progress - CRACK_SHARE) / (1 - CRACK_SHARE);
        theta = LEAN + (Math.PI / 2 - LEAN) * u * u;
        crackGlow = 1 - u;
      }
    } else if (st.stage === 'down') {
      theta = Math.PI / 2;
    } else if (st.progress < COLLAPSE) {
      theta = Math.PI / 2;
      sink = smooth01(st.progress / COLLAPSE);
    } else {
      // The next slab grows up out of the foot of the face, slowly enough not to be noticed.
      sink = 1 - smooth01((st.progress - REGROW_FROM) / (1 - REGROW_FROM));
    }
    fallen = theta >= Math.PI / 2 - 1e-6;
    pose.theta = theta;
    pose.sink = sink;
    pose.length = length;
    pose.yaw = RoadFrame.yaw(fall);
    // Cut the slab where the opening's edges will be once it lies flat, so the piece over the
    // opening shatters cleanly and the rest covers the blocked spans exactly.
    const nearEdge = home > 0 ? Math.max(openA, openB) : Math.min(openA, openB);
    const farEdge = home > 0 ? Math.min(openA, openB) : Math.max(openA, openB);
    const dNear = THREE.MathUtils.clamp(Math.abs(hingeX - nearEdge), 0, length);
    const dFar = THREE.MathUtils.clamp(Math.abs(hingeX - farEdge), dNear, length);
    const nFar = length - dFar > MIN_PART ? Math.max(1, Math.round(((length - dFar) / length) * (CHUNKS - 1))) : 0;
    let ci = layPart(0, dNear, CHUNKS - 1 - nFar, 0, false);
    ci = layPart(dNear, dFar, 1, ci, true);
    layPart(dFar, length, nFar, ci, false);
    // The crack: a thin glowing seam between the slab and the face, brightening toward the fall.
    if (crackGlow > 0) {
      crack.position.copy(hinge).addScaledVector(fall, -def.height * k);
      crack.position.y = hinge.y + (length / 2) * k;
      crack.rotation.set(0, pose.yaw, -theta);
      crack.scale.set(0.8 * k * crackGlow * boost, length * k * (0.3 + 0.7 * crackGlow), SLAB_W * 1.05 * k);
    } else hide(crack);
    rig.sync();

    if (dt <= 0) return;
    // Impact: a wall of powder along the slab and ice shards out of the shattered middle.
    if (st.stage === 'down' && !wasDown) {
      for (let i = 0; i < 40; i++) {
        const x = hingeX - home * rng() * length;
        road.point(x, 1, P).addScaledVector(road.along, (rng() - 0.5) * SLAB_W * k);
        cloud.emit(dust, P.x, P.y, P.z, (rng() - 0.5) * 14, 3 + rng() * 8, (rng() - 0.5) * 14);
      }
      for (let i = 0; i < 24; i++) {
        road.point(def.offset + (rng() - 0.5) * def.opening, 2, P);
        cloud.emit(shards, P.x, P.y, P.z, (rng() - 0.5) * 16, 6 + rng() * 10, (rng() - 0.5) * 16);
      }
    }
    wasDown = st.stage === 'down';
    dustAcc += dt;
    while (dustAcc > DUST_RATE) {
      dustAcc -= DUST_RATE;
      // Trickles off the crack while it opens; slush clouds while the slab collapses.
      if (crackGlow > 0.2) {
        road.point(hingeX, 0, P);
        cloud.emit(dust, P.x, P.y + length * k * rng(), P.z, (rng() - 0.5) * 3, -2, (rng() - 0.5) * 3);
      } else if (st.stage === 'idle' && st.progress < COLLAPSE) {
        road.point(hingeX - home * rng() * length, 1, P);
        cloud.emit(dust, P.x, P.y, P.z, (rng() - 0.5) * 6, 2 + rng() * 3, (rng() - 0.5) * 6);
      }
    }
  }

  return ik.finish(RADIUS, RADIUS * 1.3, FACE_H * 1.2, update);
}
