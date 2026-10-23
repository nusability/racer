import * as THREE from 'three';
import { Track, type Ribbon } from '../../core/track.ts';
import { TRACKS, trackById } from '../../data/tracks/index.ts';
import { applyEnvironment, buildTrackScene } from '../trackScene.ts';
import { FOG_FAR, type Quality } from './config.ts';

// Developer-only fly-through of a track (track-viewer.html, never linked from the game).
// Query: ?track=id&quality=high|low&s=metres&speed=m/s&view=fly|orbit|top&pause=1

const params = new URLSearchParams(location.search);
const quality: Quality = params.get('quality') === 'low' ? 'low' : 'high';
const def = trackById(params.get('track') ?? TRACKS[0].id);
const RACER_HEIGHT = 2.2;
/** Chase-cam offset behind and above the racer position. */
const CAM_BACK = 9;
const CAM_UP = 3.6;
const LOOK_AHEAD = 60;
const MAP_SIZE = 180;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.5, FOG_FAR[quality] + 300);
const t0 = performance.now();
const track = new Track(def);
applyEnvironment(scene, def.palette, quality);
const ts = buildTrackScene(track, quality);
scene.add(ts.group);
const buildMs = performance.now() - t0;

let s = Number(params.get('s') ?? 0);
let speed = Number(params.get('speed') ?? 150);
let paused = params.get('pause') === '1';
/** Pins the race clock (hazard schedules) for screenshots; null runs it from the wall clock. */
let raceTime: number | null = null;
let view = params.get('view') ?? 'fly';
let lateral = Number(params.get('x') ?? 0);
/** Which ribbon the camera flies: -1 the main loop, else a shortcut. */
let ribbon: Ribbon = track.ribbon(Number(params.get('branch') ?? -1));
const orbit = { yaw: 0.6, pitch: 0.35, dist: 140 };

const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;left:8px;top:8px;color:#fff;font:12px/1.35 monospace;background:rgba(0,0,0,.55);padding:6px 8px;border-radius:4px;pointer-events:none;white-space:pre';
document.body.appendChild(hud);
const map = document.createElement('canvas');
map.width = map.height = MAP_SIZE;
map.style.cssText = 'position:fixed;right:8px;top:8px;background:rgba(0,0,0,.4);border-radius:4px';
document.body.appendChild(map);
const picker = document.createElement('select');
picker.style.cssText = 'position:fixed;left:8px;bottom:8px';
for (const t of TRACKS) picker.add(new Option(t.name, t.id, false, t.id === def.id));
picker.onchange = () => {
  params.set('track', picker.value);
  location.search = params.toString();
};
document.body.appendChild(picker);

const xs = track.samples.map((p) => p.pos.x);
const zs = track.samples.map((p) => p.pos.z);
const mx0 = Math.min(...xs);
const mz0 = Math.min(...zs);
const mScale = (MAP_SIZE - 16) / Math.max(Math.max(...xs) - mx0, Math.max(...zs) - mz0);
function drawMap() {
  const ctx = map.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for the minimap');
  ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
  ctx.lineWidth = 2;
  for (let k = 0; k < track.samples.length; k += 4) {
    const p = track.samples[k];
    ctx.fillStyle = p.gap ? '#f33' : Number.isFinite(p.ceiling) ? '#222' : p.wallHeight > 0 ? '#c84' : '#fff';
    ctx.fillRect(8 + (p.pos.x - mx0) * mScale, 8 + (p.pos.z - mz0) * mScale, 2, 2);
  }
  ctx.fillStyle = '#e6c';
  for (const b of track.branches) {
    for (let k = 0; k < b.ribbon.samples.length; k += 4) {
      const p = b.ribbon.samples[k].pos;
      ctx.fillRect(8 + (p.x - mx0) * mScale, 8 + (p.z - mz0) * mScale, 2, 2);
    }
  }
  const me = ribbon.toWorld(s, 0, 0);
  ctx.fillStyle = '#0f0';
  ctx.beginPath();
  ctx.arc(8 + (me.x - mx0) * mScale, 8 + (me.z - mz0) * mScale, 4, 0, Math.PI * 2);
  ctx.fill();
}

