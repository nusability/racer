// The log slide: a steep wooded bank rising off the trail, and high on it an old log jam, a
// tangle of giant trunks held back by a crib of timber posts that has long since started to
// give. A raw chute of bare earth runs from the jam to the foot of the slope, ferns smashed
// flat along it. Bound as a dropper it lets go: a post snaps, and logs break loose, roll down
// the chute turning end over end along their length, bounce off the foot of the bank and leap
// onto the trail to land exactly on the dropper's spots as their warning ends, lying along the
// road as the track scene draws them from then on.
//
// Placement: bind to a dropper (`hazard`), side either, distance 4–10, scale 1. Keep the
// dropper's span short (≤ 250 m: the logs come from one chute) and its radius 2.5–3.5; up to
// MAX_LOGS items. The bank stands RADIUS × 0.86 back from the landmark's centre.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { dropperItems, type DropItem } from '../../../core/hazards.ts';
import { T, beam, mix, prism, shade, vary } from '../b/shapes.ts';
import { quadPts } from '../b/props.ts';
import type { V3 } from '../b/motion.ts';
import { brush, col } from '../a/kit.ts';
import { BARK, FERN, MOSS, RigKit, RoadFrame, STONE, TIMBER, WEATHERED, bindHazard, fern, giant, hide, leafColour } from './kit.ts';

const SALT = 0x10651;
const RADIUS = 150;
/** The bank: from its foot (local z) up to the ridge, across ±HALF_W. */
const FOOT_Z = -RADIUS * 0.86;
const RIDGE_Z = RADIUS * 0.55;
const HALF_W = RADIUS * 0.9;
const RIDGE_H = 75;
const GRID = { high: [22, 12], low: [14, 8] } as const;
/** The bank steepens toward its crest. */
const PROFILE = 1.4;
/** The jam sits this far up the bank (0 = foot, 1 = crest); the chute is this wide (m). */
const JAM_AT = 0.6;
const CHUTE_W = 26;
/** Share of the warning spent rolling down the chute; the rest is the leap onto the trail. */
const ROLL_SHARE = 0.7;
const LEAP_H = 10;
const MAX_LOGS = 8;
/** Logs in the jam (high, low) and posts in its crib. */
const JAM_LOGS = { high: 18, low: 10 } as const;
const CRIB_POSTS = 7;
/** A rolling log is this long, as a multiple of the dropper's radius (the landed log is 2×). */
const LOG_LENGTH = 2;
/** Its radius × the dropper's (as the landed log the track scene draws), so it rests at that height. */
const LOG_R = 0.78;
const LOG_REST = LOG_R;
const TRAIL_RATE = 0.04;
const BURST = 14;
/** How long the snapping post flashes splinters after release (s). */
const SNAP_TIME = 0.4;

