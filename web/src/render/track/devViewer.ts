import * as THREE from 'three';
import '../../ui/styles.css';
import './viewer/viewer.css';
import { TRACKS, trackById } from '../../data/tracks/index.ts';
import type { TrackDef } from '../../core/types.ts';
import { LOOK_FLAGS_ON, type LookFlags } from '../look/look.ts';
import { isGraphicsLevel } from '../graphics.ts';
import { GRAPHICS_LEVELS, type GraphicsLevel } from '../graphicsTuning.ts';
import { h, toast } from '../../ui/kit.ts';
import { CameraRig, isViewMode, VIEW_MODES, type ViewMode } from './viewer/cameraRig.ts';
import { flyPad } from './viewer/flyPad.ts';
import { MiniMap } from './viewer/miniMap.ts';
import { buildUi, type DisplaySettings, type RaceClock, type ViewerApi, type ViewerState } from './viewer/panel.ts';
import { trackHazards, trackSpots, triggerTime, type ViewerHazard } from './viewer/spots.ts';
import { Stage } from './viewer/stage.ts';
import type { FieldRacer } from './forceField.ts';

// The level viewer (track-viewer.html): every level, one at a time, to fly round, jump to its
// points of interest and fire its hazards. Opened from the hidden debug menu; works on a phone
// and on a desktop, and needs no save. Tools and agents drive it by URL and window.viewer:
// ?track=id&level=low|medium|high|ultra&s=metres&x=metres&branch=n&speed=m/s&view=fly|orbit|top|free
// &pause=1&look=0|1&off=bloom,wet&aa=level|fxaa|msaa|off&time=seconds (pins the race clock)
// &ui=0 (start with the UI hidden) &panel=0 (start with the panel closed)
// (look: the world's look pass as a race draws it, every effect on; 0 draws it without. off and aa
// switch single effects as the debug menu's WORLD LOOK switches do).

const params = new URLSearchParams(location.search);
// quality= is the name from before graphics levels; its low|high are levels too.
const levelParam = params.get('level') ?? params.get('quality') ?? 'high';
if (!isGraphicsLevel(levelParam)) throw new Error(`level viewer: level=${levelParam} is not ${GRAPHICS_LEVELS.join(', ')}`);
const viewParam = params.get('view') ?? 'fly';
if (!isViewMode(viewParam)) throw new Error(`level viewer: view=${viewParam} is not ${VIEW_MODES.join(', ')}`);
const lookFlags: LookFlags = { ...LOOK_FLAGS_ON, world: params.get('look') !== '0' };
for (const k of (params.get('off') ?? '').split(',').filter((x) => x)) {
  if (!(k in lookFlags) || k === 'aa') throw new Error(`level viewer: unknown look switch "${k}" in off=`);
  lookFlags[k as Exclude<keyof LookFlags, 'aa'>] = false;
}
const aa = params.get('aa');
if (aa !== null) {
  if (aa !== 'level' && aa !== 'fxaa' && aa !== 'msaa' && aa !== 'off') throw new Error(`level viewer: aa=${aa} is not level, fxaa, msaa or off`);
  lookFlags.aa = aa;
}

/** Speed and lateral steps of the arrow keys (m/s, m). */
const KEY_SPEED_STEP = 25;
const KEY_LATERAL_STEP = 2;
/** Orbit yaw step of the A and D keys, radians. */
const KEY_YAW_STEP = 0.1;
/** Readouts, stats and the map refresh every this many frames: often enough to read, cheap. */
const READOUT_EVERY = 10;
/** fps readout smoothing per frame. */
const FPS_EASE = 0.05;
/** Longest frame step the camera and clock take (s), so a stall or tab switch does not teleport them. */
const MAX_DT = 0.1;
const KMH_PER_MS = 3.6;
/** Jumping to a spot in chase view stops this far before it (m), so the spot is in front. */
const GO_APPROACH = 40;

const stage = new Stage(document.body);
const display: DisplaySettings = { level: levelParam, look: lookFlags.world, stats: true, map: true };
const state: ViewerState = {
  branch: Number(params.get('branch') ?? -1),
  s: Number(params.get('s') ?? 0),
  speed: Number(params.get('speed') ?? 150),
  paused: params.get('pause') === '1',
  lateral: Number(params.get('x') ?? 0),
};
const timeParam = params.get('time');
const clock: RaceClock = { time: timeParam === null ? 0 : Number(timeParam), paused: timeParam !== null, rate: 1 };
const rig = new CameraRig(stage.camera, viewParam);

