// Main menu: the three modes over the garage and settings. The selected racer is named so the player knows what they'll fly.
import { racerById } from '../../data/racers.ts';
import { WORLDS } from '../../data/worlds.ts';
import { button, creditsChip, h } from '../kit.ts';
import type { AppCtx, Screen } from './context.ts';
import { logo } from './title.ts';

export function mainMenuScreen(ctx: AppCtx): Screen {
  const save = ctx.career.save;
  const racer = racerById(save.selectedRacer);
  const crowns = WORLDS.filter((w) => ctx.career.isWorldChampion(w.id));
  const tiles = h(
    'div',
    'menu__tiles',
    button({
      id: 'menu_championship_button',
      label: 'CHAMPIONSHIP',
      sub: save.cup ? 'Cup in progress' : `${WORLDS.filter((w) => ctx.career.isWorldUnlocked(w.id)).length} of ${WORLDS.length} worlds open`,
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
      id: 'menu_trial_button',
      label: 'TIME TRIAL',
      sub: 'Alone against your ghost',
      aria: 'Time trial',
      big: true,
      onTap: () => ctx.go({ screen: 'trial' }),
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
    // One wrapping row, so five crowns don't stack into a column that pushes the tiles off a phone.
    ...(crowns.length > 0 ? [h('div', 'menu__crowns', ...crowns.map((w) => h('div', 'badge badge--gold', `👑 ${w.name.toUpperCase()} CHAMPION`)))] : []),
    creditsChip(save.credits),
  );
  return { el: h('div', 'screen screen--menu list-scroll', side, tiles), backdrop: 'sunset' };
}
