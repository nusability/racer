// The one-thumb control on screen: one finger anywhere steers and throttles (oneThumb.ts). The
// pause and time-trial restart buttons stand above this layer, so a touch there is theirs. Its
// gauge (thumbGauge.ts) is a glass pad centred where the finger landed, showing both axes.
import { stateTick } from './throttleGauge.ts';
import { createThumbGauge, type ThumbView } from './thumbGauge.ts';
import { ONE_THUMB_SWIPE_MM, OneThumb } from './oneThumb.ts';
import { DESK_PX_PER_MM, TOUCH_PX_PER_MM, swipeThresholds, type ThrottleState } from './throttleSwipe.ts';
import { fitPad, padSize, trail, type Box, type PadSize } from './thumbPad.ts';
import { h } from './kit.ts';

export interface OneThumbControl {
  el: HTMLElement;
  state(): ThrottleState;
  /** Sideways CSS px steered since the last call. */
  takeSteerPx(): number;
  showTankEmpty(empty: boolean): void;
  release(): void;
}

/**
 * `keepClear` finds the boxes the gauge stays clear of (the minimap, the speed and bars), read at
 * each touch-down since the HUD is laid out after the controls.
 */
export function createOneThumbControl(keepClear: () => readonly DOMRect[]): OneThumbControl {
  const zone = h('div', 'ot-zone');
  zone.id = 'race_onethumb_zone';
  zone.setAttribute('role', 'application');
  zone.setAttribute('aria-label', 'One-thumb controls: slide sideways to steer, up to boost, down to air-brake, centre or lift to drive');
  const gauge = createThumbGauge();
  zone.append(gauge.el);

  /** Touches and pointers report in different densities; the latest touch-down picks which. */
  let pxPerMm = TOUCH_PX_PER_MM;
  const thumb = new OneThumb(() => swipeThresholds(ONE_THUMB_SWIPE_MM, pxPerMm, window.innerHeight));
  // Laid out now, while the race loads, so the first touch-down does not draw the layers. Each
  // new finger lays it out again, which costs nothing unless a rotation changed the screen.
  let pad = padSize(thumb.thresholds);
  gauge.size(pad, thumb.thresholds);

  // Cached per new driving finger, so moves never read layout. All in the zone's own px.
  let drivenBy: string | null = null;
  let zoneBox = new DOMRect();
  let screen: Box = { left: 0, top: 0, right: 0, bottom: 0 };
  let clear: Box[] = [];
  /** -1: the hand is to the finger's right, so the free side is left; 1: the other way. */
  let away: -1 | 1 = -1;
  /** The pad's centre, and the finger, as last placed: a lift draws them once more, in drive. */
  let padX = 0;
  let padY = 0;
  let fingerX = 0;
  let fingerY = 0;
  let shown: ThrottleState = 'drive';
  let frame = 0;

  function paint(): void {
    frame = 0;
    // No cut comes nearer neutral than the throttle's enter, so the drive band shows whole.
    const fit = fitPad(box(padX, padY, pad), screen, clear, { x: padX, y: padY }, thumb.thresholds.enter);
    const view: ThumbView = {
      state: thumb.driver ? thumb.state : 'drive',
      dx: fingerX - padX,
      dy: fingerY - padY,
      box: relative(fit, padX, padY),
      away,
      roomAbove: fingerY - screen.top,
    };
    gauge.place(padX, padY);
    gauge.draw(view);
  }
  function schedule(): void {
    if (!frame) frame = requestAnimationFrame(paint);
  }
  function show(state: ThrottleState): void {
    if (state === shown) return;
    shown = state;
    stateTick();
    zone.setAttribute('aria-valuetext', state);
  }

  function render(): void {
    const f = thumb.driver;
    if (!f) {
      if (drivenBy !== null) {
        drivenBy = null;
        zone.classList.remove('is-active');
        schedule();
      }
      show('drive');
      return;
    }
    if (f.id !== drivenBy) {
      drivenBy = f.id;
      const r = zone.getBoundingClientRect();
      zoneBox = r;
      screen = { left: 0, top: 0, right: r.width, bottom: r.height };
      clear = keepClear()
        .filter((b) => b.width > 0 && b.height > 0)
        .map((b) => ({ left: b.left - r.left, top: b.top - r.top, right: b.right - r.left, bottom: b.bottom - r.top }));
      // A finger in the right half is most likely a right thumb, its hand below and to the right.
      away = f.x - r.left > r.width / 2 ? -1 : 1;
      pad = padSize(thumb.thresholds);
      gauge.size(pad, thumb.thresholds);
      padX = f.x - r.left;
      zone.classList.add('is-active');
    }
    fingerX = f.x - zoneBox.left;
    fingerY = f.y - zoneBox.top;
    padX = trail(padX, fingerX, pad.steer);
    padY = fingerY - thumb.offset;
    show(thumb.state);
    schedule();
  }

  // Fingers through touch events, as the slide steering does (input.ts): iOS holds a touch's
  // first pointer moves back until it passes its gesture slop, which would swallow small moves.
  zone.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      pxPerMm = TOUCH_PX_PER_MM;
      for (const t of e.changedTouches) thumb.down(`t${t.identifier}`, t.clientX, t.clientY);
      render();
    },
    { passive: false },
  );
  zone.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) thumb.move(`t${t.identifier}`, t.clientX, t.clientY);
      render();
    },
    { passive: false },
  );
  const touchEnd = (e: TouchEvent) => {
    for (const t of e.changedTouches) thumb.up(`t${t.identifier}`);
    render();
  };
  zone.addEventListener('touchend', touchEnd);
  zone.addEventListener('touchcancel', touchEnd);

  // Mouse and pen (desktop testing); touch pointers are handled above.
  zone.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    pxPerMm = DESK_PX_PER_MM;
    thumb.down(`p${e.pointerId}`, e.clientX, e.clientY);
    zone.setPointerCapture(e.pointerId);
    render();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    thumb.move(`p${e.pointerId}`, e.clientX, e.clientY);
    render();
  });
  const pointerEnd = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    thumb.up(`p${e.pointerId}`);
    render();
  };
  zone.addEventListener('pointerup', pointerEnd);
  zone.addEventListener('pointercancel', pointerEnd);
  zone.addEventListener('lostpointercapture', pointerEnd);

  return {
    el: zone,
    state: () => thumb.state,
    takeSteerPx: () => thumb.takeSteerPx(),
    showTankEmpty(empty) {
      if (gauge.showTankEmpty(empty) && thumb.driver) schedule();
    },
    release(): void {
      thumb.release();
      render();
    },
  };
}

/** The whole pad about its centre, in the zone's px. */
function box(x: number, y: number, p: PadSize): Box {
  return { left: x - p.halfW, top: y - p.halfH, right: x + p.halfW, bottom: y + p.halfH };
}
function relative(b: Box, x: number, y: number): Box {
  return { left: b.left - x, top: b.top - y, right: b.right - x, bottom: b.bottom - y };
}
