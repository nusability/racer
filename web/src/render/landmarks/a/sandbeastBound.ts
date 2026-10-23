// The sand beast as a course hazard. Its body is posed every frame along a path built in track
// space (s, x, height) and mapped with the binding, so the part that collides is exactly where
// the simulation puts it.
//  - sweeper: it rears out of the road like a cobra at sweeperX, its neck the collision pillar,
//    its head hanging over the oncoming racers, and glides across the course ploughing a bow wave.
//  - blocker: its body arches high over the road (racers fly beneath); in 'warn' it rears and
//    roars with sand fountaining, then slams down across the course for 'down', lying on the
//    road with a hump over the opening, and heaves back up into the arch.

import * as THREE from 'three';
import { blockerStage, sweeperX } from '../../../core/hazards.ts';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { beastColours, beastLampCount, beastLamps, buildBeast, setJaws } from './beastBody.ts';
import { RoadFrame, aim, boundHazard, boundReach, cycleTime } from './bound.ts';
import { brush, disposeKit, glowBoost, makeKit, mix, mulberry32, shade, smooth } from './kit.ts';

/** Path samples per frame (each is one toLocal call). */
const SAMPLES = 40;
/** Head radius over body radius, and segment length over body radius. */
const HEAD_OVER_BODY = 1.25;
const SEG_OVER_BODY = 1.1;
const MAX_SEGS = { high: 48, low: 28 } as const;

// --- Sweeper (cobra) ---
const COBRA_H = 52;
const COBRA_OVERHANG = 18;
/** How far the top lags behind the base per m/s of sideways speed, and its cap, metres. */
const COBRA_LEAN = 0.7;
const COBRA_LEAN_MAX = 12;
const COBRA_SINK = 1.8;
const COBRA_RISE = 1.8;

// --- Blocker (arch and slam) ---
const ARCH_IDLE = 64;
const ARCH_REAR = 88;
const REAR_HEAD = 44;
const HEAD_OUT = 18;
const TAIL_OUT = 26;
/** Clear height under the hump over the opening, metres. */
const OPENING_CLEAR = 9;
/** Share of 'warn' spent rearing up, and where the slam starts. */
const REAR_END = 0.5;
const SLAM_START = 0.8;
/** Seconds to heave back up into the arch after 'down'. */
const HEAVE = 1.6;

const EMIT_STEP = 0.05;
/** Sand streams poured off the back per emission tick. */
const SAND_STREAMS = 3;

