// The herd: velvetbacks, the tall grazers of the deep woods, crossing the trail in a stately
// file. Long slender legs, a deep chest, a long neck carried high, a narrow head; the stags
// wear sweeping lyre-shaped antlers hung with moss, their tines tipped with a soft glow, and
// a line of pale spots along each flank glows at dusk. They walk, never trot: a slow, long
// stride, heads bobbing with each step, ears turning. A few graze back among the giants.
// Bound as a sweeper, the herd crosses the road: the old stag, tallest and widest-antlered,
// IS the collision cylinder at sweeperX; the rest follow in his footsteps (they never collide).
//
// Placement: bind to a sweeper (`hazard`), side either, distance 10–30, scale 1. The sweeper's
// radius 5–7 and height 9–11 suit the stag; a long `cross` (5–7 s) keeps the walk unhurried.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { sweeperX } from '../../../core/hazards.ts';
import { Frame, T, ball, beam, mix, prism, shade, vary } from '../b/shapes.ts';
import type { V3 } from '../b/motion.ts';
import type { Rng } from '../../../core/rng.ts';
import { brush, col } from '../a/kit.ts';
import { GLOW, MOSS, RigKit, RoadFrame, TIMBER, WEATHERED, bindHazard, fern, giant, mossyRock, smooth01, type Def } from './kit.ts';

const SALT = 0xbe4d;
const RADIUS = 150;
/** Design size: the stag's half-length in plan (rump to nose), which the lead is scaled to fit the cylinder. */
const BODY_R = 5;
/** Legs: [x, z] of each hip on the body, upper and lower lengths, walked in lateral sequence. */
const LEGS: readonly (readonly [number, number])[] = [[2.6, 0.75], [2.6, -0.75], [-2.4, 0.7], [-2.4, -0.7]];
const LEG_PHASE: readonly number[] = [0.25, 0.75, 0, 0.5];
const UPPER = 2.9;
const LOWER = 3;
const HIP_Y = UPPER + LOWER;
/** Stride (m per cycle), hip swing and knee lift (radians), the body's rise and fall. */
const STRIDE = 7;
const HIP_SWING = 0.32;
const KNEE_LIFT = 0.6;
const BOB = 0.12;
/** Neck mount on the body and the head at its end; the neck's carriage (radians above level). */
const NECK_AT: V3 = [3.4, HIP_Y + 1.3, 0];
const NECK_LEN = 4.2;
const NECK_RISE = 0.95;
const TAIL_AT: V3 = [-3.6, HIP_Y + 1.2, 0];
const FOLLOWERS = { high: 5, low: 3 } as const;
const GRAZERS = { high: 3, low: 1 } as const;
/** Followers trail the stag by this many seconds each and walk this far either side (m along s). */
const LAG = 1.2;
const SPREAD = 9;
const TURN = 2.6;
const TRAIL_W = 22;
const TRAIL_LEN = 120;
const SIGN_OFF = 34;
const DUST_RATE = 0.08;
/** Flank spots per side, glowing at dusk. */
const SPOTS = 6;
const COAT = 0x8a7458;
const BELLY = 0xd8c8a8;
const MUZZLE = 0x2a2420;
const ANTLER = 0xd0c4a8;

/** Where a piece rides: a bone, or a leg's upper or lower part. */
type Part = 'body' | 'neck' | 'head' | 'tail' | { leg: number; lower: boolean };
type Emit = (geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, part: Part, m: THREE.Matrix4, glow?: boolean) => void;

interface Coat {
  fur: THREE.Color;
  belly: THREE.Color;
  mane: THREE.Color;
  spot: THREE.Color;
}

