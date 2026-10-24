// Developer-only viewer for the set-E (city) landmarks (landmark-viewer.html?set=e&kind=maglev,
// never linked from the game). Its own asphalt ground, night sky, fog and lights, a straight test road along
// world X (s = world x, lateral x = world z) and, for hazard landmarks, a real course hazard bound
// through a track-space → local mapping, so the hazard sync can be checked by eye.
// Query: kind, quality=high|low, cam=near|far|race|orbit|top|hz|pt (p=x,y,z&l=x,y,z), pal=day|dusk|night, seed,
// t=seconds, pause=1, ang=radians, dist, h, look, wire=1 (collision cylinders), free=1 (unbound),
// hz=<hazard type> (alternative binding), side=-1 (landmark on the left), hide=draw names,
// bench=1 (time update() over a simulated stretch before the first frame).

import * as THREE from 'three';
import type { HazardDef, TrackPalette } from '../../core/types.ts';
import { blockerStage, dropperItems, gustStrength, hazardObstacles, type CourseHazard, type DropItem } from '../../core/hazards.ts';
import type { Obstacle } from '../../core/types.ts';
import { LANDMARKS_E } from './setE.ts';
import type { Landmark } from './types.ts';

type Kind = keyof typeof LANDMARKS_E;

const PALETTES: Record<string, TrackPalette> = {
  dusk: { sky: 0x2a1650, horizon: 0xb05a8a, sand: 0x3a3844, road: 0x3c3e4a, rock: 0x2c2c36, accent: 0x3ff0ff, sun: 0xffb090, dusk: 0.65 },
  night: { sky: 0x160a30, horizon: 0x5a2a78, sand: 0x34323e, road: 0x3c3e4a, rock: 0x24242e, accent: 0xff3ad8, sun: 0xffd0f4, dusk: 0.8 },
  deep: { sky: 0x05040f, horizon: 0x221a3c, sand: 0x2a2a34, road: 0x30323c, rock: 0x202028, accent: 0xffb02e, sun: 0x9ab8ff, dusk: 1 },
};

const ROAD_HALF = 12;
/** Lateral drivable range of the test road (road plus run-off). */
const MIN_X = -ROAD_HALF;
const MAX_X = ROAD_HALF;

interface Placement {
  /** Gap between the road edge and the footprint (negative with straddle). */
  distance: number;
  scale?: number;
  /** Hazard types this kind is shown with (first is the default). */
  hazards: HazardDef[];
}

const sweeper = (id: string, radius: number, height: number, xFrom: number, xTo: number, cross: number, hold: number, period: number): HazardDef => ({ type: 'sweeper', id, at: 0, radius, height, xFrom, xTo, cross, hold, period, phase: 0 });

const PLACE: Record<Kind, Placement> = {
  maglev: { distance: 20, hazards: [sweeper('train', 7, 6, 45, -45, 3, 2, 14)] },
  crane: { distance: 15, hazards: [{ type: 'dropper', id: 'girders', from: 0, to: 0, count: 5, radius: 3.5, period: 9, warn: 2.6, stay: 3, phase: 0 }] },
  demolition: { distance: 6, hazards: [{ type: 'blocker', id: 'facade', at: 0, opening: 8, offset: -4, height: 6, warn: 4, up: 5, period: 16, phase: 0 }] },
  cargoAirship: { distance: 30, hazards: [{ type: 'gust', id: 'downdraft', from: 0, to: 0, strength: 9, on: 6, period: 16, phase: 0 }] },
  skyscrapers: { distance: 30, hazards: [] },
  neonBillboards: { distance: 20, hazards: [] },
  stadium: { distance: 40, hazards: [] },
  hologramDragon: { distance: 60, hazards: [] },
  suspensionBridge: { distance: 40, hazards: [] },
  skyTram: { distance: 30, hazards: [] },
};
/** Droppers and gusts span this much road (s), centred on the landmark. */
const SPAN = 220;

