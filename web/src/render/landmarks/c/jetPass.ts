// The air show as a gust hazard: during each gust window the display team swoops down and
// skims low across the course in the push's direction, trailing smoke; their jet wash is the
// shove racers feel. Jets and smoke are placed with the binding every frame.

import * as THREE from 'three';
import type { Kit } from '../b/kit.ts';
import { Bucket } from '../b/bucket.ts';
import { prism, shade, tri } from '../b/shapes.ts';
import type { HazardBinding } from '../types.ts';
import { DARK, GLASS, WHITE } from './kit.ts';
import { HIDDEN, Sprites, roadBasis, type HazardOf } from './hazard.ts';

export const JET_LEN = 14;

/** A delta jet's parts, bow along +X, wings in the XZ plane. */
export function jetParts(add: (g: THREE.BufferGeometry, c: THREE.ColorRepresentation) => void, body: THREE.ColorRepresentation): void {
  const L = JET_LEN;
  add(new THREE.OctahedronGeometry(1).scale(L / 2, 0.9, 0.95), body);
  add(new THREE.OctahedronGeometry(1).scale(2.2, 0.6, 0.55).translate(L * 0.18, 0.55, 0), GLASS);
  add(tri([L * 0.2, 0, 0], [-L * 0.42, 0, 6], [-L * 0.42, 0, -6]), WHITE);
  for (const s of [-1, 1]) add(tri([-L * 0.3, 0, s * 4.6], [-L * 0.42, 0, s * 6], [-L * 0.42, 0, s * 4]), body);
  for (const s of [-1, 1]) add(tri([-L * 0.25, 0.4, s * 0.5], [-L * 0.48, 0.4, s * 0.6], [-L * 0.46, 3.6, s * 1.4]), shade(body, 0.8));
  add(prism(0.6, 0.6, 0.5, 6).rotateZ(Math.PI / 2).translate(-L / 2, 0, 0), DARK);
}

/** One jet per this many metres of the gust's stretch, within these bounds. */
const SPACING = 45;
const JETS = { min: 2, max: 6 } as const;
/** Jets are drawn larger than life (track metres) so the pass reads at racing speed. */
const PASS_SCALE = 1.4;
/** Height over the road at the crossing, the run-in beyond each edge, and the swoop. */
const PASS = { height: 16, approach: 260, swoop: 220 } as const;
/** Share of the window after the gust in which smoke still hangs. */
const LINGER = 0.5;
/** Jets cross a few hundredths of the window apart, like a stream of a display team. */
const STAGGER = 0.04;
const TRAIL = { high: 34, low: 16, step: 0.012 } as const;
const SMOKE = [0xe8443a, 0xf4f1ea, 0x2f6fd8, 0xf4d03f, 0x3fc0a0, 0xff6a9a];

export function jetPass(kit: Kit, bound: { binding: HazardBinding; hazard: HazardOf<'gust'> }): (time: number) => void {
  const { binding, hazard } = bound;
  const d = hazard.def;
  const n = Math.max(JETS.min, Math.min(JETS.max, Math.round((hazard.s1 - hazard.s0) / SPACING)));
  const dir = Math.sign(d.strength) || 1;
  const span = hazard.maxX - hazard.minX + 2 * PASS.approach;
  const mid = (hazard.minX + hazard.maxX) / 2;
  const sAt = (i: number): number => hazard.s0 + ((i + 0.5) * (hazard.s1 - hazard.s0)) / n;
  const bases = Array.from({ length: n }, (_, i) => roadBasis(binding, sAt(i), mid));

  const b = new Bucket({});
  jetParts((g, c) => b.add(g, c), kit.palette.accent);
  const geo = b.geometry();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const jets = new THREE.InstancedMesh(geo, mat, n);
  jets.name = 'passJets';
  jets.frustumCulled = false;
  jets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const k = kit.q(TRAIL.high, TRAIL.low);
  const smoke = new Sprites(n * k, false, 1.1, 'passSmoke');
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) smoke.style(i * k + j, SMOKE[i % SMOKE.length], 5 + (9 * j) / k);
  kit.addObject(jets, geo, mat);
  kit.addObject(smoke.points, smoke);

  /** Track (x, y) of a jet at window progress u: diving in, skimming the road, pulling up. */
  const pathX = (u: number): number => mid + dir * (u - 0.5) * span;
  const pathY = (u: number): number => PASS.height + PASS.swoop * (Math.max(0, 0.4 - u) ** 2 + Math.max(0, u - 0.6) ** 2) * 4;
  const p = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const rot = new THREE.Matrix4();
  const flip = new THREE.Matrix4().makeRotationY(dir > 0 ? 0 : Math.PI);
  const sc = new THREE.Matrix4().makeScale(PASS_SCALE, PASS_SCALE, PASS_SCALE);

  return (time) => {
    const t = (((time + d.phase) % d.period) + d.period) % d.period;
    const w = t / d.on;
    for (let i = 0; i < n; i++) {
      const u = w + (i - (n - 1) / 2) * STAGGER;
      const s = sAt(i);
      if (u < 0 || u > 1) jets.setMatrixAt(i, HIDDEN);
      else {
        binding.toLocal(s, pathX(u), pathY(u), p);
        const du = 0.01;
        const pitch = Math.atan2(pathY(u + du) - pathY(u - du), span * 2 * du);
        m.copy(bases[i]).multiply(flip).multiply(rot.makeRotationZ(pitch)).multiply(sc).setPosition(p);
        jets.setMatrixAt(i, m);
      }
      for (let j = 0; j < k; j++) {
        const v = Math.min(u, 1) - (j + 1) * TRAIL.step;
        const age = u - v;
        if (v < 0 || u < 0 || u > 1 + LINGER) smoke.hide(i * k + j);
        else {
          binding.toLocal(s, pathX(v), pathY(v) - age * 3, p);
          smoke.place(i * k + j, p, 0.85 * (1 - j / k) * Math.min(1, (1 + LINGER - u) / LINGER));
        }
      }
    }
    jets.instanceMatrix.needsUpdate = true;
    smoke.commit();
  };
}
