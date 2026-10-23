// Sandbeast: a colossal armoured burrower. A mound ploughs toward the breach point and the
// sand starts to ring; then the creature bursts out in a towering arc, its three-jawed maw
// splaying open and glowing, sand pouring off its plated back, and dives back under in a
// plume of dust. Rings of ripples settle; the cycle repeats.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { beastColours, beastLampCount, beastLamps, buildBeast, setJaws } from './beastBody.ts';
import { createBoundBeast } from './sandbeastBound.ts';
import { T, brush, cyl, disposeKit, glowBoost, makeKit, mix, mulberry32, ramp, rock, shade, smooth } from './kit.ts';

/** The breach arc: a circle of radius ARC_R whose centre is ARC_SINK below the sand. */
const ARC_R = 112;
const ARC_SINK = 30;
const HALF_SPAN = Math.sqrt(ARC_R * ARC_R - ARC_SINK * ARC_SINK);

const SEG_LEN = 9;
const HEAD_R = 13;
const TAIL_R = 3.2;

/** Cycle, seconds: the mound approaches, the beast breaches, the dust settles. */
const CYCLE = 20;
const T_APPROACH = 0;
const T_BREACH = 6;
const T_SUBMERGED = 17;
/** Head starts and ends this far round the circle below ground, radians. */
const UNDER_A = 0.35;
const MOUND_FROM = -230;
const RIPPLES = 3;
const RIPPLE_MAX = 75;

const RADIUS = 260;
const HEIGHT = 110;

