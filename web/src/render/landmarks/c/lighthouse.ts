// The lighthouse: a tall candy-striped tower on a tumble of sea rocks, a keeper's cottage
// with a lit window, a jetty with a bobbing dinghy. The lamp turns, sweeping two long light
// beams (strong at dusk), waves burst white on the rocks and gulls wheel round the gallery.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import type { Motion, V3 } from '../b/motion.ts';
import { T, beam, box, cone, mix, prism, shade, vary } from '../b/shapes.ts';
import { lampString } from '../b/props.ts';
import { DARK, GLASS, RED_LIGHT, WARM_LIGHT, WHITE, finishCoast, foamRing, hull, splash } from './kit.ts';

const SALT = 0x11647;
const RADIUS = 70;
const SEA_FLOOR = -6;

const PLATEAU = { r: 17, y: 11 } as const;
const TOWER = { x: 2, z: 4, h: 50, rBase: 6.2, rTop: 4.0, bands: 6 } as const;
const LAMP_Y = PLATEAU.y + TOWER.h + 3.2;
const BEAM = { spin: 0.75, segments: 6, segLength: 38, r0: 1.2, rGrowth: 3, day: 0.014, dusk: 0.12 } as const;
const COTTAGE = { x: -9, z: -3, w: 9, d: 7, h: 4.5 } as const;
const JETTY = { x: -14, z: -26, len: 20 } as const;
const ROCKS = { high: 16, low: 10 } as const;
const GULLS = { high: 14, low: 7 } as const;
const WAVE_SPOTS = { high: 9, low: 5 } as const;
const WAVE_DROPS = { high: 26, low: 16 } as const;
const STRIPE_A = 0xe0343a;

function rocks(kit: Kit): void {
  const { rng } = kit;
  const rock = kit.palette.rock;
  // A stepped core the tower stands on, then boulders tumbled round it down into the sea.
  kit.solid.add(prism(PLATEAU.r + 4, PLATEAU.r, PLATEAU.y - SEA_FLOOR, 9), vary(rng, rock, 0.06), T(0, SEA_FLOOR, 0, 0.3));
  kit.solid.add(prism(PLATEAU.r * 0.96, PLATEAU.r * 0.96, 0.6, 9), mix(rock, 0x8aa05a, 0.45), T(0, PLATEAU.y, 0, 0.3));
  const n = kit.q(ROCKS.high, ROCKS.low);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.4;
    const d = PLATEAU.r + 2 + rng() * 14;
    const s = 5 + rng() * 7;
    const top = Math.max(1.5, PLATEAU.y * (1 - (d - PLATEAU.r) / 18) + rng() * 3);
    const sy = (top - SEA_FLOOR) / 2;
    kit.solid.add(new THREE.DodecahedronGeometry(1, 0), vary(rng, shade(rock, 0.85 + rng() * 0.3), 0.08), T(Math.cos(a) * d, SEA_FLOOR + sy, Math.sin(a) * d, rng() * 6, rng() - 0.5, rng() - 0.5, [s, sy, s * (0.8 + rng() * 0.4)]));
  }
}

function tower(kit: Kit): void {
  const { x, z, h, rBase, rTop, bands } = TOWER;
  const y0 = PLATEAU.y;
  const band = h / bands;
  for (let i = 0; i < bands; i++) {
    const r0 = rBase + (rTop - rBase) * (i / bands);
    const r1 = rBase + (rTop - rBase) * ((i + 1) / bands);
    kit.solid.add(prism(r0, r1, band, 14, true), i % 2 ? WHITE : STRIPE_A, T(x, y0 + i * band, z));
  }
  kit.solid.add(prism(rBase + 0.8, rBase + 0.6, 1.4, 14), shade(WHITE, 0.85), T(x, y0, z));
  // Small windows climbing the tower, a door facing the cottage.
  for (let i = 1; i < bands; i++) {
    const r = rBase + (rTop - rBase) * ((i + 0.5) / bands);
    const a = i * 1.9;
    kit.lamp(box(0.9, 1.4, 0.3), [x + Math.sin(a) * r, y0 + (i + 0.5) * band, z - Math.cos(a) * r], WARM_LIGHT, 0, undefined, { depth: 0.2, freq: 0.5, phase: i });
  }
  kit.solid.add(box(1.8, 3, 0.6), DARK, T(x - rBase + 0.2, y0, z, Math.PI / 2));
  // Gallery, railing, lantern room and cap.
  const top = y0 + h;
  kit.solid.add(prism(rTop + 1.6, rTop + 2, 0.9, 14), DARK, T(x, top, z));
  kit.solid.add(prism(rTop + 1.9, rTop + 1.9, 1.3, 14, true), shade(WHITE, 0.7), T(x, top + 0.9, z));
  kit.solid.add(prism(3.2, 3.2, 1.2, 10), DARK, T(x, top + 0.9, z));
  kit.lamp(prism(2.9, 2.9, 4.4, 10, true), [x, top + 2.1, z], mix(GLASS, WARM_LIGHT, 0.55 + 0.4 * kit.dusk), 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    kit.solid.add(beam([x + Math.cos(a) * 3, top + 2.1, z + Math.sin(a) * 3], [x + Math.cos(a) * 3, top + 6.5, z + Math.sin(a) * 3], 0.14, 3), DARK);
  }
  kit.solid.add(cone(3.8, 3.4, 10), STRIPE_A, T(x, top + 6.5, z));
  kit.solid.add(beam([x, top + 9.9, z], [x, top + 12.5, z], 0.15, 3), DARK);
  kit.lamp(new THREE.OctahedronGeometry(0.4), [x, top + 12.7, z], RED_LIGHT, 3, undefined, { depth: 0.9, freq: 2.2, phase: 0, sharp: 6 });
}