export function createBoundBeast(opts: LandmarkOptions): Landmark {
  const bound = boundHazard(opts, 'sandbeast', ['sweeper', 'blocker'] as const);
  if (!bound) throw new Error('createBoundBeast needs a hazard binding');
  const { binding, hazard } = bound;
  const d = hazard.def;
  const hi = opts.quality === 'high';
  const boost = glowBoost(opts.palette);
  const s0 = hazard.s0;
  const centreX = (hazard.minX + hazard.maxX) / 2;
  const f = new RoadFrame(binding, s0, centreX);
  const k = f.k;
  const side = f.originSide();
  const isSweeper = d.type === 'sweeper';
  // Body thickness in metres: the sweeper's neck is its collision pillar; the blocker's body,
  // lying on the road, is as tall as its barrier.
  const r = d.type === 'sweeper' ? d.radius : d.height / 2;
  const segLen = r * SEG_OVER_BODY;
  const canSink = d.type === 'sweeper' && (d.xFrom < hazard.minX - r || d.xFrom > hazard.maxX + r);

  // Blocker geometry along the course's lateral axis at s0.
  const xB = (side > 0 ? hazard.maxX : hazard.minX) + side * HEAD_OUT;
  const xA = (side > 0 ? hazard.minX : hazard.maxX) - side * TAIL_OUT;
  const openMin = d.type === 'blocker' ? d.offset - d.opening / 2 : 0;
  const openMax = d.type === 'blocker' ? d.offset + d.opening / 2 : 0;

  const maxLen = isSweeper ? COBRA_H + COBRA_OVERHANG + 4 * r : Math.abs(xA - xB) + 1.6 * ARCH_REAR + REAR_HEAD;
  const nSeg = Math.min(MAX_SEGS[opts.quality], Math.ceil(maxLen / segLen) + 2);
  const lampCount = beastLampCount(nSeg);
  const kit = makeKit(lampCount + 40, lampCount, hi ? 360 : 180);
  const { rig, glow, smoke } = kit;
  const c = beastColours(opts.palette);
  const beast = buildBeast(rig, c, r * HEAD_OVER_BODY * k, nSeg, segLen * k, (i) => r * k * (i < nSeg - 3 ? 1 : 1 - (i - nSeg + 4) * 0.2), hi);
  const reach = boundReach(f, Math.max(Math.abs(xA - centreX), Math.abs(xB - centreX)) + 120);
  rig.build(kit.group, reach, ARCH_REAR * k * 1.2);

  // Particle sizes and accelerations are in local units, like everything in the group.
  const rk = r * k;
  const sandBurst = brush({ life: 4, size0: rk * 2, size1: rk * 7, c0: shade(c.sand, 1.1), c1: mix(opts.palette.sand, opts.palette.horizon, 0.5), alpha: 0.7, keep: 0.4, lift: 1.5 * k });
  const spray = brush({ life: 1.8, size0: rk * 0.8, size1: rk * 2.4, c0: shade(c.sand, 1.1), c1: mix(opts.palette.sand, opts.palette.horizon, 0.4), alpha: 0.65, keep: 0.45, lift: -9 * k });
  const sandFall = brush({ life: 2.4, size0: rk * 0.35, size1: rk * 1.1, c0: shade(c.sand, 1.05), c1: c.sand, alpha: 0.85, keep: 0.8, lift: -22 * k });

  // Path in track space (x, height, ds) per sample, then local positions and arc lengths.
  const px = new Float32Array(SAMPLES);
  const py = new Float32Array(SAMPLES);
  const pd = new Float32Array(SAMPLES);
  const Q = Array.from({ length: SAMPLES }, () => new THREE.Vector3());
  const L = new Float32Array(SAMPLES);
  const up = f.ey.clone().normalize();
  const back = f.es.clone().normalize().negate();
  const lat = f.ex.clone().normalize();
  const V = new THREE.Vector3();
  const W = new THREE.Vector3();
  const upRef = new THREE.Vector3();
  const evt = mulberry32(opts.seed ^ 0xb0b);
  let acc = 0;
  let prevSlam = 0;

  /** Cubic Bézier through (x, y, ds) control points into sample arrays. */
  function bez(
    i: number, u: number,
    x0: number, y0: number, d0: number, x1: number, y1: number, d1: number,
    x2: number, y2: number, d2: number, x3: number, y3: number, d3: number,
  ): void {
    const v = 1 - u;
    const w0 = v * v * v;
    const w1 = 3 * v * v * u;
    const w2 = 3 * v * u * u;
    const w3 = u * u * u;
    px[i] = x0 * w0 + x1 * w1 + x2 * w2 + x3 * w3;
    py[i] = y0 * w0 + y1 * w1 + y2 * w2 + y3 * w3;
    pd[i] = d0 * w0 + d1 * w1 + d2 * w2 + d3 * w3;
  }

  /** The cobra's path from its head down its neck into the road at x. */
  function cobraPath(x: number, rise: number, lean: number): void {
    const h = COBRA_H * rise;
    for (let i = 0; i < SAMPLES; i++) {
      const u = i / (SAMPLES - 1);
      bez(i, u, x - lean, h * 0.88, -COBRA_OVERHANG * rise, x - lean * 0.6, h, 0, x, h * 0.5, 0, x, -2 * r, 0);
    }
  }

  /** The blocker's path from the head to the buried tail, blending arch → lying across the road. */
  function blockerPath(rear: number, slam: number, time: number): void {
    const archH = ARCH_IDLE + (ARCH_REAR - ARCH_IDLE) * rear;
    const headY = r * 1.2 + REAR_HEAD * rear;
    for (let i = 0; i < SAMPLES; i++) {
      const u = i / (SAMPLES - 1);
      bez(i, u, xB + side * 6 * rear, headY, 0, xB, archH, 0, xA, archH, 0, xA, -2 * r, 0);
      // Lying across the road: on the surface, humped over the opening, buried beyond the tail edge.
      const x = xB + (xA - xB) * u;
      const roadEdgeA = side > 0 ? hazard.minX : hazard.maxX;
      const beyond = (x - roadEdgeA) * -side;
      let y = r + humpAt(x);
      if (beyond > 0) y -= Math.min(1, beyond / TAIL_OUT) * 3 * r;
      // A slow, heavy sinuous roll along the body: a long wave, never a wobble.
      const sway = Math.sin(u * Math.PI * 1.3 + time * 0.35) * 7 * u * (1 - slam);
      px[i] += (x - px[i]) * slam;
      py[i] += (y - py[i]) * slam;
      pd[i] = sway;
    }
  }

  function humpAt(x: number): number {
    if (d.type !== 'blocker' || d.opening <= 0) return 0;
    const ramp = 2.5 * r;
    const lo = openMin - r;
    const hiX = openMax + r;
    const t = x < lo ? 1 - (lo - x) / ramp : x > hiX ? 1 - (x - hiX) / ramp : 1;
    return (OPENING_CLEAR + r) * smooth(t);
  }

  /** Maps the sampled path to local space and poses head and segments along it. */
  function pose(): void {
    for (let i = 0; i < SAMPLES; i++) {
      binding.toLocal(s0 + pd[i], px[i], py[i], Q[i]);
      L[i] = i === 0 ? 0 : L[i - 1] + Q[i].distanceTo(Q[i - 1]);
    }
    const total = L[SAMPLES - 1];
    W.subVectors(Q[0], Q[1]);
    poseOn(beast.head, Q[0], W, py[0] > -r * 1.2);
    let j = 0;
    beast.segs.forEach((s, n) => {
      const dist = beast.headR * 0.9 + (n + 0.5) * segLen * k;
      if (dist >= total) {
        s.bone.scale.setScalar(0);
        return;
      }
      while (j < SAMPLES - 2 && L[j + 1] < dist) j++;
      const t = (dist - L[j]) / Math.max(1e-6, L[j + 1] - L[j]);
      V.lerpVectors(Q[j], Q[j + 1], t);
      W.subVectors(Q[j], Q[j + 1]);
      const y = py[j] + (py[j + 1] - py[j]) * t;
      // Below the sand there's nothing to draw; hiding stops it poking through dune hollows.
      poseOn(s.bone, V, W, y > -s.r / k * 1.5);
    });
  }

  function poseOn(bone: THREE.Bone, p: THREE.Vector3, fwd: THREE.Vector3, visible: boolean): void {
    if (!visible) {
      bone.scale.setScalar(0);
      return;
    }
    // Dorsal side up; where the body runs vertical, it faces back down the road instead.
    const vert = Math.abs(fwd.dot(up)) / Math.max(1e-6, fwd.length());
    upRef.copy(up).multiplyScalar(1 - vert).addScaledVector(back, vert);
    aim(bone, p, fwd, upRef);
    bone.scale.setScalar(1);
  }

  function update(time: number, dt: number): void {
    let open = 0;
    let slam = 0;
    let fountain = 0;
    if (d.type === 'sweeper') {
      const x = sweeperX(d, time);
      const vel = (sweeperX(d, time + 0.05) - sweeperX(d, time - 0.05)) / 0.1;
      const t = cycleTime(time, d.period, d.phase);
      const busy = 2 * d.cross + d.hold;
      const rest = d.period - busy;
      // It sinks out of sight while parked, if the rest is long enough and the park spot is
      // truly off the course (the simulation keeps its pillar there).
      let rise = 1;
      if (canSink && rest > COBRA_SINK + COBRA_RISE + 0.5 && t > busy) rise = Math.min(1 - smooth((t - busy) / COBRA_SINK), smooth((t - (d.period - COBRA_RISE)) / COBRA_RISE));
      const lean = THREE.MathUtils.clamp(vel * COBRA_LEAN, -COBRA_LEAN_MAX, COBRA_LEAN_MAX);
      cobraPath(x, rise, lean);
      open = rise * (0.45 + 0.55 * Math.abs(Math.sin(time * 0.9)));
      fountain = Math.min(1, Math.abs(vel) / 8) * rise;
      if (dt > 0) emitCobra(x, vel, rise, dt);
    } else {
      const st = blockerStage(d, time);
      let rear = 0;
      if (st.stage === 'warn') {
        rear = smooth(st.progress / REAR_END);
        slam = st.progress < SLAM_START ? 0 : Math.pow((st.progress - SLAM_START) / (1 - SLAM_START), 2);
        open = rear * (1 - slam);
        fountain = st.progress;
        // A tremor through the body as it gathers itself.
        rear += Math.sin(time * 9) * 0.012 * rear;
      } else if (st.stage === 'down') {
        slam = 1;
      } else {
        const idleLen = d.period - d.warn - d.up;
        slam = 1 - smooth((st.progress * idleLen) / HEAVE);
      }
      blockerPath(rear, slam, time);
      if (dt > 0) emitBlocker(fountain, slam, dt);
      prevSlam = slam;
    }
    pose();
    setJaws(beast, open, time);
    rig.sync();
    beastLamps(rig, beast, glow, 0, open, time, boost, c, V);
    glow.update(dt);
    smoke.update(dt);
  }

  function emitCobra(x: number, vel: number, rise: number, dt: number): void {
    acc += dt;
    while (acc > EMIT_STEP) {
      acc -= EMIT_STEP;
      if (rise < 0.05) continue;
      // Bow wave thrown ahead of the neck, churned sand all round its base.
      const dir = Math.sign(vel);
      binding.toLocal(s0 + (evt() - 0.5) * r * 2, x + dir * r * 1.2, 0.5, V);
      if (dir !== 0) smoke.emit(spray, V.x, V.y, V.z, lat.x * dir * 20 * k + up.x * 12 * k, up.y * (10 + evt() * 10) * k, lat.z * dir * 20 * k + up.z * 12 * k);
      binding.toLocal(s0 + (evt() - 0.5) * r * 3, x + (evt() - 0.5) * r * 3, 1, V);
      if (evt() < 0.4 || rise < 1) smoke.emit(sandBurst, V.x, V.y, V.z, (evt() - 0.5) * 6 * k, 4 * k, (evt() - 0.5) * 6 * k);
      emitSandFall();
    }
  }

  function emitBlocker(fountain: number, slam: number, dt: number): void {
    // The slam: dust bursting along the whole road where the body hits.
    if (slam > 0.98 && prevSlam <= 0.98) {
      for (let i = 0; i < 26; i++) {
        binding.toLocal(s0 + (evt() - 0.5) * r * 4, hazard.minX + (hazard.maxX - hazard.minX) * evt(), 1, V);
        smoke.emit(sandBurst, V.x, V.y, V.z, (evt() - 0.5) * 30 * k, (6 + evt() * 14) * k, (evt() - 0.5) * 30 * k);
      }
    }
    acc += dt;
    while (acc > EMIT_STEP) {
      acc -= EMIT_STEP;
      // Warning: sand fountains up at the road edges and where the body will lie.
      if (fountain > 0 && evt() < fountain) {
        const x = evt() < 0.5 ? hazard.minX - 2 : hazard.maxX + 2;
        binding.toLocal(s0 + (evt() - 0.5) * 6, x, 0.5, V);
        smoke.emit(spray, V.x, V.y, V.z, up.x * 30 * k, up.y * (22 + evt() * 18) * k, up.z * 30 * k);
      }
      emitSandFall();
    }
  }

  /** Sand pouring off any part of the back that is up in the air. */
  function emitSandFall(): void {
    for (let n = 0; n < SAND_STREAMS; n++) {
      const s = beast.segs[Math.floor(evt() * beast.segs.length)];
      if (s.bone.scale.x === 0) continue;
      rig.local(s.bone, (evt() - 0.5) * s.r * 2, s.r * (0.6 + evt() * 0.6), -evt() * s.r * 2, W);
      smoke.emit(sandFall, W.x, W.y, W.z, 0, -2 * k, 0);
    }
  }


  return { group: kit.group, radius: reach, update, dispose: () => disposeKit(kit) };
}

