// The frostback herd: shaggy six-legged giants with crystal spines along their backs and long
// tusks hung with glowing lanterns, migrating across the snowfield. A few graze far back; the
// rest are on the move. Bound as a sweeper, the herd crosses the road: the lead bull, bigger,
// blanketed in the track's colours and carrying a lit howdah, IS the collision cylinder at
// sweeperX; the others follow in its footsteps a few seconds behind (they never collide).

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { sweeperX } from '../../../core/hazards.ts';
import { Frame, T, ball, beam, box, mix, prism, shade, vary } from '../b/shapes.ts';
import type { V3 } from '../b/motion.ts';
import type { Rng } from '../../../core/rng.ts';
import { brush, col, glowBoost } from '../a/kit.ts';
import { DARK, ICE, IceKit, RoadFrame, WARM_LIGHT, bindHazard, smooth01, type Def } from './kit.ts';

const SALT = 0xf205b;
const RADIUS = 160;
/** Design size: the body's half-length in plan, which the lead is scaled to fit the cylinder. */
const BODY_R = 6;
const HIP_Y = 5.2;
const LEG_LEN = 5.2;
const LEGS: readonly (readonly [number, number])[] = [[3.6, 2.4], [3.6, -2.4], [0, 2.8], [0, -2.8], [-3.6, 2.4], [-3.6, -2.4]];
/** Tripod gait: these legs swing together, the others in counter-phase. */
const TRIPOD = [0, 3, 4];
const STRIDE = 7;
const LEG_SWING = 0.42;
const FOLLOWERS = { high: 5, low: 3 } as const;
const GRAZERS = { high: 6, low: 3 } as const;
/** Followers trail the lead by this many seconds each, and walk this far to either side (metres along s). */
const LAG = 1.1;
const SPREAD = 10;
const TURN = 1.6;
const TRAIL_W = 26;
const TRAIL_LEN = 140;
const SIGN_OFF = 30;
const DUST_RATE = 0.06;
/** The Old One's skeleton: length, rib height and half-width at the ground, rib thickness. */
const OLD = { length: 110, height: 62, width: 34, ribs: 9, ribR: 2.2 } as const;
const ARC_SEGMENTS = 7;

/** A bony arch along a quadratic curve a → b (control) → c, in frame f. */
function arc(kit: IceKit['b'], f: Frame, a: V3, b: V3, c: V3, r: number, color: THREE.ColorRepresentation): void {
  let prev = f.p(...a);
  for (let i = 1; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS;
    const u = 1 - t;
    const p = f.p(u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1], u * u * a[2] + 2 * u * t * b[2] + t * t * c[2]);
    kit.solid.add(beam(prev, p, r * (1 - 0.5 * t), 5), color);
    prev = p;
  }
}

/** Where a piece rides: a bone, a leg index, or a light on the head ('glow') or body ('lamp'). */
type Part = 'body' | 'head' | 'tail' | 'glow' | 'lamp' | number;
type Emit = (geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, part: Part, m: THREE.Matrix4) => void;

interface Colours {
  fur: THREE.Color;
  frost: THREE.Color;
  spine: THREE.Color;
  lamp: THREE.Color;
}

/**
 * A frostback, facing +X, feet on y = 0, in its own metres. Legs hang from their hips; the head
 * is authored about its neck. Returns where a lantern hangs, in the head's frame (z mirrored).
 */
