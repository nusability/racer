// Title: one tap anywhere starts the game and unlocks audio (browsers need a gesture).
import { h } from '../kit.ts';
import type { AppCtx, Screen } from './context.ts';

/** Holding the title logo this long opens the hidden debug menu. */
const DEBUG_LONG_PRESS_MS = 1500;

export function logo(): HTMLElement {
  return h('div', 'logo', h('span', 'logo__top', 'MIRAGE'), h('span', 'logo__bottom', 'RACER'));
}

export function titleScreen(ctx: AppCtx): Screen {
  const start = h('button', 'title__tap');
  start.type = 'button';
  start.id = 'title_start_button';
  start.setAttribute('aria-label', 'Tap to start');
  const mark = logo();
  start.append(mark, h('span', 'title__prompt', 'TAP TO START'));
  // Hidden debug menu: hold the logo. The long press swallows the click that follows it.
  let pressTimer = 0;
  let longPressed = false;
  mark.addEventListener('pointerdown', () => {
    longPressed = false;
    pressTimer = window.setTimeout(() => {
      longPressed = true;
      ctx.audio.unlock();
      ctx.go({ screen: 'debug' });
    }, DEBUG_LONG_PRESS_MS);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) mark.addEventListener(ev, () => window.clearTimeout(pressTimer));
  mark.addEventListener('contextmenu', (e) => e.preventDefault());
  start.addEventListener('click', () => {
    if (longPressed) return;
    ctx.audio.unlock();
    ctx.go({ screen: 'menu' });
  });
  return { el: h('div', 'screen screen--title', start), backdrop: 'sunset' };
}
