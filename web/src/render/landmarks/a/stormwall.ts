// Storm wall: a haboob kilometres wide, rolling on the horizon. Three curved translucent
// sheets stack into a towering dust front whose billowing tops churn upward and whose silhouette
// slowly reshapes; lightning flickers deep inside, lighting the dust from within; rolling puffs
// boil along its foot and debris swirls ahead of it. Built to be placed far off.

import * as THREE from 'three';
import type { Landmark, LandmarkOptions } from '../types.ts';
import { between, brush, col, disposeKit, glowBoost, makeKit, mix, mulberry32, shade, strut, type Rng } from './kit.ts';

const WIDTH = 3200;
/** How far the wall's ends curve toward the viewer, metres. */
const BEND = 420;
const RADIUS = WIDTH / 2;
const HEIGHT = 700;
const SHEET_SEGMENTS = 40;

/** Sheets from back to front: depth offset, height, opacity, share of the lightning glow. */
const SHEETS = [
  { z: 260, h: 640, opacity: 0.85, flash: 0.6, tone: 0.75 },
  { z: 120, h: 520, opacity: 0.9, flash: 1, tone: 0.45 },
  { z: 0, h: 380, opacity: 0.92, flash: 0.75, tone: 0.15 },
] as const;

/** Scene fog the wall takes: it stands in the far haze but must still loom out of it. */
const STORM_FOG = 0.42;
const NOISE_SIZE = 256;
const NOISE_OCTAVES = 5;

const FLASH_MIN_GAP = 0.8;
const FLASH_MAX_GAP = 4.5;
const FLASH_LEN = 0.45;
const BOLT_SHAPES = 4;
const BOLT_STEPS = 9;
/** Bolts strike just in front of the front sheet, so the dust doesn't swallow them. */
const BOLT_AHEAD = 20;

