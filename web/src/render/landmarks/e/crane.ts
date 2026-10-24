// The construction site: a half-built tower in its steel frame, floor slabs going up, a striped
// hoarding round it, stacks of girders and site cabins, and yellow tower cranes standing at the
// roadside with their jibs over the course. Bound as a dropper, each girder bundle swings in
// under a crane's trolley (the jib slews to the landing spot, the trolley runs out to it), then
// the hook lets go and it drops to land on the dropper's spot exactly as its warning ends, in a
// burst of dust and sparks. The track scene draws it lying there from then on (same bundle).

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { dropperItems, type DropItem } from '../../../core/hazards.ts';
import { HAZARD_ROCK_HEIGHT } from '../../../data/tuning.ts';
import { girderBundle } from '../../track/scheduled.ts';
import { T, beam, box, mix, prism, shade, vary } from '../b/shapes.ts';
import type { V3 } from '../b/motion.ts';
import { brush, col, glowBoost } from '../a/kit.ts';
import { CONCRETE, CONCRETE_DARK, DARK, Facades, RED_LIGHT, RigKit, RoadFrame, SAFETY, STEEL, WALLS, WARM_LIGHT, bindHazard, hide, smooth01 } from './kit.ts';

const SALT = 0xc4a9e;
const RADIUS = 110;
/** One crane per this much of the dropper's length, at most MAX_CRANES. */
const CRANE_SPACING = 110;
const MAX_CRANES = 3;
const MAX_LOADS = 12;
/** Cranes stand this far past the road edge on the site's side. */
const CRANE_SETBACK = 14;
const MAST_H = 58;
const MAST_W = 2.4;
/** Lattice bracing every this many metres (high and low quality). */
const BRACE = { high: 5, low: 10 } as const;
const COUNTER_JIB = 22;
/** The jib reaches the farthest landing spot plus this. */
const JIB_SPARE = 6;
/** Share of the warning the load hangs under the trolley; the rest it falls. */
const HANG_SHARE = 0.55;
/** Height of the hanging load over the road when the hook lets go, and its swing. */
const HANG_H = 16;
const SWING = 0.6;
/** Idle: the jib rests turned this far off square to the road and drifts. */
const IDLE_DRIFT = 0.15;
/** Slew rate limit, rad/s, so the jib swings rather than snaps. */
const SLEW_RATE = 1.6;
/** The half-built tower: floors done, floors framed, storey height, footprint. */
const FLOORS_DONE = 7;
const FLOORS_FRAMED = 5;
const STOREY = 4;
const TOWER_W = 30;
const DUST_BURST = 14;
const SPARKS = 10;
/** The fallen load as the track scene draws it: steel, the biome kit's debris colour. */
const LOAD_COLOUR = 0x8c939c;

interface Crane {
  mast: THREE.Bone;
  slew: THREE.Bone;
  trolley: THREE.Bone;
  cable: THREE.Bone;
  /** Along the hazard: its s, and its slew angle now. */
  s: number;
  yaw: number;
}

