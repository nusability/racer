// The maglev: a sleek double-ended transit pod on a guideway that crosses the course at grade.
// It waits in a glass-roofed station beside the road, then shoots across on its schedule, a
// cyan light trail streaming behind it, while a gantry over the approach flashes red. Bound as
// a sweeper, the pod IS the collision cylinder: its half-length is the hazard's radius and its
// centre is at sweeperX. The guideway, the station at the parking end and the portal at the
// far end are posed from the road each frame; the transit hub behind is static.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { sweeperX } from '../../../core/hazards.ts';
import { T, box, mix, prism, shade } from '../b/shapes.ts';
import { col, glowBoost } from '../a/kit.ts';
import { CONCRETE, CONCRETE_DARK, CYAN, DARK, Facades, GLASS, RED_LIGHT, RigKit, RoadFrame, STEEL, WALLS, WHITE, bindHazard } from './kit.ts';

const SALT = 0x3a61e;
const RADIUS = 90;
/** The pod's design half-length; it is scaled so this matches the collision radius. */
const POD_R = 7;
const POD_W = 3.2;
const POD_H = 3.6;
/** The guideway runs this far past each end of the pod's travel, metres. */
const GUIDE_PAST = 20;
/** Station platform length and the guideway's run on past it into the portal. */
const STATION_L = 34;
const PORTAL_OUT = 46;
/** The warning gantry stands this far before the crossing, and its height over the road. */
const GANTRY_BACK = 30;
const GANTRY_H = 9;
/** Pod lifts this far off the guideway while moving (it levitates), and its rest height. */
const HOVER = 0.35;
const REST = 0.12;
/** Light trail: length per m/s of pod speed, longest trail, metres. */
const TRAIL_PER_SPEED = 0.45;
const TRAIL_MAX = 40;
/** The gantry flashes this long before the pod moves (matches the track's sweeper beacons). */
const WARN_LEAD = 2;
const FLASH_HZ = 3;

