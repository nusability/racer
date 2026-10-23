// The whales as a blocker hazard: a leviathan leaps out of the sea on one side of the causeway,
// arcs over the road while the blocker warns, and crashes down across it for the 'down' stage
// (its body IS the barrier, arched clear over the opening), then slides off into the sea on the
// far side. Every segment is placed on the course with the binding each frame.

import * as THREE from 'three';
import type { Kit } from '../b/kit.ts';
import { Bucket } from '../b/bucket.ts';
import { solidMaterial } from '../b/motion.ts';
import type { Particles } from '../b/points.ts';
import { lathe } from '../b/shapes.ts';
import { blockerStage } from '../../../core/hazards.ts';
import type { HazardBinding } from '../types.ts';
import { HIDDEN, mover, roadBasis, type HazardOf } from './hazard.ts';
import { splash } from './kit.ts';

const SEGMENTS = { high: 30, low: 16 } as const;
const MIN_RADIUS = 3;
/** Segments stretch along the body to overlap their neighbours, so it reads as one body. */
const STRETCH = 0.8;
/** The body reaches this far past each road edge, out over the water. */
const OVERHANG = 30;
/** Height of the arch over the opening above the body's resting height, and its ramp. */
const ARCH = { clear: 9, ramp: 7 } as const;
/** The leap: run-up distance out in the sea, depth it starts from and height of its arc. */
const LEAP = { run: 60, depth: 18, height: 34, pitch: 0.55 } as const;
/** Share of the idle time spent sliding off into the sea. */
const SLIDE = 0.3;
const DIVE_SLOPE = 0.6;
const BACK = 0x2a4a6a;
const BELLY = 0xd8e4e8;
const EYE = 0x60f0e0;

/** Body radius along the body, tail (0) to head (1), as a share of the full radius. */
function girth(u: number): number {
  return 0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.78)) ** 0.6;
}

function segmentGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position');
  const col: number[] = [];
  const back = new THREE.Color(BACK);
  const belly = new THREE.Color(BELLY);
  for (let i = 0; i < p.count; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const c = y < -0.25 ? belly : back;
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.deleteAttribute('normal');
  return g;
}

