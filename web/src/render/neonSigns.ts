import * as THREE from 'three';
import { mulberry32 } from '../core/rng.ts';

// Animated neon advertising for the city: one canvas atlas of made-up brands, drawn as glowing
// tubes on black, and an instanced board material that cycles each board between two ads with
// a wipe, sweeps a sheen across it, chases bulbs round its frame and lets the odd tube flicker.
// Everything moves in the shader from one time uniform, so a street of signs is one draw.
// The brands are invented for this game; none is a real company.

/** The ads in the atlas, each with its tube colour and its little emblem. */
const ADS: readonly { text: string; sub: string; color: string; emblem: 'bowl' | 'bolt' | 'ring' | 'star' | 'wave' | 'eye' | 'cup' | 'cube' }[] = [
  { text: 'KOIBOX', sub: 'RAMEN 24H', color: '#ff3fb4', emblem: 'bowl' },
  { text: 'ZEPHYRA', sub: 'SKY LINES', color: '#3ff0ff', emblem: 'wave' },
  { text: 'OMNIGLO', sub: 'NIGHT CELLS', color: '#ffb02e', emblem: 'bolt' },
  { text: 'PIXELKOI', sub: 'ARCADE', color: '#a46bff', emblem: 'cube' },
  { text: 'LUMA', sub: 'BUBBLE TEA', color: '#5dff8f', emblem: 'cup' },
  { text: 'QUBITRON', sub: 'THINK FASTER', color: '#3ff0ff', emblem: 'ring' },
  { text: 'NEBULITE', sub: 'SODA', color: '#ff3fb4', emblem: 'star' },
  { text: 'HALCYON', sub: 'HOTEL', color: '#ffb02e', emblem: 'eye' },
];
const COLS = 4;
const ROWS = 2;
/** One ad panel in the atlas, pixels (2:1 like the boards). */
const PANEL_W = 256;
const PANEL_H = 128;
/** Seconds each ad shows before the board wipes to its other one. */
const CYCLE_S = 6;
/** Wipe length as a share of a cycle. */
const WIPE = 0.08;
/** A tube drops out for a frame when its hash passes this (per 1/12 s). */
const FLICKER_ODDS = 0.965;
const FLICKER_RATE = 12;

export const SIGN_ADS = ADS.length;

