// Dev-only entry (hud-viewer.html): the HUD fed with animated fake values and the live touch
// controls, with a readout of what input.read() returns. ?steer=drag|tilt|buttons picks the mode.
import type { HudView, SteeringMode } from '../game/types.ts';
import { createHud } from './hud.ts';
import { createInput } from './input.ts';
import { h } from './kit.ts';

const root = document.getElementById('app');
if (!root) throw new Error('hud-viewer: #app missing');
root.style.background = 'linear-gradient(180deg, #5b8fd0 0%, #f2c58c 52%, #d89a5a 53%, #8a5530 100%)';

const params = new URLSearchParams(location.search);
const steering = (params.get('steer') ?? 'drag') as SteeringMode;
if (!['drag', 'tilt', 'buttons'].includes(steering)) throw new Error(`hud-viewer: bad steer "${steering}"`);

const layer = h('div', 'race-layer');
layer.style.cssText = 'position:absolute;inset:0';
root.append(layer);
const readout = h('pre');
readout.style.cssText = 'position:absolute;left:50%;top:8px;transform:translateX(-50%);margin:0;padding:4px 8px;background:rgba(0,0,0,.5);color:#fff;font:12px monospace;z-index:30;pointer-events:none';
root.append(readout);

let paused = false;
const hud = createHud(layer, () => {
  paused = !paused;
  hud.flash(paused ? 'PAUSED' : 'GO');
});
const input = createInput(layer, { steering, sensitivity: 1, sound: false, quality: 'high' });

const COUNTDOWN_S = 4;
const LAP_S = 20;
const t0 = performance.now();
let lastLap = 1;
let simTime = 0;
let lastFrame = t0;

function frame(now: number): void {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (!paused) simTime += dt;
  const inp = input.read();
  const countdownLeft = COUNTDOWN_S - simTime;
  const racing = countdownLeft <= 0;
  const t = racing ? -countdownLeft : 0;
  const lap = 1 + Math.floor(t / LAP_S);
  if (lap !== lastLap && lap <= 3) hud.flash(lap === 3 ? 'FINAL LAP' : `LAP ${lap}`);
  lastLap = lap;
  const heat = racing ? (Math.sin(t * 0.6) * 0.5 + 0.5) * 1.05 : 0;
  const view: HudView = {
    speedKmh: racing ? 420 + Math.sin(t * 0.8) * 180 + (inp.boost ? 120 : 0) : 0,
    place: 1 + (Math.floor(t / 3) % 6),
    racers: 6,
    lap: Math.min(lap, 3),
    laps: 3,
    time: t,
    bestLap: lap > 1 ? 19.37 : null,
    heat: Math.min(1, heat),
    overheated: heat >= 1,
    damage: racing ? (t * 0.05) % 1 : 0,
    boosting: inp.boost,
    countdown: racing ? null : Math.max(0, Math.ceil(countdownLeft - 1)),
    finished: false,
  };
  hud.update(view);
  readout.textContent = `steer ${inp.steer.toFixed(2)}  boost ${inp.boost ? 'ON ' : 'off'}  brake ${inp.brake ? 'ON ' : 'off'}  mode ${steering}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