const FOG_NEAR = { low: 220, high: 320 } as const;
const FOG_FAR = { low: 1500, high: 2600 } as const;
const SUN_HIGH = 0.7;
const SUN_LOW = 0.12;
const SUN_AZIMUTH = 2.2;
const SUN_INTENSITY: [number, number] = [2.6, 1.2];
const HEMI_INTENSITY: [number, number] = [1.4, 0.7];
const RACE_SPEED = 180;
const RACE_HEIGHT = 4;
const RACE_FOV = 70;
const VIEW_FOV = 55;
const FAR_DISTANCE = 1500;
const FAR_HEIGHT = 12;
const GROUND_SIZE = 14000;
const ROAD_Y = 0.15;
const LINE_Y = 0.2;

const params = new URLSearchParams(location.search);
const kind = (params.get('kind') ?? 'maglev') as Kind;
const quality = params.get('quality') === 'low' ? 'low' : 'high';
const cam = params.get('cam') ?? 'near';
const palette = PALETTES[params.get('pal') ?? 'night'];
if (!palette) throw new Error(`Unknown palette "${params.get('pal')}"`);
const seed = Number(params.get('seed') ?? 7);
const startT = Number(params.get('t') ?? 0);
const paused = params.get('pause') === '1';
const angle = Number(params.get('ang') ?? 0.5);
const side = params.get('side') === '-1' ? -1 : 1;
const factory = LANDMARKS_E[kind];
if (!factory) throw new Error(`Unknown set-E landmark "${kind}"`);
const place = PLACE[kind];

// --- Hazard ---
const wanted = params.get('hz');
const def = params.get('free') === '1' ? undefined : (place.hazards.find((h) => h.type === wanted) ?? place.hazards[0]);
let hazard: CourseHazard | undefined;
if (def) {
  const spanned = def.type === 'dropper' || def.type === 'gust';
  hazard = { def, s0: spanned ? -SPAN / 2 : 0, s1: spanned ? SPAN / 2 : 0, seed: seed * 31, minX: MIN_X, maxX: MAX_X };
}
const toLocalMatrix = new THREE.Matrix4();

// --- Renderer, sky, light ---
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
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.45));
  float toSun = max(dot(d, uSunDir), 0.0);
  col += uSun * pow(toSun, mix(18.0, 5.0, uDusk)) * mix(0.25, 0.5, uDusk) * (1.0 - h * 0.6);
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
    uniforms: { uZenith: { value: new THREE.Color(palette.sky) }, uHorizon: { value: horizon.clone() }, uSun: { value: new THREE.Color(palette.sun) }, uSunDir: { value: sunDir }, uDusk: { value: palette.dusk } },
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
scene.add(new THREE.HemisphereLight(new THREE.Color(palette.sky).lerp(new THREE.Color(0xffffff), 0.6), new THREE.Color(palette.sand).multiplyScalar(0.75), lerp(HEMI_INTENSITY)));

// --- Landmark: built first, placed after (the binding is only read in update) ---
const t0 = performance.now();
const lm: Landmark = factory({
  seed,
  palette,
  quality,
  hazard: hazard && { hazard, toLocal: (s, x, y, out) => out.set(s, y, x).applyMatrix4(toLocalMatrix) },
});
const buildMs = performance.now() - t0;
const R = lm.radius;
const scale = place.scale ?? 1;
const out = ROAD_HALF + place.distance + R * scale;
lm.group.position.set(0, 0, side * out);
lm.group.rotation.y = side > 0 ? 0 : Math.PI;
lm.group.scale.setScalar(scale);
lm.group.updateMatrixWorld(true);
toLocalMatrix.copy(lm.group.matrixWorld).invert();
scene.add(lm.group);
const hidden = new Set((params.get('hide') ?? '').split(',').filter(Boolean));
lm.group.traverse((o) => {
  if (hidden.has(o.name)) o.visible = false;
});