function frostback(emit: Emit, c: Colours, rng: Rng, lead: boolean, accent: THREE.ColorRepresentation): THREE.Vector3 {
  const fur = (k: number) => vary(rng, shade(c.fur, k), 0.06);
  emit(ball(1, 10, 7), fur(1), 'body', T(0, HIP_Y + 2.2, 0, 0, 0, 0, [BODY_R + 0.6, 4.4, 3.9]));
  emit(ball(1, 8, 5), fur(1.08), 'body', T(1.8, HIP_Y + 4.6, 0, 0, 0, 0, [3.8, 2.6, 3]));
  // A shaggy skirt of fur hanging round the belly, frosted at the hem.
  emit(new THREE.CylinderGeometry(1, 1.15, 1, 9, 1, true), fur(0.85), 'body', T(0, HIP_Y - 0.4, 0, 0, 0, 0, [BODY_R + 0.8, 3, 4.3]));
  emit(new THREE.CylinderGeometry(1.15, 1.2, 1, 9, 1, true), c.frost, 'body', T(0, HIP_Y - 1.9, 0, 0, 0, 0, [BODY_R + 0.9, 0.5, 4.5]));
  // Crystal spines along the back.
  for (let i = 0; i < 6; i++) emit(new THREE.ConeGeometry(0.5, 2.2 + (i % 2) * 1.2, 4).translate(0, 1, 0), c.spine, 'body', T(-3.6 + i * 1.6, HIP_Y + 6.2 - Math.abs(i - 2.5) * 0.35, 0, 0, 0, -0.3));
  LEGS.forEach((_, leg) => {
    emit(prism(0.75, 1.1, LEG_LEN, 6).translate(0, -LEG_LEN, 0), fur(0.75), leg, T(0, 0, 0));
    emit(prism(1.05, 1.05, 0.7, 6).translate(0, -LEG_LEN, 0), DARK, leg, T(0, 0, 0));
  });
  // Head with a drooping trunk-like snout and the lantern tusks.
  emit(ball(1, 8, 6), fur(0.95), 'head', T(1, 0, 0, 0, 0, 0, [2.2, 2, 1.9]));
  emit(prism(0.8, 0.4, 4.5, 6), fur(0.8), 'head', T(2.6, -0.5, 0, 0, 0, -2.4));
  // Tusks sweep forward and down, then curl up; three segments, each turned TUSK_CURL further.
  const tip = new THREE.Vector3();
  for (const side of [-1, 1]) {
    let px = 2.2;
    let py = -0.9;
    for (let k = 0; k < 3; k++) {
      const a = TUSK_START + k * TUSK_CURL;
      emit(prism(0.32 - k * 0.06, 0.38 - k * 0.06, TUSK_SEG, 5), 0xf2ead8, 'head', T(px, py, side * (1.1 + k * 0.25), 0, 0, a));
      px -= Math.sin(a) * TUSK_SEG;
      py += Math.cos(a) * TUSK_SEG;
    }
    tip.set(px + 0.3, py - 0.9, 1.9);
    emit(new THREE.OctahedronGeometry(0.55), c.lamp, 'glow', T(tip.x, tip.y, side * tip.z));
    emit(prism(0.05, 0.05, 0.9, 3), DARK, 'head', T(tip.x, tip.y, side * tip.z));
  }
  emit(prism(0.25, 0.5, 3, 5), fur(0.8), 'tail', T(0, 0, 0, 0, 0, Math.PI * 0.75));
  if (!lead) return tip;
  // The lead: a blanket in the track's colours and a lit howdah with a pennant.
  emit(box(BODY_R * 1.4, 0.5, 8.6), accent, 'body', T(-0.5, HIP_Y + 4.8, 0, 0, 0, -0.05));
  emit(box(4.4, 3, 4.2), shade(accent, 0.7), 'body', T(-0.6, HIP_Y + 6.4, 0));
  emit(new THREE.ConeGeometry(3.6, 2.4, 4).translate(0, 1.2, 0), DARK, 'body', T(-0.6, HIP_Y + 9.4, 0, Math.PI / 4));
  emit(box(1.6, 1.2, 4.3), WARM_LIGHT, 'lamp', T(-0.6, HIP_Y + 7.4, 0));
  emit(prism(0.1, 0.1, 5, 3), DARK, 'body', T(-0.6, HIP_Y + 11.6, 0));
  emit(new THREE.PlaneGeometry(3, 1.6).translate(1.5, 0, 0), accent, 'body', T(-0.6, HIP_Y + 15.6, 0));
  return tip;
}

