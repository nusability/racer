// The docking arm: a berth module hung beside the deck with its cargo arm cantilevered out over
// the road on a gantry rail. Bound as a sweeper, the arm's carriage runs the rail and its clamp
// head, a container gripped in its jaws, IS the collision cylinder: the head's half-width is
// the hazard's radius and its centre is at sweeperX, from the deck up to the hazard's height.
// The rail runs from the berth past the far parking spot; amber lamps along it run ahead of the
// carriage while it moves, and the berth's beacons flash before it sets off.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { sweeperX } from '../../../core/hazards.ts';
import { T } from '../b/shapes.ts';
import { col, glowBoost } from '../a/kit.ts';
import { AMBER, DARK, FRAME, HAZARD, HULL, RED_LIGHT, RigKit, RoadFrame, bindHazard, box, brace, hullModule, poseBrace, prism } from './kit.ts';

const SALT = 0xd0c4a;
const RADIUS = 30;
/** The rail rides this far over the head's top; its section, and how far it runs past the travel. */
const RAIL_OVER = 5;
const RAIL_H = 2.2;
const RAIL_D = 3;
const RAIL_PAST = 10;
/** The head: an octagonal clamp round its container (sides of the prism). */
const HEAD_SIDES = 8;
/** Lamps strung along the rail. */
const RAIL_LAMPS = 8;
/** The berth's beacons flash this long before the arm sets off. */
const WARN_LEAD = 2;
const FLASH_HZ = 3;
/** Rail lamps chase in this many waves along the rail, this many waves a second, each lit this share of its wave. */
const CHASE_WAVES = 4;
const CHASE_RATE = 2;
const CHASE_ON = 0.3;