export function createCrane(opts: LandmarkOptions): Landmark {
  const ik = new RigKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('crane', opts, ['dropper'] as const, {
    def: { type: 'dropper', id: 'free', from: 0, to: 0, count: 5, radius: 3.5, period: 9, warn: 2.6, stay: 3, phase: 0 },
    roadZ: -RADIUS * 0.95,
    lateral: -1,
    minX: -10,
    maxX: 10,
    span: RADIUS * 1.4,
  });
  const def = bound.def;
  if (def.count > MAX_LOADS) throw new Error(`crane: dropper ${def.id} drops ${def.count} loads; it can show ${MAX_LOADS}`);
  const h = bound.hazard;
  const boost = glowBoost(opts.palette);
  const brace = ik.q(BRACE.high, BRACE.low);

  // --- The site: a half-built tower, its frame, the hoarding, girder stacks and cabins ---
  const tz = RADIUS * 0.25;
  const facades = new Facades();
  facades.add(0, 0, tz, TOWER_W, FLOORS_DONE * STOREY, TOWER_W, 0, mix(WALLS[0], opts.palette.rock, 0.2));
  for (let f = 0; f < FLOORS_FRAMED; f++) {
    const y = (FLOORS_DONE + f + 1) * STOREY;
    kit.solid.add(box(TOWER_W, 0.5, TOWER_W), CONCRETE, T(0, y - 0.5, tz));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      if (f > 2 && (i + j) % 2) continue;
      kit.solid.add(box(0.5, STOREY, 0.5), STEEL, T(-TOWER_W / 2 + (i * TOWER_W) / 3, y - STOREY, tz - TOWER_W / 2 + (j * TOWER_W) / 3));
    }
  }
  // Work lights on the open floors, and a safety net of netting down one face.
  for (let k = 0; k < kit.q(8, 4); k++) {
    const y = (FLOORS_DONE + 1 + Math.floor(rng() * FLOORS_FRAMED)) * STOREY - 1.5;
    kit.lamp(box(0.8, 0.5, 0.8), [-TOWER_W / 2 + rng() * TOWER_W, y, tz - TOWER_W / 2 + 0.5], WARM_LIGHT, 4);
  }
  kit.solid.add(box(TOWER_W, FLOORS_FRAMED * STOREY, 0.2), shade(0x2a5a8a, 0.6), T(0, FLOORS_DONE * STOREY, tz + TOWER_W / 2 + 0.3));
  // Hoarding along the track side, striped.
  const hoardZ = -RADIUS * 0.55;
  for (let i = 0; i < 16; i++) {
    const x = -RADIUS * 0.8 + (i + 0.5) * ((RADIUS * 1.6) / 16);
    kit.solid.add(box((RADIUS * 1.6) / 16, 3, 0.3), i % 2 ? SAFETY : DARK, T(x, 0, hoardZ));
  }
  for (let k = 0; k < kit.q(6, 3); k++) {
    const x = -RADIUS * 0.6 + rng() * RADIUS * 1.2;
    const z = hoardZ + 10 + rng() * 25;
    for (let l = 0; l < 3; l++) kit.solid.add(box(14, 0.7, 4), vary(rng, STEEL, 0.1), T(x, l * 0.75, z, (rng() - 0.5) * 0.3));
  }
  for (let k = 0; k < 4; k++) {
    kit.solid.add(box(12, 2.8, 3), k % 2 ? 0xe8e8e0 : SAFETY, T(RADIUS * 0.45, Math.floor(k / 2) * 2.9, tz + (k % 2) * 3.4 - 20));
    kit.lamp(box(1.6, 0.8, 0.1), [RADIUS * 0.45 + 3, Math.floor(k / 2) * 2.9 + 1.6, tz + (k % 2) * 3.4 - 21.55], WARM_LIGHT, 0);
  }
  kit.solid.add(box(RADIUS * 1.7, 0.3, RADIUS * 1.2), CONCRETE_DARK, T(0, 0, tz * 0.3));
  facades.build(kit, opts);

  // --- The cranes, rig bones posed beside the road ---
  const spanS = Math.max(0, h.s1 - h.s0);
  const nCranes = Math.max(1, Math.min(MAX_CRANES, Math.ceil(spanS / CRANE_SPACING)));
  const reach = Math.hypot(spanS / nCranes / 2, CRANE_SETBACK + (h.maxX - h.minX)) + JIB_SPARE;
  const cranes: Crane[] = [];
  for (let c = 0; c < nCranes; c++) {
    const mast = rig.bone();
    const slew = rig.bone(mast, 0, MAST_H, 0);
    const trolley = rig.bone(slew);
    const cable = rig.bone(trolley);
    buildMast(rig, mast, brace);
    buildJib(rig, slew, reach, brace);
    rig.add(box(2.2, 1.2, 2.6), SAFETY, { bone: trolley, m: T(0, -1.3, 0) });
    rig.add(box(0.12, 1, 0.12).translate(0, -0.5, 0), DARK, { bone: cable });
    rig.add(box(0.12, 1, 0.12).translate(0, -0.5, 0), DARK, { bone: cable, m: T(0, 0, 0.6) });
    cranes.push({ mast, slew, trolley, cable, s: h.s0 + ((c + 0.5) * spanS) / nCranes, yaw: Number.NaN });
  }
  // --- The loads: girder bundles (as the track scene draws them landed) and their hooks ---
  const loads: { bone: THREE.Bone; hook: THREE.Bone; wasWarn: boolean }[] = [];
  for (let i = 0; i < def.count; i++) {
    const bone = rig.bone();
    rig.add(girderBundle(), LOAD_COLOUR, { bone });
    const hook = rig.bone();
    rig.add(box(1.4, 1.6, 0.8), SAFETY, { bone: hook });
    hide(bone);
    hide(hook);
    loads.push({ bone, hook, wasWarn: false });
  }

  const LAMPS = nCranes * 3;
  const glow = ik.cloud(LAMPS, LAMPS, true, 1.6);
  const dust = ik.cloud(ik.q(260, 130), 0, false, 0.8);
  const sparks = ik.cloud(ik.q(120, 60), 0, true, 2);
  const puff = brush({ life: 2.2, size0: 4, size1: 16, c0: col(0x9a989a), c1: mix(0x9a989a, opts.palette.horizon, 0.5), alpha: 0.7, keep: 0.4, lift: 0.6 });
  const spark = brush({ life: 0.6, size0: 0.8, size1: 0.2, c0: col(0xffe0a0), c1: col(0xff6020), alpha: 1, keep: 0.6, lift: -9.8 });
  const red = col(RED_LIGHT);
  const amber = col(0xffa020);

  const items: DropItem[] = [];
  const road = new RoadFrame(bound.binding);
  const L = new THREE.Vector3();
  const M = new THREE.Vector3();
  const D = new THREE.Vector3();
  const P = new THREE.Vector3();
  const loadH = def.radius * HAZARD_ROCK_HEIGHT;

  function update(time: number, dt: number): void {
    // Masts: beside the road on the site's side, at their stretch of the dropper.
    road.at(h.s0);
    const home = road.origin.dot(road.across) > 0 ? -1 : 1;
    const edge = home > 0 ? h.maxX : h.minX;
    const k = road.unit;
    for (const c of cranes) {
      road.at(c.s);
      road.point(edge + home * CRANE_SETBACK, 0, c.mast.position);
      c.mast.scale.setScalar(k);
    }
    dropperItems(h, time, items);
    // Each crane serves the warning load nearest the end of its warning in its stretch.
    const target: (number | null)[] = cranes.map(() => null);
    items.forEach((it, i) => {
      if (it.stage !== 'warn' || it.progress >= HANG_SHARE) return;
      const c = nearestCrane(cranes, it.s);
      const cur = target[c];
      if (cur === null || items[cur].progress < it.progress) target[c] = i;
    });
    cranes.forEach((c, ci) => {
      const t = target[ci];
      let want: number;
      let radius: number;
      if (t !== null) {
        road.at(items[t].s);
        road.point(items[t].x, 0, L);
        D.subVectors(L, c.mast.position).setY(0);
        want = RoadFrame.yaw(D);
        radius = D.length() / k;
      } else {
        road.at(c.s);
        D.copy(road.across).multiplyScalar(-home);
        want = RoadFrame.yaw(D) + Math.sin(time * 0.2 + ci) * IDLE_DRIFT;
        radius = reach * 0.6;
      }
      c.yaw = Number.isNaN(c.yaw) ? want : approachAngle(c.yaw, want, SLEW_RATE * dt);
      c.slew.rotation.set(0, c.yaw, 0);
      c.trolley.position.set(Math.min(reach - 1, radius), 0, 0);
      hide(c.cable);
    });

    items.forEach((it, i) => {
      const ld = loads[i];
      if (it.stage !== 'warn') {
        if (ld.wasWarn && it.stage === 'down' && dt > 0) {
          road.at(it.s);
          road.point(it.x, 0.5, P);
          for (let q = 0; q < DUST_BURST; q++) dust.emit(puff, P.x, P.y, P.z, (rng() - 0.5) * 18, 3 + rng() * 6, (rng() - 0.5) * 18);
          for (let q = 0; q < SPARKS; q++) sparks.emit(spark, P.x, P.y + 1, P.z, (rng() - 0.5) * 20, 4 + rng() * 8, (rng() - 0.5) * 20);
        }
        ld.wasWarn = false;
        hide(ld.bone);
        hide(ld.hook);
        return;
      }
      ld.wasWarn = true;
      road.at(it.s);
      road.point(it.x, loadH / 2, L);
      const ci = nearestCrane(cranes, it.s);
      const c = cranes[ci];
      const served = target[ci] === i;
      let y: number;
      if (it.progress < HANG_SHARE) {
        if (!served) {
          hide(ld.bone);
          hide(ld.hook);
          return;
        }
        // Hoisted in under the trolley, swinging as the jib slews.
        const u = it.progress / HANG_SHARE;
        y = HANG_H + (1 - smooth01(u)) * MAST_H * 0.4;
        const sw = Math.sin(time * 2.4 + i) * SWING * (1 - u * 0.5);
        ld.bone.position.copy(L).addScaledVector(road.along, sw * k);
        ld.bone.position.y = L.y + y * k;
        // Cable from the trolley down to the hook above the load.
        rig.sync();
        rig.local(c.trolley, 0, -1.9, 0, M);
        const len = Math.max(0.1, M.y - ld.bone.position.y - loadH * k);
        c.cable.scale.set(1, len / k, 1);
        ld.hook.position.set(M.x, M.y - len, M.z);
        ld.hook.scale.setScalar(k);
        ld.hook.rotation.set(0, c.yaw, 0);
      } else {
        // Released: it falls the last stretch onto its spot.
        const u = (it.progress - HANG_SHARE) / (1 - HANG_SHARE);
        y = HANG_H * (1 - u * u);
        ld.bone.position.copy(L);
        ld.bone.position.y = L.y + y * k;
        hide(ld.hook);
      }
      ld.bone.rotation.set(0, RoadFrame.yaw(road.across) + (1 - it.progress) * Math.sin(i * 1.7) * 0.6, 0);
      ld.bone.scale.set(def.radius * k, (loadH / 2) * k, def.radius * k);
    });
    rig.sync();

    // Lamps: red on each mast top and jib tip, amber on the trolley while it carries a load.
    let li = 0;
    cranes.forEach((c, ci) => {
      rig.local(c.slew, 0, 8, 0, P);
      glow.lamp(li++, P.x, P.y, P.z, 3, red, (Math.sin(time * 3 + ci) > 0 ? 0.9 : 0.15) * boost);
      rig.local(c.slew, reach, 1.2, 0, P);
      glow.lamp(li++, P.x, P.y, P.z, 3, red, 0.8 * boost);
      rig.local(c.trolley, 0, -2.2, 0, P);
      glow.lamp(li++, P.x, P.y, P.z, 2.5, amber, target[ci] !== null && Math.sin(time * 9) > 0 ? boost : 0.05);
    });
  }

  return ik.finish(RADIUS, RADIUS + reach * 2, MAST_H + 12, update);
}