/** A lyre antler on one side: a main beam sweeping up and back with tines, moss hanging from it. */
function antler(emit: Emit, side: number, size: number, c: Coat, rng: Rng): void {
  let p: V3 = [0.7, 0.9, side * 0.4];
  const tines: V3[] = [];
  for (let k = 0; k < 6; k++) {
    const t = k / 5;
    const next: V3 = [p[0] - 0.25 * size, p[1] + 0.75 * size * (1 - t * 0.3), p[2] + side * (0.45 - t * 0.55) * size];
    emit(beam(p, next, (0.16 - t * 0.09) * size, 5), ANTLER, 'head', T(0, 0, 0));
    if (k === 2 || k === 3 || k === 5) tines.push(next);
    p = next;
  }
  tines.forEach((q, i) => {
    const tip: V3 = [q[0] + 0.5 * size, q[1] + 0.7 * size, q[2] + side * 0.15 * size];
    emit(beam(q, tip, 0.07 * size, 4), ANTLER, 'head', T(0, 0, 0));
    emit(new THREE.OctahedronGeometry(0.11 * size), c.spot, 'head', T(tip[0], tip[1], tip[2]), true);
    // Moss streaming from the tines.
    if (i < 2) emit(new THREE.ConeGeometry(0.12 * size, 0.9 * size, 4).rotateX(Math.PI).translate(0, -0.45 * size, 0), c.mane, 'head', T(q[0], q[1], q[2], rng() * 3));
  });
}

/**
 * A velvetback facing +X, feet on y = 0, in its own metres: legs hang from their hips (upper)
 * with the lower leg on a knee bone; neck from the shoulders, head at the neck's end.
 */
function velvetback(emit: Emit, c: Coat, rng: Rng, stag: boolean): void {
  const fur = (k: number) => vary(rng, shade(c.fur, k), 0.03);
  // Torso: a deep chest tapering to a lighter rump; a pale belly under it.
  emit(ball(1, 9, 6), fur(1), 'body', T(1.2, HIP_Y + 1.1, 0, 0, 0, 0.08, [3.2, 1.9, 1.5]));
  emit(ball(1, 8, 5), fur(0.95), 'body', T(-2.2, HIP_Y + 1.15, 0, 0, 0, -0.05, [2.4, 1.6, 1.35]));
  emit(ball(1, 8, 4), c.belly, 'body', T(0, HIP_Y + 0.45, 0, 0, 0, 0, [3.6, 0.8, 1.1]));
  // Withers and the moss mane down the back.
  emit(ball(1, 8, 5), c.mane, 'body', T(1.8, HIP_Y + 2.7, 0, 0, 0, 0.1, [2.2, 0.45, 0.6]));
  for (let s = 0; s < SPOTS; s++) {
    for (const side of [-1, 1]) emit(ball(0.22, 5, 3), c.spot, 'body', T(-2.4 + s * 0.9, HIP_Y + 1.5 + Math.sin(s) * 0.25, side * 1.38), true);
  }
  // Legs: slender, with a pale stocking above a dark hoof.
  LEGS.forEach((_, leg) => {
    emit(prism(0.5, 0.36, UPPER, 7).translate(0, -UPPER, 0), fur(0.9), { leg, lower: false }, T(0, 0, 0));
    emit(prism(0.3, 0.2, LOWER, 6).translate(0, -LOWER, 0), fur(0.8), { leg, lower: true }, T(0, 0, 0));
    emit(prism(0.27, 0.25, 0.9, 6).translate(0, -LOWER + 0.35, 0), c.belly, { leg, lower: true }, T(0, 0, 0));
    emit(prism(0.28, 0.3, 0.35, 6).translate(0, -LOWER, 0), MUZZLE, { leg, lower: true }, T(0, 0, 0));
  });
  // Neck: a tapering column from the shoulders, carried high.
  emit(prism(0.95, 0.55, NECK_LEN, 8).rotateZ(-Math.PI / 2), fur(1), 'neck', T(0, 0, 0));
  emit(prism(0.3, 0.2, NECK_LEN * 0.9, 4).rotateZ(-Math.PI / 2).translate(0, 0.6, 0), c.mane, 'neck', T(0, 0, 0));
  // Head: long and narrow, dark muzzle, wide-set eyes, ears turned out.
  emit(ball(1, 8, 5), fur(1.05), 'head', T(0.6, 0, 0, 0, 0, -0.5, [1.4, 0.7, 0.6]));
  emit(ball(1, 8, 5), MUZZLE, 'head', T(1.75, -0.55, 0, 0, 0, -0.5, [0.5, 0.35, 0.35]));
  for (const side of [-1, 1]) {
    emit(ball(0.13, 5, 3), 0x100c0a, 'head', T(0.85, 0.3, side * 0.5));
    emit(new THREE.ConeGeometry(0.28, 1.1, 4).rotateX(side * 1.2), fur(0.9), 'head', T(0.1, 0.55, side * 0.6));
  }
  if (stag) for (const side of [-1, 1]) antler(emit, side, 1.7, c, rng);
  else for (const side of [-1, 1]) emit(beam([0.4, 0.6, side * 0.3], [0.1, 1.3, side * 0.45], 0.08, 4), ANTLER, 'head', T(0, 0, 0));
  emit(prism(0.25, 0.1, 1.4, 5), fur(0.85), 'tail', T(0, 0, 0, 0, 0, Math.PI * 0.8));
}

