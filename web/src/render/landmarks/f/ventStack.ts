// The vent stack: a coolant manifold hung beside the deck, its line running along the road edge
// over the whole gust and a row of nozzles turned across the road. Bound as a gust, it IS the
// push: through the warning the nozzles' lamps go amber and wisps leak out; while the gust
// blows, every nozzle jets a plume of vapour across the deck in the push's direction, as dense
// as the push is strong. It must stand on the side the gust blows from (it fails loud if not).

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { gustStrength } from '../../../core/hazards.ts';
import { T } from '../b/shapes.ts';
import { brush, col, glowBoost, mix } from '../a/kit.ts';
import { AMBER, FRAME, HAZARD, HULL, RigKit, RoadFrame, bindHazard, box, brace, hullModule, poseBrace, prism } from './kit.ts';

const SALT = 0x7e475;
const RADIUS = 18;
/** A nozzle every this many metres along the gust; the line runs this far outside the road edge. */
const NOZZLE_EVERY = 40;
const MAX_NOZZLES = 9;
const LINE_OUT = 2;
const LINE_R = 0.9;
/** Nozzles aim across the road at this height. */
const NOZZLE_H = 2.5;
/** Seconds before the gust that the lamps warn and the wisps start. */
const WARN_LEAD = 1.2;
/** Plume: particles per nozzle per second at full push, and their speed across (m/s). */
const PLUME_RATE = 40;
const PLUME_SPEED = 38;
/** Vapour: near-white, cooled toward the palette's accent as it thins. */
const VAPOUR = 0xe8f4ff;

export function createVentStack(opts: LandmarkOptions): Landmark {
  const ik = new RigKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('ventStack', opts, ['gust'] as const, {
    def: { type: 'gust', id: 'free', from: 0, to: 0, strength: 8, on: 4, period: 10, phase: 0 },
    roadZ: -RADIUS * 1.8,
    lateral: 1,
    minX: -12,
    maxX: 12,
    span: RADIUS * 8,
  });
  const def = bound.def;
  const h = bound.hazard;
  const boost = glowBoost(opts.palette);
  const accent = opts.palette.accent;

  // --- The manifold module and its stacks ---
  hullModule(kit, 0, 4, 0, RADIUS * 1.2, 12, RADIUS * 0.8, accent);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * RADIUS * 0.4;
    kit.solid.add(prism(1.6, 1.3, 14, 10), HULL, T(x, 4, RADIUS * 0.1));
    kit.solid.add(prism(1.7, 1.7, 0.6, 10), HAZARD, T(x, 11, RADIUS * 0.1));
  }
  kit.solid.add(box(RADIUS * 0.4, 6, RADIUS * 0.4), FRAME, T(0, -11, 0));

  // --- The line along the road edge and its nozzles, posed from the road ---
  const span = Math.max(0, h.s1 - h.s0);
  const count = Math.max(1, Math.min(MAX_NOZZLES, Math.round(span / NOZZLE_EVERY) + 1));
  const line = rig.bone();
  rig.add(prism(1, 1, 1, 8).rotateZ(Math.PI / 2).translate(0.5, 0, 0), FRAME, { bone: line });
  const nozzles: THREE.Bone[] = [];
  for (let i = 0; i < count; i++) {
    const bone = rig.bone();
    // Unit nozzle pointing along +X (across the road), on a riser from the line.
    rig.add(box(0.6, NOZZLE_H, 0.6).translate(0, -NOZZLE_H / 2, 0), FRAME, { bone });
    rig.add(prism(0.9, 0.6, 2.4, 8).rotateZ(-Math.PI / 2).translate(1.2, 0, 0), HULL, { bone });
    rig.add(prism(0.95, 0.95, 0.3, 8).rotateZ(-Math.PI / 2).translate(0.2, 0, 0), HAZARD, { bone, layer: 'glow' });
    nozzles.push(bone);
  }
  const strut = brace(rig);

  const glow = ik.cloud(count, count, true, 1.6);
  const plume = ik.cloud(ik.q(900, 450), 0, false, 0.7);
  const jet = brush({ life: 1.1, size0: 1.6, size1: 9, c0: col(VAPOUR), c1: mix(VAPOUR, accent, 0.35), alpha: 0.55, keep: 0.5, lift: 0.4 });
  const wisp = brush({ life: 0.9, size0: 0.8, size1: 3, c0: col(VAPOUR), c1: col(VAPOUR), alpha: 0.3, keep: 0.4, lift: 0.8 });
  const amber = col(AMBER);
  const road = new RoadFrame(bound.binding);
  const P = new THREE.Vector3();
  const Q = new THREE.Vector3();
  const D = new THREE.Vector3();
  let acc = 0;
  let checked = false;

  function update(time: number, dt: number): void {
    road.at(h.s0);
    const k = road.unit;
    const home = road.origin.dot(road.across) > 0 ? -1 : 1;
    // A gust pushes toward +x when its strength is positive, so it blows from the −x side.
    if (!checked && !bound.free) {
      checked = true;
      if (Math.sign(def.strength) === home) throw new Error(`ventStack: gust ${def.id} blows toward the side the vent stands on; place it on the other side`);
    }
    const edge = (home > 0 ? h.maxX : h.minX) + home * LINE_OUT;
    road.point(edge, -LINE_R, P);
    road.at(h.s1);
    road.point(edge, -LINE_R, Q);
    poseBrace(line, P, Q, LINE_R * 2, k);
    road.at((h.s0 + h.s1) / 2);
    road.point(edge, -LINE_R, Q);
    poseBrace(strut, P.set(0, 0, -RADIUS * 0.4), Q, 1.2, k);
    nozzles.forEach((bone, i) => {
      road.at(h.s0 + (count === 1 ? span / 2 : (span * i) / (count - 1)));
      road.point(edge, NOZZLE_H, bone.position);
      bone.rotation.set(0, RoadFrame.yaw(D.copy(road.across).multiplyScalar(-home)), 0);
      bone.scale.setScalar(k);
    });
    rig.sync();

    const push = Math.abs(gustStrength(def, time) / def.strength);
    const soon = push === 0 && Math.abs(gustStrength(def, time + WARN_LEAD)) > 0;
    nozzles.forEach((bone, i) => {
      rig.local(bone, 0.4, 1.1, 0, P);
      glow.lamp(i, P.x, P.y, P.z, 2, amber, (push > 0 || soon ? (Math.sin(time * 18 + i) > 0 ? 1 : 0.3) : 0.08) * boost);
    });
    if (dt <= 0) return;
    // The plume, or the warning's wisps.
    acc += dt * PLUME_RATE * (push > 0 ? push : soon ? 0.2 : 0);
    while (acc >= 1) {
      acc -= 1;
      const bone = nozzles[Math.floor(rng() * count)];
      rig.local(bone, 2.4, 0, 0, P);
      D.copy(road.across).multiplyScalar(-home);
      const v = (push > 0 ? PLUME_SPEED * (0.6 + 0.4 * push) : 4) * k;
      plume.emit(push > 0 ? jet : wisp, P.x, P.y, P.z, D.x * v + (rng() - 0.5) * 6, (rng() - 0.3) * 4, D.z * v + (rng() - 0.5) * 6);
    }
  }

  return ik.finish(RADIUS, RADIUS * 10, 30, update);
}
