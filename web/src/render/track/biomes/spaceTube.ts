import * as THREE from 'three';
import { range, type Rng } from '../../../core/rng.ts';
import type { P3 } from '../builder.ts';
import { TUNNEL_RIBS, type Quality } from '../config.ts';
import type { Corridor } from '../corridor.ts';
import { beats } from '../rhythm.ts';
import { hullOutline } from '../tunnel.ts';
import { StationMesh, axisFrame } from './stationMesh.ts';
import { light, type Lights } from './spaceStation.ts';

// The station tube, inside and out. Inside: steel ribs round the bore at every ceiling light,
// their inner faces bands of light. Outside, on the chamfered pressure hull the corridor draws
// (render/track/tunnel.ts): ring frames standing proud of it, pipe runs along its flanks, glass
// galleries in its walls, and on its back and belly the station's working kit: lying and
// standing drums, radiator fins, masts with dishes, tanks. A heavy hazard-striped collar rings
// each mouth. Merged into one station mesh per stretch of tube, so each culls on its own.

/** Exterior dressing is merged per this many metres of tube. */
const TUBE_CHUNK = 2000;
/** Ring frames round the hull every this many metres: how deep along the tube, how proud of the hull; every n-th one striped. */
const FRAME_EVERY = 36;
const FRAME_DEPTH = 3;
const FRAME_PROUD = 1.4;
const FRAME_STRIPED_EVERY = 4;
/** The mouths' collars: deep and proud. */
const COLLAR_DEPTH = 7;
const COLLAR_PROUD = 3.2;
/** The portal's face: things on it stand this proud; its glass galleries (from the bore's edge in, shares of the hull's height); the band over the mouth (m over the ceiling) and its gain; the strips under the galleries. */
const PORTAL_PROUD = 0.25;
const PORTAL_GALLERY = { inset: 4, from: 0.4, to: 0.72 } as const;
const PORTAL_BAND: readonly [number, number] = [3, 5];
const PORTAL_BAND_GAIN = 2.2;
const PORTAL_STRIP = new THREE.Color(1.9, 2.1, 2.3);
const PORTAL_STRIP_HEIGHT = 0.8;
/** Pipe runs along each flank: their radii and where they lie across the flank (share of the face). */
const PIPES: readonly (readonly [number, number])[] = [
  [1.1, 0.25],
  [0.7, 0.42],
  [1.5, 0.62],
];
/** Glass galleries in the upper flanks: the share of frame bays that have one, and where it lies across the face. */
const GALLERY_SHARE = 0.45;
const GALLERY: readonly [number, number] = [0.3, 0.55];
/** Kit on the hull's back every this many metres, and hung under it. */
const TOP_EVERY = 64;
const BELLY_EVERY = 90;
/** Kit sizes (m). */
const LYING_DRUM = { r: [5, 10], len: [24, 52] } as const;
const STANDING_DRUM = { r: [7, 13], h: [8, 26] } as const;
const FIN = { len: [22, 38], h: [10, 18], thick: 0.8 } as const;
const MAST = { h: [26, 52], dish: [4, 8] } as const;
const TANK = [4, 9] as const;
/** Kit never stands nearer the hull's edge than this (m). */
const EDGE_KEEP = 3;

/** Tube ribs: their depth along the road, how far they stand in from the bore, and from what height up the walls. */
const RIB_DEPTH = 1.2;
const RIB_INSET = 0.8;
const RIB_FOOT = 2.8;
/** Bore shape (render/track/tunnel.ts): walls rise to this share of the ceiling, the roof chamfers in to this share of the half width. */
const BORE_WALL = 0.62;
const BORE_CHAMFER = 0.72;
/** Ribs keep this far inside the tube's mouths. */
const RIB_MOUTH_CLEAR = 8;
/** Every rib's inner face is a light band; every n-th one is accent-coloured (HDR). */
const RIB_LIGHT = new THREE.Color(1.6, 1.75, 2);
const RIB_ACCENT_EVERY = 4;
const RIB_ACCENT_GAIN = 2.4;