/** The turning lamp: a hot core and two opposed cones of light swinging round the horizon. */
function lamp(kit: Kit): void {
  const hub: V3 = [TOWER.x, LAMP_Y, TOWER.z];
  const spin: Motion = { hub, axisA: [0, 1, 0], spinA: BEAM.spin };
  const strength = BEAM.day + (BEAM.dusk - BEAM.day) * kit.dusk;
  const light = new THREE.Color(0xfff2c0);
  kit.lamp(new THREE.OctahedronGeometry(1.3).scale(1, 1, 0.5), hub, 0xffffff, 6 + 16 * kit.dusk, spin, { depth: 0.35, freq: BEAM.spin * 2, phase: Math.PI / 2, sharp: 3 });
  for (const dir of [1, -1]) {
    for (let s = 0; s < BEAM.segments; s++) {
      const ra = BEAM.r0 + s * BEAM.rGrowth;
      const rb = ra + BEAM.rGrowth;
      // The beam fades with distance: each segment is dimmer than the one before.
      const k = strength * (1 - s / BEAM.segments) ** 1.4;
      const g = new THREE.CylinderGeometry(rb, ra, BEAM.segLength, 10, 1, true).translate(0, BEAM.segLength / 2 + s * BEAM.segLength, 0).rotateZ(-Math.PI / 2 * dir).rotateZ(-0.04 * dir);
      kit.beams.add(g, light.clone().multiplyScalar(k), T(hub[0], hub[1], hub[2]), spin);
    }
  }
}

function cottage(kit: Kit): void {
  const { x, z, w, d, h } = COTTAGE;
  const y = PLATEAU.y + 0.5;
  kit.solid.add(box(w, h, d), WHITE, T(x, y, z));
  // A pitched roof: a triangular prism along the cottage's length.
  kit.solid.add(new THREE.CylinderGeometry(d * 0.62, d * 0.62, w + 1, 3, 1).rotateZ(Math.PI / 2).scale(1, 0.55, 1), 0x3a6a8a, T(x, y + h + 1.1, z, 0, 0, 0));
  kit.solid.add(box(1.1, 3, 1.1), shade(WHITE, 0.8), T(x + w * 0.3, y + h, z + 1));
  for (const dx of [-2.6, 2.6]) kit.lamp(box(1.4, 1.4, 0.2), [x + dx, y + 2.4, z - d / 2 - 0.1], WARM_LIGHT, 2.2 * kit.dusk, undefined, { depth: 0.15, freq: 0.7, phase: dx });
  kit.solid.add(box(1.4, 2.6, 0.3), 0x8a3a2a, T(x, y, z - d / 2 - 0.1));
  // A low wall round the yard and a flagpole.
  kit.solid.add(beam([x - w, y + 0.5, z - d], [x + w + 4, y + 0.5, z - d], 0.45, 4), shade(WHITE, 0.8));
  kit.solid.add(beam([x - w + 1, y, z + 2], [x - w + 1, y + 10, z + 2], 0.12, 3), DARK);
  kit.moving.add(box(3.4, 2, 0.1).translate(1.7, -1, 0), kit.palette.accent, T(x - w + 1, y + 10, z + 2), { pivot: [x - w + 1, y + 10, z + 2], axisB: [0, 1, 0], swingB: 0.4, freq: 2.4 });
}

