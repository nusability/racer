// The grandstand: a huge tiered stand packed with a colourful crowd doing the wave, under a
// cantilevered roof hung from flag masts. A giant LED scoreboard cycles its shows, the
// commentators sit in a glowing booth, light towers sweep their beams over the track and
// confetti cannons pop along the front rail.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from './kit.ts';
import type { Motion, V3 } from './motion.ts';
import { beam, box, cone, mix, quad, shade, vary } from './shapes.ts';
import { quadPts } from './props.ts';

const SALT = 0x6a2d;
const RADIUS = 178;
/** Stand layout: sections along x split by stair aisles; tiers rise toward +Z. */
const SECTIONS = 5;
const SECTION_WIDTH = 56;
const AISLE = 5;
const TIERS = 13;
const TREAD = 3.2;
const RISE = 2.1;
const FRONT_Z = -22;
const FRONT_Y = 3;
const HALF = (SECTIONS * SECTION_WIDTH + (SECTIONS - 1) * AISLE) / 2;
const TOP_Y = FRONT_Y + TIERS * RISE;
const BACK_Z = FRONT_Z + TIERS * TREAD;
/** Spectator spacing along a row and how full the stand is. */
const SEAT_SPACING = { high: 2.9, low: 3.4 } as const;
/** Low quality seats every other tier. */
const TIER_STRIDE = { high: 1, low: 2 } as const;
/** Spectators are drawn larger than life so the stand reads as a crowd from the track. */
const SPECTATOR_SCALE = 1.45;
const OCCUPANCY = 0.9;
/** The wave: crest speed along the stand (m/s) and how often a new one starts (s). */
const WAVE_SPEED = 45;
const WAVE_PERIOD = 8;
const WAVE_SHARPNESS = 6;
const WAVE_JUMP = 1.5;
const ROOF = { rise: 16, overhang: 0.55 } as const;
const MAST_HEIGHT = 30;
const SCREEN = { w: 66, h: 22, y: TOP_Y + 34 } as const;
const LIGHT_TOWER = { x: 168, z: 6, height: 56 } as const;
/** Searchlights: cones thrown up into the sky, swaying slowly; faint by day, bold at dusk. */
/** Strengths are linear colour; the output is sRGB-encoded before blending, so tiny values go far. */
const BEAM = { length: 230, radius: 13, sweep: 0.5, freq: 0.3, day: 0.001, dusk: 0.022 } as const;
const CONFETTI = { cannons: { high: 7, low: 4 }, flakes: { high: 60, low: 36 } } as const;

const SCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

// Three looping shows on an LED matrix: a waving chequered flag, a leaderboard of racing
// bars and rushing chevrons. The dot mask fades out once dots shrink below a pixel.
const SCREEN_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uGlow;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
varying vec2 vUv;
#include <fog_pars_fragment>
const vec2 DOTS = vec2(120.0, 40.0);
void main() {
  vec2 cellPos = vUv * DOTS;
  vec2 q = (floor(cellPos) + 0.5) / DOTS;
  float show = mod(floor(uTime / 6.0), 3.0);
  vec3 col;
  if (show < 0.5) {
    float wave = sin(q.x * 7.0 - uTime * 4.0) * 0.07;
    vec2 c = floor(vec2(q.x * 12.0, (q.y + wave) * 4.0));
    col = mod(c.x + c.y, 2.0) < 0.5 ? vec3(0.95) : vec3(0.05);
    col *= 0.75 + 0.25 * sin(q.x * 7.0 - uTime * 4.0 + 1.2);
  } else if (show < 1.5) {
    float row = floor(q.y * 5.0);
    float len = 0.3 + 0.55 * fract(sin(row * 13.7) * 91.3) + 0.12 * sin(uTime * 1.7 + row * 2.1);
    col = (q.x < len && fract(q.y * 5.0) > 0.2) ? mix(uA, uB, row / 4.0) : vec3(0.03, 0.03, 0.08);
    if (q.x < 0.06 && fract(q.y * 5.0) > 0.2) col = vec3(0.95);
  } else {
    float ch = fract(q.x * 5.0 - abs(q.y - 0.5) * 2.5 - uTime * 1.6);
    col = ch < 0.45 ? uA : uC * 0.3;
  }
  float led = smoothstep(0.5, 0.3, length(fract(cellPos) - 0.5));
  led = mix(led, 0.55, smoothstep(0.3, 0.9, fwidth(cellPos.x)));
  gl_FragColor = vec4(col * mix(0.25, 1.0, led) * uGlow, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function screen(kit: Kit): void {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    { uA: { value: new THREE.Color(kit.palette.accent) }, uB: { value: new THREE.Color(0xf4d03f) }, uC: { value: new THREE.Color(0xe8443a) } },
  ]);
  uniforms.uTime = kit.u.uTime;
  uniforms.uGlow = kit.u.uGlow;
  const mat = new THREE.ShaderMaterial({ vertexShader: SCREEN_VERTEX, fragmentShader: SCREEN_FRAGMENT, uniforms, fog: true });
  const geo = new THREE.PlaneGeometry(SCREEN.w, SCREEN.h).rotateY(Math.PI).translate(0, SCREEN.y, BACK_Z - 1.6);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'screen';
  kit.addObject(mesh, geo, mat);
  const frame = 0x2a2a30;
  kit.solid.add(box(SCREEN.w + 3, SCREEN.h + 3, 2.4), frame, new THREE.Matrix4().makeTranslation(0, SCREEN.y - SCREEN.h / 2 - 1.5, BACK_Z));
  for (const dx of [-SCREEN.w / 3, SCREEN.w / 3]) kit.solid.add(box(2.2, SCREEN.y - SCREEN.h / 2, 2.2), frame, new THREE.Matrix4().makeTranslation(dx, 0, BACK_Z + 1));
}

