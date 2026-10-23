import * as THREE from 'three';
import type { Ribbon } from '../../core/track.ts';
import { blockerStage, dropperItems, gustStrength, sweeperX, type CourseHazard, type DropItem } from '../../core/hazards.ts';
import type { HazardDef } from '../../core/types.ts';
import { makeFrame } from '../../core/geom.ts';
import { HAZARD_ROCK_HEIGHT } from '../../data/tuning.ts';
import { FlatBuilder, type P3 } from './builder.ts';
import { KERB_BLOCK } from './config.ts';
import { quadFacing, type Paint } from './paint.ts';

// Scheduled hazards on the road, drawn from the same race-time schedule the simulation
// collides with (core/hazards.ts): target rings shrinking onto a dropper's landing spots with
// the rock falling in and lying there in a puff of dust; beacons flashing before a blocker
// comes down and the barrier itself; crossing bands and beacons where a sweeper passes, with
// a stand-in body when no landmark plays it; streaks blowing across a gust zone. Everything is
// instanced per kind, so a track's hazards cost a handful of draw calls in all.

type Def<T extends HazardDef['type']> = Extract<HazardDef, { type: T }>;

/** Debris look from the biome kit (sRGB hex; glow > 0 makes it molten). */
export interface DebrisLook {
  color: number;
  glow: number;
  dust: number;
  streak: number;
}

/** Last seconds of a dropper's warning in which the object is seen falling in. */
const FALL_TIME = 0.9;
/** It falls from this high above the road. */
const FALL_HEIGHT = 90;
/** The target ring starts this many times the object's radius (plus a floor) and closes on it. */
const RING_START = 3.2;
const RING_FLOOR = 7;
const RING_LIFT = 0.12;
/** Dust of an impact: how long it billows and how big it gets relative to the object. */
const DUST_TIME = 1.1;
const DUST_SIZE = 3.4;
/** The last fraction of a dropped object's stay in which it sinks away. */
const CLEAR_FRACTION = 0.12;
/** Beacon posts at the road edges: height, lamp size, flash rate in warnings (Hz). */
const POST_HEIGHT = 7;
const POST_WIDTH = 0.5;
const LAMP_SIZE = 1.3;
const FLASH_RATE = 3;
/** A blocker's barrier drops in over this many seconds at the end of its warning. */
const BAR_DROP_TIME = 0.6;
const BAR_DEPTH = 2.5;
/** A sweeper's beacons start flashing this long before its body leaves the parking spot. */
const SWEEP_LEAD = 2;
/** Painted danger band across the road where a sweeper or blocker crosses. */
const BAND_WIDTH = 6;
const BAND_LIFT = 0.03;
/** Gust streaks: per hazard, their size, speed per unit of push and height band. */
const STREAKS_PER_GUST = 70;
/** Beacons stand this far before and after a flat X on both roads. */
const CROSS_WARN = 110;
const STREAK_LENGTH = 9;
const STREAK_THICK = 0.22;
const STREAK_SPEED = 9;
const STREAK_TOP = 6;
const STREAK_MIN_PUSH = 0.05;

const AMBER = new THREE.Color(0xffa020);
const RED = new THREE.Color(0xff2a1a);
const GREEN = new THREE.Color(0x30ff70);
const DIM = new THREE.Color(0x3a2a10);
const RING_HOT = new THREE.Color(0xff3020);
const RING_COLD = new THREE.Color(0xffd040);
const BAR_COLOUR = new THREE.Color(0xffc21a);
const BODY_COLOUR = new THREE.Color(0x6a5040);
const POST_COLOUR = new THREE.Color(0x2a2c30);

export interface ScheduledVisuals {
  objects: THREE.Object3D[];
  update(time: number): void;
  dispose(): void;
}

interface Slot {
  r: Ribbon;
  h: CourseHazard;
}

