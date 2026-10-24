// The herd: giant woolly beasts of the ice age crossing the snowfield in a slow, heavy file.
// They walk like elephants: a lateral-sequence walk (left hind, left fore, right hind, right
// fore), three feet down most of the time, each leg a thigh and a shin hinged at a knee over a
// broad pad of a foot that stays planted while the body rolls over it. The stride is matched
// to the ground they cover, so no foot ever slides.
// High humped shoulders sloping to low hindquarters, great domed heads carried low, trunks
// hanging, long tusks sweeping out and curling in; coats of long dark guard hair hanging in
// layered shags, frost lying on their backs, breath smoking in the cold. A few graze far back
// beside the bones of one of their kind, a hundred times their size. Bound as a sweeper, the
// herd crosses the road: the lead bull, biggest, pale-maned and longest in the tusk, IS the
// collision cylinder at sweeperX; the rest follow in his footsteps (they never collide).

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { sweeperX } from '../../../core/hazards.ts';
import { Frame, T, ball, beam, mix, prism, shade, vary } from '../b/shapes.ts';
import type { V3 } from '../b/motion.ts';
import type { Rng } from '../../../core/rng.ts';
import { brush, col, fract } from '../a/kit.ts';
import { DARK, IceKit, RoadFrame, bindHazard, smooth01, type Def } from './kit.ts';

const SALT = 0xf205b;
const RADIUS = 160;
/** Design size: the torso's half-length in plan, which the lead is scaled to fit the cylinder. */
const BODY_R = 5.5;
const HIP_Y = 5.6;
/** Leg segments, model units: thigh (hip to knee), shin (knee to ankle), the foot pad's height.
 * Thigh plus shin is a little longer than hip to ankle, so even the planted leg keeps a soft knee. */
const THIGH = 2.75;
const SHIN = 2.55;
const FOOT_H = 0.55;
/** Legs: [x, z] of each hip; walked in lateral sequence (LH, LF, RH, RF a quarter apart). */
const LEGS: readonly (readonly [number, number])[] = [[3.3, 1.8], [3.3, -1.8], [-3.1, 1.6], [-3.1, -1.6]];
const LEG_PHASE: readonly number[] = [0.25, 0.75, 0, 0.5];
/** Parts per leg: thigh, shin, foot. */
const LEG_PARTS = 3;
/**
 * Stride (one full cycle of a leg) over hip height. An elephant's relative stride is about
 * 2.3·Fr^0.3 (Alexander); at the herd's mean pace (Froude number about 0.35) that is 1.7. These
 * giants step shorter, under their weight: legs that swing far read as a jaunty stroll.
 */
const STRIDE_OVER_HIP = 1.4;
/** Share of each stride a foot is planted: over a half, so three feet carry the weight. */
const DUTY = 0.62;
/** How high a swinging foot lifts, model units. */
const FOOT_LIFT = 0.8;
/** The swinging foot's sole tips back as the shin folds, radians at mid-swing. */
const FOOT_CURL = 0.35;
/** The body dips twice a stride as weight settles onto each foot, and rolls gently. */
const SINK = 0.12;
const SWAY = 0.025;
/** Turning on the spot still steps the feet: metres of stepping per radian turned. */
const TURN_STEP = 3;
const FOLLOWERS = { high: 5, low: 3 } as const;
const GRAZERS = { high: 6, low: 3 } as const;
const SHAGS = { high: 16, low: 10 } as const;
/** Followers walk this far behind each other (metres of trail), and this far to either side (metres along s). */
const FILE_GAP = 17;
const SPREAD = 10;
const TURN = 2.4;
const TRAIL_W = 26;
const TRAIL_LEN = 140;
const SIGN_OFF = 30;
const DUST_RATE = 0.06;
const FOOTFALL_PUFFS = 3;
const BREATH_EVERY = 2.6;
/** The Old One's skeleton: length, rib height and half-width at the ground, rib thickness. */
const OLD = { length: 110, height: 62, width: 34, ribs: 9, ribR: 2.2 } as const;
const ARC_SEGMENTS = 7;
/** Head and tail mount points on the body; the head hangs low off the front of the hump. */
const HEAD_AT: readonly [number, number] = [5.2, 8.2];
const TAIL_AT: readonly [number, number] = [-5.6, 7.2];
/** The mouth (head frame), where breath smokes out. */
const MOUTH: V3 = [2.2, -2.4, 0];
const TUSK_SEGMENTS = 6;
const IVORY = 0xe6dccb;

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