const VERT = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform float uSeed;
uniform float uWidth;
uniform float uHeight;
uniform float uOpacity;
uniform vec3 uBase;
uniform vec3 uMid;
uniform vec3 uTop;
uniform vec3 uFlashCol;
uniform float uFlash;
uniform vec2 uFlashPos;
uniform float uFogScale;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec2 vUv;
varying float vDepth;
void main() {
  float x = vUv.x * uWidth;
  float y = vUv.y;
  vec2 p = vec2(x, y * uHeight) / 900.0;
  // Two scales of billow, both boiling upward and rolling sideways at different rates.
  float n1 = texture2D(uNoise, p + vec2(uSeed + uTime * 0.003, -uTime * 0.010)).r;
  float n2 = texture2D(uNoise, p * 2.9 + vec2(-uTime * 0.008, -uTime * 0.028)).r;
  float n = n1 * 0.62 + n2 * 0.38;
  // The silhouette: a slowly shifting skyline of towering cells.
  float top = 0.58 + 0.42 * texture2D(uNoise, vec2(x / 2400.0 + uSeed * 0.37, uTime * 0.0015 + 0.5)).r;
  float edge = top - y - (n - 0.5) * 0.42;
  float a = smoothstep(0.0, 0.09, edge);
  a *= smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
  // Sunlit cauliflower tops, dense dark body, darkest at the foot.
  float lit = clamp(1.0 - edge * 2.6, 0.0, 1.0);
  vec3 c = mix(uBase, uMid, smoothstep(0.0, 0.75, y + (n - 0.5) * 0.5));
  c = mix(c, uTop, lit * (0.35 + n * 0.65));
  c *= 0.65 + n * 0.7;
  float d = length((vUv - uFlashPos) * vec2(uWidth / uHeight, 1.0));
  c += uFlashCol * uFlash * exp(-d * 2.2) * (0.5 + n);
  float f = smoothstep(fogNear, fogFar, vDepth) * uFogScale;
  gl_FragColor = vec4(mix(c, fogColor, f), a * uOpacity);
  #include <colorspace_fragment>
}`;

export function createStormwall(opts: LandmarkOptions): Landmark {
  const { palette, quality } = opts;
  const hi = quality === 'high';
  const rng = mulberry32(opts.seed ^ 0x570a);
  const boost = glowBoost(palette);
  const sheets = hi ? SHEETS : SHEETS.slice(1);
  const kit = makeKit(1 + BOLT_STEPS + (hi ? 40 : 20), 1 + BOLT_STEPS, hi ? 300 : 140);
  const { group, rig, glow, smoke } = kit;
  smoke.setFogScale(STORM_FOG);
  glow.setFogScale(STORM_FOG);

  const noise = makeNoiseTexture(rng);
  const base = shade(mix(palette.rock, palette.sand, 0.3), 0.42);
  const mid = shade(mix(palette.sand, palette.rock, 0.3), 0.85);
  const top = mix(palette.sun, palette.sand, 0.45).multiplyScalar(1.1 - palette.dusk * 0.15);
  const flashCol = col(0xb8d0ff).multiplyScalar(boost);
  const seed = rng() * 10;

  const materials: THREE.ShaderMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  sheets.forEach((s, i) => {
    const g = new THREE.PlaneGeometry(WIDTH, s.h, SHEET_SEGMENTS, 1).translate(0, s.h / 2, 0);
    const p = g.getAttribute('position');
    for (let v = 0; v < p.count; v++) {
      const u = p.getX(v) / (WIDTH / 2);
      p.setZ(v, s.z - BEND * u * u);
    }
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uNoise: { value: null },
          uTime: { value: 0 },
          uSeed: { value: seed + i * 3.1 },
          uWidth: { value: WIDTH },
          uHeight: { value: s.h },
          uOpacity: { value: s.opacity },
          uBase: { value: mix(base, mid, s.tone * 0.6) },
          uMid: { value: mix(mid, palette.horizon, s.tone * 0.5) },
          uTop: { value: mix(top, palette.horizon, s.tone * 0.4) },
          uFlashCol: { value: flashCol.clone().multiplyScalar(s.flash) },
          uFlash: { value: 0 },
          uFlashPos: { value: new THREE.Vector2(0.5, 0.4) },
          uFogScale: { value: STORM_FOG },
        },
      ]),
      transparent: true,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
    });
    // Merged uniforms are clones; the texture is shared, so set it after merging.
    m.uniforms.uNoise.value = noise;
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = SHEET_ORDER + i;
    mesh.frustumCulled = true;
    group.add(mesh);
    materials.push(m);
    geometries.push(g);
  });

  // Lightning bolts: jagged forked ribbons, one bone each, flashed one at a time.
  const bolts: THREE.Bone[] = [];
  const joints: THREE.Vector3[][] = [];
  const boltCol = col(0xeef4ff);
  for (let b = 0; b < BOLT_SHAPES; b++) {
    const bone = rig.bone();
    let prev = new THREE.Vector3(0, 0, 0);
    const js: THREE.Vector3[] = [];
    joints.push(js);
    for (let k = 1; k <= BOLT_STEPS; k++) {
      const next = new THREE.Vector3((rng() - 0.5) * 50, -k * (220 / BOLT_STEPS), (rng() - 0.5) * 20);
      rig.add(strut(), boltCol, { bone, layer: 'glow', m: between(prev, next, 5) });
      if (k === 3 || k === 6) {
        const fork = next.clone().add(new THREE.Vector3((rng() - 0.5) * 120, -60 - rng() * 40, 0));
        rig.add(strut(), boltCol, { bone, layer: 'glow', m: between(next, fork, 3) });
      }
      js.push(next);
      prev = next;
    }
    bone.scale.setScalar(0);
    bolts.push(bone);
  }
  rig.build(group, RADIUS, HEIGHT);

  const roll = brush({ life: 9, size0: 90, size1: 200, c0: shade(base, 1.1), c1: mix(mid, palette.horizon, 0.4), alpha: 0.7, keep: 0.8, lift: 1.5 });
  const debris = brush({ life: 6, size0: 5, size1: 3, c0: col(0x3a2e24), c1: col(0x5a4a3a), alpha: 0.9, keep: 0.95, lift: 0 });

  const evt = mulberry32(opts.seed ^ 0xb017);
  let nextFlash = 1;
  let flashT = -1;
  let flashBolt = 0;
  let flashU = 0.5;
  let flashV = 0.4;
  let acc = 0;

  function update(time: number, dt: number): void {
    for (const m of materials) m.uniforms.uTime.value = time;

    // Lightning: a stutter of two or three flickers, a bolt during the first.
    if (dt > 0) {
      nextFlash -= dt;
      if (nextFlash <= 0) {
        nextFlash = FLASH_MIN_GAP + evt() * (FLASH_MAX_GAP - FLASH_MIN_GAP);
        flashT = 0;
        flashBolt = Math.floor(evt() * BOLT_SHAPES);
        flashU = 0.15 + evt() * 0.7;
        flashV = 0.4 + evt() * 0.3;
      }
    }
    let flash = 0;
    if (flashT >= 0) {
      flashT += dt;
      const t = flashT;
      flash = Math.max(0, 1 - t / 0.08) + 0.8 * Math.max(0, 1 - Math.abs(t - 0.2) / 0.06) + 0.5 * Math.max(0, 1 - Math.abs(t - 0.34) / 0.05);
      if (t > FLASH_LEN) flashT = -1;
    }
    const x = (flashU - 0.5) * WIDTH;
    const z = -BOLT_AHEAD - BEND * Math.pow(flashU * 2 - 1, 2);
    const y = flashV * SHEETS[1].h;
    bolts.forEach((b, i) => {
      const on = i === flashBolt && flashT >= 0 && flashT < 0.26 && (flashT < 0.08 || flashT > 0.15);
      b.scale.setScalar(on ? 1 : 0);
      if (on) b.position.set(x, y + 120, z);
    });
    // Halos along the bolt: the scene fog would otherwise dull a thin far line to haze colour.
    const js = joints[flashBolt];
    const lit = flashT >= 0 && flashT < 0.26 && (flashT < 0.08 || flashT > 0.15);
    for (let k = 0; k < BOLT_STEPS; k++) {
      glow.lamp(1 + k, x + js[k].x, y + 120 + js[k].y, z + js[k].z, 14, flashCol, lit ? 0.6 : 0);
    }
    for (const m of materials) {
      m.uniforms.uFlash.value = flash;
      (m.uniforms.uFlashPos.value as THREE.Vector2).set(flashU, flashV * (SHEETS[1].h / (m.uniforms.uHeight.value as number)));
    }
    glow.lamp(0, x, y + 60, z, 160 * flash, flashCol, Math.min(1, flash) * 0.3);

    if (dt > 0) {
      acc += dt;
      while (acc > EMIT_STEP) {
        acc -= EMIT_STEP;
        // Rolling puffs boiling at the foot, advancing toward the viewer.
        const u = (evt() - 0.5) * 0.85;
        const px = u * WIDTH;
        const pz = -BEND * (u * 2) * (u * 2) - 30;
        smoke.emit(roll, px, 40 + evt() * 40, pz, (evt() - 0.5) * 10, 6 + evt() * 6, -8 - evt() * 6);
        // Debris swirling ahead of the front.
        if (evt() < 0.7) smoke.emit(debris, px, 20 + evt() * 160, pz - 60 - evt() * 80, (evt() - 0.5) * 60, (evt() - 0.3) * 20, (evt() - 0.5) * 30);
      }
    }
    glow.update(dt);
    smoke.update(dt);
  }

  return {
    group,
    radius: RADIUS,
    update,
    dispose() {
      disposeKit(kit);
      for (const m of materials) m.dispose();
      for (const g of geometries) g.dispose();
      noise.dispose();
    },
  };
}

/** Sheets draw before every other transparent: the wall is always the farthest thing in view. */
const SHEET_ORDER = -10;
/** Particle emission tick, seconds. */
const EMIT_STEP = 0.09;

/** Tileable fractal value noise, so the dust can scroll forever without a seam. */
function makeNoiseTexture(rng: Rng): THREE.DataTexture {
  const N = NOISE_SIZE;
  const data = new Uint8Array(N * N * 4);
  const grids: Float32Array[] = [];
  for (let o = 0; o < NOISE_OCTAVES; o++) {
    const cells = 4 << o;
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    grids.push(g);
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let v = 0;
      let amp = 0.5;
      let norm = 0;
      for (let o = 0; o < NOISE_OCTAVES; o++) {
        const cells = 4 << o;
        const fx = (x / N) * cells;
        const fy = (y / N) * cells;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = smoothstep(fx - x0);
        const ty = smoothstep(fy - y0);
        const g = grids[o];
        const at = (i: number, j: number) => g[((j % cells) * cells) + (i % cells)];
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
        v += (a + (b - a) * ty) * amp;
        norm += amp;
        amp *= 0.5;
      }
      const c = Math.round((v / norm) * 255);
      const i = (y * N + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
