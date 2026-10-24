// The race HUD. update() runs every frame, so it only writes when a shown value changes, and
// bars move by transform (no layout). Escape/P also pause, since the HUD owns the pause action.
import './race.css';
import type { Hud, HudView, WreckInfo } from '../game/types.ts';
import { formatTime, h } from './kit.ts';
import { wreckCopy } from './wreckCopy.ts';

/** Tank at or above this reads as full (pulses); at or below the empty mark it dims. */
const BOOST_FULL = 0.995;
const BOOST_EMPTY = 0.01;
const PICKUP_PULSE_MS = 260;
/** Hull left below this reads as damaged (orange), and below the critical mark it flashes red. */
const HULL_LOW = 0.5;
const HULL_CRITICAL = 0.25;
const REPAIR_PULSE_MS = 420;
/** How long "GO!" lingers after the countdown ends, ms. */
const GO_LINGER_MS = 700;
const FLASH_MS = 1400;
const WRECK_SLAM_MS = 520;
const COUNT_POP_MS = 350;
/** The slipstream gauge shows from this draft up (and fades out below it). */
const DRAFT_SHOWN = 0.05;
/** At or above this draft the gauge glows: the wake is full. */
const DRAFT_GLOW = 0.9;

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

function bar(label: string, cls: string): { el: HTMLElement; fill: HTMLElement; track: HTMLElement } {
  const fill = h('div', 'hb__fill');
  const track = h('div', 'hb__track', fill, h('div', 'hb__segs'));
  return { el: h('div', `hb ${cls}`, h('span', 'hb__text', label), track), fill, track };
}

export function createHud(root: HTMLElement, onPause: () => void): Hud {
  const placeNum = h('span', 'hud__place-n');
  const placeOf = h('span', 'hud__place-of');
  const lapEl = h('span', 'hud__lap');
  const timeEl = h('span', 'hud__time');
  const bestEl = h('span', 'hud__best');
  const speedEl = h('span', 'hud__speed-n');
  const tank = bar('BOOST', 'hb--boost');
  const hull = bar('HULL', 'hb--hull');
  const critical = h('div', 'hud__critical', 'HULL CRITICAL');
  const slipFill = h('div', 'hud__slip-fill');
  const slip = h('div', 'hud__slip', h('span', 'hud__slip-text', 'SLIPSTREAM'), h('div', 'hud__slip-track', slipFill));
  const wreck = h('div', 'hud__wreck');
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
    wreck,
    h('div', 'hud__bottom', critical, slip, h('div', 'hud__speed', speedEl, h('span', 'hud__speed-u', 'KM/H')), h('div', 'hud__bars', tank.el, hull.el)),
  );
  root.append(el);

  const setPlace = textSlot(placeNum);
  const setPlaceOf = textSlot(placeOf);
  const setLap = textSlot(lapEl);
  const setTime = textSlot(timeEl);
  const setBest = textSlot(bestEl);
  const setSpeed = textSlot(speedEl);
  const setTank = barSlot(tank.fill);
  const setHull = barSlot(hull.fill);
  const tankFull = classSlot(tank.el, 'is-full');
  const tankEmpty = classSlot(tank.el, 'is-empty');
  const boosting = classSlot(el, 'is-boosting');
  const hullLow = classSlot(hull.el, 'is-low');
  const hullCritical = classSlot(el, 'is-critical');
  const finished = classSlot(el, 'is-finished');
  const setSlip = barSlot(slipFill);
  const slipOn = classSlot(slip, 'is-on');
  const slipFull = classSlot(slip, 'is-full');
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
      setTank(v.boost);
      tankFull(v.boost >= BOOST_FULL);
      tankEmpty(v.boost <= BOOST_EMPTY);
      const hullLeft = 1 - v.damage;
      setHull(hullLeft);
      hullLow(hullLeft < HULL_LOW);
      hullCritical(hullLeft < HULL_CRITICAL && hullLeft > 0);
      boosting(v.boosting);
      finished(v.finished);
      setSlip(v.draft);
      slipOn(v.draft >= DRAFT_SHOWN);
      slipFull(v.draft >= DRAFT_GLOW);

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
    pulseBoost(): void {
      tank.track.animate(
        [
          { transform: 'scale(1, 1)', filter: 'brightness(1)' },
          { transform: 'scale(1.06, 1.6)', filter: 'brightness(2)', offset: 0.3 },
          { transform: 'scale(1, 1)', filter: 'brightness(1)' },
        ],
        { duration: PICKUP_PULSE_MS, easing: 'ease-out' },
      );
    },
    pulseRepair(): void {
      hull.track.animate(
        [
          { transform: 'scale(1, 1)', filter: 'brightness(1)', boxShadow: '0 0 0 rgba(120, 255, 140, 0)' },
          { transform: 'scale(1.06, 1.6)', filter: 'brightness(1.8) hue-rotate(60deg)', boxShadow: '0 0 22px rgba(120, 255, 140, 0.95)', offset: 0.3 },
          { transform: 'scale(1, 1)', filter: 'brightness(1)', boxShadow: '0 0 0 rgba(120, 255, 140, 0)' },
        ],
        { duration: REPAIR_PULSE_MS, easing: 'ease-out' },
      );
    },
    wrecked(w: WreckInfo): void {
      const copy = wreckCopy(w);
      wreck.replaceChildren(h('div', 'hud__wreck-title', copy.title), h('div', 'hud__wreck-sub', copy.sub));
      el.classList.add('is-wrecked');
      wreck.animate(
        [
          { opacity: 0, transform: 'translateY(-50%) scale(2.2) rotate(-4deg)' },
          { opacity: 1, transform: 'translateY(-50%) scale(0.94) rotate(-4deg)', offset: 0.55 },
          { opacity: 1, transform: 'translateY(-50%) scale(1) rotate(-4deg)' },
        ],
        { duration: WRECK_SLAM_MS, easing: 'cubic-bezier(.2,1.2,.4,1)', fill: 'forwards' },
      );
    },
    dispose(): void {
      window.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