/** Where a piece rides: a bone, or a leg part (leg × LEG_PARTS + 0 thigh, 1 shin, 2 foot). */
type Part = 'body' | 'head' | 'tail' | number;
type Emit = (geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, part: Part, m: THREE.Matrix4) => void;

interface Coat {
  /** Long guard hair, darkest at the hanging tips; the body under it; frost on the back. */
  shag: THREE.Color;
  fur: THREE.Color;
  frost: THREE.Color;
  /** The lead bull's paler mane over the hump and down the throat. */
  mane: THREE.Color;
}

/** Long hair hanging from (x, y, z): a narrow cone point-down, swept back a little. */
function shag(emit: Emit, part: Part, color: THREE.ColorRepresentation, x: number, y: number, z: number, len: number, r: number, lean: number): void {
  emit(new THREE.ConeGeometry(r, len, 4).rotateX(Math.PI).translate(0, -len / 2, 0), color, part, T(x, y, z, 0, lean, -0.15));
}

/**
 * An ice-age giant facing +X, feet on y = 0, in its own metres. Legs hang from their hips; the
 * head is authored about its neck. The lead is the old bull: pale mane, longest tusks.
 */
function mammoth(emit: Emit, c: Coat, rng: Rng, shags: number, lead: boolean): void {
  const fur = (k: number) => vary(rng, shade(c.fur, k), 0.04);
  // Torso: the great hump over the shoulders, the back falling to low hindquarters.
  emit(ball(1, 12, 8), fur(1), 'body', T(1.8, 8.4, 0, 0, 0, 0.12, [3.9, 3.5, 3.0]));
  emit(ball(1, 10, 7), fur(0.95), 'body', T(-2.6, 7.2, 0, 0, 0, -0.1, [3.4, 2.7, 2.7]));
  emit(ball(1, 10, 6), fur(1.05), 'body', T(2.2, 10.4, 0, 0, 0, 0.25, [2.6, 1.7, 2.1]));
  // Frost lying along the hump and back.
  emit(ball(1, 10, 4), c.frost, 'body', T(1.6, 11.45, 0, 0, 0, 0.18, [2.6, 0.5, 1.15]));
  emit(ball(1, 8, 4), mix(c.frost, c.fur, 0.45), 'body', T(-2.2, 9.65, 0, 0, 0, -0.18, [2.2, 0.4, 1.1]));
  if (lead) emit(ball(1, 10, 6), c.mane, 'body', T(3.6, 8.6, 0, 0, 0, 0.5, [2.4, 3.2, 2.9]));
  // Layered skirts of long hair round the flanks: an upper layer in the body colour, a longer
  // lower one in the dark guard hair, so the coat darkens toward its ragged hem.
  for (let layer = 0; layer < 2; layer++) {
    const y = layer ? 6.4 : 8.2;
    const len = layer ? 3.6 : 2.4;
    const color = layer ? c.shag : shade(c.fur, 0.9);
    for (let i = 0; i < shags; i++) {
      const a = (i / shags) * Math.PI * 2 + layer * 0.2;
      const x = Math.cos(a) * (layer ? 4.4 : 4.0) + (Math.cos(a) > 0 ? 0.6 : -0.4);
      const z = Math.sin(a) * (layer ? 2.7 : 2.9);
      shag(emit, 'body', vary(rng, color, 0.05), x, y + (Math.cos(a) > 0 ? 0.8 : 0), z, len * (0.8 + rng() * 0.4), 0.7 + rng() * 0.3, Math.sin(a) * 0.15);
    }
  }
  // Legs: a heavy thigh in shaggy breeches down to a knee, a bare columnar shin, an ankle,
  // and a broad dark pad of a foot with pale nails. Each segment hangs from its own joint.
  LEGS.forEach((_, leg) => {
    const thigh = leg * LEG_PARTS;
    emit(prism(1.05, 1.3, THIGH, 7).translate(0, -THIGH, 0), fur(0.82), thigh, T(0, 0, 0));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      shag(emit, thigh, vary(rng, c.shag, 0.05), Math.cos(a) * 1.05, -0.3, Math.sin(a) * 1.05, THIGH * 0.75, 0.5, 0);
    }
    emit(ball(1, 7, 5), fur(0.78), thigh + 1, T(0, 0, 0, 0, 0, 0, [1.05, 0.95, 1.0]));
    emit(prism(0.92, 1.0, SHIN, 7).translate(0, -SHIN, 0), fur(0.72), thigh + 1, T(0, 0, 0));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      shag(emit, thigh + 1, vary(rng, c.shag, 0.05), Math.cos(a) * 0.9, -0.5, Math.sin(a) * 0.9, 1.1, 0.35, 0);
    }
    emit(prism(1.22, 1.0, FOOT_H, 8).translate(0, -FOOT_H, 0), DARK, thigh + 2, T(0, 0, 0));
    for (let k = -1; k <= 1; k++) emit(ball(0.22, 5, 3), IVORY, thigh + 2, T(1.1, -FOOT_H + 0.15, k * 0.45, 0, 0, 0, [0.7, 0.8, 1]));
  });
  // Head: a high domed crown carried low, small ears, a beard of hair, the trunk hanging.
  emit(ball(1, 10, 7), fur(1), 'head', T(0.9, 0.2, 0, 0, 0, -0.3, [2.0, 2.5, 1.7]));
  emit(ball(1, 8, 5), fur(1.05), 'head', T(0.5, 2.0, 0, 0, 0, 0, [1.4, 1.2, 1.3]));
  for (const side of [-1, 1]) {
    emit(ball(1, 6, 4), shade(c.fur, 0.85), 'head', T(-0.4, 0.6, side * 1.5, 0, 0, 0, [0.7, 0.9, 0.25]));
    emit(ball(0.16, 5, 3), 0x14100c, 'head', T(1.95, 0.5, side * 0.95));
  }
  for (let k = 0; k < 5; k++) shag(emit, 'head', vary(rng, lead ? c.mane : c.shag, 0.05), -0.2 + k * 0.45, -1.2, (k - 2) * 0.45, 2.6, 0.55, 0);
  let tp: V3 = [2.2, -1.0, 0];
  for (let k = 0; k < 5; k++) {
    const a = -1.45 + k * k * 0.06;
    const len = 1.55 - k * 0.1;
    const next: V3 = [tp[0] + Math.cos(a) * len * 0.35, tp[1] + Math.sin(a) * len, 0];
    emit(beam(tp, next, 0.62 - k * 0.09, 6), fur(0.9 - k * 0.04), 'head', T(0, 0, 0));
    tp = next;
  }
  // Tusks: out and down from the jaw, sweeping forward and up, curling inward at the tips.
  const reach = lead ? 1.25 : 0.9 + rng() * 0.2;
  for (const side of [-1, 1]) {
    let p: V3 = [1.9, -1.2, side * 0.75];
    for (let k = 0; k < TUSK_SEGMENTS; k++) {
      const t = k / (TUSK_SEGMENTS - 1);
      const up = -0.9 + t * 2.1;
      const out = side * (0.55 - t * 0.95);
      const len = 1.7 * reach;
      const next: V3 = [p[0] + Math.cos(up) * len * (1 - t * 0.35), p[1] + Math.sin(up) * len, p[2] + out * len * 0.5];
      emit(beam(p, next, (0.42 - t * 0.28) * reach, 6), shade(IVORY, 0.92 + t * 0.08), 'head', T(0, 0, 0));
      p = next;
    }
  }
  emit(prism(0.25, 0.45, 2.6, 5), fur(0.8), 'tail', T(0, 0, 0, 0, 0, Math.PI * 0.85));
  shag(emit, 'tail', c.shag, 1.1, -2.2, 0, 1.4, 0.4, 0);
}