export function leviathan(kit: Kit, bound: { binding: HazardBinding; hazard: HazardOf<'blocker'> }, splashes: Particles): (time: number) => void {
  const { binding, hazard } = bound;
  const d = hazard.def;
  // Lying down, the body's top is about 1.85 radii up: as tall as the blocker's bar.
  const R = Math.max(MIN_RADIUS, d.height / 1.85);
  const xA = hazard.minX - OVERHANG;
  const xB = hazard.maxX + OVERHANG;
  const len = xB - xA;
  const n = kit.q(SEGMENTS.high, SEGMENTS.low);
  const basis = roadBasis(binding, hazard.s0, 0);

  // Rest pose (track metres): lying across the road, arched over the opening, ends drooping
  // toward the water beyond the road edges.
  const restX: number[] = [];
  const restY: number[] = [];
  const rad: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const x = xA + u * len;
    const r = R * girth(u);
    const half = d.opening / 2;
    const archT = THREE.MathUtils.smoothstep(half + ARCH.ramp - Math.abs(x - d.offset), 0, ARCH.ramp);
    const beyond = Math.max(0, hazard.minX - x, x - hazard.maxX);
    restX.push(x);
    restY.push(r * 0.85 + archT * (ARCH.clear + R) - beyond * 0.25);
    rad.push(r);
  }
  const cx = (xA + xB) / 2;
  const cy = R;

  const segGeo = segmentGeometry();
  const segMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const body = new THREE.InstancedMesh(segGeo, segMat, n);
  body.name = 'leviathan';
  body.frustumCulled = false;
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const band = new THREE.Color();
  for (let i = 0; i < n; i++) body.setColorAt(i, band.setScalar(i % 3 === 0 ? 0.85 : 1));
  kit.addObject(body, segGeo, segMat);

  // Head (snout toward +x, the way it leaps) and tail flukes, built in track metres.
  const hb = new Bucket({});
  hb.add(lathe([[0.05, 0], [0.8, 0.5], [1, 1.4], [0.9, 2.2], [0.4, 3]], 8).rotateZ(-Math.PI / 2).scale(1, 0.8, 1), BACK);
  hb.add(lathe([[0.05, 0], [0.7, 0.6], [0.75, 1.6], [0.3, 2.6]], 6, 0, Math.PI).rotateZ(-Math.PI / 2).translate(0, -0.25, 0).scale(1, 0.7, 1), BELLY);
  for (const s of [-1, 1]) hb.add(new THREE.OctahedronGeometry(0.16), EYE, new THREE.Matrix4().makeTranslation(1.6, 0.35, s * 0.7));
  const tb = new Bucket({});
  for (const s of [-1, 1]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -2.4, 0.3, s * 2.6, -1.6, 0, s * 0.3], 3));
    tb.add(g, BACK);
  }
  const headGeo = hb.geometry();
  const tailGeo = tb.geometry();
  const headMat = solidMaterial(kit.u, false);
  const head = mover(headGeo, headMat, 'leviathanHead');
  const tail = mover(tailGeo, headMat, 'leviathanTail');
  kit.addObject(head, headGeo, headMat);
  kit.addObject(tail, tailGeo);

  // Splashes on the schedule: bursting out, crashing down across the road, diving away.
  const atTrack = (x: number, y: number): [number, number, number] => {
    const v = binding.toLocal(hazard.s0, x, y, new THREE.Vector3());
    return [v.x, v.y, v.z];
  };
  const idleLen = d.period - d.warn - d.up;
  const when = (cycleT: number): number => cycleT - d.phase;
  splash(splashes, kit.rng, atTrack(cx - LEAP.run - len / 2, -1), { count: kit.q(40, 20), speed: 6, up: 16, size: 4 * R / 3, period: d.period, time: when(d.warn * 0.12), spread: len * 0.3 });
  for (const x of [hazard.minX - 8, hazard.maxX + 8, xA + 6, xB - 6]) {
    splash(splashes, kit.rng, atTrack(x, -1), { count: kit.q(16, 8), speed: 8, up: 16, size: R, period: d.period, time: when(d.warn), spread: 10 });
  }
  splash(splashes, kit.rng, atTrack(xB + 10, -1), { count: kit.q(30, 14), speed: 5, up: 12, size: 4 * R / 3, period: d.period, time: when(d.warn + d.up + idleLen * SLIDE * 0.5), spread: 20 });

  const px: number[] = new Array<number>(n).fill(0);
  const py: number[] = new Array<number>(n).fill(0);
  const p = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const rot = new THREE.Matrix4();
  const sc = new THREE.Matrix4();
  const hidden = (): void => {
    for (let i = 0; i < n; i++) body.setMatrixAt(i, HIDDEN);
    head.matrix.copy(HIDDEN);
    tail.matrix.copy(HIDDEN);
    head.matrixWorldNeedsUpdate = true;
    tail.matrixWorldNeedsUpdate = true;
  };

  /** Places a part built in track metres at track (x, y), pitched by `pitch` about the s axis. */
  const placePart = (obj: THREE.Mesh, x: number, y: number, pitch: number, scale: number): void => {
    binding.toLocal(hazard.s0, x, y, p);
    obj.matrix.copy(basis).multiply(rot.makeRotationZ(pitch)).multiply(sc.makeScale(scale, scale, scale)).setPosition(p);
    obj.matrixWorldNeedsUpdate = true;
  };

  return (time) => {
    const st = blockerStage(d, time);
    if (st.stage === 'warn') {
      // The whole body flies as one, from under the sea out past the near edge to its rest.
      const q = st.progress;
      const dx = -(LEAP.run + len) * (1 - q);
      const dy = -LEAP.depth * (1 - q) + 4 * LEAP.height * q * (1 - q);
      const pitch = Math.atan2(LEAP.depth + 4 * LEAP.height * (1 - 2 * q), LEAP.run + len) * LEAP.pitch;
      const c = Math.cos(pitch);
      const s = Math.sin(pitch);
      for (let i = 0; i < n; i++) {
        const lx = restX[i] - cx;
        const ly = restY[i] - cy + Math.sin(i * 0.5 - q * 9) * 1.5 * (1 - q);
        px[i] = cx + dx + lx * c - ly * s;
        py[i] = cy + dy + lx * s + ly * c;
      }
    } else if (st.stage === 'down') {
      for (let i = 0; i < n; i++) {
        px[i] = restX[i];
        py[i] = restY[i] + 0.25 * Math.sin(time * 2 + i * 0.4);
      }
    } else if (st.progress < SLIDE) {
      // Slithering on across the road and diving into the sea past the far edge.
      const q = st.progress / SLIDE;
      const shift = (len + LEAP.run) * q * q;
      for (let i = 0; i < n; i++) {
        px[i] = restX[i] + shift;
        py[i] = restY[i] - Math.max(0, px[i] - hazard.maxX - OVERHANG / 2) * DIVE_SLOPE;
      }
    } else {
      hidden();
      body.instanceMatrix.needsUpdate = true;
      return;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.min(i + 1, n - 1);
      const b = Math.max(i - 1, 0);
      const along = Math.max(rad[i], (STRETCH * Math.hypot(px[a] - px[b], py[a] - py[b])) / (a - b));
      binding.toLocal(hazard.s0, px[i], py[i], p);
      m.copy(basis).multiply(rot.makeRotationZ(Math.atan2(py[a] - py[b], px[a] - px[b]))).multiply(sc.makeScale(along, rad[i], rad[i]));
      body.setMatrixAt(i, m.setPosition(p));
    }
    body.instanceMatrix.needsUpdate = true;
    const last = n - 1;
    const headPitch = Math.atan2(py[last] - py[last - 1], px[last] - px[last - 1]);
    const tailPitch = Math.atan2(py[1] - py[0], px[1] - px[0]);
    placePart(head, px[last], py[last], headPitch, rad[last] * 1.6);
    placePart(tail, px[0], py[0], tailPitch, R);
  };
}