/** Paint (sRGB) and light (HDR). */
const HULL = [0x9aa1ab, 0x868d97, 0x737a84];
const STEEL = 0x6c737e;
const STEEL_DARK = 0x464b54;
const RIB_STEEL = 0x585e68;
const FOIL = 0xb08640;
const GLASS = 0x2a3a52;
const RADIATOR = 0x80878f;
const BEACON = new THREE.Color(3, 0.25, 0.15);
const RUNNING = new THREE.Color(1.2, 1.4, 1.7);
const FLOOD = new THREE.Color(2.4, 1.8, 1.1);
const BEACON_SIZE = 6;
const RUNNING_SIZE = 2.4;
const FLOOD_SIZE = 5;

/** The hull's outline at sample k in world space (closed: left foot, flank, top, flank, right foot). */
function outline(cor: Corridor, k: number): [number, number][] {
  const smp = cor.ribbon.samples[cor.idx(k)];
  return hullOutline(smp.width / 2, smp.ceiling);
}

/** A closed outline moved `d` outward (mitred at the corners). The outline runs clockwise (y up). */
function grow(line: [number, number][], d: number): [number, number][] {
  const n = line.length;
  const normal = (i: number): [number, number] => {
    const [x0, y0] = line[i];
    const [x1, y1] = line[(i + 1) % n];
    const l = Math.hypot(x1 - x0, y1 - y0);
    return [-(y1 - y0) / l, (x1 - x0) / l];
  };
  return line.map(([x, y], i) => {
    const a = normal((i + n - 1) % n);
    const b = normal(i);
    const mx = a[0] + b[0];
    const my = a[1] + b[1];
    const l = Math.hypot(mx, my);
    const k = d / Math.max(0.5, (mx * a[0] + my * a[1]) / l) / l;
    return [x + mx * k, y + my * k];
  });
}

/** A point in the road frame of sample k: lateral x, height y, ds metres along. */
function roadPoint(cor: Corridor, k: number, x: number, y: number, ds: number): THREE.Vector3 {
  const smp = cor.ribbon.samples[cor.idx(k)];
  const p = cor.banked(k, x, y);
  return new THREE.Vector3(p.x + smp.tangent.x * ds, p.y + smp.tangent.y * ds, p.z + smp.tangent.z * ds);
}

function vec(p: P3): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z);
}

/**
 * A band round the hull at sample k, `depth` along the road and `proud` off the hull: its outer
 * face in the current paint, its two sides in `rim` (striped on a mouth's collar).
 */
function band(mesh: StationMesh, cor: Corridor, k: number, depth: number, proud: number, rim: 'steel' | 'hazard'): void {
  const inner = outline(cor, k);
  const outer = grow(inner, proud);
  const smp = cor.ribbon.samples[cor.idx(k)];
  const fwd = smp.tangent;
  const back = { x: -fwd.x, y: -fwd.y, z: -fwd.z };
  const axis = cor.banked(k, 0, smp.ceiling / 2);
  const n = inner.length;
  const sides: [number, number, number][] = [];
  let run = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const P = (q: [number, number], ds: number) => roadPoint(cor, k, q[0], q[1], ds);
    const mid = P([(outer[i][0] + outer[j][0]) / 2, (outer[i][1] + outer[j][1]) / 2], 0);
    const out = { x: mid.x - axis.x, y: mid.y - axis.y, z: mid.z - axis.z };
    const len = Math.hypot(outer[j][0] - outer[i][0], outer[j][1] - outer[i][1]);
    sides.push([i, j, run]);
    mesh.face(P(outer[i], -depth / 2), P(outer[j], -depth / 2), P(outer[j], depth / 2), P(outer[i], depth / 2), out, [run, 0]);
    run += len;
  }
  mesh.paint(rim, rim === 'hazard' ? 0xffffff : STEEL_DARK, 2);
  for (const [i, j, u] of sides) {
    const P = (q: [number, number], ds: number) => roadPoint(cor, k, q[0], q[1], ds);
    for (const [ds, dir] of [[-depth / 2, back], [depth / 2, fwd]] as const) mesh.face(P(inner[i], ds), P(inner[j], ds), P(outer[j], ds), P(outer[i], ds), dir, [u, 0]);
  }
}