/** Builds the visuals for every hazard on `ribbons`; ids in `bound` are played by a landmark. */
export function buildScheduled(ribbons: Ribbon[], look: DebrisLook, paint: Paint, glow: FlatBuilder, bound: Set<string>): ScheduledVisuals {
  const droppers: Slot[] = [];
  const blockers: Slot[] = [];
  const sweepers: Slot[] = [];
  const gusts: Slot[] = [];
  for (const r of ribbons) {
    for (const h of r.hazards) {
      const list = { dropper: droppers, blocker: blockers, sweeper: sweepers, gust: gusts }[h.def.type];
      list.push({ r, h });
    }
  }
  const objects: THREE.Object3D[] = [];
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, name: string) => {
    const m = new THREE.InstancedMesh(own(geo), own(mat), Math.max(1, n));
    m.name = name;
    m.count = n;
    m.frustumCulled = false;
    if (n > 0) objects.push(m);
    return m;
  };
  const frame = makeFrame();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const col = new THREE.Color();
  const yUp = new THREE.Vector3(0, 1, 0);
  /** Orientation of the road surface at s: local X = right, local Y = road up. */
  const roadQuat = (r: Ribbon, s: number) => {
    const f = r.frameAt(s, frame);
    basis.makeBasis(
      v.set(f.right.x, f.right.y, f.right.z),
      new THREE.Vector3(f.up.x, f.up.y, f.up.z),
      // right × up = −tangent: a proper rotation, not a mirror.
      new THREE.Vector3(-f.tangent.x, -f.tangent.y, -f.tangent.z),
    );
    return q.setFromRotationMatrix(basis);
  };
  const at = (r: Ribbon, s: number, x: number, y: number) => {
    const p = r.toWorld(s, x, y);
    return v.set(p.x, p.y, p.z);
  };
  const hide = (mesh: THREE.InstancedMesh, i: number) => {
    m4.makeScale(0, 0, 0);
    mesh.setMatrixAt(i, m4);
  };

  // --- Static dressing: beacon posts and painted bands for blockers and sweepers ---
  const posts = new FlatBuilder();
  const lampSpots: { r: Ribbon; s: number; x: number; kind: 'edge' | 'open' | 'cross'; slot: Slot | null }[] = [];
  for (const slot of [...blockers, ...sweepers]) {
    const { r, h } = slot;
    for (const x of [h.minX - 2, h.maxX + 2]) {
      post(posts, r, h.s0, x);
      lampSpots.push({ r, s: h.s0, x, kind: 'edge', slot });
    }
    if (h.def.type === 'blocker') {
      // Green lamps over the opening: where to aim.
      for (const x of [h.def.offset - h.def.opening / 2, h.def.offset + h.def.opening / 2]) lampSpots.push({ r, s: h.s0, x, kind: 'open', slot });
    }
    band(glow, paint, r, h.s0, h.minX, h.maxX);
  }
  // A flat X: danger bands framing the box where the roads overlap, and beacons flashing at
  // every approach, so cross-traffic is expected long before it arrives.
  const main = ribbons[0];
  for (const c of main.crossings) {
    if (c.style !== 'flat') continue;
    for (const [s0, other] of [
      [c.s, c.other],
      [c.other, c.s],
    ]) {
      const half = main.widthAt(other) / 2 + BAND_WIDTH;
      for (const ds of [-half, half]) band(glow, paint, main, s0 + ds, -main.widthAt(s0 + ds) / 2, main.widthAt(s0 + ds) / 2);
      for (const ds of [-CROSS_WARN, CROSS_WARN]) {
        for (const side of [-1, 1]) {
          const x = side * (main.widthAt(s0 + ds) / 2 + 3);
          post(posts, main, s0 + ds, x);
          lampSpots.push({ r: main, s: s0 + ds, x, kind: 'cross', slot: null });
        }
      }
    }
  }
  const postGeo = posts.build();
  if (postGeo) {
    const m = new THREE.Mesh(own(postGeo), own(new THREE.MeshLambertMaterial({ vertexColors: true })));
    m.name = 'hazardPosts';
    m.matrixAutoUpdate = false;
    objects.push(m);
  }
  const lamps = inst(new THREE.IcosahedronGeometry(LAMP_SIZE, 1), new THREE.MeshBasicMaterial(), lampSpots.length, 'hazardLamps');
  lampSpots.forEach((l, i) => {
    m4.compose(at(l.r, l.s, l.x, l.kind === 'edge' ? POST_HEIGHT + LAMP_SIZE : POST_HEIGHT * 1.6), q.identity(), sc.setScalar(1));
    lamps.setMatrixAt(i, m4);
    lamps.setColorAt(i, DIM);
  });

  // --- Droppers ---
  const dropCount = droppers.reduce((n, d) => n + (d.h.def as Def<'dropper'>).count, 0);
  const rings = inst(new THREE.RingGeometry(0.84, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }), dropCount, 'hazardRings');
  const shadows = inst(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }), dropCount, 'hazardShadows');
  const debrisMat = new THREE.MeshLambertMaterial({ color: look.color, emissive: new THREE.Color(0xff4a10).multiplyScalar(look.glow), flatShading: true });
  const debris = inst(new THREE.IcosahedronGeometry(1, 0), debrisMat, dropCount, 'hazardDebris');
  const dust = inst(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: look.dust, transparent: true, opacity: 0.5, depthWrite: false }), dropCount, 'hazardDust');
  const items: DropItem[] = [];

  // --- Barriers and stand-in sweeper bodies ---
  const barSlots = blockers.filter((b) => !bound.has(b.h.def.id));
  const bars = inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: BAR_COLOUR, emissive: BAR_COLOUR.clone().multiplyScalar(0.25) }), barSlots.length * 2, 'hazardBars');
  const bodySlots = sweepers.filter((b) => !bound.has(b.h.def.id));
  const bodies = inst(new THREE.CylinderGeometry(1, 1.15, 1, 14), new THREE.MeshLambertMaterial({ color: BODY_COLOUR, flatShading: true }), bodySlots.length, 'hazardBodies');

  // --- Gust streaks ---
  const streaks = inst(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: look.streak, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    gusts.length * STREAKS_PER_GUST,
    'gustStreaks',
  );
  const streakSeeds = Array.from({ length: gusts.length * STREAKS_PER_GUST }, (_, i) => {
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const b = Math.sin(i * 78.233) * 12345.678;
    return { u: a - Math.floor(a), w: b - Math.floor(b) };
  });

  const update = (time: number) => {
    // Droppers: ring closing in, shadow growing, the fall, the rock lying there, the dust.
    let i = 0;
    for (const { r, h } of droppers) {
      const d = h.def as Def<'dropper'>;
      dropperItems(h, time, items);
      const height = d.radius * HAZARD_ROCK_HEIGHT;
      for (const it of items) {
        const rq = roadQuat(r, it.s);
        if (it.stage === 'warn') {
          const close = it.progress;
          const ringR = d.radius + (Math.max(RING_FLOOR, d.radius * RING_START) - d.radius) * (1 - close);
          m4.compose(at(r, it.s, it.x, RING_LIFT), rq, sc.setScalar(ringR));
          rings.setMatrixAt(i, m4);
          // Flash faster as impact nears.
          const flash = Math.sin(time * (8 + 22 * close)) > 0;
          rings.setColorAt(i, col.copy(flash ? RING_HOT : RING_COLD));
          m4.compose(at(r, it.s, it.x, RING_LIFT * 0.5), rq, sc.setScalar(d.radius * (0.4 + 0.8 * close)));
          shadows.setMatrixAt(i, m4);
          const left = (1 - close) * d.warn;
          // A bound landmark (the digger, the volcano) throws the falling object itself.
          if (left < FALL_TIME && !bound.has(d.id)) {
            const fall = left / FALL_TIME;
            m4.compose(at(r, it.s, it.x, height / 2 + FALL_HEIGHT * fall * fall), rq, sc.set(d.radius, height / 2, d.radius));
            debris.setMatrixAt(i, m4);
          } else hide(debris, i);
          hide(dust, i);
        } else if (it.stage === 'down') {
          hide(rings, i);
          hide(shadows, i);
          const sink = Math.max(0, (it.progress - (1 - CLEAR_FRACTION)) / CLEAR_FRACTION);
          m4.compose(at(r, it.s, it.x, height / 2 - height * sink), rq, sc.set(d.radius, height / 2, d.radius));
          debris.setMatrixAt(i, m4);
          const t = (it.progress * d.stay) / DUST_TIME;
          if (t < 1) {
            const size = d.radius * DUST_SIZE * Math.sqrt(t) * (1 - t * 0.6);
            m4.compose(at(r, it.s, it.x, size * 0.4), q.identity(), sc.set(size, size * 0.6, size));
            dust.setMatrixAt(i, m4);
          } else hide(dust, i);
        } else {
          hide(rings, i);
          hide(shadows, i);
          hide(debris, i);
          hide(dust, i);
        }
        i++;
      }
    }

    // Beacons: amber flashing in a warning, red while the road is blocked, dim otherwise.
    lampSpots.forEach((l, k) => {
      let c = DIM;
      const flash = Math.sin(time * Math.PI * 2 * FLASH_RATE) > 0;
      if (!l.slot) {
        lamps.setColorAt(k, flash ? AMBER : DIM);
        return;
      }
      const d = l.slot.h.def;
      if (d.type === 'blocker') {
        const st = blockerStage(d, time).stage;
        if (l.kind === 'open') c = st === 'idle' ? DIM : GREEN;
        else c = st === 'warn' ? (flash ? AMBER : DIM) : st === 'down' ? RED : DIM;
      } else if (d.type === 'sweeper') {
        const x0 = sweeperX(d, time);
        const soon = sweeperX(d, time + SWEEP_LEAD);
        const moving = x0 !== d.xFrom || soon !== d.xFrom;
        c = moving ? (flash ? RED : AMBER) : DIM;
      }
      lamps.setColorAt(k, c);
    });

    barSlots.forEach(({ r, h }, k) => {
      const d = h.def as Def<'blocker'>;
      const { stage, progress } = blockerStage(d, time);
      // Lowered from above during the last part of the warning, raised again after.
      let drop = 1;
      if (stage === 'warn') drop = Math.max(0, (progress * d.warn - (d.warn - BAR_DROP_TIME)) / BAR_DROP_TIME);
      else if (stage === 'idle') drop = Math.max(0, 1 - (progress * (d.period - d.warn - d.up)) / BAR_DROP_TIME);
      const lift = (1 - drop) * (d.height + POST_HEIGHT);
      const rq = roadQuat(r, h.s0);
      const spans: [number, number][] = [
        [h.minX, d.offset - d.opening / 2],
        [d.offset + d.opening / 2, h.maxX],
      ];
      spans.forEach(([a, b], j) => {
        if (b - a <= 0 || drop === 0) {
          hide(bars, k * 2 + j);
          return;
        }
        m4.compose(at(r, h.s0, (a + b) / 2, d.height / 2 + lift), rq, sc.set(b - a, d.height, BAR_DEPTH));
        bars.setMatrixAt(k * 2 + j, m4);
      });
    });

    bodySlots.forEach(({ r, h }, k) => {
      const d = h.def as Def<'sweeper'>;
      m4.compose(at(r, h.s0, sweeperX(d, time), d.height / 2), roadQuat(r, h.s0), sc.set(d.radius, d.height, d.radius));
      bodies.setMatrixAt(k, m4);
    });

    gusts.forEach(({ r, h }, g) => {
      const d = h.def as Def<'gust'>;
      const push = gustStrength(d, time) / Math.max(1e-6, Math.abs(d.strength));
      for (let k = 0; k < STREAKS_PER_GUST; k++) {
        const n = g * STREAKS_PER_GUST + k;
        if (push < STREAK_MIN_PUSH) {
          hide(streaks, n);
          continue;
        }
        const seed = streakSeeds[n];
        const s = h.s0 + (h.s1 - h.s0) * seed.u;
        const span = h.maxX - h.minX + 40;
        // Streaks travel the push direction and wrap round across the road.
        const travel = (time * STREAK_SPEED * Math.abs(d.strength) * 0.25 + seed.w * span) % span;
        const x = Math.sign(d.strength) > 0 ? h.minX - 20 + travel : h.maxX + 20 - travel;
        const f = r.frameAt(s, frame);
        const p = at(r, s, x, 0.5 + seed.w * STREAK_TOP);
        // Face along the road so the pilot sees each streak broadside.
        basis.makeBasis(new THREE.Vector3(f.right.x, 0, f.right.z).normalize(), yUp, new THREE.Vector3(-f.tangent.x, 0, -f.tangent.z).normalize());
        q.setFromRotationMatrix(basis);
        m4.compose(p, q, sc.set(STREAK_LENGTH * push, STREAK_THICK, 1));
        streaks.setMatrixAt(n, m4);
      }
    });

    for (const m of [rings, shadows, debris, dust, lamps, bars, bodies, streaks]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  };
  update(0);
  return {
    objects,
    update,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** A beacon post at the roadside, square in section. */
function post(b: FlatBuilder, r: Ribbon, s: number, x: number) {
  const f = r.frameAt(s);
  const base = r.toWorld(s, x, -1);
  const h = POST_WIDTH;
  const corner = (u: number, w: number, y: number): P3 => ({
    x: base.x + f.right.x * u * h + f.tangent.x * w * h,
    y: base.y + y,
    z: base.z + f.right.z * u * h + f.tangent.z * w * h,
  });
  const ring: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const top = POST_HEIGHT + 1;
  for (let i = 0; i < 4; i++) {
    const [u0, w0] = ring[i];
    const [u1, w1] = ring[(i + 1) % 4];
    const out = { x: f.right.x * (u0 + u1) + f.tangent.x * (w0 + w1), y: 0, z: f.right.z * (u0 + u1) + f.tangent.z * (w0 + w1) };
    quadFacing(b, corner(u0, w0, 0), corner(u1, w1, 0), corner(u1, w1, top), corner(u0, w0, top), out, POST_COLOUR);
  }
}

/** Yellow-and-black danger band painted across the road where something crosses it. */
function band(glow: FlatBuilder, paint: Paint, r: Ribbon, s: number, x0: number, x1: number) {
  const f = r.frameAt(s);
  const blocks = Math.ceil((x1 - x0) / KERB_BLOCK);
  for (let i = 0; i < blocks; i++) {
    const a = x0 + ((x1 - x0) * i) / blocks;
    const b = x0 + ((x1 - x0) * (i + 1)) / blocks;
    const p = (x: number, ds: number) => r.toWorld(s + ds, x, BAND_LIFT);
    quadFacing(glow, p(a, -BAND_WIDTH / 2), p(b, -BAND_WIDTH / 2), p(b, BAND_WIDTH / 2), p(a, BAND_WIDTH / 2), f.up, i % 2 === 0 ? paint.hazard : paint.black);
  }
}
