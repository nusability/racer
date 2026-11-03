// The one-thumb control on screen: one finger anywhere steers and throttles (oneThumb.ts). The
// pause and time-trial restart buttons stand above this layer, so a touch there is theirs. The
// throttle gauge (throttleGauge.ts) travels beside the finger, on the side its thumb is not.
import { createThrottleGauge } from './throttleGauge.ts';
import { ONE_THUMB_SWIPE_MM, OneThumb } from './oneThumb.ts';
import { DESK_PX_PER_MM, TOUCH_PX_PER_MM, swipeThresholds, type ThrottleState } from './throttleSwipe.ts';
import { h } from './kit.ts';

/**
 * The gauge's centre stands this far beside the finger, as the throttle pad's does: a thumb
 * covers the glass below it and toward its own hand, so 48 px off to the far side stays in view.
 */
const GAUGE_SIDE_PX = 48;
/**
 * Half the gauge's width with its labels: the lit BOOST label (16 px, 0.12em tracking) is about
 * 60 px wide, far wider than the 12 px bar.
 */
const GAUGE_HALF_SPAN_PX = 30;
/** The labels stand above and below the bar: 6 px gap plus a 16 px line. */
const GAUGE_LABEL_PX = 22;
/** Room kept between the gauge and the minimap, so the two never read as one. */
const MINIMAP_CLEARANCE_PX = 8;

export interface OneThumbControl {
  el: HTMLElement;
  state(): ThrottleState;
  /** Sideways CSS px steered since the last call. */
  takeSteerPx(): number;
  showTankEmpty(empty: boolean): void;
  release(): void;
}

/** `minimap` finds the minimap's box (or null with none on screen), read at each touch-down. */
export function createOneThumbControl(minimap: () => DOMRect | null): OneThumbControl {
  const zone = h('div', 'ot-zone');
  zone.id = 'race_onethumb_zone';
  zone.setAttribute('role', 'application');
  zone.setAttribute('aria-label', 'One-thumb controls: slide sideways to steer, up to boost, down to air-brake, centre or lift to drive');
  const g = createThrottleGauge();
  g.el.classList.add('tp-gauge--follow');
  zone.append(g.el);

  /** Touches and pointers report in different densities; the latest touch-down picks which. */
  let pxPerMm = TOUCH_PX_PER_MM;
  const thumb = new OneThumb(() => swipeThresholds(ONE_THUMB_SWIPE_MM, pxPerMm, window.innerHeight));

  // Cached per new driving finger, so moves never read layout.
  let drivenBy: string | null = null;
  let zoneBox = new DOMRect();
  let mapBox: DOMRect | null = null;
  /** -1: the gauge stands left of the finger, 1: right. */
  let side = -1;

  function placeGauge(x: number, y: number): void {
    const reach = thumb.thresholds.reach;
    let cx = x + side * GAUGE_SIDE_PX;
    if (cx - GAUGE_HALF_SPAN_PX < 0 || cx + GAUGE_HALF_SPAN_PX > zoneBox.width) cx = x - side * GAUGE_SIDE_PX;
    const cy = y - thumb.offset;
    if (mapBox) {
      const overlapsY = cy + reach + GAUGE_LABEL_PX > mapBox.top - MINIMAP_CLEARANCE_PX && cy - reach - GAUGE_LABEL_PX < mapBox.bottom + MINIMAP_CLEARANCE_PX;
      // The minimap stands at the right edge, so the way clear of it is to its left.
      if (overlapsY && cx + GAUGE_HALF_SPAN_PX > mapBox.left - MINIMAP_CLEARANCE_PX) cx = mapBox.left - MINIMAP_CLEARANCE_PX - GAUGE_HALF_SPAN_PX;
    }
    g.el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
  }

  function render(): void {
    const f = thumb.driver;
    if (!f) {
      drivenBy = null;
      zone.classList.remove('is-active');
      g.placeThumb(0);
      g.show('drive');
      return;
    }
    if (f.id !== drivenBy) {
      drivenBy = f.id;
      const r = zone.getBoundingClientRect();
      zoneBox = r;
      const m = minimap();
      mapBox = m && m.width > 0 ? new DOMRect(m.left - r.left, m.top - r.top, m.width, m.height) : null;
      // A finger in the right half is most likely a right thumb, its hand below and to the right.
      side = f.x - r.left > r.width / 2 ? -1 : 1;
      g.size(thumb.thresholds);
      zone.classList.add('is-active');
    }
    placeGauge(f.x - zoneBox.left, f.y - zoneBox.top);
    g.placeThumb(thumb.offset);
    if (g.show(thumb.state)) zone.setAttribute('aria-valuetext', thumb.state);
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
    showTankEmpty: g.showTankEmpty,
    release(): void {
      thumb.release();
      render();
    },
  };
}
