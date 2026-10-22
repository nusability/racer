// Soft round point sprites with per-point world size, colour and alpha. Shared by the racer
// halos/smoke, the race effects and the viewer so every particle family is one draw call
// without textures (no image loading, nothing to dispose but the material).
import * as THREE from 'three';

const VERTEX = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 color;
uniform float uHalfHeight;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vColor = color;
  vAlpha = aAlpha;
  // World-size sprites: projected size of aSize metres at this depth. Behind the camera or dead
  // (alpha 0) collapses to 0 so the rasteriser skips it.
  float depth = -mv.z;
  gl_PointSize = (depth > 0.05 && aAlpha > 0.001) ? aSize * projectionMatrix[1][1] * uHalfHeight / depth : 0.0;
}`;

const FRAGMENT = /* glsl */ `
uniform float uHardness;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(p, p);
  if (d2 > 1.0) discard;
  // Hardness bends the falloff: additive glows want a hot centre, dust wants a puffy body.
  float a = pow(1.0 - d2, uHardness) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

export type SoftPointsMode = 'additive' | 'normal';

const scratchSize = new THREE.Vector2();

export function createSoftPointsMaterial(mode: SoftPointsMode, hardness: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { uHalfHeight: { value: 400 }, uHardness: { value: hardness } },
    transparent: true,
    depthWrite: false,
    blending: mode === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

/** Preallocated point cloud whose attributes callers write in place every frame. */
export class SoftPointBuffer {
  readonly points: THREE.Points;
  readonly position: Float32Array;
  readonly color: Float32Array;
  readonly size: Float32Array;
  readonly alpha: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  constructor(capacity: number, mode: SoftPointsMode, hardness: number) {
    this.position = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', dynamicAttr(this.position, 3));
    this.geometry.setAttribute('color', dynamicAttr(this.color, 3));
    this.geometry.setAttribute('aSize', dynamicAttr(this.size, 1));
    this.geometry.setAttribute('aAlpha', dynamicAttr(this.alpha, 1));
    this.material = createSoftPointsMaterial(mode, hardness);
    this.points = new THREE.Points(this.geometry, this.material);
    // Particles roam anywhere; a stale bounding sphere would cull live ones.
    this.points.frustumCulled = false;
    const uniform = this.material.uniforms.uHalfHeight;
    this.points.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(scratchSize);
      uniform.value = scratchSize.y * 0.5;
    };
  }

  /** Uploads everything written this frame. */
  commit(): void {
    for (const name of ['position', 'color', 'aSize', 'aAlpha']) {
      (this.geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

function dynamicAttr(array: Float32Array, itemSize: number): THREE.BufferAttribute {
  const attr = new THREE.BufferAttribute(array, itemSize);
  attr.setUsage(THREE.DynamicDrawUsage);
  return attr;
}