function stand(kit: Kit): void {
  const concrete = mix(kit.palette.sand, 0xd8d0c4, 0.6);
  const seatCols = [kit.palette.accent, 0xe8443a, 0x2f8fd8, 0xf4d03f, 0x3fb07f].map((c) => new THREE.Color(c));
  for (let s = 0; s < SECTIONS; s++) {
    const cx = -HALF + SECTION_WIDTH / 2 + s * (SECTION_WIDTH + AISLE);
    const seat = seatCols[s % seatCols.length];
    for (let i = 0; i < TIERS; i++) {
      const z = FRONT_Z + i * TREAD;
      const y = FRONT_Y + i * RISE;
      kit.solid.add(box(SECTION_WIDTH, y, TREAD), i % 2 ? concrete : shade(concrete, 0.93), new THREE.Matrix4().makeTranslation(cx, 0, z + TREAD / 2));
      kit.solid.add(box(SECTION_WIDTH, 0.6, 0.7), i % 2 ? seat : shade(seat, 0.8), new THREE.Matrix4().makeTranslation(cx, y, z + TREAD * 0.75));
    }
  }
  // Aisle stairs, back wall and the front rail with sponsor boards.
  for (let s = 1; s < SECTIONS; s++) {
    const ax = -HALF + s * (SECTION_WIDTH + AISLE) - AISLE / 2;
    for (let i = 0; i < TIERS; i++) kit.solid.add(box(AISLE, FRONT_Y + i * RISE - RISE / 2, TREAD), shade(concrete, 0.8), new THREE.Matrix4().makeTranslation(ax, 0, FRONT_Z + i * TREAD + TREAD / 2));
  }
  kit.solid.add(box(HALF * 2 + 4, TOP_Y + 4, 3), shade(concrete, 0.75), new THREE.Matrix4().makeTranslation(0, 0, BACK_Z + 1.5));
  for (let x = -HALF; x < HALF - 1; x += 12) {
    const a = kit.festiveColor();
    kit.solid.add(quadPts([x, 0.2, FRONT_Z - 0.6], [x + 11.6, 0.2, FRONT_Z - 0.6], [x + 11.6, 2.8, FRONT_Z - 0.6], [x, 2.8, FRONT_Z - 0.6]), a);
    kit.solid.add(quadPts([x + 1, 1.1, FRONT_Z - 0.7], [x + 10.6, 1.1, FRONT_Z - 0.7], [x + 10.6, 1.9, FRONT_Z - 0.7], [x + 1, 1.9, FRONT_Z - 0.7]), x % 24 ? 0xf7efe0 : 0x1a1a22);
  }
}

