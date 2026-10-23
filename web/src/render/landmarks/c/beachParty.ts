// The beach party: a festival on the sand. A stage with a giant pulsing screen, sweeping
// searchlights and laser fans, a crowd dancing to the beat, beach balls bouncing over their
// heads, a bonfire throwing sparks, a volleyball game, striped umbrellas, a puffer-fish
// inflatable bobbing offshore and fireworks over the sea.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import type { Motion, V3 } from '../b/motion.ts';
import { sphereDir } from '../b/points.ts';
import { T, ball, beam, box, cone, lathe, mix, pick, prism, shade, vary } from '../b/shapes.ts';
import { bunting, lampString, quadPts } from '../b/props.ts';
import { DARK, FOAM, FOAM_Y, WHITE, finishCoast, lightCone } from './kit.ts';

const SALT = 0xbea0;
const RADIUS = 140;
const STAGE = { z: 62, w: 44, d: 20, deck: 2.6, tower: 24 } as const;
const SCREEN = { w: 30, h: 14, y: 8 } as const;
/** 128 beats per minute, in rad/s: the crowd, lights and screen all pulse on it. */
const BEAT = (128 / 60) * Math.PI * 2;
const CROWD = { high: 460, low: 200 } as const;
const SEARCHLIGHTS = 6;
const LASERS = { high: 10, low: 6 } as const;
const SPOTS = 8;
const SEARCH_LENGTH = 300;
const SPOT_LENGTH = 45;
const BONFIRE = { x: -78, z: 6 } as const;
const COURT = { x: 80, z: -18, w: 16, l: 30 } as const;
const UMBRELLAS = { high: 18, low: 9 } as const;
const FIREWORKS = { bursts: { high: 6, low: 3 }, sparks: { high: 56, low: 34 } } as const;
const BEACH_BALLS = { high: 5, low: 3 } as const;

const SCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SCREEN_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uGlow;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  vec2 p = (vUv - 0.5) * vec2(${(SCREEN.w / SCREEN.h).toFixed(3)}, 1.0);
  float beat = pow(0.5 + 0.5 * sin(uTime * ${BEAT.toFixed(4)}), 4.0);
  float rings = 0.5 + 0.5 * sin(length(p) * 18.0 - uTime * 6.0);
  float bars = step(0.5, fract(vUv.x * 12.0 + uTime * 0.5)) * step(vUv.y, 0.25 + 0.6 * abs(sin(floor(vUv.x * 12.0) * 1.7 + uTime * 3.0)));
  vec3 col = mix(uA, uB, rings);
  col = mix(col, uC, bars * 0.85);
  col *= 0.55 + 0.45 * beat;
  // Pixel grid: the screen reads as LEDs up close.
  vec2 g = fract(vUv * vec2(96.0, 44.0));
  col *= 0.75 + 0.25 * step(0.2, g.x) * step(0.2, g.y);
  gl_FragColor = vec4(col * uGlow, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function stage(kit: Kit): void {
  const { z, w, d, deck, tower } = STAGE;
  kit.solid.add(box(w, deck, d), DARK, T(0, 0, z));
  kit.solid.add(box(w + 4, 0.4, d + 2), shade(kit.palette.accent, 0.5), T(0, deck, z));
  for (const x of [-w / 2, w / 2]) for (const dz of [-d / 2, d / 2]) kit.solid.add(box(1.2, tower, 1.2), 0x8a8a90, T(x, deck, z + dz));
  for (const dz of [-d / 2, d / 2]) kit.solid.add(box(w + 1.2, 1.4, 1.2), 0x8a8a90, T(0, deck + tower, z + dz));
  // Arched roof, striped in the track's accent.
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI;
    const a1 = ((i + 1) / 8) * Math.PI;
    const p = (a: number, dz: number): V3 => [Math.cos(a) * (w / 2 + 1), deck + tower + 1.4 + Math.sin(a) * 7, z + dz];
    kit.solid.add(quadPts(p(a0, -d / 2 - 1), p(a1, -d / 2 - 1), p(a1, d / 2 + 1), p(a0, d / 2 + 1)), i % 2 ? WHITE : kit.palette.accent);
  }
  // Speaker stacks and a DJ booth.
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) kit.solid.add(box(5, 3.6, 4), 0x1a1a1e, T(s * (w / 2 + 4), k * 3.7, z - d / 2 + 2));
  kit.solid.add(box(8, 1.4, 3), WHITE, T(0, deck + 0.4, z - 3));
  for (let i = 0; i < 3; i++) kit.crowd({ x: -4 + i * 4, y: deck + 0.4, z: z + (i === 1 ? -1 : -4.5), ry: Math.PI, color: kit.festiveColor(), scale: 1.2, hop: 0.6, freq: BEAT, phase: i, sharp: 3, raise: 1 });
  // The screen behind them.
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uA: { value: new THREE.Color(kit.palette.accent) }, uB: { value: new THREE.Color(0xff3a8a) }, uC: { value: new THREE.Color(0xffd040) } }]);
  uniforms.uTime = kit.u.uTime;
  uniforms.uGlow = kit.u.uGlow;
  const mat = new THREE.ShaderMaterial({ vertexShader: SCREEN_VERTEX, fragmentShader: SCREEN_FRAGMENT, uniforms, fog: true });
  const geo = new THREE.PlaneGeometry(SCREEN.w, SCREEN.h).rotateY(Math.PI).translate(0, deck + SCREEN.y, z + d / 2 - 1.2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'screen';
  kit.addObject(mesh, geo, mat);
  kit.solid.add(box(SCREEN.w + 2, SCREEN.h + 2, 0.8), 0x1a1a1e, T(0, deck + SCREEN.y - SCREEN.h / 2 - 1, z + d / 2 - 0.6));
}

