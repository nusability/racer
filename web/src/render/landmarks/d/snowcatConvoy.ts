// The snowcat convoy: a column of tracked haulers grinding along a service road beside the
// course, amber light bars flashing, sledges of cargo in tow, vanishing into a depot shed at one
// end and rolling out of a tunnel portal at the other. A level crossing links the service road
// to the race: bound as a sweeper, a hovercraft tug IS the collision cylinder, gliding across the
// road at sweeperX while the crossing lights flash red, turning about on its skirt at each end.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { sweeperX } from '../../../core/hazards.ts';
import { T, box, mix, prism, shade, vary } from '../b/shapes.ts';
import { addBeam, brush, col, glowBoost } from '../a/kit.ts';
import { DARK, INDUSTRIAL, IceKit, RED_LIGHT, RoadFrame, SAFETY, STEEL, WARM_LIGHT, bindHazard, smooth01, type Def } from './kit.ts';

const SALT = 0x5ca75;
const RADIUS = 160;
/** The service road runs along local X at this z, between the depot and the tunnel portal. */
const SERVICE_Z = -RADIUS * 0.72;
const SERVICE_W = 14;
const ENDS = RADIUS * 0.85;
const CONVOY = { high: 5, low: 3 } as const;
const CONVOY_SPEED = 9;
const CONVOY_GAP = 38;
/** The hovercraft's design half-length; it is scaled so this fits the collision cylinder. */
const HOVER_R = 6;
const TURN = 1.8;
const FAN_SPIN = 14;
/** Crossing lights flash while the tug is within this many metres of the road. */
const WARN_REACH = 25;
const SPRAY_RATE = 0.04;
const POLES = { high: 22, low: 12 } as const;

interface Cat {
  bone: THREE.Bone;
  offset: number;
}

/** Facing in the crossing's cycle: toward xTo while crossing, swinging round at each end. */
function facing(d: Def<'sweeper'>, time: number): number {
  const t = (((time + d.phase) % d.period) + d.period) % d.period;
  const back = 2 * d.cross + d.hold;
  if (t < d.cross) return 0;
  if (t < back) return Math.PI * smooth01((t - d.cross) / Math.max(d.hold, TURN));
  return Math.PI + Math.PI * smooth01((t - back) / Math.min(TURN, d.period - back));
}

