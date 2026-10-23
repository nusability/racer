// The aurora: curtains of green and violet light rippling across the night sky, folds travelling
// along them, fine rays shimmering, a bright hem along their lower edge. Like the sky it hangs at
// a fixed distance round the viewer (it is a hundred kilometres up; nothing on the ground gives
// it parallax), so it crowns the whole track from anywhere on it. One draw for the curtains, one
// for the stars on night palettes; the whole show runs in the shaders.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { mulberry32 } from '../../../core/rng.ts';

const SALT = 0xa0ba;
/** Bigger than any view distance, so the track never culls it: it belongs to the whole sky. */
const RADIUS = 3000;
const CURTAINS = { high: 5, low: 3 } as const;
const SEGMENTS = { high: 140, low: 70 } as const;
/** Curtains stand this far from the viewer (m), their hems this high, this tall. */
const DIST: readonly [number, number] = [1300, 2300];
const HEM: readonly [number, number] = [380, 620];
const HEIGHT: readonly [number, number] = [420, 700];
const SPAN: readonly [number, number] = [1.2, 2.4];
const STARS = { high: 700, low: 350 } as const;
const STAR_DIST = 2600;
/** Stars only come out on palettes this dark. */
const STAR_DUSK = 0.55;

const CURTAIN_VERTEX = /* glsl */ `
attribute vec3 aUV;
attribute float aSeed;
uniform float uTime;
varying vec3 vUV;
varying float vSeed;
void main() {
  vec3 p = position;
  // Folds travel along the curtain; the hem ripples faster than the top.
  float fold = sin(aUV.x * 9.0 + uTime * 0.32 + aSeed * 5.0) * 0.65 + sin(aUV.x * 23.0 - uTime * 0.55 + aSeed) * 0.3;
  vec2 radial = normalize(p.xz);
  p.xz += radial * fold * 70.0 * (0.5 + 0.5 * aUV.y);
  p.y += sin(aUV.x * 31.0 + uTime * 0.8 + aSeed * 3.0) * 22.0 * (1.0 - aUV.y);
  // Rotate with the placement but stay centred on the viewer, at the landmark's ground height.
  vec3 w = (modelMatrix * vec4(p, 0.0)).xyz / length(modelMatrix[0].xyz);
  vec3 world = vec3(cameraPosition.x, modelMatrix[3].y, cameraPosition.z) + w;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  vUV = aUV;
  vSeed = aSeed;
}`;

