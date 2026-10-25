// The blast door: an airlock frame straddling the deck, its pylons outside the hard boundaries
// and a lintel over the road, the airlock module hung beside it. Bound as a blocker, its two
// armoured leaves ARE the barrier (render/track/landmarks.ts DRAWS_OWN_BARRIER): they wait in
// the pylons while the beacons flash through the warning, slam across in its last moments to
// cover the blocked spans exactly, and slide home as soon as the door is up again, so the gap
// a racer sees is the gap they can fly through.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { blockerStage } from '../../../core/hazards.ts';
import { T } from '../b/shapes.ts';
import { col, glowBoost } from '../a/kit.ts';
import { AMBER, DARK, FRAME, HAZARD, HULL, RED_LIGHT, RigKit, RoadFrame, bindHazard, blockedSpans, box, brace, hide, hullModule, poseBrace, smooth01 } from './kit.ts';

const SALT = 0xb1a57;
const RADIUS = 22;
/** The pylons stand this far outside the drivable width, and are this wide across the road. */
const PYLON_OUT = 2.5;
const PYLON_W = 3;
/** Depth of the frame along the road, and the lintel's clearance over the leaves. */
const FRAME_D = 5;
const LINTEL_CLEAR = 3;
const LINTEL_H = 2.4;
/** The pylons reach this far under the deck: the frame is bolted through it. */
const UNDER = 6;
/** The leaves slam shut over this last share of the warning and slide home over this share of the idle time. */
const SLAM_SECONDS = 0.35;
const OPEN_SECONDS = 0.35;
/** Beacons flash this fast through the warning. */
const FLASH_HZ = 3;

export function createBlastDoor(opts: LandmarkOptions): Landmark {
  const ik = new RigKit(opts, SALT);
  const { rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('blastDoor', opts, ['blocker'] as const, {
    def: { type: 'blocker', id: 'free', at: 0, opening: 10, offset: 2, height: 8, warn: 3, up: 5, period: 14, phase: 0 },
    roadZ: -RADIUS * 1.6,
    lateral: -1,
    minX: -12,
    maxX: 12,
  });
  const def = bound.def;
  const h = bound.hazard;
  const boost = glowBoost(opts.palette);
  const accent = opts.palette.accent;

  // --- The airlock module beside the frame, hung at deck level, its hatch facing the road ---
  hullModule(kit, 0, 7, 0, RADIUS * 1.2, 14, RADIUS * 0.9, accent);
  kit.solid.add(box(6, 8, 0.4), DARK, T(0, -1, -RADIUS * 0.45 - 0.2));
  for (const x of [-3.4, 3.4]) kit.lights.add(box(0.3, 8, 0.5), HAZARD, T(x, -1, -RADIUS * 0.45 - 0.25));
  kit.solid.add(box(RADIUS * 0.5, 6, RADIUS * 0.5), FRAME, T(0, -10, 0));

  // --- The frame, posed from the road: two pylons and the lintel (unit parts, scaled) ---
  const pylons = [rig.bone(), rig.bone()];
  for (const bone of pylons) {
    rig.add(box(1, 1, 1).translate(0, 0.5, 0), HULL, { bone });
    rig.add(box(1.04, 0.06, 1.04).translate(0, 0.25, 0), HAZARD, { bone, layer: 'glow' });
  }
  const lintel = rig.bone();
  rig.add(box(1, 1, 1).translate(0, 0.5, 0), HULL, { bone: lintel });
  rig.add(box(1.002, 0.25, 1.02).translate(0, 0.1, 0), HAZARD, { bone: lintel, layer: 'glow' });
  const strut = brace(rig);

  // --- The leaves: one per blocked span, armour plate with hazard chevrons along the edge ---
  const leaves = [rig.bone(), rig.bone()];
  for (const bone of leaves) {
    rig.add(box(1, 1, 1).translate(0, 0.5, 0), FRAME, { bone });
    rig.add(box(1.02, 0.16, 1.04).translate(0, 0.62, 0), HAZARD, { bone, layer: 'glow' });
    rig.add(box(1.02, 0.08, 1.04).translate(0, 0.94, 0), RED_LIGHT, { bone, layer: 'glow' });
  }

  const LAMPS = 4;
  const glow = ik.cloud(LAMPS, LAMPS, true, 1.6);
  const red = col(RED_LIGHT);
  const amber = col(AMBER);
  const road = new RoadFrame(bound.binding);
  const P = new THREE.Vector3();
  const Q = new THREE.Vector3();

  function update(time: number): void {
    road.at(h.s0);
    const k = road.unit;
    const yaw = RoadFrame.yaw(road.across);
    const top = def.height + LINTEL_CLEAR;
    const lo = h.minX - PYLON_OUT - PYLON_W / 2;
    const hi = h.maxX + PYLON_OUT + PYLON_W / 2;
    [lo, hi].forEach((x, i) => {
      road.point(x, -UNDER, pylons[i].position);
      pylons[i].rotation.set(0, yaw, 0);
      pylons[i].scale.set(PYLON_W * k, (top + LINTEL_H + UNDER) * k, FRAME_D * k);
    });
    road.point((lo + hi) / 2, top, lintel.position);
    lintel.rotation.set(0, yaw, 0);
    lintel.scale.set((hi - lo + PYLON_W) * k, LINTEL_H * k, FRAME_D * k);
    // The module is bolted to the near pylon.
    const home = road.origin.dot(road.across) > 0 ? -1 : 1;
    road.point(home > 0 ? hi : lo, 2, Q);
    poseBrace(strut, P.set(0, 2, -RADIUS * 0.45), Q, 1.4, k);

    // The leaves: home in the pylons, or across their spans.
    const st = blockerStage(def, time);
    let shut = 0;
    if (st.stage === 'down') shut = 1;
    else if (st.stage === 'warn') shut = smooth01(1 - ((1 - st.progress) * def.warn) / SLAM_SECONDS);
    else shut = 1 - smooth01((st.progress * (def.period - def.warn - def.up)) / OPEN_SECONDS);
    const spans = blockedSpans(h);
    leaves.forEach((bone, i) => {
      const span = spans.find(([a]) => (i === 0 ? a <= h.minX + 0.01 : a > h.minX + 0.01));
      if (!span || shut <= 0) {
        hide(bone);
        return;
      }
      const [a, b] = span;
      // The leaf slides out of its pylon: its outer end stays at the pylon, its inner edge travels.
      const outer = i === 0 ? a : b;
      const inner = outer + (i === 0 ? 1 : -1) * (b - a) * shut;
      road.point((outer + inner) / 2, 0, bone.position);
      bone.rotation.set(0, yaw, 0);
      bone.scale.set(Math.max(0.01, Math.abs(inner - outer)) * k, def.height * k, (FRAME_D * 0.6) * k);
    });
    rig.sync();

    // Beacons on the lintel: red flashing through the warning and while shut, amber at rest.
    const warn = st.stage !== 'idle';
    const flash = Math.sin(time * Math.PI * 2 * FLASH_HZ) > 0;
    let li = 0;
    for (const x of [lo, hi]) {
      for (const along of [-1, 1]) {
        road.point(x, top + LINTEL_H + 0.6, P).addScaledVector(road.along, (along * FRAME_D * k) / 2);
        glow.lamp(li++, P.x, P.y, P.z, 2.5, warn ? red : amber, (warn ? (flash ? 1 : 0.1) : 0.35) * boost);
      }
    }
  }

  return ik.finish(RADIUS, RADIUS * 4, 40, (time) => update(time));
}
