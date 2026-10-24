import { button, h } from '../../../ui/kit.ts';
import type { FlyStick } from './cameraRig.ts';

// Free-fly thumb controls: a virtual stick (forward/back, strafe) on the left, rise and sink
// buttons and a FAST toggle on the right. Held state is written straight into the rig's stick.

/** Stick travel from centre to full deflection, CSS px (the base is twice this across). */
const STICK_RADIUS = 56;

export function flyPad(stick: FlyStick): HTMLElement {
  const knob = h('div', 'vw-stick__knob');
  const base = h('div', 'vw-stick', knob);
  base.id = 'viewer_stick';
  base.setAttribute('role', 'application');
  base.setAttribute('aria-label', 'Free fly stick: drag to move');
  let finger: number | null = null;
  let cx = 0;
  let cy = 0;
  const move = (x: number, y: number) => {
    let dx = x - cx;
    let dy = y - cy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    stick.strafe = dx / STICK_RADIUS;
    stick.forward = -dy / STICK_RADIUS;
  };
  const release = () => {
    finger = null;
    knob.style.transform = '';
    stick.strafe = 0;
    stick.forward = 0;
  };
  const start = (id: number, x: number, y: number) => {
    finger = id;
    const r = base.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    move(x, y);
  };
  base.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (finger === null) start(t.identifier, t.clientX, t.clientY);
    },
    { passive: false },
  );
  base.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === finger) move(t.clientX, t.clientY);
    },
    { passive: false },
  );
  const touchEnd = (e: TouchEvent) => {
    for (const t of e.changedTouches) if (t.identifier === finger) release();
  };
  base.addEventListener('touchend', touchEnd);
  base.addEventListener('touchcancel', touchEnd);
  base.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    base.setPointerCapture(e.pointerId);
    start(e.pointerId, e.clientX, e.clientY);
  });
  base.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' && e.pointerId === finger) move(e.clientX, e.clientY);
  });
  const pointerEnd = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' && e.pointerId === finger) release();
  };
  base.addEventListener('pointerup', pointerEnd);
  base.addEventListener('pointercancel', pointerEnd);

  const hold = (id: string, label: string, aria: string, dir: number) => {
    // Held, not tapped: the press and release handlers below drive it, so the tap does nothing.
    const b = button({ id, label, aria, variant: 'icon', onTap: () => {} });
    const on = (e: Event) => {
      e.preventDefault();
      stick.rise = dir;
    };
    const off = () => {
      if (stick.rise === dir) stick.rise = 0;
    };
    b.addEventListener('touchstart', on, { passive: false });
    b.addEventListener('touchend', off);
    b.addEventListener('touchcancel', off);
    b.addEventListener('pointerdown', (e) => e.pointerType !== 'touch' && on(e));
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    return b;
  };
  const fast = button({
    id: 'viewer_flyfast_button',
    label: 'FAST',
    aria: 'Free fly fast',
    variant: 'ghost',
    onTap: () => {
      stick.fast = !stick.fast;
      fast.classList.toggle('is-on', stick.fast);
    },
  });
  return h(
    'div',
    'vw-fly',
    base,
    h('div', 'vw-fly__right', hold('viewer_flyup_button', '▲', 'Rise', 1), fast, hold('viewer_flydown_button', '▼', 'Sink', -1)),
  );
}