/** The tube's exterior and its ribs, one station mesh per stretch of tube (see the header). */
export function tubeDressing(cor: Corridor, rng: Rng, quality: Quality, lights: Lights): StationMesh[] {
  const r = cor.ribbon;
  const chunks = new Map<number, StationMesh>();
  const chunk = (s: number) => {
    const id = Math.floor(s / TUBE_CHUNK);
    let m = chunks.get(id);
    if (!m) chunks.set(id, (m = new StationMesh()));
    return m;
  };
  const at = (s: number) => Math.round(s / r.step);
  const inTube = (s: number) => cor.tunnel(at(s));

  // Mouth collars: wherever the tube starts or ends.
  for (let k = 1; k < cor.n; k++) {
    if (cor.tunnel(k) === cor.tunnel(k - 1)) continue;
    const kk = cor.tunnel(k) ? k : k - 1;
    const s = kk * r.step;
    const dir = cor.tunnel(k) ? 1 : -1;
    const mesh = chunk(s);
    mesh.paint('steel', STEEL, 1);
    // Just inside the mouth, so the collar's face is flush with the portal.
    const kc = kk + Math.round((dir * COLLAR_DEPTH) / 2 / r.step);
    band(mesh, cor, kc, COLLAR_DEPTH, COLLAR_PROUD, 'hazard');
    const o = grow(outline(cor, kc), COLLAR_PROUD);
    for (const i of [1, 2, 3, 4]) light(lights, roadPoint(cor, kc, o[i][0], o[i][1], (-dir * COLLAR_DEPTH) / 2), FLOOD, FLOOD_SIZE, 0, 0);
    portalFace(mesh, cor, kk, dir);
  }

  let frame = 0;
  for (let s = FRAME_EVERY / 2; s < r.length; s += FRAME_EVERY) {
    if (!inTube(s - COLLAR_DEPTH * 2) || !inTube(s + COLLAR_DEPTH * 2)) continue;
    const k = at(s);
    const mesh = chunk(s);
    const striped = frame++ % FRAME_STRIPED_EVERY === 0;
    mesh.paint('steel', STEEL_DARK, 2);
    band(mesh, cor, k, FRAME_DEPTH, FRAME_PROUD, striped ? 'hazard' : 'steel');
    const o = grow(outline(cor, k), FRAME_PROUD);
    for (const i of [2, 3]) light(lights, roadPoint(cor, k, o[i][0], o[i][1] + 0.6, 0), RUNNING, RUNNING_SIZE, 0, 0);
    // To the next frame: pipes along the flanks, a gallery now and then.
    const s1 = s + FRAME_EVERY;
    if (!inTube(s1 + COLLAR_DEPTH * 2)) continue;
    const k1 = at(s1);
    const a = outline(cor, k);
    const b = outline(cor, k1);
    for (const side of [0, 4] as const) {
      // The lower flanks (left 0→1, right 4→5): pipes laid along the tube across them.
      const seg = (l: [number, number][], t: number, lift: number): [number, number] => {
        const [x0, y0] = l[side];
        const [x1, y1] = l[side + 1];
        const len = Math.hypot(x1 - x0, y1 - y0);
        const nx = -(y1 - y0) / len;
        const ny = (x1 - x0) / len;
        return [x0 + (x1 - x0) * t + nx * lift, y0 + (y1 - y0) * t + ny * lift];
      };
      if (quality === 'high') {
        for (const [pr, t] of PIPES) {
          const p0 = seg(a, t, pr + 0.2);
          const p1 = seg(b, t, pr + 0.2);
          const A = roadPoint(cor, k, p0[0], p0[1], FRAME_DEPTH / 2);
          const B = roadPoint(cor, k1, p1[0], p1[1], -FRAME_DEPTH / 2);
          mesh.at(axisFrame(A.clone().lerp(B, 0.5), B.clone().sub(A))).paint('steel', STEEL, 3).cylinder(pr, pr, A.distanceTo(B), 6, {});
        }
      }
    }
    if (rng() < GALLERY_SHARE) {
      for (const side of [1, 3] as const) {
        // Upper flank (left: 1→2, right: 3→4): a glass strip set just proud of the plates.
        const g = (l: [number, number][], t: number): [number, number] => {
          const [x0, y0] = l[side];
          const [x1, y1] = l[side + 1];
          const len = Math.hypot(x1 - x0, y1 - y0);
          return [x0 + (x1 - x0) * t - ((y1 - y0) / len) * 0.25, y0 + (y1 - y0) * t + ((x1 - x0) / len) * 0.25];
        };
        const [t0, t1] = side === 1 ? GALLERY : [1 - GALLERY[1], 1 - GALLERY[0]];
        const mid = cor.banked(k, 0, cor.ribbon.samples[cor.idx(k)].ceiling / 2);
        const q = roadPoint(cor, k, g(a, t0)[0], g(a, t0)[1], FRAME_DEPTH / 2);
        mesh.paint('glass', GLASS, 4 + frame).face(q, roadPoint(cor, k1, g(b, t0)[0], g(b, t0)[1], -FRAME_DEPTH / 2), roadPoint(cor, k1, g(b, t1)[0], g(b, t1)[1], -FRAME_DEPTH / 2), roadPoint(cor, k, g(a, t1)[0], g(a, t1)[1], FRAME_DEPTH / 2), { x: q.x - mid.x, y: q.y - mid.y, z: q.z - mid.z });
      }
    }
  }

  // The working kit on the hull's back and belly.
  for (let s = TOP_EVERY / 2; s < r.length; s += TOP_EVERY) {
    if (!inTube(s - TOP_EVERY / 2) || !inTube(s + TOP_EVERY / 2)) continue;
    topKit(chunk(s), cor, at(s), rng, quality, lights);
  }
  for (let s = BELLY_EVERY / 2; s < r.length; s += BELLY_EVERY) {
    if (!inTube(s - BELLY_EVERY / 2) || !inTube(s + BELLY_EVERY / 2)) continue;
    bellyKit(chunk(s), cor, at(s), rng);
  }

  ribs(cor, chunk);
  return [...chunks.values()];
}

