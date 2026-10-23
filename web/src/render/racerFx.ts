// Skimmer effect geometry: wingtip vortex ribbons (rebuilt in place each frame), the shimmering
// air-cushion sheet under the hull (animated in its shader), the fan blur disc and the jet cone.
import * as THREE from 'three';
import type { CushionSpec, Detail } from './racerBlueprint.ts';
import { SKIMMER_RIDE_HEIGHT } from './skimmerTuning.ts';

// --- Wingtip vortices ---------------------------------------------------------------------------
const VORTEX_SEGMENTS = { high: 14, low: 8 } as const;
/** Ribbon half-width at the tip and the extra it gains by the tail (m). */
const VORTEX_WIDTH = [0.03, 0.12] as const;
/** Corkscrew radius (m) and spin (rad/s): the trail twists like a real tip vortex. */
const VORTEX_SPIRAL = 0.07;
const VORTEX_SPIN = 22;
/** How far the trail bows outward per unit of steer at its tail (m): it reads the turn. */
const VORTEX_BEND = 2.2;

const scratchP = new THREE.Vector3();

/** One flat ribbon per wingtip, fading toward the tail. Flat, not crossed: the chase camera looks
 * down on it, and a vertical strip seen edge-on would stack into a hard white line. */
export class VortexTrails {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions: Float32Array;
  private readonly segments: number;

  constructor(private readonly tips: THREE.Vector3[], detail: Detail, material: THREE.Material) {
    this.segments = VORTEX_SEGMENTS[detail];
    const sections = this.segments + 1;
    const verts = tips.length * sections * 2;
    this.positions = new Float32Array(verts * 3);
    const colors = new Float32Array(verts * 3);
    const index: number[] = [];
    for (let n = 0; n < tips.length; n++) {
      for (let k = 0; k < sections; k++) {
        const t = k / this.segments;
        // Bright just behind the tip, dissolving toward the tail; additive so 0 is invisible.
        const c = Math.min(1, t * 6) * Math.pow(1 - t, 2.6);
        colors.fill(c, (n * sections + k) * 6, (n * sections + k + 1) * 6);
        if (k < this.segments) {
          const a = (n * sections + k) * 2;
          const b = a + 2;
          index.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    this.geometry.setIndex(index);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
  }

  /** `length` in metres (0 hides), `steer` −1..1 bends the trail away from the turn. */
  update(time: number, length: number, steer: number): void {
    this.mesh.visible = length > 0.2;
    if (!this.mesh.visible) return;
    const sections = this.segments + 1;
    const out = this.positions;
    for (let n = 0; n < this.tips.length; n++) {
      const tip = this.tips[n];
      const spinDir = tip.x < 0 ? -1 : 1;
      for (let k = 0; k < sections; k++) {
        const t = k / this.segments;
        const a = time * VORTEX_SPIN * spinDir - t * 9;
        const r = VORTEX_SPIRAL * t;
        scratchP.set(
          tip.x + Math.cos(a) * r - steer * VORTEX_BEND * t * t,
          tip.y + Math.sin(a) * r - t * 0.15,
          tip.z + t * length,
        );
        const w = VORTEX_WIDTH[0] + VORTEX_WIDTH[1] * t;
        const o = (n * sections + k) * 6;
        out[o] = scratchP.x - w; out[o + 1] = scratchP.y; out[o + 2] = scratchP.z;
        out[o + 3] = scratchP.x + w; out[o + 4] = scratchP.y; out[o + 5] = scratchP.z;
      }
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

// --- Air cushion ----------------------------------------------------------------------------
/** The sheet sits just above the ground so it never clips through the hull belly. */
const CUSHION_LIFT = 0.06;
const CUSHION_GRID = { high: [8, 10], low: [5, 6] } as const;

const CUSHION_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const CUSHION_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float edge = 1.0 - smoothstep(0.55, 1.0, length(p * vec2(1.0, 0.9)));
  // Two drifting interference bands: a pressure shimmer that races aft with the airflow.
  float wave = sin(p.x * 11.0 + uTime * 7.0) * sin(p.y * 7.0 - uTime * 23.0);
  float streak = sin(p.y * 19.0 - uTime * 41.0 + p.x * 3.0);
  float a = edge * (0.55 + 0.3 * wave + 0.15 * streak) * uIntensity;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
}`;

export class CushionSheet {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.PlaneGeometry;

  constructor(spec: CushionSpec, detail: Detail) {
    const [sx, sz] = CUSHION_GRID[detail];
    this.geometry = new THREE.PlaneGeometry(spec.width, spec.length, sx, sz);
    this.geometry.rotateX(-Math.PI / 2);
    this.geometry.translate(0, -SKIMMER_RIDE_HEIGHT + CUSHION_LIFT, spec.z);
    this.material = new THREE.ShaderMaterial({
      vertexShader: CUSHION_VERTEX,
      fragmentShader: CUSHION_FRAGMENT,
      uniforms: { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uIntensity: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 1;
  }

  update(time: number, intensity: number, color: THREE.Color): void {
    this.mesh.visible = intensity > 0.01;
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uIntensity.value = intensity;
    (u.uColor.value as THREE.Color).copy(color);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// --- Fan disc and jet -----------------------------------------------------------------------
const FAN_BLADES = 7;

/** Unit fan disc facing +Z: soft blade streaks that strobe into a blur when spun. */
export function createFanDiscGeometry(detail: Detail): THREE.BufferGeometry {
  const segments = FAN_BLADES * (detail === 'high' ? 6 : 4);
  const rings = [0.22, 0.6, 0.97];
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  for (let s = 0; s <= segments; s++) {
    const a = (s / segments) * Math.PI * 2;
    // Blades lead with a bright edge and trail off: reads as rotation even when strobing.
    const phase = ((a * FAN_BLADES) / (Math.PI * 2)) % 1;
    const blade = Math.pow(1 - phase, 3);
    rings.forEach((r, i) => {
      positions.push(Math.cos(a) * r, Math.sin(a) * r, 0);
      const c = (i === 0 ? 0.15 : 0.12 + 0.88 * blade) * (i === 2 ? 0.7 : 1);
      colors.push(c, c, c);
    });
  }
  for (let s = 0; s < segments; s++) {
    for (let r = 0; r < rings.length - 1; r++) {
      const a = s * rings.length + r;
      const b = a + rings.length;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(index);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

/** Jet cone: base (radius 1) at z = 0, tip at z = 1, vertex brightness fading to the tip so
 * additive blending makes it dissolve without a texture. */
export function createJetGeometry(detail: Detail): THREE.BufferGeometry {
  const profile = [[0.9, 0], [1.0, 0.08], [0.8, 0.35], [0.45, 0.68], [0.0, 1.0]];
  const geo = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), detail === 'high' ? 12 : 8);
  geo.rotateX(Math.PI / 2);
  geo.deleteAttribute('uv');
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) colors.fill(Math.pow(1 - pos.getZ(i), 1.6), i * 3, i * 3 + 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}
