// The drifting rock: a loose boulder the mining tugs haul across the lane, back and forth between
// the tug buoy beside the road and the far side. Bound as a sweeper, the rock IS the collision
// cylinder: lumpy but inside the hazard's radius, as tall as its height, its centre at
// sweeperX. It tumbles as it goes (rolling, on a moon's ground), two tugs clamped on its crown
// fire their thrusters to start and stop it, and grit streams off it while it moves.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { sweeperX } from '../../../core/hazards.ts';
import { mulberry32 } from '../../../core/rng.ts';
import { T } from '../b/shapes.ts';
import { brush, col, glowBoost, mix } from '../a/kit.ts';
import { AMBER, DARK, FRAME, HAZARD, HULL, RED_LIGHT, RigKit, RoadFrame, bindHazard, box, prism } from './kit.ts';

const SALT = 0xd71f7;
const RADIUS = 12;
/** The rock's lumps: how far its surface swells in and out of a sphere just inside the radius. */
const LUMP = 0.12;
const ROCK_FILL = 0.88;
const ROCK_DETAIL = 2;
/** Tugs on the crown: their size, and how far apart along the road (share of the rock's radius). */
const TUG = 2.2;
const TUG_SPREAD = 0.45;
/** Thrusters fire while the rock is speeding up or slowing down by more than this (m/s²). */
const THRUST_ACCEL = 2;
/** Grit off the rock while it moves: particles per second at full drift. */
const GRIT_RATE = 30;
/** Speed (m/s) at which the grit runs at its full rate. */
const GRIT_FULL = 20;
const WARN_LEAD = 2;
const ROCK_TONE = 0x6a6258;

