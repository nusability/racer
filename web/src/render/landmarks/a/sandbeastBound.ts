// The sand beast as a course blocker. Everything is laid out in track space at the blocker's s
// and mapped through the binding, so what racers see is what they collide with:
//  - warn: the ground trembles; beside the road, past the edge where the opening is, the sand
//    bulges and splits, and cracks run across the road where it is going to hit.
//  - then it erupts from that bulge in a huge arch over the opening, maw splayed, and slams
//    head-first into the road just past the opening as 'down' begins: a crater bursts open,
//    slabs heave up, a pressure ridge of broken road runs out to the far edge where it tunnels.
//  - down: it burrows on, its body pouring after its head along the arch, the tail vanishing
//    into the crater as the blocker lifts. Racers pass under the arch; the crater, the plunging
//    body and the ridge are the blocked span.
//  - then the broken road settles back and the scar fades before the next tremor.

import * as THREE from 'three';
import { blockerStage } from '../../../core/hazards.ts';
import type { HazardBinding, Landmark, LandmarkOptions } from '../types.ts';
import { BEAST_LAMPS, beastColours, beastLamps, beastNeck, buildBeast, setMaw } from './beastBody.ts';
import { RoadFrame, aim, cycleTime, type HazardOf } from './bound.ts';
import { brush, col, cyl, disposeKit, glowBoost, makeKit, mix, mulberry32, ramp, rock, shade, smooth } from './kit.ts';
import type { Brush } from './particles.ts';

// --- Body (over the body radius, which is the barrier's height over two, made a little fatter
// so the body swallows the barrier it stands for) ---
const BODY_OVER_BAR = 1.1;
const HEAD_OVER_BODY = 1.1;
const SEG_OVER_BODY = 1.15;
const MAX_SEGS = { high: 40, low: 24 } as const;
/** The body runs on this far below the sand at each end of the arch. */
const SINK = 3;
/** Length of body still underground behind the breach at the slam, body radii. */
const TAIL_SPARE = 2;
/** A slow swell travelling down the body while it burrows: share of radius, metres, rad/s. */
const PULSE = 0.05;
const PULSE_WAVE = 30;
const PULSE_RATE = 5;

// --- Layout (body radii unless noted) ---
/** The breach is this far past the road edge on the opening's side, off the course. */
const BREACH_OUT = 2.6;
/** The crater's radius; its centre is this far past the opening. */
const CRATER = 1.6;
/** Arch height over its span, the controls' share of that height, and the near control's
 * lean in toward the road (share of span). The far control stands right over the crater, so
 * the head plunges straight down. */
const ARCH_RISE = 0.55;
const ARCH_CONTROL = 1.33;
const ARCH_NEAR_LEAN = 0.12;
/** The arch's crown leans toward oncoming racers by this share of its height. */
const ARCH_LEAN = 0.18;
/** Clear height left under the body anywhere over the opening, metres. */
const OPEN_CLEAR = 6;
const PATH_SAMPLES = 64;

// --- Timing, seconds (slam = the start of 'down') ---
const TREMOR = 2.4;
const ERUPT = 1.5;
/** The head surges out fast, slows over the crown and drives down: speed swings ±this share. */
const ERUPT_SURGE = 0.5;
/** Burrowing gathers pace: the body poured in by share u of 'down' is u^this. */
const BURROW_EASE = 1.7;
/** Maw opens over this span of the eruption and snaps shut before impact (shares). */
const MAW_OPEN: readonly [number, number] = [0.04, 0.3];
const MAW_SHUT: readonly [number, number] = [0.72, 0.9];
/** After 'down': the broken road settles flat, then the scar fades. */
const SETTLE = 1;
const SCAR = 3;
/** The pressure ridge heaves outward from the crater at this speed, m/s. */
const RIDGE_WAVE = 120;
/** Debris thrown out of the crater: flight time, apex height range (m). */
const DEBRIS_FLIGHT = 0.9;
const DEBRIS_APEX: readonly [number, number] = [6, 14];