let dragging = false;
renderer.domElement.addEventListener('pointerdown', () => (dragging = true));
window.addEventListener('pointerup', () => (dragging = false));
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  view = 'orbit';
  orbit.yaw -= e.movementX * 0.005;
  orbit.pitch = Math.max(-0.2, Math.min(1.5, orbit.pitch + e.movementY * 0.005));
});
window.addEventListener('wheel', (e) => (orbit.dist = Math.max(10, Math.min(3000, orbit.dist * (1 + e.deltaY * 0.001)))));
window.addEventListener('keydown', (e) => {
  if (e.key === ' ') paused = !paused;
  if (e.key === 'f') view = 'fly';
  if (e.key === 'o') view = 'orbit';
  if (e.key === 't') view = 'top';
  if (e.key === 'ArrowUp') speed += 25;
  if (e.key === 'ArrowDown') speed = Math.max(0, speed - 25);
  if (e.key === 'ArrowLeft') lateral -= 2;
  if (e.key === 'ArrowRight') lateral += 2;
  if (e.key === 'a') orbit.yaw += 0.1;
  if (e.key === 'd') orbit.yaw -= 0.1;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const look = new THREE.Vector3();
function placeCamera() {
  const at = ribbon.toWorld(s, lateral, RACER_HEIGHT);
  if (view === 'fly') {
    const p = ribbon.toWorld(s - CAM_BACK, lateral, CAM_UP);
    camera.position.set(p.x, p.y, p.z);
    const l = ribbon.toWorld(s + LOOK_AHEAD, lateral * 0.5, RACER_HEIGHT);
    look.set(l.x, l.y, l.z);
    const up = ribbon.frameAt(s).up;
    camera.up.set(up.x, up.y, up.z);
  } else if (view === 'top') {
    camera.position.set(at.x, at.y + orbit.dist * 4, at.z + 1);
    look.set(at.x, at.y, at.z);
    camera.up.set(0, 1, 0);
  } else {
    const d = orbit.dist;
    camera.position.set(
      at.x + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * d,
      at.y + Math.sin(orbit.pitch) * d,
      at.z + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * d,
    );
    look.set(at.x, at.y, at.z);
    camera.up.set(0, 1, 0);
  }
  camera.lookAt(look);
}

let last = performance.now();
let fps = 60;
let frames = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(1e-3, dt) - fps) * 0.05;
  if (!paused) {
    s += speed * dt;
    // A shortcut ends: rejoin the main loop where it does.
    if (!ribbon.closed && s >= ribbon.length) {
      const b = track.branches.find((x) => x.ribbon === ribbon);
      s = b ? b.exitS : 0;
      ribbon = track;
    }
    s = ribbon.wrap(s);
  }
  placeCamera();
  ts.update(raceTime ?? now / 1000, camera.position);
  renderer.render(scene, camera);
  if (frames++ % 10 === 0) {
    const i = renderer.info.render;
    hud.textContent =
      `${def.name} (${quality})  ${track.length.toFixed(0)} m  build ${buildMs.toFixed(0)} ms\n` +
      `s ${s.toFixed(0)}  ${(speed * 3.6).toFixed(0)} km/h  view ${view}  fps ${fps.toFixed(0)}\n` +
      `draw calls ${i.calls}  triangles ${(i.triangles / 1000).toFixed(1)}k\n` +
      `space pause · f/o/t views · arrows speed/lateral · drag orbit`;
    drawMap();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/** Hooks for automated screenshots. */
function totals() {
  let tris = 0;
  let meshes = 0;
  ts.group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes++;
    const g = o.geometry;
    const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    tris += o instanceof THREE.InstancedMesh ? t * o.count : t;
  });
  return { meshes, tris };
}
Object.assign(window, {
  viewer: {
    set(next: { branch?: number; s?: number; view?: string; speed?: number; paused?: boolean; x?: number; yaw?: number; pitch?: number; dist?: number; time?: number }) {
      if (next.time !== undefined) raceTime = next.time;
      if (next.branch !== undefined) ribbon = track.ribbon(next.branch);
      if (next.s !== undefined) s = ribbon.wrap(next.s);
      if (next.view) view = next.view;
      if (next.speed !== undefined) speed = next.speed;
      if (next.paused !== undefined) paused = next.paused;
      if (next.x !== undefined) lateral = next.x;
      if (next.yaw !== undefined) orbit.yaw = next.yaw;
      if (next.pitch !== undefined) orbit.pitch = next.pitch;
      if (next.dist !== undefined) orbit.dist = next.dist;
      placeCamera();
      ts.update(raceTime ?? performance.now() / 1000, camera.position);
      renderer.render(scene, camera);
    },
    collect: (branch: number, cell: number, item: 'boost' | 'repair' = 'boost') => ts.collectCell(item, branch, cell),
    resetCells: () => ts.resetCells(),
    landmarks: () =>
      ts.group.children
        .filter((o) => o.name.startsWith('landmark:'))
        .map((o) => {
          const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
          let meshes = 0;
          o.traverse((m) => {
            if (m instanceof THREE.Mesh || m instanceof THREE.Points || m instanceof THREE.LineSegments) meshes++;
          });
          return `${o.name} ${size.x.toFixed(0)}x${size.y.toFixed(0)}x${size.z.toFixed(0)} ${meshes} draws ${o.visible ? 'on' : 'off'}`;
        }),
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, buildMs, length: track.length, ...totals() }),
    track,
  },
});