export function createSnowcatConvoy(opts: LandmarkOptions): Landmark {
  const ik = new IceKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('snowcatConvoy', opts, ['sweeper'] as const, {
    def: { type: 'sweeper', id: 'free', at: 0, radius: 5, height: 6, xFrom: 40, xTo: -30, cross: 6, hold: 3, period: 20, phase: 0 },
    roadZ: -RADIUS * 0.45,
    lateral: -1,
    minX: -12,
    maxX: 12,
  });
  const def = bound.def;
  const boost = glowBoost(opts.palette);
  const dusk = opts.palette.dusk;
  const accent = opts.palette.accent;

  // --- The service road, snow banks, reflector poles (lamps without halos: the CPU glow cloud
  // is this landmark's second and last point cloud) ---
  kit.solid.add(box(ENDS * 2, 0.15, SERVICE_W), shade(ik.snow, 0.85), T(0, 0, SERVICE_Z));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const x = -ENDS + (i + 0.5) * ((ENDS * 2) / 12);
      kit.solid.add(new THREE.SphereGeometry(1, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), vary(rng, ik.snow, 0.03), T(x, 0, SERVICE_Z + side * (SERVICE_W / 2 + 4), 0, 0, 0, [14, 2.5 + rng() * 1.5, 3]));
    }
  }
  const nPoles = ik.q(POLES.high, POLES.low);
  for (let i = 0; i < nPoles; i++) {
    const x = -ENDS + (i + 0.5) * ((ENDS * 2) / nPoles);
    const z = SERVICE_Z + (i % 2 ? 1 : -1) * (SERVICE_W / 2 + 1);
    kit.solid.add(prism(0.12, 0.12, 3, 4), i % 4 < 2 ? SAFETY : DARK, T(x, 0, z));
    kit.lamp(box(0.3, 0.3, 0.3), [x, 3, z], WARM_LIGHT, 0);
  }
  // Depot shed (where the convoy goes in) and a tunnel portal in a snow bank (where it comes out).
  kit.solid.add(box(30, 18, 34), mix(STEEL, ik.snow, 0.3), T(ENDS + 8, 0, SERVICE_Z));
  kit.solid.add(new THREE.CylinderGeometry(17, 17, 30, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.5, 1), mix(INDUSTRIAL[2], accent, 0.2), T(ENDS + 8, 18, SERVICE_Z));
  kit.solid.add(box(0.6, 12, 12), DARK, T(ENDS - 7.4, 0, SERVICE_Z));
  kit.lamp(box(0.4, 1.2, 12), [ENDS - 7.6, 12.5, SERVICE_Z], 0xffb040, 0, undefined, { depth: 0.8, freq: 3, phase: 0, sharp: 3 });
  kit.solid.add(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), ik.snow, T(-ENDS - 10, 0, SERVICE_Z, 0, 0, 0, [24, 20, 30]));
  kit.solid.add(new THREE.TorusGeometry(9, 2.2, 5, 10, Math.PI), shade(STEEL, 0.9), T(-ENDS + 12, 0, SERVICE_Z, Math.PI / 2));
  kit.solid.add(box(1, 9, 16), DARK, T(-ENDS + 11, 0, SERVICE_Z));
  // Fuel tanks, a radio mast and stacked containers by the depot.
  for (let k = 0; k < 3; k++) kit.solid.add(prism(5, 5, 4, 10).rotateZ(Math.PI / 2), k ? 0xe8e4dc : SAFETY, T(ENDS - 20 - k * 12, 5, SERVICE_Z + 30));
  for (let k = 0; k < 6; k++) kit.solid.add(box(12, 5, 5), vary(rng, INDUSTRIAL[k % INDUSTRIAL.length], 0.06), T(ENDS - 50 + (k % 3) * 12.5, Math.floor(k / 3) * 5, SERVICE_Z + 45));
  kit.solid.add(prism(0.6, 1, 60, 4), STEEL, T(ENDS - 70, 0, SERVICE_Z + 30));
  kit.lamp(new THREE.OctahedronGeometry(0.9), [ENDS - 70, 60.8, SERVICE_Z + 30], RED_LIGHT, 0, undefined, { depth: 0.95, freq: 2.2, phase: 0, sharp: 7 });

  // --- The convoy: tracked haulers towing cargo sledges, rig bones driven along the road ---
  const cats: Cat[] = [];
  const nCats = ik.q(CONVOY.high, CONVOY.low);
  for (let i = 0; i < nCats; i++) {
    const bone = rig.bone();
    const body = vary(rng, INDUSTRIAL[i % INDUSTRIAL.length], 0.05);
    const B = { bone };
    for (const z of [-2.6, 2.6]) {
      rig.add(box(9, 2.4, 1.8), DARK, { ...B, m: T(0, 0, z) });
      for (let w = 0; w < 4; w++) rig.add(prism(0.9, 0.9, 1.9, 8).rotateX(Math.PI / 2), STEEL, { ...B, m: T(-3.3 + w * 2.2, 1.2, z - 0.95) });
    }
    rig.add(box(8, 2.6, 5.4), body, { ...B, m: T(-0.5, 2.4, 0) });
    rig.add(box(3.6, 2.6, 4.6), shade(body, 1.1), { ...B, m: T(2.2, 5, 0) });
    rig.add(box(0.2, 1.4, 4), DARK, { ...B, m: T(4.05, 5.9, 0) });
    rig.add(box(0.25, 1.1, 3.6), WARM_LIGHT, { ...B, layer: 'glow', m: T(4.15, 6, 0) });
    rig.add(box(0.6, 0.4, 3.6), 0xffa020, { ...B, layer: 'glow', m: T(2.2, 7.8, 0) });
    for (const z of [-1.8, 1.8]) rig.add(box(0.2, 0.6, 0.8), 0xfff4d0, { ...B, layer: 'glow', m: T(3.6, 3.4, z) });
    addBeam(rig, 28, 4.5, 0xfff2d0, 0.03 + 0.2 * dusk, { bone, m: T(3.8, 3.4, 0, 0, 0, Math.PI / 2 - 0.12) });
    // The sledge in tow: a drawbar and a tarped load.
    rig.add(box(4, 0.3, 0.3), DARK, { ...B, m: T(-6.5, 1.2, 0) });
    rig.add(box(10, 0.6, 5), STEEL, { ...B, m: T(-13.5, 0.3, 0) });
    rig.add(box(9, 3.2, 4.6), vary(rng, mix(0x5a6a4a, opts.palette.rock, 0.3), 0.1), { ...B, m: T(-13.5, 0.9, 0) });
    cats.push({ bone, offset: i * CONVOY_GAP });
  }

  // --- The hovercraft tug and the level crossing: posed from the road each frame ---
  const tug = rig.bone();
  const fans = [rig.bone(tug, -4.6, 4.4, -2.4), rig.bone(tug, -4.6, 4.4, 2.4)];
  const TB = { bone: tug };
  rig.add(new THREE.CylinderGeometry(1, 1, 1, 14).scale(7.2, 1.8, 5.4), DARK, { ...TB, m: T(0, 0.9, 0) });
  rig.add(box(12, 1.6, 8.6), shade(SAFETY, 1.05), { ...TB, m: T(0, 1.6, 0) });
  rig.add(box(5, 2.6, 6), 0xf0eee8, { ...TB, m: T(1.6, 3.2, 0) });
  rig.add(box(0.2, 1.2, 5.4), DARK, { ...TB, m: T(4.15, 4.2, 0) });
  rig.add(box(0.25, 1, 5), WARM_LIGHT, { ...TB, layer: 'glow', m: T(4.2, 4.3, 0) });
  for (const f of fans) {
    rig.add(new THREE.TorusGeometry(2.2, 0.35, 4, 12).rotateY(Math.PI / 2), shade(SAFETY, 0.8), { bone: tug, m: T(-4.6, 4.4, f.position.z) });
    for (let k = 0; k < 4; k++) rig.add(box(0.15, 3.8, 0.5), DARK, { bone: f, m: T(0, 0, 0, 0, (k / 4) * Math.PI) });
  }
  rig.add(new THREE.OctahedronGeometry(0.45), RED_LIGHT, { ...TB, layer: 'glow', m: T(1.6, 6.8, 0) });
  // Crossing lanes either side of the road, crossbuck posts with twin red lamps.
  const lanes = [rig.bone(), rig.bone()];
  for (const b of lanes) {
    rig.add(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0), shade(ik.snow, 0.8), { bone: b });
    for (let k = 0; k < 6; k++) rig.add(new THREE.PlaneGeometry(0.06, 0.08).rotateX(-Math.PI / 2).translate(0.1 + k * 0.16, 0.01, 0), 0xffd020, { bone: b });
  }
  const posts = [rig.bone(), rig.bone()];
  for (const b of posts) {
    rig.add(prism(0.15, 0.15, 5, 4), 0xe8e8e8, { bone: b });
    rig.add(box(3.4, 0.4, 0.1), 0xf4f4f4, { bone: b, m: T(0, 5, 0.1, 0, 0, 0.6) });
    rig.add(box(3.4, 0.4, 0.1), RED_LIGHT, { bone: b, m: T(0, 5, 0.12, 0, 0, -0.6) });
    rig.add(box(2.6, 0.3, 0.2), DARK, { bone: b, m: T(0, 3.4, 0.1) });
  }

  const LAMPS = 4 + 2 + nCats * 2;
  const glow = ik.cloud(LAMPS, LAMPS, true, 1.7);
  const spray = ik.cloud(ik.q(320, 160), 0, false, 0.75);
  const powder = brush({ life: 1.4, size0: 2, size1: 8, c0: ik.snow, c1: mix(ik.snow, opts.palette.horizon, 0.4), alpha: 0.7, keep: 0.5, lift: -2 });
  const red = col(RED_LIGHT);
  const amber = col(0xffa020);
  const white = col(0xfff4d0);

  const h = bound.hazard;
  const road = new RoadFrame(bound.binding);
  const P = new THREE.Vector3();
  const D = new THREE.Vector3();
  const span = ENDS * 2 + CONVOY_GAP;
  let prevX = Number.NaN;
  let sprayAcc = 0;

  function update(time: number, dt: number): void {
    // Convoy: each hauler drives +X, hidden while inside the shed or the portal.
    cats.forEach((c) => {
      const x = (((time * CONVOY_SPEED + c.offset) % span) + span) % span - span / 2;
      c.bone.position.set(x, 0.1 + Math.abs(Math.sin(time * 6 + c.offset)) * 0.08, SERVICE_Z - 2.5);
      c.bone.rotation.set(0, 0, Math.sin(time * 3 + c.offset) * 0.01);
      c.bone.scale.setScalar(Math.abs(x) < ENDS - 6 ? 1 : 0);
    });

    // The tug: at sweeperX on the cross-section, facing its way, hovering and yawing.
    road.at(h.s0);
    const k = road.unit;
    const x = sweeperX(def, time);
    const s = (def.radius / HOVER_R) * k;
    road.point(x, 0.6 + Math.sin(time * 2.3) * 0.15, tug.position);
    const yaw0 = RoadFrame.yaw(D.copy(road.across).multiplyScalar(def.xTo >= def.xFrom ? 1 : -1));
    const moving = dt > 0 && Number.isFinite(prevX) ? (x - prevX) / dt : 0;
    prevX = x;
    tug.rotation.order = 'YXZ';
    tug.rotation.set(Math.sin(time * 1.7) * 0.02, yaw0 + facing(def, time), -Math.sign(moving) * Math.min(0.06, Math.abs(moving) * 0.01));
    tug.scale.setScalar(s);
    for (const f of fans) f.rotation.x = time * FAN_SPIN;
    // Lanes from each road edge outward, crossbucks at the edges facing the racers.
    for (let j = 0; j < 2; j++) {
      const out = j ? 1 : -1;
      const edge = out > 0 ? h.maxX : h.minX;
      road.point(edge + out * 0.5, 0.06, lanes[j].position);
      lanes[j].rotation.set(0, RoadFrame.yaw(D.copy(road.across).multiplyScalar(out)), 0);
      lanes[j].scale.set(Math.max(0, Math.abs((out > 0 ? def.xTo : def.xFrom) - edge) + 10) * k, 1, def.radius * 2.6 * k);
      road.point(edge + out * 2.5, 0, posts[j].position).addScaledVector(road.along, -def.radius * 1.6 * k);
      posts[j].rotation.set(0, Math.atan2(-road.along.x, -road.along.z), 0);
      posts[j].scale.setScalar(k);
    }
    rig.sync();

    // Lamps: crossing pairs flash alternately while the tug is near the road; then the tug, the cats.
    const near = x > h.minX - WARN_REACH && x < h.maxX + WARN_REACH;
    const flip = Math.sin(time * 9) > 0;
    let li = 0;
    for (const p of posts) {
      for (const side of [-1, 1]) {
        rig.local(p, side * 0.9, 3.4, 0.25, P);
        glow.lamp(li++, P.x, P.y, P.z, 3, red, near && flip === side > 0 ? boost : 0.04);
      }
    }
    rig.local(tug, 1.6, 7, 0, P);
    glow.lamp(li++, P.x, P.y, P.z, 4, red, (Math.sin(time * 6) > 0 ? 0.9 : 0.15) * boost);
    rig.local(tug, 4.4, 4.3, 0, P);
    glow.lamp(li++, P.x, P.y, P.z, 6, white, (0.25 + 0.5 * dusk) * boost);
    for (const c of cats) {
      const on = c.bone.scale.x > 0 ? 1 : 0;
      rig.local(c.bone, 2.2, 8.2, 0, P);
      glow.lamp(li++, P.x, P.y, P.z, 3.5, amber, on * (Math.sin(time * 7 + c.offset) > 0 ? 0.9 : 0.2) * boost);
      rig.local(c.bone, 4, 3.4, 0, P);
      glow.lamp(li++, P.x, P.y, P.z, 5, white, on * (0.2 + 0.5 * dusk) * boost);
    }

    if (dt <= 0) return;
    sprayAcc += dt;
    while (sprayAcc > SPRAY_RATE) {
      sprayAcc -= SPRAY_RATE;
      // The skirt throws a ring of powder, more when the tug is under way.
      const a = rng() * Math.PI * 2;
      rig.local(tug, Math.cos(a) * 7, 0.3, Math.sin(a) * 5, P);
      D.subVectors(P, tug.position).multiplyScalar(1.4);
      spray.emit(powder, P.x, P.y, P.z, D.x, 1.5 + Math.min(4, Math.abs(moving) * 0.3), D.z);
      const c = cats[Math.floor(rng() * cats.length)];
      if (c.bone.scale.x > 0) {
        rig.local(c.bone, -4.5, 0.5, rng() < 0.5 ? -2.6 : 2.6, P);
        spray.emit(powder, P.x, P.y, P.z, -3 + (rng() - 0.5) * 2, 2, (rng() - 0.5) * 2);
      }
    }
  }

  return ik.finish(RADIUS, RADIUS * 1.6, 70, update);
}