// --- Ground and road ---
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: palette.sand })));
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, ROAD_HALF * 2).rotateX(-Math.PI / 2).translate(0, ROAD_Y, 0), new THREE.MeshLambertMaterial({ color: palette.road })));
for (const z of [-ROAD_HALF + 0.6, ROAD_HALF - 0.6]) {
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, 0.5).rotateX(-Math.PI / 2).translate(0, LINE_Y, z), new THREE.MeshBasicMaterial({ color: 0xf0f0f0 })));
}

// --- Hazard overlay: collision cylinders, dropper shadows and landed blocks, gust span ---
const wire = params.get('wire') === '1';
const obstacles: Obstacle[] = [];
const drops: DropItem[] = [];
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0);
const cylMat = new THREE.MeshBasicMaterial({ color: 0xff2060, wireframe: true, fog: false });
const landedMat = new THREE.MeshLambertMaterial({ color: 0x8c939c, flatShading: true });
const landedGeo = new THREE.IcosahedronGeometry(1, 0);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
const shadowGeo = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
const POOL = 48;
const cyls: THREE.Mesh[] = [];
const landed: THREE.Mesh[] = [];
const shadows: THREE.Mesh[] = [];
for (let i = 0; i < POOL; i++) {
  cyls.push(new THREE.Mesh(cylGeo, cylMat));
  landed.push(new THREE.Mesh(landedGeo, landedMat));
  shadows.push(new THREE.Mesh(shadowGeo, shadowMat));
  scene.add(cyls[i], landed[i], shadows[i]);
}
const gustBox = new THREE.Mesh(new THREE.BoxGeometry(SPAN, 6, ROAD_HALF * 2).translate(0, 3, 0), new THREE.MeshBasicMaterial({ color: 0x40c0ff, transparent: true, opacity: 0, depthWrite: false, wireframe: true }));
scene.add(gustBox);

function hazardOverlay(time: number): string {
  for (const m of [...cyls, ...landed, ...shadows]) m.visible = false;
  if (!hazard) return 'free-running (no hazard)';
  const d = hazard.def;
  hazardObstacles([hazard], time, obstacles);
  obstacles.forEach((o, i) => {
    if (i >= POOL) return;
    const c = cyls[i];
    c.visible = wire;
    c.position.set(o.s, ROAD_Y, o.x);
    c.scale.set(o.radius, o.height, o.radius);
    if (d.type === 'dropper') {
      const l = landed[i];
      l.visible = true;
      l.position.set(o.s, o.radius * 0.6, o.x);
      l.scale.setScalar(o.radius);
    }
  });
  if (d.type === 'dropper') {
    dropperItems(hazard, time, drops).forEach((it, i) => {
      if (it.stage !== 'warn') return;
      const sh = shadows[i];
      sh.visible = true;
      sh.position.set(it.s, LINE_Y + 0.05, it.x);
      sh.scale.setScalar(d.radius * (0.4 + 0.6 * it.progress));
    });
    return `dropper ${obstacles.length} down`;
  }
  if (d.type === 'gust') {
    const g = gustStrength(d, time);
    (gustBox.material as THREE.MeshBasicMaterial).opacity = Math.abs(g / d.strength);
    gustBox.visible = wire;
    return `gust ${g.toFixed(2)} m/s²`;
  }
  if (d.type === 'blocker') {
    const st = blockerStage(d, time);
    return `blocker ${st.stage} ${st.progress.toFixed(2)}`;
  }
  return `sweeper x=${obstacles[0]?.x.toFixed(1)}`;
}