interface Leg {
  thigh: THREE.Bone;
  shin: THREE.Bone;
  foot: THREE.Bone;
  /** Gait phase last frame, and whether the foot came down this frame. */
  last: number;
  down: boolean;
}

interface Beast {
  body: THREE.Bone;
  head: THREE.Bone;
  tail: THREE.Bone;
  legs: Leg[];
  scale: number;
  lag: number;
  off: number;
  /** Seconds offsetting its breath and tail; share of a stride offsetting its gait. */
  phase: number;
  step: number;
}

/** Joint angles (radians, + swings toward +X) for one leg. */
interface LegPose {
  hip: number;
  knee: number;
  ankle: number;
}

/**
 * Two-bone leg in the body's side plane: thigh and shin from the hip at (0, 0) to put the ankle
 * at (dx, dy). The knee bends forward, as an elephant's fore knee and hind knee both do; the
 * foot stays level (sole flat) unless `curl` tips it.
 */
function solveLeg(dx: number, dy: number, curl: number, out: LegPose): LegPose {
  const reach = Math.min(Math.hypot(dx, dy), (THIGH + SHIN) * LEG_REACH);
  const down = Math.atan2(dx, -dy);
  const atHip = Math.acos(THREE.MathUtils.clamp((THIGH * THIGH + reach * reach - SHIN * SHIN) / (2 * THIGH * reach), -1, 1));
  const atAnkle = Math.acos(THREE.MathUtils.clamp((SHIN * SHIN + reach * reach - THIGH * THIGH) / (2 * SHIN * reach), -1, 1));
  out.hip = down + atHip;
  out.knee = -(atHip + atAnkle);
  out.ankle = -(down - atAnkle) - curl;
  return out;
}
/** Never quite straighten the leg: a locked knee would snap through. */
const LEG_REACH = 0.995;

