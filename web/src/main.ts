// Boot: one full-screen WebGL canvas shared by the race and the garage showroom, with the
// DOM menus layered on top.
import './main.css';
import * as THREE from 'three';
import { GameAudio } from './audio/audio.ts';
import { graphicsLevel } from './game/graphics.ts';
import { RaceSession } from './game/raceSession.ts';
import { loadSettings } from './game/save.ts';
import type { RaceLauncher, ShowroomApi } from './game/types.ts';
import { enableOffline } from './offline.ts';
import { runBenchmark } from './render/benchmark.ts';
import { gpuName, pixelRatioFor } from './render/graphics.ts';
import { Showroom } from './render/showroom.ts';
import { startApp } from './ui/app.ts';

/** Longest frame the showroom animates by; a longer stall (tab switch) is clipped. The race clips its own. */
const SHOWROOM_MAX_FRAME_DT = 0.1;

const root = document.getElementById('app');
if (!root) throw new Error('index.html: #app missing');

const canvas = document.createElement('canvas');
canvas.id = 'game-canvas';
document.body.prepend(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;

/** The graphics level's render scale, read when a race or the garage starts so a change in Settings lands there. */
function applyPixelRatio() {
  const ratio = pixelRatioFor(graphicsLevel(loadSettings(window.localStorage)), window.devicePixelRatio);
  if (ratio === renderer.getPixelRatio()) return;
  renderer.setPixelRatio(ratio);
  resize();
}

const audio = new GameAudio();
const showroom = new Showroom(renderer);
let session: RaceSession | null = null;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  showroom.resize(w, h);
  session?.resize(w, h);
}
window.addEventListener('resize', resize);
applyPixelRatio();
resize();

const launchRace: RaceLauncher = (req, onDone) => {
  showroom.hide();
  applyPixelRatio();
  session = new RaceSession(
    { renderer, uiRoot: root, audio, settings: loadSettings(window.localStorage), store: window.localStorage },
    req,
    (outcome, perf) => {
      session = null;
      renderer.clear();
      onDone(outcome, perf);
    },
  );
};

const showroomApi: ShowroomApi = {
  show: (visual) => {
    applyPixelRatio();
    showroom.show(visual);
  },
  hide: () => showroom.hide(),
};

enableOffline();

const graphicsDeps = { gpu: gpuName(renderer.getContext()), benchmark: runBenchmark };
const devTrack = new URLSearchParams(location.search).get('devtrack');
if (devTrack === null) startApp({ root, launchRace, showroom: showroomApi, audio, store: window.localStorage, graphics: graphicsDeps, start: { screen: 'title' } });
else {
  // `?devtrack=<id>` (the debug menu's DEV TRACKS) opens Quick Race on a synthetic track (ui/devTracks.ts), with
  // a career of its own so test races never pay into the real save.
  const devStore = {
    getItem: (key: string) => window.localStorage.getItem(`devtrack:${key}`),
    setItem: (key: string, value: string) => window.localStorage.setItem(`devtrack:${key}`, value),
  };
  void import('./ui/devTracks.ts').then(({ loadDevTrack }) => {
    const worldId = loadDevTrack(devTrack);
    startApp({ root, launchRace, showroom: showroomApi, audio, store: devStore, graphics: graphicsDeps, start: { screen: 'quick', worldId, trackId: devTrack } });
  });
}

// Dev builds expose the live session so browser automation can inspect it.
if (import.meta.env.DEV) Object.assign(window, { __session: () => session });

let last = performance.now();
let time = 0;
function loop(now: number) {
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(SHOWROOM_MAX_FRAME_DT, raw);
  time += dt;
  // The race gets the true frame time: it clips its own step, and its safety net must tell a
  // stall from a slow frame.
  if (session) session.frame(raw);
  else if (showroom.active) showroom.render(dt, time);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