/** Ground height of the bank at local (x, z). */
function bankHeight(x: number, z: number): number {
  if (z <= FOOT_Z) return 0;
  const u = Math.min(1, (z - FOOT_Z) / (RIDGE_Z - FOOT_Z));
  const ridge = RIDGE_H * (1 + 0.12 * Math.sin(x * 0.023 + 0.7));
  const edge = 1 - smoothEdge((Math.abs(x) - HALF_W * 0.7) / (HALF_W * 0.3));
  // The chute is a shallow groove down the fall line.
  const chute = 1 - 0.1 * Math.exp(-((x / (CHUTE_W * 0.6)) ** 2)) * Math.sin(Math.PI * u);
  return ridge * u ** PROFILE * edge * chute + (z > RIDGE_Z ? -(z - RIDGE_Z) * 0.8 * edge : 0);
}
function smoothEdge(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

interface Log {
  bone: THREE.Bone;
  wasWarn: boolean;
}

export function createLogSlide(opts: LandmarkOptions): Landmark {
  const ik = new RigKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('logSlide', opts, ['dropper'] as const, {
    def: { type: 'dropper', id: 'free', from: 0, to: 0, count: 4, radius: 3.2, period: 11, warn: 2.6, stay: 3, phase: 0 },
    roadZ: -RADIUS * 0.97,
    lateral: -1,
    minX: -12,
    maxX: 12,
    span: RADIUS * 0.8,
  });
  const def = bound.def;
  if (def.count > MAX_LOGS) throw new Error(`logSlide: dropper ${def.id} drops ${def.count} logs; it can show ${MAX_LOGS}`);
  const floor = col(opts.palette.sand);
  const earth = mix(opts.palette.road, opts.palette.sand, 0.3);
  const moss = mix(opts.palette.sand, MOSS, 0.5);

  // --- The bank: one flat-shaded quad per cell; moss, litter, rock on the steeps, bare earth in the chute ---
  const [nx, nz] = kit.high ? GRID.high : GRID.low;
  const at = (i: number, j: number): V3 => {
    const x = -HALF_W + (2 * HALF_W * i) / nx;
    const z = FOOT_Z + ((RIDGE_Z + 30 - FOOT_Z) * j) / nz;
    return [x, bankHeight(x, z), z];
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      const mid = (a[0] + b[0]) / 2;
      const rise = (c[1] + d[1] - a[1] - b[1]) / 2 / ((RIDGE_Z + 30 - FOOT_Z) / nz);
      const inChute = Math.abs(mid) < CHUTE_W / 2 && (a[2] + d[2]) / 2 < FOOT_Z + (RIDGE_Z - FOOT_Z) * JAM_AT;
      // Moss and litter in broad drifts (a chequer of cells would read as a board), stone on the steeps.
      const drift = 0.5 + 0.5 * Math.sin(mid * 0.045 + a[2] * 0.03) * Math.cos(a[2] * 0.06 - mid * 0.02);
      const ground = floor.clone().lerp(moss, drift);
      const colour = inChute ? vary(rng, earth, 0.04) : rise > 1.2 && rng() < 0.35 ? vary(rng, STONE, 0.05) : vary(rng, ground, 0.03);
      kit.solid.add(quadPts(a, b, c, d), colour);
    }
  }
  // Giants on the bank either side of the chute, ferns crowding the foot.
  for (let i = 0; i < kit.q(9, 5); i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (CHUTE_W + rng() * (HALF_W * 0.7 - CHUTE_W));
    const z = FOOT_Z + 15 + rng() * (RIDGE_Z - FOOT_Z);
    giant(kit, kit.solid, x, z, 70 + rng() * 35, 3.5 + rng() * 2.5, rng, { base: bankHeight(x, z) - 1 });
  }
  for (let i = 0; i < kit.q(40, 18); i++) {
    const x = (rng() - 0.5) * HALF_W * 1.8;
    if (Math.abs(x) < CHUTE_W * 0.6) continue;
    const z = FOOT_Z + rng() * (RIDGE_Z - FOOT_Z) * 0.8;
    fern(kit.solid, x, z, 3 + rng() * 3, rng, FERN, undefined, bankHeight(x, z));
  }

  // --- The jam: a tangle of trunks behind a crib of posts, high on the bank ---
  const jamZ = FOOT_Z + (RIDGE_Z - FOOT_Z) * JAM_AT;
  const jamY = bankHeight(0, jamZ);
  for (let i = 0; i < ik.q(JAM_LOGS.high, JAM_LOGS.low); i++) {
    const len = 16 + rng() * 22;
    const r = 1.4 + rng() * 1.4;
    const x = (rng() - 0.5) * CHUTE_W * 1.6;
    const z = jamZ + 4 + rng() * 14;
    kit.solid.add(prism(r, r * 0.9, len, 8).translate(0, -len / 2, 0).rotateZ(Math.PI / 2), vary(rng, rng() < 0.3 ? mix(BARK, MOSS, 0.5) : BARK, 0.08), T(x, bankHeight(x, z) + r + (i % 3) * r * 1.6, z, (rng() - 0.5) * 0.5, 0, 0));
  }
  for (let p = 0; p < CRIB_POSTS; p++) {
    const x = -CHUTE_W * 0.8 + (p / (CRIB_POSTS - 1)) * CHUTE_W * 1.6;
    const lean = p === Math.floor(CRIB_POSTS / 2) ? 0.5 : (rng() - 0.5) * 0.25;
    kit.solid.add(prism(0.7, 0.6, 9, 6), vary(rng, WEATHERED, 0.08), T(x, jamY - 1, jamZ + 2, 0, lean, 0));
  }
  kit.solid.add(beam([-CHUTE_W * 0.8, jamY + 5, jamZ + 2], [CHUTE_W * 0.8, jamY + 4, jamZ + 2], 0.5, 5), shade(TIMBER, 0.7));

  // --- The rolling logs: bones posed from the dropper ---
  const logs: Log[] = [];
  for (let i = 0; i < def.count; i++) {
    const bone = rig.bone();
    // A unit log along X (the road's direction when it rolls down a bank beside it).
    rig.add(prism(LOG_R, LOG_R, LOG_LENGTH, 9).translate(0, -LOG_LENGTH / 2, 0).rotateZ(Math.PI / 2), vary(rng, BARK, 0.06), { bone });
    for (const end of [-1, 1]) rig.add(new THREE.CircleGeometry(LOG_R * 0.98, 9).rotateY((end * Math.PI) / 2).translate((end * LOG_LENGTH) / 2 + end * 0.01, 0, 0), mix(TIMBER, 0xe0c8a0, 0.4), { bone });
    rig.add(prism(LOG_R * 1.02, LOG_R * 1.02, LOG_LENGTH * 0.5, 9, true).translate(0, -LOG_LENGTH / 4, 0).rotateZ(Math.PI / 2), mix(BARK, MOSS, 0.6), { bone });
    hide(bone);
    logs.push({ bone, wasWarn: false });
  }

  const cloud = ik.cloud(ik.q(420, 220), 0, false, 0.75);
  cloud.setFogScale(0.6);
  const dirt = brush({ life: 2.2, size0: 3, size1: 13, c0: earth, c1: mix(earth, opts.palette.horizon, 0.5), alpha: 0.7, keep: 0.4, lift: 0.4 });
  const litter = brush({ life: 2.4, size0: 1, size1: 0.8, c0: leafColour(rng), c1: col(FERN), alpha: 0.95, keep: 0.6, lift: -3 });
  const splinter = brush({ life: 1.2, size0: 0.8, size1: 0.5, c0: col(TIMBER), c1: shade(TIMBER, 0.6), alpha: 1, keep: 0.85, lift: -12 });

  const h = bound.hazard;
  const items: DropItem[] = [];
  const road = new RoadFrame(bound.binding);
  const L = new THREE.Vector3();
  const S = new THREE.Vector3();
  const F = new THREE.Vector3();
  const P = new THREE.Vector3();
  let trailAcc = 0;

  /** Where log i is at warning progress p: rolling down the chute, then leaping onto L. */
  function path(p: number, out: THREE.Vector3): number {
    const sx = THREE.MathUtils.clamp(L.x, -CHUTE_W * 0.4, CHUTE_W * 0.4);
    S.set(sx, jamY + 3, jamZ);
    F.set(sx + (L.x - sx) * 0.5, 0, FOOT_Z + 3);
    F.y = bankHeight(F.x, F.z);
    if (p < ROLL_SHARE) {
      const u = (p / ROLL_SHARE) ** 1.6;
      out.lerpVectors(S, F, u);
      out.y = bankHeight(out.x, out.z) + Math.abs(Math.sin(u * Math.PI * 3)) * 3 * (1 - u * 0.5);
      return u * S.distanceTo(F);
    }
    const u = (p - ROLL_SHARE) / (1 - ROLL_SHARE);
    out.lerpVectors(F, L, u);
    out.y += LEAP_H * 4 * u * (1 - u);
    return S.distanceTo(F) + u * F.distanceTo(L);
  }

  function update(time: number, dt: number): void {
    dropperItems(h, time, items);
    const r = def.radius;
    let trailNow = false;
    trailAcc += dt;
    if (trailAcc > TRAIL_RATE) {
      trailAcc -= TRAIL_RATE;
      trailNow = dt > 0;
    }
    items.forEach((it, i) => {
      const lg = logs[i];
      road.at(it.s);
      if (it.stage !== 'warn') {
        // Landed: the track scene draws it from here on. Mark the impact with a burst of dirt and leaves.
        if (lg.wasWarn && it.stage === 'down' && dt > 0) {
          road.point(it.x, 0, P);
          for (let k = 0; k < BURST; k++) cloud.emit(dirt, P.x, P.y + 1, P.z, (rng() - 0.5) * 20, 3 + rng() * 8, (rng() - 0.5) * 20);
          for (let k = 0; k < BURST; k++) cloud.emit(litter, P.x, P.y + 1, P.z, (rng() - 0.5) * 14, 4 + rng() * 6, (rng() - 0.5) * 14);
        }
        lg.wasWarn = false;
        hide(lg.bone);
        return;
      }
      if (!lg.wasWarn && dt > 0) {
        // Release: a post of the crib snaps.
        for (let k = 0; k < 10; k++) cloud.emit(splinter, (rng() - 0.5) * CHUTE_W, jamY + 4, jamZ + 2, (rng() - 0.5) * 10, 4 + rng() * 6, -4 - rng() * 6);
      }
      lg.wasWarn = true;
      road.point(it.x, r * LOG_REST, L);
      const travelled = path(it.progress, lg.bone.position);
      // Rolling about its own length (the road's direction): one turn per circumference travelled.
      lg.bone.rotation.order = 'YXZ';
      lg.bone.rotation.set(-travelled / r, RoadFrame.yaw(road.along), 0);
      lg.bone.scale.setScalar(r * road.unit);
      if (trailNow) {
        const pos = lg.bone.position;
        cloud.emit(dirt, pos.x, pos.y - r * 0.5, pos.z, (rng() - 0.5) * 6, 2 + rng() * 2, (rng() - 0.5) * 6);
        if (it.progress * def.warn < SNAP_TIME) cloud.emit(splinter, pos.x, pos.y, pos.z, (rng() - 0.5) * 6, 3, (rng() - 0.5) * 6);
      }
    });
  }

  return ik.finish(RADIUS, RADIUS * 1.6, RIDGE_H + 110, update);
}
