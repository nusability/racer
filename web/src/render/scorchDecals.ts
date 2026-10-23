// Burn marks left on the ground by wrecks: a small pool of flat, ragged dark discs that fade out
// slowly. One draw call; the fade is a per-instance attribute because instance colours cannot
// carry opacity.
import * as THREE from 'three';

const DECALS = 6;
const SEGMENTS = 28;
/** Seconds a mark takes to fade completely. */
const FADE_TIME = 24;
const CENTRE_ALPHA = 0.85;
const COLOR = 0x0e0b0a;
/** Lifted off the ground and depth-biased so it never fights the road surface. */
const LIFT = 0.04;

const VERTEX = /* glsl */ `
attribute float aFade;
attribute float aAlpha;
varying float vAlpha;
void main() {
  vAlpha = aAlpha * aFade;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, vAlpha);
  #include <colorspace_fragment>
}`;

const tmpMat = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class ScorchDecals {
  readonly mesh: THREE.InstancedMesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly fade: THREE.InstancedBufferAttribute;
  private next = 0;
  private live = 0;

  constructor() {
    this.geometry = raggedDisc();
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(DECALS), 1);
    this.fade.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aFade', this.fade);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uColor: { value: new THREE.Color(COLOR) } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, DECALS);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < DECALS; i++) this.mesh.setMatrixAt(i, tmpMat.makeScale(0, 0, 0));
  }

  /** A mark of `radius` metres on the ground at `ground` (world), turned by a random angle. */
  add(ground: THREE.Vector3, radius: number): void {
    const i = this.next;
    this.next = (i + 1) % DECALS;
    tmpQuat.setFromAxisAngle(UP, Math.random() * Math.PI * 2);
    tmpPos.set(ground.x, ground.y + LIFT, ground.z);
    this.mesh.setMatrixAt(i, tmpMat.compose(tmpPos, tmpQuat, tmpScale.setScalar(radius)));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.fade.setX(i, 1);
    this.fade.needsUpdate = true;
    this.live = DECALS;
  }

  update(dt: number): void {
    if (this.live === 0) return;
    let live = 0;
    for (let i = 0; i < DECALS; i++) {
      const f = this.fade.getX(i);
      if (f <= 0) continue;
      const next = Math.max(0, f - dt / FADE_TIME);
      this.fade.setX(i, next);
      if (next > 0) live++;
    }
    this.fade.needsUpdate = true;
    this.live = live;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}

/** Unit disc in the XZ plane with a deterministic ragged rim, dark centre fading to the edge. */
function raggedDisc(): THREE.BufferGeometry {
  const positions = [0, 0, 0];
  const alpha = [CENTRE_ALPHA];
  const index: number[] = [];
  for (let s = 0; s < SEGMENTS; s++) {
    const a = (s / SEGMENTS) * Math.PI * 2;
    // Splash-shaped rim: a few lobes plus finer teeth.
    const r = 0.8 + 0.14 * Math.sin(a * 3 + 0.7) + 0.08 * Math.sin(a * 7 + 2.1) + 0.05 * Math.sin(a * 13);
    positions.push(Math.cos(a) * r * 0.55, 0, Math.sin(a) * r * 0.55, Math.cos(a) * r, 0, Math.sin(a) * r);
    alpha.push(CENTRE_ALPHA * 0.75, 0);
  }
  for (let s = 0; s < SEGMENTS; s++) {
    const inner = 1 + s * 2;
    const outer = inner + 1;
    const nInner = 1 + ((s + 1) % SEGMENTS) * 2;
    const nOuter = nInner + 1;
    index.push(0, nInner, inner, inner, nInner, outer, outer, nInner, nOuter);
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(index);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alpha, 1));
  return geo;
}
