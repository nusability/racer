// The volcano: a whole island offshore, jungle skirts climbing to bare black cone. Its crater
// glows and smokes, now and then it throws up a burst of lava bombs, and rivers of lava creep
// down the flanks into the sea, where they boil up in great white steam clouds. Built to read
// as a silhouette from kilometres out, and to burn at dusk.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import type { V3 } from '../b/motion.ts';
import { T, mix, shade, vary } from '../b/shapes.ts';
import { quadPts } from '../b/props.ts';
import { FOAM_Y, finishCoast, foamRing, smoke } from './kit.ts';
import { bindingOf, withBound } from './hazard.ts';
import { lavaBombs } from './lavaBombs.ts';

const SALT = 0x701ca;
const RADIUS = 600;
const SHORE_R = 560;
const SEA_R = 600;
const SEA_FLOOR = -18;
const RIM = { r: 85, h: 360 } as const;
const CRATER_DEPTH = 46;
const RIM_TILT = 0.09;
const RIM_JAG = 0.025;
const SHOULDER = { r: 240, da: 0.9, h: 70, size: 85 } as const;
/** Flank profile: height falls off from the rim as ((shore − r) / (shore − rim))^FLANK. */
const FLANK = 1.45;
const RINGS: readonly number[] = [0, 40, 70, RIM.r, 100, 125, 155, 190, 230, 275, 325, 380, 440, 500, 540, SHORE_R, SEA_R];
const SEGMENTS = { high: 56, low: 32 } as const;
const RIDGES: readonly { k: number; amp: number }[] = [{ k: 3, amp: 0.05 }, { k: 5, amp: 0.04 }, { k: 9, amp: 0.035 }, { k: 14, amp: 0.025 }];
const STREAMS = { high: 5, low: 3 } as const;
const STREAM_STEPS = 18;
const SMOKE = { high: 70, low: 34 } as const;
const BOMBS = { bursts: { high: 3, low: 2 }, each: { high: 34, low: 20 } } as const;
const STEAM = { high: 22, low: 12 } as const;
/** The hot patch where lava meets the sea floats just above the water. */
const SEA_GLOW_Y = 0.4;
const LAVA_HOT = 0xffd040;
const LAVA = 0xff5a10;
const LAVA_COOL = 0xc81e08;
const JUNGLE = 0x3f8a3a;
const ASH = 0x2e2826;