/** Ankle target for a leg at gait phase p (0..1), in its hip's frame, model units. */
function footAt(p: number, stride: number, groundY: number, out: { x: number; y: number; curl: number }): void {
  const half = (stride * DUTY) / 2;
  if (p < DUTY) {
    // Planted: the body walks over it, so it moves back exactly as fast as the body goes on.
    out.x = half - p * stride;
    out.y = groundY;
    out.curl = 0;
    return;
  }
  const u = (p - DUTY) / (1 - DUTY);
  out.x = -half + 2 * half * smooth01(u);
  out.y = groundY + FOOT_LIFT * Math.sin(Math.PI * u);
  out.curl = FOOT_CURL * Math.sin(Math.PI * u);
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

/**
 * Metres a beast following the crossing has walked by race time t: across and back every
 * cycle, plus the steps it takes turning round at each end. Never decreases, so the gait
 * always runs forward.
 */
function walked(d: Def<'sweeper'>, time: number): number {
  const span = Math.abs(d.xTo - d.xFrom);
  const cycle = Math.floor((time + d.phase) / d.period);
  const t = time + d.phase - cycle * d.period;
  const out = Math.abs(sweeperX(d, time) - d.xFrom);
  const across = t < d.cross + d.hold ? out : 2 * span - out;
  return cycle * (2 * span + 2 * Math.PI * TURN_STEP) + across + TURN_STEP * facing(d, time);
}

export function createMammothHerd(opts: LandmarkOptions): Landmark {
  const ik = new IceKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('mammothHerd', opts, ['sweeper'] as const, {
    def: { type: 'sweeper', id: 'free', at: 0, radius: 6, height: 11, xFrom: -70, xTo: 60, cross: 28, hold: 4, period: 70, phase: 0 },
    roadZ: -10,
    lateral: -1,
    minX: -12,
    maxX: 12,
  });
  const def = bound.def;
  // Muted, natural coats: dark umber guard hair over warmer brown, frost on the back.
  const coat = (k: number): Coat => {
    const fur = vary(rng, mix(0x5a4030, opts.palette.rock, 0.15), 0.06).multiplyScalar(k);
    return { fur, shag: shade(mix(fur, 0x2a1e16, 0.5), 0.9), frost: mix(ik.snow, fur, 0.4), mane: mix(fur, 0xd8cfc0, 0.45) };
  };
  const nShag = ik.q(SHAGS.high, SHAGS.low);

  // --- The moving herd: one rig, a bone per body part ---
  const beasts: Beast[] = [];
  const nFollow = ik.q(FOLLOWERS.high, FOLLOWERS.low);
  // Followers keep FILE_GAP of trail between them at the herd's mean pace across.
  const span = Math.abs(def.xTo - def.xFrom);
  const lag = FILE_GAP / (span / def.cross);
  for (let i = 0; i <= nFollow; i++) {
    const body = rig.bone();
    const head = rig.bone(body, HEAD_AT[0], HEAD_AT[1], 0);
    const tail = rig.bone(body, TAIL_AT[0], TAIL_AT[1], 0);
    const legs = LEGS.map(([x, z]): Leg => {
      const thigh = rig.bone(body, x, HIP_Y, z);
      const shin = rig.bone(thigh, 0, -THIGH, 0);
      const foot = rig.bone(shin, 0, -SHIN, 0);
      return { thigh, shin, foot, last: 0, down: false };
    });
    const bones: Record<string, THREE.Bone> = { body, head, tail };
    const legBone = (part: number) => {
      const l = legs[Math.floor(part / LEG_PARTS)];
      return [l.thigh, l.shin, l.foot][part % LEG_PARTS];
    };
    mammoth((geo, color, part, m) => rig.add(geo, color, { bone: typeof part === 'number' ? legBone(part) : bones[part], m }), coat(i === 0 ? 1 : 0.85 + rng() * 0.25), rng, nShag, i === 0);
    beasts.push({ body, head, tail, legs, scale: i === 0 ? 1 : 0.7 + rng() * 0.2, lag: i * lag, off: i === 0 ? 0 : (i % 2 ? 1 : -1) * (4 + rng() * SPREAD), phase: rng() * BREATH_EVERY, step: rng() });
  }
  // Grazers stand square: each foot under its hip.
  const stand = solveLeg(0, FOOT_H - HIP_Y, 0, { hip: 0, knee: 0, ankle: 0 });

  // --- Grazers far back: static bodies from the same pattern, heads lowered and swaying ---
  for (let i = 0; i < ik.q(GRAZERS.high, GRAZERS.low); i++) {
    const f = new Frame((rng() - 0.5) * RADIUS * 1.3, 0, RADIUS * (0.35 + rng() * 0.5), rng() * Math.PI * 2, 0.75 + rng() * 0.25);
    const neck = f.p(HEAD_AT[0], HEAD_AT[1], 0);
    const sway = { pivot: neck, axisB: f.dir(0, 0, 1), swingB: 0.08, freq: 0.35 + rng() * 0.2, phase: rng() * 6 };
    mammoth((geo, color, part, m) => {
      if (part === 'head') {
        kit.moving.add(geo, color, f.m(HEAD_AT[0], HEAD_AT[1], 0, 0, 0, -0.35).multiply(m), sway);
        return;
      }
      const at = typeof part === 'number' ? standingLeg(f, part) : part === 'tail' ? f.m(TAIL_AT[0], TAIL_AT[1], 0) : f.base;
      kit.solid.add(geo, color, at.clone().multiply(m));
    }, coat(0.9), rng, Math.ceil(nShag / 2), false);
  }
  /** A grazer's leg part (see Part), standing square, in its frame. */
  function standingLeg(f: Frame, part: number): THREE.Matrix4 {
    const [x, z] = LEGS[Math.floor(part / LEG_PARTS)];
    const seg = part % LEG_PARTS;
    const m = f.m(x, HIP_Y, z, 0, 0, stand.hip);
    if (seg > 0) m.multiply(T(0, -THIGH, 0, 0, 0, stand.knee));
    if (seg > 1) m.multiply(T(0, -SHIN, 0, 0, 0, stand.ankle));
    return m;
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
  }

  const snowCloud = ik.cloud(ik.q(300, 150), 0, false, 0.75);
  // Heavy footfalls throw low, slow clouds of powder; breath smokes and drifts up.
  const kick = brush({ life: 2.2, size0: 2.5, size1: 11, c0: ik.snow, c1: mix(ik.snow, opts.palette.horizon, 0.4), alpha: 0.6, keep: 0.4, lift: -0.6 });
  const breath = brush({ life: 3, size0: 1.2, size1: 6, c0: col(0xffffff), c1: mix(0xffffff, opts.palette.horizon, 0.5), alpha: 0.4, keep: 0.5, lift: 0.8 });

  const h = bound.hazard;
  const road = new RoadFrame(bound.binding);
  const P = new THREE.Vector3();
  const D = new THREE.Vector3();
  const pose: LegPose = { hip: 0, knee: 0, ankle: 0 };
  const foot = { x: 0, y: 0, curl: 0 };
  const stride = STRIDE_OVER_HIP * HIP_Y;
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
      const model = i === 0 ? leadScale : leadScale * b.scale;
      const s = model * k;
      road.point(x, 0, b.body.position).addScaledVector(road.along, b.off * k);
      const turn = facing(def, t);
      // Gait from the distance walked, in strides of this beast's own size: a planted foot moves
      // back under the body exactly as fast as the body moves on, so it never slides.
      const phase = walked(def, t) / (stride * model) + b.step;
      const gait = phase * Math.PI * 2;
      // Weight settles onto each footfall: the body sinks twice a stride and rolls gently.
      const sink = SINK * (1 - Math.abs(Math.cos(gait)));
      b.body.position.y -= sink * s;
      b.body.rotation.order = 'YXZ';
      b.body.rotation.set(Math.sin(gait) * SWAY, yaw0 + turn, Math.sin(gait * 2) * SWAY * 0.4);
      b.body.scale.setScalar(s);
      b.legs.forEach((leg, j) => {
        const p = fract(phase + LEG_PHASE[j]);
        footAt(p, stride, FOOT_H - HIP_Y + sink, foot);
        solveLeg(foot.x, foot.y, foot.curl, pose);
        leg.thigh.rotation.z = pose.hip;
        leg.shin.rotation.z = pose.knee;
        leg.foot.rotation.z = pose.ankle;
        leg.down = dt > 0 && p < leg.last;
        leg.last = p;
      });
      b.head.rotation.set(0, Math.sin(gait) * 0.05, -0.08 + Math.sin(gait * 2 + 0.6) * 0.035);
      b.tail.rotation.x = Math.sin(time * 0.9 + b.phase) * 0.25;
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

    // Each footfall throws up a low cloud of powder round the pad.
    for (const b of beasts) {
      for (const leg of b.legs) {
        if (!leg.down) continue;
        rig.local(leg.foot, 0, -FOOT_H, 0, P);
        for (let q = 0; q < FOOTFALL_PUFFS; q++) snowCloud.emit(kick, P.x, P.y + 0.4, P.z, (rng() - 0.5) * 4, 0.6 + rng(), (rng() - 0.5) * 4);
      }
    }
    if (!emitNow) return;
    beasts.forEach((b) => {
      if ((time + b.phase) % BREATH_EVERY < DUST_RATE) {
        rig.local(b.head, MOUTH[0], MOUTH[1], MOUTH[2], P);
        for (let q = 0; q < 4; q++) snowCloud.emit(breath, P.x, P.y, P.z, 1 + (rng() - 0.5) * 1.5, 0.3, (rng() - 0.5) * 1.5);
      }
    });
  }

  return ik.finish(RADIUS, RADIUS * 1.5, 30, update);
}
