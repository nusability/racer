import * as THREE from 'three';
import type { TrackPalette } from '../../core/types.ts';
import type { Atmosphere } from './config.ts';
import { applySpaceSky } from './spaceSky.ts';

// Sky, sun, fog and light (space has its own: spaceSky.ts). The sky is drawn at infinity (no camera following needed) and its
// horizon colour equals the fog colour, so fogged terrain melts into it.

/** Sun elevation at midday and at deep dusk, radians. */
const SUN_HIGH = 0.95;
const SUN_LOW = 0.16;
/** Sun azimuth in the XZ plane, radians (from +X toward +Z). */
const SUN_AZIMUTH = 2.4;
/** Light intensities at midday → dusk. */
const SUN_INTENSITY: [number, number] = [2.9, 2.2];
const HEMI_INTENSITY: [number, number] = [1.35, 1.0];
/** Angular radius of the sun disc and its halo falloff. */
const SUN_DISC = 0.9994;
const SKY_RADIUS = 10;

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  // Rotation-only view: the sky sits at infinity whatever the camera position.
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uDusk;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.4));
  float toSun = max(dot(d, uSunDir), 0.0);
  // Warm glow round the sun, wider and stronger at dusk.
  col += uSun * pow(toSun, mix(18.0, 5.0, uDusk)) * mix(0.25, 0.6, uDusk) * (1.0 - h * 0.6);
  col = mix(col, uSun * 1.4, smoothstep(${SUN_DISC.toFixed(4)}, ${(SUN_DISC + 0.0003).toFixed(4)}, toSun));
  if (d.y < 0.0) col = uHorizon;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function sunDirection(palette: TrackPalette): THREE.Vector3 {
  const el = SUN_HIGH + (SUN_LOW - SUN_HIGH) * palette.dusk;
  return new THREE.Vector3(Math.cos(el) * Math.cos(SUN_AZIMUTH), Math.sin(el), Math.cos(el) * Math.sin(SUN_AZIMUTH));
}

export function applyEnvironment(
  scene: THREE.Scene,
  palette: TrackPalette,
  air: Atmosphere,
): { sun: THREE.DirectionalLight; dispose(): void } {
  if (air.sky === 'space') return applySpaceSky(scene, palette);
  if (!air.fog) throw new Error('environment: a sky of air needs its fog range');
  const horizon = new THREE.Color(palette.horizon);
  const dusk = palette.dusk;
  scene.background = horizon.clone();
  scene.fog = new THREE.Fog(horizon.getHex(), air.fog.near, air.fog.far);

  const dir = sunDirection(palette);
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: {
      uZenith: { value: new THREE.Color(palette.sky) },
      uHorizon: { value: horizon.clone() },
      uSun: { value: new THREE.Color(palette.sun) },
      uSunDir: { value: dir.clone() },
      uDusk: { value: dusk },
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.name = 'sky';
  scene.add(sky);

  const lerp = (r: [number, number]) => r[0] + (r[1] - r[0]) * dusk;
  const sunCol = new THREE.Color(palette.sun);
  const sun = new THREE.DirectionalLight(sunCol, lerp(SUN_INTENSITY));
  sun.position.copy(dir).multiplyScalar(1000);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  const skyLight = new THREE.Color(palette.sky).lerp(new THREE.Color(0xffffff), 0.55);
  const groundLight = new THREE.Color(palette.sand).multiplyScalar(0.7);
  const hemi = new THREE.HemisphereLight(skyLight, groundLight, lerp(HEMI_INTENSITY));
  scene.add(hemi);

  return {
    sun,
    dispose() {
      scene.remove(sky, sun, sun.target, hemi);
      sky.geometry.dispose();
      skyMat.dispose();
      sun.dispose();
      hemi.dispose();
      scene.fog = null;
      scene.background = null;
    },
  };
}
