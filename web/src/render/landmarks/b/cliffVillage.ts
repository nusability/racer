// The cliff village: a twin-lobed mesa whose track-facing side is cut into terraces, each
// ledge lined with dwellings and glowing windows. Rope bridges span the cleft and reach a
// lone hoodoo, ladders climb between ledges, shade sails flap, cable cars glide between
// the ground station and the summits, and birds wheel overhead. It stands alone.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from './kit.ts';
import type { Motion, V3 } from './motion.ts';
import { beam, box, catenary, mix, pick, prism, quad, shade, vary } from './shapes.ts';
import { lampString, quadPts, rope } from './props.ts';

const SALT = 0xc11ff;
const RADIUS = 135;

interface Lobe {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  /** Strata heights from the ground up. */
  layers: readonly number[];
  /** z of the cut face at the base; each layer above steps back by RECEDE. */
  front: number;
  /** Fraction each stratum narrows by relative to the one below. */
  taper: number;
}
const LOBES: readonly Lobe[] = [
  { cx: -66, cz: 40, rx: 60, rz: 60, layers: [34, 30, 28, 26, 22], front: -6, taper: 0.07 },
  { cx: 68, cz: 34, rx: 58, rz: 54, layers: [30, 28, 30, 26], front: -2, taper: 0.08 },
];
const HOODOO: Lobe = { cx: -2, cz: -34, rx: 13, rz: 12, layers: [26, 22, 18], front: -60, taper: 0.16 };
const RECEDE = 9;
/** Rock roughness (metres) and facet count of each stratum. */
const ROUGHNESS = 5;
const SIDES = 16;
const DWELLINGS_PER_LEDGE = { high: 6, low: 3 } as const;
const FACE_WINDOWS = { high: 7, low: 4 } as const;
const BIRDS = { high: 14, low: 6 } as const;
const CROWD = { high: 110, low: 50 } as const;
const CABLE_CAR_SPEED = 0.16;

/** Deterministic per-position noise so shared vertices of a stratum move together. */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(Math.round(x * 10) ^ seed, 0x27d4eb2d) ^ Math.imul(Math.round(y * 10), 0x165667b1) ^ Math.imul(Math.round(z * 10), 0x1b873593);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

/** One rough elliptical stratum whose −Z side is sliced flat at `frontZ` (the cut face). */
function stratum(kit: Kit, l: Lobe, y0: number, h: number, shrink: number, frontZ: number, color: THREE.Color, seed: number): void {
  const geo = new THREE.CylinderGeometry(1 - shrink, 1, h, SIDES, 2);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const ox = pos.getX(i);
    const oy = pos.getY(i);
    const oz = pos.getZ(i);
    const n = hash3(ox, oy, oz, seed);
    const x = l.cx + ox * l.rx + n * ROUGHNESS;
    let z = l.cz + oz * l.rz + hash3(oz, ox, oy, seed) * ROUGHNESS;
    // The cut face: everything in front of the plane is pressed onto it, barely roughened.
    if (z < frontZ) z = frontZ + Math.abs(n) * 0.6;
    pos.setXYZ(i, x, y0 + h / 2 + oy + (Math.abs(oy) < h / 2 - 0.01 ? n * 1.5 : 0), z);
  }
  kit.solid.add(geo, color);
}

/** Builds a lobe's strata and returns each ledge: its height and front z. */
function mesa(kit: Kit, l: Lobe, seed: number): { y: number; front: number; halfWidth: number }[] {
  const rock = new THREE.Color(kit.palette.rock);
  const light = mix(kit.palette.rock, kit.palette.sand, 0.45);
  const ledges: { y: number; front: number; halfWidth: number }[] = [];
  let y = 0;
  l.layers.forEach((h, k) => {
    const front = l.front + k * RECEDE;
    const color = vary(kit.rng, k % 2 ? light : rock, 0.05);
    const s = 1 - l.taper * k;
    const layer = { ...l, rx: l.rx * s, rz: l.rz * s };
    stratum(kit, layer, y, h, l.taper, front, color, seed + k);
    // A thin darker band at each stratum's foot reads as a ledge lip from afar.
    stratum(kit, { ...layer, rx: layer.rx * 1.01, rz: layer.rz * 1.01 }, y, 1.6, 0, front - 0.6, shade(color, 0.72), seed + k + 50);
    y += h;
    const t = (front + RECEDE - l.cz) / layer.rz;
    ledges.push({ y, front: front + RECEDE, halfWidth: layer.rx * (1 - l.taper) * Math.sqrt(Math.max(0, 1 - t * t)) * 0.8 });
  });
  return ledges;
}

