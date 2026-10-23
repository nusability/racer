// The icebreaker: a red polar ship ramming its way along a frozen channel that crosses the road.
// Slabs crack, tilt and shoulder aside round its spoon bow, black smoke rolls from twin stacks,
// searchlights rake the ice ahead. Bound as a blocker it rams across the road during 'warn',
// lies across it for 'down' (its hull is the bar on its own side of the opening; the ice it
// shoves ahead heaves up into a pressure ridge for the far side) and backs off while idle.
// Bound as a sweeper its bow is the collision cylinder: it rams to xTo, holds, backs out to xFrom.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { blockerStage, sweeperX } from '../../../core/hazards.ts';
import { T, ball, box, mix, prism, shade, vary } from '../b/shapes.ts';
import { addBeam, brush, col, glowBoost } from '../a/kit.ts';
import { hull } from '../c/kit.ts';
import { DARK, ICE, ICE_DEEP, IceKit, RED_LIGHT, RoadFrame, SAFETY, WARM_LIGHT, WATER, bindHazard, blockedSpans, hide, smooth01 } from './kit.ts';

const SALT = 0x1ceb7;
const RADIUS = 150;
const ICE_FIELD_R = 160;
/** Ship: bow tip at its bone's origin, sailing toward +X. */
const SHIP = { length: 96, beam: 22, height: 13, draft: 4 } as const;
/** The ship is authored at 1:1 and drawn this much bigger, so it reads from kilometres out. */
const SHIP_SCALE = 1.4;
const HULL_LEN = SHIP.length * SHIP_SCALE;
const HULL_HALF_W = (SHIP.beam * SHIP_SCALE) / 2;
const DECK = SHIP.height - SHIP.draft;
const BRIDGE_Y = DECK + 12;
const STACK = { x: -60, z: 4.6, base: DECK + 6, h: 11 } as const;
const MAST = { x: -44, top: DECK + 26 } as const;
const RADAR_SPIN = 1.4;
/** How far behind the road edge the bow rests between rams, metres. */
const REST_BACKOFF = 14;
/** Water lane round the hull, and how far the channel runs either side of the road. */
const CHANNEL_W = 42;
const CHANNEL_NEAR = 200;
const CHANNEL_FAR = 60;
/** Ice slabs flanking the channel and the share that start in the ship's lane. */
const SLABS = { high: 44, low: 24 } as const;
const RIDGE_MAX = 10;
const RIDGE_SLAB = 3.2;
/** Bow pitch kick when it rams (rad) and how fast it dies away (1/s). */
const RAM_KICK = 0.05;
const RAM_DAMP = 3;
/** The fraction of a blocker's idle time spent backing off. */
const BACK_OFF = 0.45;
const SMOKE_RATE = 0.06;
/** Tolerance when matching a blocked span to a road edge, metres. */
const EDGE_EPS = 0.01;
const SPRAY_RATE = 0.03;
const SMOKE_FOG = 0.55;
/** Grounded icebergs round the far shore of the lake: [angle from +Z, distance × field, height]. */
const BERGS = { high: 6, low: 4 } as const;
const HULL_RED = 0xc4202c;
const SUPER = 0xf2f0ea;

interface Slab {
  bone: THREE.Bone;
  /** Lateral track position along the channel (metres) and offset along s from its centre line. */
  x: number;
  off: number;
  r: number;
  phase: number;
}