function jetty(kit: Kit): void {
  const { x, z, len } = JETTY;
  const deck = 1.6;
  kit.solid.add(box(3.4, 0.4, len), 0x8a6a48, T(x, deck, z + len / 2 - 4));
  for (let i = 0; i <= 4; i++) for (const dx of [-1.5, 1.5]) kit.solid.add(beam([x + dx, SEA_FLOOR, z - 4 + (i * len) / 4], [x + dx, deck + 0.2, z - 4 + (i * len) / 4], 0.22, 4), 0x5a4030);
  // Steps up the rocks to the cottage.
  for (let i = 0; i < 6; i++) kit.solid.add(box(3, 0.6, 2.4), shade(WHITE, 0.75), T(x + 1 + i * 0.4, deck + i * 1.6, z + len - 4 + i * 1.8));
  kit.lamp(new THREE.OctahedronGeometry(0.5), [x, deck + 4, z - 4], 0x40ff70, 3, undefined, { depth: 0.9, freq: 1.6, phase: 1, sharp: 5 });
  kit.solid.add(beam([x, deck, z - 4], [x, deck + 3.6, z - 4], 0.14, 3), DARK);
  // The keeper's dinghy, rocking on its mooring.
  const at: V3 = [x + 5, 0, z + 2];
  const rock: Motion = { pivot: at, axisB: [0, 0, 1], swingB: 0.12, freq: 1.3, hop: 0.25 };
  kit.moving.add(hull(6, 2.2, 1.3, 0.35, 0.8), 0x2f6fb8, T(at[0], -0.5, at[2], Math.PI / 2), rock);
  kit.moving.add(box(1.8, 0.2, 1.2), 0xe8d8b0, T(at[0], 0.7, at[2]), rock);
  lampString(kit, [x - 1.5, deck + 3.6, z - 4], [x - 1.5, deck + 3, z + len - 5], 0.6, kit.q(5, 3), 0.18, 1.2);
}

function gulls(kit: Kit): void {
  const { rng } = kit;
  const n = kit.q(GULLS.high, GULLS.low);
  for (let i = 0; i < n; i++) {
    const r = 12 + rng() * 26;
    const y = PLATEAU.y + 18 + rng() * 40;
    const a = rng() * Math.PI * 2;
    const hub: V3 = [TOWER.x, y, TOWER.z];
    const c: V3 = [TOWER.x + Math.cos(a) * r, y, TOWER.z + Math.sin(a) * r];
    // Gulls fly tangent to their circle (here along −sin, cos); wings flap about that line.
    const fwd: V3 = [-Math.sin(a), 0, Math.cos(a)];
    const side: V3 = [Math.cos(a), 0, Math.sin(a)];
    const spin = (0.35 + rng() * 0.35) * (rng() < 0.3 ? -1 : 1);
    const flap = 5 + rng() * 2;
    kit.moving.add(new THREE.OctahedronGeometry(0.5).scale(0.6, 0.6, 1.6), WHITE, T(c[0], c[1], c[2], -a), { hub, axisA: [0, 1, 0], spinA: spin });
    for (const s of [1, -1]) {
      const tip: V3 = [c[0] + side[0] * 2.6 * s, c[1] + 0.3, c[2] + side[2] * 2.6 * s];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([c[0] - fwd[0] * 0.5, c[1], c[2] - fwd[2] * 0.5, c[0] + fwd[0] * 0.6, c[1], c[2] + fwd[2] * 0.6, ...tip], 3));
      kit.moving.add(g, s > 0 ? 0xe8ecef : 0xd8dde2, undefined, { hub, axisA: [0, 1, 0], spinA: spin, pivot: c, axisB: fwd, swingB: 0.5 * s, freq: flap, phase: i });
    }
  }
}

/** Waves rolling in on the rocks: foam skirts breathing at the waterline and white bursts. */
function surf(kit: Kit): void {
  const { rng } = kit;
  foamRing(kit, [0, 0.15, 0], PLATEAU.r + 13, kit.q(22, 12), 3.2, 1.6, 0.9);
  foamRing(kit, [0, 0.1, 0], PLATEAU.r + 20, kit.q(16, 8), 2, 2.6, 0.6);
  const spray = kit.particles(false, 1.2);
  const n = kit.q(WAVE_SPOTS.high, WAVE_SPOTS.low);
  for (let i = 0; i < n; i++) {
    // Seaward side (+Z) takes the swell.
    const a = Math.PI * (0.05 + 0.9 * (i / n)) + (rng() - 0.5) * 0.3;
    const r = PLATEAU.r + 10 + rng() * 6;
    const period = 4.5 + rng() * 2.5;
    splash(spray, rng, [Math.cos(a) * r, 0.5, Math.sin(a) * r], { count: kit.q(WAVE_DROPS.high, WAVE_DROPS.low), speed: 4, up: 11 + rng() * 9, size: 2.6, period, time: rng() * period, spread: 6, dir: [-Math.cos(a) * 2, 0, -Math.sin(a) * 2] });
  }
}

export function createLighthouse(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  rocks(kit);
  tower(kit);
  lamp(kit);
  cottage(kit);
  jetty(kit);
  gulls(kit);
  surf(kit);
  return finishCoast(kit, RADIUS);
}