const ribbon = () => stage.track.ribbon(state.branch);
const stats = h('div', 'vw-stats');
const map = new MiniMap((hit) => api.goTo(hit.branch, hit.s));
const fly = flyPad(rig.stick);
const building = h('div', 'vw-building');
building.hidden = true;
const note = toast();
note.el.classList.add('vw-toast');
const showUi = h('button', 'vw-show');
showUi.id = 'viewer_showui_button';
showUi.setAttribute('aria-label', 'Show the controls');
showUi.hidden = true;

function build(def: TrackDef): void {
  stage.build(def, { level: display.level, look: { ...lookFlags, world: display.look } });
  state.s = ribbon().wrap(state.s);
  map.setTrack(stage.track);
}

/** Rebuilds after the "building" note has painted: a big track takes a moment on a phone. */
function rebuild(def: TrackDef): Promise<void> {
  building.textContent = `BUILDING ${def.name.toUpperCase()}…`;
  building.hidden = false;
  return new Promise((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        build(def);
        ui.setTrack();
        building.hidden = true;
        syncUrl();
        resolve();
      }),
    ),
  );
}

/** Keeps the address on what is shown, so a reload or a shared link opens the same level. */
function syncUrl(): void {
  params.set('track', stage.track.def.id);
  params.delete('quality');
  params.set('level', display.level);
  params.set('look', display.look ? '1' : '0');
  history.replaceState(null, '', `?${params.toString()}`);
}

let uiHidden = params.get('ui') === '0';

const api: ViewerApi = {
  state,
  clock,
  display,
  track: () => stage.track,
  ribbon,
  view: () => rig.view,
  setView: (v) => rig.setView(v),
  loadTrack: (id) => {
    state.branch = -1;
    state.s = 0;
    state.lateral = 0;
    void rebuild(trackById(id));
  },
  setBranch: (b) => {
    state.branch = b;
    state.s = ribbon().wrap(state.s);
  },
  goTo: (branch, s) => {
    state.branch = branch;
    if (rig.view === 'free') rig.setView('orbit');
    state.s = ribbon().wrap(s - (rig.view === 'fly' ? GO_APPROACH : 0));
    state.paused = true;
  },
  trigger: (hz: ViewerHazard) => {
    clock.time = triggerTime(hz.hazard, clock.time);
    clock.paused = false;
  },
  setLevel: (level: GraphicsLevel) => {
    display.level = level;
    void rebuild(stage.track.def);
  },
  setLook: (on) => {
    display.look = on;
    void rebuild(stage.track.def);
  },
  setStats: (on) => {
    display.stats = on;
    stats.hidden = !on;
  },
  setMap: (on) => {
    display.map = on;
    map.el.hidden = !on;
  },
  setUiHidden: (hidden) => {
    uiHidden = hidden;
    ui.root.hidden = hidden;
    showUi.hidden = !hidden;
    if (hidden) note.say('Tap the top-right corner to bring the controls back', true);
    measureInset();
  },
  setPanelOpen: (open) => {
    ui.setPanelOpen(open);
    measureInset();
  },
};

const firstTrack = params.get('track') ?? TRACKS[0].id;
// The synthetic scenes (ui/devTracks.ts: the sim's sprint, look-dev tracks) are registered
// first and listed in the picker after the worlds.
const devTracks: TrackDef[] = [];
const dev = await import('../../ui/devTracks.ts');
for (const d of dev.DEV_TRACKS) {
  dev.loadDevTrack(d.id);
  devTracks.push(trackById(d.id));
}
build(trackById(firstTrack));
const ui = buildUi(api, [stats, map.el, fly], devTracks);
document.body.append(ui.root, building, showUi, note.el);
ui.setTrack();
showUi.addEventListener('click', () => api.setUiHidden(false));
rig.attach(stage.renderer.domElement);
rig.onViewChange = (v) => (fly.hidden = v !== 'free');
fly.hidden = rig.view !== 'free';
api.setUiHidden(uiHidden);
ui.setPanelOpen(params.get('panel') !== '0');
// iOS ignores user-scalable=no: block its pinch-zoom gesture so a pinch only zooms the camera.
document.addEventListener('gesturestart', (e) => e.preventDefault());