function dwelling(kit: Kit, x: number, y: number, faceZ: number, adobe: THREE.Color): void {
  const { rng } = kit;
  const w = 7 + rng() * 6;
  const h = 6 + rng() * 3.5;
  const d = 6;
  const z = faceZ - d / 2 + 0.6;
  kit.solid.add(box(w, h, d), vary(rng, adobe, 0.08), new THREE.Matrix4().makeTranslation(x, y, z));
  kit.solid.add(box(w + 0.8, 0.5, d + 0.8), shade(adobe, 0.8), new THREE.Matrix4().makeTranslation(x, y + h, z));
  kit.solid.add(quad(1.3, 2.2), 0x24140c, new THREE.Matrix4().makeTranslation(x - w * 0.2, y + 1.1, z - d / 2 - 0.05));
  kit.lights.add(quad(1, 1.1), pick(rng, [0xffc070, 0xffa850, 0xffe0a0]), new THREE.Matrix4().makeTranslation(x + w * 0.22, y + h * 0.6, z - d / 2 - 0.06), undefined, { depth: 0.25, freq: 0.5 + rng(), phase: rng() * 6 });
  // A striped shade sail over some doorways, flapping.
  if (rng() < 0.6) {
    const top: V3 = [x, y + h - 0.3, z - d / 2];
    const col = kit.festiveColor();
    kit.moving.add(quadPts([x - 3, top[1], top[2]], [x + 3, top[1], top[2]], [x + 2.6, top[1] - 1.2, top[2] - 3.4], [x - 2.6, top[1] - 1.2, top[2] - 3.4]), col, undefined, { pivot: top, axisB: [1, 0, 0], swingB: 0.12, freq: 2.8, phase: x });
  }
}

function ladder(kit: Kit, x: number, y0: number, y1: number, z: number): void {
  const wood = 0x6a4a30;
  for (const dx of [-0.5, 0.5]) kit.solid.add(beam([x + dx, y0, z], [x + dx, y1 + 1, z - 0.6], 0.08, 3), wood);
  for (let y = y0 + 1; y < y1; y += 1.4) kit.solid.add(beam([x - 0.5, y, z - 0.6 * ((y - y0) / (y1 - y0))], [x + 0.5, y, z - 0.6 * ((y - y0) / (y1 - y0))], 0.05, 3), wood);
}

/** A sagging plank bridge with hand ropes. */
function bridge(kit: Kit, a: V3, b: V3, sag: number): void {
  const planks = catenary(a, b, sag, 14);
  const dir = new THREE.Vector3(b[0] - a[0], 0, b[2] - a[2]).normalize();
  const yaw = Math.atan2(dir.x, dir.z);
  for (let i = 0; i < planks.length; i++) {
    const p = planks[i];
    kit.solid.add(box(2.4, 0.2, 1.1), vary(kit.rng, 0x8a6a48, 0.1), new THREE.Matrix4().makeRotationY(yaw + Math.PI / 2).setPosition(p[0], p[1], p[2]));
  }
  const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(1.2);
  for (const s of [-1, 1]) rope(kit, [a[0] + side.x * s, a[1] + 1.2, a[2] + side.z * s], [b[0] + side.x * s, b[1] + 1.2, b[2] + side.z * s], sag);
  for (const end of [a, b]) kit.solid.add(box(4, 0.6, 4), 0x6a4a30, new THREE.Matrix4().makeTranslation(end[0], end[1] - 0.6, end[2]));
}

/** A cable car shuttling along a straight cable between two stations. */
function cableCar(kit: Kit, a: V3, b: V3, phase: number): void {
  kit.solid.add(beam(a, b, 0.12, 3), 0x2a2a2a);
  for (const end of [a, b]) kit.solid.add(box(5, 4, 5), 0x5a4a40, new THREE.Matrix4().makeTranslation(end[0], end[1] - 2, end[2]));
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const half: V3 = [(b[0] - a[0]) * 0.44, (b[1] - a[1]) * 0.44, (b[2] - a[2]) * 0.44];
  const ride: Motion = { drift: half, driftFreq: CABLE_CAR_SPEED, phase };
  const col = kit.festiveColor();
  kit.moving.add(beam(mid, [mid[0], mid[1] - 2.5, mid[2]], 0.08, 3), 0x2a2a2a, undefined, ride);
  kit.moving.add(box(3.2, 2.8, 3.2), col, new THREE.Matrix4().makeTranslation(mid[0], mid[1] - 5.3, mid[2]), ride);
  kit.moving.add(box(3.8, 0.5, 3.8), shade(col, 0.6), new THREE.Matrix4().makeTranslation(mid[0], mid[1] - 2.6, mid[2]), ride);
  kit.lights.add(box(3.3, 0.9, 3.3), 0xffd8a0, new THREE.Matrix4().makeTranslation(mid[0], mid[1] - 4.4, mid[2]), ride, { depth: 0.1, freq: 1, phase: 0 });
}

