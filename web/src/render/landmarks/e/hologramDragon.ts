// The hologram dragon: a giant serpent of light projected into the sky over a plaza, snaking an
// endless figure of eight above the rooftops, its body rippling, scanlines rolling through it
// and the odd glitch tearing it sideways. The whole creature is one mesh whose every vertex
// knows only where it sits along the body and across it; the vertex shader lays it on the moving
// path, so it costs one uniform per frame. The projector tower below is merged set-B buckets.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { Kit } from '../b/kit.ts';
import { T, box, mix, prism, shade } from '../b/shapes.ts';
import { finishCoast, lightCone } from '../c/kit.ts';
import { CONCRETE_DARK, CYAN, DARK, MAGENTA, STEEL } from './kit.ts';

const SALT = 0xd4a90;
/** The plaza and projector: the ground the landmark claims. The dragon flies far past it. */
const RADIUS = 70;
/** Body: length (m), rings along it and sides per ring (high, low), radius at the neck. */
const BODY_LEN = 260;
const RINGS = { high: 110, low: 56 } as const;
const SIDES = { high: 8, low: 6 } as const;
const GIRTH = 9;
/** Head: snout length and the radius it tapers from; horns. */
const SNOUT = 22;
const HORN = 16;
/** Dorsal spikes every this many rings, their height as a share of the girth there. */
const SPIKE_EVERY = 4;
const SPIKE = 1.4;
/** The flight path: a figure of eight centred over the plaza (half-widths, height, swell). */
const PATH_X = 210;
const PATH_Z = 110;
const PATH_H = 150;
const PATH_SWELL = 40;
/** Flight speed along the path (radians of path phase per second) and metres per radian. */
const SPEED = 0.09;
const PATH_SCALE = 260;
/** Body ripple: amplitude (m), waves along the body, rate (rad/s). */
const RIPPLE = 6;
const RIPPLE_WAVES = 14;
const RIPPLE_RATE = 3;
/** Light by day and at deep dusk. */
const GLOW_DAY = 0.15;
const GLOW_DUSK = 0.32;
/** Projector tower height and its beam. */
const TOWER_H = 34;
const BEAM_DAY = 0.05;
const BEAM_DUSK = 0.12;

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute float aT;
attribute vec3 aOff;
uniform float uTime;
varying float vT;
varying float vRim;
varying float vY;
vec3 path(float p) {
  return vec3(${PATH_X.toFixed(1)} * sin(p), ${PATH_H.toFixed(1)} + ${PATH_SWELL.toFixed(1)} * sin(2.0 * p + 1.0), ${PATH_Z.toFixed(1)} * sin(2.0 * p));
}
void main() {
  float p = uTime * ${SPEED.toFixed(3)} - aT * ${(BODY_LEN / PATH_SCALE).toFixed(4)};
  vec3 c = path(p);
  vec3 fwd = normalize(path(p + 0.002) - c);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);
  // The body ripples sideways and up in travelling waves, more toward the tail.
  float w = aT * ${RIPPLE_WAVES.toFixed(1)} - uTime * ${RIPPLE_RATE.toFixed(1)};
  c += (right * sin(w) + up * 0.5 * cos(w * 0.7)) * ${RIPPLE.toFixed(1)} * (0.3 + aT);
  // A glitch: now and then a band of the body tears sideways for a frame or two.
  float g = step(0.985, fract(sin(floor(uTime * 9.0) * 12.9898) * 43758.5453));
  c += right * g * step(0.45, fract(aT * 3.0 + uTime)) * 9.0;
  vec3 pos = c + right * aOff.x + up * aOff.y + fwd * aOff.z;
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vec3 n = normalize((modelMatrix * vec4(right * aOff.x + up * aOff.y, 0.0)).xyz + 1e-4);
  vec3 toEye = normalize(cameraPosition - (modelMatrix * vec4(pos, 1.0)).xyz);
  vRim = 1.0 - abs(dot(n, toEye));
  vT = aT;
  vY = pos.y;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform float uGlow;