/**
 * Where the panel sits (bottom in portrait, right in landscape) and how much it covers: the
 * view centres on the clear part, and overlays keep out of the panel's way.
 */
function measureInset(): void {
  const r = ui.panel.getBoundingClientRect();
  const open = !uiHidden && !ui.panel.hidden && r.width > 0 && r.height > 0;
  const atBottom = r.width >= window.innerWidth - 1;
  const right = open && !atBottom ? window.innerWidth - r.left : 0;
  const bottom = open && atBottom ? window.innerHeight - r.top : 0;
  stage.setInset(right, bottom);
  document.documentElement.style.setProperty('--inset-r', `${right}px`);
  document.documentElement.style.setProperty('--inset-b', `${bottom}px`);
}
new ResizeObserver(measureInset).observe(ui.panel);
window.addEventListener('resize', () => {
  stage.resize();
  measureInset();
});
measureInset();

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === ' ') state.paused = !state.paused;
  if (e.key === 'f') rig.setView('fly');
  if (e.key === 'o') rig.setView('orbit');
  if (e.key === 't') rig.setView('top');
  if (e.key === 'v') rig.setView('free');
  if (e.key === 'h') api.setUiHidden(!uiHidden);
  if (e.key === 'ArrowUp') state.speed += KEY_SPEED_STEP;
  if (e.key === 'ArrowDown') state.speed = Math.max(0, state.speed - KEY_SPEED_STEP);
  if (e.key === 'ArrowLeft') state.lateral -= KEY_LATERAL_STEP;
  if (e.key === 'ArrowRight') state.lateral += KEY_LATERAL_STEP;
  if (rig.view !== 'free' && e.key === 'a') rig.orbit.yaw += KEY_YAW_STEP;
  if (rig.view !== 'free' && e.key === 'd') rig.orbit.yaw -= KEY_YAW_STEP;
});

function readouts(fps: number): void {
  const me = rig.view === 'free' ? stage.camera.position : ribbon().toWorld(state.s, state.lateral, 0);
  if (display.map) map.draw(me);
  ui.tick();
  if (!display.stats) return;
  const i = stage.renderer.info.render;
  const t = stage.track;
  stats.textContent =
    `${t.def.name} (${display.level})  ${t.length.toFixed(0)} m  build ${stage.buildMs.toFixed(0)} ms\n` +
    `s ${state.s.toFixed(0)}  ${(state.speed * KMH_PER_MS).toFixed(0)} km/h  view ${rig.view}  fps ${fps.toFixed(0)}\n` +
    `draw calls ${i.calls}  triangles ${(i.triangles / 1000).toFixed(1)}k  clock ${clock.time.toFixed(1)} s`;
}

