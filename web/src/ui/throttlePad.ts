// The throttle pad: one finger in the right-hand thumb zone picks boost, drive or air brake by
// sliding (throttleSwipe.ts), so the throttle thumb never leaves the glass. A slim gauge appears
// under the finger with its three zones and a thumb marker, the held state lights, and a tick
// buzzes on each change where the browser can vibrate.
import { DESK_PX_PER_MM, TOUCH_PX_PER_MM, ThrottleSwipe, swipeThresholds, type ThrottleState } from './throttleSwipe.ts';
import { h } from './kit.ts';

/**
 * One short buzz per state change: long enough to feel through a case, short enough to read as
 * a detent rather than an alert. iOS Safari has no navigator.vibrate; there the light is all.
 */
const STATE_TICK_MS = 12;

export interface ThrottlePad {
  el: HTMLElement;
  state(): ThrottleState;
  /** The boost zone reads hollow while the tank is dry; the state still lights. */
  showTankEmpty(empty: boolean): void;
  release(): void;
}

export function createThrottlePad(): ThrottlePad {
  const zone = h('div', 'tp-zone');
  zone.id = 'race_throttle_pad';
  zone.setAttribute('role', 'slider');
  zone.setAttribute('aria-label', 'Throttle: slide up to boost, down to air-brake, centre or lift to drive');
  zone.setAttribute('aria-orientation', 'vertical');
  const thumb = h('div', 'tp-thumb');
  const gauge = h(
    'div',
    'tp-gauge',
    h('span', 'tp-label tp-label--boost', 'BOOST'),
    h('div', 'tp-seg tp-seg--boost'),
    h('div', 'tp-seg tp-seg--drive'),
    h('div', 'tp-seg tp-seg--brake'),
    h('span', 'tp-label tp-label--brake', 'BRAKE'),
    thumb,
  );
  zone.append(gauge);
  const canVibrate = typeof navigator.vibrate === 'function';

  let swipe: ThrottleSwipe | null = null;
  /** The finger on the pad, as 't<identifier>' for a touch or 'p<pointerId>' for a mouse or pen. */
  let fingerId: string | null = null;
  let zoneTop = 0;
  let zoneLeft = 0;
  let shown: ThrottleState = 'drive';

  function show(state: ThrottleState): void {
    if (state === shown) return;
    shown = state;
    gauge.dataset.state = state;
    zone.setAttribute('aria-valuetext', state);
    if (canVibrate) navigator.vibrate(STATE_TICK_MS);
  }
  function placeThumb(): void {
    if (swipe) thumb.style.transform = `translate3d(0, ${swipe.offset}px, 0)`;
  }

  function press(id: string, x: number, y: number, pxPerMm: number): boolean {
    if (fingerId !== null) return false;
    fingerId = id;
    // Thresholds per touch-down: a rotation since the last one changes the screen's height.
    const t = swipeThresholds(pxPerMm, window.innerHeight);
    swipe = new ThrottleSwipe(t);
    swipe.press(y);
    const r = zone.getBoundingClientRect();
    zoneTop = r.top;
    zoneLeft = r.left;
    gauge.style.setProperty('--tp-enter', `${t.enter}px`);
    gauge.style.setProperty('--tp-reach', `${t.reach}px`);
    gauge.style.left = `${x - zoneLeft}px`;
    gauge.style.top = `${y - zoneTop}px`;
    zone.classList.add('is-active');
    placeThumb();
    show('drive');
    return true;
  }
  function move(id: string, y: number): void {
    if (id !== fingerId || !swipe) return;
    const state = swipe.move(y);
    // The anchor trails an overshooting finger, and the gauge with it.
    gauge.style.top = `${swipe.anchor - zoneTop}px`;
    placeThumb();
    show(state);
  }
  function lift(id: string): void {
    if (id === fingerId) release();
  }
  function release(): void {
    fingerId = null;
    swipe?.lift();
    swipe = null;
    zone.classList.remove('is-active');
    // Back to the resting hint the stylesheet places.
    gauge.style.left = '';
    gauge.style.top = '';
    thumb.style.transform = '';
    show('drive');
  }

  // Fingers through touch events, as the slide steering does (input.ts): iOS holds a touch's
  // first pointer moves back until it passes its gesture slop, which would swallow the 5 mm.
  zone.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const t of e.changedTouches) if (press(`t${t.identifier}`, t.clientX, t.clientY, TOUCH_PX_PER_MM)) break;
    },
    { passive: false },
  );
  zone.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) move(`t${t.identifier}`, t.clientY);
    },
    { passive: false },
  );
  const touchEnd = (e: TouchEvent) => {
    for (const t of e.changedTouches) lift(`t${t.identifier}`);
  };
  zone.addEventListener('touchend', touchEnd);
  zone.addEventListener('touchcancel', touchEnd);

  zone.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    if (press(`p${e.pointerId}`, e.clientX, e.clientY, DESK_PX_PER_MM)) zone.setPointerCapture(e.pointerId);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') move(`p${e.pointerId}`, e.clientY);
  });
  const pointerEnd = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') lift(`p${e.pointerId}`);
  };
  zone.addEventListener('pointerup', pointerEnd);
  zone.addEventListener('pointercancel', pointerEnd);
  zone.addEventListener('lostpointercapture', pointerEnd);

  gauge.dataset.state = shown;
  // The resting hint is drawn at a phone's size until the first touch-down sizes it for real.
  const rest = swipeThresholds(TOUCH_PX_PER_MM, window.innerHeight);
  gauge.style.setProperty('--tp-enter', `${rest.enter}px`);
  gauge.style.setProperty('--tp-reach', `${rest.reach}px`);
  return {
    el: zone,
    state: () => swipe?.state ?? 'drive',
    showTankEmpty: (empty) => gauge.classList.toggle('is-tank-empty', empty),
    release,
  };
}
