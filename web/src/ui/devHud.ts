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
// Stand-ins for what the session draws: a road strip with the craft, and the minimap slot.
const ROAD_HALF_WIDTH_M = 25;
/** Rate (m/s) a full steer command moves the target in this fake; the sim owns the real one. */
const FAKE_STEER_RATE_MPS = 40;
const road = h('div');
road.style.cssText = 'position:absolute;left:20%;right:20%;top:46%;height:6px;background:rgba(60,30,10,.5);border-radius:3px';
const craft = h('div');
craft.style.cssText = 'position:absolute;top:-9px;width:24px;height:24px;margin-left:-12px;border-radius:6px;background:#3cf2ff;box-shadow:0 0 12px #3cf2ff';
road.append(craft);
root.append(road);
const minimap = h('div');
minimap.style.cssText = 'position:absolute;right:max(14px,env(safe-area-inset-right));top:calc(max(10px,env(safe-area-inset-top)) + 60px);width:var(--mm);height:var(--mm);border:2px dashed rgba(255,255,255,.6);border-radius:10px;z-index:30;pointer-events:none';
minimap.style.setProperty('--mm', window.innerWidth > window.innerHeight ? '120px' : '96px');
root.append(minimap);
let craftX = 0;
const FAKE_TANK_S = 4;
const FAKE_CELL_EVERY_S = 2.5;
const FAKE_CELL_FILL = 0.25;
let tankFill = 0.5;
// Fake hull: wears down steadily, a repair cell arrives every few seconds, and with ?wreck=1
// the player is wrecked once the hull runs out.
const FAKE_WEAR_PER_S = 0.09;
const FAKE_REPAIR_EVERY_S = 5;
const FAKE_REPAIR = 0.2;
/** Fake slipstream: a wake ridden for part of every cycle, so the gauge fills, glows and fades. */
const FAKE_DRAFT_CYCLE_S = 6;
const wreckWhenEmpty = params.get('wreck') === '1';
let hullDamage = 0;
let wrecked = false;
let nudgeTotal = 0;
const readout = h('pre');
readout.style.cssText = 'position:absolute;left:50%;top:8px;transform:translateX(-50%);margin:0;padding:4px 8px;background:rgba(0,0,0,.5);color:#fff;font:12px monospace;z-index:30;pointer-events:none';
root.append(readout);

let paused = false;
const hud = createHud(layer, () => {
  paused = !paused;
  hud.flash(paused ? 'PAUSED' : 'GO');
});
const input = createInput(layer, { steering, sensitivity: 1 });

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
  if (t > dt && Math.floor(t / 7) !== Math.floor((t - dt) / 7)) hud.flash("SMUGGLER'S CUT");
  craftX = Math.max(-ROAD_HALF_WIDTH_M, Math.min(ROAD_HALF_WIDTH_M, craftX + inp.nudge + inp.steer * FAKE_STEER_RATE_MPS * dt));
  nudgeTotal += inp.nudge;
  craft.style.left = `${((craftX + ROAD_HALF_WIDTH_M) / (2 * ROAD_HALF_WIDTH_M)) * 100}%`;
  lastLap = lap;
  // Fake tank: boosting drains it, and a cell arrives every few seconds.
  if (racing && inp.boost) tankFill = Math.max(0, tankFill - dt / FAKE_TANK_S);
  if (racing && Math.floor(t / FAKE_CELL_EVERY_S) !== Math.floor((t - dt) / FAKE_CELL_EVERY_S)) {
    tankFill = Math.min(1, tankFill + FAKE_CELL_FILL);
    hud.pulseBoost();
  }
  if (racing && !wrecked) hullDamage = Math.min(1, hullDamage + FAKE_WEAR_PER_S * dt);
  if (racing && !wreckWhenEmpty && Math.floor(t / FAKE_REPAIR_EVERY_S) !== Math.floor((t - dt) / FAKE_REPAIR_EVERY_S)) {
    hullDamage = Math.max(0, hullDamage - FAKE_REPAIR);
    hud.pulseRepair();
  }
  if (wreckWhenEmpty && hullDamage >= 1 && !wrecked) {
    wrecked = true;
    hud.wrecked({ reason: 'obstacle', cause: 'a boulder' });
  }
  const view: HudView = {
    speedKmh: racing ? 420 + Math.sin(t * 0.8) * 180 + (inp.boost ? 120 : 0) : 0,
    place: 1 + (Math.floor(t / 3) % 6),
    racers: 6,
    stage: { kind: 'lap', n: Math.min(lap, 3), of: 3 },
    time: t,
    bestLap: lap > 1 ? 19.37 : null,
    boost: tankFill,
    damage: hullDamage,
    boosting: inp.boost && tankFill > 0,
    draft: racing ? Math.max(0, Math.sin((t / FAKE_DRAFT_CYCLE_S) * 2 * Math.PI)) : 0,
    countdown: racing ? null : Math.max(0, Math.ceil(countdownLeft - 1)),
    finished: false,
  };
  hud.update(view);
  readout.textContent = `x ${craftX.toFixed(1)}m  nudgeΣ ${nudgeTotal.toFixed(1)}m  steer ${inp.steer.toFixed(2)}  boost ${inp.boost ? 'ON ' : 'off'}  brake ${inp.brake ? 'ON ' : 'off'}  mode ${steering}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
