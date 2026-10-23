// Dev-only page (racer-viewer.html) for judging the racers and effects in a browser. Not linked
// from the game. URL parameters:
//   mode=lineup|chase|showroom|stats   state=idle|race|boost|damaged
//   view=rear|three|side|front|top     racer=0..5   detail=high|low   ui=0 hides the buttons
//   ground=sand|water|snow|asphalt (sky, ground and spray colours: the skimmers must fit any world)
import * as THREE from 'three';
import { RACERS } from '../data/racers.ts';
import { createRacerModel, type RacerModel, type RacerViewState } from './racerModel.ts';
import { Effects } from './effects.ts';
import { SpeedLines } from './speedLines.ts';
import { Showroom } from './showroom.ts';
import { SKIMMER_RIDE_HEIGHT } from './skimmerTuning.ts';

type Mode = 'lineup' | 'chase' | 'showroom' | 'stats';
type State = 'idle' | 'race' | 'boost' | 'damaged';
type View = 'rear' | 'three' | 'side' | 'front' | 'top';

const params = new URLSearchParams(location.search);
const mode = (params.get('mode') ?? 'lineup') as Mode;
let state = (params.get('state') ?? 'race') as State;
let view = (params.get('view') ?? 'three') as View;
let racerIndex = Number(params.get('racer') ?? '0') % RACERS.length;
const detail = params.get('detail') === 'low' ? 'low' : 'high';

const GROUNDS = {
  sand: { sky: 0xe6a978, ground: 0xd9a46c },
  water: { sky: 0x8fc4e8, ground: 0x2f7fa8 },
  snow: { sky: 0xc9d6e6, ground: 0xe8eef4 },
  asphalt: { sky: 0x2a2f45, ground: 0x3a3c42 },
} as const;
const groundName = (params.get('ground') ?? 'sand') as keyof typeof GROUNDS;
const { sky: SKY, ground: GROUND } = GROUNDS[groundName] ?? GROUNDS.sand;
const LINEUP_SPACING_X = 10;
const LINEUP_SPACING_Z = 15;
const CHASE_SPEED = 190;
const CHASE_BOOST_SPEED = 245;
const CHASE_CYCLE = 6;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xffe2c0, 0x8a5a3a, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(-40, 60, -30);
  scene.add(sun);
}

function viewState(top: number, time: number): RacerViewState {
  const boosting = state === 'boost';
  return {
    speed: state === 'idle' ? 0 : top * (boosting ? 1.3 : 1),
    topSpeed: top,
    boosting,
    heat: boosting ? 0.6 : 0.15,
    damage: state === 'damaged' ? 0.85 : 0,
    groundColor: GROUND,
    steer: Math.sin(time * 0.9) * 0.6,
    airborne: false,
    crashed: false,
  };
}

function buildBar(): void {
  const bar = document.getElementById('bar');
  if (!bar) throw new Error('racer-viewer.html is missing #bar');
  if (params.get('ui') === '0') bar.classList.add('hidden');
  const link = (label: string, key: string, value: string, on: boolean) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (on) b.className = 'on';
    b.onclick = () => {
      params.set(key, value);
      location.search = params.toString();
    };
    bar.appendChild(b);
  };
  for (const m of ['lineup', 'chase', 'showroom'] as const) link(m, 'mode', m, m === mode);
  for (const s of ['idle', 'race', 'boost', 'damaged'] as const) link(s, 'state', s, s === state);
  if (mode === 'lineup') for (const v of ['three', 'rear', 'side', 'front', 'top'] as const) link(v, 'view', v, v === view);
  if (mode !== 'lineup') RACERS.forEach((r, i) => link(r.name, 'racer', String(i), i === racerIndex));
}