const CURTAIN_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uStrength;
uniform vec3 uLow;
uniform vec3 uMid;
uniform vec3 uHigh;
varying vec3 vUV;
varying float vSeed;
void main() {
  float v = vUV.y;
  float body = smoothstep(0.0, 0.04, v) * (1.0 - v);
  float hem = exp(-v * 22.0) * 0.8;
  // Rays lean a little with height, as if the field lines were seen at an angle.
  float x = vUV.x + v * 0.015;
  float rays = 0.5 + 0.5 * sin(x * 150.0 + uTime * 1.4 + vSeed * 7.0) * sin(x * 61.0 - uTime * 0.8);
  float pulse = 0.55 + 0.45 * sin(vUV.x * 5.0 - uTime * 0.45 + vSeed * 3.0);
  float ends = smoothstep(0.0, 0.12, vUV.z) * smoothstep(1.0, 0.88, vUV.z);
  vec3 col = mix(uLow, uMid, smoothstep(0.05, 0.3, v));
  col = mix(col, uHigh, smoothstep(0.35, 0.85, v));
  float a = (body * (0.3 + 0.7 * rays * rays) + hem * (0.6 + 0.4 * rays)) * pulse * ends * uStrength;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  #include <colorspace_fragment>
}`;

const STAR_VERTEX = /* glsl */ `
attribute float aTwinkle;
uniform float uTime;
uniform float uPixel;
varying float vBright;
void main() {
  vec3 world = vec3(cameraPosition.x, modelMatrix[3].y, cameraPosition.z) + position;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  vBright = 0.55 + 0.45 * sin(uTime * (1.5 + aTwinkle * 3.0) + aTwinkle * 40.0);
  gl_PointSize = uPixel * (1.0 + aTwinkle);
}`;

const STAR_FRAGMENT = /* glsl */ `
uniform float uStrength;
varying float vBright;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a = max(0.0, 1.0 - dot(q, q)) * vBright * uStrength;
  gl_FragColor = vec4(vec3(0.9, 0.95, 1.0), a);
}`;

export function createAuroraSky(opts: LandmarkOptions): Landmark {
  const rng = mulberry32((opts.seed ^ SALT) >>> 0);
  const high = opts.quality === 'high';
  const dusk = opts.palette.dusk;
  const group = new THREE.Group();
  const time = { value: 0 };

  // --- Curtains: ribbons arcing round the viewer, two vertices (hem, top) per station ---
  const nC = high ? CURTAINS.high : CURTAINS.low;
  const nS = high ? SEGMENTS.high : SEGMENTS.low;
  const pos: number[] = [];
  const uv: number[] = [];
  const seed: number[] = [];
  const index: number[] = [];
  for (let c = 0; c < nC; c++) {
    const a0 = (c / nC) * Math.PI * 2 + rng() * 0.8;
    const span = SPAN[0] + rng() * (SPAN[1] - SPAN[0]);
    const r0 = DIST[0] + rng() * (DIST[1] - DIST[0]);
    const hem = HEM[0] + rng() * (HEM[1] - HEM[0]);
    const tall = HEIGHT[0] + rng() * (HEIGHT[1] - HEIGHT[0]);
    const wob = rng() * 6;
    const s = rng();
    let along = 0;
    let prevX = 0;
    let prevZ = 0;
    const base = pos.length / 3;
    for (let i = 0; i <= nS; i++) {
      const t = i / nS;
      const a = a0 + span * t;
      // The curtain's plan wanders in and out, like a real arc of the oval.
      const r = r0 * (1 + 0.12 * Math.sin(t * 5 + wob) + 0.05 * Math.sin(t * 13 + wob * 2));
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (i > 0) along += Math.hypot(x - prevX, z - prevZ) / 1000;
      prevX = x;
      prevZ = z;
      const h = tall * (0.75 + 0.25 * Math.sin(t * 7 + wob));
      pos.push(x, hem, z, x, hem + h, z);
      uv.push(along, 0, t, along, 1, t);
      seed.push(s, s);
      if (i > 0) {
        const k = base + (i - 1) * 2;
        index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aUV', new THREE.Float32BufferAttribute(uv, 3));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  geo.setIndex(index);
  const accent = new THREE.Color(opts.palette.accent);
  const mat = new THREE.ShaderMaterial({
    vertexShader: CURTAIN_VERTEX,
    fragmentShader: CURTAIN_FRAGMENT,
    uniforms: {
      uTime: time,
      // A hint by day, full glory at night.
      uStrength: { value: STRENGTH_DAY + (1 - STRENGTH_DAY) * dusk ** 1.2 },
      uLow: { value: new THREE.Color(0x3dff8a).lerp(accent, ACCENT_MIX) },
      uMid: { value: new THREE.Color(0x20e0b0) },
      uHigh: { value: new THREE.Color(0xb050ff) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const curtains = new THREE.Mesh(geo, mat);
  curtains.name = 'aurora';
  // It is placed round the camera in the shader; its own bounds mean nothing.
  curtains.frustumCulled = false;
  curtains.renderOrder = SKY_ORDER;
  group.add(curtains);
  const owned: { dispose(): void }[] = [geo, mat];

  // --- Stars, on night palettes only ---
  if (dusk >= STAR_DUSK) {
    const n = high ? STARS.high : STARS.low;
    const sp: number[] = [];
    const tw: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const el = Math.asin(0.08 + rng() * 0.92);
      sp.push(Math.cos(a) * Math.cos(el) * STAR_DIST, Math.sin(el) * STAR_DIST, Math.sin(a) * Math.cos(el) * STAR_DIST);
      tw.push(rng() * rng());
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('aTwinkle', new THREE.Float32BufferAttribute(tw, 1));
    const sm = new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      uniforms: { uTime: time, uPixel: { value: STAR_PIXELS }, uStrength: { value: (dusk - STAR_DUSK) / (1 - STAR_DUSK) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const stars = new THREE.Points(sg, sm);
    stars.name = 'stars';
    stars.frustumCulled = false;
    stars.renderOrder = SKY_ORDER;
    group.add(stars);
    owned.push(sg, sm);
  }

  return {
    group,
    radius: RADIUS,
    update(t) {
      time.value = t;
    },
    dispose() {
      for (const d of owned) d.dispose();
    },
  };
}

const STRENGTH_DAY = 0.07;
const ACCENT_MIX = 0.15;
const STAR_PIXELS = 1.6;
/** Drawn before the world's transparent effects: it is the farthest thing in the scene. */
const SKY_ORDER = -10;