/**
 * The portal's face round a mouth (sample k, the tube running `dir` from it): a gallery of lit
 * glass on each flank, a band of the accent's light over the mouth and a strip under each
 * gallery, so the face reads as the station's front, not a bare plate.
 */
function portalFace(mesh: StationMesh, cor: Corridor, k: number, dir: number): void {
  const smp = cor.ribbon.samples[cor.idx(k)];
  const h = smp.width / 2;
  const c = smp.ceiling;
  const o = outline(cor, k);
  const top = o[2][1];
  const wide = -o[1][0];
  const out = vec(smp.tangent).multiplyScalar(-dir);
  const P = (x: number, y: number) => roadPoint(cor, k, x, y, -dir * PORTAL_PROUD);
  for (const sx of [-1, 1]) {
    const x0 = sx * (h + PORTAL_GALLERY.inset);
    const x1 = sx * (wide - PORTAL_GALLERY.inset);
    const y0 = top * PORTAL_GALLERY.from;
    const y1 = top * PORTAL_GALLERY.to;
    mesh.paint('glass', GLASS, 90 + sx).face(P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1), out);
    mesh.paint('glow', PORTAL_STRIP, 0, false).face(P(x0, y0 - PORTAL_STRIP_HEIGHT * 2), P(x1, y0 - PORTAL_STRIP_HEIGHT * 2), P(x1, y0 - PORTAL_STRIP_HEIGHT), P(x0, y0 - PORTAL_STRIP_HEIGHT), out);
  }
  const band = cor.paint.accent.clone().multiplyScalar(PORTAL_BAND_GAIN);
  mesh.paint('glow', band, 0, false).face(P(-h * BORE_CHAMFER, c + PORTAL_BAND[0]), P(h * BORE_CHAMFER, c + PORTAL_BAND[0]), P(h * BORE_CHAMFER, c + PORTAL_BAND[1]), P(-h * BORE_CHAMFER, c + PORTAL_BAND[1]), out);
}

