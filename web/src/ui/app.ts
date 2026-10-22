// The menu shell: owns its own layer inside the given root, routes between screens, and hands
// races to the runtime. The WebGL canvas behind it belongs to main.ts.
import './styles.css';
import type { GameAudio } from '../audio/audio.ts';
import { Career } from '../game/career.ts';
import type { RaceLauncher, RaceRequest, ShowroomApi } from '../game/types.ts';
import { h } from './kit.ts';
import { championshipScreen, cupScreen } from './screens/championship.ts';
import type { AppCtx, Nav, Screen } from './screens/context.ts';
import { garageScreen } from './screens/garage.ts';
import { mainMenuScreen } from './screens/mainMenu.ts';
import { quickRaceScreen } from './screens/quickRace.ts';
import { resultsScreen } from './screens/results.ts';
import { settingsScreen } from './screens/settings.ts';
import { titleScreen } from './screens/title.ts';

export interface AppDeps {
  root: HTMLElement;
  launchRace: RaceLauncher;
  showroom: ShowroomApi;
  audio: GameAudio;
}

function build(ctx: AppCtx, nav: Nav): Screen {
  switch (nav.screen) {
    case 'title':
      return titleScreen(ctx);
    case 'menu':
      return mainMenuScreen(ctx);
    case 'championship':
      return championshipScreen(ctx);
    case 'cup':
      return cupScreen(ctx, nav.cupId);
    case 'quick':
      return quickRaceScreen(ctx, nav.trackId, nav.laps);
    case 'garage':
      return garageScreen(ctx, nav.racerId);
    case 'settings':
      return settingsScreen(ctx);
    case 'results':
      return resultsScreen(ctx, nav.report);
  }
}

export function startApp(deps: AppDeps): void {
  const career = new Career(window.localStorage);
  deps.audio.setEnabled(career.save.settings.sound);

  const shell = h('div', 'app');
  deps.root.append(shell);
  let current: Screen | null = null;
  let racing = false;

  // One delegated listener gives every button the same click, instead of each screen wiring it.
  shell.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target.closest('button') : null;
    if (target && !target.disabled) deps.audio.oneShot('click');
  });

  function clear(): void {
    current?.dispose?.();
    current = null;
    shell.replaceChildren();
  }

  function go(nav: Nav): void {
    clear();
    current = build(ctx, nav);
    shell.dataset.backdrop = current.backdrop;
    shell.append(current.el);
  }

  function race(req: RaceRequest, back: Nav): void {
    if (racing) return;
    racing = true;
    clear();
    shell.hidden = true;
    deps.launchRace(req, (outcome) => {
      racing = false;
      shell.hidden = false;
      if (outcome === null) go(back);
      else go({ screen: 'results', report: career.applyOutcome(outcome) });
    });
  }

  const ctx: AppCtx = { career, audio: deps.audio, showroom: deps.showroom, go, race };
  go({ screen: 'title' });
}