/** Head and tail mount points on the body (frostback frame). */
const HEAD_AT: readonly [number, number] = [BODY_R + 0.4, HIP_Y + 3.4];
const TAIL_AT: readonly [number, number] = [-BODY_R - 0.4, HIP_Y + 3];
const TUSK_START = -2;
const TUSK_CURL = 0.7;
const TUSK_SEG = 2.4;

interface Beast {
  body: THREE.Bone;
  head: THREE.Bone;
  tail: THREE.Bone;
  legs: THREE.Bone[];
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

export function createMammothHerd(opts: LandmarkOptions): Landmark {
  const ik = new IceKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('mammothHerd', opts, ['sweeper'] as const, {
    def: { type: 'sweeper', id: 'free', at: 0, radius: 6, height: 9, xFrom: -70, xTo: 60, cross: 14, hold: 4, period: 40, phase: 0 },
    roadZ: -10,
    lateral: -1,
    minX: -12,
    maxX: 12,
  });
  const def = bound.def;
  const boost = glowBoost(opts.palette);
  const colours = (k: number): Colours => ({
    fur: vary(rng, mix(0x5a3e2c, opts.palette.rock, 0.3), 0.1).multiplyScalar(k),
    frost: ik.snow,
    spine: mix(ICE, 0xffffff, 0.3),
    lamp: col(mix(WARM_LIGHT, opts.palette.accent, 0.25)),
  });

  // --- The moving herd: one rig, a bone per body part ---
  const beasts: Beast[] = [];
  const lantern = new THREE.Vector3();
  const nFollow = ik.q(FOLLOWERS.high, FOLLOWERS.low);
  for (let i = 0; i <= nFollow; i++) {
    const body = rig.bone();
    const head = rig.bone(body, HEAD_AT[0], HEAD_AT[1], 0);
    const tail = rig.bone(body, TAIL_AT[0], TAIL_AT[1], 0);
    const legs = LEGS.map(([x, z]) => rig.bone(body, x, HIP_Y, z));
    const bones: Record<string, THREE.Bone> = { body, head, tail, glow: head, lamp: body };
    lantern.copy(frostback((geo, color, part, m) => rig.add(geo, color, { bone: typeof part === 'number' ? legs[part] : bones[part], layer: part === 'glow' || part === 'lamp' ? 'glow' : 'solid', m }), colours(i === 0 ? 1.05 : 0.85 + rng() * 0.3), rng, i === 0, opts.palette.accent));
    beasts.push({ body, head, tail, legs, scale: i === 0 ? 1 : 0.72 + rng() * 0.2, lag: i * LAG, off: i === 0 ? 0 : (i % 2 ? 1 : -1) * (4 + rng() * SPREAD), phase: rng() * 6 });
  }

  // --- Grazers far back: static bodies from the same pattern, heads nodding on the GPU ---
  for (let i = 0; i < ik.q(GRAZERS.high, GRAZERS.low); i++) {
    const f = new Frame((rng() - 0.5) * RADIUS * 1.3, 0, RADIUS * (0.35 + rng() * 0.5), rng() * Math.PI * 2, 0.8 + rng() * 0.3);
    const head = f.p(HEAD_AT[0], HEAD_AT[1], 0);
    const nod = { pivot: head, axisB: f.dir(0, 0, 1), swingB: 0.25, freq: 0.6 + rng() * 0.4, phase: rng() * 6 };
    frostback((geo, color, part, m) => {
      if (part === 'head' || part === 'glow') {
        // Grazing: the head hangs low and nods.
        (part === 'glow' ? kit.lights : kit.moving).add(geo, color, f.m(HEAD_AT[0], HEAD_AT[1], 0, 0, 0, -0.5).multiply(m), nod);
        return;
      }
      const legM = typeof part === 'number' ? f.m(LEGS[part][0], HIP_Y, LEGS[part][1]) : part === 'tail' ? f.m(TAIL_AT[0], TAIL_AT[1], 0) : f.base;
      (part === 'lamp' ? kit.lights : kit.solid).add(geo, color, legM.clone().multiply(m));
    }, colours(0.9), rng, false, opts.palette.accent);
  }
  // The Old One: the half-buried skeleton of a frostback a hundred times their size, its ribs
  // and tusks arching over the snow. The herd's waymark, and the landmark's silhouette from afar.
  const bone = mix(0xece2cc, ik.snow, 0.3);
  const old = new Frame(-RADIUS * 0.25, -6, RADIUS * 0.6, 0.35);
  for (let r = 0; r < OLD.ribs; r++) {
    const x = -OLD.length / 2 + (r + 0.5) * (OLD.length / OLD.ribs);
    const hgt = OLD.height * Math.sin(Math.PI * (0.25 + (0.6 * (r + 0.5)) / OLD.ribs));
    for (const side of [-1, 1]) arc(kit, old, [x, 0, side * OLD.width], [x, hgt, side * OLD.width * 0.25], [x, hgt * 0.98, 0], OLD.ribR * (1 - r * 0.04), bone);
  }
  kit.solid.add(beam(old.p(-OLD.length / 2 - 10, OLD.height * 0.75, 0), old.p(OLD.length / 2 + 6, OLD.height * 0.92, 0), OLD.ribR * 1.4, 6), bone);
  kit.solid.add(ball(1, 8, 6), shade(bone, 0.95), old.m(OLD.length / 2 + 22, OLD.height * 0.62, 0, 0, 0, -0.3, [20, 14, 15]));
  for (const side of [-1, 1]) arc(kit, old, [OLD.length / 2 + 30, OLD.height * 0.4, side * 10], [OLD.length / 2 + 95, -10, side * 26], [OLD.length / 2 + 110, OLD.height * 1.25, side * 16], OLD.ribR * 1.6, mix(bone, 0xffffff, 0.2));

  // Snow-buried boulders and a few frozen shrubs.
  for (let i = 0; i < ik.q(14, 7); i++) {
    const a = rng() * Math.PI * 2;
    const r = RADIUS * (0.3 + rng() * 0.6);
    const s = 2 + rng() * 5;
    kit.solid.add(new THREE.IcosahedronGeometry(s, 0), vary(rng, opts.palette.rock, 0.1), T(Math.cos(a) * r, -s * 0.3, Math.sin(a) * r, rng() * 3));
    kit.solid.add(new THREE.IcosahedronGeometry(s * 0.8, 0), ik.snow, T(Math.cos(a) * r, s * 0.15, Math.sin(a) * r, rng() * 3, 0, 0, [1, 0.5, 1]));
  }

  // --- The trampled trail and the crossing signs: posed from the road each frame ---
  const trails = [rig.bone(), rig.bone()];
  for (const b of trails) rig.add(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0), shade(ik.snow, 0.82), { bone: b });
  const signs = [rig.bone(), rig.bone()];
  for (const b of signs) {
    rig.add(prism(0.15, 0.15, 3.2, 4), DARK, { bone: b });
    rig.add(new THREE.CircleGeometry(1.6, 3).rotateZ(Math.PI / 2), 0xffd020, { bone: b, m: T(0, 4, 0.05) });
    rig.add(ball(0.5, 5, 3), DARK, { bone: b, m: T(0, 3.8, 0.06, 0, 0, 0, [1.1, 0.6, 0.1]) });
    rig.add(new THREE.OctahedronGeometry(0.3), 0xff9020, { bone: b, layer: 'glow', m: T(0, 5.9, 0) });
  }

