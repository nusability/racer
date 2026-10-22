// Player input: touch controls drawn over the race (boost, brake, steering by the chosen
// mode), DeviceOrientation tilt, and the keyboard for desktop testing. Everything registers on
// touch-down (pointerdown), and every pointer is tracked on its own so steer + boost work at once.
import './race.css';
import type { PlayerInput } from '../core/types.ts';
import type { InputSource, Settings } from '../game/types.ts';
import { h } from './kit.ts';

/** Drag distance (px) for full lock at sensitivity 1; higher sensitivity needs less. */
const DRAG_FULL_LOCK_PX = 70;
/** Seconds for digital steering (keys, buttons) to ramp from centre to full lock. */
const DIGITAL_STEER_RAMP_S = 0.12;
/** Tilt (degrees) for full lock at sensitivity 1. */
const TILT_FULL_LOCK_DEG = 25;
/** Tilt below this is treated as level, so a resting hand doesn't drift. */
const TILT_DEADZONE_DEG = 2;
/** Longest frame gap the ramp integrates, so a stall doesn't snap the steering. */
const MAX_RAMP_DT_S = 0.1;

const KEYS_LEFT = new Set(['ArrowLeft', 'KeyA']);
const KEYS_RIGHT = new Set(['ArrowRight', 'KeyD']);
const KEYS_BOOST = new Set(['Space', 'KeyW', 'ArrowUp']);
const KEYS_BRAKE = new Set(['KeyS', 'ArrowDown', 'ShiftLeft', 'ShiftRight']);

type DOEWithPermission = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

/** Must be called from a user gesture: iOS only grants motion access inside one. */
export async function requestTiltPermission(): Promise<boolean> {
  if (!('DeviceOrientationEvent' in window)) return false;
  const doe = DeviceOrientationEvent as DOEWithPermission;
  if (typeof doe.requestPermission !== 'function') return true;
  try {
    return (await doe.requestPermission()) === 'granted';
  } catch (err) {
    console.error('[input] Motion permission request failed', err);
    return false;
  }
}

function hasTouch(): boolean {
  return navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/** A held button that counts the pointers on it, so lifting one of two fingers keeps it held. */
function holdButton(id: string, cls: string, label: string, aria: string): { el: HTMLElement; held: () => boolean; release: () => void } {
  const el = h('div', `tc-btn ${cls}`, h('span', 'tc-btn__label', label));
  el.id = id;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', aria);
  const pointers = new Set<number>();
  const sync = () => el.classList.toggle('is-held', pointers.size > 0);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    pointers.add(e.pointerId);
    sync();
  });
  const up = (e: PointerEvent) => {
    if (pointers.delete(e.pointerId)) sync();
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  return {
    el,
    held: () => pointers.size > 0,
    release: () => {
      pointers.clear();
      sync();
    },
  };
}