function lightShow(kit: Kit): void {
  const { rng } = kit;
  const { z, w, d, deck, tower } = STAGE;
  const top = deck + tower + 1.4;
  // Additive light over a bright day sky saturates fast: barely there at noon, bold at dusk.
  const strength = 0.004 + 0.08 * kit.dusk * kit.dusk;
  // Searchlights: long pale cones sweeping the sky from the roof.
  for (let i = 0; i < SEARCHLIGHTS; i++) {
    const x = -w / 2 + (i * w) / (SEARCHLIGHTS - 1);
    const pivot: V3 = [x, top + 1, z + d / 2];
    const motion: Motion = { pivot, axisB: [0, 0, 1], swingB: 0.55, freq: 0.5 + (i % 3) * 0.12, phase: i * 1.3 };
    const col = new THREE.Color(pick(rng, [0xffffff, 0x8ad8ff, 0xff9ad8])).multiplyScalar(strength);
    lightCone(kit.beams, T(pivot[0], pivot[1], pivot[2], 0, -0.15), SEARCH_LENGTH, 0.7, 12, 5, col, motion);
    kit.solid.add(prism(1, 1.2, 1.6, 6), DARK, T(pivot[0], pivot[1] - 1.6, pivot[2]));
  }
  // Spots raking the crowd, swinging on the beat.
  for (let i = 0; i < SPOTS; i++) {
    const x = -w / 2 + 2 + (i * (w - 4)) / (SPOTS - 1);
    const pivot: V3 = [x, deck + tower, z - d / 2];
    const motion: Motion = { pivot, axisB: [0, 0, 1], swingB: 0.35, freq: BEAT / 4, phase: i * 0.8 };
    const col = new THREE.Color(kit.lamps[i % kit.lamps.length]).multiplyScalar(strength * 1.6);
    lightCone(kit.beams, T(pivot[0], pivot[1], pivot[2], 0, 0.75 + Math.PI), SPOT_LENGTH, 0.4, 6, 3, col, motion, { depth: 0.6, freq: BEAT, phase: i, sharp: 3 });
    kit.lamp(new THREE.OctahedronGeometry(0.6), pivot, kit.lamps[i % kit.lamps.length], 3, undefined, { depth: 0.8, freq: BEAT, phase: i, sharp: 3 });
  }
  // Laser fan out over the crowd and the beach.
  const nL = kit.q(LASERS.high, LASERS.low);
  for (let i = 0; i < nL; i++) {
    const origin: V3 = [0, deck + SCREEN.y + SCREEN.h / 2 + 2, z + d / 2 - 1.5];
    const motion: Motion = { pivot: origin, axisB: [0, 1, 0], swingB: 0.5, freq: 0.9, phase: (i / nL) * Math.PI * 2 };
    const yaw = Math.PI + (i / (nL - 1) - 0.5) * 1.4;
    const col = new THREE.Color(i % 2 ? 0x40ff80 : 0xff40c0).multiplyScalar(0.1 + 0.5 * kit.dusk);
    kit.beams.add(new THREE.CylinderGeometry(0.18, 0.18, 220, 4, 1, true).translate(0, 110, 0), col, T(origin[0], origin[1], origin[2], yaw, 1.45), motion, { depth: 0.7, freq: BEAT / 2, phase: i, sharp: 2 });
  }
}