// --- Damage (metres) ---
const SLABS = { crater: { high: 11, low: 7 }, ridge: { high: 16, low: 9 } } as const;
const DEBRIS = { high: 10, low: 6 } as const;
/** A broken slab: the road skin over a dark layer of torn sub-base that shows at its edges. */
const SLAB_THICK = 0.5;
const SUBBASE_THICK = 0.7;
/** Ridge slabs: length along the ridge, half-width of the A-frame, and its peak. */
const RIDGE_SLAB = 4.6;
const RIDGE_HALF = 2.6;
const RIDGE_PEAK = 3.6;
/** The ridge runs on past the far road edge before the tunnel dives too deep to show. */
const RIDGE_PAST = 8;
const CRACKS = { crater: 7, breach: 6 } as const;
const CRACK_W = 0.35;
const CRACK_H = 0.08;
/** The spoil ring's tube radius. */
const RIM_TUBE = 1.5;
/** Sunk this deep once settled, out of sight under the road skin. */
const SUNK = 0.6;

const EMIT_STEP = 0.05;
/** Sand streams poured off the airborne body per emission tick. */
const SAND_STREAMS = 4;
const BURST = { erupt: 22, slam: 30, settle: 12 } as const;
/** The beast's own footprint: the dune it lurks under (placement spacing), metres. */
const FOOTPRINT = 30;

/** A part of the damage posed in track space: where, which way, how it moves. */
interface Piece {
  bone: THREE.Bone;
  x: number;
  ds: number;
  /** Yaw (radians, from +x toward +s) and the tilt it heaves to. */
  yaw: number;
  tilt: number;
  /** Seconds after the slam it heaves (the ridge's travelling wave). */
  delay: number;
  lift: number;
}