export function createDriftRock(opts: LandmarkOptions): Landmark {
  const ik = new RigKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('driftRock', opts, ['sweeper'] as const, {
    def: { type: 'sweeper', id: 'free', at: 0, radius: 8, height: 16, xFrom: -40, xTo: 40, cross: 5, hold: 0.5, period: 16, phase: 0 },
    roadZ: -RADIUS * 4,
    lateral: -1,
    minX: -12,
    maxX: 12,
  });
  const def = bound.def;
  const h = bound.hazard;
  const boost = glowBoost(opts.palette);

  // --- The tug buoy: a beacon frame with a docking cradle, hung where the rock parks ---
  kit.solid.add(prism(RADIUS * 0.35, RADIUS * 0.35, 3, 8), HULL, T(0, 6, 0));
  for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    kit.solid.add(box(0.8, 0.8, RADIUS), FRAME, T(Math.cos(a) * RADIUS * 0.3, 6, Math.sin(a) * RADIUS * 0.3, a));
  }
  kit.solid.add(prism(0.4, 0.4, 16, 6), FRAME, T(0, -4, 0));
  kit.lamp(box(1, 1, 1), [0, 8, 0], AMBER, 4, undefined, { depth: 0.9, freq: 1.5, phase: 0, sharp: 6 });

  // --- The rock: a lumpy sphere of unit radius, scaled to the hazard each frame ---
  const rock = rig.bone();
  rig.add(lumpyRock(opts.seed), mix(ROCK_TONE, opts.palette.rock, 0.3), { bone: rock });
  // The tugs ride the crown (not the rock's spin): a pivot that follows the rock's centre only.
  const crown = rig.bone();
  const spread = def.radius * TUG_SPREAD;
  for (const along of [-1, 1]) {
    rig.add(box(TUG, TUG * 0.6, TUG * 1.4), HULL, { bone: crown, m: T(0, 0, along * spread) });
    rig.add(box(TUG * 1.1, TUG * 0.15, TUG * 1.5), HAZARD, { bone: crown, layer: 'glow', m: T(0, TUG * 0.32, along * spread) });
    rig.add(prism(0.35, 0.5, 0.9, 6).rotateZ(Math.PI / 2), DARK, { bone: crown, m: T(-TUG * 0.6, 0, along * spread) });
    rig.add(prism(0.35, 0.5, 0.9, 6).rotateZ(Math.PI / 2), DARK, { bone: crown, m: T(TUG * 0.6, 0, along * spread) });
  }

  const glow = ik.cloud(4, 4, true, 1.8);
  const grit = ik.cloud(ik.q(300, 150), 0, false, 0.8);
  const dust = brush({ life: 1.6, size0: 1, size1: 5, c0: mix(ROCK_TONE, 0xffffff, 0.2), c1: mix(ROCK_TONE, opts.palette.horizon, 0.6), alpha: 0.5, keep: 0.6, lift: 0 });
  const flame = col(0x9ad8ff);
  const red = col(RED_LIGHT);
  const road = new RoadFrame(bound.binding);
  const P = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const spin = new THREE.Quaternion();
  const step = new THREE.Quaternion();
  let prevX = Number.NaN;
  let prevV = 0;
  let acc = 0;

  function update(time: number, dt: number): void {
    road.at(h.s0);
    const k = road.unit;
    const x = sweeperX(def, time);
    const v = dt > 0 && Number.isFinite(prevX) ? (x - prevX) / dt : 0;
    const a = dt > 0 ? (v - prevV) / dt : 0;
    prevX = x;
    prevV = v;
    const r = def.radius * ROCK_FILL;
    road.point(x, def.height / 2, rock.position);
    // Rolls across the road: about the along-road axis, at the rate its drift would roll it.
    if (dt > 0 && v !== 0) {
      axis.copy(road.along).normalize();
      step.setFromAxisAngle(axis, (-v * dt) / r);
      spin.premultiply(step);
    }
    rock.quaternion.copy(spin);
    rock.scale.set(r * k, (def.height / 2) * k, r * k);
    road.point(x, def.height + TUG * 0.3, crown.position);
    crown.rotation.set(0, RoadFrame.yaw(road.across), 0);
    crown.scale.setScalar(k);
    rig.sync();

    // Thrusters fire against the change in drift; beacons warn before it sets off.
    const thrust = Math.abs(a) > THRUST_ACCEL ? Math.sign(a) : 0;
    const soon = sweeperX(def, time + WARN_LEAD) !== x;
    let li = 0;
    for (const along of [-1, 1]) {
      rig.local(crown, -thrust * TUG * 0.9, 0, along * spread, P);
      glow.lamp(li++, P.x, P.y, P.z, 3, flame, thrust !== 0 ? boost : 0);
      rig.local(crown, 0, TUG * 0.6, along * spread, P);
      glow.lamp(li++, P.x, P.y, P.z, 2, red, (soon || v !== 0) && Math.sin(time * 14) > 0 ? boost : 0.1);
    }
    if (dt <= 0) return;
    acc += dt * GRIT_RATE * Math.min(1, Math.abs(v) / GRIT_FULL);
    while (acc >= 1) {
      acc -= 1;
      const ang = rng() * Math.PI * 2;
      P.copy(rock.position).addScaledVector(road.across, -Math.sign(v) * r * k);
      P.y += Math.sin(ang) * r * k * 0.6;
      grit.emit(dust, P.x, P.y, P.z, (rng() - 0.5) * 3, (rng() - 0.5) * 3, (rng() - 0.5) * 3);
    }
  }

  return ik.finish(RADIUS, RADIUS * 12, 40, update);
}

/** A lumpy unit rock, seeded, faceted: a subdivided icosahedron swollen and dented by noise. */
function lumpyRock(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, ROCK_DETAIL);
  const rng = mulberry32(seed ^ SALT);
  const bumps = Array.from({ length: 7 }, () => new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize());
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let n = 0;
    for (const b of bumps) n += Math.max(0, v.dot(b)) ** 3;
    const r = 1 - LUMP + LUMP * Math.min(1, n);
    p.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  // An icosahedron is already non-indexed: every face keeps its own normal, so the rock is faceted.
  g.computeVertexNormals();
  return g;
}