  const LAMPS = (nFollow + 1) * 2 + 1;
  const glow = ik.cloud(LAMPS + ik.q(40, 20), LAMPS, true, 1.8);
  const snowCloud = ik.cloud(ik.q(300, 150), 0, false, 0.75);
  const kick = brush({ life: 1.6, size0: 2, size1: 9, c0: ik.snow, c1: mix(ik.snow, opts.palette.horizon, 0.4), alpha: 0.7, keep: 0.5, lift: -2 });
  const breath = brush({ life: 2.2, size0: 1, size1: 5, c0: col(0xffffff), c1: mix(0xffffff, opts.palette.horizon, 0.5), alpha: 0.5, keep: 0.6, lift: 1 });
  const lampC = col(mix(WARM_LIGHT, opts.palette.accent, 0.25));
  const leadC = col(WARM_LIGHT);

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
    beasts.forEach((b, i) => {
      const t = time - b.lag;
      const x = sweeperX(def, t);
      const s = (i === 0 ? leadScale : leadScale * b.scale) * k;
      road.point(x, 0, b.body.position).addScaledVector(road.along, b.off * k);
      const stepPhase = (x / STRIDE) * Math.PI * 2 + b.phase;
      const turn = facing(def, t);
      // Turning in place still shuffles the feet.
      const gait = stepPhase + turn * 2;
      b.body.position.y += Math.abs(Math.sin(gait)) * 0.35 * s;
      b.body.rotation.set(0, yaw0 + turn, Math.sin(gait * 2) * 0.02);
      b.body.scale.setScalar(s);
      b.legs.forEach((leg, j) => {
        leg.rotation.z = Math.sin(gait + (TRIPOD.includes(j) ? 0 : Math.PI)) * LEG_SWING;
      });
      b.head.rotation.z = -0.15 + Math.sin(time * 0.8 + b.phase) * 0.12;
      b.tail.rotation.x = Math.sin(time * 2.1 + b.phase) * 0.4;
    });
    // Trail from each road edge out along the crossing; signs at the edges, facing the traffic.
    for (let j = 0; j < 2; j++) {
      const out = j ? 1 : -1;
      const edge = out > 0 ? h.maxX : h.minX;
      road.point(edge + out, 0.08, trails[j].position);
      trails[j].rotation.set(0, RoadFrame.yaw(D.copy(road.across).multiplyScalar(out)), 0);
      trails[j].scale.set(TRAIL_LEN * k, 1, TRAIL_W * k);
      road.point(edge + out * 3, 0, signs[j].position).addScaledVector(road.along, -SIGN_OFF * k);
      // Face the oncoming racers: the plate's +Z toward −s.
      signs[j].rotation.set(0, Math.atan2(-road.along.x, -road.along.z), 0);
      signs[j].scale.setScalar(k);
    }
    rig.sync();

