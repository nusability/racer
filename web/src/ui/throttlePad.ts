// The throttle pad: one finger in the right-hand thumb zone picks boost, drive or air brake by
// sliding (throttleSwipe.ts), so the throttle thumb never leaves the glass. The throttle gauge
// (throttleGauge.ts) appears beside the finger.
import { createThrottleGauge } from './throttleGauge.ts';
import { DESK_PX_PER_MM, PAD_SWIPE_MM, TOUCH_PX_PER_MM, ThrottleSwipe, swipeThresholds, type ThrottleState } from './throttleSwipe.ts';
import { h } from './kit.ts';

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
  const g = createThrottleGauge();
  const gauge = g.el;
  zone.append(gauge);

  let swipe: ThrottleSwipe | null = null;
  /** The finger on the pad, as 't<identifier>' for a touch or 'p<pointerId>' for a mouse or pen. */
  let fingerId: string | null = null;
  let zoneTop = 0;
  let zoneLeft = 0;

  function show(state: ThrottleState): void {
    if (g.show(state)) zone.setAttribute('aria-valuetext', state);
  }
  function placeThumb(): void {
    if (swipe) g.placeThumb(swipe.offset);
  }

  function press(id: string, x: number, y: number, pxPerMm: number): boolean {
    if (fingerId !== null) return false;
    fingerId = id;
    // Thresholds per touch-down: a rotation since the last one changes the screen's height.
    const t = swipeThresholds(PAD_SWIPE_MM, pxPerMm, window.innerHeight);
    swipe = new ThrottleSwipe(t);
    swipe.press(y);
    const r = zone.getBoundingClientRect();
    zoneTop = r.top;
    zoneLeft = r.left;
    g.size(t);
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
    g.placeThumb(0);
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

  // The resting hint is drawn at a phone's size until the first touch-down sizes it for real.
  g.size(swipeThresholds(PAD_SWIPE_MM, TOUCH_PX_PER_MM, window.innerHeight));
  return {
    el: zone,
    state: () => swipe?.state ?? 'drive',
    showTankEmpty: g.showTankEmpty,
    release,
  };
}