/** A faceted berg: a jagged blue-white spire with a snow cap, standing in the lake ice. */
function iceberg(ik: IceKit, x: number, z: number, h: number, r: number): void {
  const { rng } = ik;
  const g = new THREE.ConeGeometry(r, h, 6, 3).translate(0, h / 2, 0).toNonIndexed();
  const p = g.getAttribute('position');
  for (let v = 0; v < p.count; v++) {
    const y = p.getY(v);
    const k = 1 + (Math.sin(p.getX(v) * 0.7 + y * 0.3) + Math.cos(p.getZ(v) * 0.9)) * 0.12;
    p.setXYZ(v, p.getX(v) * k, y * (y > h * 0.9 ? 0.85 : 1), p.getZ(v) * k);
  }
  const ry = rng() * 6;
  ik.b.solid.add(g, mix(ICE, ICE_DEEP, 0.25 + rng() * 0.25), T(x, -2, z, ry, 0, (rng() - 0.5) * 0.2, [1, 1, 0.7]));
  ik.b.solid.add(new THREE.ConeGeometry(r * 0.55, h * 0.35, 6).translate(0, h * 0.8, 0), ik.snow, T(x, -2, z, ry, 0, 0, [1, 1, 0.7]));
  ik.b.solid.add(prism(r * 1.3, r * 1.1, 2.5, 7), mix(ICE, ik.snow, 0.6), T(x, -1, z, ry));
}