// --- Lineup: all six side by side ------------------------------------------------------------
function lineup(): (dt: number, t: number) => void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  addLights(scene);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: GROUND }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -SKIMMER_RIDE_HEIGHT;
  scene.add(ground);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 1000);
  const models: RacerModel[] = [];
  const place = () => {
    const aspect = window.innerWidth / window.innerHeight;
    const cols = aspect > 1 ? 3 : 2;
    const rows = Math.ceil(RACERS.length / cols);
    models.forEach((m, i) => {
      m.root.position.set(((i % cols) - (cols - 1) / 2) * LINEUP_SPACING_X, 0, (Math.floor(i / cols) - (rows - 1) / 2) * LINEUP_SPACING_Z);
    });
    camera.aspect = aspect;
    const span = Math.max(cols * LINEUP_SPACING_X, rows * LINEUP_SPACING_Z * (view === 'top' ? 1 : 0.55)) / Math.min(1, aspect);
    const d = span * 0.95;
    const dirs: Record<View, [number, number, number]> = {
      three: [0.55, 0.45, 0.7], rear: [0, 0.32, 1], side: [1, 0.25, 0.05], front: [0, 0.3, -1], top: [0.001, 1, 0.001],
    };
    const [x, y, z] = dirs[view];
    camera.position.set(x, y, z).normalize().multiplyScalar(d);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };
  RACERS.forEach((r) => {
    const m = createRacerModel(r.visual, { detail });
    scene.add(m.root);
    models.push(m);
  });
  place();
  window.addEventListener('resize', place);
  return (dt, t) => {
    models.forEach((m, i) => m.update(dt, t, viewState(RACERS[i].base.topSpeed, t + i)));
    renderer.render(scene, camera);
  };
}

// --- Chase: one racer flying over sand with the race effects firing --------------------------
function groundTexture(): THREE.DataTexture {
  const c = new THREE.Color(GROUND).convertLinearToSRGB();
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // Deterministic ripples plus hash speckle: enough texture to read ground speed.
      const ripple = Math.sin((x + Math.sin(y * 0.3) * 3) * 0.6) * 0.5 + 0.5;
      const hash = ((x * 73856093) ^ (y * 19349663)) % 97 / 97;
      const v = 0.82 + ripple * 0.1 + hash * 0.08;
      data.set([255 * c.r * v, 255 * c.g * v, 255 * c.b * v, 255], (y * N + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, N, N);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function chase(): (dt: number, t: number) => void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 120, 700);
  addLights(scene);
  const TILE = 24;
  const tex = groundTexture();
  tex.repeat.set(2000 / TILE, 2000 / TILE);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -SKIMMER_RIDE_HEIGHT;
  scene.add(ground);
  // Rock posts on both sides of a corridor, wrapped around the camera for parallax.
  const ROCKS = 160;
  const ROCK_SPAN = 800;
  const rockGeo = new THREE.CylinderGeometry(1.2, 2.2, 9, 6);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0x9a5a3c, flatShading: true }), ROCKS);
  rocks.frustumCulled = false;
  const rockZ = Array.from({ length: ROCKS }, (_, i) => (i / ROCKS) * ROCK_SPAN);
  const rockX = Array.from({ length: ROCKS }, (_, i) => (i % 2 ? 1 : -1) * (24 + ((i * 37) % 60)));
  scene.add(rocks);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.3, 1500);
  scene.add(camera);
  const racer = RACERS[racerIndex];
  const model = createRacerModel(racer.visual, { detail });
  scene.add(model.root);
  const effects = new Effects(scene, detail);
  const lines = new SpeedLines(camera);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  const pos = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const look = new THREE.Vector3();
  const m = new THREE.Matrix4();
  let z = 0;
  let wasBoost = false;
  let lastCycle = -1;
  return (dt, t) => {
    const phase = t % CHASE_CYCLE;
    const cycle = Math.floor(t / CHASE_CYCLE);
    const boosting = state === 'boost' || (state === 'race' && phase < 1.6);
    const speed = boosting ? CHASE_BOOST_SPEED : state === 'idle' ? 40 : CHASE_SPEED;
    z -= speed * dt;
    const x = Math.sin(t * 0.55) * 7;
    const dx = Math.cos(t * 0.55) * 7 * 0.55;
    const steer = Math.max(-1, Math.min(1, -Math.sin(t * 0.55) * 1.4));
    pos.set(x, 0, z);
    model.root.position.copy(pos);
    model.root.rotation.set(0, -Math.atan2(dx, speed), -steer * 0.35, 'YXZ');
    model.update(dt, t, {
      ...viewState(racer.base.topSpeed, t), speed, boosting, steer, heat: boosting ? 0.6 : 0.15, groundColor: GROUND,
    });
    fwd.set(0, 0, -1).applyQuaternion(model.root.quaternion);

    if (boosting && !wasBoost) effects.boostBurst(pos, fwd, racer.visual.glow);
    wasBoost = boosting;
    vel.copy(fwd).multiplyScalar(speed);
    effects.dust(pos, vel, Math.min(1, speed / racer.base.topSpeed), GROUND);
    if (state === 'race' && phase > 2.4 && phase < 3.0) {
      tmp.copy(pos).add(dir.set(2.5, 0, 0));
      dir.set(-0.4, 0, 1);
      effects.sparks(tmp, dir.normalize(), 0.8);
    }
    if (cycle !== lastCycle) {
      lastCycle = cycle;
      if (cycle % 2 === 1) effects.explosion(tmp.set(-14, 2, z - 90), dir.set(0, 0, 0), 0xff8a2a);
    }
    if (state === 'race' && Math.abs(phase - 4.2) < dt / 2) effects.landing(pos, 0.9);

    // Mirrors the game's chase camera (cameraTuning.ts) so judgements here carry over.
    const groundY = -SKIMMER_RIDE_HEIGHT;
    const frac = Math.min(1, speed / racer.base.topSpeed);
    camera.position.set(x * 0.8, groundY + 3.2, z + 8.5 + 3.5 * frac + (boosting ? 3 : 0));
    look.set(x, groundY + 1.2, z - 22);
    camera.fov = (66 + 18 * frac + (boosting ? 10 : 0)) * (camera.aspect < 1 ? 1.3 : 1);
    camera.updateProjectionMatrix();
    camera.lookAt(look);
    ground.position.set(Math.round(camera.position.x / TILE) * TILE, -SKIMMER_RIDE_HEIGHT, Math.round(camera.position.z / TILE) * TILE);
    for (let i = 0; i < ROCKS; i++) {
      const rz = camera.position.z - 40 - (((rockZ[i] - camera.position.z) % ROCK_SPAN) + ROCK_SPAN) % ROCK_SPAN;
      rocks.setMatrixAt(i, m.makeTranslation(rockX[i], 4.5 - SKIMMER_RIDE_HEIGHT, rz));
    }
    rocks.instanceMatrix.needsUpdate = true;
    lines.update(dt, Math.max(0, Math.min(1, (speed / racer.base.topSpeed - 0.45) * 1.6)) + (boosting ? 0.35 : 0));
    effects.update(dt, camera);
    renderer.render(scene, camera);
  };
}

