// Developer-only viewer for the set-C (coast) landmarks (landmark-viewer.html?set=c&kind=pier,
// never linked from the game). It sets up its own sea, beach, sky, fog and lights so it does
// not depend on the track renderer. Query: kind, quality=high|low, cam=near|far|race|orbit|top,
// pal=day|dusk|noon (palette), seed, t=seconds (start time), pause=1, ang=radians,
// dist=metres, h=camera height, look=look-at height, hide=comma-separated draw names.

import * as THREE from 'three';
import type { TrackPalette } from '../../core/types.ts';
import { LANDMARKS_C } from './setC.ts';
import type { Landmark } from './types.ts';

type Kind = keyof typeof LANDMARKS_C;

const PALETTES: Record<string, TrackPalette> = {
  day: { sky: 0x2f86d8, horizon: 0xbfe2ee, sand: 0xf0d9a4, road: 0x8c8790, rock: 0x7a6656, accent: 0xff4f7a, sun: 0xfff1d0, dusk: 0.15 },
  noon: { sky: 0x1f78d0, horizon: 0xd6eef4, sand: 0xf4e2b4, road: 0x9a96a0, rock: 0x86705e, accent: 0x18c0b0, sun: 0xffffff, dusk: 0 },
  dusk: { sky: 0x2a2860, horizon: 0xff9e6a, sand: 0xe2b28e, road: 0x6e5a6a, rock: 0x5a4250, accent: 0x40e0ff, sun: 0xffa060, dusk: 0.85 },
};

/** Where the beach meets the sea, in the landmark's own z (its −Z faces the road), × radius. */
const SHORE: Record<Kind, number> = {
  lighthouse: -0.75,
  pier: -0.55,
  cruiseliner: -1.2,
  regatta: -1.2,
  resort: 0.85,
  harbor: 0.12,
  volcano: -1.1,
  whales: -1.2,
  beachParty: 0.8,
  airshow: -1.2,
};

const FOG_NEAR = { low: 220, high: 320 } as const;
const FOG_FAR = { low: 1500, high: 2600 } as const;
const SUN_HIGH = 0.95;
const SUN_LOW = 0.16;
const SUN_AZIMUTH = 2.4;
const SUN_INTENSITY: [number, number] = [2.9, 2.2];
const HEMI_INTENSITY: [number, number] = [1.35, 1.0];
const SEA_DEEP = 0x14689a;
const SEA_SHALLOW_MIX = 0.2;
/** Self-lit share of the sea colour, so it stays blue under a warm dusk light. */
const SEA_GLOW = 0.3;

const RACE_SPEED = 180;
const RACE_GAP = 40;
const RACE_HEIGHT = 4;
const RACE_FOV = 70;
const VIEW_FOV = 55;
const FAR_DISTANCE = 1500;
const FAR_HEIGHT = 10;
const GROUND_SIZE = 12000;
const ROAD_WIDTH = 24;
const BEACH_BACK = 400;
/** Beach and road sit a little proud of the sea so they never z-fight with it far away. */
const BEACH_Y = 0.25;
const ROAD_Y = 0.35;

const params = new URLSearchParams(location.search);
const kind = (params.get('kind') ?? 'lighthouse') as Kind;
const quality = params.get('quality') === 'low' ? 'low' : 'high';
const cam = params.get('cam') ?? 'near';
const palette = PALETTES[params.get('pal') ?? 'day'];
if (!palette) throw new Error(`Unknown palette "${params.get('pal')}"`);
const seed = Number(params.get('seed') ?? 11);
const startT = Number(params.get('t') ?? 0);
const paused = params.get('pause') === '1';
const angle = Number(params.get('ang') ?? 0.6);

const factory = LANDMARKS_C[kind];
if (!factory) throw new Error(`Unknown set-C landmark "${kind}"`);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
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
  col += uSun * pow(toSun, mix(18.0, 5.0, uDusk)) * mix(0.25, 0.6, uDusk) * (1.0 - h * 0.6);
  col = mix(col, uSun * 1.4, smoothstep(0.9994, 0.9997, toSun));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const lerp = (r: [number, number]) => r[0] + (r[1] - r[0]) * palette.dusk;
const horizon = new THREE.Color(palette.horizon);
scene.background = horizon.clone();
scene.fog = new THREE.Fog(palette.horizon, FOG_NEAR[quality], FOG_FAR[quality]);
const el = SUN_HIGH + (SUN_LOW - SUN_HIGH) * palette.dusk;
const sunDir = new THREE.Vector3(Math.cos(el) * Math.cos(SUN_AZIMUTH), Math.sin(el), Math.cos(el) * Math.sin(SUN_AZIMUTH));
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(10, 32, 16),
  new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: {
      uZenith: { value: new THREE.Color(palette.sky) },
      uHorizon: { value: horizon.clone() },
      uSun: { value: new THREE.Color(palette.sun) },
      uSunDir: { value: sunDir },
      uDusk: { value: palette.dusk },
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  }),
);
sky.frustumCulled = false;
sky.renderOrder = -1000;
scene.add(sky);
const sun = new THREE.DirectionalLight(palette.sun, lerp(SUN_INTENSITY));
sun.position.copy(sunDir).multiplyScalar(1000);
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(new THREE.Color(palette.sky).lerp(new THREE.Color(0xffffff), 0.55), new THREE.Color(palette.sand).multiplyScalar(0.7), lerp(HEMI_INTENSITY)));

