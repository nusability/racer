// Developer-only viewer for the set-B landmarks (landmark-viewer.html?kind=bazaar, never
// linked from the game). Query: kind, quality=high|low, cam=near|far|race|orbit|top,
// track=<track id> (palette), seed, t=seconds (start time), pause=1, ang=radians, dist=metres,
// h=camera height, look=look-at height, hide=comma-separated draw names.

import * as THREE from 'three';
import { TRACKS, trackById } from '../../data/tracks/index.ts';
import { applyEnvironment } from '../track/environment.ts';
import { FOG_FAR, atmosphere } from '../track/config.ts';
import { LANDMARKS_B } from './setB.ts';
import type { Landmark } from './types.ts';

type Kind = keyof typeof LANDMARKS_B;

/** The race camera: chase-camera height and fov, flying past at racing speed. */
const RACE_SPEED = 180;
const RACE_GAP = 40;
const RACE_HEIGHT = 4;
const RACE_FOV = 70;
const VIEW_FOV = 55;
const FAR_DISTANCE = 1500;
const FAR_HEIGHT = 10;
const GROUND_SIZE = 12000;
const ROAD_WIDTH = 24;
const DEFAULT_TRACK = 'mirageh';

const params = new URLSearchParams(location.search);
const kind = (params.get('kind') ?? 'bazaar') as Kind;
const quality = params.get('quality') === 'low' ? 'low' : 'high';
const cam = params.get('cam') ?? 'near';
const palette = trackById(params.get('track') ?? DEFAULT_TRACK).palette;
const seed = Number(params.get('seed') ?? 11);
const startT = Number(params.get('t') ?? 0);
const paused = params.get('pause') === '1';
const angle = Number(params.get('ang') ?? 0.6);

const factory = LANDMARKS_B[kind];
if (!factory) throw new Error(`Unknown set-B landmark "${kind}"`);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
applyEnvironment(scene, palette, atmosphere(quality));
const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE).rotateX(-Math.PI / 2);
scene.add(new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ color: palette.sand })));
const road = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, ROAD_WIDTH).rotateX(-Math.PI / 2).translate(0, 0.05, 0), new THREE.MeshLambertMaterial({ color: palette.road }));
scene.add(road);

const t0 = performance.now();
const lm: Landmark = factory({ seed, palette, quality });
const buildMs = performance.now() - t0;
// The road runs along X at z = 0; the landmark faces −Z toward it from the +Z side.
const R = lm.radius;
lm.group.position.set(0, 0, R + RACE_GAP);
scene.add(lm.group);
// ?hide=beams,halos hides the landmark's draws by name (for judging each layer).
const hidden = new Set((params.get('hide') ?? '').split(',').filter(Boolean));
lm.group.traverse((o) => {
  if (hidden.has(o.name)) o.visible = false;
});

/** Budget as built (independent of what the camera happens to see). */
function budget(root: THREE.Object3D): { calls: number; tris: number; points: number; parts: string } {
  let calls = 0;
  const parts: string[] = [];
  let tris = 0;
  let points = 0;
  root.traverse((o) => {
    if (o instanceof THREE.Points) {
      calls++;
      points += o.geometry.getAttribute('position').count;
      parts.push(`${o.name}:${o.geometry.getAttribute('position').count}p`);
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

const camera = new THREE.PerspectiveCamera(cam === 'race' ? RACE_FOV : VIEW_FOV, innerWidth / innerHeight, 0.5, 3200);

function placeCamera(t: number): void {
  const c = lm.group.position;
  if (cam === 'race') {
    const span = R * 2 + 900;
    const x = ((t * RACE_SPEED) % span) - span / 2;
    camera.position.set(x, RACE_HEIGHT, 0);
    camera.lookAt(x + 100, RACE_HEIGHT - 1, 22);
    return;
  }
  if (cam === 'far') {
    const d = Number(params.get('dist') ?? FAR_DISTANCE);
    camera.position.set(c.x + Math.sin(angle) * d, FAR_HEIGHT, c.z - Math.cos(angle) * d);
    camera.lookAt(c.x, R * 0.2, c.z);
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
const otherKinds = TRACKS.map((tr) => tr.id).join(' ');

let time = startT;
let last = performance.now();
let updateMs = 0;
let frames = 0;
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
    `build ${buildMs.toFixed(0)} ms · update ${updateMs.toFixed(3)} ms\ntracks: ${otherKinds}`;
  frames++;
  (window as unknown as { __frames: number; __cost: typeof cost }).__frames = frames;
  (window as unknown as { __cost: typeof cost; __lm: Landmark }).__cost = cost;
  (window as unknown as { __lm: Landmark }).__lm = lm;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
