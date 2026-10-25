import * as THREE from 'three';
import type { TrackPalette } from '../../core/types.ts';
import { applyEnvironment } from '../track/environment.ts';
import { FOG_FAR, atmosphere } from '../track/config.ts';
import { LANDMARKS_A } from './setA.ts';
import type { Landmark, LandmarkOptions } from './types.ts';
import { HazardOverlay, ROAD_HALF, viewerBinding, viewerHazard, type ViewerHazardType } from './a/viewerHazards.ts';

// Developer-only viewer for the set-A landmarks (landmark-viewer.html, never linked from the
// game). Query: ?kind=spaceport&quality=high|low&cam=near|far|race|orbit&t=seconds&pause=1
// &palette=noon|amber|dusk|storm&seed=n&ang=radians&dist=metres&look=metres&rx=metres&bench=1
// &hazard=sweeper|blocker|dropper|gust (bind to a hazard on the fake road; 1 = the kind's own)
// &wire=0 (hide the collision wireframes; key W toggles) &scale=n (placement scale)

type Kind = keyof typeof LANDMARKS_A;

/** Representative track palettes: bright noon, warm afternoon, purple dusk, storm. */
const PALETTES: Record<string, TrackPalette> = {
  noon: { sky: 0x3d7fd0, horizon: 0xf3dfb8, sand: 0xeedcbc, road: 0xd8b07a, rock: 0xc07848, accent: 0xff5a2a, sun: 0xfff2d8, dusk: 0 },
  amber: { sky: 0x4a7ec0, horizon: 0xf0b878, sand: 0xd8a060, road: 0xb88050, rock: 0x9a5030, accent: 0xff3a5a, sun: 0xffe0b0, dusk: 0.45 },
  dusk: { sky: 0x2c2458, horizon: 0xff9a62, sand: 0xd9927a, road: 0xa8706a, rock: 0x6a3a58, accent: 0x40e0ff, sun: 0xffa060, dusk: 0.8 },
  storm: { sky: 0x3a3a4e, horizon: 0xb48a62, sand: 0xa8805a, road: 0x8e6c4a, rock: 0x5e3a30, accent: 0xffc820, sun: 0xffb070, dusk: 0.7 },
};

/** Chase-camera-like framing: speed past the landmark, offset from its footprint, height. */
const RACE_SPEED = 180;
const RACE_GAP = 40;
const RACE_HEIGHT = 4;
const RACE_FOV = 70;
const VIEW_FOV = 60;
const FAR_DISTANCE = 1500;
const FAR_HEIGHT = 12;
/** Seconds of animation simulated before the first frame so particles are already alive. */
const WARMUP = 15;
const WARMUP_STEP = 1 / 30;
const GROUND_SIZE = 12000;
/** Each bindable kind's own hazard type, and how far from the road centre its origin stands. */
const OWN_HAZARD: Partial<Record<Kind, ViewerHazardType>> = { sandbeast: 'blocker', invasion: 'sweeper', mine: 'dropper', spaceport: 'gust' };
const BOUND_PLACE: Partial<Record<Kind, number>> = { sandbeast: 140, invasion: 330, mine: 330, spaceport: 300 };

const params = new URLSearchParams(location.search);
const kind = (params.get('kind') ?? 'spaceport') as Kind;
const quality = params.get('quality') === 'low' ? 'low' : 'high';
const cam = params.get('cam') ?? 'near';
const palette = PALETTES[params.get('palette') ?? 'amber'] ?? PALETTES.amber;
const seed = Number(params.get('seed') ?? 7);
const startT = Number(params.get('t') ?? 0);
const paused = params.get('pause') === '1';
const angle = Number(params.get('ang') ?? 0.5);

const factory = LANDMARKS_A[kind];
const lookParam = params.get('look');
/** Race camera: where along the road it is at t (else it loops past on its own clock). */
const raceX = params.get('rx');
if (!factory) throw new Error(`unknown landmark kind "${kind}"`);
const hazardParam = params.get('hazard');
const hazardType: ViewerHazardType | null = hazardParam === null ? null : hazardParam === '1' ? (OWN_HAZARD[kind] ?? null) : (hazardParam as ViewerHazardType);
const placeScale = Number(params.get('scale') ?? 1);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
applyEnvironment(scene, palette, atmosphere(quality));
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: palette.sand }),
);
scene.add(ground);
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE, ROAD_HALF * 2).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: palette.road }),
);
scene.add(road);

const camera = new THREE.PerspectiveCamera(cam === 'race' ? RACE_FOV : VIEW_FOV, innerWidth / innerHeight, 0.5, 3200);

// Baseline cost of the empty environment, so the HUD can show the landmark's own cost.
renderer.render(scene, camera);
const baseCalls = renderer.info.render.calls;
const baseTris = renderer.info.render.triangles;