const t0 = performance.now();
const lm: Landmark = factory({ seed, palette, quality });
const buildMs = performance.now() - t0;
// The road runs along X at z = 0; the landmark faces −Z toward it from the +Z side.
const R = lm.radius;
const centreZ = R + RACE_GAP;
lm.group.position.set(0, 0, centreZ);
scene.add(lm.group);
const hidden = new Set((params.get('hide') ?? '').split(',').filter(Boolean));
lm.group.traverse((o) => {
  if (hidden.has(o.name)) o.visible = false;
});

// Sea everywhere at y = 0, a beach from behind the road out to this landmark's shoreline.
const seaColor = new THREE.Color(SEA_DEEP).lerp(horizon, SEA_SHALLOW_MIX);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: seaColor, emissive: seaColor.clone().multiplyScalar(SEA_GLOW), polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
scene.add(sea);
const shoreZ = centreZ + SHORE[kind] * R;
const beachDepth = shoreZ + BEACH_BACK;
const beach = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, beachDepth).rotateX(-Math.PI / 2).translate(0, BEACH_Y, shoreZ - beachDepth / 2), new THREE.MeshLambertMaterial({ color: palette.sand }));
scene.add(beach);
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, ROAD_WIDTH).rotateX(-Math.PI / 2).translate(0, ROAD_Y, 0), new THREE.MeshLambertMaterial({ color: palette.road })));

/** Budget as built (independent of what the camera happens to see). */
function budget(root: THREE.Object3D): { calls: number; tris: number; points: number; parts: string } {
  let calls = 0;
  let tris = 0;
  let points = 0;
  const parts: string[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Points) {
      calls++;
      const n = o.geometry.getAttribute('position').count;
      points += n;
      parts.push(`${o.name}:${n}p`);
    } else if (o instanceof THREE.Mesh) {
      calls++;
      const g = o.geometry;
      const n = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      const total = n * (o instanceof THREE.InstancedMesh ? o.count : 1);
      tris += total;
      parts.push(`${o.name}:${Math.round(total)}`);
    }
  });
  return { calls, tris, points, parts: parts.join(' ') };
}
const cost = budget(lm.group);

const camera = new THREE.PerspectiveCamera(cam === 'race' ? RACE_FOV : VIEW_FOV, innerWidth / innerHeight, 1, 4000);

function placeCamera(t: number): void {
  const c = lm.group.position;
  if (cam === 'race') {
    const span = R * 2 + 900;
    const x = ((t * RACE_SPEED) % span) - span / 2;
    camera.position.set(x, RACE_HEIGHT, 0);
    camera.lookAt(x + 100, RACE_HEIGHT - 1 + Number(params.get('look') ?? 0), 22);
    return;
  }
  if (cam === 'far') {
    const d = Number(params.get('dist') ?? FAR_DISTANCE);
    camera.position.set(c.x + Math.sin(angle) * d, FAR_HEIGHT, c.z - Math.cos(angle) * d);
    camera.lookAt(c.x, Number(params.get('look') ?? R * 0.2), c.z);
    return;
  }
  if (cam === 'top') {
    camera.position.set(c.x, R * 2.4, c.z - 1);
    camera.lookAt(c.x, 0, c.z);
    return;
  }
  const a = cam === 'orbit' ? angle + t * 0.06 : angle;
  const d = Number(params.get('dist') ?? R * 1.5);
  camera.position.set(c.x + Math.sin(a) * d, Number(params.get('h') ?? Math.max(6, d * 0.14)), c.z - Math.cos(a) * d);
  camera.lookAt(c.x, Number(params.get('look') ?? R * 0.15), c.z);
}

const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;left:6px;top:6px;color:#fff;font:11px/1.35 monospace;background:#0008;padding:4px 6px;border-radius:4px;pointer-events:none;white-space:pre';
document.body.appendChild(hud);

let time = startT;
let last = performance.now();
let updateMs = 0;
function frame(now: number): void {
  const dt = paused ? 0 : Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  const u0 = performance.now();
  lm.update(time, dt);
  updateMs = updateMs * 0.9 + (performance.now() - u0) * 0.1;
  placeCamera(time);
  renderer.render(scene, camera);
  const seen = renderer.info.render;
  hud.textContent =
    `${kind} · ${quality} · ${cam} · t=${time.toFixed(1)} · r=${R.toFixed(0)} m · fog ${FOG_FAR[quality]} m\n` +
    `landmark: ${cost.calls} draws · ${Math.round(cost.tris)} tris · ${cost.points} pts (frame: ${seen.calls} / ${seen.triangles})\n` +
    `build ${buildMs.toFixed(0)} ms · update ${updateMs.toFixed(3)} ms\n${cost.parts}`;
  (window as unknown as { __cost: typeof cost }).__cost = cost;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
