// Main menu: four big tiles. The selected racer is named so the player knows what they'll fly.
import { racerById } from '../../data/racers.ts';
import { button, creditsChip, h } from '../kit.ts';
import type { AppCtx, Screen } from './context.ts';
import { logo } from './title.ts';

export function mainMenuScreen(ctx: AppCtx): Screen {
  const save = ctx.career.save;
  const racer = racerById(save.selectedRacer);
  const tiles = h(
    'div',
    'menu__tiles',
    button({
      id: 'menu_championship_button',
      label: 'CHAMPIONSHIP',
      sub: save.cup ? 'Cup in progress' : save.champion ? 'Mirage Champion' : 'Three cups to glory',
      aria: 'Championship',
      variant: 'primary',
      big: true,
      onTap: () => ctx.go(save.cup ? { screen: 'cup', cupId: save.cup.cupId } : { screen: 'championship' }),
    }),
    button({
      id: 'menu_quick_button',
      label: 'QUICK RACE',
      sub: 'Any track, any laps',
      aria: 'Quick race',
      big: true,
      onTap: () => ctx.go({ screen: 'quick' }),
    }),
    button({
      id: 'menu_garage_button',
      label: 'GARAGE',
      sub: racer.name,
      aria: 'Garage',
      big: true,
      onTap: () => ctx.go({ screen: 'garage' }),
    }),
    button({
      id: 'menu_settings_button',
      label: 'SETTINGS',
      sub: 'Steering, sound',
      aria: 'Settings',
      big: true,
      onTap: () => ctx.go({ screen: 'settings' }),
    }),
  );
  const side = h(
    'div',
    'menu__side',
    logo(),
    save.champion ? h('div', 'badge badge--gold', '★ MIRAGE CHAMPION') : null,
    creditsChip(save.credits),
  );
  return { el: h('div', 'screen screen--menu', side, tiles), backdrop: 'sunset' };
}