interface Beast {
  body: THREE.Bone;
  neck: THREE.Bone;
  head: THREE.Bone;
  tail: THREE.Bone;
  hips: THREE.Bone[];
  knees: THREE.Bone[];
  scale: number;
  lag: number;
  off: number;
  phase: number;
}

/** Facing in the crossing's cycle: toward xTo while crossing, turning at each end. */
function facing(d: Def<'sweeper'>, time: number): number {
  const t = (((time + d.phase) % d.period) + d.period) % d.period;
  const turnOut = Math.max(d.hold, TURN);
  const back = 2 * d.cross + d.hold;
  if (t < d.cross) return 0;
  if (t < back) return Math.PI * smooth01((t - d.cross) / turnOut);
  return Math.PI + Math.PI * smooth01((t - back) / Math.min(TURN, d.period - back));
}

export function createHerd(opts: LandmarkOptions): Landmark {
  const ik = new RigKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('herd', opts, ['sweeper'] as const, {
    def: { type: 'sweeper', id: 'free', at: 0, radius: 6, height: 10, xFrom: -70, xTo: 60, cross: 16, hold: 4, period: 44, phase: 0 },
    roadZ: -10,
    lateral: -1,
    minX: -12,
    maxX: 12,
  });
  const def = bound.def;
  const dusk = opts.palette.dusk;
  // By day the spots are a pale dapple; at dusk they glow.
  const coat = (k: number, stag: boolean): Coat => {
    const fur = vary(rng, mix(COAT, opts.palette.rock, 0.12), 0.05).multiplyScalar(k);
    const glow = col(GLOW[stag ? 0 : 1]);
    return { fur, belly: mix(BELLY, fur, 0.2), mane: mix(MOSS, fur, 0.35), spot: mix(mix(BELLY, fur, 0.3), glow, 0.25 + 0.75 * dusk) };
  };

  // --- The moving herd: one rig, bones per body part and leg joint ---
  const beasts: Beast[] = [];
  const nFollow = ik.q(FOLLOWERS.high, FOLLOWERS.low);
  for (let i = 0; i <= nFollow; i++) {
    const body = rig.bone();
    const neck = rig.bone(body, NECK_AT[0], NECK_AT[1], NECK_AT[2]);
    const head = rig.bone(neck, NECK_LEN, 0, 0);
    const tail = rig.bone(body, TAIL_AT[0], TAIL_AT[1], TAIL_AT[2]);
    const hips = LEGS.map(([x, z]) => rig.bone(body, x, HIP_Y, z));
    const knees = hips.map((hip) => rig.bone(hip, 0, -UPPER, 0));
    const bones: Record<string, THREE.Bone> = { body, neck, head, tail };
    const stag = i === 0 || i === 3;
    velvetback((geo, color, part, m, glow) => {
      const bone = typeof part === 'string' ? bones[part] : part.lower ? knees[part.leg] : hips[part.leg];
      rig.add(geo, color, { bone, m, layer: glow ? 'glow' : 'solid' });
    }, coat(i === 0 ? 1 : 0.9 + rng() * 0.2, stag), rng, stag);
    beasts.push({ body, neck, head, tail, hips, knees, scale: i === 0 ? 1 : 0.72 + rng() * 0.18, lag: i * LAG, off: i === 0 ? 0 : (i % 2 ? 1 : -1) * (3 + rng() * SPREAD), phase: rng() * 6 });
  }

  // --- Grazers back among the giants: static bodies, heads lowered to the ferns and swaying ---
  for (let i = 0; i < ik.q(GRAZERS.high, GRAZERS.low); i++) {
    const f = new Frame((rng() - 0.5) * RADIUS * 1.2, 0, RADIUS * (0.2 + rng() * 0.5), rng() * Math.PI * 2, 0.75 + rng() * 0.2);
    const neckBase = f.p(NECK_AT[0], NECK_AT[1], NECK_AT[2]);
    const sway = { pivot: neckBase, axisB: f.dir(0, 0, 1), swingB: 0.1, freq: 0.3 + rng() * 0.2, phase: rng() * 6 };
    // Neck lowered to graze: turned down about the shoulders.
    const graze = f.m(NECK_AT[0], NECK_AT[1], NECK_AT[2], 0, 0, -0.75);
    velvetback((geo, color, part, m) => {
      if (part === 'neck') return kit.moving.add(geo, color, graze.clone().multiply(m), sway);
      if (part === 'head') return kit.moving.add(geo, color, graze.clone().multiply(T(NECK_LEN, 0, 0, 0, 0, -0.6)).multiply(m), sway);
      const at = typeof part === 'string' ? (part === 'tail' ? f.m(TAIL_AT[0], TAIL_AT[1], TAIL_AT[2]) : f.base) : part.lower ? f.m(LEGS[part.leg][0], HIP_Y - UPPER, LEGS[part.leg][1]) : f.m(LEGS[part.leg][0], HIP_Y, LEGS[part.leg][1]);
      kit.solid.add(geo, color, at.clone().multiply(m));
    }, coat(0.9, i === 0), rng, i === 0);
  }
  // Their woods: giants, ferns and stones behind the crossing.
  for (let i = 0; i < ik.q(5, 3); i++) giant(kit, kit.solid, (rng() - 0.5) * RADIUS * 1.6, RADIUS * (0.15 + rng() * 0.75), 80 + rng() * 30, 4.5 + rng() * 2, rng);
  for (let i = 0; i < ik.q(30, 14); i++) fern(kit.solid, (rng() - 0.5) * RADIUS * 1.8, -RADIUS * 0.3 + rng() * RADIUS * 1.2, 3 + rng() * 3, rng);
  for (let i = 0; i < ik.q(8, 4); i++) mossyRock(kit.solid, (rng() - 0.5) * RADIUS * 1.6, -RADIUS * 0.2 + rng() * RADIUS, 1.5 + rng() * 2, rng);

  // --- The worn crossing either side of the road and the carved waymarks: posed from the road ---
  const trails = [rig.bone(), rig.bone()];
  for (const b of trails) rig.add(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0), mix(opts.palette.road, opts.palette.sand, 0.4), { bone: b });
  const signs = [rig.bone(), rig.bone()];
  for (const b of signs) {
    rig.add(prism(0.35, 0.3, 3.6, 5), WEATHERED, { bone: b });
    rig.add(new THREE.BoxGeometry(2.4, 1.4, 0.25), TIMBER, { bone: b, m: T(0, 3.8, 0) });
    // A carved antler glyph, lit from within at dusk.
    rig.add(new THREE.BoxGeometry(0.2, 0.9, 0.05), mix(TIMBER, GLOW[0], 0.3 + 0.7 * dusk), { bone: b, layer: 'glow', m: T(-0.35, 3.85, 0.14, 0, 0, 0.4) });
    rig.add(new THREE.BoxGeometry(0.2, 0.9, 0.05), mix(TIMBER, GLOW[0], 0.3 + 0.7 * dusk), { bone: b, layer: 'glow', m: T(0.35, 3.85, 0.14, 0, 0, -0.4) });
  }

  const cloud = ik.cloud(ik.q(220, 110), 0, false, 0.75);
  // Hooves throw up leaf litter and a little dust.
  const kick = brush({ life: 1.8, size0: 1.6, size1: 6, c0: mix(opts.palette.sand, opts.palette.road, 0.5), c1: mix(opts.palette.sand, opts.palette.horizon, 0.5), alpha: 0.5, keep: 0.4, lift: -0.4 });

  const h = bound.hazard;
  const road = new RoadFrame(bound.binding);
  const P = new THREE.Vector3();
  const D = new THREE.Vector3();
  let dustAcc = 0;

  function update(time: number, dt: number): void {
    road.at(h.s0);
    const k = road.unit;
    const leadScale = def.radius / BODY_R;
    const yaw0 = RoadFrame.yaw(D.copy(road.across).multiplyScalar(def.xTo >= def.xFrom ? 1 : -1));
    dustAcc += dt;
    const emitNow = dt > 0 && dustAcc > DUST_RATE;
    if (emitNow) dustAcc = 0;
    beasts.forEach((b) => {
      const t = time - b.lag;
      const x = sweeperX(def, t);
      const s = leadScale * b.scale * k;
      road.point(x, 0, b.body.position).addScaledVector(road.along, b.off * k);
      const turn = facing(def, t);
      const gait = (x / STRIDE + turn * 0.4) * Math.PI * 2 + b.phase;
      b.body.position.y += BOB * s * Math.abs(Math.sin(gait));
      b.body.rotation.order = 'YXZ';
      b.body.rotation.set(0, yaw0 + turn, Math.sin(gait * 2) * 0.012);
      b.body.scale.setScalar(s);
      b.hips.forEach((hip, j) => {
        const g = gait + LEG_PHASE[j] * Math.PI * 2;
        hip.rotation.z = Math.sin(g) * HIP_SWING;
        // The knee folds as the leg swings forward, straight while it bears weight.
        b.knees[j].rotation.z = -Math.max(0, Math.cos(g)) * KNEE_LIFT;
      });
      // The neck carried high, nodding with each step; the head level, glancing about.
      b.neck.rotation.set(0, 0, NECK_RISE + Math.sin(gait * 2) * 0.05);
      b.head.rotation.set(0, Math.sin(time * 0.4 + b.phase) * 0.25, -NECK_RISE + 0.15);
      b.tail.rotation.x = Math.sin(time * 1.3 + b.phase) * 0.2;
    });
    for (let j = 0; j < 2; j++) {
      const out = j ? 1 : -1;
      const edge = out > 0 ? h.maxX : h.minX;
      road.point(edge + out, 0.08, trails[j].position);
      trails[j].rotation.set(0, RoadFrame.yaw(D.copy(road.across).multiplyScalar(out)), 0);
      trails[j].scale.set(TRAIL_LEN * k, 1, TRAIL_W * k);
      road.point(edge + out * 3, 0, signs[j].position).addScaledVector(road.along, -SIGN_OFF * k);
      signs[j].rotation.set(0, Math.atan2(-road.along.x, -road.along.z), 0);
      signs[j].scale.setScalar(k);
    }
    rig.sync();

    if (!emitNow) return;
    beasts.forEach((b, i) => {
      const moving = Math.abs(sweeperX(def, time - b.lag) - sweeperX(def, time - b.lag - DUST_RATE)) > 0.01;
      if (!moving) return;
      rig.local(b.knees[(i + Math.floor(time * 2)) % LEGS.length], 0, -LOWER, 0, P);
      cloud.emit(kick, P.x, P.y + 0.3, P.z, (rng() - 0.5) * 2, 0.8 + rng(), (rng() - 0.5) * 2);
    });
  }

  return ik.finish(RADIUS, RADIUS * 1.6, 40, update);
}