export function createMaglev(opts: LandmarkOptions): Landmark {
  const ik = new RigKit(opts, SALT);
  const { rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('maglev', opts, ['sweeper'] as const, {
    def: { type: 'sweeper', id: 'free', at: 0, radius: 7, height: 5, xFrom: 45, xTo: -45, cross: 3, hold: 2, period: 14, phase: 0 },
    roadZ: -RADIUS * 0.85,
    lateral: -1,
    minX: -12,
    maxX: 12,
  });
  const def = bound.def;
  const boost = glowBoost(opts.palette);
  const accent = opts.palette.accent;

  // --- The transit hub behind: a lit block with a glass hall and the line's name in neon ---
  const facades = new Facades();
  facades.add(0, 0, RADIUS * 0.35, 70, 26, 34, 0, mix(WALLS[1], opts.palette.rock, 0.2));
  facades.add(-RADIUS * 0.55, 0, RADIUS * 0.1, 26, 48, 26, 0.3, mix(WALLS[3], opts.palette.rock, 0.2));
  kit.solid.add(box(46, 14, 10), GLASS, T(0, 0, RADIUS * 0.35 - 21));
  kit.lights.add(box(44, 0.6, 10.4), shade(CYAN, 0.8), T(0, 14, RADIUS * 0.35 - 21));
  kit.lights.add(box(30, 3, 0.4), CYAN, T(0, 20, RADIUS * 0.35 - 17.3), undefined, { depth: 0.25, freq: 1.2, phase: 0 });
  kit.solid.add(box(RADIUS * 1.6, 0.3, RADIUS * 0.9), CONCRETE_DARK, T(0, 0, RADIUS * 0.1));
  facades.build(kit, opts);

  // --- The pod: double-ended, so it never has to turn round ---
  const pod = rig.bone();
  const P = { bone: pod };
  rig.add(box(10, POD_H - 1, POD_W), WHITE, { ...P, m: T(0, 0.9, 0) });
  for (const end of [-1, 1]) {
    // Wedge noses tapering to a blade, a headlight bar in each.
    rig.add(new THREE.CylinderGeometry(0.15, 1, 2, 4, 1).rotateZ(-end * Math.PI / 2).rotateX(Math.PI / 4).scale(1, (POD_H - 1) / 1.4, POD_W / 1.4), WHITE, { ...P, m: T(end * 6, 0.9 + (POD_H - 1) / 2, 0) });
    rig.add(box(0.3, 0.4, POD_W * 0.7), 0xfff6e0, { ...P, layer: 'glow', m: T(end * 6.2, 1.6, 0) });
  }
  rig.add(box(10.1, 0.7, POD_W + 0.1), GLASS, { ...P, m: T(0, 2.3, 0) });
  rig.add(box(12.6, 0.25, POD_W + 0.12), CYAN, { ...P, layer: 'glow', m: T(0, 1.5, 0) });
  rig.add(box(12, 0.8, POD_W * 0.8), DARK, { ...P, m: T(0, 0, 0) });
  rig.add(box(12, 0.12, POD_W * 0.7), shade(accent, 1), { ...P, layer: 'glow', m: T(0, -0.05, 0) });
  // The light trail: a unit streak along −X from the pod's tail, stretched with its speed.
  const trail = rig.bone();
  rig.add(box(1, 0.5, 0.8).translate(-0.5, 0, 0), CYAN, { bone: trail, layer: 'glow' });
  rig.add(box(1, 0.25, 2.6).translate(-0.5, 0, 0), shade(CYAN, 0.45), { bone: trail, layer: 'glow', m: T(0, -0.6, 0) });

  // --- The guideway: a unit strip along +X (scaled to the whole run), dark with lit rails ---
  const guide = rig.bone();
  rig.add(box(1, 0.12, 1).translate(0.5, 0, 0), DARK, { bone: guide });
  for (const z of [-0.42, 0.42]) rig.add(box(1, 0.14, 0.06).translate(0.5, 0, 0), CYAN, { bone: guide, layer: 'glow', m: T(0, 0.02, z) });

  // --- The station at the parking end (+X points away from the road) ---
  const station = rig.bone();
  const S = { bone: station };
  for (const side of [-1, 1]) {
    const z = side * (POD_W / 2 + 2.6);
    rig.add(box(STATION_L, 1, 4.4), CONCRETE, { ...S, m: T(0, 0, z) });
    rig.add(box(STATION_L, 0.15, 0.3), 0xffd020, { ...S, layer: 'glow', m: T(0, 1.02, z - side * 2) });
    for (let k = 0; k < 4; k++) rig.add(prism(0.3, 0.3, 8, 6), STEEL, { ...S, m: T(-STATION_L / 2 + 2 + (k * (STATION_L - 4)) / 3, 1, z + side * 1.6) });
  }
  rig.add(box(STATION_L + 4, 0.4, POD_W + 14), mix(GLASS, CYAN, 0.25), { ...S, m: T(0, 9, 0) });
  rig.add(box(STATION_L + 4, 0.3, 0.4), CYAN, { ...S, layer: 'glow', m: T(0, 9.4, POD_W / 2 + 7) });
  rig.add(box(STATION_L + 4, 0.3, 0.4), CYAN, { ...S, layer: 'glow', m: T(0, 9.4, -POD_W / 2 - 7) });
  // The portal the guideway runs into past the station.
  rig.add(box(10, 16, POD_W + 18), CONCRETE_DARK, { ...S, m: T(PORTAL_OUT, 0, 0) });
  rig.add(box(0.2, POD_H + 1.5, POD_W + 1.5), 0x050608, { ...S, m: T(PORTAL_OUT - 5.05, 0, 0) });
  rig.add(box(0.3, 0.5, POD_W + 2.5), shade(accent, 1), { ...S, layer: 'glow', m: T(PORTAL_OUT - 5.1, POD_H + 1.6, 0) });
  // A buffer at the far end of the run (+X points away from the road on that side).
  const buffer = rig.bone();
  rig.add(box(3, 3, POD_W + 2), CONCRETE_DARK, { bone: buffer });
  rig.add(box(0.3, 0.6, POD_W + 2.2), 0xffd020, { bone: buffer, layer: 'glow', m: T(-1.55, 2.2, 0) });

  // --- The gantry over the approach: legs at the road edges, a red strip that flashes ---
  const gantry = rig.bone();
  for (const z of [-0.5, 0.5]) rig.add(box(0.06, 1, 0.06).translate(0, 0.5, 0), STEEL, { bone: gantry, m: T(0, 0, z) });
  rig.add(box(0.08, 0.1, 1.04), DARK, { bone: gantry, m: T(0, 1, 0) });
  const strip = rig.bone(gantry);
  rig.add(box(0.1, 0.05, 0.9), RED_LIGHT, { bone: strip, layer: 'glow', m: T(-0.05, 1, 0) });

  const LAMPS = 4;
  const glow = ik.cloud(LAMPS, LAMPS, true, 1.6);
  const red = col(RED_LIGHT);
  const white = col(0xfff6e0);

  const h = bound.hazard;
  const road = new RoadFrame(bound.binding);
  const A = new THREE.Vector3();
  const D = new THREE.Vector3();
  let prevX = Number.NaN;
  let dir = Math.sign(def.xTo - def.xFrom) || 1;

  function update(time: number, dt: number): void {
    road.at(h.s0);
    const k = road.unit;
    const x = sweeperX(def, time);
    const v = dt > 0 && Number.isFinite(prevX) ? (x - prevX) / dt : 0;
    prevX = x;
    if (v !== 0) dir = Math.sign(v);
    const moving = Math.abs(v) > 0.5;
    const s = (def.radius / POD_R) * k;
    const yaw = RoadFrame.yaw(road.across);
    road.point(x, moving ? HOVER : REST, pod.position);
    pod.rotation.set(0, yaw, 0);
    pod.scale.setScalar(s);
    // The trail streams from the tail, longer the faster it goes.
    const len = Math.min(TRAIL_MAX, Math.abs(v) * TRAIL_PER_SPEED);
    road.point(x - dir * def.radius, 1.5 * s / k + (moving ? HOVER : REST), trail.position);
    trail.rotation.set(0, RoadFrame.yaw(D.copy(road.across).multiplyScalar(dir)), 0);
    trail.scale.set(len > 0.5 ? len * k : 0, s, s);

    // The guideway spans the whole run, both ends past the travel.
    const lo = Math.min(def.xFrom, def.xTo) - def.radius - GUIDE_PAST;
    const hi = Math.max(def.xFrom, def.xTo) + def.radius + GUIDE_PAST;
    road.point(lo, 0.05, guide.position);
    guide.rotation.set(0, yaw, 0);
    guide.scale.set((hi - lo) * k, s, POD_W * s);
    // Station at the parking end, buffer at the other, each facing away from the road.
    const out = Math.sign(def.xFrom - def.xTo) || 1;
    road.point(def.xFrom + out * (STATION_L / 2 - def.radius), 0, station.position);
    station.rotation.set(0, RoadFrame.yaw(D.copy(road.across).multiplyScalar(out)), 0);
    station.scale.setScalar(k);
    road.point(def.xTo - out * (def.radius + GUIDE_PAST - 1.5), 0, buffer.position);
    buffer.rotation.set(0, RoadFrame.yaw(D.copy(road.across).multiplyScalar(-out)), 0);
    buffer.scale.setScalar(k);
    // The gantry before the crossing: across the drivable width, facing the racers.
    road.point((h.minX + h.maxX) / 2, 0, gantry.position).addScaledVector(road.along, -GANTRY_BACK * k);
    gantry.rotation.set(0, yaw + Math.PI / 2, 0);
    gantry.scale.set(k * 6, GANTRY_H * k, (h.maxX - h.minX + 4) * k);
    const soon = sweeperX(def, time + WARN_LEAD) !== def.xFrom;
    const warn = moving || soon || x !== def.xFrom;
    const flash = Math.sin(time * Math.PI * 2 * FLASH_HZ) > 0;
    strip.scale.setScalar(warn && flash ? 1 : 0);
    rig.sync();

    // Lamps: the gantry ends flashing, the pod's two headlights.
    let li = 0;
    for (const z of [-0.5, 0.5]) {
      rig.local(gantry, 0, 1.05, z, A);
      glow.lamp(li++, A.x, A.y, A.z, 3, red, warn && !flash ? boost : 0.05);
    }
    for (const end of [-1, 1]) {
      rig.local(pod, end * 6.4, 1.6, 0, A);
      glow.lamp(li++, A.x, A.y, A.z, 5, white, (0.25 + 0.5 * opts.palette.dusk) * boost);
    }
  }
  return ik.finish(RADIUS, RADIUS * 2, 60, update);
}
