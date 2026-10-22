// The race HUD. update() runs every frame, so it only writes when a shown value changes, and
// bars move by transform (no layout). Escape/P also pause, since the HUD owns the pause action.
import './race.css';
import type { Hud, HudView } from '../game/types.ts';
import { formatTime, h } from './kit.ts';

/** Heat above this blinks the bar as a warning. */
const HEAT_WARN = 0.8;
/** Hull damage above this turns the bar red. */
const DAMAGE_WARN = 0.65;
/** How long "GO!" lingers after the countdown ends, ms. */
const GO_LINGER_MS = 700;
const FLASH_MS = 1400;
const COUNT_POP_MS = 350;

const PAUSE_KEYS = new Set(['Escape', 'KeyP']);

/** Writes only on change: the per-frame cost is a compare unless something moved. */
function textSlot(el: HTMLElement): (v: string) => void {
  let last = '';
  return (v) => {
    if (v === last) return;
    last = v;
    el.textContent = v;
  };
}

function classSlot(el: HTMLElement, cls: string): (on: boolean) => void {
  let last = false;
  return (on) => {
    if (on === last) return;
    last = on;
    el.classList.toggle(cls, on);
  };
}

/** Bar fill quantised to 0.5% so tiny float jitter doesn't touch the style every frame. */
function barSlot(fill: HTMLElement): (v01: number) => void {
  let last = -1;
  return (v) => {
    const q = Math.round(Math.max(0, Math.min(1, v)) * 200);
    if (q === last) return;
    last = q;
    fill.style.transform = `scaleX(${q / 200})`;
  };
}

function bar(label: string, cls: string): { el: HTMLElement; fill: HTMLElement; text: HTMLElement } {
  const fill = h('div', 'hb__fill');
  const text = h('span', 'hb__text', label);
  return { el: h('div', `hb ${cls}`, text, h('div', 'hb__track', fill)), fill, text };
}

export function createHud(root: HTMLElement, onPause: () => void): Hud {
  const placeNum = h('span', 'hud__place-n');
  const placeOf = h('span', 'hud__place-of');
  const lapEl = h('span', 'hud__lap');
  const timeEl = h('span', 'hud__time');
  const bestEl = h('span', 'hud__best');
  const speedEl = h('span', 'hud__speed-n');
  const heat = bar('HEAT', 'hb--heat');
  const hull = bar('HULL', 'hb--hull');
  const countEl = h('div', 'hud__count');
  const flashEl = h('div', 'hud__flash');

  const pause = h('button', 'hud__pause');
  pause.type = 'button';
  pause.id = 'hud_pause_button';
  pause.setAttribute('aria-label', 'Pause');
  pause.append(h('span', 'hud__pause-bars'));
  pause.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onPause();
  });
  const onKey = (e: KeyboardEvent) => {
    if (!PAUSE_KEYS.has(e.code)) return;
    e.preventDefault();
    onPause();
  };
  window.addEventListener('keydown', onKey);

  const el = h(
    'div',
    'race-ui hud',
    h('div', 'hud__tl', h('div', 'hud__place', placeNum, placeOf), h('div', 'hud__meta', lapEl, timeEl, bestEl)),
    pause,
    countEl,
    flashEl,
    h('div', 'hud__bottom', h('div', 'hud__speed', speedEl, h('span', 'hud__speed-u', 'KM/H')), h('div', 'hud__bars', heat.el, hull.el)),
  );
  root.append(el);

  const setPlace = textSlot(placeNum);
  const setPlaceOf = textSlot(placeOf);
  const setLap = textSlot(lapEl);
  const setTime = textSlot(timeEl);
  const setBest = textSlot(bestEl);
  const setSpeed = textSlot(speedEl);
  const setHeatText = textSlot(heat.text);
  const setHeat = barSlot(heat.fill);
  const setHull = barSlot(hull.fill);
  const heatWarn = classSlot(heat.el, 'is-warn');
  const heatOver = classSlot(heat.el, 'is-over');
  const boosting = classSlot(el, 'is-boosting');
  const hullWarn = classSlot(hull.el, 'is-warn');
  const finished = classSlot(el, 'is-finished');
  const setCount = textSlot(countEl);
  const countOn = classSlot(countEl, 'is-on');

  let lastCount: number | null = null;
  let goUntil = 0;

  return {
    update(v: HudView): void {
      setPlace(String(v.place));
      setPlaceOf(`/${v.racers}`);
      setLap(`LAP ${Math.min(v.lap, v.laps)}/${v.laps}`);
      setTime(formatTime(v.time));
      setBest(v.bestLap === null ? '' : `BEST ${formatTime(v.bestLap)}`);
      setSpeed(String(Math.round(v.speedKmh)));
      setHeat(v.heat);
      heatWarn(!v.overheated && v.heat >= HEAT_WARN);
      heatOver(v.overheated);
      setHeatText(v.overheated ? 'OVERHEAT' : 'HEAT');
      setHull(1 - v.damage);
      hullWarn(v.damage >= DAMAGE_WARN);
      boosting(v.boosting);
      finished(v.finished);

      const now = performance.now();
      if (v.countdown !== lastCount) {
        if (v.countdown !== null) {
          setCount(v.countdown === 0 ? 'GO!' : String(v.countdown));
          countEl.classList.toggle('is-go', v.countdown === 0);
          countEl.animate([{ transform: 'scale(1.8)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: COUNT_POP_MS, easing: 'cubic-bezier(.2,1.4,.4,1)' });
          if (v.countdown === 0) goUntil = now + GO_LINGER_MS;
        } else if (lastCount === 0) {
          goUntil = Math.max(goUntil, now + GO_LINGER_MS);
        }
        lastCount = v.countdown;
      }
      countOn(v.countdown !== null || now < goUntil);
    },
    flash(message: string): void {
      flashEl.textContent = message;
      flashEl.animate(
        [
          { opacity: 0, transform: 'translate(-50%, 0) scale(1.4)' },
          { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.12 },
          { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.8 },
          { opacity: 0, transform: 'translate(-50%, -12px) scale(1)' },
        ],
        { duration: FLASH_MS, easing: 'ease-out' },
      );
    },
    dispose(): void {
      window.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
