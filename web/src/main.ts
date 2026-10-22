// Boot: one full-screen WebGL canvas shared by the race and the garage showroom, with the
// DOM menus layered on top.
import './main.css';
import * as THREE from 'three';
import { GameAudio } from './audio/audio.ts';
import { RaceSession } from './game/raceSession.ts';
import { loadSettings } from './game/save.ts';
import type { RaceLauncher } from './game/types.ts';
import { Showroom } from './render/showroom.ts';
import { startApp } from './ui/app.ts';

/** Device pixel ratio cap per quality; phones at 3× would burn fill-rate for little gain. */
const PIXEL_RATIO_CAP = { low: 1.25, high: 2 } as const;

const root = document.getElementById('app');
if (!root) throw new Error('index.html: #app missing');

const canvas = document.createElement('canvas');
canvas.id = 'game-canvas';
document.body.prepend(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

function applyPixelRatio() {
  const quality = loadSettings(window.localStorage).quality;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP[quality]));
}
applyPixelRatio();

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
resize();

const launchRace: RaceLauncher = (req, onDone) => {
  showroom.hide();
  applyPixelRatio();
  resize();
  session = new RaceSession(
    { renderer, uiRoot: root, audio, settings: loadSettings(window.localStorage) },
    req,
    (outcome) => {
      session = null;
      renderer.clear();
      onDone(outcome);
    },
  );
};

startApp({ root, launchRace, showroom, audio });

let last = performance.now();
let time = 0;
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  if (session) session.frame(dt);
  else if (showroom.active) showroom.render(dt, time);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