/** The hull's back at sample k: its frame (x across, y up, z along) at the top face's centre, and the face's half width. */
function topFrame(cor: Corridor, k: number, y: number): { m: (x: number, h: number, ds: number) => THREE.Vector3; half: number; up: THREE.Vector3; fwd: THREE.Vector3 } {
  const smp = cor.ribbon.samples[cor.idx(k)];
  const o = outline(cor, k);
  const top = y > 0 ? o[2][1] : o[0][1];
  const half = Math.abs(y > 0 ? o[2][0] : o[0][0]);
  return {
    m: (x, h, ds) => roadPoint(cor, k, x, top + h, ds),
    half,
    up: vec(smp.up).normalize(),
    fwd: vec(smp.tangent).normalize(),
  };
}

function topKit(mesh: StationMesh, cor: Corridor, k: number, rng: Rng, quality: Quality, lights: Lights): void {
  const t = topFrame(cor, k, 1);
  const roll = rng();
  const tint = new THREE.Color(HULL[Math.floor(rng() * HULL.length)]);
  if (roll < 0.3) {
    // A drum lying along the tube on saddles, domed at both ends.
    const r = range(rng, LYING_DRUM.r[0], LYING_DRUM.r[1]);
    const len = range(rng, LYING_DRUM.len[0], LYING_DRUM.len[1]);
    const x = range(rng, -t.half + r + EDGE_KEEP, t.half - r - EDGE_KEEP);
    const c = t.m(x, r + 1.5, 0);
    mesh.at(axisFrame(c, t.fwd)).paint(rng() < 0.3 ? 'foil' : 'hull', rng() < 0.3 ? FOIL : tint, 10 + k).cylinder(r, r, len, 20, { rings: 3 });
    for (const s of [-1, 1]) mesh.at(axisFrame(c.clone().addScaledVector(t.fwd, (s * len) / 2), t.fwd.clone().multiplyScalar(s))).paint('hull', tint, 11).dome(r, 20, 4, 0.45);
    for (const s of [-0.3, 0.3]) {
      const p = t.m(x, 0.75, s * len);
      mesh.at(axisFrame(p, t.up, 0, t.fwd)).paint('steel', STEEL_DARK, 12).box(2, 1.5 + r * 0.5, r * 1.6);
    }
  } else if (roll < 0.5) {
    // A standing drum under a glass dome.
    const r = range(rng, STANDING_DRUM.r[0], STANDING_DRUM.r[1]);
    const h = range(rng, STANDING_DRUM.h[0], STANDING_DRUM.h[1]);
    const x = range(rng, -t.half + r + EDGE_KEEP, t.half - r - EDGE_KEEP);
    mesh.at(axisFrame(t.m(x, h / 2, 0), t.up)).paint('hull', tint, 20 + k).cylinder(r, r, h, 20, { rings: 2 });
    mesh.at(axisFrame(t.m(x, h, 0), t.up)).paint('glass', GLASS, 21 + k).dome(r, 20, 5, 0.6);
    mesh.occluder(t.m(x, 0, 0), t.m(x, h, 0), r);
  } else if (roll < 0.7) {
    // Radiator fins standing along the tube, pale and ribbed, on a lattice spine.
    const len = range(rng, FIN.len[0], FIN.len[1]);
    const h = range(rng, FIN.h[0], FIN.h[1]);
    for (const x of [-t.half * 0.45, t.half * 0.45]) {
      mesh.at(axisFrame(t.m(x, h / 2 + 2, 0), t.up, 0, t.fwd)).paint('radiator', RADIATOR, 30).box(len, h, FIN.thick);
      mesh.paint('steel', STEEL_DARK, 31).beam(t.m(x, 0, -len / 2), t.m(x, 0, len / 2), 2, 4, t.up);
    }
  } else if (roll < 0.85) {
    // A mast with a dish and a beacon.
    const h = range(rng, MAST.h[0], MAST.h[1]);
    const x = range(rng, -t.half * 0.6, t.half * 0.6);
    mesh.paint('steel', STEEL_DARK, 40).truss(t.m(x, 0, 0), t.m(x, h, 0), 2.4, 3, 0.35, t.fwd);
    const dr = range(rng, MAST.dish[0], MAST.dish[1]);
    const dishAxis = t.fwd.clone().multiplyScalar(-1).add(t.up.clone().multiplyScalar(0.6)).normalize();
    const dc = t.m(x, h * 0.75, -1.5);
    mesh.at(axisFrame(dc, dishAxis)).paint('hull', HULL[0], 41).cylinder(dr * 0.15, dr, dr * 0.3, 16, {});
    mesh.at(axisFrame(dc.clone().addScaledVector(dishAxis, dr * 0.12), dishAxis)).paint('steel', STEEL, 42).cylinder(dr * 0.05, dr * 0.96, dr * 0.18, 16, {});
    light(lights, t.m(x, h + BEACON_SIZE / 2, 0), BEACON, BEACON_SIZE, range(rng, 1.6, 2.6), rng());
  } else {
    // An equipment block with a lit window strip and greebles on its roof.
    const w = range(rng, 10, t.half * 1.2);
    const d = range(rng, 14, 30);
    const h = range(rng, 5, 12);
    const x = range(rng, -t.half + w / 2 + EDGE_KEEP, t.half - w / 2 - EDGE_KEEP);
    mesh.at(axisFrame(t.m(x, h / 2, 0), t.up, 0, t.fwd)).paint('hull', tint, 50 + k).box(d, h, w);
    if (quality === 'high') {
      for (let i = 0; i < 4; i++) {
        const gw = range(rng, 1.5, 4);
        const gh = range(rng, 1, 3);
        mesh.at(axisFrame(t.m(x + range(rng, -w / 3, w / 3), h + gh / 2, range(rng, -d / 3, d / 3)), t.up, 0, t.fwd)).paint('steel', STEEL, 51).box(gw, gh, gw);
      }
    }
  }
}