function roofAndMasts(kit: Kit): void {
  const roofCol = mix(0xf2efe6, kit.palette.accent, 0.2);
  const frontZ = BACK_Z - TIERS * TREAD * ROOF.overhang;
  const backY = TOP_Y + ROOF.rise;
  const frontY = TOP_Y + ROOF.rise - 6;
  for (let s = 0; s < SECTIONS; s++) {
    const x0 = -HALF + s * (SECTION_WIDTH + AISLE) - AISLE / 2;
    const x1 = x0 + SECTION_WIDTH + AISLE;
    kit.solid.add(quadPts([x0, backY, BACK_Z + 2], [x1, backY, BACK_Z + 2], [x1, frontY, frontZ], [x0, frontY, frontZ]), s % 2 ? roofCol : shade(roofCol, 0.92));
    kit.solid.add(quadPts([x0, frontY, frontZ], [x1, frontY, frontZ], [x1, frontY - 1.6, frontZ - 0.4], [x0, frontY - 1.6, frontZ - 0.4]), kit.palette.accent);
  }
  // Masts behind the stand hold the roof on cables; each flies a big flag.
  for (let s = 0; s <= SECTIONS; s++) {
    const x = -HALF + s * (SECTION_WIDTH + AISLE) - AISLE / 2;
    const top: V3 = [x, backY + MAST_HEIGHT, BACK_Z + 6];
    kit.solid.add(beam([x, 0, BACK_Z + 6], top, 0.9, 5), 0x3a3a44);
    kit.solid.add(beam([top[0], top[1] - 2, top[2]], [x, frontY, frontZ], 0.15, 3), 0x3a3a44);
    kit.solid.add(beam([top[0], top[1] - 2, top[2]], [x, backY, BACK_Z + 2], 0.15, 3), 0x3a3a44);
    const flag: Motion = { pivot: top, axisB: [0, 1, 0], swingB: 0.45, freq: 1.6, phase: s * 1.3 };
    const col = kit.festiveColor();
    kit.moving.add(quadPts(top, [x + 9, top[1] - 0.6, top[2]], [x + 9, top[1] - 5.6, top[2]], [x, top[1] - 5, top[2]]), col, undefined, flag);
    kit.moving.add(quadPts([x + 3, top[1] - 0.2, top[2] - 0.05], [x + 5, top[1] - 0.4, top[2] - 0.05], [x + 5, top[1] - 5.4, top[2] - 0.05], [x + 3, top[1] - 5.2, top[2] - 0.05]), 0xf7efe0, undefined, flag);
    kit.lamp(new THREE.OctahedronGeometry(0.7), [x, top[1] + 1, top[2]], 0xff3030, 4, undefined, { depth: 1, freq: 2.5, phase: s, sharp: 8 });
  }
  // Pennants along the roof's front edge.
  for (let x = -HALF + 6; x < HALF; x += 14) {
    const p: V3 = [x, frontY - 1.6, frontZ - 0.5];
    kit.moving.add(quadPts(p, [x + 1.6, p[1], p[2]], [x + 0.8, p[1] - 3.5, p[2]], [x + 0.8, p[1] - 3.5, p[2]]), kit.festiveColor(), undefined, { pivot: p, axisB: [1, 0, 0], swingB: 0.3, freq: 2.4, phase: x * 0.1 });
  }
}

function booth(kit: Kit): void {
  const z = BACK_Z - TIERS * TREAD * ROOF.overhang + 3;
  const y = TOP_Y + ROOF.rise - 13;
  kit.solid.add(box(20, 6, 7), 0x2a2a34, new THREE.Matrix4().makeTranslation(0, y, z));
  kit.lights.add(quad(18, 3.4).rotateX(-0.25), mix(0x7ad8ff, kit.palette.accent, 0.3), new THREE.Matrix4().makeTranslation(0, y + 3.2, z - 3.6), undefined, { depth: 0.15, freq: 1.3, phase: 0 });
  for (const dx of [-4, 4]) {
    kit.solid.add(box(1.1, 1.3, 0.8), dx < 0 ? 0xe8443a : 0x2f8fd8, new THREE.Matrix4().makeTranslation(dx, y + 1.6, z - 2.2));
    kit.solid.add(new THREE.OctahedronGeometry(0.45), 0xc08a62, new THREE.Matrix4().makeTranslation(dx, y + 3.4, z - 2.2));
  }
  kit.solid.add(beam([8, y + 6, z], [8, y + 14, z], 0.15, 3), 0x888888);
  kit.solid.add(cone(2, 1, 8).rotateX(-0.9), 0xdddddd, new THREE.Matrix4().makeTranslation(-7, y + 6.5, z));
  kit.lamp(new THREE.OctahedronGeometry(0.5), [8, y + 14.5, z], 0xff3030, 3, undefined, { depth: 1, freq: 3, phase: 0, sharp: 8 });
}

