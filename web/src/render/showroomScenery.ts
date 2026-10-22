// Static dusk-dune backdrop for the garage showroom: gradient sky with a low sun, rolling sand
// and distant mesa silhouettes. Deterministic so the garage looks the same every visit.
import * as THREE from 'three';

export const SHOWROOM_FOG = 0xe39a72;
const SKY_TOP = 0x2a1f4a;
const SKY_MID = 0xb0567a;
const SKY_HORIZON = 0xf2a15f;
const SUN_COLOR = 0xffd9a0;
/** Direction the low sun sits in (also where the key light comes from). */
const SUN_DIR = new THREE.Vector3(-0.55, 0.12, -0.83).normalize();
const SAND = 0xdba56e;
const SAND_SHADOW = 0xa36b4c;
const MESA = 0x5a3448;
const DUNE_SIZE = 900;
const DUNE_SEGMENTS = 60;

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // pin to the far plane
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, -0.2, 1.0);
  vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
  c = mix(c, uTop, smoothstep(0.18, 0.75, h));
  float s = max(dot(normalize(vDir), uSunDir), 0.0);
  c += uSun * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.35);
  gl_FragColor = vec4(c, 1.0);
}`;

export interface Backdrop {
  group: THREE.Group;
  dispose(): void;
}

export function buildShowroomBackdrop(): Backdrop {
  const group = new THREE.Group();
  const owned: { dispose(): void }[] = [];

  const skyGeo = new THREE.SphereGeometry(800, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: {
      uTop: { value: new THREE.Color(SKY_TOP) },
      uMid: { value: new THREE.Color(SKY_MID) },
      uHorizon: { value: new THREE.Color(SKY_HORIZON) },
      uSun: { value: new THREE.Color(SUN_COLOR) },
      uSunDir: { value: SUN_DIR },
    },
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -1;
  group.add(sky);
  owned.push(skyGeo, skyMat);

  // Dunes: a sine-field plane, flat around the pad so it sits on level sand.
  const duneGeo = new THREE.PlaneGeometry(DUNE_SIZE, DUNE_SIZE, DUNE_SEGMENTS, DUNE_SEGMENTS);
  duneGeo.rotateX(-Math.PI / 2);
  const pos = duneGeo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(SAND);
  const shade = new THREE.Color(SAND_SHADOW);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const ramp = THREE.MathUtils.smoothstep(r, 25, 140);
    const y = (Math.sin(x * 0.035 + z * 0.012) * 2.2 + Math.sin(z * 0.05 - x * 0.02) * 1.6 + Math.sin(x * 0.11) * 0.5) * ramp - 0.4;
    pos.setY(i, y);
    c.copy(shade).lerp(sand, THREE.MathUtils.clamp(0.55 + y * 0.08, 0, 1));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  duneGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  duneGeo.computeVertexNormals();
  const duneMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  group.add(new THREE.Mesh(duneGeo, duneMat));
  owned.push(duneGeo, duneMat);

  // Mesas: flat-topped silhouettes on the horizon, placed on a fixed arc.
  const mesaMat = new THREE.MeshLambertMaterial({ color: MESA, flatShading: true });
  owned.push(mesaMat);
  const MESAS: [number, number, number, number][] = [
    [-0.9, 260, 38, 28], [-0.45, 300, 55, 40], [0.2, 280, 30, 22], [0.75, 320, 48, 34], [1.6, 290, 40, 26],
    [2.4, 310, 60, 30], [3.1, 270, 35, 24], [3.8, 300, 45, 36], [4.6, 285, 50, 30], [5.4, 300, 36, 26],
  ];
  for (const [angle, dist, radius, height] of MESAS) {
    const geo = new THREE.CylinderGeometry(radius * 0.7, radius, height, 7);
    owned.push(geo);
    const m = new THREE.Mesh(geo, mesaMat);
    m.position.set(Math.sin(angle) * dist, height / 2 - 3, -Math.cos(angle) * dist);
    m.rotation.y = angle * 3;
    group.add(m);
  }
  return { group, dispose: () => owned.forEach((o) => o.dispose()) };
}

/** Radial disc whose vertex alpha fades from `centre` to 0 at the rim. */
function radialDisc(radius: number, rgb: [number, number, number], centre: number, material: THREE.MeshBasicMaterial): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 32);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i)) / radius;
    colors.set([rgb[0], rgb[1], rgb[2], centre * (1 - r) * (1 - r)], i * 4);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  return new THREE.Mesh(geo, material);
}

export function createShadowDisc(radius: number): THREE.Mesh {
  return radialDisc(radius, [0, 0, 0], 0.7, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
}

/** Additive pool of the racer's energy colour on the pad (tint via material.color). */
export function createGlowDisc(radius: number): THREE.Mesh {
  return radialDisc(radius, [1, 1, 1], 0.35, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
}