function bellyKit(mesh: StationMesh, cor: Corridor, k: number, rng: Rng): void {
  const t = topFrame(cor, k, -1);
  const down = t.up.clone().negate();
  if (rng() < 0.5) {
    // A pair of sphere tanks slung under the hull.
    const r = range(rng, TANK[0], TANK[1]);
    for (const x of [-t.half * 0.4, t.half * 0.4]) {
      const c = t.m(x, -r - 1, 0);
      mesh.at(axisFrame(c, t.up)).paint('foil', FOIL, 60).dome(r, 16, 5);
      mesh.at(axisFrame(c, down)).paint('foil', FOIL, 61).dome(r, 16, 5);
      mesh.paint('steel', STEEL_DARK, 62).beam(t.m(x, 0, 0), c, 1.2, 1.2, t.fwd);
    }
  } else {
    // A hanging equipment pod.
    const w = range(rng, 10, t.half);
    const d = range(rng, 12, 28);
    const h = range(rng, 4, 10);
    mesh.at(axisFrame(t.m(0, -h / 2, 0), t.up, 0, t.fwd)).paint('hull', HULL[2], 63 + k).box(d, h, w);
  }
}

/** The bore's outline at sample k (banked frame: lateral, height), left wall foot to right wall foot. */
function bore(cor: Corridor, k: number): [number, number][] {
  const smp = cor.ribbon.samples[cor.idx(k)];
  const h = smp.width / 2;
  const c = smp.ceiling;
  return [
    [-h, RIB_FOOT],
    [-h, c * BORE_WALL],
    [-h * BORE_CHAMFER, c],
    [h * BORE_CHAMFER, c],
    [h, c * BORE_WALL],
    [h, RIB_FOOT],
  ];
}