/** Draws the ad atlas. Rows of panels, tubes with a soft glow, on near-black. */
function atlas(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = PANEL_W * COLS;
  cv.height = PANEL_H * ROWS;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for neon signs');
  ADS.forEach((ad, i) => {
    const x0 = (i % COLS) * PANEL_W;
    const y0 = Math.floor(i / COLS) * PANEL_H;
    ctx.fillStyle = '#07040c';
    ctx.fillRect(x0, y0, PANEL_W, PANEL_H);
    ctx.save();
    ctx.translate(x0, y0);
    ctx.strokeStyle = ad.color;
    ctx.fillStyle = ad.color;
    ctx.shadowColor = ad.color;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, PANEL_W - 16, PANEL_H - 16);
    emblem(ctx, ad.emblem, 44, PANEL_H / 2, 22);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(ad.text, 80, PANEL_H / 2 - 12, PANEL_W - 96);
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#fff4f8';
    ctx.fillText(ad.sub, 82, PANEL_H / 2 + 26, PANEL_W - 96);
    ctx.restore();
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

function emblem(ctx: CanvasRenderingContext2D, kind: (typeof ADS)[number]['emblem'], x: number, y: number, r: number): void {
  ctx.beginPath();
  switch (kind) {
    case 'bowl':
      ctx.arc(x, y - 2, r, 0, Math.PI);
      ctx.moveTo(x - r * 0.6, y - r);
      ctx.lineTo(x + r * 0.2, y - 4);
      break;
    case 'bolt':
      ctx.moveTo(x + 6, y - r);
      ctx.lineTo(x - 8, y + 2);
      ctx.lineTo(x + 4, y + 2);
      ctx.lineTo(x - 6, y + r);
      break;
    case 'ring':
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.moveTo(x + r * 0.45, y);
      ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
      break;
    case 'star':
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      break;
    case 'wave':
      for (let i = 0; i <= 16; i++) ctx.lineTo(x - r + (i / 16) * 2 * r, y + Math.sin(i * 0.8) * r * 0.5);
      break;
    case 'eye':
      ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.moveTo(x + r * 0.3, y);
      ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
      break;
    case 'cup':
      ctx.moveTo(x - r * 0.7, y - r);
      ctx.lineTo(x - r * 0.5, y + r);
      ctx.lineTo(x + r * 0.5, y + r);
      ctx.lineTo(x + r * 0.7, y - r);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.3, y - r * 1.4);
      break;
    case 'cube':
      ctx.rect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
      ctx.moveTo(x - r * 0.7, y - r * 0.7);
      ctx.lineTo(x - r * 0.2, y - r);
      ctx.lineTo(x + r, y - r);
      ctx.lineTo(x + r * 0.7, y - r * 0.7);
      break;
  }
  ctx.stroke();
}

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec3 aSign;
varying vec2 vUv;
varying vec3 vSign;
void main() {
  vUv = uv;
  vSign = aSign;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
uniform float uTime;
uniform float uStrength;
varying vec2 vUv;
varying vec3 vSign;
float sgHash(float n) { return fract(sin(n * 91.345) * 47453.53); }
vec4 panel(float i, vec2 uv) {
  vec2 cell = vec2(mod(i, ${COLS.toFixed(1)}), floor(i / ${COLS.toFixed(1)}));
  // The atlas's first row is at the top of the canvas (flipY puts it at v = 1).
  return texture2D(uMap, vec2((cell.x + uv.x) / ${COLS.toFixed(1)}, 1.0 - (cell.y + 1.0 - uv.y) / ${ROWS.toFixed(1)}));
}
void main() {
  float t = uTime / ${CYCLE_S.toFixed(1)} + vSign.z;
  float which = mod(floor(t), 2.0);
  // A wipe across the board at the start of each cycle.
  float wipe = smoothstep(0.0, ${WIPE.toFixed(2)}, fract(t));
  float showB = which < 0.5 ? step(vUv.x, wipe) : 1.0 - step(vUv.x, wipe);
  vec3 col = mix(panel(vSign.x, vUv).rgb, panel(vSign.y, vUv).rgb, showB);
  // A sheen sweeping across, and the odd tube dropping out.
  float sheen = 1.0 + 0.5 * smoothstep(0.08, 0.0, abs(vUv.x - fract(uTime * 0.23 + vSign.z)));
  float flicker = sgHash(floor(uTime * ${FLICKER_RATE.toFixed(1)}) + vSign.z * 131.0) > ${FLICKER_ODDS.toFixed(3)} ? 0.35 : 1.0;
  // Bulbs chasing round the frame.
  float edge = min(min(vUv.x, 1.0 - vUv.x) * 2.0, min(vUv.y, 1.0 - vUv.y));
  float bulbs = step(edge, 0.025) * step(0.5, fract((vUv.x + vUv.y) * 24.0 - uTime * 3.0));
  col = col * sheen * flicker + bulbs * vec3(1.0, 0.95, 0.85);
  gl_FragColor = vec4(col * uStrength, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export interface NeonSigns {
  material: THREE.ShaderMaterial;
  /** Sets the shared clock (race time). */
  update(time: number): void;
  dispose(): void;
}

/** The board material; `strength` scales the light (dimmer by day). */
export function neonSigns(strength: number): NeonSigns {
  const map = atlas();
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uTime: { value: 0 }, uStrength: { value: strength } }]);
  uniforms.uMap.value = map;
  const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms, fog: true, side: THREE.DoubleSide });
  return {
    material,
    update(time) {
      uniforms.uTime.value = time;
    },
    dispose() {
      material.dispose();
      map.dispose();
    },
  };
}

/**
 * Instanced boards (unit quads facing +Z, base on y = 0 scaled by each matrix) with their
 * two ads and phase picked from `seed`.
 */
export function signBoards(signs: NeonSigns, matrices: readonly THREE.Matrix4[], seed: number, name: string): THREE.InstancedMesh {
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const rng = mulberry32(seed);
  const ads = new Float32Array(matrices.length * 3);
  matrices.forEach((_, i) => {
    const a = Math.floor(rng() * ADS.length);
    const b = (a + 1 + Math.floor(rng() * (ADS.length - 1))) % ADS.length;
    ads.set([a, b, rng()], i * 3);
  });
  geo.setAttribute('aSign', new THREE.InstancedBufferAttribute(ads, 3));
  const mesh = new THREE.InstancedMesh(geo, signs.material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = name;
  return mesh;
}
