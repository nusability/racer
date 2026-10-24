// Camera-attached streaks: thin lines on a tunnel around the view axis rushing at the camera.
// Their geometry is static; the vertex shader moves them, so the CPU cost is one uniform write
// per frame. The tunnel radius keeps them out of the centre of the screen. One look is the
// speed rush; another, tighter round the craft, is the slipstream's wake.
//
// The camera must be in the scene graph (scene.add(camera)) for its children to render.
import * as THREE from 'three';

export interface StreakLook {
  streaks: number;
  /** Tunnel radius range (m) and depth range (m, in front of the camera). */
  radius: readonly [number, number];
  near: number;
  far: number;
  /** Tunnel centre below the view axis, metres: the wake wraps the craft, not the horizon. */
  drop: number;
  /** Travel speed toward the camera (m/s) at intensity 0 and 1. */
  travel: readonly [number, number];
  /** Streak length (m) at intensity 0 and 1. */
  length: readonly [number, number];
  width: number;
  /** In landscape, stretch the tunnel sideways toward the screen edges (fraction of aspect). */
  aspectStretch: number;
  maxAlpha: number;
  color: number;
  /** A streak only shows once intensity passes its threshold, so density grows with intensity. */
  thresholdSpread: number;
}

/** The speed rush: warm, wide, out at the screen edges. */
export const SPEED_STREAKS: StreakLook = {
  streaks: 64,
  radius: [4.6, 8.5],
  near: 0.9,
  far: 15,
  drop: 0,
  travel: [30, 85],
  length: [1.0, 4.0],
  width: 0.022,
  aspectStretch: 0.75,
  maxAlpha: 0.4,
  color: 0xfff3dc,
  thresholdSpread: 0.85,
};

/**
 * The slipstream: cool, sparse lines streaming close round the craft (which sits about
 * CAM_BACK ahead of and below the lens), so riding a wake reads apart from plain speed.
 */
export const DRAFT_STREAKS: StreakLook = {
  streaks: 28,
  radius: [1.9, 3.4],
  near: 4,
  far: 22,
  drop: 2.6,
  travel: [60, 110],
  length: [2.5, 6.0],
  width: 0.06,
  aspectStretch: 0.3,
  maxAlpha: 0.45,
  color: 0xcff4ff,
  thresholdSpread: 0.7,
};

function vertexShader(look: StreakLook): string {
  const span = (look.far - look.near).toFixed(2);
  return /* glsl */ `
attribute vec4 aSeed;   // angle, radius, phase, threshold
attribute vec2 aCorner; // side (-1..1), end (0 head .. 1 tail)
uniform float uTravel;
uniform float uLength;
uniform float uAspect;
uniform float uIntensity;
varying float vAlpha;
void main() {
  float cycle = fract(aSeed.z + uTravel / ${span});
  float head = -${look.far.toFixed(2)} + cycle * ${span};
  float z = head - aCorner.y * uLength;
  vec2 dir = vec2(cos(aSeed.x), sin(aSeed.x));
  vec2 tangent = vec2(-dir.y, dir.x);
  vec2 xy = dir * aSeed.y;
  xy.x *= mix(1.0, max(1.0, uAspect), ${look.aspectStretch.toFixed(2)});
  xy += tangent * aCorner.x * ${(look.width / 2).toFixed(4)} * (1.0 + aSeed.y * 0.1);
  xy.y -= ${look.drop.toFixed(2)};
  vec4 mv = modelViewMatrix * vec4(xy, z, 1.0);
  gl_Position = projectionMatrix * mv;
  // Fade in from the distance (that is near screen centre) and out as it passes the lens.
  float life = smoothstep(0.15, 0.5, cycle) * (1.0 - smoothstep(0.85, 1.0, cycle));
  float on = smoothstep(aSeed.w, aSeed.w + 0.12, uIntensity);
  vAlpha = life * on * (1.0 - aCorner.y) * ${look.maxAlpha.toFixed(2)} * clamp(uIntensity, 0.0, 1.0);
}`;
}

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, vAlpha);
}`;

export class SpeedLines {
  private readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly look: StreakLook;
  private travel = 0;

  constructor(private readonly camera: THREE.Camera, look: StreakLook = SPEED_STREAKS) {
    this.look = look;
    const n = look.streaks;
    const seeds = new Float32Array(n * 4 * 4);
    const corners = new Float32Array(n * 4 * 2);
    const positions = new Float32Array(n * 4 * 3);
    const index: number[] = [];
    // Golden-angle spacing spreads streaks evenly around the tunnel without visible clumps.
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const frac = (i * 0.618034) % 1;
      const seed = [i * golden, look.radius[0] + (look.radius[1] - look.radius[0]) * ((i * 0.37) % 1), (i * 0.754877) % 1, frac * look.thresholdSpread];
      for (let c = 0; c < 4; c++) {
        seeds.set(seed, (i * 4 + c) * 4);
        corners.set([c % 2 === 0 ? -1 : 1, c < 2 ? 0 : 1], (i * 4 + c) * 2);
      }
      const b = i * 4;
      index.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setIndex(index);
    // Positions are computed in the shader; the attribute only sizes the draw.
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.geometry.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertexShader(look),
      fragmentShader: FRAGMENT,
      uniforms: {
        uTravel: { value: 0 },
        uLength: { value: look.length[0] },
        uAspect: { value: 1 },
        uIntensity: { value: 0 },
        uColor: { value: new THREE.Color(look.color) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
    this.mesh.visible = false;
    camera.add(this.mesh);
  }

  /** `intensity` 0..1 (values above 1 are clamped): speed and boost, or the draft. */
  update(dt: number, intensity: number): void {
    const look = this.look;
    const k = Math.max(0, Math.min(1, intensity));
    this.mesh.visible = k > 0.01;
    this.travel += dt * (look.travel[0] + (look.travel[1] - look.travel[0]) * k);
    // Wrap well before float precision degrades; the shader only uses the fractional cycle.
    this.travel %= (look.far - look.near) * 1000;
    const u = this.material.uniforms;
    u.uTravel.value = this.travel;
    u.uLength.value = look.length[0] + (look.length[1] - look.length[0]) * k;
    u.uIntensity.value = k;
    u.uAspect.value = this.camera instanceof THREE.PerspectiveCamera ? this.camera.aspect : 1;
  }

  dispose(): void {
    this.camera.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