uniform vec3 uHead;
uniform vec3 uTail;
varying float vT;
varying float vRim;
varying float vY;
void main() {
  vec3 col = mix(uHead, uTail, smoothstep(0.1, 0.9, vT));
  float scan = 0.6 + 0.4 * step(0.5, fract(vY * 0.35 - uTime * 2.0));
  float edge = 0.12 + 0.88 * pow(vRim, 2.0);
  float a = edge * scan * uGlow * (1.0 - 0.6 * smoothstep(0.85, 1.0, vT));
  gl_FragColor = vec4(col * a, 1.0);
  #include <colorspace_fragment>
  // Light fades into the haze rather than turning into it.
  #ifdef USE_FOG
  gl_FragColor.rgb *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
  #endif
}`;

/** Radius of the body at t (0 head, 1 tail tip). */
function girth(t: number): number {
  return GIRTH * (0.75 + 0.35 * Math.sin(Math.min(1, t * 4) * Math.PI * 0.5)) * (1 - 0.9 * t);
}

export function createHologramDragon(opts: LandmarkOptions): Landmark {
  const kit = new Kit(opts, SALT);
  const dusk = opts.palette.dusk;

  // --- The projector: a plaza, a lattice tower, an emitter ring throwing a beam at the sky ---
  kit.solid.add(prism(RADIUS * 0.9, RADIUS, 0.6, 16), CONCRETE_DARK);
  kit.lights.add(new THREE.TorusGeometry(RADIUS * 0.6, 0.3, 3, 32).rotateX(Math.PI / 2), shade(CYAN, 0.8), T(0, 0.7, 0), undefined, { depth: 0.5, freq: 2, phase: 0 });
  for (let i = 0; i < 4; i++) kit.solid.add(prism(0.6, 1.2, TOWER_H, 4), STEEL, T(Math.cos((i * Math.PI) / 2) * 5, 0, Math.sin((i * Math.PI) / 2) * 5, 0, Math.cos((i * Math.PI) / 2) * 0.12, -Math.sin((i * Math.PI) / 2) * 0.12));
  kit.solid.add(prism(6, 4, 4, 12), DARK, T(0, TOWER_H, 0));
  kit.lights.add(new THREE.TorusGeometry(4.5, 0.6, 4, 20).rotateX(Math.PI / 2), MAGENTA, T(0, TOWER_H + 4, 0), undefined, { depth: 0.6, freq: 6, phase: 0, sharp: 3 });
  kit.lamp(new THREE.OctahedronGeometry(2), [0, TOWER_H + 5, 0], mix(CYAN, 0xffffff, 0.4), 18, undefined, { depth: 0.4, freq: 9, phase: 0, sharp: 2 });
  lightCone(kit.beams, T(0, TOWER_H + 5, 0), PATH_H * 0.9, 2, 30, 6, shade(CYAN, BEAM_DAY + (BEAM_DUSK - BEAM_DAY) * dusk), undefined, { depth: 0.4, freq: 7, phase: 0, sharp: 2 });
  for (const [x, z] of [[20, -40], [-30, -35], [40, 20], [-45, 15]]) kit.solid.add(box(2, 1, 6), DARK, T(x, 0.5, z, Math.atan2(x, z)));

  // --- The dragon ---
  const geo = dragonGeometry(kit.high);
  const time = { value: 0 };
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uGlow: { value: GLOW_DAY + (GLOW_DUSK - GLOW_DAY) * dusk }, uHead: { value: new THREE.Color(CYAN) }, uTail: { value: new THREE.Color(MAGENTA) } }]);
  uniforms.uTime = time;
  const mat = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms, fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'dragon';
  // Laid out on its path in the shader: its rest bounds mean nothing.
  mesh.frustumCulled = false;
  kit.addObject(mesh, geo, mat);

  const lm = finishCoast(kit, RADIUS);
  return {
    ...lm,
    update(t, dt) {
      lm.update(t, dt);
      time.value = t;
    },
  };
}

/** The serpent as (position along the body, offset in the body's frame) pairs. */
function dragonGeometry(high: boolean): THREE.BufferGeometry {
  const rings = high ? RINGS.high : RINGS.low;
  const sides = high ? SIDES.high : SIDES.low;
  const ts: number[] = [];
  const off: number[] = [];
  const index: number[] = [];
  const vert = (t: number, x: number, y: number, z: number) => {
    ts.push(t);
    off.push(x, y, z);
    return ts.length - 1;
  };
  // Body: rings of `sides` round the spine.
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const g = girth(t);
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      vert(t, Math.cos(a) * g, Math.sin(a) * g * 0.8, 0);
    }
    if (r > 0) {
      const b0 = (r - 1) * sides;
      const b1 = r * sides;
      for (let s = 0; s < sides; s++) {
        const s1 = (s + 1) % sides;
        index.push(b0 + s, b1 + s, b1 + s1, b0 + s, b1 + s1, b0 + s1);
      }
    }
    // Dorsal spikes, sweeping back.
    if (r % SPIKE_EVERY === 2 && t < 0.92) {
      const a = vert(t, -g * 0.25, g * 0.7, 0);
      const b = vert(t, g * 0.25, g * 0.7, 0);
      const c = vert(Math.min(1, t + 0.012), 0, g * (0.8 + SPIKE), 0);
      index.push(a, b, c);
    }
  }
  // Head: a snout tapering forward from the neck ring, jaw below, two horns sweeping back.
  const neck = girth(0);
  const snout = [0, 0.35, 0.7, 1].map((u) => ({ z: u * SNOUT, r: neck * (1 - 0.7 * u) }));
  let prev = -1;
  for (const ring of snout) {
    const first = ts.length;
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      vert(0, Math.cos(a) * ring.r * 1.1, Math.sin(a) * ring.r * 0.6 + ring.z * 0.08, ring.z);
    }
    if (prev >= 0) for (let s = 0; s < sides; s++) {
      const s1 = (s + 1) % sides;
      index.push(prev + s, first + s, first + s1, prev + s, first + s1, prev + s1);
    }
    prev = first;
  }
  const tip = vert(0, 0, SNOUT * 0.08, SNOUT + 4);
  for (let s = 0; s < sides; s++) index.push(prev + s, tip, prev + ((s + 1) % sides));
  const jawA = vert(0, -neck * 0.5, -neck * 0.5, 2);
  const jawB = vert(0, neck * 0.5, -neck * 0.5, 2);
  const jawTip = vert(0, 0, -neck * 1.2, SNOUT * 0.9);
  index.push(jawA, jawB, jawTip);
  for (const side of [-1, 1]) {
    const a = vert(0, side * neck * 0.4, neck * 0.5, 2);
    const b = vert(0, side * neck * 0.7, neck * 0.4, -1);
    const c = vert(0, side * neck * 1.4, neck * 1.6, -HORN);
    index.push(a, b, c);
    // Whisker-fins at the jaw and a pair of claws a third of the way down the body.
    const w0 = vert(0, side * neck * 0.9, -neck * 0.2, SNOUT * 0.6);
    const w1 = vert(0, side * neck * 0.9, 0, SNOUT * 0.5);
    const w2 = vert(0, side * neck * 3.5, -neck * 1.5, -SNOUT * 0.6);
    index.push(w0, w1, w2);
    for (const t of [0.22, 0.55]) {
      const g = girth(t);
      const l0 = vert(t, side * g * 0.8, -g * 0.3, 2);
      const l1 = vert(t, side * g * 0.8, -g * 0.3, -2);
      const l2 = vert(t, side * g * 2.6, -g * 2.2, 3);
      index.push(l0, l1, l2);
    }
  }
  const geo = new THREE.BufferGeometry();
  // Positions are only a placeholder for three (it needs one); the shader builds the real ones.
  geo.setAttribute('position', new THREE.Float32BufferAttribute(off, 3));
  geo.setAttribute('aOff', new THREE.Float32BufferAttribute(off, 3));
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1));
  geo.setIndex(index);
  return geo;
}