/** The open outline moved `d` toward the bore's inside (mitred at the corners). */
function inset(line: [number, number][], d: number): [number, number][] {
  const n = line.length;
  // Inward normal of segment i (the outline runs left foot → over the top → right foot, so inward is to its right).
  const normal = (i: number): [number, number] => {
    const [x0, y0] = line[i];
    const [x1, y1] = line[i + 1];
    const l = Math.hypot(x1 - x0, y1 - y0);
    return [(y1 - y0) / l, -(x1 - x0) / l];
  };
  return line.map(([x, y], i) => {
    const a = normal(Math.max(0, i - 1));
    const b = normal(Math.min(n - 2, i));
    const mx = a[0] + b[0];
    const my = a[1] + b[1];
    const l = Math.hypot(mx, my);
    const k = d / Math.max(0.5, (mx * a[0] + my * a[1]) / l) / l;
    return [x + mx * k, y + my * k];
  });
}

/** Ribs round the tube at every ceiling light (TUNNEL_RIBS): steel frames whose inner faces are bands of light. */
function ribs(cor: Corridor, chunk: (s: number) => StationMesh): void {
  const r = cor.ribbon;
  const clear = Math.round(RIB_MOUTH_CLEAR / r.step);
  let n = 0;
  for (const s of beats(TUNNEL_RIBS, r.length)) {
    const k = Math.round(s / r.step);
    if (!cor.tunnel(k - clear) || !cor.tunnel(k + clear)) continue;
    const mesh = chunk(s);
    const outer = bore(cor, k);
    const inner = inset(outer, RIB_INSET);
    const smp = r.samples[cor.idx(k)];
    const fwd = smp.tangent;
    const back = { x: -fwd.x, y: -fwd.y, z: -fwd.z };
    const P = (q: [number, number], ds: number) => roadPoint(cor, k, q[0], q[1], ds);
    const axis = cor.banked(k, 0, smp.ceiling / 2);
    const glow = n++ % RIB_ACCENT_EVERY === 0 ? cor.paint.accent.clone().multiplyScalar(RIB_ACCENT_GAIN) : RIB_LIGHT;
    for (let i = 0; i + 1 < outer.length; i++) {
      mesh.paint('steel', RIB_STEEL, 70);
      for (const [ds, dir] of [[-RIB_DEPTH / 2, back], [RIB_DEPTH / 2, fwd]] as const) mesh.face(P(outer[i], ds), P(outer[i + 1], ds), P(inner[i + 1], ds), P(inner[i], ds), dir);
      const mid = P([(inner[i][0] + inner[i + 1][0]) / 2, (inner[i][1] + inner[i + 1][1]) / 2], 0);
      mesh.paint('glow', glow, 0, false).face(P(inner[i], -RIB_DEPTH / 2), P(inner[i + 1], -RIB_DEPTH / 2), P(inner[i + 1], RIB_DEPTH / 2), P(inner[i], RIB_DEPTH / 2), { x: axis.x - mid.x, y: axis.y - mid.y, z: axis.z - mid.z });
    }
    // The feet: the rib's underside where it stops above the wall's foot.
    mesh.paint('steel', RIB_STEEL, 70);
    for (const i of [0, outer.length - 1]) {
      const down = { x: -smp.up.x, y: -smp.up.y, z: -smp.up.z };
      mesh.face(P(outer[i], -RIB_DEPTH / 2), P(inner[i], -RIB_DEPTH / 2), P(inner[i], RIB_DEPTH / 2), P(outer[i], RIB_DEPTH / 2), down);
    }
  }
}