function lightTower(kit: Kit, side: number): void {
  const { z, height } = LIGHT_TOWER;
  const x = side * LIGHT_TOWER.x;
  const steel = 0x5a5a66;
  const w = 3;
  for (const [dx, dz] of [[-w, -w], [w, -w], [w, w], [-w, w]]) kit.solid.add(beam([x + dx * 1.8, 0, z + dz * 1.8], [x + dx, height, z + dz], 0.35, 3), steel);
  for (let y = 8; y < height; y += 9) {
    kit.solid.add(beam([x - w * 1.5, y, z - w * 1.5], [x + w * 1.4, y + 9, z - w * 1.4], 0.15, 3), steel);
    kit.solid.add(beam([x + w * 1.5, y, z + w * 1.5], [x - w * 1.4, y + 9, z + w * 1.4], 0.15, 3), steel);
  }
  const head: V3 = [x, height + 4, z];
  kit.solid.add(box(12, 8, 2), 0x2a2a30, new THREE.Matrix4().makeTranslation(x, height, z).multiply(new THREE.Matrix4().makeRotationX(0.35)));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const p: V3 = [x - 4.2 + c * 2.8, height + 1.6 + r * 2.4, z - 1.2 - r * 0.8];
      kit.lamp(box(2.2, 1.8, 0.3), [p[0], p[1] - 0.9, p[2]], 0xfff4d8, 0, undefined, { depth: 0.05, freq: 1, phase: 0 });
      kit.halos.point(p, 0xfff4d8, 3.5);
    }
  }
  // The searchlight: an additive cone thrown up over the stand, fading toward its far end,
  // that sways across the sky (pointed up so a passing camera never sits inside it).
  const sweep: Motion = { pivot: head, axisB: [0, 0, 1], swingB: BEAM.sweep, freq: BEAM.freq, phase: side };
  // Squared so only properly dark skies get a bold beam; a bright sky saturates quickly.
  const strength = BEAM.day + (BEAM.dusk - BEAM.day) * kit.dusk * kit.dusk;
  const sun = mix(kit.palette.sun, 0xffffff, 0.5);
  const dir = new THREE.Vector3(-side * 0.45, 1, -0.35).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  const pieces = 4;
  for (let i = 0; i < pieces; i++) {
    const t0 = i / pieces;
    const t1 = (i + 1) / pieces;
    const geo = new THREE.CylinderGeometry(0.6 + BEAM.radius * t0, 0.6 + BEAM.radius * t1, BEAM.length / pieces, 10, 1, true)
      .translate(0, -BEAM.length * (t0 + t1) / 2, 0)
      .applyQuaternion(q)
      .translate(head[0], head[1], head[2]);
    kit.beams.add(geo, shade(sun, strength * (1 - t0) * (1 - t0)), undefined, sweep);
  }
}

export function createGrandstand(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const { rng } = kit;
  stand(kit);
  roofAndMasts(kit);
  booth(kit);
  screen(kit);
  lightTower(kit, -1);
  lightTower(kit, 1);

  // The crowd: most ride the wave (phase falls along x so the crest runs down the stand);
  // the rest bounce and cheer on their own.
  const waveFreq = (Math.PI * 2) / WAVE_PERIOD;
  const spacing = kit.q(SEAT_SPACING.high, SEAT_SPACING.low);
  for (let i = 0; i < TIERS; i += kit.q(TIER_STRIDE.high, TIER_STRIDE.low)) {
    const y = FRONT_Y + i * RISE;
    const z = FRONT_Z + i * TREAD + TREAD * 0.45;
    for (let s = 0; s < SECTIONS; s++) {
      const x0 = -HALF + s * (SECTION_WIDTH + AISLE);
      for (let x = x0 + 1; x < x0 + SECTION_WIDTH - 0.5; x += spacing) {
        if (rng() > OCCUPANCY) continue;
        const px = x + (rng() - 0.5) * 0.6;
        const waving = rng() < 0.82;
        kit.crowd({
          x: px,
          y: y - 0.9,
          z,
          ry: Math.PI + (rng() - 0.5) * 0.4,
          color: vary(rng, kit.festiveColor(), 0.3),
          scale: SPECTATOR_SCALE,
          hop: waving ? WAVE_JUMP : 0.3,
          freq: waving ? waveFreq : 4 + rng() * 3,
          phase: waving ? (-px * waveFreq) / WAVE_SPEED : rng() * 100,
          sharp: waving ? WAVE_SHARPNESS : 2,
          raise: waving ? 1 : 0.5,
        });
      }
    }
  }

  // Confetti cannons along the front rail, each popping on its own beat.
  const confetti = kit.particles(false, 0);
  const cannons = kit.q(CONFETTI.cannons.high, CONFETTI.cannons.low);
  for (let c = 0; c < cannons; c++) {
    const x = -HALF + ((c + 0.5) / cannons) * HALF * 2;
    kit.solid.add(cone(0.9, 2.4, 6).rotateX(-0.3), 0x3a3a44, new THREE.Matrix4().makeTranslation(x, 0, FRONT_Z - 2));
    const period = 6 + rng() * 4;
    const phase = rng() * period;
    for (let i = 0; i < kit.q(CONFETTI.flakes.high, CONFETTI.flakes.low); i++) {
      const v: V3 = [(rng() - 0.5) * 14, 22 + rng() * 14, -4 + (rng() - 0.5) * 12];
      confetti.add([x, 2.5, FRONT_Z - 2.5], v, kit.festiveColor(), 0.9, { period, lifetime: 5.5, phase }, { gravity: 2.2, drag: 1.6, fadeIn: 0.01 });
    }
  }
  return kit.finish(RADIUS);
}