export function createVolcano(opts: LandmarkOptions): Landmark {
  const bound = bindingOf(opts, 'volcano', ['dropper'] as const);
  const kit = new Kit(opts, SALT);
  const { rng } = kit;
  const ridgePhase = RIDGES.map(() => rng() * Math.PI * 2);

  const shoulderA = rng() * Math.PI * 2;
  /** A broken, uneven rim: one side stands higher, so the silhouette is not a party hat. */
  const rimH = (a: number): number => RIM.h * (1 + RIM_TILT * Math.cos(a - shoulderA) + RIM_JAG * Math.sin(7 * a + ridgePhase[0]));

  /** Ground height at (r, θ). The ridges ripple the flanks but leave shore and rim intact. */
  function height(r: number, a: number): number {
    if (r >= SEA_R) return SEA_FLOOR;
    if (r >= SHORE_R) return SEA_FLOOR * ((r - SHORE_R) / (SEA_R - SHORE_R));
    const top = rimH(a);
    if (r <= RIM.r) return top - CRATER_DEPTH * (1 - (r / RIM.r) ** 2.5);
    const u = (r - RIM.r) / (SHORE_R - RIM.r);
    const base = top * (1 - u) ** FLANK;
    let rip = 0;
    RIDGES.forEach((g, i) => (rip += g.amp * Math.sin(g.k * a + ridgePhase[i])));
    const fade = Math.sin(Math.PI * u);
    // A parasitic cone on one shoulder.
    const dx = Math.cos(a) * r - Math.cos(shoulderA + SHOULDER.da) * SHOULDER.r;
    const dz = Math.sin(a) * r - Math.sin(shoulderA + SHOULDER.da) * SHOULDER.r;
    const bump = SHOULDER.h * Math.exp(-(dx * dx + dz * dz) / (SHOULDER.size * SHOULDER.size));
    return base * (1 + rip * fade * 2.6) + 4 * fade + bump;
  }
  const at = (r: number, a: number, lift = 0): V3 => [Math.cos(a) * r, height(r, a) + lift, Math.sin(a) * r];

  // The island: one flat-shaded quad per cell, coloured by altitude.
  const segs = kit.q(SEGMENTS.high, SEGMENTS.low);
  const sand = new THREE.Color(kit.palette.sand);
  const rock = shade(mix(kit.palette.rock, ASH, 0.55), 0.9);
  for (let i = 0; i + 1 < RINGS.length; i++) {
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2;
      const a1 = ((s + 1) / segs) * Math.PI * 2;
      const r0 = RINGS[i];
      const r1 = RINGS[i + 1];
      const h = (height(r0, a0) + height(r1, a1)) / 2;
      const rm = (r0 + r1) / 2;
      let c: THREE.Color;
      if (rm <= RIM.r) c = mix(ASH, 0x5a1a10, 0.5 - rm / RIM.r / 2);
      else if (rm >= SHORE_R - 10) c = vary(rng, sand, 0.05);
      else if (h < 140) c = vary(rng, mix(JUNGLE, kit.palette.sand, rng() * 0.2 + (h < 20 ? 0.5 : 0)), 0.12);
      else if (h < 230) c = vary(rng, mix(JUNGLE, rock, (h - 140) / 90), 0.08);
      else c = vary(rng, rock, 0.06);
      kit.solid.add(quadPts(at(r0, a0), at(r1, a0), at(r1, a1), at(r0, a1)), c);
    }
  }

  // Crater: a molten floor and a column of glow above it, much stronger at dusk.
  const floorY = height(0, 0) + 3;
  kit.lamp(new THREE.CircleGeometry(RIM.r * 0.62, 16).rotateX(-Math.PI / 2), [0, floorY, 0], LAVA, 0, undefined, { depth: 0.3, freq: 1.1, phase: 0 });
  kit.lamp(new THREE.CircleGeometry(RIM.r * 0.3, 10).rotateX(-Math.PI / 2), [0, floorY + 1, 0], LAVA_HOT, 25 + 55 * kit.dusk, undefined, { depth: 0.4, freq: 2.3, phase: 1 });
  const glow = new THREE.Color(0xff6a20).multiplyScalar(0.06 + 0.16 * kit.dusk);
  kit.beams.add(new THREE.CylinderGeometry(RIM.r * 1.3, RIM.r * 0.6, 160, 14, 1, true).translate(0, 80, 0), glow, T(0, floorY, 0), undefined, { depth: 0.3, freq: 0.9, phase: 0 });

  // Lava streams: glowing ribbons meandering from the rim to the sea, with a marquee flicker
  // running downhill so they visibly flow. Most face the track (−Z) so they are seen.
  const nStreams = kit.q(STREAMS.high, STREAMS.low);
  const steam = kit.particles(false, 1);
  const fire = kit.particles(true, 1.6);
  for (let k = 0; k < nStreams; k++) {
    const a0 = -Math.PI / 2 + (k - (nStreams - 1) / 2) * 0.62 + (rng() - 0.5) * 0.2;
    const wiggle = 0.06 + rng() * 0.08;
    const wPhase = rng() * 6;
    let prevL: V3 | undefined;
    let prevR: V3 | undefined;
    for (let i = 0; i <= STREAM_STEPS; i++) {
      const t = i / STREAM_STEPS;
      const r = RIM.r - 6 + t * (SHORE_R - RIM.r + 12);
      const a = a0 + wiggle * Math.sin(t * 7 + wPhase);
      const w = (7 + t * 12) / r;
      const L = at(r, a - w, 3 + t * 2);
      const R = at(r, a + w, 3 + t * 2);
      if (prevL && prevR) {
        const col = mix(mix(LAVA_HOT, LAVA, Math.min(1, t * 2)), LAVA_COOL, Math.max(0, t * 2 - 1));
        kit.lights.add(quadPts(prevL, L, R, prevR), col, undefined, undefined, { depth: 0.55, freq: 2.2, phase: -i * 0.9, sharp: 2 });
        if (i % 3 === 0) kit.halos.point(at(r, a, 8), LAVA, 28 + 12 * kit.dusk, undefined, { depth: 0.4, freq: 2.2, phase: -i * 0.9 });
      }
      prevL = L;
      prevR = R;
    }
    // Where the lava meets the sea: a hot patch on the water and a boiling steam cloud.
    const aEnd = a0 + wiggle * Math.sin(7 + wPhase);
    const end: V3 = [Math.cos(aEnd) * (SHORE_R + 8), SEA_GLOW_Y, Math.sin(aEnd) * (SHORE_R + 8)];
    kit.lamp(new THREE.CircleGeometry(16, 8).rotateX(-Math.PI / 2), end, LAVA, 30, undefined, { depth: 0.5, freq: 3, phase: k });
    smoke(steam, rng, end, { count: kit.q(STEAM.high, STEAM.low), color: 0xf0f0f2, size: 26, rise: 20, wind: [6, 0, -3], period: 7, spread: 18, grow: 0.4 });
  }

  // The plume: dark ash smoke boiling out of the crater and leaning downwind.
  smoke(steam, rng, [0, floorY + 10, 0], { count: kit.q(SMOKE.high, SMOKE.low), color: 0x4a4446, size: 80, rise: 30, wind: [14, 0, 4], period: 18, spread: 50, grow: 0.25 });

  // Eruptions: bursts of lava bombs arcing out of the crater on staggered timers.
  for (let b = 0; b < kit.q(BOMBS.bursts.high, BOMBS.bursts.low); b++) {
    const period = 7 + b * 2.3;
    const phase = rng() * period;
    for (let i = 0; i < kit.q(BOMBS.each.high, BOMBS.each.low); i++) {
      const a = rng() * Math.PI * 2;
      const out = 8 + rng() * 26;
      fire.add([Math.cos(a) * 10, floorY + 4, Math.sin(a) * 10], [Math.cos(a) * out, 70 + rng() * 50, Math.sin(a) * out], i % 3 ? LAVA : LAVA_HOT, 9 + rng() * 6, { period, lifetime: 5, phase }, { gravity: 32, drag: 0.05, fadeIn: 0.01 });
    }
  }
  // A constant shimmer of embers over the vent.
  for (let i = 0; i < kit.q(40, 20); i++) {
    const period = 3 + rng() * 2;
    fire.add([(rng() - 0.5) * 40, floorY + 2, (rng() - 0.5) * 40], [(rng() - 0.5) * 8, 25 + rng() * 25, (rng() - 0.5) * 8], LAVA_HOT, 5 + rng() * 3, { period, lifetime: period, phase: rng() * period }, { gravity: 6, drag: 0.3, fadeIn: 0.05 });
  }

  foamRing(kit, [0, FOAM_Y, 0], SHORE_R + 2, kit.q(96, 48), 3.5, 3, 0.5);
  // Bound to a dropper: the scheduled bombs fly from the crater onto their spots on the course.
  const drive = bound && lavaBombs(kit, bound, [0, floorY + 6, 0]);
  const lm = finishCoast(kit, RADIUS);
  return drive ? withBound(lm, drive) : lm;
}
