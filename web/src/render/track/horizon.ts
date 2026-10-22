import * as THREE from 'three';
import { mulberry32, range, type Rng } from '../../core/rng.ts';
import type { TrackScenery } from '../../data/tracks/scenery.ts';
import { FlatBuilder, type P3 } from './builder.ts';
import { HORIZON_MAX, HORIZON_MIN, type Quality } from './config.ts';
import type { Corridor } from './corridor.ts';
import { quadFacing } from './paint.ts';

// Distant mesas, buttes and spires that frame every view, plus the oasis pools.

const POOL_RADIUS = 34;
const POOL_SETBACK = 75;
const WATER = new THREE.Color(0x2ab8c0);
const WATER_DEEP = new THREE.Color(0x0e6a80);
const REED = new THREE.Color(0x5a8a3a);
/** Silhouettes keep at least this far from every point of the lap. */
const HORIZON_CLEAR = 380;

/** Stacked rings (radius, height) around a centre, jittered, capped. */
function lathe(b: FlatBuilder, c: P3, rings: [number, number][], sides: number, rng: Rng, paint: Corridor['paint']) {
  const jit = Array.from({ length: sides }, () => range(rng, 0.78, 1.2));
  const rot = rng() * Math.PI;
  const pts = rings.map(([r, h]) =>
    jit.map((j, i) => {
      const a = rot + (i / sides) * Math.PI * 2;
      return { x: c.x + Math.cos(a) * r * j, y: c.y + h, z: c.z + Math.sin(a) * r * j };
    }),
  );
  const col = new THREE.Color();
  const col2 = new THREE.Color();
  for (let r = 0; r + 1 < pts.length; r++) {
    for (let i = 0; i < sides; i++) {
      const k = (i + 1) % sides;
      const A = pts[r][i];
      paint.strata(A.y, r === 0 ? 0.8 : 1, col);
      paint.strata(pts[r + 1][i].y, 1, col2);
      quadFacing(b, A, pts[r][k], pts[r + 1][k], pts[r + 1][i], { x: A.x - c.x, y: 0, z: A.z - c.z }, col, col, col2, col2);
    }
  }
  const top = pts[pts.length - 1];
  const topC = { x: c.x, y: c.y + rings[rings.length - 1][1], z: c.z };
  paint.strata(topC.y, 1.08, col);
  for (let i = 0; i < sides; i++) b.tri(top[(i + 1) % sides], top[i], topC, col);
}

export function buildHorizon(cor: Corridor, scenery: TrackScenery, quality: Quality, seed: number): FlatBuilder {
  const b = new FlatBuilder();
  const rng = mulberry32(seed ^ 0x3e5a);
  const S = cor.track.samples;
  let cx = 0;
  let cz = 0;
  for (const s of S) {
    cx += s.pos.x / S.length;
    cz += s.pos.z / S.length;
  }
  const radius = Math.max(...S.map((s) => Math.hypot(s.pos.x - cx, s.pos.z - cz)));
  const clear = (x: number, z: number, r: number) => {
    for (let k = 0; k < S.length; k += 10) if (Math.hypot(S[k].pos.x - x, S[k].pos.z - z) < HORIZON_CLEAR + r) return false;
    return true;
  };
  const place = (count: number, inner: number, outer: number, size: () => number, make: (c: P3, r: number) => void) => {
    for (let i = 0, tries = 0; i < count && tries < count * 20; tries++) {
      const a = rng() * Math.PI * 2;
      const d = range(rng, inner, outer);
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      const r = size();
      // Footprint reaches 1.4 r at the talus, plus the lathe's jitter.
      if (!clear(x, z, r * 1.7)) continue;
      make({ x, y: cor.ground.natural(x, z) - 6, z }, r);
      i++;
    }
  };
  const sides = quality === 'high' ? 10 : 7;
  place(scenery.mesas, radius + HORIZON_MIN, radius + HORIZON_MAX, () => range(rng, 90, 320), (c, r) => {
    const h = range(rng, 60, 210);
    const tiers: [number, number][] = [
      [r * 1.4, 0],
      [r * 1.08, h * 0.28],
      [r, h * 0.55],
      [r * 0.98, h * 0.96],
      [r * 0.94, h],
    ];
    if (rng() < 0.4) tiers.push([r * 0.6, h * 1.02], [r * 0.56, h * 1.25], [r * 0.5, h * 1.27]);
    lathe(b, c, tiers, sides, rng, cor.paint);
  });
  // Spires stand closer in, so they sweep past and sell the speed.
  place(scenery.spires, radius * 0.25, radius + HORIZON_MAX * 0.6, () => range(rng, 9, 26), (c, r) => {
    const h = range(rng, 70, 190);
    lathe(b, c, [[r * 1.7, 0], [r, h * 0.3], [r * 0.7, h * 0.78], [r * 1.15, h * 0.86], [r * 0.95, h * 0.95], [r * 0.4, h]], 6, rng, cor.paint);
  });

  for (const o of scenery.oases) {
    const s = cor.track.paramToS(o.at);
    const k = Math.round(s / cor.track.step) % S.length;
    const p = cor.beside(k, o.side, POOL_SETBACK, 0);
    const y = cor.ground.meshHeight(p.x, p.z) + 0.4;
    const ring = 14;
    const rim: P3[] = [];
    const shore: P3[] = [];
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2;
      const r = POOL_RADIUS * range(rng, 0.85, 1.15);
      rim.push({ x: p.x + Math.cos(a) * r, y, z: p.z + Math.sin(a) * r });
      const sx = p.x + Math.cos(a) * (r + 12);
      const sz = p.z + Math.sin(a) * (r + 12);
      shore.push({ x: sx, y: cor.ground.meshHeight(sx, sz) + 0.2, z: sz });
    }
    const centre = { x: p.x, y, z: p.z };
    for (let i = 0; i < ring; i++) {
      const j = (i + 1) % ring;
      cor.glow.tri(centre, rim[j], rim[i], WATER_DEEP, WATER, WATER);
      quadFacing(b, rim[i], rim[j], shore[j], shore[i], { x: 0, y: 1, z: 0 }, REED);
    }
  }
  return b;
}
