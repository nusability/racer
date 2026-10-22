// Title: one tap anywhere starts the game and unlocks audio (browsers need a gesture).
import { h } from '../kit.ts';
import type { AppCtx, Screen } from './context.ts';

export function logo(): HTMLElement {
  return h('div', 'logo', h('span', 'logo__top', 'MIRAGE'), h('span', 'logo__bottom', 'RACER'));
}

export function titleScreen(ctx: AppCtx): Screen {
  const start = h('button', 'title__tap');
  start.type = 'button';
  start.id = 'title_start_button';
  start.setAttribute('aria-label', 'Tap to start');
  start.append(logo(), h('span', 'title__prompt', 'TAP TO START'));
  start.addEventListener('click', () => {
    ctx.audio.unlock();
    ctx.go({ screen: 'menu' });
  });
  return { el: h('div', 'screen screen--title', start), backdrop: 'sunset' };
}