const t0 = performance.now();
const hazard = hazardType ? viewerHazard(hazardType) : null;
const placeZ = hazard ? (BOUND_PLACE[kind] ?? 300) : 0;
const lmOpts: LandmarkOptions = { seed, palette, quality };
if (hazard) lmOpts.hazard = viewerBinding(hazard, placeZ, placeScale);
const lm: Landmark = factory(lmOpts);
const buildMs = performance.now() - t0;
scene.add(lm.group);
// The road runs along X; the landmark faces −Z toward it, so it sits on the +Z side.
const R = hazard ? 200 : lm.radius;
/** Height the near/far cameras aim at; sky landmarks want ?look=250 or so. */
const lookY = lookParam === null ? R * 0.18 : Number(lookParam);
lm.group.position.set(0, 0, hazard ? placeZ : R + RACE_GAP);
lm.group.scale.setScalar(hazard ? placeScale : 1);
const overlay = hazard ? new HazardOverlay(hazard) : null;
if (overlay) {
  overlay.group.visible = params.get('wire') !== '0';
  scene.add(overlay.group);
  addEventListener('keydown', (e) => {
    if (e.key === 'w' || e.key === 'W') overlay.group.visible = !overlay.group.visible;
  });
}

let time = Math.max(0, startT - WARMUP);
while (time < startT) {
  lm.update(time, WARMUP_STEP);
  time += WARMUP_STEP;
}

/** ?bench=1: average update() cost over many steady frames, shown in the HUD. */
const BENCH_FRAMES = 3000;
let benchMs = Number.NaN;
if (params.get('bench') === '1') {
  const b0 = performance.now();
  for (let i = 0; i < BENCH_FRAMES; i++) lm.update(startT + i / 60, 1 / 60);
  benchMs = (performance.now() - b0) / BENCH_FRAMES;
}

const hud = document.createElement('div');
hud.style.cssText =
  'position:fixed;left:6px;top:6px;color:#fff;font:11px/1.3 monospace;background:rgba(0,0,0,.55);padding:4px 6px;border-radius:4px;pointer-events:none;white-space:pre';
document.body.appendChild(hud);

/** What the near/far cameras circle: the hazard's spot on the road when bound. */
const focus = hazard ? new THREE.Vector3((hazard.s0 + hazard.s1) / 2, 0, 0) : lm.group.position;

function placeCamera(t: number): void {
  const c = focus;
  if (cam === 'race') {
    // Fly along the road (z = 0) at racing speed, sweeping past the landmark.
    const span = R * 2 + 1200;
    const x = raceX === null ? ((t * RACE_SPEED) % span) - span / 2 : Number(raceX) + (t - startT) * RACE_SPEED;
    // Bound: drive straight down the road through the hazard; else glance at the roadside.
    camera.position.set(x, RACE_HEIGHT, 0);
    camera.lookAt(x + 100, RACE_HEIGHT - 0.6, hazard ? 0 : 18);
    return;
  }
  if (cam === 'far') {
    const d = Number(params.get('dist') ?? FAR_DISTANCE);
    camera.position.set(c.x + Math.sin(angle) * d, FAR_HEIGHT, c.z - Math.cos(angle) * d);
    camera.lookAt(c.x, lookY * 1.4, c.z);
    return;
  }
  const a = cam === 'orbit' ? angle + t * 0.05 : angle;
  const d = Number(params.get('dist') ?? R * 1.6);
  camera.position.set(c.x + Math.sin(a) * d, Math.max(6, d * 0.12), c.z - Math.cos(a) * d);
  camera.lookAt(c.x, lookY, c.z);
}

let last = performance.now();
let frames = 0;
let updMs = 0;
function frame(now: number): void {
  const dt = paused ? 0 : Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) time += dt;
  const u0 = performance.now();
  lm.update(time, paused ? 0 : dt);
  updMs = updMs * 0.9 + (performance.now() - u0) * 0.1;
  placeCamera(time);
  const hazardText = overlay ? ` · ${overlay.update(time)}` : '';
  renderer.info.reset();
  renderer.render(scene, camera);
  const info = renderer.info.render;
  hud.textContent =
    `${kind} · ${quality} · ${cam} · t=${time.toFixed(1)}s · r=${R.toFixed(0)}m · fog ${FOG_FAR[quality]}m${hazardText}\n` +
    `landmark ≈ ${info.calls - baseCalls} draws · ${info.triangles - baseTris} tris · ${info.points} pts\n` +
    `build ${buildMs.toFixed(0)} ms · update ${updMs.toFixed(3)} ms` + (Number.isNaN(benchMs) ? '' : ` · bench ${benchMs.toFixed(3)} ms`);
  frames++;
  (window as unknown as { __frames: number }).__frames = frames;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