function nearestCrane(cranes: readonly Crane[], s: number): number {
  let best = 0;
  for (let c = 1; c < cranes.length; c++) if (Math.abs(cranes[c].s - s) < Math.abs(cranes[best].s - s)) best = c;
  return best;
}

/** Turns `from` toward `to` (radians, the short way) by at most `step`. */
function approachAngle(from: number, to: number, step: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + Math.max(-step, Math.min(step, d));
}

/** A square lattice mast from the ground to the slewing ring, braced on all four faces. */
function buildMast(rig: RigKit['rig'], bone: THREE.Bone, brace: number): void {
  const w = MAST_W / 2;
  for (const [x, z] of [[-w, -w], [w, -w], [w, w], [-w, w]] as const) rig.add(box(0.35, MAST_H, 0.35), SAFETY, { bone, m: T(x, 0, z) });
  for (let y = 0; y < MAST_H; y += brace) {
    const faces: [V3, V3][] = [
      [[-w, y, -w], [w, y + brace, -w]],
      [[w, y, -w], [w, y + brace, w]],
      [[w, y, w], [-w, y + brace, w]],
      [[-w, y, w], [-w, y + brace, -w]],
    ];
    for (const [a, b] of faces) rig.add(beam(a, b, 0.12), SAFETY, { bone });
  }
  rig.add(box(MAST_W + 3, 1, MAST_W + 3), CONCRETE, { bone, m: T(0, -0.6, 0) });
}