export function createSandbeast(opts: LandmarkOptions): Landmark {
  if (opts.hazard) return createBoundBeast(opts);
  const { palette, quality } = opts;
  const hi = quality === 'high';
  const boost = glowBoost(palette);
  const nSeg = hi ? 26 : 16;
  const segLen = hi ? SEG_LEN : (SEG_LEN * 26) / 16;
  const lampCount = beastLampCount(nSeg);
  const kit = makeKit(lampCount + 30, lampCount, hi ? 420 : 200);
  const { rig, glow, smoke } = kit;
  smoke.wind.set(3, 0, 1);

  const c = beastColours(palette);
  const sand = c.sand;

  // --- Craters at the breach and dive points, ripple rings ---
  for (const x of [-HALF_SPAN, HALF_SPAN]) {
    rig.add(cyl(HEAD_R * 2.6, HEAD_R * 3.2, 0.4, 12), shade(sand, 0.8), { m: T(x, -0.1, 0) });
    rig.add(new THREE.TorusGeometry(HEAD_R * 3, 6, 3, 14).rotateX(Math.PI / 2).scale(1, 0.6, 1), shade(sand, 1.05), { m: T(x, 0, 0) });
  }
  const ripples: THREE.Bone[] = [];
  for (const x of [-HALF_SPAN, HALF_SPAN]) {
    for (let k = 0; k < RIPPLES; k++) {
      const b = rig.bone(rig.root, x, 0, 0);
      rig.add(new THREE.TorusGeometry(1, 0.08, 3, 18).rotateX(Math.PI / 2), shade(sand, 0.88), { bone: b });
      b.scale.setScalar(0);
      ripples.push(b);
    }
  }
  const mound = rig.bone();
  rig.add(rock(1, 1), shade(sand, 0.96), { bone: mound, m: T(0, 0, 0, 0, 0, 0, 30, 9, 18) });

  const beast = buildBeast(rig, c, HEAD_R, nSeg, segLen, (i) => HEAD_R + (TAIL_R - HEAD_R) * Math.pow(i / (nSeg - 1), 1.3), hi);
  const { head, segs } = beast;

  rig.build(kit.group, RADIUS, HEIGHT);

  const sandFall = brush({ life: 2.6, size0: 3.5, size1: 6, c0: shade(sand, 1.05), c1: sand, alpha: 0.85, keep: 0.8, lift: -22 });
  const plume = brush({ life: 6, size0: 16, size1: 70, c0: shade(sand, 1.1), c1: mix(palette.sand, palette.horizon, 0.5), alpha: 0.65, keep: 0.45, lift: 2 });
  const spray = brush({ life: 2.2, size0: 6, size1: 18, c0: shade(sand, 1.1), c1: mix(palette.sand, palette.horizon, 0.4), alpha: 0.6, keep: 0.4, lift: -6 });

  const evt = mulberry32(opts.seed ^ 0x5eed);
  const P = new THREE.Vector3();
  const F = new THREE.Vector3();
  const U = new THREE.Vector3();
  const Rv = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  let prevHeadY = -100;
  let acc = 0;
  const travel = Math.PI + 2 * UNDER_A + (nSeg * segLen) / ARC_R;
  const omega = travel / (T_SUBMERGED - T_BREACH);
  const dTheta = segLen / ARC_R;

  /** Poses `b` on the arc at angle a (moving toward smaller a), body twisting a little. */
  function onArc(b: THREE.Bone, a: number, twist: number): number {
    const y = -ARC_SINK + ARC_R * Math.sin(a);
    P.set(ARC_R * Math.cos(a), y, Math.sin(a * 1.7) * 6);
    F.set(Math.sin(a), -Math.cos(a), 0);
    U.set(Math.cos(a), Math.sin(a), 0);
    U.applyAxisAngle(F, twist);
    Rv.crossVectors(U, F);
    basis.makeBasis(Rv, U, F);
    b.quaternion.setFromRotationMatrix(basis);
    b.position.copy(P);
    return y;
  }

  function update(time: number, dt: number): void {
    const t = ((time % CYCLE) + CYCLE) % CYCLE;
    // Approach: the mound ploughs in toward the breach point and sinks as the ripples start.
    const ma = ramp(t, T_APPROACH, T_BREACH);
    mound.position.set(MOUND_FROM + (-HALF_SPAN - MOUND_FROM) * smooth(ma), -2 - 8 * ramp(ma, 0.8, 1), 0);
    mound.scale.setScalar(t < T_BREACH ? 1 : 0);

    const aHead = Math.PI + UNDER_A - Math.max(0, t - T_BREACH) * omega;
    const active = t >= T_BREACH && t < T_SUBMERGED;
    const headY = active ? onArc(head, aHead, 0) : -100;
    head.scale.setScalar(active && headY > -HEAD_R * 2 ? 1 : 0);
    // Jaws gape on the way up and clamp shut over the top before the dive.
    const open = active ? smooth(ramp(headY, 0, 25)) * smooth(ramp(aHead, 0.4, 1.4)) : 0;
    setJaws(beast, open, time);
    segs.forEach((s, i) => {
      const a = aHead + (i + 1) * dTheta;
      const y = active ? onArc(s.bone, a, Math.sin(time * 1.5 - i * 0.4) * 0.12) : -100;
      // Below the sand there's nothing to draw; hiding stops it poking through dune hollows.
      s.bone.scale.setScalar(active && y > -s.r * 2 ? 1 : 0);
    });

    // Ripples ring out at the breach point before it, and at the dive point after.
    for (let k = 0; k < RIPPLES * 2; k++) {
      const atDive = k >= RIPPLES;
      const start = atDive ? T_SUBMERGED - 4 : T_BREACH - 3.5;
      const p = (t - start - (k % RIPPLES) * 0.9) / 3;
      const b = ripples[k];
      if (p < 0 || p > 1) {
        b.scale.setScalar(0);
        continue;
      }
      const rad = 8 + p * RIPPLE_MAX;
      b.scale.set(rad, (1 - p) * 30, rad);
    }
    rig.sync();

    beastLamps(rig, beast, glow, 0, open, time, boost, c, P);

    if (dt > 0) {
      // Bursts as the head breaks the surface and as it dives.
      if (active && (prevHeadY < 0) !== (headY < 0)) {
        const x = headY >= 0 ? -HALF_SPAN : HALF_SPAN;
        for (let k = 0; k < 18; k++) {
          const a = evt() * Math.PI * 2;
          const sp = 10 + evt() * 25;
          smoke.emit(plume, x + Math.cos(a) * 10, 4 + evt() * 20, Math.sin(a) * 10, Math.cos(a) * sp, 14 + evt() * 22, Math.sin(a) * sp);
        }
      }
      prevHeadY = headY;
      acc += dt;
      while (acc > EMIT_STEP) {
        acc -= EMIT_STEP;
        if (t < T_BREACH && t > T_APPROACH + 0.5) {
          // Spray thrown up by the mound.
          smoke.emit(spray, mound.position.x - 10, 3, (evt() - 0.5) * 16, -8 - evt() * 8, 8 + evt() * 8, (evt() - 0.5) * 10);
        }
        if (!active) continue;
        for (let i = 0; i < nSeg; i += 2) {
          const s = segs[i];
          if (s.bone.scale.x === 0) continue;
          const y = s.bone.position.y;
          if (Math.abs(y) < s.r + 3) {
            // Churned sand where the body cuts the surface.
            const x = s.bone.position.x;
            smoke.emit(spray, x, 2, s.bone.position.z, (evt() - 0.5) * 30, 10 + evt() * 14, (evt() - 0.5) * 30);
            if (evt() < 0.3) smoke.emit(plume, x, 6, s.bone.position.z, (evt() - 0.5) * 8, 6 + evt() * 6, (evt() - 0.5) * 8);
          } else if (y > s.r && evt() < 0.45) {
            // Sand pouring off the plated back.
            rig.local(s.bone, (evt() - 0.5) * s.r * 1.6, s.r * 1.1, 0, P);
            smoke.emit(sandFall, P.x, P.y, P.z, (evt() - 0.5) * 3, -2, (evt() - 0.5) * 3);
          }
        }
      }
    }
    glow.update(dt);
    smoke.update(dt);
  }

  return { group: kit.group, radius: RADIUS, update, dispose: () => disposeKit(kit) };
}

/** Particle emission tick, seconds. */
const EMIT_STEP = 0.05;