export function createInput(root: HTMLElement, settings: Settings): InputSource {
  const layer = h('div', 'race-ui touch');
  layer.dataset.mode = settings.steering;
  if (!hasTouch()) layer.classList.add('no-touch');
  root.append(layer);

  const boost = holdButton('race_boost_button', 'tc-boost', 'BOOST', 'Boost');
  const brake = holdButton('race_brake_button', 'tc-brake', 'BRAKE', 'Air brake');
  const left = holdButton('race_left_button', 'tc-left', '◀', 'Steer left');
  const right = holdButton('race_right_button', 'tc-right', '▶', 'Steer right');

  // Drag steering: analog, relative to where the thumb landed.
  const zone = h('div', 'tc-zone');
  const ring = h('div', 'tc-ring');
  const knob = h('div', 'tc-knob');
  zone.append(ring, knob);
  let dragId: number | null = null;
  let dragX0 = 0;
  /** Thumb origin inside the zone, cached at touch-down so moves never read layout. */
  let ringX = 0;
  let ringY = 0;
  let dragSteer = 0;
  const fullLockPx = DRAG_FULL_LOCK_PX / settings.sensitivity;

  function placeThumb(): void {
    ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
    knob.style.transform = `translate3d(${ringX + dragSteer * fullLockPx}px, ${ringY}px, 0)`;
  }
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (dragId !== null) return;
    zone.setPointerCapture(e.pointerId);
    dragId = e.pointerId;
    dragX0 = e.clientX;
    dragSteer = 0;
    const r = zone.getBoundingClientRect();
    ringX = e.clientX - r.left;
    ringY = e.clientY - r.top;
    placeThumb();
    zone.classList.add('is-active');
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragId) return;
    dragSteer = clamp1((e.clientX - dragX0) / fullLockPx);
    placeThumb();
  });
  const endDrag = (e: PointerEvent) => {
    if (e.pointerId !== dragId) return;
    releaseDrag();
  };
  function releaseDrag(): void {
    dragId = null;
    dragSteer = 0;
    zone.classList.remove('is-active');
  }
  zone.addEventListener('pointerup', endDrag);
  zone.addEventListener('pointercancel', endDrag);
  zone.addEventListener('lostpointercapture', endDrag);

  if (settings.steering === 'drag') layer.append(zone);
  if (settings.steering === 'buttons') layer.append(h('div', 'tc-steer', left.el, right.el));
  layer.append(h('div', 'tc-pedals', brake.el, boost.el));

  // Tilt: landscape-aware so "turn the phone like a wheel" means the same in every grip.
  let tiltSteer = 0;
  const onOrientation = (e: DeviceOrientationEvent) => {
    const angle = screen.orientation?.angle ?? 0;
    const beta = e.beta ?? 0;
    const gamma = e.gamma ?? 0;
    const deg = angle === 90 ? beta : angle === 270 ? -beta : angle === 180 ? -gamma : gamma;
    const mag = Math.max(0, Math.abs(deg) - TILT_DEADZONE_DEG);
    tiltSteer = clamp1((Math.sign(deg) * mag * settings.sensitivity) / TILT_FULL_LOCK_DEG);
  };
  if (settings.steering === 'tilt') window.addEventListener('deviceorientation', onOrientation);

  // Keyboard.
  const keys = new Set<string>();
  const watched = (code: string) => KEYS_LEFT.has(code) || KEYS_RIGHT.has(code) || KEYS_BOOST.has(code) || KEYS_BRAKE.has(code);
  const onKeyDown = (e: KeyboardEvent) => {
    if (!watched(e.code)) return;
    e.preventDefault();
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const anyKey = (set: Set<string>) => {
    for (const k of keys) if (set.has(k)) return true;
    return false;
  };

  function releaseAll(): void {
    keys.clear();
    boost.release();
    brake.release();
    left.release();
    right.release();
    releaseDrag();
    tiltSteer = 0;
  }
  const onVisibility = () => {
    if (document.hidden) releaseAll();
  };
  // iOS fires touchstart before pointer events; blocking it stops scroll, zoom and the magnifier.
  const blockTouch = (e: TouchEvent) => e.preventDefault();
  const blockMenu = (e: Event) => e.preventDefault();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', onVisibility);
  layer.addEventListener('touchstart', blockTouch, { passive: false });
  layer.addEventListener('touchcancel', releaseAll);
  layer.addEventListener('contextmenu', blockMenu);

  let digital = 0;
  let lastRead = performance.now();

  return {
    read(): PlayerInput {
      const now = performance.now();
      const dt = Math.min(MAX_RAMP_DT_S, (now - lastRead) / 1000);
      lastRead = now;
      const target = (anyKey(KEYS_RIGHT) || right.held() ? 1 : 0) - (anyKey(KEYS_LEFT) || left.held() ? 1 : 0);
      const step = dt / DIGITAL_STEER_RAMP_S;
      digital = target > digital ? Math.min(target, digital + step) : Math.max(target, digital - step);
      const analog = settings.steering === 'drag' ? dragSteer : settings.steering === 'tilt' ? tiltSteer : 0;
      return {
        steer: clamp1(analog + digital),
        boost: boost.held() || anyKey(KEYS_BOOST),
        brake: brake.held() || anyKey(KEYS_BRAKE),
      };
    },
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      window.removeEventListener('deviceorientation', onOrientation);
      document.removeEventListener('visibilitychange', onVisibility);
      layer.remove();
    },
  };
}