export function createDockingArm(opts: LandmarkOptions): Landmark {
  const ik = new RigKit(opts, SALT);
  const { rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('dockingArm', opts, ['sweeper'] as const, {
    def: { type: 'sweeper', id: 'free', at: 0, radius: 6, height: 7, xFrom: 30, xTo: -30, cross: 3.5, hold: 1, period: 14, phase: 0 },
    roadZ: -RADIUS * 1.8,
    lateral: -1,
    minX: -12,
    maxX: 12,
  });
  const def = bound.def;
  const h = bound.hazard;
  const boost = glowBoost(opts.palette);
  const accent = opts.palette.accent;

  // --- The berth: a docking module with its collar facing the road, a crane house on top ---
  hullModule(kit, 0, 6, 0, RADIUS * 1.1, 16, RADIUS * 0.9, accent);
  kit.solid.add(prism(RADIUS * 0.28, RADIUS * 0.28, 4, 12).rotateX(Math.PI / 2), FRAME, T(0, -2, -RADIUS * 0.45 - 2));
  kit.solid.add(prism(RADIUS * 0.2, RADIUS * 0.2, 4.2, 12).rotateX(Math.PI / 2), DARK, T(0, -2, -RADIUS * 0.45 - 2.1));
  kit.solid.add(box(RADIUS * 0.6, 7, RADIUS * 0.5), HULL, T(RADIUS * 0.15, 6, RADIUS * 0.1));
  kit.lights.add(box(RADIUS * 0.5, 1, 0.3), accent, T(RADIUS * 0.15, 8, -RADIUS * 0.15 - 0.2));
  kit.solid.add(box(RADIUS * 0.4, 8, RADIUS * 0.4), FRAME, T(-RADIUS * 0.2, -14, 0));

  // --- The rail (a unit beam along +X, scaled to the run), the carriage, the arm and its head ---
  const rail = rig.bone();
  rig.add(box(1, 1, 1).translate(0.5, 0, 0), FRAME, { bone: rail });
  rig.add(box(1, 0.1, 1.04).translate(0.5, -0.46, 0), HAZARD, { bone: rail, layer: 'glow' });
  const carriage = rig.bone();
  rig.add(box(1, 0.5, 1.3), HULL, { bone: carriage, m: T(0, 0.75, 0) });
  // The arm: a telescoping strut from the carriage to the head's top (scaled in y each frame).
  const arm = rig.bone();
  rig.add(box(0.5, 1, 0.5).translate(0, -0.5, 0), FRAME, { bone: arm });
  // The head: unit radius and height, scaled to the hazard's.
  const head = rig.bone();
  rig.add(prism(1, 1, 1, HEAD_SIDES).translate(0, 0.5, 0), DARK, { bone: head });
  rig.add(box(1.3, 0.62, 0.9).translate(0, 0.42, 0), accent, { bone: head });
  rig.add(prism(1.02, 1.02, 0.08, HEAD_SIDES).translate(0, 0.96, 0), HAZARD, { bone: head, layer: 'glow' });
  rig.add(prism(1.02, 1.02, 0.06, HEAD_SIDES).translate(0, 0.08, 0), RED_LIGHT, { bone: head, layer: 'glow' });
  const strut = brace(rig);

  const glow = ik.cloud(RAIL_LAMPS + 2, RAIL_LAMPS + 2, true, 1.6);
  const red = col(RED_LIGHT);
  const amber = col(AMBER);
  const road = new RoadFrame(bound.binding);
  const P = new THREE.Vector3();
  const Q = new THREE.Vector3();
  let prevX = Number.NaN;

  function update(time: number, dt: number): void {
    road.at(h.s0);
    const k = road.unit;
    const yaw = RoadFrame.yaw(road.across);
    const x = sweeperX(def, time);
    const moving = dt > 0 && Number.isFinite(prevX) && Math.abs(x - prevX) > 1e-3;
    prevX = x;
    const lo = Math.min(def.xFrom, def.xTo) - def.radius - RAIL_PAST;
    const hi = Math.max(def.xFrom, def.xTo) + def.radius + RAIL_PAST;
    const railY = def.height + RAIL_OVER;
    road.point(lo, railY, rail.position);
    rail.rotation.set(0, yaw, 0);
    rail.scale.set((hi - lo) * k, RAIL_H * k, RAIL_D * k);
    road.point(x, railY - RAIL_H / 2 - 0.5, carriage.position);
    carriage.rotation.set(0, yaw, 0);
    carriage.scale.set(def.radius * 2 * k, k, RAIL_D * k);
    road.point(x, railY - RAIL_H / 2 - 0.5, arm.position);
    arm.rotation.set(0, yaw, 0);
    arm.scale.set(def.radius * k, (RAIL_OVER - RAIL_H / 2 - 0.5) * k, def.radius * k);
    road.point(x, 0, head.position);
    head.rotation.set(0, yaw, 0);
    head.scale.set(def.radius * k, def.height * k, def.radius * k);
    // The berth holds the rail's near end.
    const home = road.origin.dot(road.across) > 0 ? -1 : 1;
    road.point(home > 0 ? hi : lo, railY, Q);
    poseBrace(strut, P.set(0, 4, 0), Q, 2, k);
    rig.sync();

    // Beacons on the berth flash before and while the arm moves; rail lamps chase toward it.
    const soon = sweeperX(def, time + WARN_LEAD) !== x;
    const warn = moving || soon;
    const flash = Math.sin(time * Math.PI * 2 * FLASH_HZ) > 0;
    let li = 0;
    for (const z of [-1, 1]) {
      rig.local(head, z * 0.9, 1.1, 0, P);
      glow.lamp(li++, P.x, P.y, P.z, 2.5, red, (warn && flash ? 1 : 0.15) * boost);
    }
    for (let i = 0; i < RAIL_LAMPS; i++) {
      const u = (i + 0.5) / RAIL_LAMPS;
      road.point(lo + (hi - lo) * u, railY - RAIL_H / 2 - 0.2, P);
      const chase = u * CHASE_WAVES - time * CHASE_RATE;
      glow.lamp(li++, P.x, P.y, P.z, 1.6, amber, (warn ? (chase - Math.floor(chase) < CHASE_ON ? 0.9 : 0.15) : 0.08) * boost);
    }
  }

  return ik.finish(RADIUS, RADIUS * 6, 50, update);
}