// --- Budget ---
function budget(root: THREE.Object3D): { calls: number; tris: number; clouds: number; points: number; parts: string } {
  let calls = 0;
  let tris = 0;
  let clouds = 0;
  let points = 0;
  const parts: string[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Points) {
      calls++;
      clouds++;
      const n = o.geometry.getAttribute('position').count;
      points += n;
      parts.push(`${o.name || 'cloud'}:${n}p`);
    } else if (o instanceof THREE.Mesh) {
      calls++;
      const g = o.geometry;
      const n = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      const total = n * (o instanceof THREE.InstancedMesh ? o.count : 1);
      tris += total;
      parts.push(`${o.name}:${Math.round(total)}`);
    }
  });
  return { calls, tris, clouds, points, parts: parts.join(' ') };
}
const cost = budget(lm.group);
// bench=1: average update() cost over a simulated stretch of race (ms per call), before rendering.
const BENCH_FRAMES = 600;
const BENCH_DT = 1 / 60;
let benchMs = Number.NaN;
if (params.get('bench') === '1') {
  const b0 = performance.now();
  for (let i = 0; i < BENCH_FRAMES; i++) lm.update(startT + i * BENCH_DT, BENCH_DT);
  benchMs = (performance.now() - b0) / BENCH_FRAMES;
}

// --- Camera ---
const camera = new THREE.PerspectiveCamera(cam === 'race' ? RACE_FOV : VIEW_FOV, innerWidth / innerHeight, 0.5, 3200);
function placeCamera(t: number): void {
  const c = lm.group.position;
  const look = params.get('look');
  if (cam === 'race') {
    const span = R * 2 + 900;
    const x = ((t * RACE_SPEED) % span) - span / 2;
    camera.position.set(x, RACE_HEIGHT, 0);
    camera.lookAt(x + 100, RACE_HEIGHT - 1 + Number(look ?? 0), side * 22);
    return;
  }
  if (cam === 'hz') {
    // From the road, short of the hazard, looking down the road at it.
    const d = Number(params.get('dist') ?? 140);
    camera.position.set(-d, Number(params.get('h') ?? 5), Number(params.get('z') ?? 0));
    camera.lookAt(0, Number(look ?? 12), side * Number(params.get('lz') ?? 10));
    return;
  }
  if (cam === 'far') {
    const d = Number(params.get('dist') ?? FAR_DISTANCE);
    camera.position.set(c.x + Math.sin(angle) * d, FAR_HEIGHT, c.z - side * Math.cos(angle) * d);
    camera.lookAt(c.x, Number(look ?? R * 0.2), c.z);
    return;
  }
  if (cam === 'pt') {
    // Free camera: p=x,y,z looking at l=x,y,z (world).
    const [px, py, pz] = (params.get('p') ?? '0,40,-60').split(',').map(Number);
    const [lx, ly, lz] = (params.get('l') ?? '0,0,0').split(',').map(Number);
    camera.position.set(px, py, pz);
    camera.lookAt(lx, ly, lz);
    return;
  }
  if (cam === 'top') {
    camera.position.set(c.x, R * 2.4, c.z - 1);
    camera.lookAt(c.x, 0, c.z);
    return;
  }
  const a = cam === 'orbit' ? angle + t * 0.06 : angle;
  const d = Number(params.get('dist') ?? R * 1.6);
  camera.position.set(c.x + Math.sin(a) * d, Number(params.get('h') ?? Math.max(6, d * 0.12)), c.z - side * Math.cos(a) * d);
  camera.lookAt(c.x, Number(look ?? R * 0.15), c.z);
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
  const hz = hazardOverlay(time);
  placeCamera(time);
  renderer.render(scene, camera);
  const seen = renderer.info.render;
  hud.textContent =
    `${kind} · ${quality} · ${cam} · t=${time.toFixed(2)} · r=${R.toFixed(0)} m · ${hz}\n` +
    `landmark: ${cost.calls} draws · ${Math.round(cost.tris)} tris · ${cost.clouds} clouds/${cost.points} pts (frame: ${seen.calls} / ${seen.triangles})\n` +
    `build ${buildMs.toFixed(0)} ms · update ${updateMs.toFixed(3)} ms · bench ${benchMs.toFixed(3)} ms\n${cost.parts}`;
  (window as unknown as { __cost: typeof cost; __update: number }).__cost = cost;
  (window as unknown as { __update: number }).__update = Number.isNaN(benchMs) ? updateMs : benchMs;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