// --- Showroom: the garage scene, click to cycle racers --------------------------------------
function showroom(): (dt: number, t: number) => void {
  const room = new Showroom(renderer);
  room.show(RACERS[racerIndex].visual);
  renderer.domElement.addEventListener('click', () => {
    racerIndex = (racerIndex + 1) % RACERS.length;
    room.show(RACERS[racerIndex].visual);
  });
  window.addEventListener('resize', () => room.resize(window.innerWidth, window.innerHeight));
  return (dt, t) => room.render(dt, t);
}

// --- Stats: draw calls and triangles per style and detail -----------------------------------
function stats(): (dt: number, t: number) => void {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 4, 18);
  camera.lookAt(0, 0, 0);
  const rows: Record<string, { calls: number; triangles: number }> = {};
  renderer.info.autoReset = false;
  for (const detail of ['high', 'low'] as const) {
    for (const r of RACERS) {
      const scene = new THREE.Scene();
      addLights(scene);
      const model = createRacerModel(r.visual, { detail });
      scene.add(model.root);
      // Damage on so the smoke pool is live, as in the worst case.
      const v = viewState(r.base.topSpeed, 1);
      for (let i = 0; i < 30; i++) model.update(1 / 60, i / 60, { ...v, damage: 0.9 });
      renderer.info.reset();
      renderer.render(scene, camera);
      rows[`${r.visual.style}/${detail}`] = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
      model.dispose();
    }
  }
  console.log('RACER_STATS', JSON.stringify(rows));
  (window as unknown as { racerStats: typeof rows }).racerStats = rows;
  renderer.info.autoReset = true;
  return () => undefined;
}

buildBar();
const tick = { lineup, chase, showroom, stats }[mode]();
const clock = new THREE.Timer();
renderer.setAnimationLoop((now) => {
  clock.update(now);
  const dt = Math.min(0.05, clock.getDelta());
  tick(dt, clock.getElapsed());
});
window.addEventListener('resize', () => renderer.setSize(window.innerWidth, window.innerHeight));