function dancers(kit: Kit): void {
  const { rng } = kit;
  const n = kit.q(CROWD.high, CROWD.low);
  for (let i = 0; i < n; i++) {
    // A fan spreading back from the stage front, densest at the barrier.
    const a = (rng() - 0.5) * 1.6;
    const r = 6 + Math.sqrt(rng()) * 62;
    kit.crowd({ x: Math.sin(a) * r * 1.15, y: 0, z: STAGE.z - STAGE.d / 2 - 2 - Math.cos(a) * r, ry: Math.PI + a * 0.6, color: vary(rng, kit.festiveColor(), 0.25), hop: 0.3 + rng() * 0.35, freq: BEAT, phase: rng() * 0.6, sharp: 3, raise: rng() < 0.6 ? 0.9 : 0.2 });
  }
  // Beach balls bounced over their heads: drifting one way, popping up on every hit.
  for (let i = 0; i < kit.q(BEACH_BALLS.high, BEACH_BALLS.low); i++) {
    const x = (rng() - 0.5) * 60;
    const z = STAGE.z - 30 - rng() * 30;
    const motion: Motion = { hop: 8 + rng() * 5, freq: 1.6 + rng() * 0.6, phase: rng() * 6, drift: [6 + rng() * 8, 0, 4], driftFreq: 0.25 + rng() * 0.1 };
    for (let g = 0; g < 6; g++) kit.moving.add(lathe([[0.01, 1.4], [1, 1], [1.4, 0], [1, -1], [0.01, -1.4]], 2, (g / 6) * Math.PI * 2, Math.PI / 3), g % 2 ? WHITE : kit.festive[(i + g) % kit.festive.length], T(x, 4, z), motion);
  }
}

function bonfire(kit: Kit, sparks: ReturnType<Kit['particles']>): void {
  const { rng } = kit;
  const { x, z } = BONFIRE;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    kit.solid.add(beam([x + Math.cos(a) * 3, 0, z + Math.sin(a) * 3], [x, 3.4, z], 0.35, 5), 0x5a3a20);
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    kit.solid.add(new THREE.DodecahedronGeometry(0.6, 0), 0x6a6a6a, T(x + Math.cos(a) * 4.2, 0.2, z + Math.sin(a) * 4.2));
  }
  // Flames: nested flickering cones, the hot core inside.
  const flame = [0xff5a10, 0xff9a20, 0xffd060];
  flame.forEach((c, k) => {
    for (let j = 0; j < 3; j++) {
      const a = (j / 3) * Math.PI * 2 + k;
      kit.lamp(cone(2.2 - k * 0.6, 6 - k * 1.2, 5), [x + Math.cos(a) * 0.8, 0.4, z + Math.sin(a) * 0.8], c, k === 2 ? 14 : 0, undefined, { depth: 0.5, freq: 7 + j * 2.3 + k, phase: j * 1.7 + k, sharp: 2 });
    }
  });
  for (let i = 0; i < kit.q(50, 26); i++) {
    const period = 2 + rng() * 1.5;
    sparks.add([x + (rng() - 0.5) * 2, 4, z + (rng() - 0.5) * 2], [(rng() - 0.5) * 3, 6 + rng() * 6, (rng() - 0.5) * 3], 0xffb040, 0.6 + rng() * 0.5, { period, lifetime: period, phase: rng() * period }, { gravity: -0.5, drag: 0.5, fadeIn: 0.05 });
  }
  // Friends round the fire, swaying.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rng() * 0.2;
    kit.crowd({ x: x + Math.cos(a) * 7, y: 0, z: z + Math.sin(a) * 7, ry: -a - Math.PI / 2, color: kit.festiveColor(), hop: 0.1, freq: 2.5, phase: i, raise: 0.3 });
  }
}