/** Slewing unit, cab, the jib along +X (triangular lattice), counter-jib with its weights, the peak. */
function buildJib(rig: RigKit['rig'], bone: THREE.Bone, reach: number, brace: number): void {
  rig.add(prism(2.2, 2.2, 2, 8), DARK, { bone });
  rig.add(box(3, 2.6, 2.4), shade(SAFETY, 0.9), { bone, m: T(1.5, 0.4, 1.8) });
  rig.add(box(0.1, 1.2, 2), mix(0x3a5a78, WARM_LIGHT, 0.3), { bone, layer: 'glow', m: T(3.05, 1.4, 1.8) });
  const chord = (z: number, y: number) => rig.add(box(reach, 0.3, 0.3).translate(reach / 2, 0, 0), SAFETY, { bone, m: T(0, y, z) });
  chord(-0.9, 2);
  chord(0.9, 2);
  chord(0, 3.6);
  for (let x = 0; x < reach - brace / 2; x += brace) {
    for (const z of [-0.9, 0.9]) rig.add(beam([x, 2, z], [x + brace / 2, 3.6, 0], 0.08), SAFETY, { bone });
    for (const z of [-0.9, 0.9]) rig.add(beam([x + brace / 2, 3.6, 0], [x + brace, 2, z], 0.08), SAFETY, { bone });
  }
  rig.add(box(COUNTER_JIB, 0.8, 2.2).translate(-COUNTER_JIB / 2, 0, 0), shade(SAFETY, 0.85), { bone, m: T(0, 2, 0) });
  for (let k = 0; k < 3; k++) rig.add(box(2, 3.4, 2.4), CONCRETE, { bone, m: T(-COUNTER_JIB + 2 + k * 2.2, -1, 0) });
  // The peak and its ties to both jibs.
  rig.add(box(0.6, 8, 0.6), SAFETY, { bone, m: T(0, 2, 0) });
  rig.add(beam([0, 10, 0], [reach * 0.7, 3.6, 0], 0.07), DARK, { bone });
  rig.add(beam([0, 10, 0], [-COUNTER_JIB + 1, 2.4, 0], 0.07), DARK, { bone });
}