export function createIcebreaker(opts: LandmarkOptions): Landmark {
  const ik = new IceKit(opts, SALT);
  const { rng, rig } = ik;
  const kit = ik.b;
  const bound = bindHazard('icebreaker', opts, ['blocker', 'sweeper'] as const, {
    def: { type: 'blocker', id: 'free', at: 0, opening: 10, offset: 7, height: 9, warn: 5, up: 5, period: 22, phase: 0 },
    roadZ: -45,
    lateral: 1,
    minX: -12,
    maxX: 12,
  });
  const boost = glowBoost(opts.palette);

  // --- The frozen lake: a pale sheet with pressure cracks and snow drifts (static) ---
  const iceTop = mix(ICE, ik.snow, 0.55);
  kit.solid.add(new THREE.CircleGeometry(ICE_FIELD_R, 28).rotateX(-Math.PI / 2), iceTop, T(0, 0.06, 0));
  for (let i = 0; i < ik.q(26, 12); i++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * ICE_FIELD_R * 0.9;
    kit.solid.add(box(0.6, 0.02, 10 + rng() * 30), shade(ICE_DEEP, 0.9), T(Math.cos(a) * r, 0.1, Math.sin(a) * r, rng() * 3));
  }
  for (let i = 0; i < ik.q(16, 8); i++) {
    const a = rng() * Math.PI * 2;
    const r = ICE_FIELD_R * (0.75 + rng() * 0.25);
    kit.solid.add(ball(1, 6, 4), vary(rng, ik.snow, 0.04), T(Math.cos(a) * r, 0, Math.sin(a) * r, rng() * 3, 0, 0, [8 + rng() * 10, 2 + rng() * 2, 4 + rng() * 4]));
  }

  // Icebergs locked into the far shore: tall faceted silhouettes that mark the place from afar.
  for (let i = 0; i < ik.q(BERGS.high, BERGS.low); i++) {
    const a = Math.PI / 2 + (i / (ik.q(BERGS.high, BERGS.low) - 1) - 0.5) * 2.4 + (rng() - 0.5) * 0.3;
    const r = ICE_FIELD_R * (0.7 + rng() * 0.25);
    iceberg(ik, Math.cos(a) * r, Math.sin(a) * r, 30 + rng() * 45, 18 + rng() * 16);
  }

  // --- The ship ---
  const ship = rig.bone();
  const S = { bone: ship };
  const red = col(HULL_RED);
  const sink = (g: THREE.BufferGeometry) => g.translate(-SHIP.length / 2, -SHIP.draft, 0);
  rig.add(sink(hull(SHIP.length, SHIP.beam, SHIP.height, 0.3, 0.9, 0.62)), red, S);
  rig.add(sink(hull(SHIP.length + 0.4, SHIP.beam + 0.4, 1.4, 0.3, 0.9, 1)).translate(0, DECK - 1.6, 0), SUPER, S);
  rig.add(sink(hull(SHIP.length + 0.6, SHIP.beam + 0.6, 1.6, 0.3, 0.9, 1)).translate(0, SHIP.draft - 0.2, 0), DARK, S);
  // Superstructure: stacked white tiers with a wide bridge and wings.
  rig.add(box(34, 6, 19), SUPER, { ...S, m: T(-48, DECK, 0) });
  rig.add(box(26, 5, 17), shade(SUPER, 0.96), { ...S, m: T(-46, DECK + 6, 0) });
  rig.add(box(14, 4, SHIP.beam + 4), SUPER, { ...S, m: T(-38, BRIDGE_Y - 1, 0) });
  rig.add(box(14.2, 1.6, SHIP.beam + 4.2), DARK, { ...S, m: T(-38, BRIDGE_Y + 0.6, 0) });
  for (let k = 0; k < 9; k++) rig.add(box(0.4, 1.1, 1.6), WARM_LIGHT, { ...S, layer: 'glow', m: T(-30.9, BRIDGE_Y + 0.85, -9 + k * 2.25) });
  for (let k = 0; k < 12; k++) for (const side of [-1, 1]) rig.add(box(1.4, 1, 0.2), WARM_LIGHT, { ...S, layer: 'glow', m: T(-62 + k * 2.6, DECK + 2.5 + (k % 2) * 6, side * 9.55) });
  // Twin stacks: the line's accent with black crowns.
  for (const z of [-STACK.z, STACK.z]) {
    rig.add(prism(2.6, 2.2, STACK.h, 8), opts.palette.accent, { ...S, m: T(STACK.x, STACK.base, z, 0, 0, 0.12) });
    rig.add(prism(2.25, 2.25, 2, 8), DARK, { ...S, m: T(STACK.x - 1.3, STACK.base + STACK.h - 0.5, z, 0, 0, 0.12) });
  }
  // Mast, radar and lights; a crane on the foredeck; helideck aft; orange lifeboats.
  rig.add(prism(0.5, 0.35, MAST.top - BRIDGE_Y, 4), SUPER, { ...S, m: T(MAST.x, BRIDGE_Y, 0) });
  const radar = rig.bone(ship, MAST.x, MAST.top - 4, 0);
  rig.add(box(1, 0.5, 8), DARK, { bone: radar });
  rig.add(new THREE.OctahedronGeometry(0.6), RED_LIGHT, { ...S, layer: 'glow', m: T(MAST.x, MAST.top + 0.4, 0) });
  rig.add(prism(0.8, 0.6, 9, 6), SAFETY, { ...S, m: T(-16, DECK, 0) });
  rig.add(box(16, 0.8, 0.8), SAFETY, { ...S, m: T(-9, DECK + 9, 0, 0, 0, -0.35) });
  rig.add(box(20, 0.8, SHIP.beam - 2), shade(SUPER, 0.8), { ...S, m: T(-84, DECK + 3, 0) });
  rig.add(box(8, 0.1, 1.2), 0xffe040, { ...S, m: T(-84, DECK + 3.85, 0) });
  for (const side of [-1, 1]) for (let k = 0; k < 2; k++) rig.add(ball(1, 6, 4), SAFETY, { ...S, m: T(-58 + k * 9, DECK + 7, side * 10.5, 0, 0, 0, [3.5, 1.3, 1.4]) });
  // Searchlights from the bridge roof, aimed ahead and down at the ice.
  const beamAlpha = 0.025 + 0.3 * opts.palette.dusk;
  for (const z of [-6, 6]) addBeam(rig, 55, 8, 0xfff2d0, beamAlpha, { bone: ship, m: T(-31, BRIDGE_Y + 2.6, z, 0, z * 0.02, Math.PI / 2 - 0.22) });

  // --- Ice slabs and the water lane: posed from the road every frame ---
  const slabs: Slab[] = [];
  const slabColor = (k: number) => mix(ICE, ik.snow, 0.3 + 0.5 * k);
  const nSlab = ik.q(SLABS.high, SLABS.low);
  for (let i = 0; i < nSlab; i++) {
    const bone = rig.bone();
    const r = 2.5 + rng() * 3.5;
    const sides = 5 + Math.floor(rng() * 3);
    rig.add(prism(r, r * 0.9, 0.9, sides), slabColor(rng()), { bone, m: T(0, -0.5, 0) });
    rig.add(prism(r * 0.85, r * 0.75, 0.25, sides), ik.snow, { bone, m: T(0, 0.4, 0) });
    const near = i < nSlab * 0.75;
    const along = near ? 4 + rng() * CHANNEL_NEAR : 4 + rng() * CHANNEL_FAR;
    const lane = rng() < 0.3;
    slabs.push({ bone, x: (near ? 1 : -1) * along, off: (rng() < 0.5 ? -1 : 1) * (lane ? rng() * HULL_HALF_W : HULL_HALF_W + 2 + rng() * 6), r, phase: rng() * 9 });
  }
  const ridge: THREE.Bone[] = [];
  for (let i = 0; i < RIDGE_MAX; i++) {
    const bone = rig.bone();
    rig.add(box(RIDGE_SLAB * 0.95, 1, 7), slabColor(rng() * 0.6), { bone });
    rig.add(box(RIDGE_SLAB * 0.8, 0.3, 6), ik.snow, { bone, m: T(0, 1, 0) });
    ridge.push(bone);
  }
  const lanes = [rig.bone(), rig.bone()];
  for (const b of lanes) {
    rig.add(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0), WATER, { bone: b });
    rig.add(new THREE.PlaneGeometry(1, 0.06).rotateX(-Math.PI / 2).translate(0.5, 0.02, 0.47), mix(ICE_DEEP, 0xffffff, 0.5), { bone: b });
    rig.add(new THREE.PlaneGeometry(1, 0.06).rotateX(-Math.PI / 2).translate(0.5, 0.02, -0.47), mix(ICE_DEEP, 0xffffff, 0.5), { bone: b });
  }

  // Lamps: masthead, two searchlight heads, two bow flood spots, channel beacons.
  const BEACONS = 6;
  const LAMPS = 5 + BEACONS;
  const glow = ik.cloud(LAMPS + ik.q(120, 60), LAMPS, true, 1.6);
  const smoke = ik.cloud(ik.q(260, 130), 0, false, 0.8);
  smoke.wind.set(4, 0, 2);
  // The plumes tower out of the ground haze: let them take only part of the fog.
  smoke.setFogScale(SMOKE_FOG);
  const soot = brush({ life: 9, size0: 9, size1: 46, c0: col(0x2a2a2e), c1: mix(0x8a8c94, opts.palette.horizon, 0.5), alpha: 0.8, keep: 0.6, lift: 2.5 });
  const powder = brush({ life: 1.8, size0: 3, size1: 9, c0: ik.snow, c1: mix(ik.snow, opts.palette.horizon, 0.4), alpha: 0.85, keep: 0.5, lift: -5 });
  const shards = brush({ life: 1.2, size0: 1.6, size1: 0.6, c0: col(0xe8f8ff), c1: col(ICE), alpha: 0.9, keep: 0.8, lift: -14 });

  const def = bound.def;
  const h = bound.hazard;
  const spans = def.type === 'blocker' ? blockedSpans(h) : [];
  const road = new RoadFrame(bound.binding);
  const P = new THREE.Vector3();
  const Q = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const amber = col(0xffb040);
  const white = col(0xfff6e0);
  const redC = col(RED_LIGHT);
  let ramAt = -1e9;
  let prevBow = Number.NaN;
  let smokeAcc = 0;
  let sprayAcc = 0;

  function update(time: number, dt: number): void {
    road.at(h.s0);
    // The landmark's own side of the road: the ship berths there.
    const home = road.origin.dot(road.across) > 0 ? -1 : 1;
    let heading: number;
    let bow: number;
    // The hull closes the blocked span on the ship's side; the far span is the pressure ridge.
    const near = spans.find((sp) => (home > 0 ? sp[1] >= h.maxX - EDGE_EPS : sp[0] <= h.minX + EDGE_EPS));
    const far = spans.find((sp) => sp !== near);
    let ridgeUp = 0;
    let crack = 0;
    if (def.type === 'sweeper') {
      heading = def.xTo >= def.xFrom ? 1 : -1;
      bow = sweeperX(def, time) + heading * def.radius * 0.9;
    } else {
      heading = -home;
      const stop = near ? (home > 0 ? near[0] : near[1]) : home > 0 ? h.maxX : h.minX;
      const rest = (home > 0 ? h.maxX : h.minX) + home * REST_BACKOFF;
      const st = blockerStage(def, time);
      if (st.stage === 'warn') {
        bow = rest + (stop - rest) * st.progress ** 1.7;
        crack = st.progress;
      } else if (st.stage === 'down') {
        bow = stop;
        ridgeUp = 1;
      } else {
        const back = smooth01(st.progress / BACK_OFF);
        bow = stop + (rest - stop) * back;
        ridgeUp = 1 - back;
      }
      if (st.stage === 'down' && time - ramAt > def.up) ramAt = time - st.progress * def.up;
    }
    const speed = dt > 0 && Number.isFinite(prevBow) ? Math.abs(bow - prevBow) / dt : 0;
    prevBow = bow;

    // Ship pose: bow at `bow` on the cross-section, heading across the road, rolling gently.
    road.point(bow, 0, P);
    dir.copy(road.across).multiplyScalar(heading);
    ship.position.copy(P);
    ship.rotation.order = 'YXZ';
    const kick = RAM_KICK * Math.exp(-(time - ramAt) * RAM_DAMP) * Math.max(0, Math.sin((time - ramAt) * 14));
    ship.rotation.set(Math.sin(time * 0.7) * 0.012, RoadFrame.yaw(dir), Math.sin(time * 0.5) * 0.008 + kick);
    ship.scale.setScalar(road.unit * SHIP_SCALE);
    radar.rotation.y = time * RADAR_SPIN;

    // Water lanes from each road edge outward along the channel.
    for (let k = 0; k < 2; k++) {
      const out = k === 0 ? home : -home;
      const edge = out > 0 ? h.maxX : h.minX;
      const lane = lanes[k];
      road.point(edge + out * 1.5, 0.12, lane.position);
      lane.rotation.set(0, RoadFrame.yaw(Q.copy(road.across).multiplyScalar(out)), 0);
      lane.scale.set((k === 0 ? CHANNEL_NEAR : CHANNEL_FAR) * road.unit, 1, CHANNEL_W * road.unit);
    }

    // Slabs: flat ahead of the bow, cracking just ahead, heaved up and shouldered aside at the
    // bow, floating loose in the lane behind it. Slabs never sit on the road itself.
    for (const s of slabs) {
      const out = s.x > 0 ? home : -home;
      const x = (out > 0 ? h.maxX : h.minX) + out * (Math.abs(s.x) + s.r);
      const ahead = (x - bow) * heading;
      const inHull = ahead < 0 && ahead > -HULL_LEN;
      const shoulder = Math.abs(s.off) < HULL_HALF_W + s.r && ahead < 4 ? smooth01((4 - ahead) / 10) : 0;
      const off = s.off + Math.sign(s.off || 1) * shoulder * (HULL_HALF_W + s.r + 1 - Math.abs(s.off));
      const heave = Math.exp(-(((ahead + 3) / 9) ** 2));
      const tilt = heave * 0.9 + (inHull ? 0.12 : 0) + (ahead > 0 && ahead < 18 ? 0.05 * Math.sin(time * 9 + s.phase) * (1 - ahead / 18) : 0);
      road.point(x, 0.2 + heave * 2.2 + 0.15 * Math.sin(time * 1.3 + s.phase), s.bone.position).addScaledVector(road.along, off * road.unit);
      s.bone.rotation.order = 'YXZ';
      s.bone.rotation.set(Math.sign(s.off || 1) * tilt, RoadFrame.yaw(road.across) + s.phase, 0.06 * Math.sin(time * 0.9 + s.phase));
      s.bone.scale.setScalar(road.unit);
    }

    // Pressure ridge across the far blocked span: cracks during warn, heaves up while down.
    ridge.forEach((b, i) => {
      if (!far || def.type !== 'blocker') return hide(b);
      const n = Math.min(RIDGE_MAX, Math.ceil((far[1] - far[0]) / RIDGE_SLAB));
      if (i >= n) return hide(b);
      const x = far[0] + ((i + 0.5) * (far[1] - far[0])) / n;
      const jitter = crack > 0.4 ? 0.04 * Math.sin(time * 23 + i * 2) * crack : 0;
      const up = smooth01(ridgeUp);
      road.point(x, -0.6 + up * 0.6, b.position);
      b.rotation.order = 'YXZ';
      b.rotation.set((i % 2 ? 1 : -1) * (0.15 + 0.55 * up) + jitter, RoadFrame.yaw(road.across), (i % 3 - 1) * 0.25 * up);
      b.scale.set(road.unit, road.unit * (0.4 + up * (def.height - 0.4)), road.unit);
    });
    rig.sync();

    // Lamps.
    rig.local(ship, MAST.x, MAST.top + 0.4, 0, P);
    glow.lamp(0, P.x, P.y, P.z, 5, redC, (0.5 + 0.5 * (Math.sin(time * 4) > 0 ? 1 : 0.2)) * boost);
    for (let k = 0; k < 2; k++) {
      rig.local(ship, -30.5, BRIDGE_Y + 2.6, k ? 6 : -6, P);
      glow.lamp(1 + k, P.x, P.y, P.z, 7, white, 0.9 * boost);
      rig.local(ship, 34, -1, k ? 7 : -7, P);
      glow.lamp(3 + k, P.x, P.y + 0.5, P.z, 14, amber, (0.15 + 0.35 * opts.palette.dusk) * boost);
    }
    for (let k = 0; k < BEACONS; k++) {
      const out = k < 4 ? home : -home;
      const edge = out > 0 ? h.maxX : h.minX;
      const x = edge + out * (6 + (k % 2 ? 0 : 1) * 28 + (k >= 4 ? 0 : (k >> 1) * 60));
      road.point(x, 3, P).addScaledVector(road.along, (k % 2 ? 1 : -1) * (CHANNEL_W / 2 + 1) * road.unit);
      glow.lamp(5 + k, P.x, P.y, P.z, 4, k % 2 ? redC : col(0x40ff80), (Math.sin(time * 3 + k) > 0.3 ? 1 : 0.15) * boost);
    }

    if (dt <= 0) return;
    smokeAcc += dt;
    while (smokeAcc > SMOKE_RATE) {
      smokeAcc -= SMOKE_RATE;
      for (const z of [-STACK.z, STACK.z]) {
        rig.local(ship, STACK.x - 1.4, STACK.base + STACK.h + 1, z, P);
        smoke.emit(soot, P.x, P.y, P.z, (rng() - 0.5) * 2, 5 + rng() * 3 + speed * 0.2, (rng() - 0.5) * 2);
      }
    }
    // Powder and shards thrown off the bow while it is moving through ice.
    sprayAcc += dt * Math.min(1, speed / 3);
    while (sprayAcc > SPRAY_RATE) {
      sprayAcc -= SPRAY_RATE;
      for (const side of [-1, 1]) {
        rig.local(ship, -3, 1, side * 4, P);
        rig.local(ship, -3, 1, side * 9, Q).sub(P);
        smoke.emit(powder, P.x, P.y, P.z, Q.x * 1.5 + (rng() - 0.5) * 3, 5 + rng() * 5, Q.z * 1.5 + (rng() - 0.5) * 3);
        glow.emit(shards, P.x, P.y + 1, P.z, Q.x * 2, 7 + rng() * 6, Q.z * 2);
      }
    }
    // The ram: a burst of powder off the bow and the ridge.
    if (time - ramAt < dt * 1.5) {
      for (let k = 0; k < 24; k++) {
        rig.local(ship, 0, 2, 0, P);
        smoke.emit(powder, P.x, P.y, P.z, (rng() - 0.5) * 22, 6 + rng() * 10, (rng() - 0.5) * 22);
      }
    }
  }

  return ik.finish(RADIUS, RADIUS + CHANNEL_FAR + 60, 60, update);
}