function volleyball(kit: Kit): void {
  const { x, z, w, l } = COURT;
  const line = (a: V3, b: V3): void => kit.solid.add(beam(a, b, 0.12, 3), WHITE);
  line([x - w / 2, 0.1, z - l / 2], [x + w / 2, 0.1, z - l / 2]);
  line([x - w / 2, 0.1, z + l / 2], [x + w / 2, 0.1, z + l / 2]);
  line([x - w / 2, 0.1, z - l / 2], [x - w / 2, 0.1, z + l / 2]);
  line([x + w / 2, 0.1, z - l / 2], [x + w / 2, 0.1, z + l / 2]);
  for (const s of [-1, 1]) kit.solid.add(beam([x + s * (w / 2 + 1), 0, z], [x + s * (w / 2 + 1), 2.6, z], 0.1, 4), WHITE);
  kit.solid.add(box(w + 2, 1, 0.05), 0x1a1a1e, T(x, 1.5, z));
  kit.solid.add(box(w + 2, 0.12, 0.08), WHITE, T(x, 2.5, z));
  // The ball crosses the net (drift along the court) and arcs highest over it: the hop runs
  // at twice the drift rate, in step, so it is low at each end (the hits).
  const rally = 0.9;
  const ballMotion: Motion = { drift: [0, 0, l * 0.36], driftFreq: rally, hop: 7, freq: 2 * rally, phase: -Math.PI / 2 };
  kit.moving.add(ball(0.5, 6, 4), 0xf4d03f, T(x, 2.2, z), ballMotion);
  for (let i = 0; i < 4; i++) {
    // Everyone springs at each hit, when the ball is low at one end or the other.
    const side = i < 2 ? -1 : 1;
    kit.crowd({ x: x + (i % 2 ? -3.5 : 3.5), y: 0, z: z + side * l * 0.32, ry: side > 0 ? Math.PI : 0, color: side > 0 ? 0xe8443a : 0x2f8fd8, hop: 0.7, freq: 2 * rally, phase: Math.PI / 2, sharp: 4, raise: 1 });
  }
}