export function createBoundBeast(opts: LandmarkOptions, binding: HazardBinding, hazard: HazardOf<'blocker'>): Landmark {
  const d = hazard.def;
  const q = opts.quality;
  const hi = q === 'high';
  const rng = mulberry32(opts.seed ^ 0xb0b);
  const boost = glowBoost(opts.palette);

  // --- Layout in track space ---
  const openLo = d.offset - d.opening / 2;
  const openHi = d.offset + d.opening / 2;
  const edgeTol = 0.5;
  // dir: +1 when the blocked span is toward +x. The opening must reach one edge: the arch
  // spans it, and the body comes down on the one stretch of road it closes.
  let dir: number;
  if (openLo <= hazard.minX + edgeTol) dir = 1;
  else if (openHi >= hazard.maxX - edgeTol) dir = -1;
  else throw new Error(`sandbeast: blocker ${d.id} must open against one road edge (opening ${openLo}..${openHi} on ${hazard.minX}..${hazard.maxX})`);
  const openEdge = dir > 0 ? hazard.minX : hazard.maxX;
  const farEdge = dir > 0 ? hazard.maxX : hazard.minX;
  const xOpen = dir > 0 ? openHi : openLo;
  const r = (d.height / 2) * BODY_OVER_BAR;
  const craterR = CRATER * r;
  const xCrater = xOpen + dir * craterR;
  if ((farEdge - xCrater) * dir < craterR) throw new Error(`sandbeast: blocker ${d.id} closes too little road for its crater`);
  const xBreach = openEdge - dir * BREACH_OUT * r;
  const span = Math.abs(xCrater - xBreach);
  const archH = ARCH_RISE * span;
  const lead = TREMOR + ERUPT;
  if (d.period - d.up < lead + SETTLE + SCAR) throw new Error(`sandbeast: blocker ${d.id} rests too briefly (${d.period - d.up}s) for tremor, eruption and the road to settle`);

  // The arch: a cubic in (x, height, ds) from under the breach to under the crater.
  const px = new Float32Array(PATH_SAMPLES);
  const py = new Float32Array(PATH_SAMPLES);
  const pd = new Float32Array(PATH_SAMPLES);
  const pl = new Float32Array(PATH_SAMPLES);
  const ctrlY = archH * ARCH_CONTROL;
  const lean = -ARCH_LEAN * archH;
  for (let i = 0; i < PATH_SAMPLES; i++) {
    const u = i / (PATH_SAMPLES - 1);
    const v = 1 - u;
    const w = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
    px[i] = xBreach * w[0] + (xBreach + dir * ARCH_NEAR_LEAN * span) * w[1] + xCrater * (w[2] + w[3]);
    py[i] = -SINK * r * (w[0] + w[3]) + ctrlY * (w[1] + w[2]);
    pd[i] = lean * (w[1] + w[2]);
    pl[i] = i === 0 ? 0 : pl[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1], pd[i] - pd[i - 1]);
    // Fail loud if racers in the opening would drive into the body.
    const inOpening = (px[i] - openEdge) * dir > 0 && (px[i] - xOpen) * dir < -r;
    if (inOpening && py[i] - r < OPEN_CLEAR) throw new Error(`sandbeast: blocker ${d.id}'s arch hangs ${(py[i] - r).toFixed(1)}m over its opening (< ${OPEN_CLEAR}m)`);
  }
  const pathLen = pl[PATH_SAMPLES - 1];
  const headR = HEAD_OVER_BODY * r;
  const segLen0 = SEG_OVER_BODY * r;
  const bodyLen = pathLen + TAIL_SPARE * r;

  const kit = makeKit(BEAST_LAMPS + 8, BEAST_LAMPS, hi ? 420 : 200);
  const { rig, glow, smoke } = kit;
  const c = beastColours(opts.palette);
  const neck = beastNeck(headR);
  const nSeg = Math.min(MAX_SEGS[q], Math.ceil((bodyLen - neck) / segLen0));
  const segLen = (bodyLen - neck) / nSeg;
  const beast = buildBeast(rig, c, r, headR, nSeg, segLen, q, opts.seed);

  // --- Damage: crater, slabs, the ridge, cracks, the breach, debris ---
  const road = col(opts.palette.road);
  const dark = mix(opts.palette.road, 0x140e0a, 0.72);
  const subbase = mix(opts.palette.road, 0x0c0806, 0.85);
  const sandDark = mix(opts.palette.sand, 0x2a1a10, 0.45);
  const piece = (geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, p: Omit<Piece, 'bone'>, under?: THREE.BufferGeometry): Piece => {
    const bone = rig.bone();
    rig.add(geo, color, { bone });
    if (under) rig.add(under, subbase, { bone });
    bone.scale.setScalar(0);
    return { bone, ...p };
  };
  const slabPiece = (w: number, dep: number, color: THREE.ColorRepresentation, p: Omit<Piece, 'bone'>): Piece =>
    piece(new THREE.BoxGeometry(w, SLAB_THICK, dep).translate(0, SLAB_THICK / 2, 0), color, p, new THREE.BoxGeometry(w * 0.94, SUBBASE_THICK, dep * 0.94).translate(0, -SUBBASE_THICK / 2, 0));
  const pit = piece(cyl(craterR * 0.9, craterR * 0.95, 0.3, 12), subbase, { x: xCrater, ds: 0, yaw: 0, tilt: 0, delay: 0, lift: 0 });
  // Thrown-up spoil ringing the crater, its broken slabs inside: all of it within the crater's
  // radius, so none of the wreckage spills into the opening.
  const rim = piece(new THREE.TorusGeometry(craterR - RIM_TUBE, RIM_TUBE, 5, 16).rotateX(Math.PI / 2).scale(1, 0.85, 1), shade(mix(opts.palette.sand, opts.palette.road, 0.5), 0.8), { x: xCrater, ds: 0, yaw: 0, tilt: 0, delay: 0, lift: 0 });
  const craterSlabs: Piece[] = [];
  const nCs = SLABS.crater[q];
  for (let i = 0; i < nCs; i++) {
    const a = ((i + rng() * 0.5) / nCs) * Math.PI * 2;
    const rho = craterR * (0.5 + rng() * 0.32);
    const w = 4.5 + rng() * 2.5;
    craterSlabs.push(slabPiece(w, 3.5 + rng() * 2, shade(road, 0.75 + rng() * 0.3), { x: xCrater + Math.cos(a) * rho, ds: Math.sin(a) * rho, yaw: a, tilt: 0.6 + rng() * 0.5, delay: 0, lift: 0.8 + rng() * 1.4 }));
  }
  const ridgeFrom = xCrater + dir * craterR * 0.9;
  const ridgeTo = farEdge + dir * RIDGE_PAST;
  const ridgeLen = Math.abs(ridgeTo - ridgeFrom);
  const nRidge = Math.min(SLABS.ridge[q], Math.ceil(ridgeLen / RIDGE_SLAB) * 2);
  const ridgeSlabs: Piece[] = [];
  for (let i = 0; i < nRidge; i++) {
    const pair = Math.floor(i / 2);
    const side = i % 2 ? 1 : -1;
    const x = ridgeFrom + dir * ((pair + 0.5) / Math.ceil(nRidge / 2)) * ridgeLen;
    const jag = (rng() - 0.5) * 1.2;
    // The two slabs of a pair lean together into an A-frame over the tunnel.
    // Turned a quarter so the slab's x runs across the ridge; tilting raises its inner edge.
    ridgeSlabs.push(slabPiece(RIDGE_HALF * 2, RIDGE_SLAB * (0.85 + rng() * 0.3), shade(road, 0.72 + rng() * 0.3), { x, ds: side * RIDGE_HALF + jag, yaw: Math.PI / 2, tilt: -side * (0.6 + rng() * 0.35), delay: Math.abs(x - xCrater) / RIDGE_WAVE, lift: RIDGE_PEAK * (1 - 0.5 * (pair / Math.ceil(nRidge / 2))) }));
  }
  const spine = piece(rock(1, 1).scale(0.5, 1, 1).translate(0.5, 0, 0), sandDark, { x: ridgeFrom, ds: 0, yaw: dir > 0 ? 0 : Math.PI, tilt: 0, delay: 0, lift: 0 });
  const cracks: Piece[] = [];
  for (let i = 0; i < CRACKS.crater; i++) {
    const a = (i / CRACKS.crater) * Math.PI * 2 + rng();
    cracks.push(piece(crack(craterR * (1.1 + rng() * 0.8)), dark, { x: xCrater, ds: 0, yaw: a, tilt: 0, delay: rng() * 0.3, lift: 0 }));
  }
  const ridgeCracks: Piece[] = [];
  const nRc = Math.ceil(nRidge / 2);
  for (let i = 0; i < nRc; i++) {
    const x0 = ridgeFrom + dir * (i / nRc) * ridgeLen;
    const yaw = (dir > 0 ? 0 : Math.PI) + (rng() - 0.5) * 0.6;
    ridgeCracks.push(piece(crack(ridgeLen / nRc + 1.5), dark, { x: x0, ds: (rng() - 0.5) * 1.5, yaw, tilt: 0, delay: 0.3 + (i / nRc) * 0.4, lift: 0 }));
  }
  const mound = piece(rock(1, 1), shade(opts.palette.sand, 0.95), { x: xBreach, ds: 0, yaw: 0, tilt: 0, delay: 0, lift: 0 });
  const breachRim = piece(new THREE.TorusGeometry(r * 1.9, r * 0.45, 4, 14).rotateX(Math.PI / 2).scale(1, 0.6, 1), shade(opts.palette.sand, 1.05), { x: xBreach, ds: 0, yaw: 0, tilt: 0, delay: 0, lift: 0 });
  const breachCracks: Piece[] = [];
  for (let i = 0; i < CRACKS.breach; i++) {
    breachCracks.push(piece(crack(r * (2.5 + rng() * 1.5)), sandDark, { x: xBreach, ds: 0, yaw: (i / CRACKS.breach) * Math.PI * 2 + rng() * 0.5, tilt: 0, delay: 0, lift: 0 }));
  }
  const debris: (Piece & { toX: number; toDs: number; apex: number })[] = [];
  for (let i = 0; i < DEBRIS[q]; i++) {
    const size = 1.2 + rng() * 1.4;
    const p = piece(rock(size, 0), i % 3 ? shade(road, 0.9) : sandDark, { x: xCrater, ds: 0, yaw: rng() * 6, tilt: rng() * 3, delay: rng() * 0.15, lift: size * 0.4 });
    debris.push({ ...p, toX: xCrater + dir * (craterR + rng() * (Math.abs(farEdge - xCrater) - craterR)), toDs: (rng() - 0.5) * 12, apex: DEBRIS_APEX[0] + rng() * (DEBRIS_APEX[1] - DEBRIS_APEX[0]) });
  }

  rig.build(kit.group, FOOTPRINT, archH);

  // --- Per-frame state ---
  const frame = new RoadFrame(binding, hazard.s0, (hazard.minX + hazard.maxX) / 2);
  let ready = false;
  const sand = c.sand;
  const brushes = {
    spray: brush({ life: 1.8, size0: r * 0.8, size1: r * 2.4, c0: shade(sand, 1.1), c1: mix(opts.palette.sand, opts.palette.horizon, 0.4), alpha: 0.65, keep: 0.45, lift: -9 }),
    burst: brush({ life: 4, size0: r * 2, size1: r * 7, c0: shade(sand, 1.1), c1: mix(opts.palette.sand, opts.palette.horizon, 0.5), alpha: 0.7, keep: 0.4, lift: 1.5 }),
    grit: brush({ life: 1.2, size0: 1.2, size1: 3, c0: mix(opts.palette.road, opts.palette.sand, 0.5), c1: shade(sand, 0.9), alpha: 0.8, keep: 0.7, lift: -14 }),
    sandFall: brush({ life: 2.4, size0: r * 0.5, size1: r * 1.8, c0: shade(sand, 1.05), c1: sand, alpha: 0.9, keep: 0.8, lift: -22 }),
  };
  const P = new THREE.Vector3();
  const F = new THREE.Vector3();
  const U = new THREE.Vector3();
  const roadQ = new THREE.Quaternion();
  const partQ = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YZX');
  const basis = new THREE.Matrix4();
  const X = new THREE.Vector3();
  const Y = new THREE.Vector3();
  const Z = new THREE.Vector3();
  /** +1 if the road basis' z runs along +s, −1 if against. */
  let zSign = 1;
  let acc = 0;
  let prevTau = Number.NaN;

  /** First update: the binding is live; size everything that is in local units. */
  function init(): void {
    frame.refresh();
    const k = frame.k;
    for (const b of Object.values(brushes) as Brush[]) {
      b.size0 *= k;
      b.size1 *= k;
      b.lift *= k;
    }
    frame.point((xBreach + farEdge) / 2, archH / 2, 0, P);
    rig.bounds.center.copy(P);
    rig.bounds.radius = Math.hypot(span + RIDGE_PAST + craterR, archH) * k * 0.75;
    ready = true;
  }

  /** The road's orientation in local space, and which way its z runs. */
  function roadBasis(): void {
    X.copy(frame.ex).normalize();
    Y.copy(frame.ey).normalize();
    Z.crossVectors(X, Y);
    zSign = Z.dot(frame.es) > 0 ? 1 : -1;
    basis.makeBasis(X, Y, Z);
    roadQ.setFromRotationMatrix(basis);
  }

  /**
   * Track-space point and tangent of the arch at arc length `at`. Past either end the body runs
   * on straight underground, so the hide stays one smooth tube down into the sand or the road.
   */
  function onPath(at: number, pos: THREE.Vector3, tan: THREE.Vector3): void {
    const i = at <= 0 ? 0 : at >= pathLen ? PATH_SAMPLES - 2 : seek(at);
    tan.set(px[i + 1] - px[i], py[i + 1] - py[i], pd[i + 1] - pd[i]);
    const t = (at - pl[i]) / Math.max(1e-6, pl[i + 1] - pl[i]);
    if (at <= 0 || at >= pathLen) {
      const j = at <= 0 ? 0 : PATH_SAMPLES - 1;
      pos.set(px[j], py[j], pd[j]).addScaledVector(tan, (at - pl[j]) / tan.length());
      return;
    }
    pos.set(px[i] + (px[i + 1] - px[i]) * t, py[i] + (py[i + 1] - py[i]) * t, pd[i] + (pd[i + 1] - pd[i]) * t);
  }

  function seek(at: number): number {
    let i = 0;
    while (i < PATH_SAMPLES - 2 && pl[i + 1] < at) i++;
    return i;
  }

  /** Poses a body bone at arc length `at` along the arch, its back facing out of the arch. */
  function poseBody(bone: THREE.Bone, at: number, scale: number): void {
    if (!Number.isFinite(at)) {
      bone.scale.setScalar(0);
      return;
    }
    onPath(at, T1, T2);
    frame.point(T1.x, T1.y, T1.z, P);
    frame.dir(T2.x, T2.y, T2.z, F);
    // Its back faces out of the arch: the tangent turned a right angle away from the centre.
    frame.dir(-dir * T2.y, dir * T2.x, 0, U);
    aim(bone, P, F, U);
    bone.scale.setScalar(scale * frame.k);
  }

  /** Places a damage piece on the road: heave 0..1 tilts and lifts it, `size` scales it. */
  function posePiece(p: Piece, heave: number, size: number, y = 0): void {
    if (size <= 0) {
      p.bone.scale.setScalar(0);
      return;
    }
    frame.point(p.x, y + p.lift * heave, p.ds, P);
    p.bone.position.copy(P);
    euler.set(0, -zSign * p.yaw, p.tilt * heave);
    partQ.setFromEuler(euler);
    p.bone.quaternion.copy(roadQ).multiply(partQ);
    p.bone.scale.setScalar(size * frame.k);
  }

  function update(time: number, dt: number): void {
    if (!ready) init();
    frame.refresh();
    roadBasis();
    const t = cycleTime(time, d.period, d.phase);
    // Seconds from the slam: negative in the run-up (which may begin before 'warn').
    let tau = t - d.warn;
    if (tau >= d.period - lead - d.warn) tau -= d.period;
    const st = blockerStage(d, time);

    // --- The body ---
    let headAt = -Infinity;
    let open = 0;
    if (tau >= -ERUPT && tau < 0) {
      const u = (tau + ERUPT) / ERUPT;
      headAt = pathLen * (u + (ERUPT_SURGE * Math.sin(2 * Math.PI * u)) / (2 * Math.PI));
      open = smooth(ramp(u, MAW_OPEN[0], MAW_OPEN[1])) * (1 - smooth(ramp(u, MAW_SHUT[0], MAW_SHUT[1])));
    } else if (st.stage === 'down') {
      headAt = pathLen + bodyLen * Math.pow(st.progress, BURROW_EASE);
    }
    poseBody(beast.head, headAt, 1);
    setMaw(beast, open, time);
    const burrowing = st.stage === 'down';
    beast.segs.forEach((s, i) => {
      const at = headAt - beast.neck - i * segLen;
      const swell = burrowing ? 1 + PULSE * Math.sin(at / PULSE_WAVE * Math.PI * 2 - time * PULSE_RATE) : 1;
      poseBody(s.bone, at, swell);
    });

    // --- The ground: tremor, crater, ridge, scar ---
    const tremor = tau >= -lead && tau < -ERUPT ? (tau + lead) / TREMOR : tau >= -ERUPT ? 1 : 0;
    const settled = tau < d.up ? 0 : smooth((tau - d.up) / SETTLE);
    const scar = tau < d.up + SETTLE ? 1 : 1 - smooth((tau - d.up - SETTLE) / SCAR);
    const struck = tau >= 0 && scar > 0;
    const shake = tremor > 0 && tau < 0 ? Math.sin(time * 37) * 0.15 * tremor : 0;
    const heaveAt = (delay: number) => (struck ? (1 - settled) * smooth((tau - delay) / 0.25) : 0);
    posePiece(pit, 1, struck ? scar : 0, 0.02);
    posePiece(rim, heaveAt(0), struck ? scar : 0, -0.3);
    for (const p of craterSlabs) posePiece(p, heaveAt(p.delay), struck ? 1 : 0, -SUNK * settled);
    for (const p of ridgeSlabs) posePiece(p, heaveAt(p.delay), struck && tau >= p.delay ? 1 : 0, -SUNK * settled);
    // The ridge's sand spine, stretched along the tunnel as the wave runs out.
    const run = struck ? Math.min(1, (tau * RIDGE_WAVE) / ridgeLen) : 0;
    posePiece(spine, 1, run > 0 ? 1 : 0, -0.5 - SUNK * settled * 2);
    spine.bone.scale.set(ridgeLen * run * frame.k, RIDGE_PEAK * 0.7 * (1 - settled) * frame.k, RIDGE_HALF * 1.4 * frame.k);
    // Cracks open across the road during the tremor (the warning of where it will hit), stay
    // through the strike, and fade with the scar.
    const crackGrow = (delay: number) => (tremor > 0 ? smooth((tremor - delay) / (1 - delay)) : 0) * scar;
    for (const p of cracks) posePiece(p, 0, crackGrow(p.delay), 0.03);
    for (const p of ridgeCracks) posePiece(p, 0, crackGrow(p.delay), 0.03);
    // The breach: a bulge that heaves and shakes, splits, then is a sand-rimmed hole.
    const bulge = tau < -ERUPT ? smooth(tremor) : 0;
    posePiece(mound, 0, bulge > 0 ? 1 : 0, -r * 0.6 + shake);
    if (bulge > 0) mound.bone.scale.set(r * 2.4 * frame.k, r * (0.4 + 0.9 * bulge) * frame.k, r * 2.4 * frame.k);
    for (const p of breachCracks) posePiece(p, 0, crackGrow(0) * (tau < d.up + SETTLE ? 1 : 0), 0.05);
    posePiece(breachRim, 1, tau >= -ERUPT && tau < d.up + SETTLE ? 1 - settled : 0, -0.4);
    // Debris thrown out of the crater, lying in the blocked span until the road settles.
    for (const p of debris) {
      if (!struck || tau < p.delay) {
        p.bone.scale.setScalar(0);
        continue;
      }
      const u = Math.min(1, (tau - p.delay) / DEBRIS_FLIGHT);
      const x = p.x + (p.toX - p.x) * u;
      const ds = p.toDs * u;
      const y = 4 * p.apex * u * (1 - u) + p.lift - SUNK * 2 * settled;
      frame.point(x, y, ds, P);
      p.bone.position.copy(P);
      p.bone.rotation.set(p.tilt + u * 4, p.yaw + u * 3, 0);
      p.bone.scale.setScalar(frame.k);
    }
    rig.sync();
    beastLamps(rig, beast, glow, 0, open, boost, c, P);

    if (dt > 0) emit(tau, tremor, dt);
    prevTau = tau;
    glow.update(dt);
    smoke.update(dt);
  }

  function emit(tau: number, tremor: number, dt: number): void {
    const k = frame.k;
    const crossed = (at: number) => prevTau < at && tau >= at;
    if (crossed(-ERUPT)) {
      for (let i = 0; i < BURST.erupt; i++) {
        const a = rng() * Math.PI * 2;
        frame.point(xBreach + Math.cos(a) * r, 1, Math.sin(a) * r, P);
        smoke.emit(brushes.burst, P.x, P.y, P.z, Math.cos(a) * 20 * k, (14 + rng() * 22) * k, Math.sin(a) * 20 * k);
      }
    }
    if (crossed(0)) {
      for (let i = 0; i < BURST.slam; i++) {
        const along = rng();
        const x = i % 2 ? xCrater + (rng() - 0.5) * craterR * 2 : ridgeFrom + (ridgeTo - ridgeFrom) * along;
        frame.point(x, 1, (rng() - 0.5) * craterR, P);
        smoke.emit(brushes.burst, P.x, P.y, P.z, (rng() - 0.5) * 30 * k, (6 + rng() * 16) * k, (rng() - 0.5) * 30 * k);
        smoke.emit(brushes.grit, P.x, P.y, P.z, (rng() - 0.5) * 24 * k, (10 + rng() * 14) * k, (rng() - 0.5) * 24 * k);
      }
    }
    if (crossed(d.up)) {
      for (let i = 0; i < BURST.settle; i++) {
        frame.point(xCrater + (rng() - 0.5) * craterR * 2, 0.5, (rng() - 0.5) * craterR * 2, P);
        smoke.emit(brushes.burst, P.x, P.y, P.z, (rng() - 0.5) * 8 * k, 4 * k, (rng() - 0.5) * 8 * k);
      }
    }
    acc += dt;
    while (acc > EMIT_STEP) {
      acc -= EMIT_STEP;
      if (tremor > 0 && tau < -ERUPT) {
        // Sand jets off the bulge, grit hopping on the cracking road.
        if (rng() < tremor) {
          frame.point(xBreach + (rng() - 0.5) * r * 3, r * 0.8 * tremor, (rng() - 0.5) * r * 3, P);
          smoke.emit(brushes.spray, P.x, P.y, P.z, (rng() - 0.5) * 10 * k, (10 + rng() * 20 * tremor) * k, (rng() - 0.5) * 10 * k);
        }
        frame.point(xCrater + rng() * (ridgeTo - xCrater), 0.3, (rng() - 0.5) * craterR, P);
        smoke.emit(brushes.grit, P.x, P.y, P.z, 0, (3 + rng() * 5 * tremor) * k, 0);
      }
      // Sand pouring off whatever of the body is up in the air.
      for (let n = 0; n < SAND_STREAMS; n++) {
        const s = beast.segs[Math.floor(rng() * beast.segs.length)];
        if (s.bone.scale.x === 0) continue;
        rig.local(s.bone, (rng() - 0.5) * s.r * 1.6, s.r * (0.7 + rng() * 0.4), -rng() * segLen, P);
        if (P.y < frame.o.y + 3 * k) continue;
        smoke.emit(brushes.sandFall, P.x, P.y, P.z, 0, -2 * k, 0);
      }
    }
  }

  return { group: kit.group, radius: FOOTPRINT, update, dispose: () => disposeKit(kit) };
}

const T1 = new THREE.Vector3();
const T2 = new THREE.Vector3();

/** A crack: a thin dark strip from the origin out along +x, `len` long. */
function crack(len: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(len, CRACK_H, CRACK_W).translate(len / 2, 0, 0);
}