let last = performance.now();
let fps = 60;
let frames = 0;
function frame(now: number) {
  // The first frame's timestamp can predate `last` (taken after the build): never step backwards.
  const dt = Math.max(0, Math.min(MAX_DT, (now - last) / 1000));
  last = now;
  fps += (1 / Math.max(1e-3, dt) - fps) * FPS_EASE;
  if (!state.paused) {
    state.s += state.speed * dt;
    const r = ribbon();
    // A shortcut ends: rejoin the main loop where it does.
    if (!r.closed && state.s >= r.length) {
      state.s = stage.track.branches[state.branch].exitS;
      state.branch = -1;
    }
    state.s = ribbon().wrap(state.s);
  }
  if (!clock.paused) clock.time += dt * clock.rate;
  rig.place(ribbon(), state.s, state.lateral, dt);
  stage.trackScene.update(clock.time, stage.camera.position);
  stage.draw(dt, ribbon(), state.s);
  if (frames++ % READOUT_EVERY === 0) readouts(fps);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/** Hooks for automated screenshots and agents. */
function totals() {
  let tris = 0;
  let meshes = 0;
  stage.trackScene.group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes++;
    const g = o.geometry;
    const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    tris += o instanceof THREE.InstancedMesh ? t * o.count : t;
  });
  return { meshes, tris };
}
const viewer = {
  set(next: { branch?: number; s?: number; view?: string; speed?: number; paused?: boolean; x?: number; yaw?: number; pitch?: number; dist?: number; time?: number; clockPaused?: boolean; clockRate?: number }) {
    // A time pins the race clock (hazard schedules) for screenshots, as it always has.
    if (next.time !== undefined) (clock.time = next.time), (clock.paused = true);
    if (next.clockPaused !== undefined) clock.paused = next.clockPaused;
    if (next.clockRate !== undefined) clock.rate = next.clockRate;
    if (next.branch !== undefined) state.branch = next.branch;
    if (next.s !== undefined) state.s = ribbon().wrap(next.s);
    if (next.view) {
      if (!isViewMode(next.view)) throw new Error(`viewer.set: view ${next.view} is not ${VIEW_MODES.join(', ')}`);
      rig.setView(next.view as ViewMode);
    }
    if (next.speed !== undefined) state.speed = next.speed;
    if (next.paused !== undefined) state.paused = next.paused;
    if (next.x !== undefined) state.lateral = next.x;
    if (next.yaw !== undefined) rig.orbit.yaw = next.yaw;
    if (next.pitch !== undefined) rig.orbit.pitch = next.pitch;
    if (next.dist !== undefined) rig.orbit.dist = next.dist;
    rig.place(ribbon(), state.s, state.lateral, 0);
    stage.trackScene.update(clock.time, stage.camera.position);
    stage.draw(0, ribbon(), state.s);
  },
  /** Builds another level in place (the old one is disposed first); resolves once it is drawn. */
  load: (id: string) => {
    state.branch = -1;
    state.s = 0;
    return rebuild(trackById(id));
  },
  /** Sets the race clock to just before the hazard with this id fires, and runs it. */
  trigger(id: string) {
    const hz = trackHazards(stage.track).find((x) => x.hazard.def.id === id);
    if (!hz) throw new Error(`viewer.trigger: no hazard "${id}" on ${stage.track.def.id}`);
    api.trigger(hz);
    return clock.time;
  },
  spots: () => trackSpots(stage.track),
  hazards: () => trackHazards(stage.track).map((x) => ({ id: x.hazard.def.id, type: x.hazard.def.type, branch: x.branch, s: x.s, landmark: x.landmark })),
  clock,
  collect: (branch: number, cell: number, item: 'boost' | 'repair' = 'boost') => stage.trackScene.collectCell(item, branch, cell),
  resetCells: () => stage.trackScene.resetCells(),
  auditGround: (maxRise = 0.5) => stage.trackScene.auditGround(maxRise),
  landmarks: () =>
    stage.trackScene.group.children
      .filter((o) => o.name.startsWith('landmark:'))
      .map((o) => {
        const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
        let meshes = 0;
        o.traverse((m) => {
          if (m instanceof THREE.Mesh || m instanceof THREE.Points || m instanceof THREE.LineSegments) meshes++;
        });
        return `${o.name} ${size.x.toFixed(0)}x${size.y.toFixed(0)}x${size.z.toFixed(0)} ${meshes} draws ${o.visible ? 'on' : 'off'}`;
      }),
  /**
   * What would draw from here, by mesh name (up to the first ':' or digit): meshes switched on and
   * in the camera's frustum, with their triangles (× instances). For finding where a frame's cost goes.
   */
  drawn: () => {
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(stage.camera.projectionMatrix, stage.camera.matrixWorldInverse));
    const out: Record<string, { draws: number; tris: number }> = {};
    stage.trackScene.group.traverseVisible((o) => {
      if (!(o instanceof THREE.Mesh) || (o.frustumCulled && !frustum.intersectsObject(o))) return;
      const g = o.geometry;
      const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const key = o.name.split(/[:\d]/)[0] || '(unnamed)';
      const e = (out[key] ??= { draws: 0, tris: 0 });
      e.draws++;
      e.tris += o instanceof THREE.InstancedMesh ? t * o.count : t;
    });
    return out;
  },
  /** Presses the sprint's force field (if the level has one) with stand-in racers, at race time `time`. */
  pressField: (racers: FieldRacer[], time: number) => {
    stage.trackScene.pressField(racers, time);
    stage.trackScene.update(time, stage.camera.position);
    stage.draw(0, ribbon(), state.s);
  },
  stats: () => ({ calls: stage.renderer.info.render.calls, triangles: stage.renderer.info.render.triangles, buildMs: stage.buildMs, length: stage.track.length, memory: { ...stage.renderer.info.memory }, ...totals() }),
  /** The level being shown: changes when another is loaded. */
  get track() {
    return stage.track;
  },
};
Object.assign(window, { viewer });