function beachDressing(kit: Kit): void {
  const { rng } = kit;
  for (let i = 0; i < kit.q(UMBRELLAS.high, UMBRELLAS.low); i++) {
    const a = rng() * Math.PI * 2;
    const r = 85 + rng() * 40;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.6;
    const col = kit.festiveColor();
    kit.solid.add(beam([x, 0, z], [x, 3.3, z], 0.08, 3), WHITE);
    for (let g = 0; g < 8; g++) kit.solid.add(lathe([[0.05, 0.9], [2.6, 0]], 1, (g / 8) * Math.PI * 2, Math.PI / 4), g % 2 ? WHITE : col, T(x, 2.9, z));
    kit.solid.add(box(1, 0.35, 2.2), kit.festiveColor(), T(x + 1.5, 0, z));
  }
  // Inflatable arch over the entrance.
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI;
    const a1 = ((i + 1) / 12) * Math.PI;
    kit.solid.add(beam([Math.cos(a0) * 12, Math.sin(a0) * 10, -112], [Math.cos(a1) * 12, Math.sin(a1) * 10, -112], 1.6, 6), kit.festive[i % kit.festive.length]);
  }
  // A giant puffer-fish inflatable bobbing offshore, with rubber rings round it.
  const pf: V3 = [-30, 0, 120];
  const bob: Motion = { pivot: pf, axisB: [1, 0, 0], swingB: 0.08, freq: 0.9, hop: 1.2 };
  kit.moving.add(ball(9, 10, 7), 0xffc040, T(pf[0], 6, pf[2]), bob);
  for (let i = 0; i < 14; i++) {
    const d = sphereDir(rng);
    if (d[1] < -0.3) continue;
    kit.moving.add(cone(1.2, 4, 4), 0xf08a20, T(pf[0] + d[0] * 8.5, 6 + d[1] * 8.5, pf[2] + d[2] * 8.5, Math.atan2(d[0], d[2]), Math.acos(d[1])), bob);
  }
  for (const s of [-1, 1]) kit.moving.add(ball(1.6, 6, 4), WHITE, T(pf[0] - 8.5, 9, pf[2] + s * 4), bob);
  for (let i = 0; i < 6; i++) {
    const at: V3 = [pf[0] + 30 + i * 12, 0.3, pf[2] - 10 + (i % 2) * 14];
    kit.moving.add(new THREE.TorusGeometry(1.8, 0.7, 5, 10).rotateX(Math.PI / 2), i % 2 ? 0xff5a7a : 0x40c8e0, T(at[0], at[1], at[2]), { hop: 0.5, freq: 1 + i * 0.1, phase: i });
  }
  kit.moving.add(prism(14, 14, 0.1, 14), mix(FOAM, 0x6ac8d8, 0.3), T(pf[0], FOAM_Y, pf[2]), { drift: [0, 0.1, 0], driftFreq: 0.9 });
  // Light strings from the stage towers out to poles round the dance floor.
  const poles: V3[] = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + 0.35 + (i / 5) * (Math.PI - 0.7);
    poles.push([Math.cos(a) * 70, 8, STAGE.z - 10 + Math.sin(a) * 75]);
  }
  for (const p of poles) kit.solid.add(beam([p[0], 0, p[2]], p, 0.15, 4), DARK);
  for (let i = 0; i < poles.length; i++) {
    const towerTop: V3 = [(i < 3 ? -1 : 1) * STAGE.w / 2, STAGE.deck + STAGE.tower, STAGE.z - STAGE.d / 2];
    lampString(kit, towerTop, poles[i], 3, kit.q(12, 6), 0.26, 1.8);
    if (i > 0) bunting(kit, poles[i - 1], poles[i], 2.5, kit.q(10, 5), 1.1);
  }
}

function fireworks(kit: Kit, sparks: ReturnType<Kit['particles']>): void {
  const { rng } = kit;
  for (let b = 0; b < kit.q(FIREWORKS.bursts.high, FIREWORKS.bursts.low); b++) {
    const origin: V3 = [(rng() - 0.5) * 140, 110 + rng() * 50, 120 + rng() * 60];
    const period = 4.5 + rng() * 3;
    const phase = rng() * period;
    const colA = pick(rng, kit.lamps);
    const colB = pick(rng, kit.festive);
    const speed = 22 + rng() * 10;
    for (let i = 0; i < kit.q(FIREWORKS.sparks.high, FIREWORKS.sparks.low); i++) {
      const d = sphereDir(rng);
      sparks.add(origin, [d[0] * speed, d[1] * speed, d[2] * speed], i % 3 ? colA : colB, 3.4, { period, lifetime: 2.2, phase }, { gravity: 7, drag: 1.4, jitter: 60, fadeIn: 0.02 });
    }
  }
}

export function createBeachParty(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const sparks = kit.particles(true, 1.6);
  stage(kit);
  lightShow(kit);
  dancers(kit);
  bonfire(kit, sparks);
  volleyball(kit);
  beachDressing(kit);
  fireworks(kit, sparks);
  return finishCoast(kit, RADIUS);
}
