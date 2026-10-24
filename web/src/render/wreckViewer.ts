// mode=wreck of the racer viewer: a skimmer races in and wrecks, looping every kind of wreck for
// every style. URL parameters (besides racer-viewer's):
//   racer=index in RACERS (default: cycle all)   kind=impact|fall|explode (default: cycle all)
//   scale=1|0.25 (time scale: slow motion)   t=<s> fast-forwards to t real seconds after the
//   crash, pause=1 then freezes there (for screenshots)
import * as THREE from 'three';
import { RACERS } from '../data/racers.ts';
import { createRacerModel, type RacerModel } from './racerModel.ts';
import type { WreckKind } from './racerWreck.ts';
import { Effects } from './effects.ts';
import { SKIMMER_RIDE_HEIGHT } from './skimmerTuning.ts';

const KINDS: WreckKind[] = ['impact', 'explode', 'fall'];
/** Sim seconds of approach before the crash, and of wreck after it. */
const APPROACH = 0.7;
const HOLD = 5.5;
const SPEED = 120;
/** Fixed step used to fast-forward to a requested moment. */
const STEP = 1 / 60;
const CAMERA_OFFSET = new THREE.Vector3(-20, 7, -14);
const CAMERA_TARGET = new THREE.Vector3(0, 0, -22);
const ORBIT_RATE = 0.05;

export function wreckMode(renderer: THREE.WebGLRenderer, params: URLSearchParams, sky: number, groundColor: number): (dt: number) => void {
  const fixedRacer = params.has('racer') ? Number(params.get('racer')) % RACERS.length : null;
  const fixedKind = params.get('kind') as WreckKind | null;
  if (fixedKind !== null && !KINDS.includes(fixedKind)) throw new Error(`Unknown wreck kind "${fixedKind}"`);
  const scale = Number(params.get('scale') ?? '1');
  if (!(scale > 0)) throw new Error(`Bad time scale "${params.get('scale')}"`);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 90, 420);
  scene.add(new THREE.HemisphereLight(0xffe8d0, 0x6a4a34, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(-40, 60, -30);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshLambertMaterial({ color: groundColor }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // Lane markers give the skid distance a scale.
  const markers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.05, 3), new THREE.MeshLambertMaterial({ color: 0xf2efe8 }), 40);
  for (let i = 0; i < 40; i++) markers.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i % 2 ? 6 : -6, 0.03 - SKIMMER_RIDE_HEIGHT, 40 - (i >> 1) * 8));
  scene.add(markers);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.3, 900);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
  const effects = new Effects(scene, 'high');
  const models: RacerModel[] = RACERS.map((r) => {
    const m = createRacerModel(r.visual, { detail: 'high' });
    m.root.visible = false;
    scene.add(m.root);
    return m;
  });
  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;right:6px;top:6px;color:#fff;font:11px monospace;background:#0008;padding:3px 6px;border-radius:4px';
  document.body.appendChild(label);

  const vel = new THREE.Vector3(0, 0, -SPEED);
  const look = new THREE.Vector3();
  let loop = -1;
  let model = models[0];
  let kind: WreckKind = 'impact';
  let simT = 0;
  let crashed = false;
  let wall = 0;

  const startLoop = (n: number) => {
    loop = n;
    model.root.visible = false;
    const racer = fixedRacer ?? Math.floor(n / KINDS.length) % RACERS.length;
    kind = fixedKind ?? KINDS[n % KINDS.length];
    model = models[racer];
    model.reset();
    model.root.visible = true;
    model.root.position.set(0, 0, APPROACH * SPEED);
    model.root.rotation.set(0, 0, 0);
    crashed = false;
    // A fall goes over an edge: the ground stops at the crash point.
    ground.scale.set(1, kind === 'fall' ? 0.5 : 1, 1);
    ground.position.set(0, -SKIMMER_RIDE_HEIGHT, kind === 'fall' ? 125 : 0);
    label.textContent = `${RACERS[racer].name} · ${kind} · ${scale}×`;
  };

  const step = (realDt: number) => {
    const dt = realDt * scale;
    simT += dt;
    const n = Math.floor(simT / (APPROACH + HOLD));
    if (n !== loop) startLoop(n);
    const local = simT - n * (APPROACH + HOLD);
    if (local < APPROACH) {
      model.root.position.z = (APPROACH - local) * SPEED;
      model.update(dt, simT, {
        speed: SPEED, topSpeed: SPEED, boosting: false, heat: 0.15, damage: 0.4, steer: 0.2,
        airborne: false, crashed: false, groundColor,
      });
    } else {
      if (!crashed) {
        crashed = true;
        model.root.position.z = 0;
        model.shatter(vel, { kind });
        if (kind !== 'fall') effects.wreck(model.root.position, vel, RACERS[models.indexOf(model)].visual.glow);
      }
      model.update(dt, simT, {
        speed: 0, topSpeed: SPEED, boosting: false, heat: 0, damage: 1, steer: 0, airborne: false, crashed: true,
      });
    }
    effects.update(dt, camera);
    wall += realDt;
    const a = wall * ORBIT_RATE;
    camera.position.copy(CAMERA_OFFSET).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a);
    camera.lookAt(look.copy(CAMERA_TARGET));
  };

  // Fast-forward for screenshots: run to `t` real seconds after the first crash.
  const t = params.get('t');
  let paused = false;
  if (t !== null) {
    const target = APPROACH / scale + Number(t);
    for (let s = 0; s < target; s += STEP) step(STEP);
    paused = params.get('pause') === '1';
  }
  return (dt) => {
    if (!paused) step(dt);
    renderer.render(scene, camera);
  };
}
