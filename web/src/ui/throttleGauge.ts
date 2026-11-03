// The throttle gauge: a slim bar with the boost, drive and brake zones and a thumb marker, the
// held zone lit, the boost zone hollow while the tank is dry, and a tick on each change where
// the browser can vibrate. Drawn by the throttle pad and by the one-thumb control; each places
// it beside its own finger.
import type { SwipeThresholds, ThrottleState } from './throttleSwipe.ts';
import { h } from './kit.ts';

/**
 * One short buzz per state change: long enough to feel through a case, short enough to read as
 * a detent rather than an alert. iOS Safari has no navigator.vibrate; there the light is all.
 */
const STATE_TICK_MS = 12;

export interface ThrottleGauge {
  el: HTMLElement;
  /** Lays the zones out for these thresholds (px). */
  size(t: SwipeThresholds): void;
  /** Lights a state; buzzes and returns true when it changed. */
  show(state: ThrottleState): boolean;
  /** The thumb marker's offset from the anchor, px, positive down. */
  placeThumb(offset: number): void;
  showTankEmpty(empty: boolean): void;
}

export function createThrottleGauge(): ThrottleGauge {
  const thumb = h('div', 'tp-thumb');
  const el = h(
    'div',
    'tp-gauge',
    h('span', 'tp-label tp-label--boost', 'BOOST'),
    h('div', 'tp-seg tp-seg--boost'),
    h('div', 'tp-seg tp-seg--drive'),
    h('div', 'tp-seg tp-seg--brake'),
    h('span', 'tp-label tp-label--brake', 'BRAKE'),
    thumb,
  );
  const canVibrate = typeof navigator.vibrate === 'function';
  let shown: ThrottleState = 'drive';
  el.dataset.state = shown;
  return {
    el,
    size(t) {
      el.style.setProperty('--tp-enter', `${t.enter}px`);
      el.style.setProperty('--tp-reach', `${t.reach}px`);
    },
    show(state) {
      if (state === shown) return false;
      shown = state;
      el.dataset.state = state;
      if (canVibrate) navigator.vibrate(STATE_TICK_MS);
      return true;
    },
    placeThumb(offset) {
      thumb.style.transform = `translate3d(0, ${offset}px, 0)`;
    },
    showTankEmpty: (empty) => el.classList.toggle('is-tank-empty', empty),
  };
}