    let li = 0;
    beasts.forEach((b, i) => {
      for (const side of [-1, 1]) {
        rig.local(b.head, lantern.x, lantern.y, side * lantern.z, P);
        glow.lamp(li++, P.x, P.y, P.z, i === 0 ? 4.5 : 3, i === 0 ? leadC : lampC, (0.3 + 0.5 * opts.palette.dusk + 0.15 * Math.sin(time * 3 + i + side)) * boost);
      }
      if (!emitNow) return;
      const moving = Math.abs(sweeperX(def, time - b.lag) - sweeperX(def, time - b.lag - DUST_RATE)) > 0.01;
      if (moving) {
        rig.local(b.legs[(i + Math.floor(time * 4)) % LEGS.length], 0, -LEG_LEN, 0, P);
        snowCloud.emit(kick, P.x, P.y + 0.5, P.z, (rng() - 0.5) * 4, 2 + rng() * 2, (rng() - 0.5) * 4);
      }
      if ((time * 0.7 + b.phase) % 2 < DUST_RATE * 1.4) {
        rig.local(b.head, 4.5, -2.2, 0, P);
        for (let q = 0; q < 3; q++) snowCloud.emit(breath, P.x, P.y, P.z, (rng() - 0.5) * 1.5, 0.5, (rng() - 0.5) * 1.5);
      }
    });
    // The lead's howdah lamp, brightest of all: it marks the one to avoid.
    rig.local(beasts[0].body, -0.6, HIP_Y + 7.4, 0, P);
    glow.lamp(li, P.x, P.y, P.z, 9, leadC, (0.45 + 0.45 * opts.palette.dusk) * boost);
  }

  return ik.finish(RADIUS, RADIUS * 1.5, 30, update);
}