/** A bird circling a thermal: body plus two flapping wings. */
function bird(kit: Kit, i: number): void {
  const { rng } = kit;
  const hub: V3 = [(rng() - 0.5) * 120, 165 + rng() * 40, 30 + (rng() - 0.5) * 60];
  const r = 18 + rng() * 26;
  const p: V3 = [hub[0] + r, hub[1], hub[2]];
  const orbit = { hub, axisA: [0, 1, 0] as V3, spinA: 0.35 + rng() * 0.2, drift: [0, 4, 0] as V3, driftFreq: 0.3 };
  const dark = 0x2a2420;
  kit.moving.add(box(0.5, 0.4, 2.2), dark, new THREE.Matrix4().makeTranslation(p[0], p[1], p[2]), orbit);
  for (const s of [-1, 1]) {
    const wing = quadPts(p, [p[0] + s * 3.4, p[1], p[2] + 0.6], [p[0] + s * 3.4, p[1], p[2] + 1.4], [p[0], p[1], p[2] + 0.9]);
    kit.moving.add(wing, dark, undefined, { ...orbit, pivot: p, axisB: [0, 0, s], swingB: 0.5, freq: 5 + rng(), phase: i });
  }
}

export function createCliffVillage(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const { rng } = kit;
  const adobe = mix(kit.palette.sand, 0xf0dcc0, 0.4);
  const ledgesByLobe = LOBES.map((l, i) => mesa(kit, l, 100 * (i + 1)));
  const hoodooLedges = mesa(kit, HOODOO, 900);

  LOBES.forEach((l, li) => {
    const ledges = ledgesByLobe[li];
    let face = l.front;
    let y0 = 0;
    ledges.forEach((ledge, k) => {
      // Windows and doorways cut straight into this stratum's face.
      for (let w = 0; w < kit.q(FACE_WINDOWS.high, FACE_WINDOWS.low); w++) {
        const x = l.cx + (rng() * 2 - 1) * ledge.halfWidth;
        const y = y0 + 4 + rng() * (ledge.y - y0 - 8);
        kit.solid.add(quad(2.6, 3.4), 0x24140c, new THREE.Matrix4().makeTranslation(x, y, face - 0.2));
        if (rng() < 0.7) kit.lamp(quad(1.4, 1.8), [x, y + 0.2, face - 0.3], pick(rng, [0xffc070, 0xffa850, 0xff8a50]), 0, undefined, { depth: 0.3, freq: 0.4 + rng(), phase: rng() * 6 });
      }
      if (k < ledges.length - 1) {
        for (let d = 0; d < kit.q(DWELLINGS_PER_LEDGE.high, DWELLINGS_PER_LEDGE.low); d++) {
          const x = l.cx + (d / Math.max(1, kit.q(DWELLINGS_PER_LEDGE.high, DWELLINGS_PER_LEDGE.low) - 1) - 0.5) * ledge.halfWidth * 1.6 + (rng() - 0.5) * 4;
          dwelling(kit, x, ledge.y, ledge.front, adobe);
        }
        ladder(kit, l.cx + (rng() - 0.5) * ledge.halfWidth, ledge.y, ledges[k + 1].y, ledge.front - 0.4);
        const edge = ledge.front - RECEDE + 1.5;
        lampString(kit, [l.cx - ledge.halfWidth, ledge.y + 6, edge], [l.cx + ledge.halfWidth, ledge.y + 6, edge], 2.5, kit.q(12, 6), 0.3, 2.2);
        // Folk walking the ledge.
        for (let p = 0; p < kit.q(CROWD.high, CROWD.low) / 8; p++) {
          kit.crowd({ x: l.cx + (rng() * 2 - 1) * ledge.halfWidth, y: ledge.y, z: ledge.front - RECEDE * (0.25 + rng() * 0.3), ry: Math.PI / 2, color: kit.festiveColor(), hop: 0.1, freq: 7, phase: rng() * 100, walk: 3 + rng() * 6, walkFreq: 0.15 + rng() * 0.1 });
        }
      }
      face = ledge.front;
      y0 = ledge.y;
    });
    // Summit: huts, a water tank and a beacon.
    const top = ledges[ledges.length - 1];
    for (let h = 0; h < 3; h++) dwelling(kit, l.cx - 20 + h * 18, top.y, l.cz - 6 + h * 4, adobe);
    kit.solid.add(prism(4, 4, 6, 8), 0x7a8a90, new THREE.Matrix4().makeTranslation(l.cx + 18, top.y + 6, l.cz + 10));
    kit.solid.add(beam([l.cx + 18, top.y, l.cz + 10], [l.cx + 18, top.y + 6, l.cz + 10], 1.2, 4), 0x5a4a40);
    kit.solid.add(beam([l.cx, top.y, l.cz + 4], [l.cx, top.y + 22, l.cz + 4], 0.3, 4), 0x3a3030);
    kit.lamp(new THREE.OctahedronGeometry(1), [l.cx, top.y + 23, l.cz + 4], 0xff4030, 7, undefined, { depth: 1, freq: 2, phase: li, sharp: 6 });
    // Long cloth banners hanging down the top face.
    for (let b = 0; b < 3; b++) {
      const x = l.cx - 20 + b * 20;
      const anchor: V3 = [x, top.y - 0.5, l.front + (ledges.length - 1) * RECEDE - 1];
      kit.moving.add(quad(4, 18), kit.festiveColor(), new THREE.Matrix4().makeTranslation(anchor[0], anchor[1] - 9, anchor[2]), { pivot: anchor, axisB: [1, 0, 0], swingB: 0.05, freq: 1.4, phase: b + li });
    }
  });

  // Rope bridges across the cleft and out to the hoodoo.
  const [a, b] = LOBES;
  bridge(kit, [a.cx + a.rx * 0.93, ledgesByLobe[0][1].y, a.cz - 8], [b.cx - b.rx * 0.93, ledgesByLobe[1][1].y + 2, b.cz - 4], 4);
  bridge(kit, [a.cx + a.rx * 0.9, ledgesByLobe[0][2].y, a.cz + 4], [b.cx - b.rx * 0.9, ledgesByLobe[1][2].y, b.cz + 6], 5);
  const hoodooTop = hoodooLedges[hoodooLedges.length - 1];
  bridge(kit, [HOODOO.cx - 6, hoodooTop.y, HOODOO.cz + 6], [a.cx + 20, hoodooTop.y + 4, a.front + RECEDE * 2 + 1], 6);
  dwelling(kit, HOODOO.cx, hoodooTop.y, HOODOO.cz + 3, adobe);
  kit.lamp(new THREE.OctahedronGeometry(0.8), [HOODOO.cx + 3, hoodooTop.y + 9, HOODOO.cz], 0xffd27a, 6, undefined, { depth: 0.4, freq: 1.7, phase: 0 });

  // Cable cars: ground station to the east summit, and summit to summit across the cleft.
  const groundStation: V3 = [40, 6, -62];
  cableCar(kit, groundStation, [b.cx - 10, ledgesByLobe[1][3].y + 6, b.cz - 8], 0);
  cableCar(kit, [a.cx + 14, ledgesByLobe[0][4].y + 7, a.cz], [b.cx - 14, ledgesByLobe[1][3].y + 7, b.cz + 6], 2);
  cableCar(kit, [-100, 6, -40], [HOODOO.cx - 8, hoodooTop.y + 6, HOODOO.cz], 4);

  // Village at the foot: a few houses and folk round the station.
  for (let i = 0; i < 8; i++) dwelling(kit, -110 + i * 30 + rng() * 6, 0, -12 + (i % 2) * 5 + (i > 3 ? 2 : -6), adobe);
  for (let i = 0; i < kit.q(CROWD.high, CROWD.low) / 3; i++) {
    kit.crowd({ x: (rng() - 0.5) * 220, y: 0, z: -25 - rng() * 30, ry: rng() * Math.PI * 2, color: kit.festiveColor(), hop: 0.1, freq: 7, phase: rng() * 100, walk: 2 + rng() * 5, walkFreq: 0.15 });
  }

  for (let i = 0; i < kit.q(BIRDS.high, BIRDS.low); i++) bird(kit, i);
  return kit.finish(RADIUS);
}
